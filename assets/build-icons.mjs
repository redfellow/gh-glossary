// Exports the extension icons (extension/icons/icon<size>.png) from assets/logo.svg with no dependencies.
// Run `node assets/build-icons.mjs` after editing the SVG. Only rect, circle and line are supported.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const SIZES = [16, 32, 48, 128];
const SS = 8; // supersampling per axis

const ALLOWED = {
  svg: ['xmlns', 'viewBox', 'width', 'height'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'fill', 'stroke', 'stroke-width'],
  circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
  line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width', 'stroke-linecap'],
};

function parseColor(v) {
  const m = /^#([0-9a-f]{6})$/i.exec(v || '');
  if (!m) throw new Error(`unsupported color: ${v}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function parseSvg(svgText) {
  const tags = [...svgText.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)];
  let size = null;
  const shapes = [];
  for (const m of tags) {
    const name = m[1];
    if (!ALLOWED[name]) throw new Error(`unsupported element <${name}>`);
    const attrs = Object.fromEntries([...m[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]));
    for (const k of Object.keys(attrs)) if (!ALLOWED[name].includes(k)) throw new Error(`unsupported attribute ${k} on <${name}>`);
    if (name === 'svg') {
      const vb = (attrs.viewBox || '').split(/\s+/).map(Number);
      if (vb.length !== 4 || vb[0] !== 0 || vb[1] !== 0 || vb[2] !== vb[3] || !(vb[2] > 0)) throw new Error('viewBox must be a square starting at 0 0');
      size = vb[2];
      continue;
    }
    const n = (k, d = 0) => (attrs[k] === undefined ? d : Number(attrs[k]));
    const fill = attrs.fill === undefined ? '#000000' : attrs.fill === 'none' ? null : parseColor(attrs.fill);
    const stroke = attrs.stroke === undefined || attrs.stroke === 'none' ? null : parseColor(attrs.stroke);
    const sw = n('stroke-width', 1);
    if (name === 'rect') shapes.push({ type: 'rect', x: n('x'), y: n('y'), w: n('width'), h: n('height'), rx: n('rx'), fill, stroke, sw });
    else if (name === 'circle') shapes.push({ type: 'circle', cx: n('cx'), cy: n('cy'), r: n('r'), fill, stroke, sw });
    else shapes.push({ type: 'line', x1: n('x1'), y1: n('y1'), x2: n('x2'), y2: n('y2'), stroke, sw, round: attrs['stroke-linecap'] === 'round' });
  }
  if (size === null) throw new Error('no <svg> element');
  return { size, shapes };
}

function inRoundRect(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  const cx = px < x + r ? x + r : px > x + w - r ? x + w - r : px;
  const cy = py < y + r ? y + r : py > y + h - r ? y + h - r : py;
  return Math.hypot(px - cx, py - cy) <= r;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : (px - x1) * dx + (py - y1) * dy;
  const tc = len2 === 0 ? 0 : Math.max(0, Math.min(1, t / len2));
  return { d: Math.hypot(px - (x1 + tc * dx), py - (y1 + tc * dy)), t: len2 === 0 ? 0 : t / len2 };
}

// Color of the shape at a point (source-over in painter's order is done by the caller), or null.
function sample(s, px, py) {
  if (s.type === 'rect') {
    if (s.fill && inRoundRect(px, py, s.x, s.y, s.w, s.h, s.rx)) return s.fill;
    if (s.stroke) {
      const h = s.sw / 2;
      if (inRoundRect(px, py, s.x - h, s.y - h, s.w + s.sw, s.h + s.sw, s.rx + h) && !inRoundRect(px, py, s.x + h, s.y + h, s.w - s.sw, s.h - s.sw, Math.max(0, s.rx - h))) return s.stroke;
    }
    return null;
  }
  if (s.type === 'circle') {
    const d = Math.hypot(px - s.cx, py - s.cy);
    if (s.stroke && Math.abs(d - s.r) <= s.sw / 2) return s.stroke;
    if (s.fill && d <= s.r) return s.fill;
    return null;
  }
  if (!s.stroke) return null;
  const { d, t } = distToSegment(px, py, s.x1, s.y1, s.x2, s.y2);
  if (s.round) return d <= s.sw / 2 ? s.stroke : null;
  // butt caps: inside the band only between the endpoints
  return d <= s.sw / 2 && t >= 0 && t <= 1 ? s.stroke : null;
}

// Returns { width, height, data } with data as straight-alpha RGBA bytes.
export function renderSvg(svgText, size) {
  const { size: vb, shapes } = parseSvg(svgText);
  const scale = vb / size;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) * scale, py = (y + (sy + 0.5) / SS) * scale;
          let c = null;
          for (const s of shapes) c = sample(s, px, py) || c;
          if (c) { r += c[0]; g += c[1]; b += c[2]; covered++; }
        }
      }
      const i = (y * size + x) * 4;
      if (covered) {
        data[i] = Math.round(r / covered);
        data[i + 1] = Math.round(g / covered);
        data[i + 2] = Math.round(b / covered);
        data[i + 3] = Math.round((covered * 255) / (SS * SS));
      }
    }
  }
  return { width: size, height: size, data };
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, body) {
  const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng({ width, height, data }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// PNG-in-ICO container. `images` is [{ size, png }].


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const svg = fs.readFileSync(new URL('./logo.svg', import.meta.url), 'utf8');
  for (const size of SIZES) {
    const out = fileURLToPath(new URL(`../extension/icons/icon${size}.png`, import.meta.url));
    fs.writeFileSync(out, encodePng(renderSvg(svg, size)));
    console.log(`wrote ${out}`);
  }
}
