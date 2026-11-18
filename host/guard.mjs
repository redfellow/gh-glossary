// PreToolUse hook for every Claude run the host starts. Claude may only read inside the run's roots
// (the checkout and the run folder) and may only run single, read-only git and gh commands on the
// run's repository. A page is text from the internet, so a run is treated as possibly
// prompt-injected: this guard is what keeps such a run from reading your files or writing anywhere.
//
// Claude Code calls it with the tool call as JSON on stdin. Roots and repo come from the environment
// the host sets: GHG_ROOTS (JSON array of absolute folders) and GHG_REPO (owner/repo).
// A refusal is printed as a PreToolUse "deny" decision. A Bash command it accepts is printed as
// "allow" together with the command to run instead: the checked words, each quoted, so the reader's
// shell expands nothing in them. The run's --allowedTools has no Bash rules, so without this guard
// (hooks turned off) only the commands Claude Code itself counts as read-only run, and none that
// write, start a program or print the environment. Read, Grep and Glob it accepts fall through to
// the run's Read(//root/**) rules. Unknown tools, unknown options and input that does not parse are
// refused.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samePath } from './platform.mjs';

// Every option a run may pass, per command. Anything not listed is refused, so an option that writes a
// file, reads one from outside the checkout or runs a program (git grep -O<pager>, git blame -S <file>,
// git log --output, gh --web) is refused without having to be named, and so is any option a later
// git or gh adds. git also takes abbreviations of long options; those are refused too, since only
// whole names are listed.
// A long option is 'flag' (no value), 'value' (--x=v or --x v), 'attached' (--x=v only) or
// 'optional' (--x or --x=v). A short option is 'flag', 'value' (-xv or -x v), 'attached' (-xv only) or
// 'optional' (-x or -xv), and short flags may be bundled (-nw).
// A value given as the next word may not start with -. Where the guard thinks an option takes the
// next word and git does not (git log -U --output=x: -U never takes the next word), the guard would
// otherwise skip an option git then obeys.
const DIFF_LONG = {
  'patch': 'flag', 'no-patch': 'flag', 'stat': 'optional', 'shortstat': 'flag', 'numstat': 'flag', 'compact-summary': 'flag',
  'dirstat': 'optional', 'summary': 'flag', 'name-only': 'flag', 'name-status': 'flag', 'raw': 'flag', 'unified': 'attached',
  'color': 'optional', 'no-color': 'flag', 'color-moved': 'optional', 'word-diff': 'optional', 'word-diff-regex': 'attached',
  'ignore-all-space': 'flag', 'ignore-space-change': 'flag', 'ignore-space-at-eol': 'flag', 'ignore-cr-at-eol': 'flag',
  'ignore-blank-lines': 'flag', 'function-context': 'flag', 'minimal': 'flag', 'patience': 'flag', 'histogram': 'flag',
  'find-renames': 'optional', 'no-renames': 'flag', 'find-copies': 'optional', 'diff-filter': 'attached', 'relative': 'optional',
  'text': 'flag', 'abbrev': 'optional', 'no-abbrev': 'flag', 'full-index': 'flag', 'no-prefix': 'flag',
  'no-ext-diff': 'flag', 'no-textconv': 'flag', 'exit-code': 'flag', 'quiet': 'flag', 'check': 'flag',
  'pickaxe-all': 'flag', 'pickaxe-regex': 'flag',
};
const DIFF_SHORT = { p: 'flag', u: 'flag', s: 'flag', U: 'attached', w: 'flag', b: 'flag', W: 'flag', a: 'flag', M: 'optional', C: 'optional', R: 'flag', S: 'value', G: 'value' };
const LOG_LONG = {
  ...DIFF_LONG,
  'oneline': 'flag', 'format': 'attached', 'pretty': 'optional', 'date': 'value', 'decorate': 'optional', 'no-decorate': 'flag',
  'graph': 'flag', 'max-count': 'value', 'skip': 'value', 'since': 'value', 'after': 'value', 'until': 'value', 'before': 'value',
  'author': 'value', 'committer': 'value', 'grep': 'value', 'all-match': 'flag', 'invert-grep': 'flag', 'regexp-ignore-case': 'flag',
  'extended-regexp': 'flag', 'fixed-strings': 'flag', 'first-parent': 'flag', 'merges': 'flag', 'no-merges': 'flag',
  'all': 'flag', 'branches': 'optional', 'tags': 'optional', 'remotes': 'optional', 'reverse': 'flag', 'follow': 'flag',
  'topo-order': 'flag', 'date-order': 'flag', 'author-date-order': 'flag', 'ancestry-path': 'flag', 'full-history': 'flag',
  'simplify-by-decoration': 'flag', 'left-right': 'flag', 'cherry-pick': 'flag', 'boundary': 'flag', 'parents': 'flag',
  'children': 'flag', 'source': 'flag', 'cc': 'flag', 'no-walk': 'optional', 'notes': 'optional', 'no-notes': 'flag',
};
const LOG_SHORT = { ...DIFF_SHORT, n: 'value', L: 'value', i: 'flag', E: 'flag', F: 'flag', m: 'flag', c: 'flag', '#': 'count' };
const GIT = {
  log: { long: LOG_LONG, short: LOG_SHORT },
  show: { long: LOG_LONG, short: LOG_SHORT },
  diff: { long: { ...DIFF_LONG, 'cached': 'flag', 'staged': 'flag', 'merge-base': 'flag' }, short: DIFF_SHORT },
  grep: {
    long: {
      'line-number': 'flag', 'column': 'flag', 'ignore-case': 'flag', 'word-regexp': 'flag', 'invert-match': 'flag',
      'files-with-matches': 'flag', 'name-only': 'flag', 'files-without-match': 'flag', 'count': 'flag', 'only-matching': 'flag',
      'extended-regexp': 'flag', 'fixed-strings': 'flag', 'basic-regexp': 'flag', 'perl-regexp': 'flag', 'quiet': 'flag',
      'show-function': 'flag', 'function-context': 'flag', 'heading': 'flag', 'break': 'flag', 'full-name': 'flag', 'cached': 'flag',
      'text': 'flag', 'all-match': 'flag', 'and': 'flag', 'or': 'flag', 'not': 'flag', 'color': 'optional', 'no-color': 'flag',
      'recursive': 'flag', 'no-recursive': 'flag', 'after-context': 'value', 'before-context': 'value', 'context': 'value',
      'max-count': 'value', 'max-depth': 'value',
    },
    short: { n: 'flag', i: 'flag', I: 'flag', w: 'flag', v: 'flag', l: 'flag', L: 'flag', c: 'flag', h: 'flag', H: 'flag', o: 'flag',
      E: 'flag', F: 'flag', G: 'flag', P: 'flag', q: 'flag', p: 'flag', W: 'flag', a: 'flag', r: 'flag',
      e: 'value', A: 'value', B: 'value', C: 'value', m: 'value' },
  },
  blame: {
    long: { 'porcelain': 'flag', 'line-porcelain': 'flag', 'show-name': 'flag', 'show-number': 'flag', 'show-email': 'flag', 'root': 'flag',
      'show-stats': 'flag', 'date': 'value', 'abbrev': 'optional', 'ignore-rev': 'value', 'color-lines': 'flag', 'color-by-age': 'flag' },
    short: { L: 'value', w: 'flag', s: 'flag', e: 'flag', l: 'flag', t: 'flag', f: 'flag', n: 'flag', p: 'flag', c: 'flag', b: 'flag', M: 'optional', C: 'optional' },
  },
  status: {
    long: { 'short': 'flag', 'branch': 'flag', 'porcelain': 'optional', 'long': 'flag', 'untracked-files': 'optional', 'ignored': 'optional', 'no-renames': 'flag', 'verbose': 'flag' },
    short: { s: 'flag', b: 'flag', u: 'optional', v: 'flag' },
  },
  'ls-files': {
    long: { 'cached': 'flag', 'deleted': 'flag', 'modified': 'flag', 'others': 'flag', 'stage': 'flag', 'unmerged': 'flag', 'killed': 'flag',
      'full-name': 'flag', 'directory': 'flag', 'no-empty-directory': 'flag', 'exclude-standard': 'flag', 'error-unmatch': 'flag', 'eol': 'flag',
      'deduplicate': 'flag', 'abbrev': 'optional', 'format': 'attached', 'exclude': 'value' },
    short: { c: 'flag', d: 'flag', m: 'flag', o: 'flag', s: 'flag', u: 'flag', k: 'flag', t: 'flag', v: 'flag', x: 'value' },
  },
};
// gh: no --web (opens a browser), no --jq or --template (gojq reads environment variables with $ENV).
const GH_VIEW = { long: { comments: 'flag', json: 'value', repo: 'value' }, short: { c: 'flag', R: 'value' } };
const GH = {
  'pr view': GH_VIEW,
  'issue view': GH_VIEW,
  'pr diff': { long: { patch: 'flag', 'name-only': 'flag', color: 'value', repo: 'value' }, short: { R: 'value' } },
  'pr checks': { long: { required: 'flag', json: 'value', repo: 'value' }, short: { R: 'value' } },
};

