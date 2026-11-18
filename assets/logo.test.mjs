import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const tags = (svg) => [...svg.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)].map((m) => ({
  name: m[1],
  attrs: Object.fromEntries([...m[2].matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]])),
}));
const viewBox = (svg) => tags(svg)[0].attrs.viewBox.split(/\s+/).map(Number);

test('Logo draws three lines of text that shorten, and a spark for the term', () => {
  const svg = read('logo.svg');
  assert.ok(/^<svg\b[\s\S]*<\/svg>$/.test(svg.trim()), 'well-formed svg element');
  const [x, y, w, h] = viewBox(svg);
  assert.deepEqual([x, y], [0, 0]);
  assert.equal(w, h, 'square viewBox');
  const lines = tags(svg).filter((t) => t.name === 'g' && t.attrs.class === 'lines');
  assert.equal(lines.length, 1, 'one group of lines');
  const body = svg.slice(svg.indexOf('class="lines"'));
  const bars = tags(body.slice(0, body.indexOf('</g>'))).filter((t) => t.name === 'rect').map((t) => Number(t.attrs.width));
  assert.equal(bars.length, 3, 'three lines');
  assert.ok(bars[0] > bars[1] && bars[1] > bars[2], `lines shorten: ${bars}`);
  assert.ok(tags(svg).some((t) => t.name === 'circle' && t.attrs.class === 'spark'), 'spark');
});

test('16 px logo puts every line on whole pixels', () => {
  const svg = read('logo-16.svg');
  assert.deepEqual(viewBox(svg), [0, 0, 16, 16]);
  const lines = tags(svg).filter((t) => t.name === 'rect' && t.attrs.class === 'line');
  assert.equal(lines.length, 3);
  for (const l of lines) {
    for (const k of ['x', 'y', 'width', 'height']) assert.ok(Number.isInteger(Number(l.attrs[k])), `${k}=${l.attrs[k]} is a whole pixel`);
  }
  assert.ok(tags(svg).some((t) => t.name === 'circle' && t.attrs.class === 'spark'), 'spark');
});
