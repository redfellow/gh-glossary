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

test('Panel left open by an earlier version: the tab comes back on the right at 72, nothing stored', () => {
  const t = load({ dockInit: true, dock: null });
  assert.deepEqual(plain(t.start()), { side: 'right', top: 72 });
  assert.deepEqual(t.writes, []);
});

test('Flag is stored so a second call changes nothing', () => {
  const t = load();
  t.start();
  assert.equal(t.store.dockInit, true);
  const before = t.writes.length;
  t.start();
  assert.equal(t.writes.length, before);
});

test('The tab is set up by startDock and a drag stores the new edge and height', () => {
  assert.ok(src.includes('let dock = startDock(getVal, setVal);'));
  assert.match(src, /if \(moved\) \{ dock = \{ side: dock\.side, top: parseFloat\(tab\.style\.top\) \}; setVal\('dock', dock\); return; \}/);
});
