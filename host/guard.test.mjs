import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { splitArgs, checkBash, checkTool, decide, guardRan } from './guard.mjs';

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
  assert.equal(checkTool('TodoWrite', {}, env), null, 'the run\'s own task list');
  assert.equal(checkTool('StructuredOutput', { terms: [] }, env), null, 'the run\'s reply');
});

test('Tools not on the guard\'s list are refused, whatever the reader\'s own settings allow', () => {
  const env = { roots: [process.cwd()], repo: REPO, cwd: process.cwd() };
  for (const name of ['Write', 'Edit', 'WebFetch', 'PowerShell', 'Task', 'Agent', 'Skill', 'mcp__x__y', undefined, null, 42]) {
    assert.ok(checkTool(name, {}, env), String(name));
  }
});

test('As a hook: a refusal is a deny, an accepted command an allow, an accepted read prints nothing', () => {
  const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const co = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-hook-'));
  const call = (ev, roots = [co]) => spawnSync(process.execPath, [guard], { input: JSON.stringify(ev), env: { ...process.env, GHG_ROOTS: JSON.stringify(roots), GHG_REPO: REPO }, encoding: 'utf8' });
  const denied = call({ tool_name: 'Read', tool_input: { file_path: '/etc/hosts' }, cwd: co });
  assert.equal(denied.status, 0);
  const out = JSON.parse(denied.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  const allowed = call({ tool_name: 'Bash', tool_input: { command: 'git log -1' }, cwd: co });
  assert.equal(JSON.parse(allowed.stdout).hookSpecificOutput.permissionDecision, 'allow', 'the run has no Bash rules: the guard approves the command');
  const read = call({ tool_name: 'Read', tool_input: { file_path: path.join(co, 'a') }, cwd: co });
  assert.equal(read.stdout, '', 'a read inside falls through to the Read(//root/**) rules');
  const garbage = spawnSync(process.execPath, [guard], { input: 'not json', env: { ...process.env, GHG_ROOTS: JSON.stringify([co]), GHG_REPO: REPO }, encoding: 'utf8' });
  assert.equal(JSON.parse(garbage.stdout).hookSpecificOutput.permissionDecision, 'deny', 'input that does not parse is refused');
  const noRoots = call({ tool_name: 'Read', tool_input: { file_path: path.join(co, 'a') }, cwd: co }, []);
  assert.equal(JSON.parse(noRoots.stdout).hookSpecificOutput.permissionDecision, 'deny', 'no roots: everything is refused');
});

test('Glob refuses .. written with backslashes too', () => {
  const root = process.cwd();
  assert.ok(checkTool('Glob', { path: root, pattern: 'a\\..\\..\\x' }, { roots: [root], cwd: root }));
});

test('git options are a list per subcommand: anything else is refused, with the value attached too', () => {
  for (const c of ['git grep -O./evil.sh hello', 'git grep -nO./x y', 'git grep -O ./x y', 'git grep -f/etc/passwd x', 'git grep -nf x y',
    'git blame -S /etc/hosts a.js', 'git blame -S revs a.js', 'git blame --ignore-revs-file /etc/hosts a.js', 'git blame --ignore-revs-file=x a.js',
    'git diff -Oorder', 'git log --output-dir=x', 'git ls-files -X /etc/passwd', 'git ls-files --exclude-from=/etc/passwd',
    'git log --show-signature', 'git log --stat=x --oneline=y', 'git log --onel', 'git diff --submodule=diff', 'git status --porcelain=v2 -z']) no(c);
});

test('git operands stay inside the checkout: no absolute paths and no .., also in rev:path', () => {
  for (const c of ['git diff /dev/null /etc/hosts', 'git diff -- /dev/null /etc/hosts', 'git diff HEAD ../outside', 'git show HEAD:/etc/hosts',
    'git log -- a/../../x', 'git diff C:/Windows/win.ini', 'git diff c:x', 'git grep foo -- /etc', 'git grep -e foo /etc']) no(c);
  for (const c of ['git log HEAD~3..HEAD', 'git diff main...feature -- src', 'git log -L :main:a.js', 'git show HEAD:docs/a.md',
    'git grep -n "https://example.com/x" -- docs', 'git grep -n -e "a/../b"', 'git log --grep=/etc -3', 'git log -5 --stat']) ok(c);
});

test('gh: no repository but this one, in any spelling of -R, and no --jq or --template', () => {
  for (const c of ['gh issue view 1 -Rother/private', 'gh issue view 1 -cRother/private', 'gh issue view 1 -R=other/private',
    'gh issue view 1 -c -R other/private', 'gh pr diff 3 -Rother/x', 'gh pr view 1 --json body --jq .body', 'gh pr view 1 -q .body',
    'gh pr view 1 --template x', 'gh pr view 1 -t x', 'gh pr view 1 -cw', 'gh issue view other/repo#1', 'gh issue view feature',
    'gh pr checks 3 --watch']) no(c);
  for (const c of ['gh issue view 1 -Rocto-org/octo-repo', 'gh issue view 1 -cR octo-org/octo-repo', 'gh pr view 3 --json title,body -c',
    'gh pr view feature/login', 'gh pr diff 3 --name-only', 'gh pr checks 3 --required']) ok(c);
});

test('An option the guard reads as taking a value cannot hide an option git obeys', () => {
  for (const c of ['git log -U --output=/tmp/x -1', 'git log --unified --output=/tmp/x', 'git log --format --output=/tmp/x -1',
    'git show -U --output=/tmp/x', 'git diff -U --no-index a b', 'git diff --unified --no-index a b', 'git log -n --output=/tmp/x',
    'git log --grep --output=/tmp/x', 'git log --author -O/x', 'git grep -e --open-files-in-pager=sh x', 'gh pr view 3 --json --repo evil/repo',
    'gh pr view 3 --json -Revil/repo', 'git log -U', 'git diff --diff-filter M']) no(c);
  for (const c of ['git log -U3 -1 -p', 'git diff --unified=5', 'git log --format=%H -1', 'git log --author octocat -3', 'git grep -e foo -A 3 -- src',
    'git grep -e-foo', 'git diff --diff-filter=M HEAD~1', 'gh pr view 3 --json body']) ok(c);
});

test('git paths through a symbolic link out of the checkout are refused', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-gitlink-'));
  const co = path.join(base, 'co'), out = path.join(base, 'outside');
  fs.mkdirSync(co); fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'secret'), 'x');
  fs.symlinkSync(out, path.join(co, 'outlink'));
  const env = { roots: [co], repo: REPO, cwd: co };
  for (const c of ['git diff -- outlink/secret', 'git log -- outlink', 'git grep -n foo -- outlink/secret', 'git diff HEAD outlink/secret']) {
    assert.ok(checkTool('Bash', { command: c }, env), c);
  }
  assert.ok(checkTool('Bash', { command: 'git log -L 1,5:outlink/secret' }, env), 'git log -L through the link');
  for (const c of ['git log -1', 'git diff HEAD~1 -- src', 'git show HEAD:outlink']) assert.equal(checkTool('Bash', { command: c }, env), null, c);
});

