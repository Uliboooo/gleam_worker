import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  indentOnInput,
  bracketMatching,
  syntaxHighlighting,
  defaultHighlightStyle,
  HighlightStyle,
  indentUnit,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { tags } from "@lezer/highlight";
import { gleam } from "./gleam-language.ts";
import type { GleamDiagnostic } from "../lib/rewrite.ts";

const darkHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#ffaff3" },
  { tag: tags.string, color: "#c8ffa7" },
  { tag: tags.number, color: "#fdffab" },
  { tag: tags.comment, color: "#848484", fontStyle: "italic" },
  { tag: tags.typeName, color: "#9ce7ff" },
  { tag: tags.operator, color: "#ffd596" },
  { tag: tags.function(tags.variableName), color: "#ffddfa" },
  { tag: tags.special(tags.variableName), color: "#848484" },
]);

const darkTheme = EditorView.theme(
  {
    "&": { backgroundColor: "#2f2f2f", color: "#fefefc" },
    ".cm-gutters": { backgroundColor: "#292929", color: "#848484", border: "none" },
    ".cm-activeLine": { backgroundColor: "#ffffff0d" },
    ".cm-activeLineGutter": { backgroundColor: "#ffffff0d" },
    ".cm-cursor": { borderLeftColor: "#ffaff3" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground":
      { backgroundColor: "#d900b855" },
  },
  { dark: true },
);

const themeCompartment = new Compartment();
const fontTheme = (size: number) =>
  EditorView.theme({ "&": { fontSize: `${size}px` } });
const fontCompartment = new Compartment();

export interface Editor {
  view: EditorView;
  getCode(): string;
  setCode(code: string): void;
  insertSnippet(text: string, cursorOffset?: number): void;
  setDark(dark: boolean): void;
  setFontSize(size: number): void;
  setGleamDiagnostics(diagnostics: GleamDiagnostic[]): void;
  jumpToLine(line: number, column?: number): void;
}

export function createEditor(
  parent: HTMLElement,
  initialCode: string,
  options: { fontSize: number; dark: boolean; onChange: (code: string) => void; onFocusChange: (focused: boolean) => void },
): Editor {
  const state = EditorState.create({
    doc: initialCode,
    extensions: [
      lineNumbers(),
      history(),
      drawSelection(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      indentOnInput(),
      indentUnit.of("  "),
      bracketMatching(),
      closeBrackets(),
      gleam,
      themeCompartment.of(options.dark ? [darkTheme, syntaxHighlighting(darkHighlight)] : syntaxHighlighting(defaultHighlightStyle)),
      fontCompartment.of(fontTheme(options.fontSize)),
      keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
      EditorView.lineWrapping,
      EditorView.updateListener.of((update) => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
        if (update.focusChanged) options.onFocusChange(update.view.hasFocus);
      }),
    ],
  });

  const view = new EditorView({ state, parent });

  return {
    view,
    getCode: () => view.state.doc.toString(),
    setCode(code) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    },
    insertSnippet(text, cursorOffset) {
      const { from, to } = view.state.selection.main;
      const cursor = from + (cursorOffset ?? text.length);
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: cursor },
        scrollIntoView: true,
      });
      view.focus();
    },
    setDark(dark) {
      view.dispatch({
        effects: themeCompartment.reconfigure(
          dark ? [darkTheme, syntaxHighlighting(darkHighlight)] : syntaxHighlighting(defaultHighlightStyle),
        ),
      });
    },
    setFontSize(size) {
      view.dispatch({ effects: fontCompartment.reconfigure(fontTheme(size)) });
    },
    setGleamDiagnostics(diagnostics) {
      const doc = view.state.doc;
      const mapped: Diagnostic[] = diagnostics
        .filter((d) => d.line !== undefined && d.line >= 1 && d.line <= doc.lines)
        .map((d) => {
          const line = doc.line(d.line!);
          const from = Math.min(line.from + Math.max((d.column ?? 1) - 1, 0), line.to);
          return {
            from,
            to: line.to,
            severity: d.severity,
            message: firstSentence(d.message),
          };
        });
      view.dispatch(setDiagnostics(view.state, mapped));
    },
    jumpToLine(line, column = 1) {
      const doc = view.state.doc;
      if (line < 1 || line > doc.lines) return;
      const info = doc.line(line);
      const pos = Math.min(info.from + column - 1, info.to);
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    },
  };
}

function firstSentence(diagnostic: string): string {
  return diagnostic.split("\n", 1)[0].replace(/^(error|warning):\s*/, "");
}
