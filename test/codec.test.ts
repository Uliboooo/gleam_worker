import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCode, decodeCode, bytesToBase64Url, base64UrlToBytes } from "../src/lib/codec.ts";

test("base64url round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array([0, 1, 250, 255, 62, 63, 128]);
  const encoded = bytesToBase64Url(bytes);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/, "must be URL-safe with no padding");
  assert.deepEqual(Array.from(base64UrlToBytes(encoded)), Array.from(bytes));
});

test("encode/decode round-trips code including unicode", async () => {
  const code = 'import gleam/io\n\npub fn main() {\n  io.println("こんにちは ✨")\n}\n';
  const encoded = await encodeCode(code);
  assert.equal(await decodeCode(encoded), code);
});

test("compression shrinks repetitive code", async () => {
  const code = "io.println(\"hello\")\n".repeat(200);
  const encoded = await encodeCode(code);
  assert.equal(encoded[0], "1", "expected compressed format");
  assert.ok(encoded.length < code.length / 2, `expected compression, got ${encoded.length}`);
});

test("decode rejects unknown formats", async () => {
  await assert.rejects(() => decodeCode("Zabc"));
});
