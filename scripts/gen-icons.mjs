// Генерирует PNG-иконки (для iOS и манифеста) без внешних зависимостей.
// Запуск: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG1 = hex('#1e2333');
const BG2 = hex('#0b0d12');
const S = 0.84; // масштаб баров, чтобы влезть в «безопасную зону» maskable-иконки
const BARS = [
  [112, 250, 72, 150, hex('#22c55e')],
  [220, 170, 72, 230, hex('#f59e0b')],
  [328, 110, 72, 290, hex('#7c5cff')],
].map(([x, y, w, h, c]) => [256 + (x - 256) * S, 256 + (y - 256) * S, w * S, h * S, c]);

const inRR = (u, v, x, y, w, h) => {
  const r = w / 2;
  const cx = Math.min(Math.max(u, x + r), x + w - r);
  const cy = Math.min(Math.max(v, y + r), y + h - r);
  return (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
};

function sample(u, v) {
  for (const [x, y, w, h, c] of BARS) if (inRR(u, v, x, y, w, h)) return c;
  const t = Math.min(1, Math.max(0, (u + v) / 1024));
  return BG1.map((a, i) => a + (BG2[i] - a) * t);
}

function png(size) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const k = 512 / size;
  const SS = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (const dy of SS) for (const dx of SS) {
        const c = sample((x + dx) * k, (y + dy) * k);
        acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2];
      }
      const o = y * stride + 1 + x * 4;
      raw[o] = acc[0] / 4; raw[o + 1] = acc[1] / 4; raw[o + 2] = acc[2] / 4; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [180, 192, 512]) {
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png(size));
  console.log(`public/icon-${size}.png`);
}
