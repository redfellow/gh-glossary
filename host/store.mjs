// Glossary storage rules (openspec/specs/glossary-store, and Regenerate in define-runs).
// Every function takes the two glossary files of one repository, { repo, org }, so tests can run
// them against a temporary folder. Nothing here starts a process.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

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

// What a pattern repeats: { groupRepeated, repeats, separated, choices }. A repeat is *, + or {n,m}
// other than an exact {n}; ? is not one. Two repeats are separated when both are outside groups and a
// plain, unrepeated character lies between them (red\s*→\s*green), so their runs cannot overlap.
// choices is the most choice points in one top-level alternative: each ? and each group with | in it.
// A failing match can try every combination of them, so twenty .? in a row take seconds.
function repeatShape(src) {
  const top = []; let depth = 0, groupRepeated = false, repeats = 0, inner = false;
  let choices = 0, maxChoices = 0; const alts = [];
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
    if (c === '(') { depth++; lastAt[depth] = null; alts.push(false); if (src[i + 1] === '?') i += src[i + 2] === '<' ? 3 : 2; continue; }
    if (c === ')') { depth--; if (alts.pop()) choices++; atom({ kind: 'group', q: null }); continue; }
    if (c === '|') {
      lastAt[depth] = null;
      if (depth === 0) { top.push({ kind: 'alt', q: null }); maxChoices = Math.max(maxChoices, choices); choices = 0; }
      else alts[alts.length - 1] = true;
      continue;
    }
    if (c === '^' || c === '$') { atom({ kind: 'assert', q: null }); continue; }
    const quant = c === '*' || c === '+' ? c : c === '?' ? '?' : c === '{' && /^\{\d+(,\d*)?\}/.test(src.slice(i)) ? src.slice(i, src.indexOf('}', i) + 1) : null;
    if (quant) {
      const a = lastAt[depth];
      if (quant.startsWith('{')) i = src.indexOf('}', i);
      if (src[i + 1] === '?') i++; // lazy
      if (a && (quant === '?' || /^\{0,1\}$/.test(quant))) choices++;
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
  return { groupRepeated, repeats, separated, choices: Math.max(maxChoices, choices) };
}

// Runs the pattern on text made of its own characters, which is where a slow pattern is slowest,
// with a time limit. A pattern that passes the shape rules but still takes long is refused.
const PROBE_MS = 50;
function slowOnProbes(src) {
  const chars = [...new Set(src.replace(/\\[pPu]\{[^}]*\}|\\./g, ' ').replace(/[()[\]{}|*+?^$\\]/g, ''))].join('') || 'a';
  const probes = [chars.repeat(Math.ceil(90 / chars.length)).slice(0, 90), 'a'.repeat(90), `${'a '.repeat(45)}`, `${chars.repeat(40).slice(0, 89)}\u00a7`];
  try {
    vm.runInNewContext('for (const p of probes) new RegExp(src).exec(p)', { probes, src }, { timeout: PROBE_MS });
    return false;
  } catch { return true; }
}

// Strings a term pattern should never match empty in: a pattern that can (\b, (?=\w)) matches
// nothing visible and, in one combined regex, hides every term after it.
const EMPTY_PROBES = [' ', 'a', 'a b', 'Ab-c_d.e', '0 1', 'foo bar baz', 'x.y/z'];

// The only checks the host makes on a pattern. Returns the problem, or null.
// Patterns run on every page of the repository (an owner term on every page of the owner), and a
// regex cannot be stopped once it runs, so the forms that can take very long are refused: a
// repeated group such as (a+)+ or (?:a|ab)*, backreferences, more than two repeats (*, +, {n,m}),
// two repeats whose runs can meet (\w*\w*), more than six ? or alternative groups in one alternative
// (four next to a repeat), and anything that still takes over 50 ms on a short text made of its own
// characters. Term patterns never need them.
const checked = new Map(); // pattern -> problem, since every page read checks every stored pattern
export function checkPattern(src) {
  if (typeof src === 'string' && checked.has(src)) return checked.get(src);
  const problem = patternProblem(src);
  if (typeof src === 'string') { if (checked.size > 20000) checked.clear(); checked.set(src, problem); }
  return problem;
}
function patternProblem(src) {
  let re;
  if (typeof src !== 'string' || src.length > 500) return 'not a string of at most 500 characters';
  try { re = new RegExp(src); } catch (e) { return `invalid regex: ${e.message}`; }
  if (/\\[1-9]|\\k</.test(src)) return 'has a backreference';
  const shape = repeatShape(src);
  if (shape.groupRepeated) return 'repeats a group with *, + or {}';
  if (shape.repeats > 2) return 'has more than two *, + or {} repeats';
  if (shape.repeats === 2 && !shape.separated) return 'has two repeats that are not separated by a plain character outside any group';
  if (shape.choices > (shape.repeats ? 4 : 6)) return `has ${shape.choices} optional parts or alternative groups in one alternative (at most ${shape.repeats ? 4 : 6}${shape.repeats ? ' with a *, + or {} repeat' : ''})`;
  if (new RegExp(`|${src}`).exec('').length > 1) return 'has a capturing group';
  if (re.test('')) return 'matches the empty string';
  for (const probe of EMPTY_PROBES) {
    const g = new RegExp(src, 'g'); let m;
    while ((m = g.exec(probe))) { if (!m[0]) return 'can match an empty string within text'; }
  }
  if (slowOnProbes(src)) return `takes over ${PROBE_MS} ms on a short text`;
  return null;
}