// Splits a command line the way a shell would for plain words and quotes, and refuses anything a shell
// would expand or treat as an operator. Returns the argument list, or null.
export function splitArgs(cmd) {
  if (typeof cmd !== 'string' || cmd.length > 2000) return null;
  const args = []; let cur = ''; let has = false; let q = '';
  for (const ch of cmd) {
    if (q === "'") { if (ch === "'") q = ''; else cur += ch; continue; }
    if (q === '"') {
      if (ch === '"') q = '';
      else if ('$`\\!'.includes(ch)) return null;
      else cur += ch;
      continue;
    }
    if (ch === "'" || ch === '"') { q = ch; has = true; continue; }
    if (ch === ' ' || ch === '\t') { if (has) { args.push(cur); cur = ''; has = false; } continue; }
    // ~ and = only expand at the start of a word (zsh turns =name into the path of that command).
    if (';&|<>()$`\\\n\r{}*?[]!#'.includes(ch) || ((ch === '~' || ch === '=') && !has)) return null;
    cur += ch; has = true;
  }
  if (q) return null;
  if (has) args.push(cur);
  return args;
}

// The command line Claude Code is given to run in place of the one the run wrote: the same words,
// each in single quotes. A shell expands nothing inside single quotes whatever its options are, so
// what runs is what was checked. Unquoted, zsh would turn ^ and ~ into glob operators when
// extendedglob is set, and file names from the checkout would take a word's place.
export const quoted = (args) => args.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');

