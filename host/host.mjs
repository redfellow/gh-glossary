// gh-glossary native messaging host. Chrome starts it for the extension (and only for the extension
// ID in its manifest); it talks over stdin/stdout, so there is no port and no token.
// It runs Claude headless (`claude -p`) to define the terms on a GitHub page and keeps the glossaries
// under cache/.
//
// Requests are { id, method, path, query?, body? }; every reply is { id, code, body }.
//   GET  /api/health                                     -> { ok, modes }
//   GET  /api/page?repo=o/r&page=<key>[&ref=..] | &blob=<ref/path>  -> glossary, page info, job, allowed
//   POST /api/allow   { repo, scope: 'repo' | 'owner' }  -> { allowed: true }
//   POST /api/define  { repo, page | blob, ref?, mode: 'quick'|'thorough', regenerate? }
//   POST /api/select  { repo, page | blob, ref?, text, context }      -> { key, job }
//   GET  /api/job?key=<key>                                           -> job (select runs report termId)
//   GET  /api/dir?path=<absolute folder>                              -> { ok } (for Send to Claude)
//   GET  /api/allowlist | POST /api/disallow { scope, name }          -> { owners, repos } (options page)
// Page keys: pr-<n>, issue-<n>, discussion-<n>, file:<path>, readme.
// Reading stored glossaries works for any repo; starting a Claude run needs the repo or its owner on
// the allowlist (config.json "allow"), which only the extension's own allow prompt adds to.
// What gets defined, and how, is decided by the term-definition spec (openspec/specs/term-definition/spec.md);
// each operation's steps are in .claude/skills/.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frames, reader } from './native.mjs';
import { validRepo, validPage, validRef, isAllowed, lc, selectKey } from './rules.mjs';
import { guardRan } from './guard.mjs';
import { readJson, writeJson, mergedGlossary, storeTerms, glossaryForRun, defineWith } from './store.mjs';
import { resolveCommand, hookCommand, stopTree, folderName, samePath, readRule, managedSettingsFiles, hooksOffReason } from './platform.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'cache');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const GUARD = path.join(ROOT, 'host', 'guard.mjs');
const OPERATIONS = ['quick', 'thorough', 'select'];
const SKILLS = Object.fromEntries(OPERATIONS.map((op) => [op, path.join(ROOT, `.claude/skills/gh-glossary-${op}/SKILL.md`)]));
const SCHEMAS = Object.fromEntries(OPERATIONS.map((op) => [op, fs.readFileSync(path.join(ROOT, `schema/${op}.schema.json`), 'utf8')]));
const SPEC_PATH = path.join(ROOT, 'openspec', 'specs', 'term-definition', 'spec.md');
const specVersion = () => Number(fs.readFileSync(SPEC_PATH, 'utf8').match(/Spec version: \*\*(\d+)\*\*/)?.[1] ?? 0);

// stdout is the message channel: nothing else may write to it.
fs.mkdirSync(path.join(CACHE, 'logs'), { recursive: true });
const HOST_LOG = path.join(CACHE, 'logs', 'host.log');
const hostLog = (...a) => { try { fs.appendFileSync(HOST_LOG, `[${new Date().toISOString()}] ${a.join(' ')}\n`); } catch {} };
console.log = console.info = console.warn = console.error = hostLog;

const DEFAULTS = {
  maxMinutes: 30,
  allow: { owners: [], repos: [] },
  modes: {
    quick: { model: 'sonnet', effort: 'medium' },
    thorough: { model: 'opus', effort: 'high' },
    select: { model: 'sonnet', effort: 'medium' },
  },
};
function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  const modes = { ...DEFAULTS.modes, ...(cfg.modes || {}) };
  // GHG_MODEL / GHG_EFFORT override every mode, for a one-off cheap test run.
  if (process.env.GHG_MODEL || process.env.GHG_EFFORT) {
    for (const k of Object.keys(modes)) modes[k] = { model: process.env.GHG_MODEL || modes[k].model, effort: process.env.GHG_EFFORT || modes[k].effort };
  }
  const allow = { owners: [...(cfg.allow?.owners || [])], repos: [...(cfg.allow?.repos || [])] };
  return { ...DEFAULTS, ...cfg, allow, modes };
}
const config = loadConfig();
function saveAllow() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch {}
  cfg.allow = config.allow;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n', { mode: 0o600 });
}

