// What a run is started with and what it is given: its configuration, its arguments, its prompt, the
// page's text without what the page hides, and whether the page comes from outside the repository.
// Nothing here starts a process or reads a file, so the tests can run every rule.

// ---------- configuration ----------
// How outside pages are treated (openspec/specs/outside-content): off, limit-writes or outside-pages.
export const OUTSIDE_MODES = ['off', 'limit-writes', 'outside-pages'];
export const DEFAULTS = {
  maxMinutes: 30,
  allow: { owners: [], repos: [] },
  outside: 'off',
  modes: {
    quick: { model: 'sonnet', effort: 'medium', maxBudgetUsd: 2 },
    thorough: { model: 'opus', effort: 'high', maxBudgetUsd: 10 },
    select: { model: 'sonnet', effort: 'medium', maxBudgetUsd: 2 },
  },
};
// cfg is config.json as parsed. GHG_MODEL / GHG_EFFORT override every operation, for a one-off cheap
// test run. An operation the file names only in part keeps the defaults for the rest.
export function configFrom(cfg = {}, env = {}) {
  const modes = {};
  for (const op of Object.keys(DEFAULTS.modes)) {
    modes[op] = { ...DEFAULTS.modes[op], ...(cfg.modes?.[op] || {}) };
    if (env.GHG_MODEL) modes[op].model = env.GHG_MODEL;
    if (env.GHG_EFFORT) modes[op].effort = env.GHG_EFFORT;
  }
  const allow = { owners: [...(cfg.allow?.owners || [])], repos: [...(cfg.allow?.repos || [])] };
  const outside = OUTSIDE_MODES.includes(cfg.outside) ? cfg.outside : DEFAULTS.outside;
  return { ...DEFAULTS, ...cfg, allow, modes, outside };
}
// A run's spend limit in US dollars: the top-level maxBudgetUsd for every operation when it is set,
// else the operation's own. 0 means no limit.
export const budgetFor = (config, op) => config.maxBudgetUsd || config.modes[op].maxBudgetUsd || null;

// ---------- arguments ----------
// The arguments claude is started with. readRules are the Read(//root/**) rules of the run's two
// folders: there are no Bash rules, the guard approves each command it has checked.
export function claudeArgs({ model, effort, schema, system, settings, addDir, readRules, budget = null }) {
  const args = [
    '-p', '--model', model, '--effort', effort,
    '--output-format', 'json', '--json-schema', schema,
    '--append-system-prompt-file', system,
    '--setting-sources', 'user', '--settings', JSON.stringify(settings),
    '--strict-mcp-config', '--no-chrome', '--no-session-persistence',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--add-dir', addDir,
    '--allowedTools', readRules.join(','),
    '--disallowedTools', 'WebFetch,WebSearch,Write,Edit,NotebookEdit',
  ];
  if (budget) args.push('--max-budget-usd', String(budget));
  return args;
}

// What claude printed when it ended, or null when that is not its result.
export function parseResult(text) {
  try { const r = JSON.parse(text); return r && typeof r === 'object' && r.type === 'result' ? r : null; } catch { return null; }
}
// Why a run that ended left nothing to store, or null. A run stopped at its spend limit says so: the
// reader set the limit and should see it was reached.
export function resultProblem(res, budget = null) {
  if (res?.subtype === 'error_max_budget_usd') return `the run reached its spend limit${budget ? ` of ${budget} US dollars` : ''} and was stopped; nothing was saved`;
  if (!res || res.is_error || !res.structured_output) return `claude returned no result (${res?.subtype || 'unknown'})`;
  return null;
}