test('git log -L names a file: its file stays inside the checkout like any path', () => {
  for (const c of ['git log -L 1,1:../secret.txt', 'git log -L1,1:/etc/hosts', 'git log -L :main:../x.c', 'git show -L 1,2:a/../../b', 'git log -L 1,1:C:/x']) no(c);
  for (const c of ['git log -L 1,20:src/a.js', 'git log -L:main:src/a.c', 'git blame -L 1,20 a.js', 'git blame -L :main a.c']) ok(c);
});

test('A tool input of the wrong type, or anything that throws while checking, is refused', () => {
  const co = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-types-'));
  const env = { GHG_ROOTS: JSON.stringify([co]), GHG_REPO: REPO };
  for (const input of [{ file_path: {} }, { file_path: ['a'] }, { file_path: 5 }, 'x', ['/etc/hosts']]) {
    assert.ok(decide(JSON.stringify({ tool_name: 'Read', tool_input: input, cwd: co }), env), JSON.stringify(input));
  }
  for (const [tool, input] of [['Grep', { path: ['..'] }], ['Glob', { path: {}, pattern: '*' }], ['Bash', { command: ['git', 'log'] }]]) {
    assert.ok(decide(JSON.stringify({ tool_name: tool, tool_input: input, cwd: co }), env), tool);
  }
  assert.ok(decide(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: path.join(co, 'a') } }), { ...env, GHG_ROOTS: '{"a":1}' }), 'roots that are not a list');
  assert.equal(decide(JSON.stringify({ tool_name: 'Read', tool_input: { file_path: path.join(co, 'a') }, cwd: co }), env), null, 'a good call still passes');
  // As a hook: the refusal is a deny, never a crash that Claude Code would let through.
  const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const r = spawnSync(process.execPath, [guard], { input: JSON.stringify({ tool_name: 'Read', tool_input: { file_path: {} }, cwd: co }), env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('As a hook: every call it checks leaves a mark in GHG_MARK, refused or not', () => {
  const guard = fileURLToPath(new URL('./guard.mjs', import.meta.url));
  const co = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-mark-'));
  const mark = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-marks-')), 'run.log');
  assert.equal(guardRan(mark), false, 'no file: the guard did not run');
  const call = (ev) => spawnSync(process.execPath, [guard], { input: JSON.stringify(ev), env: { ...process.env, GHG_ROOTS: JSON.stringify([co]), GHG_REPO: REPO, GHG_MARK: mark }, encoding: 'utf8' });
  call({ tool_name: 'StructuredOutput', tool_input: {}, cwd: co });
  call({ tool_name: 'Read', tool_input: { file_path: '/etc/hosts' }, cwd: co });
  assert.equal(guardRan(mark), true);
  assert.deepEqual(fs.readFileSync(mark, 'utf8').trim().split('\n'), ['StructuredOutput', 'Read']);
});

test('Network and device paths are refused without touching the file system', () => {
  const co = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-unc-'));
  const env = { roots: [co], repo: REPO, cwd: co };
  const seen = []; const orig = fs.realpathSync;
  fs.realpathSync = (p, ...r) => { seen.push(String(p)); return orig(p, ...r); };
  try {
    for (const p of ['//attacker.example/share/x', '\\\\attacker.example\\share\\x', '\\\\?\\C:\\x', '/etc/hosts', '/attacker.example/x']) {
      assert.ok(checkTool('Read', { file_path: p }, env), p);
      assert.ok(checkTool('Grep', { path: p, pattern: 'x' }, env), p);
    }
    assert.ok(checkTool('Glob', { pattern: '//attacker.example/share/*' }, env));
  } finally { fs.realpathSync = orig; }
  assert.deepEqual(seen.filter((p) => /attacker|etc/.test(p)), [], 'no outside path reached realpath');
});

test('Glob: no .. anywhere, and the folder before the first wildcard is checked through symlinks', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-glob-'));
  const co = path.join(base, 'co'), out = path.join(base, 'outside');
  fs.mkdirSync(co); fs.mkdirSync(out); fs.mkdirSync(path.join(co, 'src'));
  fs.symlinkSync(out, path.join(co, 'out'));
  const env = { roots: [co], repo: REPO, cwd: co };
  for (const pattern of ['{..,x}/**', '**/../*', 'out/**', 'out/*.txt', `${out}/**`, 5]) assert.ok(checkTool('Glob', { pattern }, env), String(pattern));
  for (const pattern of ['**/*.js', 'src/**/*.ts', `${co}/src/*`, '*.md']) assert.equal(checkTool('Glob', { pattern }, env), null, pattern);
});
