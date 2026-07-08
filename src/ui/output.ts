import type { GleamDiagnostic } from "../lib/rewrite.ts";

export type TabName = "result" | "errors" | "js";

export interface OutputPanel {
  showTab(tab: TabName): void;
  clearResult(): void;
  appendLine(text: string, kind?: "stdout" | "stderr"): void;
  setResultPlaceholder(text: string): void;
  setDiagnostics(diagnostics: GleamDiagnostic[]): void;
  setGeneratedJs(js: string | null): void;
}

export function createOutputPanel(onJumpToLine: (line: number, column?: number) => void): OutputPanel {
  const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".output-tab"));
  const panels = Array.from(document.querySelectorAll<HTMLElement>(".output-body"));
  const result = document.getElementById("tab-result")!;
  const errors = document.getElementById("tab-errors")!;
  const jsPanel = document.getElementById("tab-js")!;
  const badge = document.getElementById("error-badge")!;

  function showTab(tab: TabName): void {
    for (const button of tabs) {
      const active = button.dataset.tab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    }
    for (const panel of panels) panel.hidden = panel.dataset.tab !== tab;
  }

  for (const button of tabs) {
    button.addEventListener("click", () => showTab(button.dataset.tab as TabName));
  }

  return {
    showTab,
    clearResult() {
      result.textContent = "";
    },
    setResultPlaceholder(text) {
      result.replaceChildren(placeholder(text));
    },
    appendLine(text, kind = "stdout") {
      result.querySelector(".output-placeholder")?.remove();
      const line = document.createElement("div");
      if (kind === "stderr") line.className = "output-line-error";
      line.textContent = text;
      result.append(line);
      result.scrollTop = result.scrollHeight;
    },
    setDiagnostics(diagnostics) {
      errors.textContent = "";
      const errorCount = diagnostics.filter((d) => d.severity === "error").length;
      badge.hidden = errorCount === 0;
      badge.textContent = String(errorCount);

      if (diagnostics.length === 0) {
        errors.append(placeholder("エラーはありません ✓"));
        return;
      }
      for (const diagnostic of diagnostics) {
        const block = document.createElement("div");
        block.className = `diagnostic diagnostic-${diagnostic.severity}`;
        block.textContent = diagnostic.message;
        if (diagnostic.line !== undefined) {
          const link = document.createElement("button");
          link.className = "diagnostic-loc";
          link.textContent = `→ ${diagnostic.line} 行目へ`;
          const { line, column } = diagnostic;
          link.addEventListener("click", () => onJumpToLine(line!, column));
          block.append("\n", link);
        }
        errors.append(block);
      }
    },
    setGeneratedJs(js) {
      jsPanel.replaceChildren(js === null ? placeholder("コンパイル成功後に生成された JavaScript が表示されます") : document.createTextNode(js));
    },
  };
}

function placeholder(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "output-placeholder";
  el.textContent = text;
  return el;
}
