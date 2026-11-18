// Glossary storage rules (openspec/specs/glossary-store, and Regenerate in define-runs).
// Every function takes the two glossary files of one repository, { repo, org }, so tests can run
// them against a temporary folder. Nothing here starts a process.

import fs from 'node:fs';
import path from 'node:path';

// A missing file reads as d. A file that is there but cannot be read or parsed is an error, never d:
// the glossaries may be edited by hand, and treating a typo as an empty glossary would let the next
// save overwrite every term.
export function readJson(p, d) {
  let text;
  try { text = fs.readFileSync(p, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return d; throw e; }
  try { return JSON.parse(text); } catch (e) { throw new Error(`${p} is not valid JSON (${e.message}); fix it or move it away`); }
}
// Written to a temporary file and renamed over the old one, so a crash mid-write leaves the old file.
export function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(v, null, 2) + '\n'); fs.renameSync(tmp, p); }
  catch (e) { fs.rmSync(tmp, { force: true }); throw e; }
}

// What a pattern repeats: { groupRepeated, repeats, separated }. A repeat is *, + or {n,m} other than
// an exact {n}; ? is not one. Two repeats are separated when both are outside groups and a plain,
// unrepeated character lies between them (red\s*→\s*green), so their runs cannot overlap.
function repeatShape(src) {
  const top = []; let depth = 0, groupRepeated = false, repeats = 0, inner = false;
  const lastAt = [null]; // the last atom at each depth
  const atom = (a) => { lastAt[depth] = a; if (depth === 0) top.push(a); };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1] || '';
      let end = i + 2;
      if (/[pPu]/.test(n) && src[i + 2] === '{') end = src.indexOf('}', i) + 1 || src.length;
      atom({ kind: /[bB]/.test(n) ? 'assert' : /[dDwWsS]/.test(n) ? 'class' : 'lit', q: null });
      i = end - 1; continue;
    }
    if (c === '[') {
      let j = i + 1; if (src[j] === '^') j++; if (src[j] === ']') j++;
      while (j < src.length && src[j] !== ']') j += src[j] === '\\' ? 2 : 1;
      atom({ kind: 'class', q: null }); i = j; continue;
    }
    if (c === '(') { depth++; lastAt[depth] = null; if (src[i + 1] === '?') i += src[i + 2] === '<' ? 3 : 2; continue; }
    if (c === ')') { depth--; atom({ kind: 'group', q: null }); continue; }
    if (c === '|') { lastAt[depth] = null; if (depth === 0) top.push({ kind: 'alt', q: null }); continue; }
    if (c === '^' || c === '$') { atom({ kind: 'assert', q: null }); continue; }
    const quant = c === '*' || c === '+' ? c : c === '?' ? '?' : c === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i)) ? src.slice(i, src.indexOf('}', i) + 1) : null;
    if (quant) {
      const a = lastAt[depth];
      if (quant.startsWith('{')) i = src.indexOf('}', i);
      if (src[i + 1] === '?') i++; // lazy
      if (!a || quant === '?') continue;
      const range = /^\{(\d+),(\d+)\}$/.exec(quant);
      const exact = /^\{\d+\}$/.test(quant) || (range && range[1] === range[2]);
      if (a.kind === 'group') { groupRepeated = true; continue; }
      if (exact) continue;
      a.q = quant; repeats++; if (depth > 0) inner = true;
      continue;
    }
    atom({ kind: c === '.' ? 'class' : 'lit', q: null });
  }
  let separated = !inner;
  if (repeats === 2 && separated) {
    const idx = top.map((a, k) => (a.q ? k : -1)).filter((k) => k >= 0);
    separated = top.slice(idx[0] + 1, idx[1]).some((a) => a.kind === 'lit' && !a.q);
  }
  return { groupRepeated, repeats, separated };
}

// Strings a term pattern should never match empty in: a pattern that can (\b, (?=\w)) matches
// nothing visible and, in one combined regex, hides every term after it.
const EMPTY_PROBES = [' ', 'a', 'a b', 'Ab-c_d.e', '0 1', 'foo bar baz', 'x.y/z'];

