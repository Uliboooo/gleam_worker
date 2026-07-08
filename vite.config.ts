import { defineConfig, type Plugin } from "vite";

/**
 * Emits dist/asset-manifest.json listing every built asset so the service
 * worker can precache the hashed app shell for full offline support.
 */
function assetManifest(): Plugin {
  return {
    name: "asset-manifest",
    apply: "build",
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => f !== "sw.js")
        .map((f) => `/${f}`);
      this.emitFile({
        type: "asset",
        fileName: "asset-manifest.json",
        source: JSON.stringify(["/", ...assets]),
      });
    },
  };
}

export default defineConfig({
  plugins: [assetManifest()],
  build: {
    target: "es2022",
    sourcemap: false,
  },
});