function nextValue(args, i, opt) {
  if (i + 1 >= args.length) return { error: `option ${opt} needs a value.` };
  const v = args[i + 1];
  if (v.startsWith('-')) return { error: `the value of ${opt} may not start with -; attach it instead (${opt.startsWith('--') ? `${opt}=` : opt}<value>).` };
  return { value: v };
}
// Options that write a file, read outside the checkout or run a program. They are not in any table;
// this second check refuses them in any position before --, whatever the option parsing concluded.
const NEVER = ['--output', '--no-index', '--ext-diff', '--textconv', '--contents', '--open-files-in-pager', '--exec', '--upload-pack', '--web', '--jq', '--template'];
const never = (args) => {
  const end = args.indexOf('--');
  return (end < 0 ? args : args.slice(0, end)).find((x) => NEVER.some((n) => x === n || x.startsWith(`${n}=`)));
};

// Reads args against an option table. Returns { error } or { values, operands }: every option value
// (as [option name, value]) and every operand, for the caller to check.
function parseOptions(args, { long, short }) {
  const values = [], operands = [];
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (x === '--') { operands.push(...args.slice(i + 1)); break; }
    if (x.startsWith('--')) {
      const eq = x.indexOf('='), name = eq < 0 ? x.slice(2) : x.slice(2, eq);
      const kind = Object.hasOwn(long, name) ? long[name] : null;
      if (!kind) return { error: `option --${name} is not allowed.` };
      if (eq >= 0) { if (kind === 'flag') return { error: `option --${name} takes no value.` }; values.push([name, x.slice(eq + 1)]); }
      else if (kind === 'attached') return { error: `option --${name} needs its value attached: --${name}=<value>.` };
      else if (kind === 'value') { const v = nextValue(args, i, `--${name}`); if (v.error) return v; values.push([name, v.value]); i++; }
      continue;
    }
    if (x.startsWith('-') && x.length > 1) {
      if (/^-\d+$/.test(x)) { if (short['#'] !== 'count') return { error: `option ${x} is not allowed.` }; continue; }
      for (let j = 1; j < x.length; j++) {
        const c = x[j], kind = Object.hasOwn(short, c) && c !== '#' ? short[c] : null;
        if (!kind) return { error: `option -${c} is not allowed.` };
        if (kind === 'flag') continue;
        const rest = x.slice(j + 1);
        if (rest) values.push([c, rest.startsWith('=') ? rest.slice(1) : rest]);
        else if (kind === 'attached') return { error: `option -${c} needs its value attached: -${c}<value>.` };
        else if (kind === 'value') { const v = nextValue(args, i, `-${c}`); if (v.error) return v; values.push([c, v.value]); i++; }
        break;
      }
      continue;
    }
    operands.push(x);
  }
  return { values, operands };
}