// The only checks the host makes on a pattern. Returns the problem, or null.
// Patterns run on every page of the repository (an owner term on every page of the owner), and a
// regex cannot be stopped once it runs, so the forms that can take very long are refused: a
// repeated group such as (a+)+ or (?:a|ab)*, backreferences, more than two repeats (*, +, {n,m}),
// and two repeats whose runs can meet (\w*\w*). Term patterns never need them.
export function checkPattern(src) {
  let re;
  if (typeof src !== 'string' || src.length > 500) return 'not a string of at most 500 characters';
  try { re = new RegExp(src); } catch (e) { return `invalid regex: ${e.message}`; }
  if (/\\[1-9]|\\k</.test(src)) return 'has a backreference';
  const shape = repeatShape(src);
  if (shape.groupRepeated) return 'repeats a group with *, + or {}';
  if (shape.repeats > 2) return 'has more than two *, + or {} repeats';
  if (shape.repeats === 2 && !shape.separated) return 'has two repeats that are not separated by a plain character outside any group';
  if (new RegExp(`|${src}`).exec('').length > 1) return 'has a capturing group';
  if (re.test('')) return 'matches the empty string';
  for (const probe of EMPTY_PROBES) {
    const g = new RegExp(src, 'g'); let m;
    while ((m = g.exec(probe))) { if (!m[0]) return 'can match an empty string within text'; }
  }
  return null;
}

// Owner terms and repository terms together; the repository's meaning wins. A term whose pattern
// fails checkPattern (saved before a check was added, or edited by hand) is left out, so it never
// reaches a page.
export function mergedGlossary(files) {
  const org = readJson(files.org, { terms: [] }).terms.map((t) => ({ ...t, layer: 'org' }));
  const local = readJson(files.repo, { terms: [] }).terms.map((t) => ({ ...t, layer: 'repo' }));
  const byId = new Map(org.map((t) => [t.id, t]));
  for (const t of local) byId.set(t.id, t);
  return [...byId.values()].filter((t) => !checkPattern(t.pattern));
}

// Whether a run on repo may change an owner-layer term: one it first defined itself, or any when the
// reader allowed the whole owner. Allowing one repository does not let its runs rewrite what the
// owner's other repositories show.
const mayChangeOwnerTerm = (t, repo, ownerAllowed) => ownerAllowed || String(t?.origin || '').toLowerCase().startsWith(`${String(repo).toLowerCase()}:`);

// Saves a run's terms. An id replaces the term in its own layer; an owner-layer term also removes
// that id from this repository's glossary, so the new definition is the one shown. An owner-layer
// term the run may not write is saved in this repository's glossary instead: a new one unless the
// reader allowed the whole owner (allowing one repository must not put terms on every page of the
// owner), and an existing one that another repository defined.
export function storeTerms(files, repo, terms, meta, log, { ownerAllowed = false } = {}) {
  const current = { repo: readJson(files.repo, { terms: [] }), org: readJson(files.org, { terms: [] }) };
  const maps = { repo: new Map(current.repo.terms.map((t) => [t.id, t])), org: new Map(current.org.terms.map((t) => [t.id, t])) };
  const ids = [];
  for (const t of terms) {
    const problem = checkPattern(t.pattern);
    if (problem) { log(`dropped term ${t.id}: ${problem}`); continue; }
    let layer = t.layer === 'org' ? 'org' : 'repo';
    if (layer === 'org' && !maps.org.has(t.id) && !ownerAllowed) {
      log(`saved ${t.id} in the repository glossary: only allowing the whole owner adds owner terms`);
      layer = 'repo';
    } else if (layer === 'org' && maps.org.has(t.id) && !mayChangeOwnerTerm(maps.org.get(t.id), repo, ownerAllowed)) {
      log(`saved ${t.id} in the repository glossary: the owner term with that id came from ${maps.org.get(t.id).origin}`);
      layer = 'repo';
    }
    const { layer: _drop, ...rest } = t;
    maps[layer].set(t.id, { ...rest, ...meta });
    if (layer === 'org' && maps.repo.delete(t.id)) log(`removed the repository copy of ${t.id}: now an owner term`);
    ids.push(t.id);
  }
  const now = new Date().toISOString();
  writeJson(files.repo, { repo, updatedAt: now, terms: [...maps.repo.values()] });
  writeJson(files.org, { org: repo.split('/')[0], updatedAt: now, terms: [...maps.org.values()] });
  return ids;
}

