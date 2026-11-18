import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPattern, slowOnProbes, mergedGlossary, storeTerms, applyCorrections, glossaryForRun, defineWith, readJson, writeJson, LIMITS } from './store.mjs';
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
const OWNER = { ownerAllowed: true }; // the reader allowed the whole owner, so runs may add owner terms

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
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet, OWNER);
  assert.deepEqual(ids(widgets.repo), []);
  assert.equal(shown(widgets, 'relay').def, 'owner meaning');
  assert.equal(shown(widgets, 'relay').layer, 'org');
});

test('Another repository holds the id: its term is unchanged and still the one shown there', () => {
  const { widgets, gadgets } = fresh();
  storeTerms(gadgets, 'octo-org/gadgets', [term('relay', { def: 'gadgets meaning' })], META, quiet);
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet, OWNER);
  assert.equal(shown(gadgets, 'relay').def, 'gadgets meaning');
  assert.equal(shown(widgets, 'relay').def, 'owner meaning');
});

test('Repository term over an owner term: both exist and the repository\'s is shown', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay', { layer: 'org', def: 'owner meaning' })], META, quiet, OWNER);
  storeTerms(widgets, REPO, [term('relay', { def: 'repo meaning' })], META, quiet);
  assert.deepEqual(ids(widgets.org), ['relay']); assert.deepEqual(ids(widgets.repo), ['relay']);
  assert.equal(shown(widgets, 'relay').def, 'repo meaning');
});

