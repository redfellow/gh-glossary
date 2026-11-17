import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Routing lives in shared.js (used by the content script, the popup and the service worker); the
// title fix is the content script's.
const files = { route: fs.readFileSync(new URL('./shared.js', import.meta.url), 'utf8'), title: fs.readFileSync(new URL('./content.js', import.meta.url), 'utf8') };
const block = (name) => {
  const src = files[name];
  const a = src.indexOf(`// @ghl-test begin ${name}`), b = src.indexOf(`// @ghl-test end ${name}`);
  assert.ok(a >= 0 && b > a, `markers for ${name}`);
  return src.slice(a, b);
};

// Loads the route and title blocks against a fake page.
function load(path, title = '') {
  const observers = [];
  const ctx = {
    location: { pathname: path },
    document: { title, head: { id: 'head' } },
    MutationObserver: class { constructor(cb) { this.cb = cb; } observe(t, o) { observers.push({ cb: this.cb, target: t, opts: o }); } },
    decodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(`${block('route')}\n${block('title')}\nthis.route = route; this.titleWithPrNumber = titleWithPrNumber; this.syncTitle = syncTitle;`, ctx);
  return { ctx, observers };
}
const plain = (v) => JSON.parse(JSON.stringify(v));
const T = (n) => `Fix login by anna · Pull Request #${n} · octo-org/octo-repo · GitHub`;

test('Any owner works: repo, page and kind from the URL', () => {
  const cases = [
    ['/octo-org/octo-repo', { page: 'readme', kind: 'readme' }],
    ['/someone/dotfiles/pull/7', { page: 'pr-7', pr: '7', kind: 'pr-conversation' }],
    ['/someone/dotfiles/pull/7/changes', { page: 'pr-7', pr: '7', kind: 'pr-files' }],
    ['/someone/dotfiles/pull/7/files', { page: 'pr-7', pr: '7', kind: 'pr-files' }],
    ['/someone/dotfiles/pull/7/commits', { page: 'pr-7', pr: '7', kind: 'pr-other' }],
    ['/someone/dotfiles/issues/3', { page: 'issue-3', kind: 'issue' }],
    ['/someone/dotfiles/discussions/4', { page: 'discussion-4', kind: 'discussion' }],
    ['/someone/dotfiles/blob/main/docs/a.md', { blob: 'main/docs/a.md', kind: 'blob' }],
    ['/someone/dotfiles/tree/dev', { page: 'readme', ref: 'dev', kind: 'readme' }],
  ];
  for (const [p, want] of cases) {
    const r = plain(load(p).ctx.route(''));
    for (const [k, v] of Object.entries(want)) assert.equal(r[k], v, `${p} ${k}`);
    assert.equal(r.repo, p.split('/').slice(1, 3).join('/'));
  }
});

test("GitHub's own pages are not repos: settings, orgs, notifications and the like give nothing", () => {
  for (const p of ['/settings/profile', '/orgs/octo-org/repositories', '/notifications/beta', '/marketplace/actions', '/pulls/review-requested', '/search/x', '/octo-org', '/']) {
    assert.equal(load(p).ctx.route(''), null, p);
  }
});

test('Pages of a repo that are not handled give nothing', () => {
  for (const p of ['/octo-org/octo-repo/actions', '/octo-org/octo-repo/pulls', '/octo-org/octo-repo/tree/main/src', '/octo-org/octo-repo/settings']) {
    assert.equal(load(p).ctx.route(''), null, p);
  }
});

test("Canonical spelling: the page's owner/repo meta wins when it names the same repo", () => {
  const { ctx } = load('/octo-org/octo-repo/pull/1');
  assert.equal(ctx.route('Octo-Org/Octo-Repo').repo, 'Octo-Org/Octo-Repo');
  assert.equal(ctx.route('other/repo').repo, 'octo-org/octo-repo', 'a stale meta from the previous page is ignored');
  assert.equal(ctx.route('').repo, 'octo-org/octo-repo');
});

test('Odd names are refused before they reach the host', () => {
  for (const p of ['/octo_org/repo', '/octo-org/re po', '/' + 'a'.repeat(40) + '/repo']) assert.equal(load(p).ctx.route(''), null, p);
});

test('PR page title gets the number first, once', () => {
  const { ctx } = load('/octo-org/octo-repo/pull/123', T(123));
  ctx.syncTitle();
  assert.equal(ctx.document.title, `#123 ${T(123)}`);
  ctx.syncTitle();
  assert.equal(ctx.document.title, `#123 ${T(123)}`);
  assert.equal(ctx.titleWithPrNumber('x', '123'), '#123 x');
});

test('Every PR sub-page gets it; issues and other pages keep their title', () => {
  for (const sub of ['', '/changes', '/files', '/commits', '/checks']) {
    const { ctx } = load(`/octo-org/octo-repo/pull/123${sub}`, 'Some title');
    ctx.syncTitle();
    assert.ok(ctx.document.title.startsWith('#123 '), sub);
  }
  const { ctx } = load('/octo-org/octo-repo/issues/123', 'Bug · Issue #123');
  ctx.syncTitle();
  assert.equal(ctx.document.title, 'Bug · Issue #123');
});

test('Move to another PR: starts with the new number, never the old one', () => {
  const { ctx } = load('/octo-org/octo-repo/pull/123', T(123));
  ctx.syncTitle();
  ctx.location.pathname = '/octo-org/octo-repo/pull/124';
  ctx.document.title = T(124);
  ctx.syncTitle();
  assert.equal(ctx.document.title, `#124 ${T(124)}`);
});

test('Observer on document.head applies the prefix', () => {
  const { ctx, observers } = load('/octo-org/octo-repo/pull/123', 'Fresh');
  assert.equal(observers.length, 1);
  assert.equal(observers[0].target, ctx.document.head);
  observers[0].cb();
  assert.equal(ctx.document.title, '#123 Fresh');
});

test('A malformed % escape in the address is not a page we handle, so the previous page does not stay active', () => {
  assert.equal(load('/octo-org/octo-repo/blob/main/%E0%A4.md').ctx.route(''), null);
});

test('The popup and the service worker route an address they are given, not the current page', () => {
  const { ctx } = load('/someone/else');
  assert.deepEqual(plain(ctx.route('', '/octo-org/octo-repo/pull/9')), plain(load('/octo-org/octo-repo/pull/9').ctx.route('')));
});