// Thorough's corrections: replace def/pattern of an existing term in whichever layer holds it.
export function applyCorrections(files, corrections, meta, log, { ownerAllowed = false } = {}) {
  const repo = String(meta.origin || '').split(':')[0];
  let applied = 0;
  for (const c of corrections || []) {
    if (c.pattern) { const problem = checkPattern(c.pattern); if (problem) { log(`dropped correction ${c.id}: ${problem}`); continue; } }
    for (const f of [files.repo, files.org]) {
      const g = readJson(f, null); const t = g?.terms.find((x) => x.id === c.id);
      if (!t) continue;
      if (f === files.org && !mayChangeOwnerTerm(t, repo, ownerAllowed)) { log(`dropped correction ${c.id}: the owner term came from ${t.origin}`); break; }
      if (c.def) t.def = c.def;
      if (c.pattern) t.pattern = c.pattern;
      if (typeof c.code === 'boolean') t.code = c.code;
      Object.assign(t, { revisedAt: meta.definedAt, revisedBy: meta.model, revisionReason: c.reason, spec: meta.spec });
      writeJson(f, { ...g, updatedAt: new Date().toISOString() });
      applied++; log(`corrected ${c.id}: ${c.reason}`);
      break;
    }
  }
  return applied;
}

// What Regenerate replaces: the terms first defined from this page, except those the reader asked
// for by selection.
export const replacedByRegenerate = (t, origin) => t.origin === origin && !t.selected;

export function dropPageTerms(files, origin) {
  let removed = 0;
  for (const f of [files.repo, files.org]) {
    const g = readJson(f, null); if (!g) continue;
    const kept = g.terms.filter((t) => !replacedByRegenerate(t, origin));
    removed += g.terms.length - kept.length;
    writeJson(f, { ...g, updatedAt: new Date().toISOString(), terms: kept });
  }
  return removed;
}

// Glossary handed to a run: Quick and Select only need what exists; Thorough also checks definitions.
// A regenerating run does not see the terms it will replace, so it defines them afresh.
export function glossaryForRun(files, { full = false, regenerateOrigin = null } = {}) {
  return mergedGlossary(files)
    .filter((t) => !regenerateOrigin || !replacedByRegenerate(t, regenerateOrigin))
    .map((t) => full
      ? { id: t.id, term: t.term, layer: t.layer, category: t.category, pattern: t.pattern, code: t.code, def: t.def, where: t.where }
      : { id: t.id, term: t.term, layer: t.layer, pattern: t.pattern });
}

// One page run against the store. run(glossary) does the work and resolves to { out, meta }.
// Nothing on disk changes until it resolves: if it rejects, the stored terms are as they were.
export async function defineWith(files, { repo, origin, full = false, regenerate = false, ownerAllowed = false, log = () => {} }, run) {
  const glossary = glossaryForRun(files, { full, regenerateOrigin: regenerate ? origin : null });
  const { out, meta } = await run(glossary);
  const removed = regenerate ? dropPageTerms(files, origin) : 0;
  if (regenerate) log(`regenerate: replaced ${removed} terms from ${origin}`);
  const ids = storeTerms(files, repo, out.terms || [], meta, log, { ownerAllowed });
  const corrected = applyCorrections(files, out.corrections, meta, log, { ownerAllowed });
  return { ids, corrected, removed, meta };
}
