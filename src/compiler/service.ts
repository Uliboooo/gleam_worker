import { parseDiagnostics, rewriteImports, type GleamDiagnostic } from "../lib/rewrite.ts";

/**
 * Wrapper around the official Gleam compiler compiled to WASM
 * (wasm-bindgen bindings from gleam-lang/gleam's compiler-wasm crate).
 *
 * The artifacts are not committed to the repository; `npm run fetch-compiler`
 * downloads them into public/wasm, public/stdlib and public/precompiled.
 */

interface GleamWasm {
  default: (input?: unknown) => Promise<unknown>;
  initialise_panic_hook: (debug?: boolean) => void;
  write_module: (projectId: number, name: string, code: string) => void;
  compile_package: (projectId: number, target: string) => void;
  read_compiled_javascript: (projectId: number, name: string) => string | undefined;
  reset_warnings: (projectId: number) => void;
  pop_warning: (projectId: number) => string | undefined;
}

export type CompileResult =
  | { ok: true; js: string; rawJs: string; warnings: GleamDiagnostic[] }
  | { ok: false; errors: GleamDiagnostic[]; warnings: GleamDiagnostic[] };

export class CompilerMissingError extends Error {
  constructor() {
    super(
      "コンパイラ (WASM) が見つかりません。開発者向け: `npm run fetch-compiler` を実行して " +
        "public/wasm・public/stdlib・public/precompiled を生成してください。",
    );
  }
}

const PROJECT_ID = 0;
const USER_MODULE = "main";
const PRECOMPILED_BASE = "/precompiled/";

export class CompilerService {
  private wasm: GleamWasm | null = null;
  private initPromise: Promise<void> | null = null;

  /** Lazily loads the WASM compiler and writes the stdlib sources into its filesystem. */
  init(): Promise<void> {
    this.initPromise ??= this.doInit();
    return this.initPromise;
  }

  get ready(): boolean {
    return this.wasm !== null;
  }

  private async doInit(): Promise<void> {
    const [jsHead, sourcesResponse] = await Promise.all([
      fetch("/wasm/gleam_wasm.js", { method: "HEAD" }),
      fetch("/stdlib/sources.json"),
    ]);
    // SPA hosting serves index.html for missing files, so check types, not just status.
    const jsType = jsHead.headers.get("content-type") ?? "";
    const jsonType = sourcesResponse.headers.get("content-type") ?? "";
    if (!jsHead.ok || !sourcesResponse.ok || !jsType.includes("javascript") || !jsonType.includes("json")) {
      throw new CompilerMissingError();
    }

    const wasmUrl = "/wasm/gleam_wasm.js";
    const wasm: GleamWasm = await import(/* @vite-ignore */ wasmUrl);
    await wasm.default("/wasm/gleam_wasm_bg.wasm");
    wasm.initialise_panic_hook(false);

    const sources: Record<string, string> = await sourcesResponse.json();
    for (const [name, code] of Object.entries(sources)) {
      wasm.write_module(PROJECT_ID, name, code);
    }
    this.wasm = wasm;

    // Warm-up compile so the first user-triggered compile is fast.
    this.compile('pub fn main() { Nil }');
  }

  /**
   * Compiles the user's code as the `main` module of a package that also
   * contains the stdlib sources. Returns the generated JavaScript with its
   * imports rewritten to absolute URLs of the precompiled stdlib modules.
   */
  compile(code: string): CompileResult {
    const wasm = this.wasm;
    if (!wasm) throw new CompilerMissingError();

    wasm.write_module(PROJECT_ID, USER_MODULE, code);
    wasm.reset_warnings(PROJECT_ID);

    let error: string | null = null;
    try {
      wasm.compile_package(PROJECT_ID, "javascript");
    } catch (thrown) {
      error = typeof thrown === "string" ? thrown : String(thrown);
    }

    const warnings: GleamDiagnostic[] = [];
    for (let w = wasm.pop_warning(PROJECT_ID); w !== undefined; w = wasm.pop_warning(PROJECT_ID)) {
      warnings.push(...parseDiagnostics(w, "warning", USER_MODULE));
    }

    if (error !== null) {
      return { ok: false, errors: parseDiagnostics(error, "error", USER_MODULE), warnings };
    }

    const rawJs = wasm.read_compiled_javascript(PROJECT_ID, USER_MODULE);
    if (rawJs === undefined) {
      return {
        ok: false,
        errors: [{ severity: "error", message: "コンパイル結果を取得できませんでした" }],
        warnings,
      };
    }

    const js = rewriteImports(rawJs, location.origin + PRECOMPILED_BASE);
    return { ok: true, js, rawJs, warnings };
  }
}
