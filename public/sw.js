/* Gleam Playground service worker: full offline support.
 * Precaches the app shell (from asset-manifest.json emitted at build time)
 * and the compiler artifacts (from wasm/manifest.json emitted by
 * scripts/fetch-compiler.mjs). Bump VERSION to invalidate old caches. */

const VERSION = "v1";
const CACHE = `gleam-playground-${VERSION}`;

async function fetchManifest(url) {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const [appAssets, compilerAssets] = await Promise.all([
        fetchManifest("/asset-manifest.json"),
        fetchManifest("/wasm/manifest.json"),
      ]);
      const urls = [
        "/manifest.webmanifest",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/maskable-512.png",
        ...appAssets,
        ...compilerAssets,
      ];
      // Precache best-effort: a missing optional file must not break install.
      await Promise.allSettled(urls.map((url) => cache.add(url)));
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Navigations: network first so updates are picked up, shell as fallback.
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request);
          cache.put("/", response.clone());
          return response;
        } catch {
          return (await cache.match("/")) ?? Response.error();
        }
      }

      // Everything else (hashed assets, wasm, stdlib): cache first.
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    })(),
  );
});
