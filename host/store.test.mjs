import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPattern, mergedGlossary, storeTerms, applyCorrections, glossaryForRun, defineWith, readJson, writeJson } from './store.mjs';
import { selectKey } from './rules.mjs';

const REPO = 'octo-org/widgets';
const PAGE = `${REPO}:pr-7`;
const META = { origin: PAGE, definedAt: '2026-01-01T00:00:00.000Z', ref: 'abc', model: 'sonnet/medium', spec: 3 };
// Glossary files of two repositories of one owner, in a fresh folder.
function fresh() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-store-'));
  const org = path.join(base, 'octo-org', '@org', 'glossary.json');
  return { widgets: { repo: path.join(base, 'octo-org', 'widgets', 'glossary.json'), org }, gadgets: { repo: path.join(base, 'octo-org', 'gadgets', 'glossary.json'), org } };
}
const term = (id, o = {}) => ({ id, term: id, category: 'domain', layer: 'repo', pattern: `\\b${id}\\b`, code: false, def: `What ${id} is.`, verified: false, ...o });
const ids = (f) => readJson(f, { terms: [] }).terms.map((t) => t.id).sort();
const shown = (files, id) => mergedGlossary(files).find((t) => t.id === id);
const quiet = () => {};

test('Pattern checks: forms that can take exponential time are refused, the usual term forms are not', () => {
  for (const p of ['(?:a+)+', '(?:a|ab)*', '(?:\\w+\\s?){2,}', '\\b(?:x)\\1', 'a'.repeat(501)]) assert.ok(checkPattern(p), p);
  for (const p of ['\\bOry Hydra\\b|\\bHydra\\b', '\\b(?:AIVO )?Control Plane\\b', '\\bfoo\\(\\)+', '[()+]+x', '\\b\\w+Store\\b']) assert.equal(checkPattern(p), null, p);
});

test('A stored pattern that fails the check never reaches a page', () => {
  const { widgets } = fresh();
  writeJson(widgets.repo, { repo: REPO, terms: [term('ok'), term('slow', { pattern: '\\b(?:a+)+b' })] });
  assert.deepEqual(mergedGlossary(widgets).map((t) => t.id), ['ok']);
});

test('A glossary that does not parse is an error and stays on disk as it was', async () => {
  const { widgets } = fresh();
  writeJson(widgets.repo, { repo: REPO, terms: [term('relay')] });
  const broken = fs.readFileSync(widgets.repo, 'utf8').replace('"relay",', '"relay"');
  fs.writeFileSync(widgets.repo, broken);
  assert.throws(() => mergedGlossary(widgets), /not valid JSON/);
  await assert.rejects(defineWith(widgets, { repo: REPO, origin: PAGE }, async () => ({ out: { terms: [term('new')] }, meta: META })), /not valid JSON/);
  assert.throws(() => storeTerms(widgets, REPO, [term('new')], META, quiet), /not valid JSON/);
  assert.equal(fs.readFileSync(widgets.repo, 'utf8'), broken, 'the hand-edited file is untouched');
  assert.equal(readJson(path.join(path.dirname(widgets.repo), 'missing.json'), 'default'), 'default', 'a missing file is still the default');
});

test('Writes leave no temporary file behind', () => {
  const { widgets } = fresh();
  writeJson(widgets.repo, { a: 1 }); writeJson(widgets.repo, { a: 2 });
  assert.deepEqual(readJson(widgets.repo), { a: 2 });
  assert.deepEqual(fs.readdirSync(path.dirname(widgets.repo)), ['glossary.json']);
});

test('Pattern checks: an invalid regex, a capturing group and an empty match are refused, nothing else', () => {
  assert.match(checkPattern('\\b(foo'), /invalid regex/);
  assert.equal(checkPattern('\\b(foo|bar)\\b'), 'has a capturing group');
  assert.equal(checkPattern('a*'), 'matches the empty string');
  assert.equal(checkPattern('\\b(?:foo|bar)s?\\b'), null);
  assert.equal(checkPattern('cp'), null, 'specificity is not checked by the host');
});

test('A term with a bad pattern is dropped and logged; the rest are saved with what the host adds', () => {
  const { widgets } = fresh(); const logged = [];
  const saved = storeTerms(widgets, REPO, [term('relay'), term('bad', { pattern: '(x)' })], META, (s) => logged.push(s));
  assert.deepEqual(saved, ['relay']);
  assert.match(logged.join('\n'), /dropped term bad: has a capturing group/);
  const t = shown(widgets, 'relay');
  assert.equal(t.origin, PAGE); assert.equal(t.spec, 3); assert.equal(t.ref, 'abc'); assert.equal(t.layer, 'repo');
});

