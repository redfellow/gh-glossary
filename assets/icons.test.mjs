// Checks the committed extension icons themselves, so the tests need no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { SIZES } from './build-icons.mjs';

// Decodes an 8-bit RGBA, non-interlaced PNG to { width, height, px(x, y) -> [r, g, b, a] }.
function decodePng(buf) {
  assert.equal(buf.toString('hex', 0, 8), '89504e470d0a1a0a', 'PNG signature');
  let pos = 8, width, height;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      assert.deepEqual([body[8], body[9], body[12]], [8, 6, 0], '8-bit RGBA, not interlaced');
    } else if (type === 'IDAT') idat.push(body);
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4, out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? out[y * stride + i - 4] : 0, b = y ? out[(y - 1) * stride + i] : 0, c = i >= 4 && y ? out[(y - 1) * stride + i - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      out[y * stride + i] = (line[i] + pred) & 255;
    }
  }
  return { width, height, px: (x, y) => [...out.subarray(y * stride + x * 4, y * stride + x * 4 + 4)] };
}

const icon = (size) => decodePng(fs.readFileSync(new URL(`../extension/icons/icon${size}.png`, import.meta.url)));
const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

test('Manifest icons all exist at their stated sizes', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  for (const [size, file] of Object.entries({ ...manifest.icons, ...manifest.action.default_icon })) {
    const img = decodePng(fs.readFileSync(new URL(`../extension/${file}`, import.meta.url)));
    assert.deepEqual([img.width, img.height], [Number(size), Number(size)], file);
  }
  assert.deepEqual(Object.keys(manifest.icons).map(Number), SIZES);
});

test('Every icon is a rounded tile with a warm spark on it', () => {
  for (const size of SIZES) {
    const img = icon(size);
    assert.ok(img.px(0, 0)[3] < 128, `${size}px: corner is transparent`);
    assert.equal(img.px(size >> 1, size >> 1)[3], 255, `${size}px: centre is opaque`);
    let warm = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const [r, , b, a] = img.px(x, y); if (a === 255 && r - b > 100) warm++; }
    assert.ok(warm > 0, `${size}px: has spark pixels`);
  }
});

test('Lines stand out from the tile at 16 px: 3:1 contrast, one solid row per line', () => {
  const img = icon(16);
  const tile = img.px(6, 6); // between the first and second line
  for (const y of [3, 4, 7, 8, 11, 12]) {
    const line = img.px(5, y);
    assert.equal(line[3], 255);
    assert.ok(contrast(line, tile) >= 3, `row ${y}: contrast ${contrast(line, tile).toFixed(2)}`);
  }
  assert.ok(contrast(img.px(6, 5), tile) < 1.5, 'row 5 between lines stays tile coloured');
  const [r, g, b] = img.px(11, 12);
  assert.ok(r > 200 && g > 120 && b < 120, `spark pixel is amber: ${[r, g, b]}`);
});
