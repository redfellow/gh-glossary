import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeLink, fill, DEFAULT_TEMPLATES } from './link.js';
import { parseFolders } from './options-parse.js';

const q = (url) => decodeURIComponent(new URL(url).searchParams.get('q'));

test('PR: neutral prompt with repo, number, URL and the gh command', () => {
  const r = claudeLink(DEFAULT_TEMPLATES, { kind: 'pr', repo: 'octo-org/octo-repo', number: '41' }, null);
  assert.ok(r.url.startsWith('claude://code/new?q='));
  assert.equal(r.folder, false);
  const text = q(r.url);
  assert.ok(text.startsWith('octo-org/octo-repo#41 https://github.com/octo-org/octo-repo/pull/41'));
  assert.ok(text.includes('gh pr view 41 --repo octo-org/octo-repo'));
  assert.ok(!r.url.includes('folder='));
});

test('Markdown document: path, ref and blob URL', () => {
  const r = claudeLink(DEFAULT_TEMPLATES, { kind: 'doc', repo: 'octo-org/octo-repo', path: 'docs/design notes.md', ref: 'main' }, '/Users/me/code/octo repo');
  const text = q(r.url);
  assert.ok(text.includes('octo-org/octo-repo docs/design notes.md at main https://github.com/octo-org/octo-repo/blob/main/docs/design notes.md'));
  assert.equal(r.folder, true);
  assert.equal(new URL(r.url).searchParams.get('folder'), '/Users/me/code/octo repo');
});

test('Custom template: placeholders are filled, other braces are left alone', () => {
  assert.equal(fill('/pr-review-fixups {url} {other}', { url: 'https://x' }), '/pr-review-fixups https://x {other}');
  const r = claudeLink({ ...DEFAULT_TEMPLATES, pr: '/pr-review-fixups {url}' }, { kind: 'pr', repo: 'a/b', number: 2 }, null);
  assert.equal(q(r.url), '/pr-review-fixups https://github.com/a/b/pull/2');
});

test('Bad input is refused', () => {
  assert.throws(() => claudeLink(DEFAULT_TEMPLATES, { kind: 'pr', repo: 'a/b', number: 'x' }, null));
  assert.throws(() => claudeLink(DEFAULT_TEMPLATES, { kind: 'pr', repo: 'a b/c', number: 1 }, null));
  assert.throws(() => claudeLink(DEFAULT_TEMPLATES, { kind: 'doc', repo: 'a/b', path: '../x.md', ref: 'main' }, null));
  assert.throws(() => claudeLink(DEFAULT_TEMPLATES, { kind: 'shell', repo: 'a/b' }, null));
});

test('Folder lines: owner/repo = /path, anything else is reported', () => {
  const { folders, bad } = parseFolders('octo-org/octo-repo = /Users/me/octo\n\n  a/b=/x y  \nnot a line\nc/d = relative/path');
  assert.deepEqual(folders, { 'octo-org/octo-repo': '/Users/me/octo', 'a/b': '/x y' });
  assert.deepEqual(bad, ['not a line', 'c/d = relative/path']);
});

test('Folder lines: Windows absolute paths are accepted, relative ones reported', () => {
  const { folders, bad } = parseFolders('acme/widgets = C:\\code\\widgets\r\nacme/b = d:/src/b\nacme/c = \\\\server\\share\\c\nacme/d = code\\d\nacme/e = C:widgets\nacme/f = \\\\\\x');
  assert.deepEqual(folders, { 'acme/widgets': 'C:\\code\\widgets', 'acme/b': 'd:/src/b', 'acme/c': '\\\\server\\share\\c' });
  assert.deepEqual(bad, ['acme/d = code\\d', 'acme/e = C:widgets', 'acme/f = \\\\\\x']);
});
