const CODE_KEY = "gleam-playground.code";
const SETTINGS_KEY = "gleam-playground.settings";

export interface Settings {
  fontSize: number;
  theme: "light" | "dark" | "system";
  /** Editor pane share, 0–1, portrait layout. */
  splitPortrait: number;
  /** Editor pane share, 0–1, landscape layout. */
  splitLandscape: number;
}

export const defaultSettings: Settings = {
  fontSize: 14,
  theme: "system",
  splitPortrait: 0.6,
  splitLandscape: 0.6,
};

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or quota exceeded: persistence is best-effort.
  }
}

export function loadCode(): string | null {
  return safeGet(CODE_KEY);
}

export function saveCode(code: string): void {
  safeSet(CODE_KEY, code);
}

export function loadSettings(): Settings {
  const raw = safeGet(SETTINGS_KEY);
  if (!raw) return { ...defaultSettings };
  try {
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(settings: Settings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
}

/** Debounced auto-save helper. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
