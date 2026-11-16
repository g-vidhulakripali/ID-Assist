// Generates the extension icons as PNG files with no dependencies.
// Design: a blue disc with a white microphone capsule, stand and base.
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'public/icons');
const SIZES = [16, 32, 48, 128];
const BLUE = [31, 79, 216];
const WHITE = [255, 255, 255];

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter type: none
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Shape sampler in unit coordinates (0..1). Returns [r, g, b, a].
function sample(u, v) {
  const dx = u - 0.5;
  const dy = v - 0.5;
  if (dx * dx + dy * dy > 0.25) return [0, 0, 0, 0];
  // Microphone capsule: rounded rectangle centred at (0.5, 0.42)
  const cw = 0.11;
  const ch = 0.2;
  const qx = Math.max(Math.abs(u - 0.5) - (cw - cw), 0);
  const qy = Math.max(Math.abs(v - 0.42) - (ch - cw), 0);
  if (qx * qx + qy * qy <= cw * cw) return [...WHITE, 255];
  // Stand: lower half of a thick ring around the capsule
  const sx = u - 0.5;
  const sy = v - 0.45;
  const dist = Math.sqrt(sx * sx + sy * sy);
  if (sy > 0 && dist > 0.19 && dist < 0.24) return [...WHITE, 255];
  // Stem and base
  if (Math.abs(u - 0.5) < 0.025 && v > 0.66 && v < 0.78) return [...WHITE, 255];
  if (Math.abs(u - 0.5) < 0.12 && v > 0.76 && v < 0.81) return [...WHITE, 255];
  return [...BLUE, 255];
}

function render(size) {
  const ss = 4; // supersampling factor per axis
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let j = 0; j < ss; j++) {
        for (let i = 0; i < ss; i++) {
          const [sr, sg, sb, sa] = sample((x + (i + 0.5) / ss) / size, (y + (j + 0.5) / ss) / size);
          r += sr * sa;
          g += sg * sa;
          b += sb * sa;
          a += sa;
        }
      }
      const o = (y * size + x) * 4;
      if (a > 0) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      }
      out[o + 3] = a / (ss * ss);
    }
  }
  return out;
}

await mkdir(outDir, { recursive: true });
for (const size of SIZES) {
  await writeFile(path.join(outDir, `icon-${size}.png`), encodePng(size, render(size)));
}
console.log(`[id-assist] wrote ${SIZES.length} icons to public/icons`);
