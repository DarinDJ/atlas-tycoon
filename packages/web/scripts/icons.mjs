// Generates PWA icons and the OG image as PNGs with no dependencies (zlib + raw RGBA).
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

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
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, paint) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = paint(x, y);
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const SAFFRON = [255, 122, 26], CREAM = [255, 247, 237], LEAF = [18, 136, 7], NAVY = [29, 78, 216];
function inRoundRect(x, y, x0, y0, w, h, r) {
  const cx = Math.max(x0 + r, Math.min(x, x0 + w - r)), cy = Math.max(y0 + r, Math.min(y, y0 + h - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function icon(size) {
  const s = size;
  return png(s, s, (x, y) => {
    if (!inRoundRect(x, y, 0, 0, s, s, s * 0.22)) return [0, 0, 0, 0];
    const u = x / s, v = y / s;
    // roof triangle
    const roofTop = 0.2, roofBase = 0.52;
    const inRoof = v >= roofTop && v <= roofBase && Math.abs(u - 0.5) <= ((v - roofTop) / (roofBase - roofTop)) * 0.4;
    const inRoofEdge = v >= roofTop - 0.06 && v <= roofBase + 0.02 && Math.abs(u - 0.5) <= ((v - roofTop + 0.06) / (roofBase - roofTop)) * 0.42 && !inRoof;
    const inBody = u >= 0.2 && u <= 0.8 && v >= 0.5 && v <= 0.82;
    const inDoor = (u - 0.5) ** 2 + (v - 0.68) ** 2 <= 0.09 ** 2;
    if (inDoor) return [...NAVY, 255];
    if (inRoofEdge) return [...LEAF, 255];
    if (inRoof || inBody) return [...CREAM, 255];
    return [...SAFFRON, 255];
  });
}
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192));
writeFileSync('public/icons/icon-512.png', icon(512));
// OG image: tricolour gradient with a centred house glyph block
const W = 1200, H = 630;
writeFileSync('public/og.png', png(W, H, (x, y) => {
  const t = y / H;
  const mix = (a, b, k) => Math.round(a + (b - a) * k);
  let bg = t < 0.5 ? [mix(SAFFRON[0], CREAM[0], t * 2), mix(SAFFRON[1], CREAM[1], t * 2), mix(SAFFRON[2], CREAM[2], t * 2)] : [mix(CREAM[0], LEAF[0], (t - 0.5) * 2), mix(CREAM[1], LEAF[1], (t - 0.5) * 2), mix(CREAM[2], LEAF[2], (t - 0.5) * 2)];
  const cx = W / 2, cy = H / 2, s = 260;
  if (inRoundRect(x, y, cx - s / 2, cy - s / 2, s, s, s * 0.22)) {
    const u = (x - (cx - s / 2)) / s, v = (y - (cy - s / 2)) / s;
    const roofTop = 0.2, roofBase = 0.52;
    const inRoof = v >= roofTop && v <= roofBase && Math.abs(u - 0.5) <= ((v - roofTop) / (roofBase - roofTop)) * 0.4;
    const inBody = u >= 0.2 && u <= 0.8 && v >= 0.5 && v <= 0.82;
    const inDoor = (u - 0.5) ** 2 + (v - 0.68) ** 2 <= 0.09 ** 2;
    if (inDoor) return [...NAVY, 255];
    if (inRoof || inBody) return [...CREAM, 255];
    return [...SAFFRON, 255];
  }
  return [...bg, 255];
}));
console.log('icons written');
