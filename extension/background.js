// gh-glossary service worker. It holds the one connection to the native host (host/host.mjs) and
// passes requests from the content script and the options page to it. An open native port keeps the
// service worker alive (Chrome 105+), so a long Thorough run is not cut off.
import { claudeLink, DEFAULT_TEMPLATES } from './link.js';

const HOST = 'io.github.redfellow.gh_glossary';
let port = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, parts }

function connect() {
  if (port) return port;
  port = chrome.runtime.connectNative(HOST);
  port.onMessage.addListener((msg) => {
    const p = pending.get(msg.id);
    if (!p) return;
    if (msg.parts) { // a reply over 1 MB arrives in parts
      p.parts ||= [];
      p.parts[msg.part] = msg.chunk;
      if (p.parts.filter((x) => x !== undefined).length < msg.parts) return;
      msg = JSON.parse(p.parts.join(''));
    }
    pending.delete(msg.id);
    p.resolve({ code: msg.code, body: msg.body });
  });
  port.onDisconnect.addListener(() => {
    const why = chrome.runtime.lastError?.message || 'the host stopped';
    port = null;
    for (const [id, p] of pending) { pending.delete(id); p.resolve({ code: 0, body: { error: why, down: true } }); }
  });
  return port;
}

function call(method, path, { query, body } = {}) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, { resolve });
    try { connect().postMessage({ id, method, path, query, body }); }
    catch (e) { pending.delete(id); port = null; resolve({ code: 0, body: { error: e.message, down: true } }); }
  });
}

const fromGithubTab = (sender) => sender.id === chrome.runtime.id && /^https:\/\/github\.com\//.test(sender.tab?.url || sender.url || '');
const fromOptions = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('options.html'));

// What each sender may ask the host for.
const CONTENT_ROUTES = new Set(['GET /api/page', 'GET /api/job', 'POST /api/define', 'POST /api/select', 'POST /api/allow']);
const OPTIONS_ROUTES = new Set(['GET /api/health', 'GET /api/allowlist', 'POST /api/disallow', 'GET /api/dir']);

async function sendToClaude(req) {
  const { templates = DEFAULT_TEMPLATES, folders = {} } = await chrome.storage.local.get(['templates', 'folders']);
  const key = Object.keys(folders).find((k) => k.toLowerCase() === String(req.repo).toLowerCase());
  let folder = key ? folders[key] : null;
  if (folder) {
    const r = await call('GET', '/api/dir', { query: { path: folder } });
    if (!r.body?.ok) folder = null;
  }
  return claudeLink({ ...DEFAULT_TEMPLATES, ...templates }, req, folder);
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  (async () => {
    if (msg?.type === 'api') {
      const route = `${msg.method} ${msg.path}`;
      const ok = (fromGithubTab(sender) && CONTENT_ROUTES.has(route)) || (fromOptions(sender) && OPTIONS_ROUTES.has(route));
      if (!ok) return { code: 403, body: { error: 'not allowed from here' } };
      return call(msg.method, msg.path, { query: msg.query, body: msg.body });
    }
    if (msg?.type === 'claude-link' && fromGithubTab(sender)) return { code: 200, body: await sendToClaude(msg) };
    return { code: 400, body: { error: 'unknown request' } };
  })().then(reply, (e) => reply({ code: 500, body: { error: e.message } }));
  return true; // reply comes later
});

chrome.runtime.onInstalled.addListener(() => { connect(); });
chrome.runtime.onStartup.addListener(() => { connect(); });
