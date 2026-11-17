import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { renderSvg } from './build-icons.mjs';

const svg = fs.readFileSync(new URL('./logo.svg', import.meta.url), 'utf8');
const img = renderSvg(svg, 16);
const W = img.width;
const px = (x, y) => { const i = (y * W + x) * 4; return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]; };

const lum = ([r, g, b]) => {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

const TILE = px(8, 1); // inside the tile, away from the mark and the rounded corners
// the mark color as rendered: the lightest opaque pixel of the 16 px image
let MARK = TILE;
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { const p = px(x, y); if (p[3] === 255 && lum(p) > lum(MARK)) MARK = p; }
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const isMark = (x, y) => { const p = px(x, y); return p[3] > 128 && dist(p, MARK) < dist(p, TILE); };

test('Lens ring is closed at 16 px: a fill from outside the mark never reaches the lens centre', () => {
  assert.ok(!isMark(7, 7), 'lens centre pixel is not itself a mark pixel');
  const seen = new Set();
  const stack = [[0, 0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= W || seen.has(y * W + x) || isMark(x, y)) continue;
    seen.add(y * W + x);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  assert.ok(!seen.has(7 * W + 7), 'fill reached the lens centre');
  assert.ok(seen.size > 0);
});

test('Mark contrasts with the tile at 16 px: ratio is at least 3:1 and the handle is in the mark color', () => {
  assert.equal(TILE[3], 255, 'tile pixel is opaque');
  assert.ok(contrast(MARK, TILE) >= 3, `contrast ${contrast(MARK, TILE).toFixed(2)}`);
  assert.ok(dist(MARK, TILE) > 0, 'a mark color distinct from the tile was found');
  // the handle runs (40,40)->(54,54) on the 64 grid, i.e. about pixels (10,10)->(13,13) at 16 px
  const handle = [[11, 11], [12, 12], [13, 13]].filter(([x, y]) => isMark(x, y));
  assert.ok(handle.length >= 2, `handle pixels in the mark color: ${handle.length}`);
  assert.ok(px(12, 12)[3] === 255 && dist(px(12, 12), MARK) < 40, 'handle pixel (12,12) is close to the mark color');
});
