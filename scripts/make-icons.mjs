// Writes the PWA icons as PNGs without an image library: a teal tile with a white
// barcode mark, drawn per pixel and encoded with zlib.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const TEAL = [15, 107, 95];
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, { maskable }) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const radius = maskable ? 0 : size * 0.22;
  const inset = maskable ? size * 0.2 : size * 0.12;
  const bars = [[0.0, 0.1], [0.16, 0.2], [0.3, 0.38], [0.46, 0.52], [0.6, 0.7], [0.78, 0.84], [0.9, 1.0]];
  const x0 = inset + size * 0.1, x1 = size - inset - size * 0.1;
  const y0 = inset + size * 0.16, y1 = size - inset - size * 0.16;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cx = Math.min(x, size - 1 - x), cy = Math.min(y, size - 1 - y);
      let inside = true;
      if (cx < radius && cy < radius) inside = (radius - cx) ** 2 + (radius - cy) ** 2 <= radius ** 2;
      let color = TEAL;
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
        const t = (x - x0) / (x1 - x0);
        if (bars.some(([a, b]) => t >= a && t <= b)) color = WHITE;
      }
      raw[o] = color[0]; raw[o + 1] = color[1]; raw[o + 2] = color[2]; raw[o + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, { maskable: false }));
writeFileSync('public/icons/icon-512.png', png(512, { maskable: false }));
writeFileSync('public/icons/maskable-512.png', png(512, { maskable: true }));
writeFileSync('public/icons/apple-touch-icon.png', png(180, { maskable: true }));
console.log('icons written');
