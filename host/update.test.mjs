// Updating gh-glossary itself (host/update.mjs), against real git repositories in a temporary folder:
// an "origin" and a clone of it standing in for the reader's gh-glossary folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateStatus, applyUpdate } from './update.mjs';

const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com', GIT_CONFIG_NOSYSTEM: '1' };
const QUIET = { env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };
const sh = (dir, ...args) => execFileSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', ...args], QUIET);
const gitIn = (dir) => async (args) => sh(dir, ...args);

// origin (bare), upstream (where "GitHub" commits are made) and app (the reader's folder).
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ghg-update-')));
  const origin = path.join(root, 'origin.git'), upstream = path.join(root, 'upstream'), app = path.join(root, 'app');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', origin], QUIET);
  execFileSync('git', ['clone', '-q', origin, upstream], QUIET);
  commit(upstream, 'README.md', 'one', 'First');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  execFileSync('git', ['clone', '-q', origin, app], QUIET);
  return { origin, upstream, app, git: gitIn(app) };
}
function commit(dir, file, text, title) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
  sh(dir, 'add', file);
  sh(dir, 'commit', '-q', '-m', title);
  return sh(dir, 'rev-parse', 'HEAD').trim();
}
const head = (dir) => sh(dir, 'rev-parse', 'HEAD').trim();

test('Nothing is offered when main is the same as origin/main', async () => {
  const { git } = setup();
  assert.equal((await updateStatus(git)).state, 'current');
});

test('New commits on origin are offered, and Update moves main to them', async () => {
  const { upstream, app, git } = setup();
  commit(upstream, 'a.txt', 'a', 'Add a');
  const to = commit(upstream, 'b.txt', 'b', 'Add b');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  const s = await updateStatus(git);
  assert.equal(s.state, 'available');
  assert.equal(s.to, to);
  assert.equal(s.count, 2);
  assert.equal(s.local, 0);
  assert.deepEqual(s.titles, ['Add b', 'Add a']);
  const r = await applyUpdate(git, s.to);
  assert.deepEqual(r, { code: 200, body: { updated: true, from: s.head, to, reinstall: false } });
  assert.equal(head(app), to);
  assert.equal(fs.readFileSync(path.join(app, 'b.txt'), 'utf8'), 'b');
  assert.equal((await updateStatus(git)).state, 'current');
});

test('A force-pushed main is offered too, and replaces the commits that are gone', async () => {
  const { upstream, app, git } = setup();
  commit(upstream, 'a.txt', 'a', 'Add a');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  await applyUpdate(git, (await updateStatus(git)).to);
  sh(upstream, 'reset', '-q', '--hard', 'HEAD~1');
  const to = commit(upstream, 'a.txt', 'a2', 'Add a, again');
  sh(upstream, 'push', '-q', '-f', 'origin', 'HEAD:main');
  const s = await updateStatus(git);
  assert.equal(s.state, 'available');
  assert.equal(s.count, 1);
  assert.equal(s.local, 1, 'the commit that is gone from origin');
  assert.equal((await applyUpdate(git, s.to)).body.updated, true);
  assert.equal(head(app), to);
  assert.equal(fs.readFileSync(path.join(app, 'a.txt'), 'utf8'), 'a2');
});

test('Off main, nothing is fetched or offered, and an update is refused', async () => {
  const { upstream, app, git } = setup();
  const to = commit(upstream, 'a.txt', 'a', 'Add a');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  sh(app, 'switch', '-q', '-c', 'work');
  assert.deepEqual(await updateStatus(git), { state: 'off-main', branch: 'work' });
  assert.notEqual(sh(app, 'rev-parse', 'origin/main').trim(), to, 'not fetched');
  sh(app, 'fetch', '-q');
  const r = await applyUpdate(git, to);
  assert.equal(r.code, 409);
  assert.equal(r.body.state, 'off-main');
  sh(app, 'switch', '-q', '--detach');
  assert.deepEqual(await updateStatus(git), { state: 'off-main', branch: null }, 'a detached HEAD is not main');
});

test('Uncommitted changes to tracked files block it; untracked files do not', async () => {
  const { upstream, app, git } = setup();
  commit(upstream, 'a.txt', 'a', 'Add a');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  fs.writeFileSync(path.join(app, 'README.md'), 'changed');
  assert.deepEqual(await updateStatus(git), { state: 'dirty' });
  sh(app, 'fetch', '-q');
  const r = await applyUpdate(git, sh(app, 'rev-parse', 'origin/main').trim());
  assert.equal(r.code, 409);
  assert.equal(fs.readFileSync(path.join(app, 'README.md'), 'utf8'), 'changed', 'the change is kept');
  sh(app, 'checkout', '-q', '--', 'README.md');
  fs.writeFileSync(path.join(app, 'notes.txt'), 'mine');
  const s = await updateStatus(git);
  assert.equal(s.state, 'available');
  assert.equal((await applyUpdate(git, s.to)).body.updated, true);
  assert.equal(fs.readFileSync(path.join(app, 'notes.txt'), 'utf8'), 'mine');
});

test('Only the commit that was checked is installed', async () => {
  const { upstream, app, git } = setup();
  commit(upstream, 'a.txt', 'a', 'Add a');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  const s = await updateStatus(git);
  commit(upstream, 'b.txt', 'b', 'Add b');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  sh(app, 'fetch', '-q');
  const before = head(app);
  assert.deepEqual((await applyUpdate(git, s.to)).body, { error: 'The update changed since it was checked: check again.', stale: true });
  assert.equal(head(app), before);
  for (const bad of [undefined, '', 'main', 'HEAD~1', '--hard', s.to.slice(0, 7), `${s.to} `]) assert.equal((await applyUpdate(git, bad)).code, 400, JSON.stringify(bad));
});

test('A changed installer is reported, so install.sh can run again', async () => {
  const { upstream, git } = setup();
  commit(upstream, 'host/install.sh', 'echo new', 'Installer: new tool path');
  sh(upstream, 'push', '-q', 'origin', 'HEAD:main');
  const s = await updateStatus(git);
  assert.equal((await applyUpdate(git, s.to)).body.reinstall, true);
});

test('An origin that cannot be reached is reported, and nothing changes', async () => {
  const { origin, app, git } = setup();
  fs.rmSync(origin, { recursive: true, force: true });
  const before = head(app);
  assert.equal((await updateStatus(git)).state, 'unreachable');
  assert.equal(head(app), before);
});
