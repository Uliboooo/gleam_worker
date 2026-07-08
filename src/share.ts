import { encodeCode, decodeCode } from "./lib/codec.ts";
import { utf8Length } from "./lib/rewrite.ts";
import { showToast } from "./ui/toast.ts";

const URL_WARN_BYTES = 8 * 1024;

/** Builds a share URL, warns above ~8 KB, then uses Web Share API or clipboard. */
export async function shareCode(code: string): Promise<void> {
  const encoded = await encodeCode(code);
  const url = `${location.origin}${location.pathname}#code=${encoded}`;

  if (utf8Length(url) > URL_WARN_BYTES) {
    showToast("URL が 8KB を超えています。ブラウザによっては開けない場合があります。");
  }

  if (navigator.share) {
    try {
      await navigator.share({ title: "Gleam Playground", url });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      // fall through to clipboard
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    showToast("共有 URL をコピーしました");
  } catch {
    showToast("コピーできませんでした。アドレスバーの URL を共有してください。");
    location.hash = `code=${encoded}`;
  }
}

/** Restores code from a `#code=...` hash, if present and valid. */
export async function codeFromHash(): Promise<string | null> {
  const match = /(?:^|[#&])code=([^&]+)/.exec(location.hash);
  if (!match) return null;
  try {
    return await decodeCode(match[1]);
  } catch {
    showToast("共有 URL のコードを読み込めませんでした");
    return null;
  }
}
