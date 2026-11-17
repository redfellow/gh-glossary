// Checks on the content script's source for rules that are easy to break and hard to see in use.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8');
const from = (marker, len = 900) => { const i = src.indexOf(marker); assert.ok(i >= 0, marker); return src.slice(i, i + len); };

test('A hidden panel is not shown, whatever other panel rules say', () => {
  const rules = [...src.matchAll(/^\s*(#ghl-panel(?:\.[\w-]+|:not\([^)]*\)|\[[\w-]+\])*)\s*\{([^}]*)\}/gm)]
    .map(([, sel, body]) => ({ sel, display: body.match(/(?:^|;)\s*display:\s*([^;]+)/)?.[1].trim() }))
    .filter((r) => r.display);
  const hidden = rules.filter((r) => r.sel === '#ghl-panel[hidden]');
  assert.equal(hidden.length, 1);
  assert.equal(hidden[0].display, 'none !important');
  for (const r of rules.filter((x) => x.sel !== '#ghl-panel[hidden]')) assert.doesNotMatch(r.display, /!important/, r.sel);
});

test('A hidden panel is not sized by window resizes, and is sized again when shown', () => {
  assert.match(from('function applyGeometry()', 200), /if \(panel\.hidden\) \{ delete panel\.dataset\.geo; return; \}/);
  assert.match(from('function renderPanel()', 600), /if \(!panel\.dataset\.geo \|\|[^\n]*applyGeometry\(\)/);
});

test('Only a real click adds to the allowlist: the allow handler checks isTrusted before calling the host', () => {
  const h = from("allowBox.addEventListener('click'", 700);
  assert.ok(h.indexOf('if (!e.isTrusted) return;') > 0);
  assert.ok(h.indexOf('if (!e.isTrusted) return;') < h.indexOf("'/api/allow'"));
});

test('Runs ask first: Quick, Thorough and Define all go through whenAllowed', () => {
  assert.match(src, /whenAllowed\(d\.getBoundingClientRect\(\), \(\) => start\(/);
  assert.match(src, /whenAllowed\(s\.rect, \(\) => defineSelection\(s\)\)/);
  assert.equal((src.match(/'\/api\/define'/g) || []).length, 1);
  assert.equal((src.match(/'\/api\/select'/g) || []).length, 1);
});

test('Glossary text is escaped before it becomes HTML', () => {
  const pop = from('function renderPop()', 1600);
  for (const f of ['g.term', 'g.where', 'g.category', 'g.revisionReason']) assert.ok(pop.includes(`esc(${f}`), f);
  assert.ok(pop.includes('fmt(g.def)'));
  assert.match(from('function fmt(s)', 300), /let out = esc\(s\)/);
  assert.match(from('function fmt(s)', 500), /esc\(TERM\[id\]\.term\)/);
  assert.match(pop, /\/\^https:\\\/\\\/\/i\.test\(g\.link\)/, 'only https links are offered');
});

test('Send to Claude is offered on pull requests and Markdown documents only', () => {
  assert.match(src, /const canSend = \(\) => !!R && \(!!R\.pr \|\| !!docPath\(\)\);/);
  assert.match(src, /\/\\\.\(\?:md\|mdx\|markdown\)\$\/i/);
});
