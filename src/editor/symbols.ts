/**
 * Lightweight symbol extraction for editor autocompletion. There is no real
 * Gleam language server in the browser, so instead of full semantic analysis
 * we parse public declarations out of source text. The stdlib sources are
 * already fetched for the compiler, so the same parser gives accurate member
 * completions (e.g. the functions of `gleam/list`) for free.
 */

export type SymbolKind = "function" | "type" | "constructor" | "constant";

export interface GleamSymbol {
  name: string;
  kind: SymbolKind;
  /** A short signature shown as completion detail, e.g. `fn map(...) -> ...`. */
  detail: string;
}

const COMPLETION_TYPE: Record<SymbolKind, string> = {
  function: "function",
  type: "type",
  constructor: "class",
  constant: "constant",
};

export function completionType(kind: SymbolKind): string {
  return COMPLETION_TYPE[kind];
}

/** Collapses whitespace/newlines in a captured signature to a single line. */
function tidy(signature: string): string {
  return signature.replace(/\s+/g, " ").trim();
}

/**
 * Extracts public (and, when `includePrivate`, local) declarations from Gleam
 * source. Uses line/brace heuristics rather than a full parser — good enough
 * for completion hints.
 */
export function parseSymbols(source: string, includePrivate = false): GleamSymbol[] {
  const symbols: GleamSymbol[] = [];
  const seen = new Set<string>();
  const add = (symbol: GleamSymbol) => {
    const key = `${symbol.kind}:${symbol.name}`;
    if (seen.has(key)) return;
    seen.add(key);
    symbols.push(symbol);
  };

  const visibility = includePrivate ? "(?:pub\\s+)?" : "pub\\s+";

  // Functions: capture the signature up to the body's opening brace. Parameter
  // and return-type annotations never contain `{`, so the first `{` ends it.
  const fnRe = new RegExp(`\\b${visibility}fn\\s+([a-z_]\\w*)\\s*\\(`, "g");
  for (let match = fnRe.exec(source); match; match = fnRe.exec(source)) {
    const brace = source.indexOf("{", match.index);
    const end = brace === -1 ? source.indexOf("\n", match.index) : brace;
    const signature = tidy(source.slice(match.index, end === -1 ? undefined : end)).replace(/^pub\s+/, "");
    add({ name: match[1], kind: "function", detail: signature });
  }

  // Constants.
  const constRe = new RegExp(`\\b${visibility}const\\s+([a-z_]\\w*)`, "g");
  for (let match = constRe.exec(source); match; match = constRe.exec(source)) {
    add({ name: match[1], kind: "constant", detail: `const ${match[1]}` });
  }

  // Types and their constructors.
  const typeRe = new RegExp(`\\b${visibility}(?:opaque\\s+)?type\\s+([A-Z]\\w*)`, "g");
  for (let match = typeRe.exec(source); match; match = typeRe.exec(source)) {
    add({ name: match[1], kind: "type", detail: `type ${match[1]}` });
    // Constructors live in the `{ ... }` block following the type header.
    const open = source.indexOf("{", match.index);
    const nextType = source.slice(match.index + match[0].length).search(/\bpub |\bfn |\btype /);
    if (open !== -1 && (nextType === -1 || open < match.index + match[0].length + nextType)) {
      const close = source.indexOf("}", open);
      const body = source.slice(open + 1, close === -1 ? open + 400 : close);
      for (const line of body.split("\n")) {
        const ctor = /^\s*([A-Z]\w*)\s*(?:\(|$)/.exec(line);
        if (ctor) add({ name: ctor[1], kind: "constructor", detail: `${match[1]}.${ctor[1]}` });
      }
    }
  }

  return symbols;
}

/** Builds a module-name → symbols map from the stdlib sources map. */
export function parseModuleSymbols(sources: Record<string, string>): Map<string, GleamSymbol[]> {
  const map = new Map<string, GleamSymbol[]>();
  for (const [name, source] of Object.entries(sources)) {
    map.set(name, parseSymbols(source, false));
  }
  return map;
}

export interface ImportInfo {
  /** Module path, e.g. `gleam/list`. */
  module: string;
  /** Qualified access name, e.g. `list` (or the `as` alias). */
  alias: string;
  /** Names imported unqualified via `.{ ... }`. */
  unqualified: string[];
}

/** Parses `import` statements from the current buffer. */
export function parseImports(source: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const re = /^\s*import\s+([\w/]+)(?:\.\{([^}]*)\})?(?:\s+as\s+(\w+))?/gm;
  for (let match = re.exec(source); match; match = re.exec(source)) {
    const module = match[1];
    const unqualified = (match[2] ?? "")
      .split(",")
      .map((entry) => entry.trim().replace(/^type\s+/, "").split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    const alias = match[3] ?? module.split("/").pop()!;
    imports.push({ module, alias, unqualified });
  }
  return imports;
}
