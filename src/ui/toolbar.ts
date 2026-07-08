/**
 * Keyboard toolbar: shown above the software keyboard while the editor is
 * focused. Tap inserts the token; long-press (500 ms) inserts the expanded
 * snippet where one is defined.
 */

interface Key {
  label: string;
  insert: string;
  /** Caret position within `insert` after insertion (default: end). */
  cursor?: number;
  /** Long-press snippet. */
  snippet?: { insert: string; cursor?: number };
  action?: "indent" | "left" | "right";
}

const KEYS: Key[] = [
  { label: "|>", insert: "|> " },
  { label: "->", insert: "-> " },
  {
    label: "fn",
    insert: "fn",
    snippet: { insert: "fn name() {\n  todo\n}", cursor: 3 },
  },
  {
    label: "case",
    insert: "case ",
    snippet: { insert: "case value {\n  _ -> todo\n}", cursor: 5 },
  },
  { label: "{ }", insert: "{  }", cursor: 2, snippet: { insert: "{\n  \n}", cursor: 4 } },
  { label: "( )", insert: "()", cursor: 1 },
  { label: '"', insert: '""', cursor: 1 },
  { label: "⇥", insert: "  ", action: "indent" },
  { label: "←", insert: "", action: "left" },
  { label: "→", insert: "", action: "right" },
];

const LONG_PRESS_MS = 500;

export interface ToolbarHost {
  insertSnippet(text: string, cursorOffset?: number): void;
  moveCursor(delta: -1 | 1): void;
  focusEditor(): void;
}

export function setupKeyboardToolbar(host: ToolbarHost): { setVisible(visible: boolean): void } {
  const toolbar = document.getElementById("kbd-toolbar")!;

  for (const key of KEYS) {
    const button = document.createElement("button");
    button.className = "kbd-key";
    button.textContent = key.label;
    button.setAttribute("aria-label", `${key.label} を挿入`);

    let timer: ReturnType<typeof setTimeout> | undefined;
    let longPressed = false;

    const activate = (snippet: boolean) => {
      if (key.action === "left") return host.moveCursor(-1);
      if (key.action === "right") return host.moveCursor(1);
      const source = snippet && key.snippet ? key.snippet : key;
      host.insertSnippet(source.insert, source.cursor);
    };

    button.addEventListener("pointerdown", (event) => {
      // Prevent focus from leaving the editor so the keyboard stays open.
      event.preventDefault();
      longPressed = false;
      if (key.snippet) {
        timer = setTimeout(() => {
          longPressed = true;
          button.classList.add("is-pressed");
          activate(true);
        }, LONG_PRESS_MS);
      }
    });
    button.addEventListener("pointerup", (event) => {
      event.preventDefault();
      clearTimeout(timer);
      button.classList.remove("is-pressed");
      if (!longPressed) activate(false);
    });
    button.addEventListener("pointercancel", () => {
      clearTimeout(timer);
      button.classList.remove("is-pressed");
    });
    button.addEventListener("contextmenu", (event) => event.preventDefault());

    toolbar.append(button);
  }

  // Pin the toolbar right above the software keyboard using visualViewport.
  const reposition = () => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const bottom = window.innerHeight - viewport.height - viewport.offsetTop;
    toolbar.style.bottom = `${Math.max(0, bottom)}px`;
  };
  window.visualViewport?.addEventListener("resize", reposition);
  window.visualViewport?.addEventListener("scroll", reposition);

  let visible = false;
  return {
    setVisible(next) {
      visible = next;
      // Delay hiding: tapping a toolbar key blurs momentarily on some browsers.
      setTimeout(() => {
        toolbar.hidden = !visible;
        if (visible) reposition();
      }, 100);
    },
  };
}
