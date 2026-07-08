import { showToast } from "./ui/toast.ts";

/** Registers the service worker and prompts to reload when an update is ready. */
export function setupPwa(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("新バージョンがあります", {
              label: "再読み込み",
              onClick: () => {
                worker.postMessage({ type: "SKIP_WAITING" });
              },
            });
          }
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        location.reload();
      });
    } catch {
      // Offline support is progressive enhancement; ignore registration failures.
    }
  });
}
