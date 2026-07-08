/**
 * Pure helpers for turning compiler output into something the browser can use.
 * No DOM access so these can be unit-tested in Node.
 */

/**
 * The compiled entry module conceptually lives at `<precompiledBase>/main.mjs`
 * and imports its dependencies with relative paths ("./gleam.mjs",
 * "./gleam/io.mjs", ...). Blob URLs are not hierarchical, so before the code
 * is loaded from a Blob inside the worker every relative import must be
 * rewritten to an absolute URL under the precompiled-stdlib directory.
 */
export function rewriteImports(js: string, precompiledBase: string): string {
  const base = precompiledBase.endsWith("/") ? precompiledBase : precompiledBase + "/";
  return js.replace(
    /(\bfrom\s*|\bimport\s*\(\s*|^\s*import\s*)(["'])(\.\.?\/[^"']+)\2/gm,
    (_match, prefix: string, quote: string, path: string) => {
      const resolved = resolveRelative(path, base);
      return `${prefix}${quote}${resolved}${quote}`;
    },
  );
}

function resolveRelative(path: string, base: string): string {
  const segments: string[] = [];
  for (const part of path.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return base + segments.join("/");
}

export interface GleamDiagnostic {
  severity: "error" | "warning";
  message: string;
  /** 1-based line in the user's module, when the diagnostic points at it. */
  line?: number;
  column?: number;
}

/**
 * Splits the text returned by `compile_package` into individual diagnostics
 * and extracts `main.gleam:line:column` locations for editor integration.
 */
export function parseDiagnostics(
  text: string,
  severity: "error" | "warning",
  userModule = "main",
): GleamDiagnostic[] {
  const blocks = text
    .split(/\n(?=(?:error|warning):)/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
  const source = blocks.length > 0 ? blocks : [text.trim()];

  return source.map((block) => {
    const location = new RegExp(`${userModule}\\.gleam:(\\d+):(\\d+)`).exec(block);
    const detected = block.startsWith("warning:") ? "warning" : block.startsWith("error:") ? "error" : severity;
    return {
      severity: detected,
      message: block,
      line: location ? Number(location[1]) : undefined,
      column: location ? Number(location[2]) : undefined,
    };
  });
}

/** Byte length of a string as UTF-8, used for the share-URL size warning. */
export function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length;
}