test('A term without where is saved', () => {
  const { widgets } = fresh();
  assert.deepEqual(storeTerms(widgets, REPO, [term('storeTerms', { category: 'code', code: true })], META, quiet), ['storeTerms']);
});

test('Redefined in the same layer: the new term replaces the old one', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay', { def: 'old' })], META, quiet);
  storeTerms(widgets, REPO, [term('relay', { def: 'new' })], META, quiet);
  assert.deepEqual(ids(widgets.repo), ['relay']);
  assert.equal(shown(widgets, 'relay').def, 'new');
});

test('Redefined in the other layer: an owner term removes the copy in the run\'s repository', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay', { def: 'repo meaning' })], META, quiet);
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet);
  assert.deepEqual(ids(widgets.repo), []);
  assert.equal(shown(widgets, 'relay').def, 'owner meaning');
  assert.equal(shown(widgets, 'relay').layer, 'org');
});

test('Another repository holds the id: its term is unchanged and still the one shown there', () => {
  const { widgets, gadgets } = fresh();
  storeTerms(gadgets, 'octo-org/gadgets', [term('relay', { def: 'gadgets meaning' })], META, quiet);
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet);
  assert.equal(shown(gadgets, 'relay').def, 'gadgets meaning');
  assert.equal(shown(widgets, 'relay').def, 'owner meaning');
});

test('Repository term over an owner term: both exist and the repository\'s is shown', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet);
  storeTerms(widgets, REPO, [term('relay', { def: 'repo meaning' })], META, quiet);
  assert.deepEqual(ids(widgets.org), ['relay']); assert.deepEqual(ids(widgets.repo), ['relay']);
  assert.equal(shown(widgets, 'relay').def, 'repo meaning');
});

test('Corrections: the repository layer first, then the owner layer; origin kept; unknown ids ignored', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay'), term('hub', { layer: 'org' })], META, quiet);
  const later = { ...META, origin: `${REPO}:issue-1`, definedAt: '2026-02-02T00:00:00.000Z', model: 'opus/high' };
  const n = applyCorrections(widgets, [
    { id: 'relay', def: 'fixed', reason: 'out of date' },
    { id: 'hub', pattern: '\\bhubs?\\b', reason: 'missed the plural' },
    { id: 'nowhere', def: 'x', reason: 'no such term' },
    { id: 'relay', pattern: '(bad)', reason: 'bad pattern' },
  ], later, quiet);
  assert.equal(n, 2);
  const r = shown(widgets, 'relay');
  assert.equal(r.def, 'fixed'); assert.equal(r.origin, PAGE); assert.equal(r.revisionReason, 'out of date'); assert.equal(r.revisedAt, later.definedAt);
  assert.equal(shown(widgets, 'hub').pattern, '\\bhubs?\\b');
});

// A page with two of its own terms (one in each layer), one the reader selected, and one from another page.
function seeded() {
  const files = fresh().widgets;
  storeTerms(files, REPO, [term('relay', { def: 'old relay' }), term('hub', { layer: 'org', def: 'old hub' })], META, quiet);
  storeTerms(files, REPO, [term('cache')], { ...META, selected: true }, quiet);
  storeTerms(files, REPO, [term('other')], { ...META, origin: `${REPO}:readme` }, quiet);
  return files;
}
const snapshot = (files) => [fs.readFileSync(files.repo, 'utf8'), fs.readFileSync(files.org, 'utf8')];

test('A regenerating run is handed the glossary without the page\'s own terms, selected ones kept', () => {
  const files = seeded();
  const got = glossaryForRun(files, { regenerateOrigin: PAGE }).map((t) => t.id).sort();
  assert.deepEqual(got, ['cache', 'other']);
  assert.deepEqual(glossaryForRun(files).map((t) => t.id).sort(), ['cache', 'hub', 'other', 'relay'], 'an ordinary run sees everything');
  assert.deepEqual(Object.keys(glossaryForRun(files)[0]).sort(), ['id', 'layer', 'pattern', 'term']);
  assert.ok('def' in glossaryForRun(files, { full: true })[0], 'Thorough gets definitions');
});

test('Regenerate succeeds: the page\'s earlier terms are removed and the run\'s terms replace them', async () => {
  const files = seeded(); let during;
  const r = await defineWith(files, { repo: REPO, origin: PAGE, regenerate: true }, async (glossary) => {
    during = [glossary.map((t) => t.id).sort(), snapshot(files)];
    return { out: { terms: [term('relay', { def: 'new relay' }), term('spoke')] }, meta: { ...META, definedAt: '2026-03-03T00:00:00.000Z' } };
  });
  assert.deepEqual(during[0], ['cache', 'other']);
  assert.equal(r.removed, 2);
  assert.deepEqual(ids(files.repo), ['cache', 'other', 'relay', 'spoke']);
  assert.deepEqual(ids(files.org), [], 'the page\'s owner-layer term went too');
  assert.equal(shown(files, 'relay').def, 'new relay');
});