test('Corrections: the repository layer first, then the owner layer; origin kept; unknown ids ignored', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay'), term('hub', { layer: 'org' })], META, quiet, OWNER);
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
  storeTerms(files, REPO, [term('relay', { def: 'old relay' }), term('hub', { layer: 'org', def: 'old hub' })], META, quiet, OWNER);
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
  assert.ok('def' in glossaryForRun(files, { full: true, repo: REPO })[0], 'Thorough gets definitions');
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
  storeTerms(widgets, REPO, [term('relay', { layer: 'org' }), term('broker', { layer: 'org', selected: true })], WMETA, quiet, OWNER);
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

test('Allowing one repository adds no owner terms: a new owner-layer term is saved in the repository', () => {
  const { widgets, gadgets } = fresh(); const logged = [];
  storeTerms(widgets, REPO, [term('relay', { layer: 'org' })], META, (s) => logged.push(s));
  assert.deepEqual(ids(widgets.org), []);
  assert.deepEqual(ids(widgets.repo), ['relay']);
  assert.equal(shown(gadgets, 'relay'), undefined, 'the owner\'s other repositories do not show it');
  assert.match(logged.join('\n'), /only allowing the whole owner adds owner terms/);
  storeTerms(widgets, REPO, [term('hub', { layer: 'org' })], META, quiet, OWNER);
  assert.equal(shown(gadgets, 'hub').layer, 'org', 'with the owner allowed it is an owner term');
  storeTerms(widgets, REPO, [term('hub', { layer: 'org', def: 'updated' })], META, quiet);
  assert.equal(shown(gadgets, 'hub').def, 'updated', 'a run may still update an owner term its own repository defined');
});

test('Pattern checks: a chain of optional parts is refused before it can freeze a page', () => {
  for (const p of ['.?'.repeat(22) + '§', '.?'.repeat(7) + 'x', '(?:a|b)'.repeat(7) + 'c', '\\w*' + '.?'.repeat(5) + 'x']) {
    const t = Date.now();
    assert.ok(checkPattern(p), p);
    assert.ok(Date.now() - t < 500, `${p} was checked quickly`);
  }
  for (const p of ['ORDER BY dist(?: ASC)?(?:,? ?LIMIT 1)?', '`?\\bconsumer`? \\+ `?producer`? scopes\\b', '\\bre-?extract(?:ion|ions|ed|ing)?\\b|\\breprocess(?:es|ed|ing)?\\b']) {
    assert.equal(checkPattern(p), null, p);
  }
});

test('Pattern checks: one stalled probe does not refuse a pattern, two in a row do', () => {
  const tries = (results) => { const seen = []; return [seen, (src) => { seen.push(src); return results.shift(); }]; };
  let [seen, probe] = tries([true, false]);
  assert.equal(slowOnProbes('\\brelay\\b', probe), false, 'a stall, then a fast run: kept');
  assert.equal(seen.length, 2);
  [seen, probe] = tries([true, true]);
  assert.equal(slowOnProbes('\\brelay\\b', probe), true, 'over the limit twice: refused');
  [seen, probe] = tries([false]);
  assert.equal(slowOnProbes('\\brelay\\b', probe), false, 'fast the first time: probed once');
  assert.equal(seen.length, 1);
  assert.equal(slowOnProbes('\\brelay\\b'), false, 'the real probe passes a plain pattern');
});

test('A run saves at most LIMITS.terms terms, and over-long fields drop the term', () => {
  const { widgets } = fresh(); const logged = [];
  const many = Array.from({ length: LIMITS.terms + 5 }, (_, i) => term(`t${i}`));
  storeTerms(widgets, REPO, many, META, (s) => logged.push(s));
  assert.equal(ids(widgets.repo).length, LIMITS.terms);
  assert.match(logged.join('\n'), /dropped 5 terms/);
  const { gadgets } = fresh();
  storeTerms(gadgets, 'octo-org/gadgets', [term('big', { def: 'x'.repeat(LIMITS.def + 1) }), term('far', { link: `https://example.com/${'a'.repeat(LIMITS.link)}` }), term('ok')], META, quiet);
  assert.deepEqual(ids(gadgets.repo), ['ok']);
});

test('Thorough is given an owner term from another repository in full only when the whole owner is allowed', () => {
  const { widgets, gadgets } = fresh();
  storeTerms(widgets, REPO, [term('hub', { layer: 'org' })], META, quiet, OWNER);
  storeTerms(gadgets, 'octo-org/gadgets', [term('local')], { ...META, origin: 'octo-org/gadgets:pr-1' }, quiet);
  const given = (o) => Object.fromEntries(glossaryForRun(gadgets, { full: true, repo: 'octo-org/gadgets', ...o }).map((t) => [t.id, t]));
  assert.deepEqual(Object.keys(given({}).hub).sort(), ['id', 'layer', 'pattern', 'term'], 'no definition from the other repository');
  assert.equal(given({}).local.def, 'What local is.', 'its own terms in full');
  assert.equal(given({ ownerAllowed: true }).hub.def, 'What hub is.');
  assert.equal(glossaryForRun(widgets, { full: true, repo: REPO }).find((t) => t.id === 'hub').def, 'What hub is.', 'the repository that defined it gets it in full');
});

test('A correction with an over-long reason or id, or none, is dropped and logged', () => {
  const { widgets } = fresh(); const logged = [];
  storeTerms(widgets, REPO, [term('relay')], META, quiet);
  const n = applyCorrections(widgets, [
    { id: 'relay', def: 'changed', reason: 'r'.repeat(LIMITS.reason + 1) },
    { id: 'x'.repeat(LIMITS.id + 1), def: 'changed', reason: 'ok' },
    { id: 'relay', def: 'changed' },
    null,
  ], META, (s) => logged.push(s));
  assert.equal(n, 0);
  assert.equal(shown(widgets, 'relay').def, 'What relay is.');
  assert.equal(logged.length, 4, 'each one is logged');
  assert.equal(applyCorrections(widgets, [{ id: 'relay', def: 'fixed', reason: 'r'.repeat(LIMITS.reason) }], META, quiet), 1, 'a reason at the limit is fine');
});

test('Only the fields the spec names are saved: a page run cannot mark its term as selected', async () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay', { selected: true, outside: true, origin: 'other/repo:pr-1', revisedAt: 'now', extra: 'y'.repeat(5000) })], META, quiet);
  const saved = readJson(widgets.repo).terms[0];
  assert.deepEqual(Object.keys(saved).sort(), ['id', 'term', 'category', 'pattern', 'code', 'def', 'verified', ...Object.keys(META)].sort());
  assert.equal(saved.origin, PAGE, 'what the host adds is the host\'s');
  await defineWith(widgets, { repo: REPO, origin: PAGE, regenerate: true }, async () => ({ out: { terms: [] }, meta: META }));
  assert.deepEqual(ids(widgets.repo), [], 'Regenerate of its page removes it');
});

test('A link is kept only on github.com under the owner, when a term is saved and when a glossary is read', () => {
  const { widgets } = fresh(); const logged = [];
  const issue = 'https://github.com/octo-org/widgets/issues/34', upper = 'https://GitHub.com/Octo-Org/gadgets/pull/2';
  storeTerms(widgets, REPO, [
    term('issue', { link: issue }), term('upper', { link: upper }), term('nolink'),
    term('site', { link: 'https://docs.attacker.example/x' }),
    term('other', { link: 'https://github.com/someone-else/notes' }),
    term('climb', { link: 'https://github.com/octo-org/../someone-else/notes' }),
    term('user', { link: 'https://octo-org@github.com/octo-org/x' }),
    term('port', { link: 'https://github.com:8443/octo-org/x' }),
    term('plain', { link: 'http://github.com/octo-org/x' }),
    term('words', { link: 'see the wiki' }),
  ], META, (s) => logged.push(s));
  const links = Object.fromEntries(readJson(widgets.repo).terms.filter((t) => t.link).map((t) => [t.id, t.link]));
  assert.deepEqual(links, { issue, upper });
  assert.equal(ids(widgets.repo).length, 10, 'the terms themselves are kept');
  assert.equal(logged.filter((s) => /without its link/.test(s)).length, 7);
  // Stored before the rule: pages get the term without its link, and the file stays as it is.
  const g = readJson(widgets.repo);
  g.terms.push({ ...g.terms[0], id: 'rfc', pattern: '\\brfc\\b', link: 'https://www.rfc-editor.org/rfc/rfc9728' });
  writeJson(widgets.repo, g);
  const before = fs.readFileSync(widgets.repo, 'utf8');
  const read = (o) => Object.fromEntries(mergedGlossary(widgets, o).map((t) => [t.id, t.link]));
  assert.equal(read({ owner: 'octo-org' }).rfc, undefined);
  assert.equal(read({ owner: 'Octo-Org' }).issue, issue);
  assert.equal(read({}).issue, undefined, 'no owner given: no link');
  assert.equal(read({ owner: 'someone-else' }).issue, undefined);
  assert.equal(fs.readFileSync(widgets.repo, 'utf8'), before);
});

