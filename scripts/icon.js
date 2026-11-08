// Writes media/icon.png (128x128): a berry-red circle with a lighter highlight. No dependencies.
const fs = require("fs"), zlib = require("zlib");
const N = 128, raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) {
  raw[y * (N * 4 + 1)] = 0;
  for (let x = 0; x < N; x++) {
    const i = y * (N * 4 + 1) + 1 + x * 4, dx = x - 63.5, dy = y - 66, d = Math.hypot(dx, dy);
    const a = Math.max(0, Math.min(1, 58 - d)), hl = Math.max(0, 1 - Math.hypot(x - 44, y - 46) / 22);
    const leaf = Math.hypot(x - 72, y - 14) < 11 && y < 20;
    const [r, g, b] = leaf ? [76, 175, 80] : [Math.round(200 + 55 * hl), Math.round(30 + 120 * hl), Math.round(70 + 110 * hl)];
    raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = leaf ? 255 : Math.round(a * 255);
  }
}
const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } c = 0xffffffff; for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(__dirname + "/../media/icon.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
