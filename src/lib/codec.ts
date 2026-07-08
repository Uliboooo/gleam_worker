/**
 * Share-URL codec: deflate-raw compression + base64url, no server needed.
 * Pure logic (no DOM) so it can be unit-tested in Node.
 */

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function base64UrlToBytes(text: string): Uint8Array {
  const base64 = text.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const readable = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  const buffer = await new Response(readable).arrayBuffer();
  return new Uint8Array(buffer);
}

/** Compress code for the URL hash. Falls back to plain base64url when CompressionStream is unavailable. */
export async function encodeCode(code: string): Promise<string> {
  const utf8 = new TextEncoder().encode(code);
  if (typeof CompressionStream === "undefined") {
    return "0" + bytesToBase64Url(utf8);
  }
  const compressed = await pipeThrough(utf8, new CompressionStream("deflate-raw"));
  return "1" + bytesToBase64Url(compressed);
}

/** Inverse of {@link encodeCode}. Throws on malformed input. */
export async function decodeCode(encoded: string): Promise<string> {
  const flag = encoded[0];
  const bytes = base64UrlToBytes(encoded.slice(1));
  if (flag === "0") return new TextDecoder().decode(bytes);
  if (flag !== "1") throw new Error(`unknown share format: ${flag}`);
  const plain = await pipeThrough(bytes, new DecompressionStream("deflate-raw"));
  return new TextDecoder().decode(plain);
}