// A term's link may only point into GitHub under the repository's owner: a run can be
// prompt-injected, and a link is the one thing it writes that a click sends somewhere else.
// Returns the problem, or null.
export function linkProblem(link, owner) {
  if (!owner) return 'the owner it must be under is not known';
  let u; try { u = new URL(link); } catch { return 'not an address'; }
  if (u.protocol !== 'https:' || u.host !== 'github.com' || u.username || u.password) return 'not an https address on github.com';
  return (u.pathname.split('/')[1] || '').toLowerCase() === String(owner).toLowerCase() ? null : `not under github.com/${owner}`;
}

// Owner terms and repository terms together; the repository's meaning wins. A term whose pattern
// fails checkPattern (saved before a check was added, or edited by hand) is left out, so it never
// reaches a page, and so is a link that fails linkProblem. In the outside-pages mode a term from an
// outside page is given only to that page (page is its origin, "owner/repo:page").
export function mergedGlossary(files, { owner = null, page = null, mode = 'off' } = {}) {
  const here = (t) => mode !== 'outside-pages' || !t.outside || t.origin === page;
  const org = readJson(files.org, { terms: [] }).terms.filter(here).map((t) => ({ ...t, layer: 'org' }));
  const local = readJson(files.repo, { terms: [] }).terms.filter(here).map((t) => ({ ...t, layer: 'repo' }));
  const byId = new Map(org.map((t) => [t.id, t]));
  for (const t of local) byId.set(t.id, t);
  return [...byId.values()].filter((t) => !checkPattern(t.pattern)).map((t) => {
    if (t.link === undefined || !linkProblem(t.link, owner)) return t;
    const { link: _left, ...rest } = t;
    return rest;
  });
}

// Whether a run on repo may change an owner-layer term: one it first defined itself, or any when the
// reader allowed the whole owner. Allowing one repository does not let its runs rewrite what the
// owner's other repositories show.
const mayChangeOwnerTerm = (t, repo, ownerAllowed) => ownerAllowed || String(t?.origin || '').toLowerCase().startsWith(`${String(repo).toLowerCase()}:`);

// What one run may save. A run can be prompt-injected, and its terms go to every page of the
// repository (or the owner): the number of terms and the size of each field are capped, and only the
// fields the term-definition spec names are kept (a run that returned selected: true would otherwise
// have its term survive Regenerate).
export const LIMITS = { terms: 200, id: 100, term: 200, def: 4000, where: 500, link: 500, reason: 300 };
const TERM_FIELDS = ['id', 'term', 'category', 'pattern', 'code', 'def', 'verified', 'where', 'link'];
export function termProblem(t) {
  if (!t || typeof t !== 'object') return 'not an object';
  for (const k of ['id', 'term', 'def']) if (typeof t[k] !== 'string' || !t[k]) return `${k} is missing`;
  for (const k of ['id', 'term', 'def', 'where', 'link']) {
    if (t[k] !== undefined && (typeof t[k] !== 'string' || t[k].length > LIMITS[k])) return `${k} is longer than ${LIMITS[k]} characters`;
  }
  return checkPattern(t.pattern);
}

