/**
 * Draggable divider between the editor and output panes.
 * Portrait: vertical stack (height ratio). Landscape / tablet: columns (width ratio).
 */

const landscapeQuery = window.matchMedia("(orientation: landscape), (min-width: 768px)");

export function isLandscape(): boolean {
  return landscapeQuery.matches;
}

export function setupSplit(options: {
  getRatio(landscape: boolean): number;
  setRatio(landscape: boolean, ratio: number): void;
}): void {
  const panes = document.getElementById("panes")!;
  const editorPane = document.getElementById("editor-pane")!;
  const divider = document.getElementById("divider")!;

  function apply(): void {
    const landscape = isLandscape();
    const percent = options.getRatio(landscape) * 100;
    if (landscape) {
      editorPane.style.height = "";
      editorPane.style.width = `${percent}%`;
    } else {
      editorPane.style.width = "";
      editorPane.style.height = `${percent}%`;
    }
  }

  divider.addEventListener("pointerdown", (down) => {
    down.preventDefault();
    divider.setPointerCapture(down.pointerId);
    const landscape = isLandscape();
    const rect = panes.getBoundingClientRect();

    const onMove = (move: PointerEvent) => {
      const ratio = landscape
        ? (move.clientX - rect.left) / rect.width
        : (move.clientY - rect.top) / rect.height;
      options.setRatio(landscape, Math.min(0.85, Math.max(0.15, ratio)));
      apply();
    };
    const onUp = () => {
      divider.removeEventListener("pointermove", onMove);
      divider.removeEventListener("pointerup", onUp);
      divider.removeEventListener("pointercancel", onUp);
    };
    divider.addEventListener("pointermove", onMove);
    divider.addEventListener("pointerup", onUp);
    divider.addEventListener("pointercancel", onUp);
  });

  // Keyboard accessibility for the separator
  divider.addEventListener("keydown", (event) => {
    const landscape = isLandscape();
    const keys = landscape ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
    const index = keys.indexOf(event.key);
    if (index === -1) return;
    event.preventDefault();
    const delta = index === 0 ? -0.05 : 0.05;
    const next = Math.min(0.85, Math.max(0.15, options.getRatio(landscape) + delta));
    options.setRatio(landscape, next);
    apply();
  });

  landscapeQuery.addEventListener("change", apply);
  apply();
}
