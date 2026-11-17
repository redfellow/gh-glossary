import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitArgs, checkBash, checkTool } from './guard.mjs';

const REPO = 'octo-org/octo-repo';
const ok = (cmd) => assert.equal(checkBash(cmd, REPO), null, cmd);
const no = (cmd) => assert.ok(checkBash(cmd, REPO), cmd);

test('Plain words and quotes are split like a shell would', () => {
  assert.deepEqual(splitArgs(`git grep -n "Control Plane" -- 'docs/*.md'`), ['git', 'grep', '-n', 'Control Plane', '--', 'docs/*.md']);
  assert.deepEqual(splitArgs(`git grep 'end$'`), ['git', 'grep', 'end$']);
  assert.deepEqual(splitArgs('git log  -1'), ['git', 'log', '-1']);
});

test('Shell operators, expansions and escapes are refused', () => {
  for (const c of ['git log; rm -rf x', 'git log && curl x', 'git log | head', 'git log > /tmp/x', 'git log $(id)', 'git log `id`',
    'git show "$HOME"', 'git log \\\n', 'git log *', 'git log ~/x', 'git log "unterminated', 'git log\nrm x', 'FOO=1 git log']) no(c);
});

test('Read-only git commands on the checkout are allowed', () => {
  for (const c of ['git log --oneline -5', 'git show HEAD:README.md', 'git diff HEAD~1 -- src', 'git grep -n auth', 'git blame -L 1,20 a.js',
    'git status', 'git ls-files', 'git diff --text HEAD', 'git log --format=%H -1', 'git grep -e foo -- x']) ok(c);
});

test('git options that write, read outside the repo or run programs are refused, abbreviated too', () => {
  for (const c of ['git diff --output=/tmp/x', 'git diff --output /tmp/x', 'git log --out=/tmp/x', 'git diff --no-index /dev/null /etc/passwd',
    'git diff --no-i /a /b', 'git blame --contents /etc/passwd a.js', 'git grep -O vim foo', 'git grep -iO foo', 'git grep -f /etc/passwd',
    'git grep --open-files-in-pager=sh x', 'git diff --ext-diff', 'git log --textconv', 'git grep --file=/x y']) no(c);
});

test('Only the listed git subcommands, with nothing before the subcommand', () => {
  for (const c of ['git -C /etc log', 'git -c core.pager=sh log', 'git --no-pager log', 'git push', 'git checkout x', 'git config x', 'git fetch', 'git format-patch -1']) no(c);
});

test('gh may only read this repo, and never opens a browser', () => {
  for (const c of ['gh pr view 3', 'gh pr view 3 --repo octo-org/octo-repo', 'gh pr view 3 -R Octo-Org/Octo-Repo', 'gh pr diff 3', 'gh pr checks 3',
    'gh issue view 9 --comments', 'gh issue view https://github.com/octo-org/octo-repo/issues/9']) ok(c);
  for (const c of ['gh pr view 3 --repo evil/repo', 'gh pr view 3 --repo=evil/repo', 'gh pr view 3 -R', 'gh pr view --web 3', 'gh pr view -w 3',
    'gh issue view https://github.com/evil/repo/issues/1', 'gh issue view https://example.com/octo-org/octo-repo/issues/1',
    'gh api user', 'gh auth token', 'gh pr merge 3', 'gh repo clone x', 'curl https://x', 'cat /etc/passwd']) no(c);
});

test('Read, Grep and Glob stay inside the roots, symlinks included', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-guard-'));
  const co = path.join(base, 'co'), run = path.join(base, 'run'), out = path.join(base, 'outside');
  for (const d of [co, run, out]) fs.mkdirSync(d);
  fs.writeFileSync(path.join(out, 'secret'), 'x');
  fs.symlinkSync(path.join(out, 'secret'), path.join(co, 'link'));
  const env = { roots: [co, run], repo: REPO, cwd: co };
  assert.equal(checkTool('Read', { file_path: path.join(co, 'a.txt') }, env), null);
  assert.equal(checkTool('Read', { file_path: path.join(run, 'page.json') }, env), null);
  assert.ok(checkTool('Read', { file_path: path.join(out, 'secret') }, env));
  assert.ok(checkTool('Read', { file_path: path.join(co, '..', 'outside', 'secret') }, env));
  assert.ok(checkTool('Read', { file_path: path.join(co, 'link') }, env), 'a symlink out of the checkout');
  assert.ok(checkTool('Read', { file_path: 'relative/../../outside/secret' }, env));
  assert.equal(checkTool('Grep', { pattern: 'x' }, env), null, 'no path: the checkout');
  assert.ok(checkTool('Grep', { pattern: 'x', path: out }, env));
  assert.equal(checkTool('Glob', { pattern: '**/*.md' }, env), null);
  assert.ok(checkTool('Glob', { pattern: '../outside/*' }, env));
  assert.ok(checkTool('Glob', { pattern: `${out}/*` }, env));
  assert.ok(checkTool('Glob', { pattern: '*', path: out }, env));
  assert.equal(checkTool('TodoWrite', {}, env), null, 'other tools are left to --allowedTools');
});

test('As a hook: a refusal is a PreToolUse deny on stdout, an allowed call prints nothing', () => {
  const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const co = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-hook-'));
  const call = (ev, roots = [co]) => spawnSync(process.execPath, [guard], { input: JSON.stringify(ev), env: { ...process.env, GHG_ROOTS: JSON.stringify(roots), GHG_REPO: REPO }, encoding: 'utf8' });
  const denied = call({ tool_name: 'Read', tool_input: { file_path: '/etc/hosts' }, cwd: co });
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  const allowed = call({ tool_name: 'Bash', tool_input: { command: 'git log -1' }, cwd: co });
  assert.equal(allowed.stdout, '');
  const noRoots = call({ tool_name: 'Read', tool_input: { file_path: path.join(co, 'a') }, cwd: co }, []);
  assert.equal(JSON.parse(noRoots.stdout).hookSpecificOutput.permissionDecision, 'deny', 'no roots: everything is refused');
});
