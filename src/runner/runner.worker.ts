/**
 * Sandboxed execution worker. Receives compiled JavaScript (imports already
 * rewritten to absolute URLs), loads it as a Blob module and calls main().
 * Killed from the main thread on timeout.
 */

export type RunnerMessage =
  | { type: "stdout"; text: string }
  | { type: "stderr"; text: string }
  | { type: "done" }
  | { type: "crash"; text: string };

function post(message: RunnerMessage): void {
  (self as unknown as Worker).postMessage(message);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

// Gleam's JS target prints through the console, so capture it.
for (const method of ["log", "info", "debug"] as const) {
  console[method] = (...args: unknown[]) => post({ type: "stdout", text: args.map(stringify).join(" ") });
}
for (const method of ["error", "warn"] as const) {
  console[method] = (...args: unknown[]) => post({ type: "stderr", text: args.map(stringify).join(" ") });
}

self.onmessage = async (event: MessageEvent<{ js: string }>) => {
  const url = URL.createObjectURL(new Blob([event.data.js], { type: "text/javascript" }));
  try {
    const module = await import(/* @vite-ignore */ url);
    if (typeof module.main === "function") {
      await module.main();
      post({ type: "done" });
    } else {
      post({ type: "crash", text: "pub fn main() が見つかりません。main 関数を定義してください。" });
    }
  } catch (error) {
    const text = error instanceof Error ? (error.stack ?? error.message) : stringify(error);
    post({ type: "crash", text });
  } finally {
    URL.revokeObjectURL(url);
  }
};