test('Terms are shown during the run: nothing on disk changes before the run returns', async () => {
  const files = seeded(); const before = snapshot(files); let during;
  await defineWith(files, { repo: REPO, origin: PAGE, regenerate: true }, async () => { during = snapshot(files); return { out: { terms: [] }, meta: META }; });
  assert.deepEqual(during, before);
});

test('Regenerate fails: the page\'s earlier terms are still stored', async () => {
  const files = seeded(); const before = snapshot(files);
  await assert.rejects(defineWith(files, { repo: REPO, origin: PAGE, regenerate: true }, async () => { throw new Error('claude returned no result'); }));
  assert.deepEqual(snapshot(files), before);
  assert.equal(shown(files, 'relay').def, 'old relay');
});

test('Selected term on the page: kept unchanged by Regenerate', async () => {
  const files = seeded(); const cache = shown(files, 'cache');
  await defineWith(files, { repo: REPO, origin: PAGE, regenerate: true }, async () => ({ out: { terms: [term('spoke')] }, meta: META }));
  assert.deepEqual(shown(files, 'cache'), cache);
  assert.equal(cache.selected, true);
});

test('Without Regenerate nothing is removed, and corrections are applied', async () => {
  const files = seeded();
  const r = await defineWith(files, { repo: REPO, origin: PAGE, full: true }, async () => ({ out: { terms: [term('spoke')], corrections: [{ id: 'other', def: 'fixed', reason: 'wrong' }] }, meta: META }));
  assert.equal(r.removed, 0); assert.equal(r.corrected, 1);
  assert.deepEqual(ids(files.repo), ['cache', 'other', 'relay', 'spoke']);
  assert.deepEqual(ids(files.org), ['hub']);
});

test('Select runs are keyed by the whole text: a shared start gives two keys, the same text one', () => {
  const start = 'x'.repeat(40);
  assert.notEqual(selectKey(REPO, 'pr-7', `${start} one`), selectKey(REPO, 'pr-7', `${start} two`));
  assert.equal(selectKey(REPO, 'pr-7', 'control plane'), selectKey(REPO, 'pr-7', 'control plane'));
  assert.notEqual(selectKey(REPO, 'pr-7', 'control plane'), selectKey(REPO, 'pr-8', 'control plane'));
  assert.match(selectKey(REPO, 'pr-7', 'a/b c'), /^octo-org\/widgets#pr-7#select#[0-9a-f]{16}$/);
});

test('A run on one repository cannot rewrite owner terms another repository defined, unless the owner is allowed', async () => {
  const { widgets, gadgets } = fresh();
  const WMETA = { ...META, origin: 'octo-org/widgets:pr-1' };
  storeTerms(widgets, REPO, [term('relay', { layer: 'org' }), term('broker', { layer: 'org', selected: true })], WMETA, quiet);
  const evil = { ...META, origin: 'octo-org/gadgets:pr-9' }, logged = [];
  await defineWith(gadgets, { repo: 'octo-org/gadgets', origin: evil.origin, log: (s) => logged.push(s) }, async () => ({
    out: { terms: [term('relay', { layer: 'org', def: 'EVIL relay' })], corrections: [{ id: 'broker', def: 'EVIL broker', reason: 'x' }] }, meta: evil }));
  assert.equal(shown(widgets, 'relay').def, 'What relay is.', 'the owner term is unchanged');
  assert.equal(shown(widgets, 'broker').def, 'What broker is.', 'the correction is dropped');
  assert.equal(shown(gadgets, 'relay').def, 'EVIL relay', 'the run\'s own repository gets its definition');
  assert.equal(shown(gadgets, 'relay').layer, 'repo');
  assert.match(logged.join('\n'), /saved relay in the repository glossary/);
  assert.match(logged.join('\n'), /dropped correction broker/);
  await defineWith(gadgets, { repo: 'octo-org/gadgets', origin: evil.origin, ownerAllowed: true, log: quiet }, async () => ({
    out: { terms: [], corrections: [{ id: 'broker', def: 'Better broker', reason: 'x' }] }, meta: evil }));
  assert.equal(shown(widgets, 'broker').def, 'Better broker', 'with the owner allowed, corrections apply');
});