// File reading is allowed only under the run's roots (readRule, which also covers Grep and Glob), so a
// run that somehow lost its guard still cannot read elsewhere. The commands are checked by the guard.
const READ_ONLY_COMMANDS = [
  'Bash(gh pr view:*)', 'Bash(gh pr diff:*)', 'Bash(gh pr checks:*)', 'Bash(gh issue view:*)',
  'Bash(git log:*)', 'Bash(git show:*)', 'Bash(git diff:*)', 'Bash(git grep:*)', 'Bash(git blame:*)',
  'Bash(git status:*)', 'Bash(git ls-files:*)',
];

// ---------- storage (the rules are in host/store.mjs) ----------
const repoPath = (repo) => repo.split('/').map((s) => folderName(s));
const dataDir = (repo) => path.join(CACHE, 'data', ...repoPath(repo));
// The owner glossary lives in a folder named @org: no repository can be called that, while _org
// (used before) is a valid repository name whose glossary would have been the owner's.
const glossaryFiles = (repo) => ({ repo: path.join(dataDir(repo), 'glossary.json'), org: orgFile(repoPath(repo)[0]) });
function orgFile(owner) {
  const file = path.join(CACHE, 'data', owner, '@org', 'glossary.json');
  const old = path.join(CACHE, 'data', owner, '_org', 'glossary.json');
  // Moved only if it is an owner glossary ({ org }); a repository named _org keeps its own ({ repo }).
  if (!fs.existsSync(file) && fs.existsSync(old) && (() => { try { const g = readJson(old, null); return g && 'org' in g && !('repo' in g); } catch { return false; } })()) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.renameSync(old, file); hostLog(`moved ${old} to ${file}`); } catch (e) { hostLog(`could not move ${old}: ${e.message}`); }
  }
  return file;
}
const pagesPath = (repo) => path.join(dataDir(repo), 'pages.json');