// A term saved by a run on an outside page (a fork's pull request): the host adds outside: true.
const OUT = { ...META, origin: `${REPO}:pr-12`, outside: true };

test('The outside mark is the host\'s: a run can neither set it nor clear it', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('inside', { outside: true })], META, quiet);
  storeTerms(widgets, REPO, [term('fork', { outside: false })], OUT, quiet);
  assert.equal(shown(widgets, 'inside').outside, undefined);
  assert.equal(shown(widgets, 'fork').outside, true);
});

test('Limit writes: a run on an outside page replaces no other page\'s term, corrects nothing and adds no owner term', async () => {
  const { widgets } = fresh(); const logged = [];
  storeTerms(widgets, REPO, [term('relay'), term('hub', { layer: 'org' })], META, quiet, OWNER);
  const run = (out, o = {}) => defineWith(widgets, { repo: REPO, origin: OUT.origin, ownerAllowed: true, limited: true, log: (s) => logged.push(s), ...o }, async () => ({ out, meta: OUT }));
  const r = await run({
    terms: [term('relay', { def: 'theirs' }), term('hub', { def: 'theirs' }), term('shared', { layer: 'org' }), term('fresh')],
    corrections: [{ id: 'relay', def: 'theirs', reason: 'x' }],
  });
  assert.deepEqual(r.ids.sort(), ['fresh', 'shared']);
  assert.equal(r.corrected, 0);
  assert.equal(shown(widgets, 'relay').def, 'What relay is.', 'the stored term is unchanged');
  assert.equal(shown(widgets, 'hub').def, 'What hub is.', 'a repository term of the same id would have hidden the owner\'s');
  assert.deepEqual(ids(widgets.org), ['hub'], 'the owner glossary gets nothing');
  assert.equal(shown(widgets, 'shared').layer, 'repo');
  const said = logged.join('\n');
  assert.match(said, /dropped term relay: a run on an outside page does not replace the term from octo-org\/widgets:pr-7/);
  assert.match(said, /dropped term hub/); assert.match(said, /saved shared in the repository glossary/); assert.match(said, /dropped 1 corrections/);
  await run({ terms: [term('fresh', { def: 'again' })] });
  assert.equal(shown(widgets, 'fresh').def, 'again', 'the page\'s own earlier term is replaced');
  await run({ terms: [term('relay', { def: 'theirs' })], corrections: [{ id: 'hub', def: 'theirs', reason: 'x' }] }, { limited: false });
  assert.equal(shown(widgets, 'relay').def, 'theirs', 'mode off: as before');
  assert.equal(shown(widgets, 'hub').def, 'theirs');
});

test('Outside pages: a term from an outside page is given only to that page and to its runs', () => {
  const { widgets } = fresh();
  storeTerms(widgets, REPO, [term('relay'), term('hub', { layer: 'org' })], META, quiet, OWNER);
  storeTerms(widgets, REPO, [term('queue'), term('hub', { def: 'theirs' })], OUT, quiet); // saved while the mode was off
  const at = (page, mode) => Object.fromEntries(mergedGlossary(widgets, { owner: 'octo-org', page: `${REPO}:${page}`, mode }).map((t) => [t.id, t.def]));
  assert.deepEqual(at('issue-3', 'outside-pages'), { relay: 'What relay is.', hub: 'What hub is.' }, 'another page: the owner\'s hub, not the fork\'s');
  assert.deepEqual(at('pr-12', 'outside-pages'), { relay: 'What relay is.', hub: 'theirs', queue: 'What queue is.' }, 'its own page');
  for (const mode of ['off', 'limit-writes']) assert.equal(at('issue-3', mode).queue, 'What queue is.', `${mode}: given to every page`);
  const forRun = (page) => glossaryForRun(widgets, { repo: REPO, page: `${REPO}:${page}`, mode: 'outside-pages' }).map((t) => t.id).sort();
  assert.deepEqual(forRun('issue-3'), ['hub', 'relay']);
  assert.deepEqual(forRun('pr-12'), ['hub', 'queue', 'relay']);
});
