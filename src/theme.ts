import type { Settings } from "./storage.ts";

const media = window.matchMedia("(prefers-color-scheme: dark)");
let current: Settings["theme"] = "system";
const listeners = new Set<(dark: boolean) => void>();

export function isDark(): boolean {
  return current === "dark" || (current === "system" && media.matches);
}

export function applyTheme(theme: Settings["theme"]): void {
  current = theme;
  const dark = isDark();
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#2f2f2f" : "#ffaff3");
  for (const listener of listeners) listener(dark);
}

export function onThemeChange(listener: (dark: boolean) => void): void {
  listeners.add(listener);
}

media.addEventListener("change", () => {
  if (current === "system") applyTheme("system");
});