// A git operand may name only something inside the checkout: no absolute path (git diff switches to
// --no-index by itself for a path outside the repository and prints the file) and no .. step, in any
// part of a rev:path.
const isAbsoluteAnywhere = (s) => path.posix.isAbsolute(s) || path.win32.isAbsolute(s);
export function staysInside(arg) {
  const s = String(arg);
  if (/^[A-Za-z]:/.test(s)) return false; // a Windows drive, c:x included (relative to that drive's folder)
  return !s.split(':').some((part) => isAbsoluteAnywhere(part) || part.split('/').includes('..'));
}

// ctx { roots, cwd }, when given, also resolves symlinks in git paths: a symbolic link committed in the
// repository (outlink -> /etc) would otherwise let outlink/hosts name a file outside the checkout.
export function checkBash(cmd, repo, ctx = null) {
  const a = splitArgs(cmd);
  if (!a || !a.length) return 'Run one plain command: no pipes, redirects, ;, &&, $(), globs or backslashes, and a word that starts with = or ~ in quotes.';
  const bad = never(a.slice(1));
  if (bad) return `option ${bad.split('=')[0]} is not allowed.`;
  if (a[0] === 'git') {
    const spec = Object.hasOwn(GIT, a[1] ?? '') ? GIT[a[1]] : null;
    if (!spec) return `Only git ${Object.keys(GIT).join(', ')} are allowed, with the subcommand first (no -C or -c).`;
    const r = parseOptions(a.slice(2), spec);
    if (r.error) return `git ${a[1]}: ${r.error}`;
    // Operands are revisions and paths; git grep's first one is the pattern unless -e gave it. The one
    // allowed option that names a file is -L: git log -L <range>:<file> (git blame -L takes only a
    // range). Its value is checked like a rev:path, and its file like any other path.
    const paths = a[1] === 'grep' && !r.values.some(([opt]) => opt === 'e') ? r.operands.slice(1) : r.operands;
    const lines = r.values.filter(([opt]) => opt === 'L').map(([, v]) => v);
    if (![...paths, ...lines].every(staysInside)) return 'git may only name files inside the checkout: no absolute paths or "..".';
    const lineFiles = a[1] === 'blame' ? [] : lines.filter((v) => v.includes(':')).map((v) => v.slice(v.lastIndexOf(':') + 1)).filter(Boolean);
    if (ctx && ![...paths.filter((x) => !x.includes(':')), ...lineFiles].every((x) => inside(path.resolve(ctx.cwd || ctx.roots[0], x), ctx.roots))) {
      return 'git may only name files inside the checkout: that path leads out of it through a symbolic link.';
    }
    return null;
  }
  if (a[0] === 'gh') {
    const cmdName = `${a[1]} ${a[2]}`;
    const spec = Object.hasOwn(GH, cmdName) ? GH[cmdName] : null;
    if (!spec) return `Only ${Object.keys(GH).map((c) => `gh ${c}`).join(', ')} are allowed.`;
    const rest = a.slice(3);
    const r = parseOptions(rest, spec);
    if (r.error) return `gh ${cmdName}: ${r.error}`;
    const sameRepo = (v) => String(v).toLowerCase() === String(repo).toLowerCase();
    if (r.values.some(([opt, v]) => (opt === 'repo' || opt === 'R') && !sameRepo(v))) return `gh may only read ${repo}.`;
    for (const x of r.operands) {
      if (/^https?:/i.test(x)) {
        let u; try { u = new URL(x); } catch { return 'bad URL'; }
        const [o, n] = u.pathname.split('/').filter(Boolean);
        if (u.hostname !== 'github.com' || !sameRepo(`${o}/${n}`)) return `gh may only read ${repo}.`;
      } else if (!/^\d+$/.test(x) && !(a[1] === 'pr' && /^[\w.\/-]+$/.test(x) && !x.startsWith('-'))) {
        return `gh ${cmdName} takes a number${a[1] === 'pr' ? ', a branch' : ''} or a URL of ${repo}.`;
      }
    }
    return null;
  }
  return 'Only git and gh read commands are allowed.';
}

