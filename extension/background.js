// gh-glossary service worker. It holds the one connection to the native host (host/host.mjs) and
// passes requests from the extension's pages and the content script to it. An open native port keeps
// the service worker alive (Chrome 105+), so a long Thorough run is not cut off.
// Runs start only here, for the toolbar popup and the context menu: nothing in github.com's page can
// start one (openspec/changes/display-only-page-view).
import { claudeLink, DEFAULT_TEMPLATES } from './link.js';
import './shared.js';
const { route, pageQuery } = globalThis.ghl;

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

// Every request gets an answer: one the host never replies to fails after two minutes.
function call(method, path, { query, body } = {}) {
  return new Promise((resolve) => {
    const id = nextId++;
    const timer = setTimeout(() => { if (pending.delete(id)) resolve({ code: 0, body: { error: 'the host did not answer', down: true } }); }, 120_000);
    pending.set(id, { resolve: (r) => { clearTimeout(timer); resolve(r); } });
    try { connect().postMessage({ id, method, path, query, body }); }
    catch (e) { pending.delete(id); port = null; resolve({ code: 0, body: { error: e.message, down: true } }); }
  });
}

const fromGithubTab = (sender) => sender.id === chrome.runtime.id && /^https:\/\/github\.com\//.test(sender.tab?.url || sender.url || '');
const fromOptions = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('options.html'));

const fromPopup = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('popup.html'));
const fromFrame = (sender) => sender.id === chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('popover.html')) && sender.tab?.id >= 0;

// What each sender may ask the host for: the content script and the popup only read. Runs start
// through start-define and the context menu below, and only an answer in the popup (allow-answer)
// adds to the allowlist.
const CONTENT_ROUTES = new Set(['GET /api/page', 'GET /api/job']);
const POPUP_ROUTES = new Set(['GET /api/page', 'GET /api/job']);
const OPTIONS_ROUTES = new Set(['GET /api/health', 'GET /api/allowlist', 'POST /api/disallow', 'GET /api/dir']);

// ---------- asking to allow, in the popup ----------
// One question at a time: { id, repo, what, tabId, url, path, body, after, cancelled, shown }. The
// popup shows it (the extension's own page, which no script on github.com can reach); an allow there
// adds to the allowlist and starts the run the question was for. Cancel, Escape or Enter, or closing
// the popup, drops it, and a newer question replaces it.
let asking = null, nextAsk = 1;
const askView = (a) => a && { id: a.id, repo: a.repo, what: a.what };
function dropAsk() { const a = asking; asking = null; a?.cancelled?.(); }
function ask(fields) { dropAsk(); asking = { id: nextAsk++, shown: false, ...fields }; return asking; }

// Starts a run. When the host refuses it because the repository is not allowed, the run waits for an
// answer in the popup: the reply carries the question ({ ask }) instead. After the run starts, the tab
// is told to reload its data so its dot shows the run.
async function startRun(path, body, tabId, url, { what, after, cancelled } = {}) {
  const r = await call('POST', path, { body });
  if (r.code === 403 && r.body?.notAllowed) {
    const a = ask({ repo: body.repo, what, tabId, url, path, body, after, cancelled });
    return { code: 403, body: { ask: askView(a) } };
  }
  if (r.code === 202) { chrome.tabs.sendMessage(tabId, { type: 'reload' }).catch(() => {}); after?.(r); }
  return r;
}
// The reader's answer in the popup. An allow starts the waiting run only if the tab still shows the
// page it was asked for.
async function answerAsk(id, scope) {
  if (!asking || asking.id !== id) return { code: 400, body: { error: 'This question has expired: click Quick, Thorough or Define again.' } };
  if (scope === 'cancel') { dropAsk(); return { code: 200, body: { cancelled: true } }; }
  if (!['repo', 'owner'].includes(scope)) return { code: 400, body: { error: 'bad scope' } };
  const a = asking; asking = null;
  const allowed = await call('POST', '/api/allow', { body: { repo: a.repo, scope } });
  if (allowed.code !== 200) { a.cancelled?.(); return allowed; }
  let now = null; try { now = (await chrome.tabs.get(a.tabId)).url; } catch {}
  if (now !== a.url) { a.cancelled?.(); return { code: 409, body: { error: 'Allowed. The tab moved to another page, so nothing started.' } }; }
  const r = await call('POST', a.path, { body: a.body });
  if (r.code === 202) { chrome.tabs.sendMessage(a.tabId, { type: 'reload' }).catch(() => {}); a.after?.(r); }
  else a.cancelled?.();
  return r;
}
// Closing the popup that showed the question cancels it. Opening it is also when updates are checked.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup' || port.sender?.id !== chrome.runtime.id || !port.sender?.url?.startsWith(chrome.runtime.getURL('popup.html'))) return;
  updateInfo().catch(() => {});
  port.onDisconnect.addListener(() => { if (asking?.shown) dropAsk(); });
});

