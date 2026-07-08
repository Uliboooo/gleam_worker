/**
 * Generates the PWA icons (pink rounded square + white four-point star,
 * echoing Gleam's Lucy) as PNGs using only Node built-ins.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import zlib from "node:zlib";

const OUT = new URL("../public/icons", import.meta.url).pathname;

const PINK = [255, 175, 243, 255];
const DARK = [47, 47, 47, 255];

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Signed distance-ish test: inside a rounded square centred at 0.5. */
function inRoundedSquare(x, y, inset, radius) {
  const min = inset;
  const max = 1 - inset;
  if (x < min || x > max || y < min || y > max) return false;
  const cx = Math.max(min + radius - x, x - (max - radius), 0);
  const cy = Math.max(min + radius - y, y - (max - radius), 0);
  return cx * cx + cy * cy <= radius * radius;
}

/** Four-point star (concave diamond): |dx|^p + |dy|^p <= r^p with p < 1. */
function inStar(x, y, r) {
  const dx = Math.abs(x - 0.5) / r;
  const dy = Math.abs(y - 0.5) / r;
  return Math.pow(dx, 0.6) + Math.pow(dy, 0.6) <= 1;
}

function render(size, { maskable }) {
  const pixels = Buffer.alloc(size * size * 4);
  const inset = maskable ? 0 : 0.06;
  const radius = maskable ? 0 : 0.18;
  const starR = maskable ? 0.3 : 0.34;
  const samples = 4; // 4x4 supersampling for smooth edges

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let star = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (maskable || inRoundedSquare(x, y, inset, radius)) {
            bg++;
            if (inStar(x, y, starR)) star++;
          }
        }
      }
      const total = samples * samples;
      const offset = (py * size + px) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const background = PINK[channel] * (bg / total);
        const foreground = (DARK[channel] - PINK[channel]) * (star / total);
        pixels[offset + channel] = Math.round(
          channel === 3 ? 255 * (bg / total) : background + foreground,
        );
      }
    }
  }
  return encodePng(size, pixels);
}

await mkdir(OUT, { recursive: true });
await writeFile(join(OUT, "icon-192.png"), render(192, { maskable: false }));
await writeFile(join(OUT, "icon-512.png"), render(512, { maskable: false }));
await writeFile(join(OUT, "maskable-512.png"), render(512, { maskable: true }));
console.log("Icons written to public/icons/");
