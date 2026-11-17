// The definition box. It is an extension page in a frame the content script places next to a term,
// so no script on github.com can read the definition or click inside it. It hears from its own
// content script by chrome.runtime messages that carry the nonce in its address, and answers through
// the service worker, which passes the message to this frame's tab.
const { esc, matcher } = globalThis.ghl;
const nonce = location.hash.slice(1);
const box = document.getElementById('box');

let repo = '', M = matcher([]), TERM = Object.create(null);
let stack = [], pinned = false, seq = 0;

const tell = (event, value) => { chrome.runtime.sendMessage({ type: 'pop-event', nonce, event, value }).catch(() => {}); };
// The frame's height, for the show it belongs to (the content script shows the frame on this answer).
const tellHeight = () => tell('height', { h: box.offsetHeight, seq });

function fmt(s) {
  let out = esc(s).replace(/&lt;br&gt;/g, '<br>');
  // s is escaped already, so id and label are too; the linked term's name comes from the glossary and is not.
  out = out.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, id, label) => TERM[id] ? `<button class="xref" data-term="${id}">${label || esc(TERM[id].term)}</button>` : (label || id));
  return out.replace(/`([^`]+)`/g, '<code>$1</code>');
}
function originLink(t) {
  const o = t.origin || '', cut = o.indexOf(':'); // page keys can contain ':' themselves (file:<path>)
  const from = o.slice(0, cut), page = o.slice(cut + 1);
  if (cut < 1 || !page) return '';
  const sha = t.ref ? t.ref.slice(0, 7) : '';
  const url = 'https://github.com' + (page.startsWith('pr-') ? `/${from}/pull/${page.slice(3)}` : page.startsWith('issue-') ? `/${from}/issues/${page.slice(6)}`
    : page.startsWith('discussion-') ? `/${from}/discussions/${page.slice(11)}` : page === 'readme' ? `/${from}`
    : page.startsWith('file:') ? `/${from}/blob/${t.ref || 'HEAD'}/${page.slice(5)}` : `/${from}`);
  const label = page.startsWith('pr-') ? `PR #${page.slice(3)}` : page.startsWith('issue-') ? `issue #${page.slice(6)}`
    : page.startsWith('discussion-') ? `discussion #${page.slice(11)}` : page === 'readme' ? 'README'
    : page.startsWith('file:') ? page.slice(5).split('/').pop() : 'another page';
  const other = from !== repo ? ` in ${from.split('/')[1]}` : '';
  return `from <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>${esc(other)}${sha ? ` at ${esc(sha)}` : ''}`;
}
// A run may write any link, and a run can be prompt-injected: only https, the host shown on the
// link, and no query or fragment, so a link cannot carry what the run read off to another site.
function linkOf(raw) {
  if (typeof raw !== 'string' || raw.length > 500) return null;
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  u.search = ''; u.hash = '';
  return { href: u.href, host: u.host };
}
// Other known terms inside a definition become buttons that show them.
function wrapTermsIn(el, exclude) {
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => t.parentElement.closest('button, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
  const nodes = []; let t; while ((t = tw.nextNode())) nodes.push(t);
  for (const node of nodes) {
    const s = node.nodeValue;
    const hits = M.hits(s, true, exclude).sort((a, b) => a.s - b.s);
    if (!hits.length) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    for (const h of hits) {
      frag.append(s.slice(last, h.s));
      const b = document.createElement('button'); b.className = 'xref'; b.dataset.term = h.id; b.textContent = s.slice(h.s, h.e);
      frag.append(b); last = h.e;
    }
    frag.append(s.slice(last)); node.replaceWith(frag);
  }
}
const layerLabel = (g) => g.layer === 'org' ? `all ${esc(repo.split('/')[0] || 'owner')} repos` : 'this repo';

function renderPop() {
  const top = stack[stack.length - 1];
  const g = top && TERM[top];
  if (!g) { box.hidden = true; return; }
  const head = `<span class="kind">Definition</span>${g.category ? `<span class="layer">${esc(g.category)}</span>` : ''}<span class="layer ${g.layer === 'org' ? 'org' : ''}">${layerLabel(g)}</span>`;
  const safeLink = linkOf(g.link);
  const body = `<div class="pt">${esc(g.term)}</div>${g.where ? `<div class="where">${esc(g.where)}</div>` : ''}<div class="pdef">${fmt(g.def)}</div>
    ${safeLink ? `<div style="margin-top:8px"><a href="${esc(safeLink.href)}" target="_blank" rel="noopener noreferrer">Open link on ${esc(safeLink.host)}</a></div>` : ''}`;
  const when = g.definedAt ? new Date(g.definedAt).toLocaleDateString() : '';
  const checked = g.verified === true ? 'Verified at source' : g.verified === false ? 'Not verified at source' : '';
  const revised = g.revisedAt ? `<br>Revised ${esc(new Date(g.revisedAt).toLocaleDateString())}: ${esc(g.revisionReason || '')}` : '';
  const prov = `<div class="prov">${g.selected ? 'You asked · ' : ''}Defined ${esc(when)} ${originLink(g)}${g.model ? ` · ${esc(g.model)}` : ''}${checked ? `<br>${checked}${g.spec ? ` · spec v${esc(g.spec)}` : ''}` : ''}${revised}</div>`;
  const trail = stack.length > 1 ? `<div class="crumbs">${stack.map((id) => esc(TERM[id]?.term || id)).join(' › ')}</div>` : '';
  box.innerHTML = `<div class="ph">${head}<span class="sp"></span>${stack.length > 1 ? '<button data-act="back">← Back</button>' : ''}${pinned ? '<button data-act="close" aria-label="Close">✕</button>' : ''}</div>
    <div class="pb">${body}</div>${prov}${trail}${pinned ? '' : '<div class="hint">Click to pin and follow linked terms.</div>'}`;
  wrapTermsIn(box.querySelector('.pdef'), top);
  box.classList.toggle('pinned', pinned);
  box.hidden = false;
  tellHeight();
}

chrome.runtime.onMessage.addListener((m, sender) => {
  if (sender.id !== chrome.runtime.id || m?.nonce !== nonce) return false;
  if (m.type === 'pop-glossary') {
    repo = String(m.repo || '');
    const terms = Array.isArray(m.terms) ? m.terms : [];
    M = matcher(terms); TERM = M.byId;
    document.documentElement.classList.toggle('dark', !!m.dark);
    if (stack.length) renderPop();
  } else if (m.type === 'pop-show') {
    stack = [String(m.id)]; pinned = !!m.pinned; seq = Number(m.seq) || 0;
    const maxH = Number(m.maxH);
    if (maxH > 0) document.documentElement.style.setProperty('--pb-max', `${Math.max(160, maxH - 110)}px`); // leave room for the header and provenance
    renderPop();
  } else if (m.type === 'pop-hide') {
    stack = []; pinned = false; box.hidden = true;
  }
  return false;
});

box.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'close') { tell('close'); return; }
  if (act === 'back') { stack.pop(); renderPop(); return; }
  const x = e.target.closest('.xref');
  if (x) { pinned = true; tell('pin'); stack.push(x.dataset.term); renderPop(); return; }
  if (e.target.closest('a')) return;
  if (!pinned) { pinned = true; tell('pin'); renderPop(); }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape') tell('close'); });
new ResizeObserver(() => { if (!box.hidden) tellHeight(); }).observe(box);
tell('ready');