// ---------- processes ----------
const children = new Set();
function run(cmd, args, { cwd, input, env, timeoutMs = 5 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let p;
    try {
      const fullEnv = env ? { ...process.env, ...env } : process.env;
      const c = resolveCommand(cmd, args, { env: fullEnv });
      p = spawn(c.file, c.args, { cwd, env: fullEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    } catch (e) { reject(e); return; }
    children.add(p);
    let out = '', err = '';
    const t = setTimeout(() => { stopTree(p); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    // Decoded as a stream, so a character split across two reads (ä, ö, emoji) stays whole.
    p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('error', (e) => { clearTimeout(t); children.delete(p); reject(e); });
    p.on('close', (code) => {
      clearTimeout(t); children.delete(p);
      if (code === 0) resolve(out);
      else reject(Object.assign(new Error(`${cmd} ${args[0]} exited ${code}: ${err.trim().slice(-600)}`), { out, err }));
    });
    p.stdin.end(input ?? '');
  });
}
const memo = new Map(); // small TTL cache for gh lookups
async function cached(key, ttlMs, fn) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.v;
  const v = await fn(); memo.set(key, { v, at: Date.now() }); return v;
}
const defaultBranch = (repo) => cached(`db:${repo}`, 3600_000, async () =>
  (await run('gh', ['repo', 'view', repo, '--json', 'defaultBranchRef', '-q', '.defaultBranchRef.name'])).trim());
const refSha = (repo, ref) => cached(`sha:${repo}@${ref}`, 60_000, async () =>
  (await run('gh', ['api', `repos/${repo}/commits/${encodeURIComponent(ref)}`, '-q', '.sha'])).trim());

// A blob URL is /<ref>/<path> where the ref itself may contain slashes: try the shortest ref first.
// The address comes from the page, so its length and the number of lookups are capped, and a failure
// is remembered for a minute rather than looked up again on every request.
const blobMisses = new Map();
async function resolveBlob(repo, rest) {
  rest = String(rest);
  if (rest.length > 1500) throw new Error('the file address is too long');
  const key = `${repo}/${rest}`;
  if (Date.now() - (blobMisses.get(key) || 0) < 60_000) throw new Error(`cannot tell branch from path in ${rest}`);
  return cached(`blob:${key}`, 3600_000, async () => {
    const segs = rest.split('/');
    let ref = '';
    for (let i = 1; i < segs.length && i <= 20; i++) {
      ref = ref ? `${ref}/${segs[i - 1]}` : segs[0];
      if (ref.length >= 250) break;
      if (!validRef(ref)) continue;
      try { const sha = await refSha(repo, ref); if (sha) return { ref, sha, path: segs.slice(i).join('/') }; } catch {}
    }
    blobMisses.set(key, Date.now());
    if (blobMisses.size > 500) blobMisses.delete(blobMisses.keys().next().value);
    throw new Error(`cannot tell branch from path in ${rest}`);
  });
}

// ---------- checkout ----------
async function checkout(repo, fetchRef) {
  const dir = path.join(CACHE, 'repos', ...repoPath(repo));
  if (!fs.existsSync(path.join(dir, '.git'))) {
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    const longPaths = process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : [];
    await run('gh', ['repo', 'clone', repo, dir, '--', '--filter=blob:none', '-q', ...longPaths], { timeoutMs: 15 * 60_000 });
  }
  await run('git', ['-C', dir, 'fetch', '-q', 'origin', fetchRef], { timeoutMs: 10 * 60_000 });
  await run('git', ['-C', dir, 'checkout', '-q', '--detach', 'FETCH_HEAD']);
  const sha = (await run('git', ['-C', dir, 'rev-parse', 'HEAD'])).trim();
  return { dir, sha };
}

// What the page shows, written to runDir for the run. Returns a one-line description.
async function gatherPage(repo, page, co, runDir, ref) {
  const out = (name, text) => fs.writeFileSync(path.join(runDir, name), text);
  if (page.startsWith('pr-')) {
    const n = page.slice(3);
    out('page.json', await run('gh', ['pr', 'view', n, '--repo', repo, '--json', 'number,title,body,comments,reviews,url']));
    out('page.diff', await run('gh', ['pr', 'diff', n, '--repo', repo]));
    return `pull request #${n}: description, comments and reviews in page.json, the diff in page.diff`;
  }
  if (page.startsWith('issue-')) {
    const n = page.slice(6);
    out('page.json', await run('gh', ['issue', 'view', n, '--repo', repo, '--json', 'number,title,body,comments,url']));
    return `issue #${n}: body and comments in page.json`;
  }
  if (page.startsWith('discussion-')) {
    const n = page.slice(11), [owner, name] = repo.split('/');
    const q = 'query($o:String!,$n:String!,$d:Int!){repository(owner:$o,name:$n){discussion(number:$d){title body url comments(first:100){nodes{body replies(first:50){nodes{body}}}}}}}';
    out('page.json', await run('gh', ['api', 'graphql', '-f', `query=${q}`, '-f', `o=${owner}`, '-f', `n=${name}`, '-F', `d=${n}`]));
    return `discussion #${n}: body and comments in page.json`;
  }
  if (page === 'readme') {
    const f = fs.readdirSync(co.dir).find((x) => /^readme(\.md|\.markdown|\.rst|\.txt)?$/i.test(x));
    return `the repository home page, which shows ${f || 'the README'} at ${ref}`;
  }
  const p = page.slice(5);
  return `the file ${p} at ${ref} (read it from the checkout)`;
}

// ---------- jobs (one Claude run at a time) ----------
// A job's error is shown on the GitHub page, where page scripts can read it: local folders become
// short names.
const tidy = (s) => String(s).split(CACHE).join('cache').split(ROOT).join('gh-glossary').split(os.homedir()).join('~');
const jobs = new Map(); // `${repo}#${page}#${kind}` -> job
let queue = Promise.resolve();
function enqueue(key, fn) {
  const cur = jobs.get(key);
  if (cur && (cur.state === 'queued' || cur.state === 'running')) return cur;
  const job = { state: 'queued', queuedAt: new Date().toISOString() };
  jobs.set(key, job);
  queue = queue.then(async () => {
    job.state = 'running'; job.startedAt = new Date().toISOString();
    const logPath = path.join(CACHE, 'logs', `${key.replace(/[^A-Za-z0-9_.-]+/g, '_')}-${Date.now()}.log`);
    const log = (s) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${s}\n`);
    try {
      job.result = await fn(log, logPath);
      job.state = 'done'; job.doneAt = new Date().toISOString();
      setTimeout(() => { if (jobs.get(key) === job) jobs.delete(key); }, 10 * 60_000);
    } catch (e) { job.state = 'error'; job.error = tidy(e.message); job.log = path.basename(logPath); log(`error: ${e.stack || e.message}`); }
  }).catch(() => {});
  return job;
}

// Every run gets the term-definition spec followed by its operation's skill as the appended system prompt, read-only
// tools, and the guard hook (host/guard.mjs) that keeps it inside the checkout and the run folder.
async function claude(op, { repo, cwd, prompt, addDir, logPath, log }) {
  const { model, effort } = config.modes[op];
  const system = path.join(addDir, 'system.md');
  fs.writeFileSync(system, `${fs.readFileSync(SPEC_PATH, 'utf8')}\n\n---\n\n${fs.readFileSync(SKILLS[op], 'utf8')}`);
  // The guard is the run's one barrier, so the run does not start without it. disableAllHooks: false
  // here wins over the reader's own settings; managed settings cannot be overridden and are checked.
  const off = hooksOffReason(managedSettingsFiles());
  if (off) throw new Error(`Claude Code hooks are turned off (${off}), so gh-glossary cannot guard a run and will not start one.`);
  const settings = { disableAllHooks: false, hooks: { PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: hookCommand(process.execPath, GUARD) }] }] } };
  const roots = [cwd, addDir].map((d) => fs.realpathSync(d));
  const args = [
    '-p', '--model', model, '--effort', effort,
    '--output-format', 'json', '--json-schema', SCHEMAS[op],
    '--append-system-prompt-file', system,
    '--setting-sources', 'user', '--settings', JSON.stringify(settings),
    '--strict-mcp-config', '--no-chrome', '--no-session-persistence',
    '--permission-mode', 'dontAsk', '--permission-prompts', 'none',
    '--add-dir', addDir,
    '--allowedTools', [...roots.map((d) => readRule(d)), ...READ_ONLY_COMMANDS].join(','),
    '--disallowedTools', 'WebFetch,WebSearch,Write,Edit,NotebookEdit',
  ];
  if (config.maxBudgetUsd) args.push('--max-budget-usd', String(config.maxBudgetUsd));
  log(`claude ${op} ${model}/${effort} spec ${specVersion()} in ${cwd}`);
  // The guard marks every call it checks in a file outside the run's folders, at a path the run cannot
  // guess. No mark means the guard never ran (hooks turned off by settings the host cannot read), and
  // the run's output is discarded before anything is stored.
  const marks = path.join(CACHE, 'guard-marks');
  fs.mkdirSync(marks, { recursive: true, mode: 0o700 });
  const mark = path.join(marks, `${crypto.randomBytes(16).toString('hex')}.log`);
  const env = { GHG_ROOTS: JSON.stringify([cwd, addDir]), GHG_REPO: repo, GHG_MARK: mark };
  let raw, guarded = false;
  try {
    raw = await run('claude', args, { cwd, input: prompt, env, timeoutMs: config.maxMinutes * 60_000 });
    guarded = guardRan(mark);
  } finally {
    fs.rmSync(mark, { force: true });
  }
  if (!guarded) throw new Error('the guard did not run for this run, so its result was discarded. Check whether Claude Code hooks are turned off (disableAllHooks or allowManagedHooksOnly) in managed settings.');
  fs.writeFileSync(logPath.replace(/\.log$/, '.result.json'), raw);
  const res = JSON.parse(raw);
  if (res.is_error || !res.structured_output) throw new Error(`claude returned no result (${res.subtype || 'unknown'})`);
  return { out: res.structured_output, cost: res.total_cost_usd ?? null, model: `${model}/${effort}` };
}

function runDirFor(key) {
  const d = path.join(CACHE, 'runs', key.replace(/[^A-Za-z0-9_.-]+/g, '_'));
  fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
  return d;
}

// Which code a page's definitions describe: PR head, the file's ref, or the default branch.
async function pageCheckout(repo, page, ref) {
  const fetchRef = page.startsWith('pr-') ? `pull/${page.slice(3)}/head` : (ref || await defaultBranch(repo));
  return { co: await checkout(repo, fetchRef), shown: ref || fetchRef };
}
function startDefine(repo, page, ref, mode, regenerate) {
  const origin = `${repo}:${page}`;
  const files = glossaryFiles(repo);
  return enqueue(`${repo}#${page}#define`, async (log, logPath) => {
    const t0 = Date.now();
    const { co, shown } = await pageCheckout(repo, page, ref);
    const runDir = runDirFor(`${repo}#${page}#define`);
    const what = await gatherPage(repo, page, co, runDir, shown);
    let cost = null;
    // Regenerate: the run does not see this page's terms, and they are replaced only if it succeeds.
    const { ids, corrected, meta } = await defineWith(files, { repo, origin, full: mode === 'thorough', regenerate, ownerAllowed: ownerAllowed(repo), log }, async (glossary) => {
      writeJson(path.join(runDir, 'glossary.json'), glossary);
      const prompt = [
        `Run the ${mode === 'thorough' ? 'Thorough' : 'Quick'} operation on this GitHub page of ${repo}: ${what}.`,
        `The working directory is a checkout of ${co.sha}. Run inputs are in ${runDir}; glossary.json holds the ${glossary.length} terms already defined.`,
      ].join('\n');
      const r = await claude(mode, { repo, cwd: co.dir, prompt, addDir: runDir, logPath, log });
      cost = r.cost;
      return { out: r.out, meta: { origin, definedAt: new Date().toISOString(), ref: co.sha, model: r.model, spec: specVersion() } };
    });
    const pages = readJson(pagesPath(repo), {});
    pages[page] = { lastRun: meta.definedAt, mode, model: meta.model, ref: co.sha, added: ids.length, corrected, costUsd: cost, durationMs: Date.now() - t0, spec: meta.spec };
    writeJson(pagesPath(repo), pages);
    log(`done: ${ids.length} terms, ${corrected} corrections`);
    return { added: ids.length, corrected };
  });
}

function startSelect(repo, page, ref, text, context) {
  const key = selectKey(repo, page, text);
  const job = enqueue(key, async (log, logPath) => {
    const t0 = Date.now();
    const { co, shown } = await pageCheckout(repo, page, ref);
    const runDir = runDirFor(key);
    const what = await gatherPage(repo, page, co, runDir, shown);
    writeJson(path.join(runDir, 'glossary.json'), glossaryForRun(glossaryFiles(repo)));
    writeJson(path.join(runDir, 'selection.json'), { text, context });
    const prompt = [
      `Run the Select operation on this GitHub page of ${repo}: ${what}.`,
      `The reader selected the text and context in ${path.join(runDir, 'selection.json')}.`,
      `The working directory is a checkout of ${co.sha}. Run inputs are in ${runDir}.`,
    ].join('\n');
    const { out, model } = await claude('select', { repo, cwd: co.dir, prompt, addDir: runDir, logPath, log });
    const meta = { origin: `${repo}:${page}`, definedAt: new Date().toISOString(), ref: co.sha, model, spec: specVersion(), selected: true };
    const [termId] = storeTerms(glossaryFiles(repo), repo, [out.term], meta, log, { ownerAllowed: ownerAllowed(repo) });
    if (!termId) throw new Error('the definition came back with an unusable pattern; try selecting a slightly different span');
    log(`done: ${termId}`);
    return { termId, durationMs: Date.now() - t0 };
  });
  return { key, job };
}

// page/ref from either an explicit page key or a blob URL remainder
async function pageOf({ repo, page, blob, ref }) {
  if (blob) {
    const b = await resolveBlob(repo, String(blob));
    return { page: `file:${b.path}`, ref: b.ref };
  }
  if (ref !== undefined && ref !== null && ref !== '' && !validRef(ref)) throw new Error('bad ref');
  return { page, ref: ref || null };
}

const ownerAllowed = (repo) => config.allow.owners.some((o) => lc(o) === lc(repo.split('/')[0]));
const notAllowed = (repo) => ({ code: 403, body: { error: `${repo} is not on the allowlist`, notAllowed: true } });

// ---------- requests ----------
export async function handle({ method, path: p, query = {}, body = {} }) {
  if (method === 'GET' && p === '/api/health') return { code: 200, body: { ok: true, modes: config.modes } };
  if (method === 'GET' && p === '/api/page') {
    if (!validRepo(query.repo)) return { code: 400, body: { error: 'bad repo' } };
    const { page, ref } = await pageOf(query);
    if (!validPage(page)) return { code: 400, body: { error: 'bad page' } };
    const repo = query.repo;
    return { code: 200, body: {
      page, ref, glossary: { terms: mergedGlossary(glossaryFiles(repo)) },
      pageInfo: readJson(pagesPath(repo), {})[page] || null,
      defineJob: jobs.get(`${repo}#${page}#define`) || null,
      modes: config.modes, allowed: isAllowed(config.allow, repo),
    } };
  }
  if (method === 'POST' && p === '/api/allow') {
    if (!validRepo(body.repo) || !['repo', 'owner'].includes(body.scope)) return { code: 400, body: { error: 'bad repo or scope' } };
    const owner = body.repo.split('/')[0];
    if (body.scope === 'owner' && !config.allow.owners.some((o) => lc(o) === lc(owner))) config.allow.owners.push(owner);
    if (body.scope === 'repo' && !config.allow.repos.some((r) => lc(r) === lc(body.repo))) config.allow.repos.push(body.repo);
    saveAllow();
    hostLog(`allowed ${body.scope} ${body.scope === 'owner' ? owner : body.repo}`);
    return { code: 200, body: { allowed: true } };
  }
  if (method === 'GET' && p === '/api/allowlist') return { code: 200, body: config.allow };
  if (method === 'POST' && p === '/api/disallow') {
    const before = config.allow.owners.length + config.allow.repos.length;
    if (body.scope === 'owner') config.allow.owners = config.allow.owners.filter((o) => lc(o) !== lc(body.name));
    else if (body.scope === 'repo') config.allow.repos = config.allow.repos.filter((r) => lc(r) !== lc(body.name));
    else return { code: 400, body: { error: 'bad scope' } };
    if (config.allow.owners.length + config.allow.repos.length !== before) { saveAllow(); hostLog(`removed ${body.scope} ${body.name} from the allowlist`); }
    return { code: 200, body: config.allow };
  }
  if (method === 'POST' && p === '/api/define') {
    if (!validRepo(body.repo)) return { code: 400, body: { error: 'bad repo' } };
    if (!isAllowed(config.allow, body.repo)) return notAllowed(body.repo);
    if (!['quick', 'thorough'].includes(body.mode)) return { code: 400, body: { error: 'mode must be quick or thorough' } };
    const { page, ref } = await pageOf(body);
    if (!validPage(page)) return { code: 400, body: { error: 'bad page' } };
    return { code: 202, body: { page, job: startDefine(body.repo, page, ref, body.mode, !!body.regenerate) } };
  }
  if (method === 'POST' && p === '/api/select') {
    if (!validRepo(body.repo)) return { code: 400, body: { error: 'bad repo' } };
    if (!isAllowed(config.allow, body.repo)) return notAllowed(body.repo);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length < 1 || text.length > 120) return { code: 400, body: { error: 'select 1-120 characters' } };
    const context = typeof body.context === 'string' ? body.context.slice(0, 600) : '';
    const { page, ref } = await pageOf(body);
    if (!validPage(page)) return { code: 400, body: { error: 'bad page' } };
    return { code: 202, body: startSelect(body.repo, page, ref, text, context) };
  }
  if (method === 'GET' && p === '/api/job') {
    const job = jobs.get(query.key || '');
    return job ? { code: 200, body: job } : { code: 404, body: { error: 'no such job' } };
  }
  if (method === 'GET' && p === '/api/dir') {
    const d = query.path;
    const ok = typeof d === 'string' && path.isAbsolute(d) && !d.includes('\0') && !d.split(/[\\/]/).includes('..')
      && (() => { try { return fs.statSync(d).isDirectory(); } catch { return false; } })();
    return { code: 200, body: { ok } };
  }
  return { code: 404, body: { error: 'not found' } };
}

// ---------- stdin/stdout ----------
function send(reply) { for (const f of frames(reply)) process.stdout.write(f); }

function main() {
  hostLog(`host started for ${process.argv[2] || 'unknown origin'}`);
  process.stdin.on('data', reader(async (msg) => {
    let reply;
    try { reply = await handle(msg || {}); } catch (e) { reply = { code: 500, body: { error: e.message } }; }
    send({ id: msg?.id, ...reply });
  }, { onError: (e) => hostLog(`bad message: ${e.message}`) }));
  const quit = () => { for (const c of children) stopTree(c); process.exit(0); };
  process.stdin.on('end', quit);
  process.on('SIGTERM', quit);
}

if (process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) main();
