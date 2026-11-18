// gh-glossary content script on github.com.
// The page is untrusted (GitHub's scripts and other extensions share its DOM), so this script only
// shows things: it underlines terms with CSS Custom Highlights (no DOM edits), draws the tab, and
// places the definition frame (an extension page) next to a term. Nothing it draws starts a run,
// allows a repository or opens Claude; those happen in the toolbar popup and the context menu. The tab and the frame live in a closed shadow root.
// Routing and matching come from shared.js, loaded before this file.

(async function () {
  'use strict';
  const { route, pageQuery, matcher, esc } = globalThis.ghl;

  // ---------- settings & transport ----------
  // chrome.storage is async; read it once and keep a copy so the drawing code can stay synchronous.
  let store = {};
  try { store = await chrome.storage.local.get(null); } catch {}
  const getVal = (k, d) => (k in store ? store[k] : d);
  const setVal = (k, v) => { store[k] = v; try { chrome.storage.local.set({ [k]: v }); } catch {} };

  // The content script may only read: a page's glossary and a job's state.
  async function api(method, path, { query } = {}) {
    let r;
    try { r = await chrome.runtime.sendMessage({ type: 'api', method, path, query }); }
    catch (e) { throw Object.assign(new Error('The extension was reloaded: reload this page.'), { code: 'stale' }); }
    if (!r || r.code === 0) throw Object.assign(new Error(r?.body?.error || 'host not reachable'), { code: 'down' });
    if (r.code >= 400) throw new Error(r.body?.error || `error ${r.code}`);
    return r.body;
  }
  const toExtension = (m) => { try { return chrome.runtime.sendMessage(m).catch(() => {}); } catch { return Promise.resolve(); } };

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

  let R = null;            // current route
  let data = null;         // response of GET /api/page
  let note = null;         // { text, tone }: the last thing to tell the reader (shown in the tab's tooltip and the popup)
  let M = matcher([]);
  let defsOn = getVal('defs', true);

  // ---------- underlines: a style sheet built here, so no <style> element is added to the page ----------
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`
    html.ghl-hover-term, html.ghl-hover-term * { cursor: help !important; }
    ::highlight(ghl-term) { text-decoration: underline dotted var(--fgColor-accent, #0969da); text-decoration-thickness: 1.5px; }
    ::highlight(ghl-active) { background-color: var(--bgColor-accent-muted, rgba(84,174,255,.2)); }
    ::highlight(ghl-pending) { background-color: color-mix(in srgb, var(--bgColor-attention-emphasis, #9e6a03) 60%, transparent); text-decoration: underline wavy var(--fgColor-attention, #9a6700); text-decoration-thickness: 1.5px; }
    ::highlight(ghl-pending-dim) { background-color: color-mix(in srgb, var(--bgColor-attention-emphasis, #9e6a03) 22%, transparent); text-decoration: underline wavy var(--fgColor-attention, #9a6700); text-decoration-thickness: 1.5px; }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  // ---------- the tab and the definition frame, in a closed shadow root ----------
  const host = document.createElement('div');
  host.dataset.ghl = '';
  host.style.cssText = 'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { all: initial; }
    #tab { position: fixed; z-index: 2; font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: var(--fgColor-default, #1f2328);
      background: var(--bgColor-default, #fff); border: 1px solid var(--borderColor-default, #d1d9e0); box-shadow: 0 6px 20px rgba(0,0,0,.14);
      cursor: pointer; user-select: none; opacity: .6; transition: opacity .15s ease; }
    #tab:hover, #tab.dragging { opacity: 1; }
    #tab[hidden] { display: none; }
    #tab.right { right: 0; border-right: 0; border-radius: 8px 0 0 8px; }
    #tab.left { left: 0; border-left: 0; border-radius: 0 8px 8px 0; }
    .badge { writing-mode: vertical-rl; display: flex; align-items: center; gap: 6px; padding: 10px 5px; font-weight: 600; }
    #tab.left .badge, #tab.left .badge .n { transform: rotate(180deg); }
    .n { writing-mode: horizontal-tb; font: 700 10.5px/1 -apple-system, sans-serif; padding: 2px 4px; border-radius: 8px; background: var(--bgColor-muted, #f6f8fa); color: var(--fgColor-muted, #59636e); }
    .n.off { opacity: .5; text-decoration: line-through; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
    .dot.busy { background: var(--fgColor-accent, #0969da); animation: pulse 1.2s ease-in-out infinite; }
    .dot.bad { background: var(--fgColor-danger, #d1242f); }
    @keyframes pulse { 50% { opacity: .25; } }
    @media (prefers-reduced-motion: reduce) { .dot.busy { animation: none; } #tab { transition: none; } }
    #pop { position: fixed; z-index: 3; width: min(420px, calc(100vw - 24px)); height: 120px; border: 0; border-radius: 10px;
      box-shadow: 0 8px 28px rgba(0,0,0,.2); background: transparent; color-scheme: normal; }
    #pop[hidden] { display: none; }
  </style><div id="tab" hidden></div><iframe id="pop" hidden title="gh-glossary definition"></iframe>`;
  const tab = root.getElementById('tab');
  const frame = root.getElementById('pop');
  // The frame only accepts messages carrying this nonce, which no page script can see.
  const nonce = crypto.randomUUID();
  frame.src = chrome.runtime.getURL(`popover.html#${nonce}`);
  document.documentElement.appendChild(host);
  const isOurs = (el) => el === host;

  // ---------- glossary ----------
  // Whether GitHub is showing its dark theme: the frame cannot see GitHub's colour variables.
  function pageIsDark() {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g);
    if (!m) return matchMedia('(prefers-color-scheme: dark)').matches;
    const [r, g, b] = m.map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) < 128;
  }
  function sendGlossary() {
    toExtension({ type: 'pop-glossary', nonce, repo: R?.repo || '', dark: pageIsDark(), terms: data?.glossary?.terms || [] });
  }
  function compileGlossary() {
    M = matcher(data?.glossary?.terms || []);
    sendGlossary();
  }

  // ---------- text index over GitHub's DOM ----------
  const BLOCK_SEL = 'p, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, dd, dt';
  const BASE_SKIP = '[data-ghl], button, script, style, textarea, .diff-line-number, .diff-text-marker, [data-code-marker]';
  let blockEntries = new Map(); // block element -> [{ range, id }]
  let termRanges = [];

  // Group text nodes by block so a match never runs across two paragraphs or two code lines.
  function textBlocks(rootEl, blockOf, skip = BASE_SKIP) {
    const groups = new Map();
    const tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => t.parentElement && !t.parentElement.closest(skip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    let t;
    while ((t = tw.nextNode())) {
      const block = blockOf(t.parentElement, rootEl);
      if (!block) continue;
      let g = groups.get(block);
      if (!g) { g = { el: block, nodes: [], text: '' }; groups.set(block, g); }
      g.nodes.push({ node: t, start: g.text.length });
      g.text += t.nodeValue;
    }
    return [...groups.values()];
  }
  const proseBlock = (el, rootEl) => { const b = el.closest(BLOCK_SEL); return b && rootEl.contains(b) ? b : rootEl; };
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
    for (const h of M.hits(g.text, withProse)) {
      const range = rangeIn(g, h.s, h.e);
      termRanges.push(range); addEntry(g.el, { range, id: h.id });
    }
  }

  function filePathOf(container) {
    const h = container.querySelector('h3 code, h3 a, [data-file-path]');
    return (h?.getAttribute('data-file-path') || h?.textContent || '').replace(/[‎‏]/g, '').trim();
  }
  // Outermost rendered-Markdown blocks: README, .md files, issue/PR/discussion bodies and comments.
  function markdownRoots() {
    return [...document.querySelectorAll('.markdown-body')].filter((el) => !el.parentElement.closest('.markdown-body') && !el.closest('form, .js-previewable-comment-form'));
  }

  let refreshing = false;
  async function refresh() {
    if (refreshing || !R) return;
    refreshing = true;
    try {
      blockEntries = new Map(); termRanges = [];
      if (['pr-conversation', 'issue', 'discussion', 'readme', 'blob'].includes(R.kind)) {
        for (const r of markdownRoots()) for (const g of textBlocks(r, proseBlock)) indexTerms(g, true);
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
      renderTab();
    } finally { refreshing = false; }
  }

  function paint() {
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ghl-term');
    if (defsOn && termRanges.length) CSS.highlights.set('ghl-term', new Highlight(...termRanges));
  }

  // ---------- hit testing by position (works under GitHub's transparent code-view textarea too) ----------
  // Only this script's own ranges count: a highlight a page script adds opens nothing.
  const inRect = (x, y, r) => x >= r.left - 1 && x <= r.right + 1 && y >= r.top - 1 && y <= r.bottom + 1;
  const hitIn = (entries, x, y) => entries.find((e) => [...e.range.getClientRects()].some((r) => inRect(x, y, r))) || null;
  function termAt(x, y) {
    if (!defsOn || !termRanges.length) return null;
    const stack = document.elementsFromPoint(x, y);
    if (isOurs(stack[0])) return null;
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

  // ---------- the definition frame ----------
  // The frame (popover.html) draws the definition; this script only says which term, and places it.
  // showSeq: which show the frame's height report belongs to. The frame stays invisible until it has
  // drawn the term it was just asked for, so it never flashes the previous term or an empty box.
  // side: whether the box opened below or above its term. It is kept while the box stays open, so a
  // linked term of another height is drawn in the same place instead of jumping to the other side.
  let popOpen = false, pinned = false, anchorRect = null, hoverEntry = null, showT = 0, hideT = 0, frameH = 120, showSeq = 0, side = null;
  function place() {
    if (!anchorRect) return;
    const r = anchorRect(); if (!r) return;
    const pw = frame.offsetWidth || 420, ph = frameH, m = 12;
    const x = Math.min(Math.max(m, r.left), innerWidth - pw - m);
    if (!side) side = r.bottom + 8 + ph > innerHeight - m && r.top - ph - 8 > m ? 'above' : 'below';
    const y = side === 'above' ? r.top - ph - 8 : r.bottom + 8;
    frame.style.left = x + 'px'; frame.style.top = Math.max(m, Math.min(y, innerHeight - ph - m)) + 'px';
    frame.style.height = Math.min(ph, innerHeight - 2 * m) + 'px';
  }
  function setActiveRange(range) {
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ghl-active');
    if (range) CSS.highlights.set('ghl-active', new Highlight(range));
  }
  function openPop(id, rectFn, pin, range) {
    if (!M.byId[id]) return;
    clearTimeout(hideT);
    if (pin) clearTimeout(showT); // a pending hover must not reopen it unpinned
    pinned = pin; anchorRect = rectFn; popOpen = true; side = null;
    // The box may use three quarters of the page's height: the frame cannot see the page's height itself.
    toExtension({ type: 'pop-show', nonce, id, pinned: pin, seq: ++showSeq, maxH: Math.round(innerHeight * 0.75) });
    frame.style.visibility = 'hidden'; frame.hidden = false; place();
    setActiveRange(range || null);
  }
  function hidePop(force) {
    if (pinned && !force) return;
    if (popOpen) toExtension({ type: 'pop-hide', nonce });
    frame.hidden = true; popOpen = false; pinned = false; anchorRect = null; side = null; setActiveRange(null);
  }

  let raf = 0, lastXY = null;
  document.addEventListener('mousemove', (e) => {
    lastXY = [e.clientX, e.clientY];
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (isOurs(document.elementFromPoint(...lastXY))) { clearTimeout(hideT); return; } // on the tab or in the frame
      const hit = termAt(...lastXY);
      document.documentElement.classList.toggle('ghl-hover-term', !!hit);
      if (pinned) return;
      if (hit && hit !== hoverEntry) {
        hoverEntry = hit; clearTimeout(hideT); clearTimeout(showT);
        showT = setTimeout(() => openPop(hit.id, () => hit.range.getBoundingClientRect(), false, hit.range), 140);
      } else if (!hit && hoverEntry) {
        hoverEntry = null; clearTimeout(showT);
        hideT = setTimeout(() => hidePop(false), 220);
      }
    });
  }, { passive: true });

  document.addEventListener('click', (e) => {
    if (isOurs(e.target)) return; // the tab handles its own clicks; clicks in the frame stay in the frame
    const hit = e.target.closest?.('a') ? null : termAt(e.clientX, e.clientY);
    if (hit && !window.getSelection()?.toString()) { openPop(hit.id, () => hit.range.getBoundingClientRect(), true, hit.range); return; }
    if (popOpen) hidePop(true);
  }, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popOpen) hidePop(true); });
  addEventListener('scroll', () => { if (popOpen) { if (pinned) place(); else hidePop(true); } }, { passive: true, capture: true });
  addEventListener('resize', () => { if (popOpen) place(); });

  // ---------- the tab ----------
  // @ghl-test begin dock
  // First run puts the tab on the right; after that the stored edge and height are kept.
  function startDock(get, set) {
    if (get('dockInit', false) !== true) {
      set('dockInit', true);
      if (get('dock', null) === null) set('dock', { side: 'right', top: 72 });
    }
    return get('dock', null) || { side: 'right', top: 72 };
  }
  // @ghl-test end dock
  let dock = startDock(getVal, setVal); // { side: 'left' | 'right', top }
  const busy = (j) => j && (j.state === 'queued' || j.state === 'running');
  // Select runs started from the context menu that have not ended, in the order they were asked for:
  // { key, text, startedAt, rect, range, n, state }. The host runs them one at a time. selAsked is the
  // number of the Define asked for last: only its definition opens by itself when it is done.
  let selJobs = [], selAsked = 0;

  function statusText() {
    const lines = [];
    if (note) lines.push(note.text);
    for (const j of selJobs) lines.push(j.state === 'queued' ? `Defining “${j.text}”: queued` : `Defining “${j.text}” (${Math.round((Date.now() - j.startedAt) / 1000)} s)…`);
    const dj = data?.defineJob;
    if (busy(dj)) lines.push(dj.state === 'queued' ? 'Defining this page: queued' : 'Defining this page…');
    else if (dj?.state === 'error') lines.push(`Defining failed: ${dj.error}`);
    lines.push('Click for the controls.');
    return lines.join('\n');
  }
  function renderTab() {
    tab.hidden = !R;
    if (!R) return;
    tab.className = dock.side;
    tab.style.top = Math.min(Math.max(0, dock.top), innerHeight - 90) + 'px';
    const dj = data?.defineJob;
    const dot = busy(dj) || selJobs.length ? 'busy' : note?.tone === 'bad' || dj?.state === 'error' ? 'bad' : '';
    const n = M.count;
    tab.title = statusText();
    tab.innerHTML = `<div class="badge">${dot ? `<span class="dot ${dot}"></span>` : ''}<span>gh-glossary</span>${n ? `<span class="n ${defsOn ? '' : 'off'}">${n}</span>` : ''}</div>`;
  }
  addEventListener('resize', renderTab);

  // Drag the tab along the edge (across the middle switches sides). A real click without a drag opens
  // the toolbar popup; a click a page script makes opens nothing.
  tab.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY, x0 = e.clientX, top0 = Math.min(Math.max(0, dock.top), innerHeight - 90);
    let moved = false;
    const move = (ev) => {
      if (!moved && Math.abs(ev.clientY - y0) < 4 && Math.abs(ev.clientX - x0) < 4) return;
      moved = true; tab.classList.add('dragging');
      const side = ev.clientX < innerWidth / 2 ? 'left' : 'right';
      if (side !== dock.side) { dock = { ...dock, side }; tab.classList.remove('left', 'right'); tab.classList.add(side); }
      tab.style.top = Math.min(Math.max(0, top0 + ev.clientY - y0), innerHeight - 90) + 'px';
    };
    const up = (ev) => {
      removeEventListener('mousemove', move, true); removeEventListener('mouseup', up, true);
      tab.classList.remove('dragging');
      if (moved) { dock = { side: dock.side, top: parseFloat(tab.style.top) }; setVal('dock', dock); return; }
      if (e.isTrusted && ev.isTrusted) toExtension({ type: 'open-popup' });
    };
    addEventListener('mousemove', move, true); addEventListener('mouseup', up, true);
  });

  // ---------- define a selection (started from the context menu by the service worker) ----------
  let lastContext = null; // where the context menu was opened
  document.addEventListener('contextmenu', (e) => { lastContext = { x: e.clientX, y: e.clientY }; }, true);
  const shorten = (t, n = 28) => t.length > n ? t.slice(0, n - 1) + '…' : t;
  function currentSelection() {
    // GitHub's code view keeps the selection in a transparent textarea over the lines.
    const ae = document.activeElement;
    const at = lastContext ? new DOMRect(lastContext.x, lastContext.y - 8, 0, 16) : new DOMRect(innerWidth / 2, 80, 0, 16);
    if (ae?.tagName === 'TEXTAREA' && ae.id === 'read-only-cursor-text-area') {
      const text = ae.value.slice(ae.selectionStart, ae.selectionEnd).trim();
      if (!text) return null;
      const from = ae.value.lastIndexOf('\n', ae.selectionStart - 1) + 1;
      let to = ae.value.indexOf('\n', ae.selectionEnd); if (to < 0) to = ae.value.length;
      return { text, context: ae.value.slice(from, to).trim().slice(0, 600), rect: at };
    }
    const s = window.getSelection();
    if (!s || s.isCollapsed || !s.rangeCount) return null;
    const text = s.toString().trim();
    if (!text) return null;
    const r = s.getRangeAt(0);
    const c = r.commonAncestorContainer;
    const anc = c.nodeType === 1 ? c : c.parentElement;
    if (!anc || anc.closest('input, textarea, [contenteditable="true"]')) return { field: true };
    const block = anc.closest(`${BLOCK_SEL}, td.diff-text-cell, .react-file-line`) || anc;
    return { text, context: block.textContent.trim().slice(0, 600), rect: r.getBoundingClientRect(), range: r.cloneRange() };
  }
  const pendingSels = new Map(); // text -> the selection, until the service worker says its run started
  // What the context menu's Define should do with the current selection.
  function selectionRequest() {
    if (!R) return { problem: 'This page is not one gh-glossary handles.' };
    const s = currentSelection();
    if (!s) return { problem: 'Nothing is selected.' };
    if (s.field) return { problem: 'Text in a comment box or other field is not defined.' };
    if (s.text.length > 120 || s.text.includes('\n')) return { problem: 'Select at most 120 characters on one line.' };
    if (selJobs.some((j) => j.text === s.text)) return { problem: `Already defining “${shorten(s.text)}”.` };
    const known = M.termFor(s.text);
    selAsked++;
    if (known) { openPop(known.id, () => s.rect, true); return { known: true }; }
    pendingSels.set(s.text, { ...s, n: selAsked });
    return { text: s.text, context: s.context, nwo: pageNwo() };
  }

  // Words waiting for or being defined pulse between two highlights (steady with reduced motion).
  let pulseT = 0, pulseOn = false;
  const calm = matchMedia('(prefers-reduced-motion: reduce)');
  function renderPending() {
    clearInterval(pulseT); pulseT = 0;
    if (!window.CSS?.highlights) return;
    CSS.highlights.delete('ghl-pending'); CSS.highlights.delete('ghl-pending-dim');
    const ranges = selJobs.map((j) => j.range).filter((r) => r && r.startContainer.isConnected);
    if (!ranges.length) return;
    const show = () => {
      pulseOn = !pulseOn;
      CSS.highlights.delete(pulseOn ? 'ghl-pending-dim' : 'ghl-pending');
      CSS.highlights.set(pulseOn ? 'ghl-pending' : 'ghl-pending-dim', new Highlight(...ranges));
    };
    show();
    if (!calm.matches) pulseT = setInterval(show, 700);
  }

  let selTick = 0;
  async function trackSelect() {
    clearTimeout(selTick);
    if (!selJobs.length) { renderPending(); return; }
    const done = [], notes = [];
    for (const j of [...selJobs]) {
      let job = null;
      try { job = await api('GET', '/api/job', { query: { key: j.key } }); } catch (e) {
        // The host stopped or forgot the job (it restarted): the term may or may not have been saved.
        selJobs = selJobs.filter((x) => x !== j);
        notes.push({ lost: j, why: e.message });
        continue;
      }
      j.state = job.state;
      if (job.state === 'error') { selJobs = selJobs.filter((x) => x !== j); notes.push({ text: `Defining “${shorten(j.text)}” failed: ${job.error}`, tone: 'bad' }); }
      else if (job.state === 'done') { selJobs = selJobs.filter((x) => x !== j); done.push({ j, termId: job.result?.termId }); }
    }
    if (done.length || notes.some((n) => n.lost)) await load();
    for (const n of notes) if (n.lost) Object.assign(n, { text: `Lost track of defining “${shorten(n.lost.text)}”: ${n.why}${data && !M.termFor(n.lost.text) ? '. It was not defined; try again.' : ''}`, tone: 'bad' });
    if (done.length) notes.push({ text: `Defined ${done.map(({ j }) => `“${shorten(j.text)}”`).join(', ')}.` });
    if (notes.length) note = { text: notes.map((n) => n.text).join('\n'), tone: notes.some((n) => n.tone === 'bad') ? 'bad' : '' };
    renderPending(); renderTab();
    // Only the Define asked for last opens by itself; the others are underlined where they occur.
    const last = done.find(({ j }) => j.n === selAsked);
    if (last) {
      const { j, termId } = last;
      const id = termId && M.byId[termId] ? termId : M.termFor(j.text)?.id;
      if (id) {
        const own = j.range && j.range.startContainer.isConnected ? j.range : null;
        const e = own ? null : [...blockEntries.values()].flat().find((x) => x.id === id && x.range.getBoundingClientRect().top > 0);
        const at = own || e?.range;
        openPop(id, at ? () => at.getBoundingClientRect() : () => j.rect, true, at);
      }
    }
    if (selJobs.length) selTick = setTimeout(trackSelect, 2000);
  }

  // ---------- messages from the extension (service worker, relayed from the frame and the popup) ----------
  chrome.runtime.onMessage.addListener((m, sender, reply) => {
    if (sender.id !== chrome.runtime.id) return false;
    if (m?.type === 'frame' && m.nonce === nonce) {
      if (m.event === 'ready') { sendGlossary(); return false; }
      if (m.event === 'height') {
        // The side is chosen from the height of the term just asked for, not from the previous one.
        const first = m.value?.seq === showSeq && frame.style.visibility === 'hidden';
        frameH = Math.max(40, Math.min(Number(m.value?.h) || 120, innerHeight - 24));
        if (first) side = null;
        place();
        if (m.value?.seq === showSeq) frame.style.visibility = '';
        return false;
      }
      if (m.event === 'pin') { pinned = true; clearTimeout(hideT); return false; }
      if (m.event === 'close') { hidePop(true); return false; }
      return false;
    }
    if (m?.type === 'page-info') { reply({ nwo: pageNwo(), status: R ? { note, selJobs: selJobs.map((j) => ({ text: j.text, startedAt: j.startedAt, state: j.state })) } : null }); return false; }
    if (m?.type === 'selection') { reply(selectionRequest()); return false; }
    if (m?.type === 'select-started' && pendingSels.has(m.text)) {
      const p = pendingSels.get(m.text); pendingSels.delete(m.text);
      if (!selJobs.some((j) => j.key === m.key)) selJobs.push({ key: m.key, text: p.text, startedAt: Date.now(), rect: p.rect, range: p.range || null, n: p.n, state: 'queued' });
      // The browser's own selection colour would cover the pending highlight.
      if (p.range && window.getSelection()?.toString().trim() === p.text) window.getSelection().removeAllRanges();
      note = null; renderPending(); renderTab(); trackSelect(); return false;
    }
    if (m?.type === 'note') { note = { text: String(m.text || ''), tone: m.tone === 'bad' ? 'bad' : '' }; renderTab(); return false; }
    if (m?.type === 'reload') { note = null; load(); return false; }
    return false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.defs) return;
    defsOn = changes.defs.newValue !== false; store.defs = defsOn;
    if (!defsOn) hidePop(true);
    paint(); renderTab();
  });

  // ---------- data ----------
  let pollT = 0;
  async function load() {
    const r = R; clearTimeout(pollT);
    try {
      const d = await api('GET', '/api/page', { query: pageQuery(R) });
      if (R !== r) return;
      // Any change counts, a Thorough correction of a definition or pattern included.
      const sig = (x) => JSON.stringify(x?.glossary?.terms ?? null);
      const changed = sig(d) !== sig(data);
      data = d;
      if (changed) { compileGlossary(); await refresh(); } else renderTab();
      if (busy(d.defineJob)) pollT = setTimeout(load, 8000);
    } catch (e) {
      if (R !== r) return;
      data = null; note = { text: e.code === 'down' ? `The gh-glossary host is not reachable (${e.message}).` : e.message, tone: 'bad' }; renderTab();
    }
  }

  // ---------- GitHub is a single-page app: follow navigation and lazy-loaded content ----------
  let refreshT = 0;
  const mo = new MutationObserver((muts) => {
    if (!R) return;
    if (muts.every((m) => isOurs(m.target) || ([...m.addedNodes, ...m.removedNodes].length > 0 && [...m.addedNodes, ...m.removedNodes].every(isOurs)))) return;
    clearTimeout(refreshT); refreshT = setTimeout(refresh, 500);
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });

  let lastPath = '';
  function onRoute() {
    syncTitle();
    if (!host.isConnected) document.documentElement.appendChild(host);
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const nr = route(pageNwo());
    const changed = (nr && nr.key) !== (R && R.key);
    R = nr; hidePop(true);
    if (!R) { CSS.highlights?.clear(); renderTab(); return; }
    if (changed) { data = null; note = null; selJobs = []; pendingSels.clear(); renderPending(); compileGlossary(); renderTab(); load(); }
    else setTimeout(refresh, 300);
  }
  setInterval(onRoute, 600);
  onRoute();
})();
