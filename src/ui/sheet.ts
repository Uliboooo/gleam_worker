/** Minimal bottom sheet used for the samples list and the settings menu. */

const backdrop = () => document.getElementById("sheet-backdrop")!;
const sheet = () => document.getElementById("bottom-sheet")!;

export function openSheet(build: (root: HTMLElement, close: () => void) => void): void {
  const root = sheet();
  root.textContent = "";
  build(root, closeSheet);
  root.hidden = false;
  backdrop().hidden = false;
  backdrop().onclick = closeSheet;
  document.addEventListener("keydown", onEscape);
}

export function closeSheet(): void {
  sheet().hidden = true;
  backdrop().hidden = true;
  document.removeEventListener("keydown", onEscape);
}

function onEscape(event: KeyboardEvent): void {
  if (event.key === "Escape") closeSheet();
}

export function sheetTitle(text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "sheet-title";
  el.textContent = text;
  return el;
}

export function sheetItem(title: string, description: string | null, onSelect: () => void): HTMLElement {
  const button = document.createElement("button");
  button.className = "sheet-item";
  button.textContent = title;
  if (description) {
    const desc = document.createElement("span");
    desc.className = "sheet-item-desc";
    desc.textContent = description;
    button.append(desc);
  }
  button.addEventListener("click", onSelect);
  return button;
}

export function sheetSegmentedRow<T extends string>(
  label: string,
  choices: { value: T; label: string }[],
  selected: T,
  onChange: (value: T) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "sheet-row";
  const labelEl = document.createElement("span");
  labelEl.className = "sheet-row-label";
  labelEl.textContent = label;
  row.append(labelEl);
  for (const choice of choices) {
    const button = document.createElement("button");
    button.className = "seg-button" + (choice.value === selected ? " is-active" : "");
    button.textContent = choice.label;
    button.addEventListener("click", () => {
      row.querySelectorAll(".seg-button").forEach((b) => b.classList.remove("is-active"));
      button.classList.add("is-active");
      onChange(choice.value);
    });
    row.append(button);
  }
  return row;
}
