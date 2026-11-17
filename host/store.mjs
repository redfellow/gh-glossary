// Glossary storage rules (openspec/specs/glossary-store, and Regenerate in define-runs).
// Every function takes the two glossary files of one repository, { repo, org }, so tests can run
// them against a temporary folder. Nothing here starts a process.

import fs from 'node:fs';
import path from 'node:path';

export const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
export const writeJson = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n'); };

// The only checks the host makes on a pattern. Returns the problem, or null.
export function checkPattern(src) {
  let re;
  try { re = new RegExp(src); } catch (e) { return `invalid regex: ${e.message}`; }
  if (new RegExp(`|${src}`).exec('').length > 1) return 'has a capturing group';
  if (re.test('')) return 'matches the empty string';
  return null;
}

// Owner terms and repository terms together; the repository's meaning wins.
export function mergedGlossary(files) {
  const org = readJson(files.org, { terms: [] }).terms.map((t) => ({ ...t, layer: 'org' }));
  const local = readJson(files.repo, { terms: [] }).terms.map((t) => ({ ...t, layer: 'repo' }));
  const byId = new Map(org.map((t) => [t.id, t]));
  for (const t of local) byId.set(t.id, t);
  return [...byId.values()];
}

// Saves a run's terms. An id replaces the term in its own layer; an owner-layer term also removes
// that id from this repository's glossary, so the new definition is the one shown.
export function storeTerms(files, repo, terms, meta, log) {
  const current = { repo: readJson(files.repo, { terms: [] }), org: readJson(files.org, { terms: [] }) };
  const maps = { repo: new Map(current.repo.terms.map((t) => [t.id, t])), org: new Map(current.org.terms.map((t) => [t.id, t])) };
  const ids = [];
  for (const t of terms) {
    const problem = checkPattern(t.pattern);
    if (problem) { log(`dropped term ${t.id}: ${problem}`); continue; }
    const layer = t.layer === 'org' ? 'org' : 'repo';
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
export function applyCorrections(files, corrections, meta, log) {
  let applied = 0;
  for (const c of corrections || []) {
    if (c.pattern) { const problem = checkPattern(c.pattern); if (problem) { log(`dropped correction ${c.id}: ${problem}`); continue; } }
    for (const f of [files.repo, files.org]) {
      const g = readJson(f, null); const t = g?.terms.find((x) => x.id === c.id);
      if (!t) continue;
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
export async function defineWith(files, { repo, origin, full = false, regenerate = false, log = () => {} }, run) {
  const glossary = glossaryForRun(files, { full, regenerateOrigin: regenerate ? origin : null });
  const { out, meta } = await run(glossary);
  const removed = regenerate ? dropPageTerms(files, origin) : 0;
  if (regenerate) log(`regenerate: replaced ${removed} terms from ${origin}`);
  const ids = storeTerms(files, repo, out.terms || [], meta, log);
  const corrected = applyCorrections(files, out.corrections, meta, log);
  return { ids, corrected, removed, meta };
}
