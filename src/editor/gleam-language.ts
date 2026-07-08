import { StreamLanguage, type StringStream } from "@codemirror/language";

/**
 * Lightweight Gleam mode built on StreamLanguage. A full Lezer grammar is a
 * v2 candidate; this tokenizer covers highlighting, comments and strings well
 * enough for a playground.
 */

const keywords = new Set([
  "as", "assert", "auto", "case", "const", "delegate", "derive", "echo",
  "else", "fn", "if", "implement", "import", "let", "macro", "opaque",
  "panic", "pub", "test", "todo", "type", "use",
]);

interface State {
  inString: boolean;
}

function tokenize(stream: StringStream, state: State): string | null {
  if (state.inString) return string(stream, state);

  if (stream.match("//")) {
    stream.skipToEnd();
    return "comment";
  }

  if (stream.match('"')) {
    state.inString = true;
    return string(stream, state);
  }

  // Numbers: ints, floats, binary/octal/hex, underscores, scientific notation
  if (stream.match(/^0[bB][01_]+/) || stream.match(/^0[oO][0-7_]+/) || stream.match(/^0[xX][0-9a-fA-F_]+/)) {
    return "number";
  }
  if (stream.match(/^-?\d[\d_]*(\.[\d_]+)?(e-?\d+)?/)) {
    return "number";
  }

  // Operators
  if (stream.match(/^(\|>|<>|->|<-|\|\||&&|==|!=|<=\.?|>=\.?|<\.?|>\.?|\+\.?|-\.?|\*\.?|\/\.?|%|=|!|\.\.|\|)/)) {
    return "operator";
  }

  // Discard names: _foo
  if (stream.match(/^_[a-z0-9_]*/)) {
    return "variableName.special";
  }

  // Type and constructor names
  if (stream.match(/^[A-Z][A-Za-z0-9]*/)) {
    return "typeName";
  }

  // Identifiers / keywords, with lookahead for function calls
  const word = stream.match(/^[a-z][a-z0-9_]*/);
  if (word) {
    const text = Array.isArray(word) ? word[0] : stream.current();
    if (keywords.has(text)) return "keyword";
    if (stream.peek() === "(") return "function(variableName)";
    return "variableName";
  }

  stream.next();
  return null;
}

function string(stream: StringStream, state: State): string {
  while (!stream.eol()) {
    const ch = stream.next();
    if (ch === "\\") {
      stream.next();
    } else if (ch === '"') {
      state.inString = false;
      break;
    }
  }
  return "string";
}

export const gleam = StreamLanguage.define<State>({
  name: "gleam",
  startState: () => ({ inString: false }),
  token: tokenize,
  languageData: {
    commentTokens: { line: "//" },
    closeBrackets: { brackets: ["(", "[", "{", '"'] },
    indentOnInput: /^\s*[}\])]$/,
  },
});