// ---------- updating gh-glossary itself (openspec/specs/self-update) ----------
// Checked only when the reader uses the extension (the popup opens, or a Define from the context
// menu), at most once a day. The host offers an update only on a clean main that differs from
// origin/main; then the toolbar icon gets a badge, the popup a line, and the icon's menu an item.
const DAY = 24 * 3600_000;
let checking = null;
async function updateInfo({ force = false } = {}) {
  const { update = null } = await chrome.storage.local.get('update');
  if (!force && update && Date.now() - update.checkedAt < DAY) return update;
  checking ||= (async () => {
    const r = await call('GET', '/api/update');
    if (r.code !== 200) return update; // the host is down: check again next time
    const u = { ...r.body, checkedAt: Date.now() };
    await chrome.storage.local.set({ update: u });
    showUpdate(u);
    return u;
  })().finally(() => { checking = null; });
  return checking;
}
function showUpdate(u) {
  const on = u?.state === 'available';
  chrome.action.setBadgeText({ text: on ? '↑' : '' }).catch(() => {});
  if (on) chrome.action.setBadgeBackgroundColor({ color: '#1f6feb' }).catch(() => {});
  chrome.action.setTitle({ title: on ? `GitHub Glossary: an update is ready (${u.count} new)` : 'GitHub Glossary' }).catch(() => {});
  chrome.contextMenus.update('ghl-update', { visible: on, title: on ? `Update GitHub Glossary now (${u.count} new)` : 'Update GitHub Glossary now' }, () => void chrome.runtime.lastError);
}
// Moves main to the commit last checked, then reloads the extension, which restarts the host on the
// new code. What happened is kept for the popup to say after the reload.
async function runUpdate() {
  const { update = null } = await chrome.storage.local.get('update');
  if (update?.state !== 'available') return { code: 409, body: { error: 'There is no update to install.' } };
  const r = await call('POST', '/api/update', { body: { to: update.to } });
  if (r.code !== 200) {
    if (r.body?.stale || r.body?.state) await updateInfo({ force: true });
    return r;
  }
  const done = { state: 'current', head: r.body.to, checkedAt: Date.now() };
  await chrome.storage.local.set({ update: done, updated: { at: Date.now(), count: update.count, reinstall: r.body.reinstall } });
  showUpdate(done);
  if (r.body.updated) setTimeout(() => chrome.runtime.reload(), 300); // after the reply has gone
  return r;
}
chrome.storage.local.get('update').then(({ update }) => showUpdate(update)).catch(() => {});

const sameQuery = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The page a popup asks for must be the one its tab shows.
function routeOfUrl(url, nwo = '') {
  let u; try { u = new URL(url); } catch { return null; }
  return u.origin === 'https://github.com' ? route(nwo, u.pathname) : null;
}

// A content script reads only for the repository its own tab shows: the glossary of that page, and
// Select jobs, whose keys start with the repository. Another github.com tab (or a compromised page
// renderer) cannot read the glossaries of other repositories, private ones included.
function contentReadOk(sender, p, query) {
  const repo = routeOfUrl(sender.tab?.url || '')?.repo?.toLowerCase();
  if (!repo) return false;
  if (p === '/api/page') return String(query?.repo ?? '').toLowerCase() === repo;
  if (p === '/api/job') return String(query?.key ?? '').toLowerCase().startsWith(`${repo}#`);
  return false;
}

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
  // The content script's messages to its definition frame are not for the service worker.
  if (msg?.type === 'pop-glossary' || msg?.type === 'pop-show' || msg?.type === 'pop-hide') return false;
  (async () => {
    if (msg?.type === 'api') {
      const r = `${msg.method} ${msg.path}`;
      const ok = (fromGithubTab(sender) && CONTENT_ROUTES.has(r) && contentReadOk(sender, msg.path, msg.query)) || (fromPopup(sender) && POPUP_ROUTES.has(r)) || (fromOptions(sender) && OPTIONS_ROUTES.has(r));
      if (!ok) return { code: 403, body: { error: 'not allowed from here' } };
      return call(msg.method, msg.path, { query: msg.query, body: msg.body });
    }
    if (msg?.type === 'claude-link' && fromPopup(sender)) return { code: 200, body: await sendToClaude(msg) };
    if (msg?.type === 'start-define' && fromPopup(sender)) {
      if (!['quick', 'thorough'].includes(msg.mode)) return { code: 400, body: { error: 'bad mode' } };
      let tabNow; try { tabNow = await chrome.tabs.get(msg.tabId); } catch { return { code: 400, body: { error: 'The tab is gone.' } }; }
      const R = routeOfUrl(tabNow.url, msg.query?.repo);
      if (!R || tabNow.url !== msg.url || !sameQuery(pageQuery(R), msg.query)) return { code: 409, body: { error: 'The tab shows another page now: open the popup again.' } };
      const r = await startRun('/api/define', { ...msg.query, mode: msg.mode, regenerate: !!msg.regenerate }, tabNow.id, tabNow.url, { what: msg.mode === 'thorough' ? 'Thorough' : 'Quick' });
      if (r.body?.ask) asking.shown = true; // this popup shows it
      return r;
    }
    // The question waiting for this tab, if any (a Define from the context menu opens the popup for it).
    if (msg?.type === 'allow-pending' && fromPopup(sender)) {
      if (!asking || asking.tabId !== msg.tabId) return { code: 200, body: { ask: null } };
      asking.shown = true;
      return { code: 200, body: { ask: askView(asking) } };
    }
    if (msg?.type === 'allow-answer' && fromPopup(sender)) return answerAsk(msg.id, msg.scope);
    if (msg?.type === 'update-status' && fromPopup(sender)) {
      const { updated = null, updateError = null } = await chrome.storage.local.get(['updated', 'updateError']);
      await chrome.storage.local.remove(['updated', 'updateError']);
      return { code: 200, body: { update: await updateInfo(), updated, updateError } };
    }
    if (msg?.type === 'update-apply' && fromPopup(sender)) return runUpdate();
    // How outside pages are treated is the reader's choice, made in the popup like an allow.
    if (msg?.type === 'set-outside' && fromPopup(sender)) return call('POST', '/api/outside', { body: { mode: msg.mode } });
    // The content script's tab click: only the reader's own click reaches here (the content script
    // checks isTrusted), and opening the popup starts nothing by itself.
    if (msg?.type === 'open-popup' && fromGithubTab(sender)) {
      try { await chrome.action.openPopup({ windowId: sender.tab.windowId }); return { code: 200, body: {} }; } catch (e) { return { code: 500, body: { error: e.message } }; }
    }
    // The definition frame's events go to the content script of the frame's own tab.
    if (msg?.type === 'pop-event' && fromFrame(sender)) {
      chrome.tabs.sendMessage(sender.tab.id, { type: 'frame', nonce: msg.nonce, event: msg.event, value: msg.value }, { frameId: 0 }).catch(() => {});
      return null;
    }
    return { code: 400, body: { error: 'unknown request' } };
  })().then(reply, (e) => reply({ code: 500, body: { error: e.message } }));
  return true; // reply comes later
});