// ---------- prompt ----------
// What the page is, for target.json in the run folder. A file's path and a ref come from the page's
// address, which anyone can write, so they are given here and never in the prompt.
export function pageTarget(page, { ref = null, readme = null } = {}) {
  if (page.startsWith('pr-')) return { kind: 'pr', number: Number(page.slice(3)) };
  if (page.startsWith('issue-')) return { kind: 'issue', number: Number(page.slice(6)) };
  if (page.startsWith('discussion-')) return { kind: 'discussion', number: Number(page.slice(11)) };
  if (page === 'readme') return { kind: 'readme', readme, ref };
  return { kind: 'file', path: page.slice(5), ref };
}
const PAGE_LINE = {
  pr: (t) => `pull request #${t.number}: description, comments and reviews in page.json, the diff in page.diff`,
  issue: (t) => `issue #${t.number}: body and comments in page.json`,
  discussion: (t) => `discussion #${t.number}: body and comments in page.json`,
  readme: () => 'the repository home page: target.json names the README it shows and its ref (read it from the checkout)',
  file: () => 'a file: target.json names its path and ref (read it from the checkout)',
};
const OPERATION = { quick: 'Quick', thorough: 'Thorough', select: 'Select' };
// The run's prompt. It holds only text the host wrote: the operation, the repository (checked by the
// host), the kind of page with its number, the commit and the run folder.
export function runPrompt(op, { repo, target, sha, runDir, terms = 0 }) {
  if (!Object.hasOwn(OPERATION, op) || !Object.hasOwn(PAGE_LINE, target?.kind)) throw new Error('bad operation or page kind');
  if (!/^[0-9a-f]{7,64}$/.test(sha)) throw new Error('the checkout is not at a commit id');
  if (target.number !== undefined && !Number.isSafeInteger(target.number)) throw new Error('bad page number');
  const lines = [`Run the ${OPERATION[op]} operation on this GitHub page of ${repo}: ${PAGE_LINE[target.kind](target)}.`];
  if (op === 'select') {
    lines.push('The reader selected the text and context in selection.json, in the run folder.');
    lines.push(`The working directory is a checkout of ${sha}. Run inputs are in ${runDir}.`);
  } else {
    lines.push(`The working directory is a checkout of ${sha}. Run inputs are in ${runDir}; glossary.json holds the ${Number(terms)} terms already defined.`);
  }
  return lines.join('\n');
}

// ---------- the page's text ----------
// Text a page does not show, removed before a run gets it: HTML comments (one that never ends hides
// the rest, as on the page) and Unicode tag characters, which nothing draws. Comments go first: a tag
// character inside "-->" keeps a comment open on the page, and must keep it open here.
// A comment is removed inside code as well, where the page does show it: telling code from prose
// exactly takes a full Markdown parser, and a near miss would let hidden text through.
const TAG_CHARACTERS = /[\u{E0000}-\u{E007F}]/gu;
const noTags = (s) => (typeof s === 'string' ? s.replace(TAG_CHARACTERS, '') : s);
export const shownText = (s) => (typeof s === 'string' ? noTags(s.replace(/<!--[\s\S]*?(?:-->|$)/g, '')) : s);

// GitHub's word for who wrote something: these three can write to the repository.
const INSIDE = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
export const insider = (association) => INSIDE.has(association);

// The page as a run is given it, from gh's JSON for a pull request, an issue or a discussion: every
// body without its hidden text and, when asked, without the comments, reviews and replies of people
// who cannot write to the repository. Returns { page, leftOut }: leftOut counts those that had text.
export function pageForRun(kind, json, { leaveOutOutsiders = false } = {}) {
  let leftOut = 0;
  const kept = (list, more = (c) => c) => (Array.isArray(list) ? list : []).filter((c) => {
    if (!leaveOutOutsiders || insider(c?.authorAssociation)) return true;
    if (String(c?.body ?? '').trim()) leftOut++;
    return false;
  }).map((c) => more({ ...c, body: shownText(c.body) }));
  const top = (o) => ({ ...o, title: noTags(o.title), body: shownText(o.body) });
  if (kind === 'discussion') {
    const d = json?.data?.repository?.discussion;
    if (!d) return { page: json, leftOut };
    const comments = kept(d.comments?.nodes, (c) => ({ ...c, replies: { nodes: kept(c.replies?.nodes) } }));
    return { page: { data: { repository: { discussion: { ...top(d), comments: { nodes: comments } } } } }, leftOut };
  }
  const page = { ...top(json), comments: kept(json.comments) };
  if (kind === 'pr') page.reviews = kept(json.reviews);
  return { page, leftOut };
}

// ---------- outside pages ----------
// A pull request is outside when its head is in a fork or its opener cannot write to the repository.
// Anything GitHub did not say (a failed lookup) counts as outside.
export const prOutside = (pr, association) => pr?.isCrossRepository !== false || !insider(association);
export const openerOutside = (association) => !insider(association);
// A file or home page is inside when it shows the default branch (no ref in its address), a branch or
// a tag of the repository, or a commit the default branch contains. heads and tags are the refs
// GitHub lists for the name; compare is the status of <commit>...<default branch>.
export function refOutside(ref, { heads = [], tags = [], compare = null } = {}) {
  if (!ref) return false;
  if (heads.includes(`refs/heads/${ref}`) || tags.includes(`refs/tags/${ref}`)) return false;
  return !(compare === 'ahead' || compare === 'identical');
}
// Whether a run on this page is held to "limit writes": the page is outside and the mode is not off.
export const limitedRun = (mode, outside) => !!outside && mode !== 'off';

// ---------- notes ----------
// What a run says about text it did not follow, cut to what the popup shows.
export const NOTE_MAX = 500;
export const cutNote = (s) => { const t = typeof s === 'string' ? s.trim() : ''; return t ? t.slice(0, NOTE_MAX) : null; };