// Resolves symlinks in the longest part of p that exists, so a file that is not there yet still
// compares correctly with a root reached through a symlink (macOS /var -> /private/var).
function real(p) {
  const abs = path.resolve(p);
  let head = abs, tail = '';
  for (;;) {
    try { return path.join(fs.realpathSync(head), tail); } catch {}
    const up = path.dirname(head);
    if (up === head) return abs;
    tail = path.join(path.basename(head), tail); head = up;
  }
}
// A network or device path (\\host\share, //host/share, \\?\C:\) is refused before anything
// touches it: on Windows resolving one connects to that host, which leaks the name and the reader's
// credentials even though the call is then refused.
const UNC = /^[\\/]{2}/;
const under = (p, root) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
export function inside(p, roots) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0') || UNC.test(p)) return false;
  // Lexically first, so the file system is only asked about paths that are already under a root (as
  // written, or with the root's own symlinks resolved); then with every symlink resolved.
  const abs = path.resolve(p);
  if (!roots.some((root) => under(abs, path.resolve(root)) || under(abs, real(root)))) return false;
  const rp = real(abs);
  return roots.some((root) => under(rp, real(root)));
}

// Tools that read nothing and run nothing: the run's structured reply and its own task list.
const HARMLESS_TOOLS = new Set(['StructuredOutput', 'TodoWrite']);

