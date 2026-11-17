// gh-glossary content script on github.com.
// How it draws without fighting GitHub's React: terms are CSS Custom Highlights (Range objects, no DOM
// edits) and hover is found by position. The only DOM it adds is the panel, the popover, the
// select-to-define button and the allow prompt.

(async function () {
  'use strict';

  // ---------- settings & transport ----------
  // chrome.storage is async; read it once and keep a copy so the drawing code can stay synchronous.
  let store = {};
  try { store = await chrome.storage.local.get(null); } catch {}
  const getVal = (k, d) => (k in store ? store[k] : d);
  const setVal = (k, v) => { store[k] = v; try { chrome.storage.local.set({ [k]: v }); } catch {} };

  // Every host request goes through the service worker, which holds the native messaging port.
  async function api(method, path, { query, body } = {}) {
    let r;
    try { r = await chrome.runtime.sendMessage({ type: 'api', method, path, query, body }); }
    catch (e) { throw Object.assign(new Error('The extension was reloaded: reload this page.'), { code: 'stale' }); }
    if (!r || r.code === 0) throw Object.assign(new Error(r?.body?.error || 'host not reachable'), { code: 'down' });
    if (r.code === 403 && r.body?.notAllowed) throw Object.assign(new Error(r.body.error), { code: 'notAllowed' });
    if (r.code >= 400) throw new Error(r.body?.error || `error ${r.code}`);
    return r.body;
  }

  // ---------- which page is this ----------
  // kind: pr-conversation | pr-files | pr-other | issue | discussion | blob | readme
  // @ghl-test begin route
  // First path segments that are GitHub's own pages, not an owner.
  const RESERVED = new Set(['about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'copilot', 'dashboard', 'enterprise', 'enterprises',
    'events', 'explore', 'features', 'gist', 'github-copilot', 'issues', 'login', 'logout', 'marketplace', 'new', 'notifications', 'orgs', 'organizations',
    'pricing', 'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup', 'site', 'sponsors', 'stars', 'team', 'topics', 'trending', 'users']);
  function route(nwo) {
    const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2 || RESERVED.has(parts[0].toLowerCase())) return null;
    if (!/^[A-Za-z0-9-]{1,39}$/.test(parts[0]) || !/^[A-Za-z0-9_.-]{1,100}$/.test(parts[1])) return null;
    // GitHub URLs are case-insensitive; the page's own owner/repo meta has the canonical spelling.
    const typed = `${parts[0]}/${parts[1]}`;
    const repo = nwo && nwo.toLowerCase() === typed.toLowerCase() ? nwo : typed, rest = parts.slice(2);
    const r = (o) => ({ repo, ...o, key: `${repo}|${o.page || ''}|${o.blob || ''}|${o.ref || ''}|${o.kind}` });
    if (rest[0] === 'pull' && /^\d+$/.test(rest[1] || '')) {
      const sub = rest[2] || '';
      return r({ page: `pr-${rest[1]}`, pr: rest[1], kind: sub === '' ? 'pr-conversation' : (sub === 'changes' || sub === 'files') ? 'pr-files' : 'pr-other' });
    }
    if (rest[0] === 'issues' && /^\d+$/.test(rest[1] || '')) return r({ page: `issue-${rest[1]}`, kind: 'issue' });
    if (rest[0] === 'discussions' && /^\d+$/.test(rest[1] || '')) return r({ page: `discussion-${rest[1]}`, kind: 'discussion' });
    if (rest[0] === 'blob' && rest.length >= 3) return r({ blob: rest.slice(1).join('/'), kind: 'blob' });
    if (rest.length === 0) return r({ page: 'readme', kind: 'readme' });
    if (rest[0] === 'tree' && rest.length === 2) return r({ page: 'readme', ref: rest[1], kind: 'readme' });
    return null;
  }
  // @ghl-test end route
  const pageNwo = () => document.querySelector('meta[name="octolytics-dimension-repository_nwo"]')?.content || '';

  // ---------- PR number first in the window title ----------
  // @ghl-test begin title
  function titleWithPrNumber(title, pr) {
    const prefix = `#${pr} `;
    return title.startsWith(prefix) ? title : prefix + title;
  }
  function syncTitle() {
    const pr = route('')?.pr;
    if (!pr) return;
    const next = titleWithPrNumber(document.title, pr);
    if (next !== document.title) document.title = next;
  }
  new MutationObserver(syncTitle).observe(document.head, { childList: true, subtree: true, characterData: true });
  // @ghl-test end title

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let R = null;            // current route
  let data = null;         // response of GET /api/page
  let msg = null;          // { text, tone } transient error / info
  let terms = [], TERM = {};
  let codeRe = null, proseRe = null, codeTerms = [], proseTerms = [];
  let on = { defs: getVal('defs', true) };
  let regen = false;

  // ---------- styles (GitHub's own Primer variables, so light and dark both work) ----------
  const css = `
  #ghl-panel { position: fixed; top: 72px; right: 16px; z-index: 2147483000; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--fgColor-default, #1f2328); background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #d1d9e0);
    border-radius: 10px; box-shadow: 0 6px 20px rgba(0,0,0,.14); width: 340px; max-width: calc(100vw - 32px);
    display: flex; flex-direction: column; max-height: calc(100vh - 90px); resize: both; overflow: hidden; min-width: 260px; min-height: 60px; transition: opacity .15s ease; }
  #ghl-panel[hidden] { display: none !important; }
  #ghl-panel:not(:hover):not(:focus-within):not(.dragging) { opacity: .35; }
  #ghl-panel .row { display: flex; align-items: center; gap: 6px; padding: 7px 10px; flex-wrap: wrap; }
  #ghl-panel .row + .row { padding-top: 0; }
  #ghl-panel .row:first-child { cursor: move; user-select: none; }
  #ghl-panel .title { font-weight: 600; margin-right: auto; }
  #ghl-panel .lbl { color: var(--fgColor-muted, #59636e); margin-right: 2px; }
  #ghl-panel .status { padding: 0 10px 9px; color: var(--fgColor-muted, #59636e); }
  #ghl-panel .status div + div { margin-top: 3px; }
  #ghl-panel .warn { color: var(--fgColor-attention, #9a6700); }
  #ghl-panel .bad { color: var(--fgColor-danger, #d1242f); }
  #ghl-panel .btn, #ghl-allow .btn { border: 1px solid var(--borderColor-default, #d1d9e0); background: var(--bgColor-muted, #f6f8fa); color: inherit; border-radius: 6px; padding: 3px 9px; cursor: pointer; font: inherit; }
  #ghl-panel .btn:hover, #ghl-allow .btn:hover { border-color: var(--fgColor-accent, #0969da); }
  #ghl-panel .btn[disabled] { opacity: .5; cursor: default; border-color: var(--borderColor-default, #d1d9e0); }
  #ghl-panel label.chk { display: inline-flex; gap: 4px; align-items: center; color: var(--fgColor-muted, #59636e); cursor: pointer; margin-left: 4px; }
  .ghl-sw { display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; color: inherit; font: inherit; cursor: pointer; padding: 2px 4px; }
  .ghl-sw[disabled] { opacity: .45; cursor: default; }
  .ghl-sw i { width: 28px; height: 16px; border-radius: 9px; background: var(--borderColor-default, #d1d9e0); position: relative; flex: none; }
  .ghl-sw i::after { content: ""; position: absolute; top: 2px; left: 2px; width: 12px; height: 12px; border-radius: 50%; background: #fff; transition: transform .12s; }
  .ghl-sw[aria-checked="true"] i { background: var(--fgColor-accent, #0969da); }
  .ghl-sw[aria-checked="true"] i::after { transform: translateX(12px); }
  #ghl-panel .min { border: 0; background: none; color: var(--fgColor-muted, #59636e); cursor: pointer; font: inherit; padding: 0 4px; }
  #ghl-panel.is-min:not(.peeking) .row:not(:first-child), #ghl-panel.is-min:not(.peeking) .status { display: none; }
  #ghl-panel.is-min:not(.peeking) { width: auto !important; height: auto !important; resize: none; }
  #ghl-panel.docked { width: auto !important; height: auto !important; min-width: 0; min-height: 0; resize: none; cursor: pointer; user-select: none; }
  #ghl-panel.docked.dock-right { left: auto !important; right: 0 !important; border-right: 0; border-radius: 8px 0 0 8px; }
  #ghl-panel.docked.dock-left { right: auto !important; left: 0 !important; border-left: 0; border-radius: 0 8px 8px 0; }
  #ghl-panel.docked:not(:hover):not(.dragging) { opacity: .6; }
  #ghl-panel.peeking { resize: none; opacity: 1 !important; box-shadow: 0 10px 32px rgba(0,0,0,.24); transition: opacity .15s ease, box-shadow .32s ease; }
  #ghl-panel.peeking.dock-right { border-right: 0; border-radius: 10px 0 0 10px; }
  #ghl-panel.peeking.dock-left { border-left: 0; border-radius: 0 10px 10px 0; }
  #ghl-panel .badge { writing-mode: vertical-rl; display: flex; align-items: center; gap: 6px; padding: 10px 5px; font-weight: 600; }
  #ghl-panel.dock-left .badge, #ghl-panel.dock-left .badge .n { transform: rotate(180deg); }
  #ghl-panel .badge .n { writing-mode: horizontal-tb; font: 700 10.5px/1 -apple-system, sans-serif; padding: 2px 4px; border-radius: 8px; background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-muted, #59636e); }
  #ghl-panel .badge .n.off { opacity: .5; text-decoration: line-through; }
  #ghl-panel .badge .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  #ghl-panel .badge .dot.busy { background: var(--fgColor-accent, #0969da); animation: ghl-pulse 1.2s ease-in-out infinite; }
  #ghl-panel .badge .dot.bad { background: var(--fgColor-danger, #d1242f); }
  @keyframes ghl-pulse { 50% { opacity: .25; } }
  .ghl-layer { font: 600 10.5px/1 -apple-system, sans-serif; text-transform: uppercase; letter-spacing: .05em; padding: 3px 6px; border-radius: 9px; background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-muted, #59636e); }
  .ghl-layer.org { background: #fbefff; color: #8250df; }
  html.ghl-hover-term, html.ghl-hover-term * { cursor: help !important; }
  ::highlight(ghl-term) { text-decoration: underline dotted var(--fgColor-accent, #0969da); text-decoration-thickness: 1.5px; }
  ::highlight(ghl-active) { background-color: var(--bgColor-accent-muted, rgba(84,174,255,.2)); }
  #ghl-pop { position: fixed; z-index: 2147483001; width: min(420px, calc(100vw - 24px)); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--fgColor-default, #1f2328); background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #d1d9e0); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.2); }
  #ghl-pop[hidden], #ghl-allow[hidden] { display: none; }
  #ghl-pop.pinned { border-color: var(--fgColor-accent, #0969da); }
  #ghl-pop .ph { display: flex; align-items: center; gap: 8px; padding: 8px 12px 6px; border-bottom: 1px solid var(--borderColor-default, #d1d9e0); }
  #ghl-pop .kind { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; font-weight: 600; color: var(--fgColor-muted, #59636e); }
  #ghl-pop .kind.def { color: var(--fgColor-accent, #0969da); }
  #ghl-pop .sp { flex: 1; }
  #ghl-pop .ph button { border: 0; background: none; color: var(--fgColor-muted, #59636e); cursor: pointer; font: inherit; font-size: 13px; padding: 2px 6px; border-radius: 5px; }
  #ghl-pop .pb { padding: 10px 14px 10px; max-height: 50vh; overflow: auto; }
  #ghl-pop .pt { font-weight: 600; font-size: 15px; margin-bottom: 3px; }
  #ghl-pop .where { font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--fgColor-muted, #59636e); margin-bottom: 6px; }
  #ghl-pop code { font: 12.5px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--bgColor-muted, #f6f8fa); padding: .1em .35em; border-radius: 4px; }
  #ghl-pop .xref { color: var(--fgColor-accent, #0969da); cursor: pointer; text-decoration: underline; text-underline-offset: 2px; background: none; border: 0; padding: 0; font: inherit; }
  #ghl-pop .prov { font-size: 12px; color: var(--fgColor-muted, #59636e); padding: 0 14px 10px; }
  #ghl-pop .prov a { color: inherit; }
  #ghl-pop .crumbs, #ghl-pop .hint { font-size: 12px; color: var(--fgColor-muted, #59636e); padding: 0 14px 10px; }
  #ghl-sel { position: fixed; z-index: 2147483001; font: 600 12px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 6px 10px; border-radius: 8px;
    border: 1px solid var(--fgColor-accent, #0969da); background: var(--bgColor-default, #fff); color: var(--fgColor-accent, #0969da); box-shadow: 0 4px 14px rgba(0,0,0,.18); cursor: pointer; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #ghl-sel[hidden] { display: none; }
  #ghl-allow { position: fixed; z-index: 2147483002; width: min(340px, calc(100vw - 24px)); padding: 12px 14px; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: var(--fgColor-default, #1f2328); background: var(--bgColor-default, #fff); border: 1px solid var(--fgColor-accent, #0969da); border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.24); }
  #ghl-allow p { margin: 0 0 10px; }
  #ghl-allow small { display: block; color: var(--fgColor-muted, #59636e); margin: -4px 0 10px; }
  #ghl-allow .acts { display: flex; flex-wrap: wrap; gap: 6px; }
  #ghl-allow .btn.primary { border-color: var(--fgColor-accent, #0969da); color: var(--fgColor-accent, #0969da); }
  `;
  const styleEl = document.createElement('style'); styleEl.textContent = css; styleEl.dataset.ghl = '';
  document.head.appendChild(styleEl);

  // ---------- glossary ----------
  function compileGlossary() {
    terms = data?.glossary?.terms || [];
    TERM = Object.fromEntries(terms.map((t) => [t.id, t]));
    codeTerms = terms.filter((t) => t.code); proseTerms = terms.filter((t) => !t.code);
    const build = (list, flags) => list.length ? new RegExp(list.map((t) => `(${t.pattern})`).join('|'), flags) : null;
    try { codeRe = build(codeTerms, 'g'); } catch { codeRe = null; }
    try { proseRe = build(proseTerms, 'gi'); } catch { proseRe = null; }
  }
  function fmt(s) {
    let out = esc(s).replace(/&lt;br&gt;/g, '<br>');
    // s is escaped already, so id and label are too; the linked term's name comes from the glossary and is not.
    out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => TERM[id] ? `<button class="xref" data-term="${id}">${label || esc(TERM[id].term)}</button>` : (label || id));
    return out.replace(/`([^`]+)`/g, '<code>$1</code>');
  }
  function originLink(t) {
    const o = t.origin || '', cut = o.indexOf(':'); // page keys can contain ':' themselves (file:<path>)
    const repo = o.slice(0, cut), page = o.slice(cut + 1);
    if (cut < 1 || !page) return '';
    const sha = t.ref ? t.ref.slice(0, 7) : '';
    const url = 'https://github.com' + (page.startsWith('pr-') ? `/${repo}/pull/${page.slice(3)}` : page.startsWith('issue-') ? `/${repo}/issues/${page.slice(6)}`
      : page.startsWith('discussion-') ? `/${repo}/discussions/${page.slice(11)}` : page === 'readme' ? `/${repo}`
      : page.startsWith('file:') ? `/${repo}/blob/${t.ref || 'HEAD'}/${page.slice(5)}` : `/${repo}`);
    const label = page.startsWith('pr-') ? `PR #${page.slice(3)}` : page.startsWith('issue-') ? `issue #${page.slice(6)}`
      : page.startsWith('discussion-') ? `discussion #${page.slice(11)}` : page === 'readme' ? 'README'
      : page.startsWith('file:') ? page.slice(5).split('/').pop() : 'another page';
    const other = repo !== R?.repo ? ` in ${repo.split('/')[1]}` : '';
    return `from <a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>${esc(other)}${sha ? ` at ${esc(sha)}` : ''}`;
  }

  // ---------- text index over GitHub's DOM ----------
  const BLOCK_SEL = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, dd, dt';
  const BASE_SKIP = '[data-ghl], button, script, style, textarea, .diff-line-number, .diff-text-marker, [data-code-marker]';
  let blockEntries = new Map(); // block element -> [{ range, type, id }]
  let termRanges = [];

  // Group text nodes by block so a match never runs across two paragraphs or two code lines.
  function textBlocks(root, blockOf, skip = BASE_SKIP) {
    const groups = new Map();
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => t.parentElement && !t.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    let t;
    while ((t = tw.nextNode())) {
      const block = blockOf(t.parentElement, root);
      if (!block) continue;
      let g = groups.get(block);
      if (!g) { g = { el: block, nodes: [], text: '' }; groups.set(block, g); }
      g.nodes.push({ node: t, start: g.text.length });
      g.text += t.nodeValue;
    }
    return [...groups.values()];
  }
  const proseBlock = (el, root) => { const b = el.closest(BLOCK_SEL); return b && root.contains(b) ? b : root; };
  const diffBlock = (el) => el.closest('td.diff-text-cell');
  const lineBlock = (el) => el.closest('.react-file-line, [id^="LC"]');

  function rangeIn(g, start, end) {
    const pos = (off, isEnd) => {
      for (let i = g.nodes.length - 1; i >= 0; i--) {
        const n = g.nodes[i];
        if (isEnd ? off > n.start : off >= n.start) return [n.node, off - n.start];
      }
      return [g.nodes[0].node, 0];
    };
    const r = new Range();
    r.setStart(...pos(start, false)); r.setEnd(...pos(end, true));
    return r;
  }
  function addEntry(el, e) { let a = blockEntries.get(el); if (!a) blockEntries.set(el, (a = [])); a.push(e); }

  function indexTerms(g, withProse) {
    const taken = [];
    const free = (s, e) => !taken.some(([a, b]) => s < b && e > a);
    for (const [re, list] of [[codeRe, codeTerms], [withProse ? proseRe : null, proseTerms]]) {
      if (!re) continue;
      re.lastIndex = 0; let m;
      while ((m = re.exec(g.text))) {
        if (!m[0]) { re.lastIndex++; continue; }
        const gi = m.findIndex((v, i) => i > 0 && v !== undefined) - 1;
        const s = m.index, e = s + m[0].length;
        if (!list[gi] || !free(s, e)) continue;
        taken.push([s, e]);
        const range = rangeIn(g, s, e);
        termRanges.push(range); addEntry(g.el, { range, type: 'term', id: list[gi].id });
      }
    }
  }

  function filePathOf(container) {
    const h = container.querySelector('h3 code, h3 a, [data-file-path]');
    return (h?.getAttribute('data-file-path') || h?.textContent || '').replace(/[‎‏]/g, '').trim();
  }
  // Outermost rendered-Markdown blocks: README, .md files, issue/PR/discussion bodies and comments.
  function markdownRoots() {
    return [...document.querySelectorAll('.markdown-body')].filter((el) => !el.closest('[data-ghl]') && !el.parentElement.closest('.markdown-body') && !el.closest('form, .js-previewable-comment-form'));
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing || !R) return;
    refreshing = true;
    try {
      blockEntries = new Map(); termRanges = [];
      if (['pr-conversation', 'issue', 'discussion', 'readme', 'blob'].includes(R.kind)) {
        for (const root of markdownRoots()) for (const g of textBlocks(root, proseBlock)) indexTerms(g, true);
      }
      if (R.kind === 'blob' && !document.querySelector('article.markdown-body')) {
        // Source view: one block per line; comments stay plain (strings are kept: SQL and templates live there).
        const view = document.querySelector('.react-code-lines') || document.querySelector('[data-hpc]') || document.body;
        for (const g of textBlocks(view, lineBlock, BASE_SKIP + ', .pl-c')) indexTerms(g, false);
      }
      if (R.kind === 'pr-files') {
        const containers = [...document.querySelectorAll('[id^="diff-"]')].filter((c) => c.querySelector('td.diff-text-cell'));
        for (const c of containers) {
          const prose = /\.mdx?$/i.test(filePathOf(c));
          for (const g of textBlocks(c, diffBlock)) indexTerms(g, prose);
        }
      }
      paint();
      renderPanel();
    } finally { refreshing = false; }
  }

  function paint() {
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ghl-term');
    if (on.defs && termRanges.length) CSS.highlights.set('ghl-term', new Highlight(...termRanges));
  }

  // ---------- hit testing by position (works under GitHub's transparent code-view textarea too) ----------
  const inRect = (x, y, r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;
  const hitIn = (entries, x, y) => entries.find((e) => e.type === 'term' && [...e.range.getClientRects()].some((r) => inRect(x, y, r))) || null;
  function termAt(x, y) {
    if (!on.defs || !termRanges.length) return null;
    const stack = document.elementsFromPoint(x, y);
    if (stack[0]?.closest('#ghl-panel, #ghl-pop, #ghl-allow')) return null;
    for (const el of stack) {
      let b = el;
      while (b && !blockEntries.has(b)) b = b.parentElement;
      if (b) return hitIn(blockEntries.get(b), x, y);
    }
    // GitHub's code view lays a transparent textarea over lines that do not take the pointer:
    // find the line under the point by geometry instead.
    if (stack[0]?.id === 'read-only-cursor-text-area' || stack[0]?.tagName === 'TEXTAREA') {
      for (const [b, entries] of blockEntries) if (inRect(x, y, b.getBoundingClientRect())) return hitIn(entries, x, y);
    }
    return null;
  }

  // ---------- popover ----------
  const pop = document.createElement('div'); pop.id = 'ghl-pop'; pop.hidden = true; pop.dataset.ghl = '';
  document.body.appendChild(pop);
  let stack = [], pinned = false, anchorRect = null, hoverEntry = null, showT = 0, hideT = 0;

  function wrapTermsIn(el, exclude) {
    const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => t.parentElement.closest('button, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const nodes = []; let t; while ((t = tw.nextNode())) nodes.push(t);
    for (const node of nodes) {
      const s = node.nodeValue; const hits = [];
      for (const [re, list] of [[codeRe, codeTerms], [proseRe, proseTerms]]) {
        if (!re) continue; re.lastIndex = 0; let m;
        while ((m = re.exec(s))) {
          if (!m[0]) { re.lastIndex++; continue; }
          const gi = m.findIndex((v, i) => i > 0 && v !== undefined) - 1; const tm = list[gi];
          if (tm && tm.id !== exclude && !hits.some((h) => m.index < h.e && m.index + m[0].length > h.s)) hits.push({ s: m.index, e: m.index + m[0].length, id: tm.id });
        }
      }
      if (!hits.length) continue;
      hits.sort((a, b) => a.s - b.s);
      const frag = document.createDocumentFragment(); let last = 0;
      for (const h of hits) {
        frag.append(s.slice(last, h.s));
        const b = document.createElement('button'); b.className = 'xref'; b.dataset.term = h.id; b.textContent = s.slice(h.s, h.e);
        frag.append(b); last = h.e;
      }
      frag.append(s.slice(last)); node.replaceWith(frag);
    }
  }

  const layerLabel = (g) => g.layer === 'org' ? `all ${esc(R?.repo?.split('/')[0] || 'owner')} repos` : 'this repo';
  function renderPop() {
    const top = stack[stack.length - 1];
    const g = TERM[top.id];
    if (!g) { hidePop(true); return; }
    const head = `<span class="kind def">Definition</span>${g.category ? `<span class="ghl-layer">${esc(g.category)}</span>` : ''}<span class="ghl-layer ${g.layer === 'org' ? 'org' : ''}">${layerLabel(g)}</span>`;
    const safeLink = g.link && /^https:\/\//i.test(g.link) ? g.link : '';
    const body = `<div class="pt">${esc(g.term)}</div>${g.where ? `<div class="where">${esc(g.where)}</div>` : ''}<div class="pdef">${fmt(g.def)}</div>
      ${safeLink ? `<div style="margin-top:8px"><a href="${esc(safeLink)}" target="_blank" rel="noopener">Open link</a></div>` : ''}`;
    const when = g.definedAt ? new Date(g.definedAt).toLocaleDateString() : '';
    const checked = g.verified === true ? 'Verified at source' : g.verified === false ? 'Not verified at source' : '';
    const revised = g.revisedAt ? `<br>Revised ${esc(new Date(g.revisedAt).toLocaleDateString())}: ${esc(g.revisionReason || '')}` : '';
    const prov = `<div class="prov">${g.selected ? 'You asked · ' : ''}Defined ${esc(when)} ${originLink(g)}${g.model ? ` · ${esc(g.model)}` : ''}${checked ? `<br>${checked}${g.spec ? ` · spec v${esc(g.spec)}` : ''}` : ''}${revised}</div>`;
    const trail = stack.length > 1 ? `<div class="crumbs">${stack.map((s) => esc(TERM[s.id]?.term || s.id)).join(' › ')}</div>` : '';
    pop.innerHTML = `<div class="ph">${head}<span class="sp"></span>${stack.length > 1 ? '<button data-act="back">← Back</button>' : ''}${pinned ? '<button data-act="close" aria-label="Close">✕</button>' : ''}</div>
      <div class="pb">${body}</div>${prov}${trail}${pinned ? '' : '<div class="hint">Click to pin and follow linked terms.</div>'}`;
    wrapTermsIn(pop.querySelector('.pdef'), top.id);
    pop.classList.toggle('pinned', pinned);
  }
  function place() {
    if (!anchorRect) return;
    const r = anchorRect(); if (!r) return;
    pop.style.left = '0px'; pop.style.top = '0px';
    const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 12;
    const x = Math.min(Math.max(m, r.left), innerWidth - pw - m);
    let y = r.bottom + 8;
    if (y + ph > innerHeight - m && r.top - ph - 8 > m) y = r.top - ph - 8;
    pop.style.left = x + 'px'; pop.style.top = Math.max(m, Math.min(y, innerHeight - ph - m)) + 'px';
  }
  function setActiveRange(range) {
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ghl-active');
    if (range) CSS.highlights.set('ghl-active', new Highlight(range));
  }
  function openPop(item, rectFn, pin, range) {
    clearTimeout(hideT);
    if (pin) clearTimeout(showT); // a pending hover must not reopen it unpinned
    stack = [item]; pinned = pin; anchorRect = rectFn;
    renderPop(); if (!stack.length) return;
    pop.hidden = false; place();
    setActiveRange(range || null);
  }
  function hidePop(force) {
    if (pinned && !force) return;
    pop.hidden = true; stack = []; pinned = false; anchorRect = null; setActiveRange(null);
  }

  let raf = 0, lastXY = null;
  document.addEventListener('mousemove', (e) => {
    lastXY = [e.clientX, e.clientY];
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (pop.contains(document.elementFromPoint(...lastXY))) { clearTimeout(hideT); return; }
      const hit = termAt(...lastXY);
      document.documentElement.classList.toggle('ghl-hover-term', !!hit);
      if (pinned) return;
      if (hit && hit !== hoverEntry) {
        hoverEntry = hit; clearTimeout(hideT); clearTimeout(showT);
        showT = setTimeout(() => openPop({ type: 'term', id: hit.id }, () => hit.range.getBoundingClientRect(), false, hit.range), 140);
      } else if (!hit && hoverEntry) {
        hoverEntry = null; clearTimeout(showT);
        hideT = setTimeout(() => hidePop(false), 220);
      }
    });
  }, { passive: true });

  document.addEventListener('click', (e) => {
    if (pop.contains(e.target)) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') return hidePop(true);
      if (act === 'back') { stack.pop(); renderPop(); place(); return; }
      const x = e.target.closest('.xref');
      if (x) { pinned = true; stack.push({ type: 'term', id: x.dataset.term }); renderPop(); place(); return; }
      if (!pinned) { pinned = true; renderPop(); place(); }
      return;
    }
    if (e.target.closest?.('#ghl-panel, #ghl-allow')) return;
    const hit = e.target.closest?.('a') ? null : termAt(e.clientX, e.clientY);
    if (hit && !window.getSelection()?.toString()) { openPop({ type: 'term', id: hit.id }, () => hit.range.getBoundingClientRect(), true, hit.range); return; }
    if (!pop.hidden) hidePop(true);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!pop.hidden) hidePop(true); closeAllow(); } });
  addEventListener('scroll', () => { if (!pop.hidden) { if (pinned) place(); else hidePop(true); } }, { passive: true, capture: true });
  addEventListener('resize', () => { if (!pop.hidden) place(); });

  // ---------- allow prompt: Claude runs only on repos (or owners) you allowed ----------
  const allowBox = document.createElement('div'); allowBox.id = 'ghl-allow'; allowBox.dataset.ghl = ''; allowBox.hidden = true;
  allowBox.setAttribute('role', 'dialog');
  document.body.appendChild(allowBox);
  let allowThen = null;
  function closeAllow() { allowBox.hidden = true; allowThen = null; }
  // Shows the prompt near rect; then() runs after the repo or owner is allowed.
  function askAllow(rect, then) {
    const [owner] = R.repo.split('/');
    allowThen = then;
    allowBox.innerHTML = `<p>Let Claude define terms on <b>${esc(R.repo)}</b>?</p>
      <small>Runs use read-only tools on a local checkout. The page's text goes to Claude.</small>
      <div class="acts"><button class="btn primary" data-allow="repo">Allow ${esc(R.repo.split('/')[1])}</button>
        <button class="btn" data-allow="owner">Allow all of ${esc(owner)}</button>
        <button class="btn" data-allow="">Cancel</button></div>`;
    allowBox.hidden = false;
    const w = allowBox.offsetWidth, h = allowBox.offsetHeight;
    allowBox.style.left = Math.min(Math.max(12, rect.left), innerWidth - w - 12) + 'px';
    allowBox.style.top = Math.min(Math.max(12, rect.bottom + 8), innerHeight - h - 12) + 'px';
    allowBox.querySelector('[data-allow="repo"]').focus();
  }
  allowBox.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-allow]'); if (!b) return;
    e.stopPropagation();
    // Only a real click by the reader may add to the allowlist, never a script on the page.
    if (!e.isTrusted) return;
    const scope = b.dataset.allow, then = allowThen;
    closeAllow();
    if (!scope) return;
    try { await api('POST', '/api/allow', { body: { repo: R.repo, scope } }); }
    catch (err) { msg = { text: esc(err.message), tone: 'bad' }; renderPanel(); return; }
    if (data) data.allowed = true;
    then?.();
  });
  document.addEventListener('mousedown', (e) => { if (!allowBox.hidden && !allowBox.contains(e.target)) closeAllow(); }, true);
  // Runs fn now if Claude may run on this repo, otherwise after the reader allows it.
  function whenAllowed(rect, fn) { if (data?.allowed) fn(); else askAllow(rect, fn); }

  // ---------- define a selection ----------
  const selBtn = document.createElement('button'); selBtn.id = 'ghl-sel'; selBtn.dataset.ghl = ''; selBtn.hidden = true;
  document.body.appendChild(selBtn);
  let sel = null;          // { text, context, rect } of the current selection
  let selJob = null;       // { key, text, startedAt, rect } while a Select run is going

  function currentSelection(ev) {
    // GitHub's code view keeps the selection in a transparent textarea over the lines.
    const ae = document.activeElement;
    if (ae?.tagName === 'TEXTAREA' && ae.id === 'read-only-cursor-text-area') {
      const text = ae.value.slice(ae.selectionStart, ae.selectionEnd).trim();
      if (!text) return null;
      const from = ae.value.lastIndexOf('\n', ae.selectionStart - 1) + 1;
      let to = ae.value.indexOf('\n', ae.selectionEnd); if (to < 0) to = ae.value.length;
      return { text, context: ae.value.slice(from, to).trim().slice(0, 600), rect: new DOMRect(ev.clientX, ev.clientY - 8, 0, 16) };
    }
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const text = s.toString().trim();
    if (!text) return null;
    const r = s.getRangeAt(0);
    const c = r.commonAncestorContainer;
    const anc = c.nodeType === 1 ? c : c.parentElement;
    if (!anc || anc.closest('[data-ghl], input, textarea, [contenteditable="true"]')) return null;
    const block = anc.closest(`${BLOCK_SEL}, td.diff-text-cell, .react-file-line`) || anc;
    return { text, context: block.textContent.trim().slice(0, 600), rect: r.getBoundingClientRect() };
  }
  const shorten = (t, n = 28) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  function existingTermFor(text) {
    return terms.find((t) => { try { return new RegExp(`^(?:${t.pattern})$`, t.code ? '' : 'i').test(text); } catch { return false; } });
  }

  document.addEventListener('mousedown', (e) => { if (e.target !== selBtn && !selJob) selBtn.hidden = true; }, true);
  document.addEventListener('mouseup', (e) => {
    if (!R || !data || selJob || e.target.closest?.('[data-ghl]')) return;
    setTimeout(() => {
      const s = currentSelection(e);
      if (!s || s.text.length > 120 || s.text.includes('\n')) return;
      sel = s;
      const known = existingTermFor(s.text);
      selBtn.textContent = known ? `Show “${shorten(s.text)}”` : `Define “${shorten(s.text)}”`;
      selBtn.title = known ? 'Already in the glossary' : 'Define just this selection (Select operation)';
      selBtn.hidden = false;
      selBtn.style.left = Math.min(Math.max(8, s.rect.left), innerWidth - selBtn.offsetWidth - 8) + 'px';
      selBtn.style.top = (s.rect.top > 44 ? s.rect.top - 36 : s.rect.bottom + 8) + 'px';
    }, 10);
  });
  addEventListener('scroll', () => { if (!selJob) selBtn.hidden = true; }, { passive: true, capture: true });

  selBtn.addEventListener('mousedown', (e) => e.preventDefault()); // keep the page selection
  selBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!sel || selJob) return;
    const s = sel; selBtn.hidden = true;
    const known = existingTermFor(s.text);
    if (known) { openPop({ type: 'term', id: known.id }, () => s.rect, true); return; }
    whenAllowed(s.rect, () => defineSelection(s));
  });
  async function defineSelection(s) {
    try {
      const r = await api('POST', '/api/select', { body: { repo: R.repo, page: R.page, blob: R.blob, ref: R.ref, text: s.text, context: s.context } });
      selJob = { key: r.key, text: s.text, startedAt: Date.now(), rect: s.rect };
      trackSelect();
    } catch (err) { msg = { text: `Could not define “${esc(shorten(s.text))}”: ${esc(err.message)}`, tone: 'bad' }; renderPanel(); }
  }

  let selTick = 0;
  async function trackSelect() {
    clearTimeout(selTick);
    if (!selJob) return;
    const secs = Math.round((Date.now() - selJob.startedAt) / 1000);
    let job = null;
    try { job = await api('GET', '/api/job', { query: { key: selJob.key } }); } catch { job = { state: 'done' }; }
    if (job.state === 'error') {
      msg = { text: `Defining “${esc(shorten(selJob.text))}” failed: ${esc(job.error)}`, tone: 'bad' }; selJob = null; renderPanel(); return;
    }
    if (job.state === 'done') {
      const { termId } = job.result || {}; const rect = selJob.rect; const text = selJob.text;
      selJob = null;
      await load();
      msg = { text: `Defined “${esc(shorten(text))}”${took(job.result?.durationMs)}.` }; renderPanel();
      const id = termId && TERM[termId] ? termId : existingTermFor(text)?.id;
      if (id) {
        const e = [...blockEntries.values()].flat().find((x) => x.id === id && x.range.getBoundingClientRect().top > 0);
        openPop({ type: 'term', id }, e ? () => e.range.getBoundingClientRect() : () => rect, true, e?.range);
      }
      return;
    }
    msg = { text: `${job.state === 'queued' ? 'Queued: ' : ''}Defining “${esc(shorten(selJob.text))}” (${secs} s)…` };
    renderPanel();
    selTick = setTimeout(trackSelect, 2000);
  }

  // ---------- panel ----------
  const panel = document.createElement('div'); panel.id = 'ghl-panel'; panel.dataset.ghl = ''; panel.hidden = true;
  if (getVal('min', false)) panel.classList.add('is-min');
  // Docked: the panel shrinks to a small tab on the left or right edge. Click it to open the panel again.
  // @ghl-test begin dock
  // First run docks the panel as a tab on the right; after that the stored choice (including open) is kept.
  function startDock(get, set) {
    if (get('dockInit', false) !== true) {
      set('dockInit', true);
      if (get('dock', null) === null) set('dock', { side: 'right', top: 72 });
    }
    return get('dock', null);
  }
  // @ghl-test end dock
  // @ghl-test begin peek
  // Hover pop-out of the docked tab: pure decisions only (no DOM), so they can be tested.
  function peekStep(state, event, now) {
    const s = { peek: !!state.peek, pointer: !!state.pointer, focus: !!state.focus, enteredAt: state.enteredAt || 0 };
    if (event === 'enter') { s.peek = true; s.pointer = true; s.enteredAt = now; }
    else if (event === 'leave') s.pointer = false;
    else if (event === 'focusin') s.focus = true;
    else if (event === 'focusout') s.focus = false;
    else if (event === 'reset') { s.peek = false; s.pointer = false; s.focus = false; s.enteredAt = 0; }
    return s;
  }
  const foldDue = (state) => !!(state.peek && !state.pointer && !state.focus);
  const isTabClick = (enteredAt, downAt) => downAt - enteredAt <= 400;
  // Where the popped-out window sits: flush to the tab's edge, as high as the tab but kept on the screen.
  function peekRect(dock, w, h, vw, vh) {
    const width = Math.min(w, vw - 16);
    const top = Math.max(Math.min(8, Math.max(0, dock.top)), Math.min(dock.top, vh - 8 - h));
    return { side: dock.side, left: dock.side === 'left' ? 0 : vw - width, top, width };
  }
  // The clip that shows only the tab's footprint inside the window's box (start of the grow animation).
  function peekClip(tab, win) {
    const t = tab.top - win.top, l = tab.left - win.left;
    const r = win.left + win.width - (tab.left + tab.width), b = win.top + win.height - (tab.top + tab.height);
    return `inset(${t}px ${r}px ${b}px ${l}px round 8px)`;
  }
  // @ghl-test end peek
  let dock = startDock(getVal, setVal); // { side: 'left' | 'right', top }
  const docked = () => !!dock;
  // Hover pop-out: the docked tab shows the full window while the pointer is on it. Transient: nothing is stored.
  let peek = false, peekS = peekStep({}, 'reset', 0), foldT = 0, foldAnim = null, peekTab = null;
  const tabShown = () => docked() && !peek;
  const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  function resetPeek() {
    clearTimeout(foldT); foldT = 0;
    if (foldAnim) { foldAnim.onfinish = null; foldAnim.cancel(); foldAnim = null; }
    panel.getAnimations().forEach((an) => an.cancel());
    peek = false; peekS = peekStep(peekS, 'reset', 0);
  }
  function setDock(d) {
    resetPeek();
    dock = d; setVal('dock', d);
    panel.style.width = ''; panel.style.height = ''; panel.style.left = ''; panel.style.right = ''; panel.style.top = '';
    applyGeometry(); renderPanel();
  }
  function dockAt(clientX, top) { setDock({ side: clientX < innerWidth / 2 ? 'left' : 'right', top }); }
  function applyGeometry() {
    if (panel.hidden) { delete panel.dataset.geo; return; } // sized again by renderPanel when it shows
    panel.classList.toggle('docked', tabShown());
    panel.classList.toggle('peeking', docked() && peek);
    panel.classList.toggle('dock-left', docked() && dock.side === 'left');
    panel.classList.toggle('dock-right', docked() && dock.side === 'right');
    if (docked() && peek) {
      const r = peekRect(dock, getVal('panelSize', null)?.w || 340, panel.offsetHeight, innerWidth, innerHeight);
      panel.style.width = r.width + 'px'; panel.style.height = ''; panel.style.top = r.top + 'px';
      panel.style.left = r.side === 'left' ? '0px' : r.left + 'px'; panel.style.right = 'auto';
      return;
    }
    if (docked()) { panel.style.width = ''; panel.style.height = ''; panel.style.left = ''; panel.style.right = ''; panel.style.top = Math.min(Math.max(0, dock.top), innerHeight - 90) + 'px'; return; }
    const pos = getVal('panelPos', null), size = getVal('panelSize', null);
    if (size && !panel.classList.contains('is-min')) { panel.style.width = size.w + 'px'; panel.style.height = size.h + 'px'; }
    if (pos) {
      const w = panel.offsetWidth || 340;
      panel.style.left = Math.min(Math.max(0, pos.left), innerWidth - Math.min(w, 120)) + 'px';
      panel.style.top = Math.min(Math.max(0, pos.top), innerHeight - 40) + 'px';
      panel.style.right = 'auto';
    }
  }
  panel.addEventListener('mousedown', (e) => {
    if (docked() && e.button === 0 && (tabShown() || (peek && isTabClick(peekS.enteredAt, Date.now())))) {
      // Drag the tab along the edge (across the middle switches sides); a click without moving opens the panel.
      e.preventDefault();
      const y0 = e.clientY, top0 = Math.min(Math.max(0, dock.top), innerHeight - 90);
      let moved = false;
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientY - y0) < 4 && Math.abs(ev.clientX - e.clientX) < 4) return;
        if (!moved) { moved = true; if (peek) { resetPeek(); applyGeometry(); renderPanel(); } panel.classList.add('dragging'); }
        const side = ev.clientX < innerWidth / 2 ? 'left' : 'right';
        if (side !== dock.side) { dock = { ...dock, side }; applyGeometry(); }
        panel.style.top = Math.min(Math.max(0, top0 + ev.clientY - y0), innerHeight - 90) + 'px';
      };
      const up = () => {
        removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true);
        panel.classList.remove('dragging');
        if (moved) { dock = { side: dock.side, top: parseFloat(panel.style.top) }; setVal('dock', dock); }
        else setDock(null);
      };
      addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
      return;
    }
    if (peek || !e.target.closest('.row:first-child') || e.target.closest('button, input, label')) return;
    e.preventDefault();
    const r = panel.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
    panel.classList.add('dragging');
    const move = (ev) => {
      panel.style.left = Math.min(Math.max(0, ev.clientX - dx), innerWidth - 60) + 'px';
      panel.style.top = Math.min(Math.max(0, ev.clientY - dy), innerHeight - 30) + 'px';
      panel.style.right = 'auto';
    };
    const up = (ev) => {
      removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true);
      panel.classList.remove('dragging');
      // Letting go with the pointer at the screen edge docks the panel there; its open position stays as it was.
      if (ev.clientX <= 12 || ev.clientX >= innerWidth - 12) { dockAt(ev.clientX, ev.clientY - dy); return; }
      setVal('panelPos', { left: parseFloat(panel.style.left), top: parseFloat(panel.style.top) });
    };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  });
  let sizeT = 0;
  new ResizeObserver(() => {
    if (panel.classList.contains('is-min') || docked() || panel.hidden || !panel.style.width && !panel.style.height && !panel.dataset.userSized) return;
    clearTimeout(sizeT); sizeT = setTimeout(() => setVal('panelSize', { w: panel.offsetWidth, h: panel.offsetHeight }), 300);
  }).observe(panel);
  // The browser's resize handle sets inline width/height; mark that the user sized it.
  panel.addEventListener('mouseup', (e) => {
    const r = panel.getBoundingClientRect();
    if (e.clientX > r.right - 18 && e.clientY > r.bottom - 18) panel.dataset.userSized = '1';
  });
  addEventListener('resize', applyGeometry);
  function scheduleFold() { clearTimeout(foldT); foldT = setTimeout(() => { if (foldDue(peekS)) fold(); }, 350); }
  function popOut() {
    const tab = panel.getBoundingClientRect();
    peekTab = { left: tab.left, top: tab.top, width: tab.width, height: tab.height };
    peek = true;
    renderPanel();
    if (reducedMotion()) return;
    const win = panel.getBoundingClientRect();
    panel.animate([{ clipPath: peekClip(peekTab, win) }, { clipPath: 'inset(-24px round 10px)' }], { duration: 320, easing: 'cubic-bezier(.2, .9, .25, 1.15)' });
    for (const c of panel.children) c.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 90, easing: 'ease-out', fill: 'backwards' });
  }
  function fold() {
    if (!peek) return;
    const finish = () => { resetPeek(); applyGeometry(); renderPanel(); };
    if (reducedMotion() || !peekTab) { finish(); return; }
    foldAnim = panel.animate([{ clipPath: 'inset(-24px round 10px)' }, { clipPath: peekClip(peekTab, panel.getBoundingClientRect()) }], { duration: 200, easing: 'ease-in', fill: 'forwards' });
    foldAnim.onfinish = finish;
  }
  panel.addEventListener('mouseenter', () => {
    if (!docked() || panel.classList.contains('dragging')) return;
    peekS = peekStep(peekS, 'enter', peek ? peekS.enteredAt : Date.now());
    clearTimeout(foldT);
    if (foldAnim) { const an = foldAnim; an.onfinish = () => { an.cancel(); if (foldAnim === an) foldAnim = null; }; an.reverse(); return; }
    if (!peek) popOut();
  });
  panel.addEventListener('mouseleave', () => { peekS = peekStep(peekS, 'leave', Date.now()); if (peek && allowBox.hidden) scheduleFold(); });
  panel.addEventListener('focusin', () => { if (peek) peekS = peekStep(peekS, 'focusin', Date.now()); });
  panel.addEventListener('focusout', () => { if (!peek) return; peekS = peekStep(peekS, 'focusout', Date.now()); scheduleFold(); });
  document.body.appendChild(panel);

  const busy = (j) => j && (j.state === 'queued' || j.state === 'running');
  const mins = (iso) => iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : 0;
  const took = (ms) => {
    if (!ms) return '';
    const s = Math.round(ms / 1000);
    return ` · took ${s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`}`;
  };
  const modeLabel = (m) => data?.modes?.[m] ? `${data.modes[m].model}/${data.modes[m].effort}` : '';
  // Send to Claude is offered on pull requests and on Markdown documents.
  const docPath = () => R?.kind === 'blob' && data?.page?.startsWith('file:') && /\.(?:md|mdx|markdown)$/i.test(data.page) ? data.page.slice(5) : null;
  const canSend = () => !!R && (!!R.pr || !!docPath());

  function statusLines() {
    const lines = [];
    if (msg) lines.push(msg);
    if (!data) return lines;
    const dj = data.defineJob, pi = data.pageInfo;
    if (busy(dj)) lines.push({ text: dj.state === 'queued' ? 'Defining: queued behind another run…' : `Defining this page (${mins(dj.startedAt)} min so far)…` });
    else if (dj?.state === 'error') lines.push({ text: `Defining failed: ${esc(dj.error)}`, tone: 'bad' });
    if (pi) {
      const here = terms.filter((t) => t.origin === `${R.repo}:${data.page}`).length;
      lines.push({ text: `${here} terms from this page${pi.corrected ? `, ${pi.corrected} corrected` : ''} · ${new Date(pi.lastRun).toLocaleDateString()} · ${esc(pi.model || pi.mode)}${took(pi.durationMs)}` });
    } else if (!busy(dj)) lines.push({ text: `This page has not been defined yet. ${terms.length} terms known for this repo.` });
    if (!data.allowed) lines.push({ text: 'Not on your allowlist yet: Quick or Thorough asks first.' });
    return lines;
  }

  function renderPanel() {
    if (!R) { panel.hidden = true; return; }
    if (panel.parentElement !== document.body) document.body.appendChild(panel);
    panel.hidden = false;
    if (!panel.dataset.geo || panel.classList.contains('docked') !== tabShown() || panel.classList.contains('peeking') !== (docked() && peek)) { panel.dataset.geo = '1'; applyGeometry(); }
    if (tabShown()) return renderBadge();
    const dj = data?.defineJob;
    const dis = !data || busy(dj) ? 'disabled' : '';
    panel.innerHTML = `
      <div class="row"><span class="title">gh-glossary</span>
        <button class="ghl-sw defs" role="switch" aria-checked="${on.defs}" data-sw="defs"><i></i>Definitions${terms.length ? ` (${terms.length})` : ''}</button>
        <button class="ghl-sw docked" role="switch" aria-checked="${docked()}" data-dock title="Dock to the screen edge as a small tab (or drag the panel to an edge)"><i></i>Docked</button>
        <button class="min" data-min title="Collapse">${panel.classList.contains('is-min') ? '▸' : '▾'}</button></div>
      <div class="row"><span class="lbl">${regen ? 'Redo this page:' : 'Define this page:'}</span>
        <button class="btn" data-define="quick" ${dis} title="${esc(modeLabel('quick'))}, usually under a minute">Quick</button>
        <button class="btn" data-define="thorough" ${dis} title="${esc(modeLabel('thorough'))}, about 5 min">Thorough</button>
        <label class="chk" title="Define this page again. Its terms are replaced when the run succeeds; terms you defined by selection are kept"><input type="checkbox" data-regen ${regen ? 'checked' : ''} ${data?.pageInfo ? '' : 'disabled'}>Regenerate</label></div>
      ${canSend() ? `<div class="row"><button class="btn" data-claude title="Open a new Claude Code session in the Claude desktop app with this ${R.pr ? 'pull request' : 'document'} in the composer">Send to Claude</button></div>` : ''}
      <div class="status">${statusLines().map((l) => `<div class="${l.tone || ''}">${l.text}</div>`).join('')}</div>`;
    if (docked() && peek) applyGeometry(); // the window's height is known now: keep it on the screen
  }

  function renderBadge() {
    const dj = data?.defineJob;
    const dot = busy(dj) || selJob ? 'busy' : msg?.tone === 'bad' || dj?.state === 'error' ? 'bad' : '';
    const tip = statusLines().map((l) => l.text.replace(/<[^>]+>/g, '')).join('. ');
    panel.innerHTML = `<div class="badge" aria-label="gh-glossary. ${esc(tip)}">${dot ? `<span class="dot ${dot}"></span>` : ''}<span>gh-glossary</span>
      ${terms.length ? `<span class="n ${on.defs ? '' : 'off'}">${terms.length}</span>` : ''}</div>`;
  }

  function flash(t, tone) { msg = { text: t, tone }; renderPanel(); setTimeout(() => { if (msg?.text === t) { msg = null; renderPanel(); } }, 5000); }

  // @ghl-test begin claude
  // Send to Claude: the service worker builds the claude:// link from your templates; we open it.
  async function sendToClaude() {
    const req = R.pr ? { kind: 'pr', repo: R.repo, number: R.pr } : { kind: 'doc', repo: R.repo, path: docPath(), ref: data?.ref || 'HEAD' };
    let r;
    try { r = await chrome.runtime.sendMessage({ type: 'claude-link', ...req }); } catch (e) { flash('The extension was reloaded: reload this page.', 'bad'); return; }
    if (!r || r.code !== 200) { flash(esc(r?.body?.error || 'Could not build the Claude link.'), 'bad'); return; }
    const a = document.createElement('a');
    a.href = r.body.url;
    document.body.appendChild(a); a.click(); a.remove();
    flash(r.body.folder
      ? 'Opened Claude in the folder set for this repo. Check the prompt there and press Enter.'
      : `Opened Claude. No folder is set for ${esc(R.repo)}: pick one in the app, or add one in the extension's options.`);
  }
  // @ghl-test end claude

  panel.addEventListener('click', async (e) => {
    const sw = e.target.closest('[data-sw]');
    if (sw) { const k = sw.dataset.sw; on[k] = !on[k]; setVal(k, on[k]); hidePop(true); paint(); renderPanel(); return; }
    if (e.target.closest('[data-dock]')) {
      const r = panel.getBoundingClientRect();
      if (peek) { setVal('panelPos', { left: r.left, top: r.top }); resetPeek(); setDock(null); return; }
      dockAt(r.left + r.width / 2, r.top); return;
    }
    if (e.target.closest('[data-min]')) {
      panel.classList.toggle('is-min'); setVal('min', panel.classList.contains('is-min'));
      if (panel.classList.contains('is-min')) { panel.style.width = ''; panel.style.height = ''; } else applyGeometry();
      renderPanel(); return;
    }
    const d = e.target.closest('[data-define]');
    if (d) {
      const mode = d.dataset.define, rg = regen;
      whenAllowed(d.getBoundingClientRect(), () => start({ repo: R.repo, page: R.page, blob: R.blob, ref: R.ref, mode, regenerate: rg }));
      return;
    }
    if (e.target.closest('[data-claude]')) { await sendToClaude(); return; }
  });
  panel.addEventListener('change', (e) => { if (e.target.matches('[data-regen]')) { regen = e.target.checked; renderPanel(); } });

  // ---------- data ----------
  let pollT = 0;
  function query() {
    const q = { repo: R.repo };
    if (R.blob) q.blob = R.blob; else q.page = R.page;
    if (R.ref) q.ref = R.ref;
    return q;
  }
  const hostDown = (e) => e.code === 'down'
    ? { text: `The gh-glossary host is not reachable (${esc(e.message)}). Run <code>host/install.sh</code> (Windows: <code>host\\install.cmd</code>) from the gh-glossary folder, then reload the extension.`, tone: 'bad' }
    : { text: esc(e.message), tone: 'bad' };
  async function load() {
    const r = R; clearTimeout(pollT);
    try {
      const d = await api('GET', '/api/page', { query: query() });
      if (R !== r) return;
      const sig = (x) => JSON.stringify([x?.glossary?.terms?.length, x?.glossary?.terms?.map((t) => t.definedAt).sort().pop()]);
      const changed = sig(d) !== sig(data);
      data = d; if (!selJob) msg = null;
      if (changed) { compileGlossary(); await refresh(); } else renderPanel();
      if (busy(d.defineJob)) pollT = setTimeout(load, 8000);
    } catch (e) {
      if (R !== r) return;
      data = null; msg = hostDown(e); renderPanel();
    }
  }
  async function start(body) {
    try { await api('POST', '/api/define', { body }); msg = null; regen = false; } catch (e) {
      msg = e.code === 'notAllowed' ? { text: 'This repo is not on your allowlist.', tone: 'bad' } : hostDown(e);
      renderPanel(); return;
    }
    load();
  }

  // ---------- GitHub is a single-page app: follow navigation and lazy-loaded content ----------
  let refreshT = 0;
  const mo = new MutationObserver((muts) => {
    if (!R) return;
    const ours = (n) => n.nodeType === 1 ? !!n.closest?.('[data-ghl]') : !!n.parentElement?.closest('[data-ghl]');
    if (muts.every((m) => ours(m.target) || ([...m.addedNodes, ...m.removedNodes].length > 0 && [...m.addedNodes, ...m.removedNodes].every(ours)))) return;
    clearTimeout(refreshT); refreshT = setTimeout(refresh, 500);
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  let lastPath = '';
  function onRoute() {
    syncTitle();
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const nr = route(pageNwo());
    const changed = (nr && nr.key) !== (R && R.key);
    R = nr; hidePop(true); closeAllow();
    if (!R) { CSS.highlights?.clear(); renderPanel(); return; }
    if (changed) { data = null; msg = { text: 'Loading…' }; regen = false; compileGlossary(); renderPanel(); load(); }
    else setTimeout(refresh, 300);
  }
  setInterval(onRoute, 600);
  onRoute();
})();
