import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const svg = fs.readFileSync(new URL('./logo.svg', import.meta.url), 'utf8');
const tags = [...svg.matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)].map((m) => ({
  name: m[1],
  attrs: Object.fromEntries([...m[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
}));
const shapes = tags.filter((t) => t.name !== 'svg');
const num = (v) => Number(v);

test('Logo draws a lens with dotted underline: ring, handle and three dots inside the ring', () => {
  assert.ok(/^<svg\b[\s\S]*<\/svg>\s*$/.test(svg.trim()), 'well-formed svg element');
  const root = tags[0];
  const vb = root.attrs.viewBox.split(/\s+/).map(num);
  assert.equal(vb.length, 4);
  assert.equal(vb[2], vb[3], 'square viewBox');
  const ring = shapes.find((t) => t.name === 'circle' && t.attrs.fill === 'none' && t.attrs.stroke);
  assert.ok(ring, 'ring');
  assert.ok(shapes.some((t) => t.name === 'line'), 'handle');
  const inner = num(ring.attrs.r) - num(ring.attrs['stroke-width']) / 2;
  const dots = shapes.filter((t) => t.name === 'circle' && t !== ring && t.attrs.fill !== 'none').filter((d) => {
    const dist = Math.hypot(num(d.attrs.cx) - num(ring.attrs.cx), num(d.attrs.cy) - num(ring.attrs.cy));
    return dist + num(d.attrs.r) <= inner;
  });
  assert.ok(dots.length >= 3, `at least three dots inside the ring, got ${dots.length}`);
});

test('Logo stays within the exportable shapes: only rect, circle and line', () => {
  for (const t of shapes) assert.ok(['rect', 'circle', 'line'].includes(t.name), `unexpected <${t.name}>`);
  assert.ok(shapes.length > 0);
});
