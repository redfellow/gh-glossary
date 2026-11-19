// The service worker run against a stand-in for chrome: which sender may change how outside pages
// are treated, or update gh-glossary. Only the toolbar popup may; the request never reaches the host
// for anyone else.
import test from 'node:test';
import assert from 'node:assert/strict';

const ID = 'gh-glossary-extension-id';
const sent = []; // what was posted to the native host
let onMessage = null, hostReply = null;
const store = {}; // chrome.storage.local
const nothing = { addListener() {} };
globalThis.chrome = {
  runtime: {
    id: ID, lastError: null,
    getURL: (p) => `chrome-extension://${ID}/${p}`,
    connectNative: () => ({
      onMessage: { addListener: (f) => { hostReply = f; } }, onDisconnect: nothing,
      postMessage: (m) => { sent.push(m); queueMicrotask(() => hostReply({ id: m.id, code: 200, body: { mode: m.body?.mode } })); },
    }),
    onMessage: { addListener: (f) => { onMessage = f; } },
    onConnect: nothing, onInstalled: nothing, onStartup: nothing,
  },
  contextMenus: { onClicked: nothing, removeAll() {}, create() {}, update() {} },
  tabs: { get: async () => ({}), sendMessage: async () => {} },
  storage: { local: {
    get: async (keys) => Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, store[k]])),
    set: async (o) => { Object.assign(store, o); },
    remove: async (keys) => { for (const k of [keys].flat()) delete store[k]; },
  } },
  action: { openPopup: async () => {}, setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {}, setTitle: async () => {} },
};
await import('./background.js');

const ask = (msg, sender) => new Promise((resolve) => { if (onMessage(msg, sender, resolve) === false) resolve('not for the service worker'); });
const page = (name) => ({ id: ID, url: `chrome-extension://${ID}/${name}` });
const github = 'https://github.com/octo-org/widgets/pull/1';
const SENDERS = {
  'the content script': { id: ID, url: github, tab: { id: 1, url: github } },
  'the options page': page('options.html'),
  'the definition frame': { ...page('popover.html#nonce'), tab: { id: 1, url: github } },
  'another extension': { id: 'someone-else', url: 'chrome-extension://someone-else/popup.html' },
};

test('Only the popup changes how outside pages are treated', async () => {
  for (const [who, sender] of Object.entries(SENDERS)) {
    assert.deepEqual(await ask({ type: 'set-outside', mode: 'off' }, sender), { code: 400, body: { error: 'unknown request' } }, who);
    assert.deepEqual(await ask({ type: 'api', method: 'POST', path: '/api/outside', body: { mode: 'off' } }, sender), { code: 403, body: { error: 'not allowed from here' } }, `${who}, asking the host directly`);
  }
  assert.equal((await ask({ type: 'api', method: 'POST', path: '/api/outside', body: { mode: 'off' } }, page('popup.html'))).code, 403, 'the popup\'s general requests only read');
  assert.deepEqual(sent, [], 'nothing reached the host');
  assert.deepEqual(await ask({ type: 'set-outside', mode: 'outside-pages' }, page('popup.html')), { code: 200, body: { mode: 'outside-pages' } });
  assert.equal(sent.length, 1);
  const { id: _id, ...request } = sent[0];
  assert.deepEqual(JSON.parse(JSON.stringify(request)), { method: 'POST', path: '/api/outside', body: { mode: 'outside-pages' } });
});

test('Only the popup checks for or installs an update of gh-glossary', async () => {
  sent.length = 0;
  const TO = 'a'.repeat(40);
  store.update = { state: 'available', to: TO, count: 2, local: 0, titles: ['Two', 'One'], checkedAt: Date.now() };
  for (const [who, sender] of Object.entries(SENDERS)) {
    for (const type of ['update-status', 'update-apply']) assert.deepEqual(await ask({ type }, sender), { code: 400, body: { error: 'unknown request' } }, `${who}: ${type}`);
    for (const method of ['GET', 'POST']) assert.equal((await ask({ type: 'api', method, path: '/api/update', body: { to: TO } }, sender)).code, 403, `${who}, asking the host directly`);
  }
  for (const method of ['GET', 'POST']) assert.equal((await ask({ type: 'api', method, path: '/api/update', body: { to: TO } }, page('popup.html'))).code, 403, 'not through the popup\'s general requests either');
  assert.deepEqual(sent, [], 'nothing reached the host');
  const status = await ask({ type: 'update-status' }, page('popup.html'));
  assert.equal(status.body.update.to, TO, 'checked today, so the host is not asked again');
  assert.deepEqual(sent, []);
  await ask({ type: 'update-apply', to: 'b'.repeat(40) }, page('popup.html'));
  assert.equal(sent.length, 1);
  const { id: _id, ...request } = sent[0];
  assert.deepEqual(JSON.parse(JSON.stringify(request)), { method: 'POST', path: '/api/update', body: { to: TO } }, 'the commit that was checked, not one the popup names');
});
