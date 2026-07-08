import type { RunnerMessage } from "./runner.worker.ts";

const TIMEOUT_MS = 5000;

export interface RunCallbacks {
  onStdout(text: string): void;
  onStderr(text: string): void;
  onCrash(text: string): void;
  onFinish(outcome: "done" | "crash" | "timeout"): void;
}

export interface RunHandle {
  cancel(): void;
}

/**
 * Runs compiled JavaScript in a dedicated module Worker. The worker is
 * terminated after 5 s as an infinite-loop guard, or when a new run starts.
 */
export function run(js: string, callbacks: RunCallbacks): RunHandle {
  const worker = new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
  let finished = false;

  const finish = (outcome: "done" | "crash" | "timeout") => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    worker.terminate();
    callbacks.onFinish(outcome);
  };

  const timer = setTimeout(() => {
    callbacks.onCrash(`実行が ${TIMEOUT_MS / 1000} 秒を超えたため停止しました(無限ループの可能性)`);
    finish("timeout");
  }, TIMEOUT_MS);

  worker.onmessage = (event: MessageEvent<RunnerMessage>) => {
    const message = event.data;
    switch (message.type) {
      case "stdout":
        callbacks.onStdout(message.text);
        break;
      case "stderr":
        callbacks.onStderr(message.text);
        break;
      case "crash":
        callbacks.onCrash(message.text);
        finish("crash");
        break;
      case "done":
        finish("done");
        break;
    }
  };

  worker.onerror = (event) => {
    callbacks.onCrash(event.message || "実行中に不明なエラーが発生しました");
    finish("crash");
  };

  worker.postMessage({ js });

  return { cancel: () => finish("crash") };
}
