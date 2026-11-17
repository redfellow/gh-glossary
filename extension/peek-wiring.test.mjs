import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8');
const from = (marker, len = 900) => { const i = src.indexOf(marker); assert.ok(i >= 0, marker); return src.slice(i, i + len); };
const enter = () => from("panel.addEventListener('mouseenter'", 700).split("panel.addEventListener('mouseleave'")[0];

test('Hover pops out: mouseenter on the panel steps the reducer with enter and renderPanel reads peek', () => {
  assert.match(enter(), /peekStep\(peekS, 'enter'/);
  assert.match(enter(), /popOut\(\)/);
  assert.match(src, /const tabShown = \(\) => docked\(\) && !peek;/);
  const rp = from('function renderPanel()', 1400);
  assert.match(rp, /if \(tabShown\(\)\) return renderBadge\(\);/);
});

test('Leaving folds it back: a 350 ms timer guarded by foldDue', () => {
  assert.match(src, /setTimeout\(\(\) => \{ if \(foldDue\(peekS\)\) fold\(\); \}, 350\)/);
  assert.match(src, /addEventListener\('mouseleave'[^\n]*scheduleFold\(\)/);
});

test('Typing keeps it open: focusin and focusout listeners feed the reducer', () => {
  assert.match(src, /panel\.addEventListener\('focusin'[^\n]*peekStep\(peekS, 'focusin'/);
  assert.match(src, /panel\.addEventListener\('focusout'[^\n]*peekStep\(peekS, 'focusout'/);
});

test('Press right after arriving: the mousedown tab branch uses isTabClick', () => {
  assert.match(src, /docked\(\) && e\.button === 0 && \(tabShown\(\) \|\| \(peek && isTabClick\(peekS\.enteredAt, Date\.now\(\)\)\)\)/);
});

test('Fits on the screen: peekRect places the window when peeking', () => {
  assert.match(from('function applyGeometry()', 1200), /if \(docked\(\) && peek\) \{\s*const r = peekRect\(/);
});

test('Hover pop-out stores nothing: no setVal inside the peek handlers', () => {
  const a = src.indexOf("panel.addEventListener('mouseenter'");
  const f = src.indexOf('function fold()');
  assert.ok(a > 0 && f > 0);
  const o = src.indexOf("panel.addEventListener('focusout'");
  assert.ok(o > a);
  const text = src.slice(Math.min(a, f), src.indexOf('\n', o));
  assert.ok(text.includes('scheduleFold') && text.includes("'focusout'"));
  assert.ok(!text.includes('setVal('));
  assert.ok(!src.slice(src.indexOf('function popOut()'), f).includes('setVal('));
});

test('Status dot: the renderBadge markup has no title attribute', () => {
  const b = from('function renderBadge()', 900).split('function flash')[0];
  assert.ok(b.includes('class="badge"'));
  assert.ok(!b.includes('title='));
  assert.match(b, /aria-label=/);
});

test('Grow out of the tab: animate() with a peekClip clip-path keyframe and the spring easing', () => {
  const p = from('function popOut()', 1200);
  assert.match(p, /\.animate\(\[\{ clipPath: peekClip\(/);
  assert.ok(p.includes('cubic-bezier(.2, .9, .25, 1.15)'));
  assert.match(p, /duration: 180, delay: 90/);
});

test('Reduced motion: matchMedia is read and the animation is skipped when it matches', () => {
  assert.ok(src.includes("matchMedia('(prefers-reduced-motion: reduce)').matches"));
  const p = from('function popOut()', 1200);
  assert.ok(p.indexOf('if (reducedMotion()) return;') > 0 && p.indexOf('if (reducedMotion()) return;') < p.indexOf('.animate('));
  assert.match(from('function fold()', 500), /if \(reducedMotion\(\)[^\n]*finish\(\)/);
});

test('Back before it folds: mouseenter reverses a running fold animation and clears the timer', () => {
  assert.match(enter(), /clearTimeout\(foldT\)/);
  assert.match(enter(), /if \(foldAnim\)[^\n]*\.reverse\(\)/);
});

test('Hover pops out: a collapsed panel still shows the full window while peeking', () => {
  assert.match(src, /#ghl-panel\.is-min:not\(\.peeking\) \.row:not\(:first-child\)/);
  assert.match(src, /#ghl-panel\.is-min:not\(\.peeking\) \{ width: auto !important/);
  assert.ok(!/#ghl-panel\.is-min (\.|\{)/.test(src));
});