// ---------- Define a selection, from the context menu ----------
const shorten = (t, n = 28) => t.length > n ? t.slice(0, n - 1) + '…' : t;
function setupMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'ghl-define', title: 'Define “%s” with GitHub Glossary', contexts: ['selection'], documentUrlPatterns: ['https://github.com/*'] });
    chrome.contextMenus.create({ id: 'ghl-update', title: 'Update GitHub Glossary now', contexts: ['action'], visible: false }, () => {
      void chrome.runtime.lastError;
      chrome.storage.local.get('update').then(({ update }) => showUpdate(update)).catch(() => {});
    });
  });
}
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'ghl-update') {
    // A refusal is shown in the popup, which opens for it.
    const r = await runUpdate();
    if (r.code !== 200) {
      await chrome.storage.local.set({ updateError: r.body?.error || `error ${r.code}` });
      chrome.action.openPopup().catch(() => {});
    }
    return;
  }
  if (info.menuItemId !== 'ghl-define' || !tab?.id || info.frameId) return;
  updateInfo().catch(() => {});
  // Shown beside the tab as well as in its tooltip: a Define that starts nothing must say why.
  const note = (text, tone) => chrome.tabs.sendMessage(tab.id, { type: 'note', text, tone, toast: true }).catch(() => {});
  let s;
  try { s = await chrome.tabs.sendMessage(tab.id, { type: 'selection' }, { frameId: 0 }); } catch { return; }
  if (!s || s.known) return;
  if (s.problem) { note(s.problem, 'bad'); return; }
  const R = routeOfUrl(tab.url, s.nwo);
  if (!R) { note('This page is not one GitHub Glossary handles.', 'bad'); return; }
  const started = (r) => chrome.tabs.sendMessage(tab.id, { type: 'select-started', key: r.body.key, text: s.text }).catch(() => {});
  const r = await startRun('/api/select', { ...pageQuery(R), text: s.text, context: s.context }, tab.id, tab.url, {
    what: `Define “${shorten(s.text)}”`, after: started, cancelled: () => note(`Not allowed: “${shorten(s.text)}” was not defined.`),
  });
  if (r.body?.ask) {
    // Not allowed yet: the popup asks. If Chrome cannot open it now, the tab says where to answer.
    let opened = true;
    try { await chrome.action.openPopup({ windowId: tab.windowId }); } catch { opened = false; }
    note(opened ? `${R.repo} is not allowed yet: answer in the GitHub Glossary popup to define “${shorten(s.text)}”.`
      : `${R.repo} is not allowed yet: click the GitHub Glossary tab to allow it and define “${shorten(s.text)}”.`, 'bad');
  } else if (r.code !== 202) note(`Could not define “${shorten(s.text)}”: ${r.body?.error || `error ${r.code}`}`, 'bad');
});

chrome.runtime.onInstalled.addListener(() => { setupMenu(); connect(); });
chrome.runtime.onStartup.addListener(() => { connect(); });
