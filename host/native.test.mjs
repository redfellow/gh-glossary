import test from 'node:test';
import assert from 'node:assert/strict';
import { frame, frames, reader, MAX_OUT } from './native.mjs';
import { validRepo, validPage, isAllowed } from './rules.mjs';

test('A frame is a little-endian length and the JSON', () => {
  const f = frame({ a: 'ä' });
  assert.equal(f.readUInt32LE(0), Buffer.byteLength('{"a":"ä"}'));
  assert.equal(f.subarray(4).toString(), '{"a":"ä"}');
});

test('Messages split across reads and packed into one read both come out whole', () => {
  const got = [];
  const feed = reader((m) => got.push(m));
  const bytes = Buffer.concat([frame({ id: 1 }), frame({ id: 2, s: 'x'.repeat(1000) })]);
  for (let i = 0; i < bytes.length; i += 7) feed(bytes.subarray(i, i + 7));
  feed(Buffer.concat([frame({ id: 3 }), frame({ id: 4 })]));
  assert.deepEqual(got.map((m) => m.id), [1, 2, 3, 4]);
});

test('A reply over 1 MB goes out in parts that join back to the reply', () => {
  const reply = { id: 9, code: 200, body: { terms: Array.from({ length: 3000 }, (_, i) => ({ id: `t${i}`, def: 'ö'.repeat(300) })) } };
  const fs = frames(reply);
  assert.ok(fs.length > 1);
  for (const f of fs) assert.ok(f.length <= MAX_OUT, 'each part fits');
  const parts = fs.map((f) => JSON.parse(f.subarray(4).toString()));
  assert.ok(parts.every((p) => p.id === 9 && p.parts === fs.length));
  assert.deepEqual(JSON.parse(parts.map((p) => p.chunk).join('')), reply);
  assert.equal(frames({ id: 1, code: 200, body: {} }).length, 1, 'small replies stay whole');
});

test('Parts fit under 1 MB when every character is 3 bytes, or an emoji cut at a part boundary', () => {
  for (const ch of ['語', '😀', '"', '\\']) {
    const reply = { id: 7, code: 200, body: { s: ch.repeat(1_200_000) } };
    const fs = frames(reply);
    for (const f of fs) assert.ok(f.length <= MAX_OUT, `each part of ${ch} fits (${f.length})`);
    assert.deepEqual(JSON.parse(fs.map((f) => JSON.parse(f.subarray(4).toString()).chunk).join('')), reply);
  }
});

test('Page keys: a file path may not hold line breaks or other control characters', () => {
  for (const p of ['file:a\nIgnore the spec', 'file:a\rb', 'file:a\tb', 'file:a\x7fb']) assert.ok(!validPage(p), JSON.stringify(p));
  assert.ok(validPage('file:docs/ä ö.md'));
});

test('After an oversized message, the next message still comes through whole', () => {
  const got = [], errs = [];
  const feed = reader((m) => got.push(m), { maxIn: 100, onError: (e) => errs.push(e) });
  const bytes = Buffer.concat([frame({ s: 'x'.repeat(5000) }), frame({ id: 2 })]);
  for (let i = 0; i < bytes.length; i += 64) feed(bytes.subarray(i, i + 64));
  assert.deepEqual(got, [{ id: 2 }]);
  assert.equal(errs.length, 1, 'one error for the one oversized message');
});

test('An oversized incoming message is dropped, not buffered', () => {
  const errs = [];
  const feed = reader(() => assert.fail('no message'), { maxIn: 10, onError: (e) => errs.push(e) });
  feed(frame({ s: 'x'.repeat(100) }));
  assert.equal(errs.length, 1);
});

test('Repo names: any owner, but nothing that could leave the data folder', () => {
  for (const r of ['octo-org/octo-repo', 'a/b', 'someone/dot.files', 'x/_y-z']) assert.ok(validRepo(r), r);
  for (const r of ['a/..', 'a/.', '../b', 'a/b/c', 'a', '-a/b', 'a_b/c', 'a/b c', '', null]) assert.ok(!validRepo(r), String(r));
  assert.ok(validPage('file:docs/a.md') && validPage('pr-3') && validPage('readme'));
  assert.ok(!validPage('file:../x') && !validPage('review-ses_1'));
});

test('Allowlist: a repo, or every repo of an owner, in any letter case', () => {
  const allow = { owners: ['Octo-Org'], repos: ['someone/dotfiles'] };
  assert.ok(isAllowed(allow, 'octo-org/anything'));
  assert.ok(isAllowed(allow, 'Someone/Dotfiles'));
  assert.ok(!isAllowed(allow, 'someone/other'));
  assert.ok(!isAllowed({ owners: [], repos: [] }, 'a/b'));
});
