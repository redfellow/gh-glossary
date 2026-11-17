// PreToolUse hook for every Claude run the host starts. Claude may only read inside the run's roots
// (the checkout and the run folder) and may only run single, read-only git and gh commands on the
// run's repository. A page is text from the internet, so a run is treated as possibly
// prompt-injected: this guard is what keeps such a run from reading your files or writing anywhere.
//
// Claude Code calls it with the tool call as JSON on stdin. Roots and repo come from the environment
// the host sets: GHG_ROOTS (JSON array of absolute folders) and GHG_REPO (owner/repo).
// A refusal is printed as a PreToolUse "deny" decision; anything allowed falls through to the run's
// --allowedTools list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { samePath } from './platform.mjs';

const GIT_SUBCOMMANDS = new Set(['log', 'show', 'diff', 'grep', 'blame', 'status', 'ls-files']);
const GH_COMMANDS = new Set(['pr view', 'pr diff', 'pr checks', 'issue view']);
// Options that make a read-only git command write a file, read outside the repository, or run a program.
const GIT_FORBIDDEN = ['--output', '--no-index', '--contents', '--open-files-in-pager', '--ext-diff', '--textconv', '--file', '--exec', '--paginate'];
const GIT_SAFE_PREFIXES = new Set(['--text']); // real options that happen to be prefixes of forbidden ones
const GIT_GREP_FORBIDDEN_SHORT = /[Of]/; // -O<pager> runs a program, -f <file> reads one

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
    if (';&|<>()$`\\\n\r{}*?[]!#'.includes(ch) || (ch === '~' && !has)) return null; // ~ only expands at the start of a word
    cur += ch; has = true;
  }
  if (q) return null;
  if (has) args.push(cur);
  return args;
}

const optName = (a) => a.split('=')[0];

export function checkBash(cmd, repo) {
  const a = splitArgs(cmd);
  if (!a || !a.length) return 'Run one plain command: no pipes, redirects, ;, &&, $(), globs or backslashes.';
  if (a[0] === 'git') {
    if (!GIT_SUBCOMMANDS.has(a[1])) return `Only git ${[...GIT_SUBCOMMANDS].join(', ')} are allowed, with the subcommand first (no -C or -c).`;
    for (const x of a.slice(2)) {
      if (x === '--') break;
      // git also takes unambiguous abbreviations of long options (--out=x is --output=x).
      const name = optName(x);
      if (x.startsWith('--') && !GIT_SAFE_PREFIXES.has(name) && GIT_FORBIDDEN.some((f) => f.startsWith(name))) return `git option ${name} is not allowed.`;
      if (a[1] === 'grep' && /^-[A-Za-z]+$/.test(x) && GIT_GREP_FORBIDDEN_SHORT.test(x)) return 'git grep -O and -f are not allowed.';
    }
    return null;
  }
  if (a[0] === 'gh') {
    if (!GH_COMMANDS.has(`${a[1]} ${a[2]}`)) return `Only ${[...GH_COMMANDS].map((c) => `gh ${c}`).join(', ')} are allowed.`;
    const rest = a.slice(3);
    for (let i = 0; i < rest.length; i++) {
      const x = rest[i], name = optName(x);
      if (name === '--web' || x === '-w') return 'gh --web is not allowed.';
      if (name === '--repo' || name === '-R') {
        const v = x.includes('=') ? x.slice(x.indexOf('=') + 1) : rest[++i];
        if (!v || v.toLowerCase() !== String(repo).toLowerCase()) return `gh may only read ${repo}.`;
        continue;
      }
      if (/^https?:/i.test(x)) {
        let u; try { u = new URL(x); } catch { return 'bad URL'; }
        const [o, r] = u.pathname.split('/').filter(Boolean);
        if (u.hostname !== 'github.com' || `${o}/${r}`.toLowerCase() !== String(repo).toLowerCase()) return `gh may only read ${repo}.`;
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
export function inside(p, roots) {
  if (typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0')) return false;
  const rp = real(p);
  return roots.some((root) => { const r = path.relative(real(root), rp); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); });
}

export function checkTool(name, input, { roots, repo, cwd }) {
  input = input || {};
  const where = (p) => (p === undefined || p === null || p === '' ? cwd : path.isAbsolute(p) ? p : path.resolve(cwd || '/', p));
  const outside = 'Only files in the checkout and the run folder can be read.';
  if (name === 'Read') return inside(where(input.file_path), roots) ? null : outside;
  if (name === 'Grep') return inside(where(input.path), roots) ? null : outside;
  if (name === 'Glob') {
    if (!inside(where(input.path), roots)) return outside;
    const pat = String(input.pattern || '');
    if (pat.split(/[\\/]/).includes('..') || (path.isAbsolute(pat) && !inside(pat.replace(/[*?[{].*$/, '') || '/', roots))) return outside;
    return null;
  }
  if (name === 'Bash') return checkBash(input.command, repo);
  return null; // everything else is decided by --allowedTools and dontAsk
}

function main() {
  let raw = '';
  process.stdin.on('data', (d) => (raw += d));
  process.stdin.on('end', () => {
    let ev = {};
    try { ev = JSON.parse(raw); } catch {}
    let roots = [];
    try { roots = JSON.parse(process.env.GHG_ROOTS || '[]'); } catch {}
    const reason = roots.length
      ? checkTool(ev.tool_name, ev.tool_input, { roots, repo: process.env.GHG_REPO || '', cwd: ev.cwd || roots[0] })
      : 'gh-glossary guard has no roots configured.';
    if (reason) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
    }
    process.exit(0);
  });
}

if (process.argv[1] && samePath(real(process.argv[1]), real(fileURLToPath(import.meta.url)))) main();
