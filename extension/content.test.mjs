// Checks on the extension's source for rules that are easy to break and hard to see in use:
// nothing in github.com's page can start a run (openspec/changes/display-only-page-view).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
const content = read('content.js'), bg = read('background.js'), popup = read('popup.js'), popover = read('popover.js');
const manifest = JSON.parse(read('manifest.json'));
const from = (src, marker, len = 900) => { const i = src.indexOf(marker); assert.ok(i >= 0, marker); return src.slice(i, i + len); };
const routes = (name) => bg.match(new RegExp(`const ${name} = new Set\\(\\[([^\\]]*)\\]\\)`))[1];

test('The content script only reads: no define, select or allow request, and its routes are reads', () => {
  for (const p of ["'/api/define'", "'/api/select'", "'/api/allow'"]) assert.ok(!content.includes(p), `content.js never asks for ${p}`);
  assert.equal(routes('CONTENT_ROUTES').trim(), "'GET /api/page', 'GET /api/job'");
  assert.equal(routes('POPUP_ROUTES').trim(), "'GET /api/page', 'GET /api/job'");
  assert.ok(!/type === 'ask-allow'/.test(bg), 'no sender can ask for the allow question directly');
});

test('Nothing in the page starts a run: no panel, run buttons or Define button in the content script', () => {
  for (const s of ['data-define', 'data-regen', 'data-claude', 'ghl-panel', 'ghl-sel', 'start-define', "type: 'claude-link'"]) assert.ok(!content.includes(s), s);
  assert.match(content, /attachShadow\(\{ mode: 'closed' \}\)/, 'the tab and the frame are in a closed shadow root');
  assert.ok(!/document\.head\.appendChild/.test(content), 'no <style> element in the page');
  assert.match(content, /document\.adoptedStyleSheets = \[\.\.\.document\.adoptedStyleSheets, sheet\]/);
});

test('The tab opens the popup only for a real click, and opening it starts nothing', () => {
  assert.match(content, /if \(e\.isTrusted && ev\.isTrusted\) toExtension\(\{ type: 'open-popup' \}\);/);
  const h = from(bg, "msg?.type === 'open-popup'", 300);
  assert.match(h, /fromGithubTab\(sender\)/);
  assert.match(h, /chrome\.action\.openPopup/);
});

test('Runs start only for the popup and the context menu, and go through startRun (which asks to allow)', () => {
  assert.match(bg, /msg\?\.type === 'start-define' && fromPopup\(sender\)/);
  assert.equal((bg.match(/startRun\('\/api\/define'/g) || []).length, 1);
  assert.equal((bg.match(/startRun\('\/api\/select'/g) || []).length, 1);
  assert.equal((bg.match(/call\('POST', '\/api\/(define|select)'/g) || []).length, 0, 'no direct define or select call');
  const sr = from(bg, 'async function startRun(', 700);
  assert.match(sr, /r\.code === 403 && r\.body\?\.notAllowed/);
  assert.match(sr, /return \{ code: 403, body: \{ ask: askView\(a\) \} \};/, 'a run on a repo not allowed waits for the question');
  const aa = from(bg, 'async function answerAsk(', 1200);
  assert.match(aa, /if \(now !== a\.url\)/, 'after an allow, only if the tab still shows the page');
  assert.ok(manifest.permissions.includes('contextMenus'));
  assert.match(bg, /documentUrlPatterns: \['https:\/\/github\.com\/\*'\]/);
});

test('Only an answer in the popup adds to the allowlist, and Enter cancels', () => {
  assert.match(bg, /msg\?\.type === 'allow-answer' && fromPopup\(sender\)\) return answerAsk\(msg\.id, msg\.scope\);/);
  assert.equal((bg.match(/'\/api\/allow'/g) || []).length, 1);
  assert.match(from(bg, 'async function answerAsk(', 900), /call\('POST', '\/api\/allow'/);
  assert.match(popup, /document\.getElementById\('cancel'\)\.focus\(\); \/\/ Enter cancels/);
  assert.match(popup, /chrome\.runtime\.connect\(\{ name: 'popup' \}\);/, 'closing the popup drops its question');
  assert.match(from(bg, "chrome.runtime.onConnect.addListener", 400), /port\.onDisconnect\.addListener\(\(\) => \{ if \(asking\?\.shown\) dropAsk\(\); \}\);/);
  assert.ok(!fs.existsSync(new URL('./allow.html', import.meta.url)), 'no separate allow window');
});

test('The definition frame is an extension page the page cannot address', () => {
  assert.deepEqual(manifest.web_accessible_resources, [{ resources: ['popover.html'], matches: ['https://github.com/*'] }]);
  assert.match(content, /frame\.src = chrome\.runtime\.getURL\(`popover\.html#\$\{nonce\}`\)/);
  assert.match(content, /const nonce = crypto\.randomUUID\(\);/);
  assert.match(from(popover, 'chrome.runtime.onMessage.addListener', 200), /sender\.id !== chrome\.runtime\.id \|\| m\?\.nonce !== nonce/);
  assert.match(from(content, 'chrome.runtime.onMessage.addListener', 300), /m\?\.type === 'frame' && m\.nonce === nonce/);
  assert.match(from(bg, "msg?.type === 'pop-event'", 300), /fromFrame\(sender\)[\s\S]*chrome\.tabs\.sendMessage\(sender\.tab\.id/);
});

test('Glossary text is escaped before it becomes HTML, in the frame', () => {
  const pop = from(popover, 'function renderPop()', 1600);
  for (const f of ['g.term', 'g.where', 'g.category', 'g.revisionReason']) assert.ok(pop.includes(`esc(${f}`), f);
  assert.ok(pop.includes('fmt(g.def)'));
  assert.match(from(popover, 'function fmt(s)', 300), /let out = esc\(s\)/);
  assert.match(from(popover, 'function fmt(s)', 500), /esc\(TERM\[id\]\.term\)/);
  assert.match(pop, /const safeLink = linkOf\(g\.link\)/, 'links go through linkOf');
  assert.match(pop, /rel="noopener noreferrer">Open link on \$\{esc\(safeLink\.host\)\}/);
  const lo = from(popover, 'function linkOf(raw)', 400);
  assert.match(lo, /u\.protocol !== 'https:'/); assert.match(lo, /u\.search = ''; u\.hash = '';/);
  // Only two HTML writes in the content script: the shadow root's fixed markup and the tab's badge.
  assert.deepEqual([...content.matchAll(/(\w+)\.innerHTML = /g)].map((m) => m[1]), ['root', 'tab']);
  assert.match(content, /tab\.innerHTML = `<div class="badge">\$\{dot \? `<span class="dot \$\{dot\}"><\/span>` : ''\}<span>gh-glossary<\/span>\$\{n \?/);
});

test('Send to Claude is offered in the popup, on pull requests and Markdown documents only', () => {
  assert.match(popup, /const canSend = \(\) => !!R && \(!!R\.pr \|\| !!docPath\(\)\);/);
  assert.match(popup, /\/\\\.\(\?:md\|mdx\|markdown\)\$\/i/);
  assert.match(bg, /msg\?\.type === 'claude-link' && fromPopup\(sender\)/);
});
