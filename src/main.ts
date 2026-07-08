import "./app.css";
import { createEditor } from "./editor/editor.ts";
import { CompilerService, CompilerMissingError, type CompileResult } from "./compiler/service.ts";
import { run, type RunHandle } from "./runner/runner.ts";
import { createOutputPanel } from "./ui/output.ts";
import { setupSplit } from "./ui/split.ts";
import { setupKeyboardToolbar } from "./ui/toolbar.ts";
import { openSheet, closeSheet, sheetTitle, sheetItem, sheetSegmentedRow } from "./ui/sheet.ts";
import { shareCode, codeFromHash } from "./share.ts";
import { samples, DEFAULT_CODE } from "./samples.ts";
import { loadCode, saveCode, loadSettings, saveSettings, debounce, type Settings } from "./storage.ts";
import { applyTheme, isDark, onThemeChange } from "./theme.ts";
import { setupPwa } from "./pwa.ts";
import type { GleamDiagnostic } from "./lib/rewrite.ts";

const AUTO_COMPILE_MS = 800;

async function start(): Promise<void> {
  const settings: Settings = loadSettings();
  applyTheme(settings.theme);

  const persistSettings = debounce(() => saveSettings(settings), 300);

  // ---- Output panel ----
  const output = createOutputPanel((line, column) => editor.jumpToLine(line, column));
  output.setResultPlaceholder("▶実行 を押すと結果がここに表示されます");
  output.setDiagnostics([]);
  output.setGeneratedJs(null);

  // ---- Editor ----
  const initialCode = (await codeFromHash()) ?? loadCode() ?? DEFAULT_CODE;
  const autoSave = debounce(saveCode, 500);
  const autoCompile = debounce(() => {
    if (compiler.ready) checkOnly();
  }, AUTO_COMPILE_MS);

  const editorPane = document.getElementById("editor-pane")!;
  const editor = createEditor(editorPane, initialCode, {
    fontSize: settings.fontSize,
    dark: isDark(),
    vim: settings.vim,
    getModuleSymbols: () => compiler.getModuleSymbols(),
    onChange(code) {
      autoSave(code);
      autoCompile();
    },
    onFocusChange(focused) {
      toolbar.setVisible(focused);
    },
  });
  onThemeChange((dark) => editor.setDark(dark));

  // ---- Keyboard toolbar ----
  const toolbar = setupKeyboardToolbar({
    insertSnippet: (text, cursor) => editor.insertSnippet(text, cursor),
    moveCursor(delta) {
      const head = editor.view.state.selection.main.head;
      const pos = Math.max(0, Math.min(editor.view.state.doc.length, head + delta));
      editor.view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      editor.view.focus();
    },
    focusEditor: () => editor.view.focus(),
  });

  // ---- Split panes ----
  setupSplit({
    getRatio: (landscape) => (landscape ? settings.splitLandscape : settings.splitPortrait),
    setRatio(landscape, ratio) {
      if (landscape) settings.splitLandscape = ratio;
      else settings.splitPortrait = ratio;
      persistSettings();
    },
  });

  // ---- Compiler ----
  const compiler = new CompilerService();
  const runButton = document.getElementById("run-button") as HTMLButtonElement;
  const runLabel = document.getElementById("run-label")!;

  let compilerFailed = false;

  const compilerReady = compiler
    .init()
    .then(() => {
      runButton.disabled = false;
      runLabel.textContent = "実行";
      checkOnly();
    })
    .catch((error: unknown) => {
      compilerFailed = true;
      runLabel.textContent = "実行不可";
      const message =
        error instanceof CompilerMissingError
          ? error.message
          : `コンパイラの読み込みに失敗しました: ${String(error)}`;
      output.setDiagnostics([{ severity: "error", message }]);
      output.showTab("errors");
    });

  function applyDiagnostics(result: CompileResult): GleamDiagnostic[] {
    const diagnostics = result.ok ? result.warnings : [...result.errors, ...result.warnings];
    editor.setGleamDiagnostics(diagnostics);
    output.setDiagnostics(diagnostics);
    output.setGeneratedJs(result.ok ? result.rawJs : null);
    return diagnostics;
  }

  /** Auto-compile on idle: refresh diagnostics without running. */
  function checkOnly(): void {
    try {
      applyDiagnostics(compiler.compile(editor.getCode()));
    } catch {
      // Compiler crashed (panic); leave previous diagnostics in place.
    }
  }

  // ---- Run ----
  let currentRun: RunHandle | null = null;

  async function runCode(): Promise<void> {
    runButton.disabled = true;
    runButton.classList.add("is-running");
    runLabel.textContent = "実行中…";
    currentRun?.cancel();

    try {
      await compilerReady;
      if (compilerFailed) {
        output.showTab("errors");
        return;
      }
      const result = compiler.compile(editor.getCode());
      applyDiagnostics(result);

      if (!result.ok) {
        output.showTab("errors");
        return;
      }

      output.clearResult();
      output.showTab("result");

      await new Promise<void>((resolve) => {
        currentRun = run(result.js, {
          onStdout: (text) => output.appendLine(text),
          onStderr: (text) => output.appendLine(text, "stderr"),
          onCrash(text) {
            output.appendLine(text, "stderr");
            output.setDiagnostics([{ severity: "error", message: text }]);
          },
          onFinish(outcome) {
            if (outcome === "done") output.appendLine("— 完了 —");
            resolve();
          },
        });
      });
    } catch {
      output.showTab("errors");
    } finally {
      currentRun = null;
      runButton.classList.remove("is-running");
      runButton.disabled = compilerFailed;
      runLabel.textContent = compilerFailed ? "実行不可" : compiler.ready ? "実行" : "読み込み中…";
    }
  }

  runButton.addEventListener("click", () => void runCode());

  // ---- Share ----
  document.getElementById("share-button")!.addEventListener("click", () => {
    void shareCode(editor.getCode());
  });

  // ---- Samples ----
  document.getElementById("samples-button")!.addEventListener("click", () => {
    openSheet((root, close) => {
      root.append(sheetTitle("サンプルコード"));
      for (const sample of samples) {
        root.append(
          sheetItem(sample.title, sample.description, () => {
            editor.setCode(sample.code);
            saveCode(sample.code);
            close();
          }),
        );
      }
    });
  });

  // ---- Menu (theme / font size / about) ----
  document.getElementById("menu-button")!.addEventListener("click", () => {
    openSheet((root) => {
      root.append(sheetTitle("設定"));
      root.append(
        sheetSegmentedRow(
          "テーマ",
          [
            { value: "system", label: "自動" },
            { value: "light", label: "ライト" },
            { value: "dark", label: "ダーク" },
          ],
          settings.theme,
          (theme) => {
            settings.theme = theme;
            applyTheme(theme);
            persistSettings();
          },
        ),
      );

      const sizeRow = sheetSegmentedRow(
        `フォントサイズ (${settings.fontSize}px)`,
        [
          { value: "smaller", label: "A−" },
          { value: "larger", label: "A+" },
        ],
        "" as never,
        (dir) => {
          settings.fontSize = Math.min(24, Math.max(10, settings.fontSize + (dir === "larger" ? 1 : -1)));
          editor.setFontSize(settings.fontSize);
          sizeRow.querySelector(".sheet-row-label")!.textContent = `フォントサイズ (${settings.fontSize}px)`;
          persistSettings();
        },
      );
      root.append(sizeRow);

      root.append(
        sheetSegmentedRow(
          "Vim キーバインド",
          [
            { value: "off", label: "オフ" },
            { value: "on", label: "オン" },
          ],
          settings.vim ? "on" : "off",
          (value) => {
            settings.vim = value === "on";
            editor.setVim(settings.vim);
            persistSettings();
          },
        ),
      );

      const about = document.createElement("div");
      about.className = "sheet-title";
      about.textContent =
        "コンパイル・実行はすべて端末内 (WASM) で完結します。コードが外部サーバーへ送信されることはありません。";
      root.append(about);
    });
  });

  // Load a shared link opened while the app is already running.
  window.addEventListener("hashchange", async () => {
    const code = await codeFromHash();
    if (code !== null) {
      editor.setCode(code);
      closeSheet();
    }
  });

  setupPwa();
}

void start();
