// The matcher in shared.js, run against plain strings.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = { location: { pathname: '/' } };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL('./shared.js', import.meta.url), 'utf8'), ctx);
const { matcher, esc } = ctx.ghl;
const term = (id, pattern, code = false) => ({ id, term: id, pattern, code });
const ids = (hits) => JSON.parse(JSON.stringify(hits.map((h) => h.id))); // arrays from the vm context are another realm's

test('Code terms match case-sensitively, prose terms ignoring case and only when asked', () => {
  const m = matcher([term('CP', '\\bCP\\b', true), term('relay', '\\brelays?\\b')]);
  assert.deepEqual(ids(m.hits('the CP and the Relays', true)), ['CP', 'relay']);
  assert.deepEqual(ids(m.hits('the cp and the relay', false)), []);
  assert.deepEqual(ids(m.hits('the CP and the relay', false)), ['CP']);
});

test('Hits do not overlap and code terms win', () => {
  const m = matcher([term('routeKey', '\\brouteKey\\b', true), term('route-key', '\\broute ?key\\b')]);
  assert.deepEqual(JSON.parse(JSON.stringify(m.hits('use routeKey here', true).map((h) => [h.id, h.s, h.e]))), [['routeKey', 4, 12]]);
});

test('A term that matches an empty string is left out, and every other term still matches', () => {
  const m = matcher([term('empty', '\\b'), term('relay', 'relay')]);
  assert.deepEqual(ids(m.hits('The relay sends', true)), ['relay']);
  assert.equal(m.count, 1);
});

test('termFor finds the term whose pattern matches the whole text; byId has no prototype', () => {
  const m = matcher([term('relay', '\\brelays?\\b'), term('CP', '\\bCP\\b', true)]);
  assert.equal(m.termFor('Relays').id, 'relay');
  assert.equal(m.termFor('cp'), undefined);
  assert.equal(m.byId.constructor, undefined);
  assert.equal(m.byId.__proto__, undefined);
});

test('An invalid pattern does not stop the others', () => {
  const m = matcher([term('bad', '(?'), term('relay', 'relay')]);
  assert.deepEqual(ids(m.hits('relay', true)), ['relay']);
  assert.equal(m.count, 1);
});

test('esc escapes the characters that matter in HTML text and attributes', () => {
  assert.equal(esc('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});
