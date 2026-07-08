/**
 * Downloads the Gleam WASM compiler and the standard library, precompiles the
 * stdlib to JavaScript, and lays everything out for the app:
 *
 *   public/wasm/         gleam_wasm.js + gleam_wasm_bg.wasm (wasm-bindgen)
 *   public/stdlib/       sources.json (module name -> .gleam source)
 *   public/precompiled/  stdlib compiled to JS + FFI .mjs files + prelude
 *   public/wasm/manifest.json  file list for service-worker precaching
 *
 * Requires normal internet access (github.com, hex.pm). Usage:
 *
 *   npm run fetch-compiler            # latest Gleam release
 *   GLEAM_VERSION=1.11.1 npm run fetch-compiler
 */

import { mkdir, writeFile, readFile, readdir, rm, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join, relative, dirname } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as tar from "tar";
import zlib from "node:zlib";

const ROOT = new URL("..", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const WASM_DIR = join(PUBLIC, "wasm");
const STDLIB_DIR = join(PUBLIC, "stdlib");
const PRECOMPILED_DIR = join(PUBLIC, "precompiled");

async function main() {
  const gleamVersion = process.env.GLEAM_VERSION || (await latestGleamVersion());
  console.log(`Gleam compiler version: ${gleamVersion}`);

  const work = join(tmpdir(), `gleam-playground-fetch-${Date.now()}`);
  await mkdir(work, { recursive: true });

  await fetchWasmCompiler(gleamVersion, work);
  const stdlib = await fetchStdlib(work);
  await writeStdlibSources(stdlib.srcDir);
  await precompileStdlib(stdlib.srcDir, gleamVersion);
  await writePrecacheManifest();

  await rm(work, { recursive: true, force: true });
  console.log("Done. Run `npm run dev` or `npm run build`.");
}

async function latestGleamVersion() {
  const response = await fetch("https://api.github.com/repos/gleam-lang/gleam/releases/latest", {
    headers: { accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`Failed to query latest Gleam release: HTTP ${response.status}`);
  const release = await response.json();
  return release.tag_name.replace(/^v/, "");
}

async function download(url, destination) {
  console.log(`  downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

async function fetchWasmCompiler(version, work) {
  console.log("Fetching WASM compiler…");
  const tarball = join(work, "browser.tar.gz");
  await download(
    `https://github.com/gleam-lang/gleam/releases/download/v${version}/gleam-v${version}-browser.tar.gz`,
    tarball,
  );
  const extracted = join(work, "browser");
  await mkdir(extracted, { recursive: true });
  await tar.x({ file: tarball, cwd: extracted });

  // The tarball layout has varied between releases; locate the files.
  const js = await findFile(extracted, "gleam_wasm.js");
  const wasm = await findFile(extracted, "gleam_wasm_bg.wasm");
  await rm(WASM_DIR, { recursive: true, force: true });
  await mkdir(WASM_DIR, { recursive: true });
  await writeFile(join(WASM_DIR, "gleam_wasm.js"), await readFile(js));
  await writeFile(join(WASM_DIR, "gleam_wasm_bg.wasm"), await readFile(wasm));
}

async function findFile(dir, name) {
  for (const entry of await readdir(dir, { recursive: true })) {
    if (entry.endsWith(name)) return join(dir, entry);
  }
  throw new Error(`${name} not found in downloaded archive`);
}

async function fetchStdlib(work) {
  console.log("Fetching gleam_stdlib from hex.pm…");
  const meta = await (await fetch("https://hex.pm/api/packages/gleam_stdlib")).json();
  const version = meta.releases[0].version;
  console.log(`  gleam_stdlib version: ${version}`);

  const outer = join(work, "stdlib.tar");
  await download(`https://repo.hex.pm/tarballs/gleam_stdlib-${version}.tar`, outer);
  const outerDir = join(work, "stdlib-outer");
  await mkdir(outerDir, { recursive: true });
  await tar.x({ file: outer, cwd: outerDir });

  const srcDir = join(work, "stdlib-src");
  await mkdir(srcDir, { recursive: true });
  const contents = zlib.gunzipSync(await readFile(join(outerDir, "contents.tar.gz")));
  const contentsTar = join(work, "contents.tar");
  await writeFile(contentsTar, contents);
  await tar.x({ file: contentsTar, cwd: srcDir });
  return { srcDir, version };
}

async function collectFiles(dir, extension) {
  const results = [];
  for (const entry of await readdir(dir, { recursive: true })) {
    if (entry.endsWith(extension) && !(await stat(join(dir, entry))).isDirectory()) {
      results.push(entry);
    }
  }
  return results;
}

async function writeStdlibSources(stdlibSrcDir) {
  console.log("Writing stdlib sources for the in-browser compiler…");
  const src = join(stdlibSrcDir, "src");
  const sources = {};
  for (const file of await collectFiles(src, ".gleam")) {
    const moduleName = file.replace(/\.gleam$/, "").replaceAll("\\", "/");
    sources[moduleName] = await readFile(join(src, file), "utf8");
  }
  await rm(STDLIB_DIR, { recursive: true, force: true });
  await mkdir(STDLIB_DIR, { recursive: true });
  await writeFile(join(STDLIB_DIR, "sources.json"), JSON.stringify(sources));
  console.log(`  ${Object.keys(sources).length} modules`);
}

async function precompileStdlib(stdlibSrcDir, gleamVersion) {
  console.log("Precompiling stdlib to JavaScript with the WASM compiler…");
  await rm(PRECOMPILED_DIR, { recursive: true, force: true });
  await mkdir(PRECOMPILED_DIR, { recursive: true });

  const compiler = await import(pathToFileURL(join(WASM_DIR, "gleam_wasm.js")).href);
  await compiler.default(await readFile(join(WASM_DIR, "gleam_wasm_bg.wasm")));
  compiler.initialise_panic_hook(false);

  const src = join(stdlibSrcDir, "src");
  const projectId = 0;
  const modules = [];
  for (const file of await collectFiles(src, ".gleam")) {
    const moduleName = file.replace(/\.gleam$/, "").replaceAll("\\", "/");
    modules.push(moduleName);
    compiler.write_module(projectId, moduleName, await readFile(join(src, file), "utf8"));
  }
  compiler.compile_package(projectId, "javascript");

  for (const moduleName of modules) {
    const js = compiler.read_compiled_javascript(projectId, moduleName);
    if (js === undefined) throw new Error(`No compiled JS for ${moduleName}`);
    const outPath = join(PRECOMPILED_DIR, `${moduleName}.mjs`);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, js);
  }

  // FFI files shipped inside the stdlib package (gleam_stdlib.mjs, dict.mjs, …)
  for (const file of await collectFiles(src, ".mjs")) {
    const outPath = join(PRECOMPILED_DIR, file);
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, await readFile(join(src, file)));
  }

  // The prelude, imported by every compiled module as "./gleam.mjs"
  const prelude = await fetch(
    `https://raw.githubusercontent.com/gleam-lang/gleam/v${gleamVersion}/compiler-core/templates/prelude.mjs`,
  );
  if (!prelude.ok) throw new Error(`Failed to download prelude.mjs: HTTP ${prelude.status}`);
  await writeFile(join(PRECOMPILED_DIR, "gleam.mjs"), await prelude.text());
  console.log(`  ${modules.length} modules precompiled`);
}

async function writePrecacheManifest() {
  const files = ["/wasm/gleam_wasm.js", "/wasm/gleam_wasm_bg.wasm", "/stdlib/sources.json"];
  for (const file of await collectFiles(PRECOMPILED_DIR, ".mjs")) {
    files.push(`/precompiled/${file.replaceAll("\\", "/")}`);
  }
  await writeFile(join(WASM_DIR, "manifest.json"), JSON.stringify(files));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
