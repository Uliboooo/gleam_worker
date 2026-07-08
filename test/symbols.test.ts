import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSymbols, parseImports, parseModuleSymbols } from "../src/editor/symbols.ts";

test("parses public functions with signatures", () => {
  const source = `
import gleam/order

pub fn map(list: List(a), with fun: fn(a) -> b) -> List(b) {
  todo
}

fn private_helper() {
  Nil
}
`;
  const pub = parseSymbols(source, false);
  const map = pub.find((s) => s.name === "map");
  assert.ok(map, "map should be found");
  assert.equal(map.kind, "function");
  assert.match(map.detail, /fn map\(list: List\(a\)/);
  assert.ok(!pub.some((s) => s.name === "private_helper"), "private fn excluded when includePrivate=false");

  const all = parseSymbols(source, true);
  assert.ok(all.some((s) => s.name === "private_helper"), "private fn included when includePrivate=true");
});

test("parses types and their constructors", () => {
  const source = `
pub type Shape {
  Circle(radius: Float)
  Rectangle(width: Float, height: Float)
}
`;
  const symbols = parseSymbols(source, false);
  assert.ok(symbols.some((s) => s.name === "Shape" && s.kind === "type"));
  assert.ok(symbols.some((s) => s.name === "Circle" && s.kind === "constructor"));
  assert.ok(symbols.some((s) => s.name === "Rectangle" && s.kind === "constructor"));
});

test("parses constants", () => {
  const [symbol] = parseSymbols("pub const answer = 42", false);
  assert.equal(symbol.name, "answer");
  assert.equal(symbol.kind, "constant");
});

test("parses imports with alias and unqualified names", () => {
  const source = [
    "import gleam/io",
    "import gleam/list.{map, filter}",
    "import gleam/string as text",
    "import gleam/result.{try} as res",
  ].join("\n");
  const imports = parseImports(source);

  const io = imports.find((i) => i.module === "gleam/io");
  assert.equal(io?.alias, "io");

  const list = imports.find((i) => i.module === "gleam/list");
  assert.deepEqual(list?.unqualified, ["map", "filter"]);

  const string = imports.find((i) => i.module === "gleam/string");
  assert.equal(string?.alias, "text");

  const result = imports.find((i) => i.module === "gleam/result");
  assert.equal(result?.alias, "res");
  assert.deepEqual(result?.unqualified, ["try"]);
});

test("builds a per-module symbol map", () => {
  const map = parseModuleSymbols({
    "gleam/io": "pub fn println(s: String) -> Nil {\n  todo\n}",
    "gleam/int": "pub fn to_string(x: Int) -> String {\n  todo\n}",
  });
  assert.ok(map.get("gleam/io")?.some((s) => s.name === "println"));
  assert.ok(map.get("gleam/int")?.some((s) => s.name === "to_string"));
});