// Saves a run's terms. An id replaces the term in its own layer; an owner-layer term also removes
// that id from this repository's glossary, so the new definition is the one shown. An owner-layer
// term the run may not write is saved in this repository's glossary instead: a new one unless the
// reader allowed the whole owner (allowing one repository must not put terms on every page of the
// owner), and an existing one that another repository defined.
// limited: the run was on an outside page and the reader limits those. It then replaces no term
// first defined from another page, in either layer, and writes only the repository's glossary.
export function storeTerms(files, repo, terms, meta, log, { ownerAllowed = false, limited = false } = {}) {
  const owner = repo.split('/')[0];
  const current = { repo: readJson(files.repo, { terms: [] }), org: readJson(files.org, { terms: [] }) };
  const maps = { repo: new Map(current.repo.terms.map((t) => [t.id, t])), org: new Map(current.org.terms.map((t) => [t.id, t])) };
  const ids = [];
  if (terms.length > LIMITS.terms) { log(`dropped ${terms.length - LIMITS.terms} terms: a run saves at most ${LIMITS.terms}`); terms = terms.slice(0, LIMITS.terms); }
  for (const t of terms) {
    const problem = termProblem(t);
    if (problem) { log(`dropped term ${String(t?.id).slice(0, 100)}: ${problem}`); continue; }
    let layer = t.layer === 'org' ? 'org' : 'repo';
    if (limited) {
      const prior = maps.repo.get(t.id) ?? maps.org.get(t.id);
      if (prior && prior.origin !== meta.origin) { log(`dropped term ${t.id}: a run on an outside page does not replace the term from ${prior.origin}`); continue; }
      if (layer === 'org') { log(`saved ${t.id} in the repository glossary: a run on an outside page adds no owner terms`); layer = 'repo'; }
    } else if (layer === 'org' && !maps.org.has(t.id) && !ownerAllowed) {
      log(`saved ${t.id} in the repository glossary: only allowing the whole owner adds owner terms`);
      layer = 'repo';
    } else if (layer === 'org' && maps.org.has(t.id) && !mayChangeOwnerTerm(maps.org.get(t.id), repo, ownerAllowed)) {
      log(`saved ${t.id} in the repository glossary: the owner term with that id came from ${maps.org.get(t.id).origin}`);
      layer = 'repo';
    }
    const kept = Object.fromEntries(TERM_FIELDS.filter((k) => t[k] !== undefined).map((k) => [k, t[k]]));
    const linkBad = kept.link === undefined ? null : linkProblem(kept.link, owner);
    if (linkBad) { log(`saved ${t.id} without its link: ${linkBad}`); delete kept.link; }
    maps[layer].set(t.id, { ...kept, ...meta });
    if (layer === 'org' && maps.repo.delete(t.id)) log(`removed the repository copy of ${t.id}: now an owner term`);
    ids.push(t.id);
  }
  const now = new Date().toISOString();
  writeJson(files.repo, { repo, updatedAt: now, terms: [...maps.repo.values()] });
  writeJson(files.org, { org: owner, updatedAt: now, terms: [...maps.org.values()] });
  return ids;
}

// Thorough's corrections: replace def/pattern of an existing term in whichever layer holds it.
// A limited run (see storeTerms) corrects nothing.
export function applyCorrections(files, corrections, meta, log, { ownerAllowed = false, limited = false } = {}) {
  const repo = String(meta.origin || '').split(':')[0];
  let applied = 0;
  const list = (Array.isArray(corrections) ? corrections : []).slice(0, LIMITS.terms);
  if (limited) { if (list.length) log(`dropped ${list.length} corrections: a run on an outside page corrects nothing`); return 0; }
  for (const c of list) {
    if (!c || typeof c.id !== 'string' || c.id.length > LIMITS.id) { log(`dropped a correction: its id is missing or longer than ${LIMITS.id} characters`); continue; }
    if (typeof c.reason !== 'string' || c.reason.length > LIMITS.reason) { log(`dropped correction ${c.id}: its reason is missing or longer than ${LIMITS.reason} characters`); continue; }
    if (c.pattern) { const problem = checkPattern(c.pattern); if (problem) { log(`dropped correction ${c.id}: ${problem}`); continue; } }
    if (c.def !== undefined && (typeof c.def !== 'string' || c.def.length > LIMITS.def)) { log(`dropped correction ${c.id}: def is longer than ${LIMITS.def} characters`); continue; }
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
// A regenerating run does not see the terms it will replace, so it defines them afresh. An owner term
// another repository defined is given in full only when the run could correct it (the whole owner is
// allowed): its definition is text from that other repository's pages.
export function glossaryForRun(files, { full = false, regenerateOrigin = null, repo = null, ownerAllowed = false, page = null, mode = 'off' } = {}) {
  return mergedGlossary(files, { owner: repo ? repo.split('/')[0] : null, page, mode })
    .filter((t) => !regenerateOrigin || !replacedByRegenerate(t, regenerateOrigin))
    .map((t) => full && (t.layer !== 'org' || mayChangeOwnerTerm(t, repo, ownerAllowed))
      ? { id: t.id, term: t.term, layer: t.layer, category: t.category, pattern: t.pattern, code: t.code, def: t.def, where: t.where }
      : { id: t.id, term: t.term, layer: t.layer, pattern: t.pattern });
}

// One page run against the store. run(glossary) does the work and resolves to { out, meta }.
// Nothing on disk changes until it resolves: if it rejects, the stored terms are as they were.
// mode is the reader's outside mode, and limited whether this run is held to "limit writes".
export async function defineWith(files, { repo, origin, full = false, regenerate = false, ownerAllowed = false, limited = false, mode = 'off', log = () => {} }, run) {
  const glossary = glossaryForRun(files, { full, regenerateOrigin: regenerate ? origin : null, repo, ownerAllowed, page: origin, mode });
  const { out, meta } = await run(glossary);
  const removed = regenerate ? dropPageTerms(files, origin) : 0;
  if (regenerate) log(`regenerate: replaced ${removed} terms from ${origin}`);
  const ids = storeTerms(files, repo, out.terms || [], meta, log, { ownerAllowed, limited });
  const corrected = applyCorrections(files, out.corrections, meta, log, { ownerAllowed, limited });
  return { ids, corrected, removed, meta };
}
