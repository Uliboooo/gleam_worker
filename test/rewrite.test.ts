import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteImports, parseDiagnostics } from "../src/lib/rewrite.ts";

const BASE = "https://example.test/precompiled/";

test("rewrites relative same-directory imports", () => {
  const js = 'import { Ok } from "./gleam.mjs";\nimport * as $io from "./gleam/io.mjs";\n';
  const out = rewriteImports(js, BASE);
  assert.ok(out.includes(`"${BASE}gleam.mjs"`));
  assert.ok(out.includes(`"${BASE}gleam/io.mjs"`));
});

test("rewrites parent-directory imports", () => {
  const js = 'import * as $ffi from "../gleam_stdlib.mjs";';
  assert.equal(rewriteImports(js, BASE), `import * as $ffi from "${BASE}gleam_stdlib.mjs";`);
});

test("leaves absolute and bare imports untouched", () => {
  const js = 'import x from "https://cdn.example/x.mjs";\nimport y from "/already/абс.mjs";';
  assert.equal(rewriteImports(js, BASE), js);
});

test("does not rewrite string literals outside import positions", () => {
  const js = 'const path = "./not/an/import.mjs";';
  assert.equal(rewriteImports(js, BASE), js);
});

test("parses error location pointing at the user module", () => {
  const text = `error: Unknown variable

  ┌─ /src/main.gleam:3:11
  │
3 │   io.printn("hi")

The name \`printn\` is not in scope here.`;
  const [diagnostic] = parseDiagnostics(text, "error");
  assert.equal(diagnostic.severity, "error");
  assert.equal(diagnostic.line, 3);
  assert.equal(diagnostic.column, 11);
});

test("splits multiple diagnostics into blocks", () => {
  const text = "error: First problem\n  at main.gleam:1:1\n\nerror: Second problem\n  at main.gleam:2:5";
  const diagnostics = parseDiagnostics(text, "error");
  assert.equal(diagnostics.length, 2);
  assert.equal(diagnostics[0].line, 1);
  assert.equal(diagnostics[1].line, 2);
});

test("keeps diagnostics without a location", () => {
  const [diagnostic] = parseDiagnostics("warning: Unused import", "warning");
  assert.equal(diagnostic.severity, "warning");
  assert.equal(diagnostic.line, undefined);
});