export function checkTool(name, input, { roots, repo, cwd }) {
  if (input === undefined || input === null) input = {};
  if (typeof input !== 'object' || Array.isArray(input)) return 'The tool input is not an object.';
  // A path that is not a string (file_path: {}) gives null, which inside() refuses.
  const where = (p) => (p === undefined || p === null || p === '' ? cwd : typeof p !== 'string' || UNC.test(p) ? null : path.isAbsolute(p) ? p : path.resolve(cwd || '/', p));
  const outside = 'Only files in the checkout and the run folder can be read.';
  if (name === 'Read') return inside(where(input.file_path), roots) ? null : outside;
  if (name === 'Grep') return inside(where(input.path), roots) ? null : outside;
  if (name === 'Glob') {
    const base = where(input.path);
    if (!inside(base, roots)) return outside;
    if (typeof input.pattern !== 'string') return 'The Glob pattern is not a string.';
    const pat = input.pattern;
    // No .. anywhere ({..,x}/** included), and the folder the pattern names before its first wildcard
    // must be inside too, symlinks resolved (out/** where out links outside the checkout).
    if (pat.includes('..') || UNC.test(pat)) return outside;
    const wild = pat.search(/[*?[{]/), lit = wild < 0 ? pat : pat.slice(0, wild);
    const dir = lit.slice(0, Math.max(lit.lastIndexOf('/'), lit.lastIndexOf('\\')) + 1);
    if ((dir || path.isAbsolute(pat)) && !inside(path.isAbsolute(dir || pat) ? (dir || pat) : path.resolve(base, dir), roots)) return outside;
    return null;
  }
  if (name === 'Bash') return checkBash(input.command, repo, { roots, cwd });
  if (HARMLESS_TOOLS.has(name)) return null;
  // The reader's own permissions.allow rules load too (--setting-sources user), so a tool that is
  // not listed here is refused rather than left to them.
  return `${typeof name === 'string' ? name : 'This tool'} is not available to a gh-glossary run.`;
}

// The decision for one hook call: the refusal reason, or null to let the call through. Anything that
// goes wrong while checking (a value of the wrong type, a bug here) is a refusal, never a pass.
export function decide(raw, env) {
  try {
    let ev = null;
    try { ev = JSON.parse(raw); } catch {}
    if (!ev || typeof ev !== 'object') ev = {}; // tool_name is then missing, and the call is refused
    let roots = [];
    try { roots = JSON.parse(env.GHG_ROOTS || '[]'); } catch {}
    if (!Array.isArray(roots) || !roots.length || !roots.every((r) => typeof r === 'string' && path.isAbsolute(r))) return 'gh-glossary guard has no roots configured.';
    const cwd = typeof ev.cwd === 'string' && path.isAbsolute(ev.cwd) ? ev.cwd : roots[0];
    return checkTool(ev.tool_name, ev.tool_input, { roots, repo: env.GHG_REPO || '', cwd });
  } catch (e) {
    return `gh-glossary guard could not check this call (${e?.message || e}).`;
  }
}

// Leaves a mark for the host: one line per call checked, appended to the file GHG_MARK names. The
// host gives each run a new, unguessable path outside the run's folders and discards a run that ends
// without a mark (every run calls at least StructuredOutput), so a run whose guard was turned off by
// settings the host cannot read never reaches a page.
export function leaveMark(file, toolName) {
  if (typeof file !== 'string' || !path.isAbsolute(file)) return;
  try { fs.appendFileSync(file, `${typeof toolName === 'string' ? toolName.slice(0, 100) : '?'}\n`); } catch {}
}

// Whether the guard left a mark in file during a run.
export function guardRan(file) {
  try { return fs.readFileSync(file, 'utf8').trim().length > 0; } catch { return false; }
}

// Claude Code treats a hook that exits with any code but 2 and prints no decision as a non-blocking
// error and lets the call run, so a crash outside decide() exits 2, which blocks the call.
function main() {
  const block = (e) => { try { process.stderr.write(`gh-glossary guard failed: ${e?.message || e}\n`); } catch {} process.exit(2); };
  process.on('uncaughtException', block);
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('error', block);
  process.stdin.on('end', () => {
    let ev; try { ev = JSON.parse(raw); } catch {}
    const toolName = ev?.tool_name;
    leaveMark(process.env.GHG_MARK, toolName);
    const reason = decide(raw, process.env);
    const decision = reason ? 'deny' : toolName === 'Bash' ? 'allow' : null;
    if (decision) {
      const why = reason || 'gh-glossary guard: a read-only command on the checkout.';
      // An approved command passed checkBash, so it splits; if it ever did not, quoted() throws and the call is blocked.
      const updatedInput = decision === 'allow' ? { updatedInput: { ...ev.tool_input, command: quoted(splitArgs(ev.tool_input.command)) } } : {};
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: why, ...updatedInput } }), () => process.exit(0));
    } else process.exit(0);
  });
}

if (process.argv[1] && samePath(real(process.argv[1]), real(fileURLToPath(import.meta.url)))) main();
