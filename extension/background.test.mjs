// The service worker run against a stand-in for chrome: which sender may change how outside pages
// are treated. Only the toolbar popup may; the request never reaches the host for anyone else.
import test from 'node:test';
import assert from 'node:assert/strict';

const ID = 'gh-glossary-extension-id';
const sent = []; // what was posted to the native host
let onMessage = null, hostReply = null;
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
  contextMenus: { onClicked: nothing, removeAll() {}, create() {} },
  tabs: { get: async () => ({}), sendMessage: async () => {} },
  storage: { local: { get: async () => ({}) } },
  action: { openPopup: async () => {} },
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
