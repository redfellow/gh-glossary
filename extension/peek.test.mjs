import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8');
const a = src.indexOf('// @ghl-test begin peek'), b = src.indexOf('// @ghl-test end peek');
assert.ok(a >= 0 && b > a, 'markers for peek');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(src.slice(a, b) + '\nthis.h = { peekStep, foldDue, isTabClick, peekRect, peekClip };', ctx);
const { peekStep, foldDue, isTabClick, peekRect, peekClip } = ctx.h;
const plain = (v) => JSON.parse(JSON.stringify(v));
const idle = { peek: false, pointer: false, focus: false, enteredAt: 0 };

test('Hover pops out: enter makes peek true and records the time', () => {
  const s = peekStep(idle, 'enter', 1234);
  assert.equal(s.peek, true);
  assert.equal(s.pointer, true);
  assert.equal(s.enteredAt, 1234);
  assert.equal(idle.peek, false, 'returns a new object');
});

test('Leaving folds it back: after enter then leave the fold is due', () => {
  const s = peekStep(peekStep(idle, 'enter', 1), 'leave', 2);
  assert.equal(foldDue(s), true);
});

test('Back before it folds: enter, leave, enter is not due', () => {
  let s = peekStep(idle, 'enter', 1);
  s = peekStep(s, 'leave', 2);
  s = peekStep(s, 'enter', 3);
  assert.equal(foldDue(s), false);
});

test('Typing keeps it open: focus in, pointer away is not due until focusout', () => {
  let s = peekStep(idle, 'enter', 1);
  s = peekStep(s, 'focusin', 2);
  s = peekStep(s, 'leave', 3);
  assert.equal(foldDue(s), false);
  s = peekStep(s, 'focusout', 4);
  assert.equal(foldDue(s), true);
  assert.deepEqual(plain(peekStep(s, 'reset', 5)), idle);
});

test('Fits on the screen: the window is moved up and flush to the edge', () => {
  assert.equal(peekRect({ side: 'right', top: 900 }, 340, 400, 1000, 1000).top, 592);
  assert.equal(peekRect({ side: 'left', top: 100 }, 340, 400, 1500, 1000).left, 0);
  const r = peekRect({ side: 'right', top: 100 }, 340, 400, 1500, 1000);
  assert.equal(r.left, 1500 - r.width);
  assert.equal(r.top, 100);
  assert.equal(peekRect({ side: 'right', top: 20 }, 340, 2000, 1500, 1000).top, 8);
  assert.equal(peekRect({ side: 'right', top: 0 }, 340, 300, 1500, 1000).top, 0);
  assert.equal(peekRect({ side: 'right', top: 5 }, 340, 2000, 1500, 1000).top, 5);
  assert.equal(peekRect({ side: 'right', top: 0 }, 340, 300, 300, 1000).width, 284);
});

test('Press right after arriving: a press within 0.4 s is a tab click', () => {
  assert.equal(isTabClick(1000, 1200), true);
  assert.equal(isTabClick(1000, 1500), false);
});

test('Grow out of the tab: the clip exposes only the tab inside the window', () => {
  const tab = { left: 314, top: 0, width: 26, height: 90 };
  const win = { left: 0, top: 0, width: 340, height: 300 };
  assert.equal(peekClip(tab, win), 'inset(0px 0px 210px 314px round 8px)');
});
