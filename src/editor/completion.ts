import {
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
  snippetCompletion,
} from "@codemirror/autocomplete";
import {
  parseImports,
  parseSymbols,
  completionType,
  type GleamSymbol,
} from "./symbols.ts";

const KEYWORDS = [
  "as", "assert", "case", "const", "echo", "fn", "if", "import", "let",
  "opaque", "panic", "pub", "todo", "type", "use",
];

const keywordCompletions: Completion[] = KEYWORDS.map((label) => ({
  label,
  type: "keyword",
  boost: -10,
}));

const snippetCompletions: Completion[] = [
  snippetCompletion("case ${subject} {\n  ${pattern} -> ${}\n}", {
    label: "case",
    type: "keyword",
    detail: "case 式",
  }),
  snippetCompletion("fn ${name}(${}) {\n  ${}\n}", {
    label: "fn",
    type: "keyword",
    detail: "関数定義",
  }),
  snippetCompletion("pub fn ${name}(${}) {\n  ${}\n}", {
    label: "pubfn",
    type: "keyword",
    detail: "公開関数定義",
  }),
  snippetCompletion("use ${value} <- ${callback}", {
    label: "use",
    type: "keyword",
    detail: "use 式",
  }),
  snippetCompletion("let ${name} = ${}", {
    label: "let",
    type: "keyword",
    detail: "束縛",
  }),
  snippetCompletion("let assert ${pattern} = ${}", {
    label: "letassert",
    type: "keyword",
    detail: "let assert",
  }),
  snippetCompletion("import gleam/${module}", {
    label: "import",
    type: "keyword",
    detail: "モジュール取り込み",
  }),
  snippetCompletion("io.println(${})", {
    label: "println",
    type: "function",
    detail: "io.println",
  }),
];

function symbolToCompletion(symbol: GleamSymbol): Completion {
  return {
    label: symbol.name,
    type: completionType(symbol.kind),
    detail: symbol.detail,
  };
}

/**
 * Completion source combining, in order of relevance:
 *  - stdlib member completions after `module.` (from the fetched stdlib sources)
 *  - symbols declared in the current buffer
 *  - imported module aliases and unqualified names
 *  - keywords and snippet templates
 *
 * This is heuristic ("LSP-like"), not a real language server: the in-browser
 * compiler exposes no completion API, so there is no type-directed filtering.
 */
export function gleamCompletionSource(
  getModuleSymbols: () => Map<string, GleamSymbol[]>,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const before = line.text.slice(0, context.pos - line.from);
    const doc = context.state.doc.toString();

    // --- Member access: `alias.method` -------------------------------------
    const member = /(?:^|[^\w.])([a-z_]\w*)\.([a-z_]\w*)?$/.exec(before);
    if (member) {
      const alias = member[1];
      const prefix = member[2] ?? "";
      const from = context.pos - prefix.length;
      const modules = getModuleSymbols();
      const options: Completion[] = [];
      for (const info of parseImports(doc)) {
        if (info.alias !== alias) continue;
        for (const symbol of modules.get(info.module) ?? []) {
          if (symbol.kind === "function" || symbol.kind === "constant") {
            options.push(symbolToCompletion(symbol));
          }
        }
      }
      if (options.length === 0) return null;
      return { from, options, validFor: /^\w*$/ };
    }

    // --- Global context ----------------------------------------------------
    const word = context.matchBefore(/[a-zA-Z_]\w*/);
    if (!word && !context.explicit) return null;
    const from = word ? word.from : context.pos;

    const options: Completion[] = [];

    // Symbols declared locally in this buffer.
    for (const symbol of parseSymbols(doc, true)) {
      options.push({ ...symbolToCompletion(symbol), boost: 2 });
    }

    // Imported aliases (as module references) and unqualified names.
    const moduleSymbols = getModuleSymbols();
    for (const info of parseImports(doc)) {
      options.push({ label: info.alias, type: "namespace", detail: info.module, boost: 1 });
      const available = moduleSymbols.get(info.module) ?? [];
      for (const name of info.unqualified) {
        const symbol = available.find((s) => s.name === name);
        options.push(symbol ? { ...symbolToCompletion(symbol), boost: 1 } : { label: name, type: "variable", boost: 1 });
      }
    }

    options.push(...snippetCompletions, ...keywordCompletions);
    return { from, options, validFor: /^\w*$/ };
  };
}
