import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8');
const a = src.indexOf('// @ghl-test begin dock'), b = src.indexOf('// @ghl-test end dock');
assert.ok(a >= 0 && b > a, 'markers for dock');

function load(initial = {}) {
  const store = { ...initial };
  const writes = [];
  const get = (k, d) => (k in store ? store[k] : d);
  const set = (k, v) => { store[k] = v; writes.push(k); };
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + '\nthis.startDock = startDock;', ctx);
  return { start: () => ctx.startDock(get, set), store, writes };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test('Fresh install: starts as the right tab at 72 and stores it', () => {
  const t = load();
  assert.deepEqual(plain(t.start()), { side: 'right', top: 72 });
  assert.deepEqual(plain(t.store.dock), { side: 'right', top: 72 });
});

test('Existing install with the panel open: docked right at 72', () => {
  const t = load({ dock: null });
  assert.deepEqual(plain(t.start()), { side: 'right', top: 72 });
});

test('Existing dock is kept: a left dock is returned unchanged', () => {
  const t = load({ dock: { side: 'left', top: 200 } });
  assert.deepEqual(plain(t.start()), { side: 'left', top: 200 });
  assert.deepEqual(plain(t.store.dock), { side: 'left', top: 200 });
});

test('Opened panel stays open: dockInit set and dock null returns null, stores nothing', () => {
  const t = load({ dockInit: true, dock: null });
  assert.equal(t.start(), null);
  assert.deepEqual(t.writes, []);
});

test('Flag is stored so a second call changes nothing', () => {
  const t = load();
  t.start();
  assert.equal(t.store.dockInit, true);
  t.store.dock = null; // the user opened the panel
  const before = t.writes.length;
  assert.equal(t.start(), null);
  assert.equal(t.writes.length, before);
});

test('Open from the starting tab: dock is initialised by startDock and opening is stored', () => {
  assert.ok(src.includes('let dock = startDock(getVal, setVal);'));
  assert.ok(!src.includes("let dock = getVal('dock', null)"));
  const fn = src.slice(src.indexOf('function setDock(d) {'));
  assert.match(fn.slice(0, fn.indexOf('}')), /dock = d; setVal\('dock', d\);/);
});

const clickHandler = () => {
  const i = src.indexOf("if (e.target.closest('[data-dock]'))");
  assert.ok(i >= 0, 'data-dock handler');
  return src.slice(i, src.indexOf("if (e.target.closest('[data-min]'))", i));
};

test('Dock by button: a Docked switch with data-dock replaces the ⇥ button', () => {
  assert.match(src, /<button class="ghl-sw docked" role="switch"[^>]*data-dock[^>]*><i><\/i>Docked<\/button>/);
  assert.ok(!src.includes('⇥'));
});

test('Pin the popped-out window: the handler stores panelPos and calls setDock(null) when peeking', () => {
  const h = clickHandler();
  const p = h.indexOf('if (peek)');
  assert.ok(p >= 0);
  const peeking = h.slice(p, h.indexOf('dockAt('));
  assert.match(peeking, /setVal\('panelPos'/);
  assert.match(peeking, /setDock\(null\)/);
});

test('Switch on docks: otherwise the handler still calls dockAt(', () => {
  assert.match(clickHandler(), /dockAt\(r\.left \+ r\.width \/ 2, r\.top\)/);
});
