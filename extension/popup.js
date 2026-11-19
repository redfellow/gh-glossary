// The toolbar popup: the controls for the page in the active tab. It is an extension page, so its
// clicks are the reader's; the page cannot reach it. Runs are started by the service worker. When a
// repository is not allowed yet, the question is asked here, and the run starts after an allow.
const { route, pageQuery, esc } = globalThis.ghl;
const main = document.getElementById('main');

let tab = null, R = null, data = null, status = null, error = null, regen = false, notice = null, defsOn = true;
let ask = null; // { id, repo, what }: the question waiting for an answer
// An update of gh-glossary itself (openspec/specs/self-update): the last check, a line about the update
// just installed, and why one was refused.
let upd = null, updNote = null;
// The service worker drops a question this popup showed when the popup closes.
chrome.runtime.connect({ name: 'popup' });

const send = (m) => chrome.runtime.sendMessage(m);
async function api(method, path, query) {
  const r = await send({ type: 'api', method, path, query });
  if (!r || r.code === 0) throw Object.assign(new Error(r?.body?.error || 'host not reachable'), { code: 'down' });
  if (r.code >= 400) throw new Error(r.body?.error || `error ${r.code}`);
  return r.body;
}

const busy = (j) => j && (j.state === 'queued' || j.state === 'running');
const mins = (iso) => iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)) : 0;
const took = (ms) => {
  if (!ms) return '';
  const s = Math.round(ms / 1000);
  return ` · took ${s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`}`;
};
const modeLabel = (m) => data?.modes?.[m] ? `${data.modes[m].model}/${data.modes[m].effort}` : '';
const pageLabel = () => R.pr ? `pull request #${R.pr}` : R.kind === 'issue' ? `issue #${R.page.slice(6)}` : R.kind === 'discussion' ? `discussion #${R.page.slice(11)}`
  : R.kind === 'readme' ? 'home page' : data?.page?.startsWith('file:') ? data.page.slice(5) : 'file';
// Send to Claude is offered on pull requests and on Markdown documents.
const docPath = () => R?.kind === 'blob' && data?.page?.startsWith('file:') && /\.(?:md|mdx|markdown)$/i.test(data.page) ? data.page.slice(5) : null;
const canSend = () => !!R && (!!R.pr || !!docPath());
// How pages by people who cannot write to the repository are treated (openspec/specs/outside-content).
// The host keeps the choice; only this popup can change it.
const OUTSIDE = [
  ['off', 'Off', 'Such pages are treated like any other'],
  ['limit-writes', 'Limit writes', 'A run on such a page changes no other page\'s terms and adds no owner terms'],
  ['outside-pages', 'Outside pages', 'Also: its terms show only on that page, and comments by such people are not read'],
];

function statusLines() {
  const lines = [];
  if (notice) lines.push(notice);
  if (error) lines.push(error.code === 'down'
    ? { text: `The gh-glossary host is not reachable (${esc(error.message)}). Run <code>host/install.sh</code> (Windows: <code>host\\install.cmd</code>) from the gh-glossary folder, then reload the extension.`, tone: 'bad' }
    : { text: esc(error.message), tone: 'bad' });
  if (status?.note) lines.push({ text: esc(status.note.text), tone: status.note.tone });
  for (const j of status?.selJobs || []) lines.push({ text: j.state === 'queued' ? `Defining “${esc(j.text)}”: queued` : `Defining “${esc(j.text)}” (${Math.round((Date.now() - j.startedAt) / 1000)} s)…` });
  if (!data) return lines;
  const terms = data.glossary?.terms || [];
  const dj = data.defineJob, pi = data.pageInfo;
  if (busy(dj)) lines.push({ text: dj.state === 'queued' ? 'Defining: queued behind another run…' : `Defining this page (${mins(dj.startedAt)} min so far)…` });
  else if (dj?.state === 'error') lines.push({ text: `Defining failed: ${esc(dj.error)}`, tone: 'bad' });
  if (pi) {
    const here = terms.filter((t) => t.origin === `${R.repo}:${data.page}`).length;
    lines.push({ text: `${here} terms from this page${pi.corrected ? `, ${pi.corrected} corrected` : ''} · ${new Date(pi.lastRun).toLocaleDateString()} · ${esc(pi.model || pi.mode)}${took(pi.durationMs)}` });
    const left = Number(pi.leftOut) || 0;
    if (left) lines.push({ text: `${left} comment${left === 1 ? '' : 's'} by outside contributors ${left === 1 ? 'was' : 'were'} not read.` });
    if (pi.notes) lines.push({ text: `The run reported: ${esc(pi.notes)}` });
  } else if (!busy(dj)) lines.push({ text: `This page has not been defined yet. ${terms.length} terms known for this repo.` });
  if (!data.allowed) lines.push({ text: 'Not on your allowlist yet: Quick or Thorough asks first.' });
  return lines;
}

function updateHtml() {
  const lines = [];
  if (updNote) lines.push(`<div class="${updNote.tone || ''}">${updNote.text}</div>`);
  if (upd?.state === 'available') {
    const more = upd.count > upd.titles.length ? `<li>and ${upd.count - upd.titles.length} more</li>` : '';
    lines.push(`<div class="row"><span class="lbl">gh-glossary update: ${upd.count} new commit${upd.count === 1 ? '' : 's'}</span><button class="btn" data-update>Update now</button></div>
      <ul class="commits">${upd.titles.map((t) => `<li>${esc(t)}</li>`).join('')}${more}</ul>
      ${upd.local ? `<div class="hint">Your ${upd.local} commit${upd.local === 1 ? '' : 's'} on main that ${upd.local === 1 ? 'is' : 'are'} not on GitHub will be replaced (<code>git reflog</code> keeps ${upd.local === 1 ? 'it' : 'them'}).</div>` : ''}`);
  }
  return lines.length ? `<div class="update">${lines.join('')}</div>` : '';
}

function renderAsk() {
  const [owner, name] = ask.repo.split('/');
  main.innerHTML = `
    <div class="row"><span class="title">gh-glossary</span></div>
    <div class="where">${esc(R.repo)} · ${esc(pageLabel())}</div>
    <p class="q">Let Claude define terms on ${esc(ask.repo)}?</p>
    <p class="hint">Runs use read-only tools on a local checkout of the repository. The page's text goes to Claude.${ask.what ? ` After you allow it: ${esc(ask.what)}.` : ''}</p>
    <div class="row">
      <button class="btn" data-answer="cancel" id="cancel">Cancel</button>
      <button class="btn" data-answer="repo">Allow ${esc(name)}</button>
      <button class="btn" data-answer="owner">Allow all of ${esc(owner)}</button>
    </div>
    ${notice ? `<div class="status"><div class="${notice.tone || ''}">${notice.text}</div></div>` : ''}`;
  document.getElementById('cancel').focus(); // Enter cancels: allowing always takes a deliberate click
}

function render() {
  if (R && ask) { renderAsk(); return; }
  if (!R) { main.innerHTML = `<div class="row"><span class="title">gh-glossary</span></div>${updateHtml()}<div class="status">This page is not one gh-glossary handles. Open a pull request, issue, discussion, file or repository home page on github.com.</div>`; return; }
  const dj = data?.defineJob;
  const dis = !data || busy(dj) ? 'disabled' : '';
  const n = data?.glossary?.terms?.length || 0;
  main.innerHTML = `
    <div class="row"><span class="title">gh-glossary</span>
      <button class="sw" role="switch" aria-checked="${defsOn}" data-sw><i></i>Definitions${n ? ` (${n})` : ''}</button></div>
    <div class="where">${esc(R.repo)} · ${esc(pageLabel())}</div>
    ${updateHtml()}
    <div class="row"><span class="lbl">${regen ? 'Redo this page:' : 'Define this page:'}</span>
      <button class="btn" data-define="quick" ${dis} title="${esc(modeLabel('quick'))}, usually under a minute">Quick</button>
      <button class="btn" data-define="thorough" ${dis} title="${esc(modeLabel('thorough'))}, about 5 min">Thorough</button>
      <label class="chk" title="Define this page again. Its terms are replaced when the run succeeds; terms you defined by selection are kept"><input type="checkbox" data-regen ${regen ? 'checked' : ''} ${data?.pageInfo ? '' : 'disabled'}>Regenerate</label></div>
    ${canSend() ? `<div class="row"><button class="btn" data-claude title="Open a new Claude Code session in the Claude desktop app with this ${R.pr ? 'pull request' : 'document'} in the composer">Send to Claude</button></div>` : ''}
    <div class="row"><label class="lbl" for="outside" title="Pages opened by people who are not an owner, member or collaborator of the repository, and pull requests from forks">Outside contributors:</label>
      <select class="sel" id="outside" data-outside ${data ? '' : 'disabled'}>${OUTSIDE.map(([v, label, tip]) => `<option value="${v}" title="${esc(tip)}" ${(data?.outsideMode || 'off') === v ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="status">${statusLines().map((l) => `<div class="${l.tone || ''}">${l.text}</div>`).join('')}</div>`;
}

async function refresh() {
  if (ask) return; // the question stays as it is until it is answered
  try { data = await api('GET', '/api/page', pageQuery(R)); error = null; } catch (e) { data = null; error = e; }
  try { status = (await chrome.tabs.sendMessage(tab.id, { type: 'page-info' }))?.status || null; } catch { status = null; }
  if (document.activeElement?.matches?.('[data-outside]')) return; // drawing again would close the open list
  render();
}

main.addEventListener('click', async (e) => {
  const u = e.target.closest('[data-update]');
  if (u && !u.disabled) {
    updNote = { text: 'Updating…' }; render();
    const r = await send({ type: 'update-apply' });
    // On success the extension reloads, which closes this popup.
    if (r?.code === 200 && !r.body?.updated) { upd = null; updNote = { text: 'gh-glossary is up to date.' }; }
    else if (r?.code !== 200) {
      ({ update: upd } = (await send({ type: 'update-status' }))?.body || {});
      updNote = { text: esc(r?.body?.error || 'Could not update.'), tone: 'bad' };
    }
    render(); return;
  }
  if (e.target.closest('[data-sw]')) { defsOn = !defsOn; await chrome.storage.local.set({ defs: defsOn }); render(); return; }
  const d = e.target.closest('[data-define]');
  if (d && !d.disabled) {
    notice = { text: 'Starting…' }; render();
    const r = await send({ type: 'start-define', tabId: tab.id, url: tab.url, query: pageQuery(R), mode: d.dataset.define, regenerate: regen });
    if (r?.body?.ask) { ask = r.body.ask; notice = null; render(); return; }
    notice = r?.code === 202 ? null : { text: esc(r?.body?.error || 'Could not start the run.'), tone: 'bad' };
    if (r?.code === 202) regen = false;
    await refresh(); return;
  }
  const a = e.target.closest('[data-answer]');
  if (a && ask) {
    const scope = a.dataset.answer, what = ask.what;
    if (scope !== 'cancel') { notice = { text: 'Allowing…' }; render(); }
    const r = await send({ type: 'allow-answer', id: ask.id, scope });
    ask = null;
    notice = scope === 'cancel' || r?.body?.cancelled ? null
      : r?.code === 202 ? { text: `Allowed${what ? `: ${esc(what)} started` : ''}.` }
      : { text: esc(r?.body?.error || 'Could not save the choice.'), tone: r?.code === 409 ? '' : 'bad' };
    if (r?.code === 202) regen = false;
    await refresh(); return;
  }
  if (e.target.closest('[data-claude]')) {
    const req = R.pr ? { kind: 'pr', repo: R.repo, number: R.pr } : { kind: 'doc', repo: R.repo, path: docPath(), ref: data?.ref || 'HEAD' };
    const r = await send({ type: 'claude-link', ...req });
    if (!r || r.code !== 200) { notice = { text: esc(r?.body?.error || 'Could not build the Claude link.'), tone: 'bad' }; render(); return; }
    const a = document.createElement('a'); a.href = r.body.url; a.click();
    notice = { text: r.body.folder
      ? 'Opened Claude in the folder set for this repo. Check the prompt there and press Enter.'
      : `Opened Claude. No folder is set for ${esc(R.repo)}: pick one in the app, or add one in the extension's options.` };
    render();
  }
});
main.addEventListener('change', async (e) => {
  if (e.target.matches('[data-regen]')) { regen = e.target.checked; render(); return; }
  if (e.target.matches('[data-outside]')) {
    const mode = e.target.value;
    e.target.blur();
    const r = await send({ type: 'set-outside', mode });
    notice = r?.code === 200 ? null : { text: esc(r?.body?.error || 'Could not save the choice.'), tone: 'bad' };
    chrome.tabs.sendMessage(tab.id, { type: 'reload' }).catch(() => {}); // the page's terms depend on the mode
    await refresh();
  }
});

(async () => {
  try { ({ defs: defsOn = true } = await chrome.storage.local.get('defs')); } catch {}
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let url = null; try { url = new URL(tab?.url || ''); } catch {}
  let nwo = '';
  if (url?.origin === 'https://github.com') { try { nwo = (await chrome.tabs.sendMessage(tab.id, { type: 'page-info' }))?.nwo || ''; } catch {} }
  R = url?.origin === 'https://github.com' ? route(nwo, url.pathname) : null;
  // The update check may fetch from GitHub: the popup does not wait for it.
  send({ type: 'update-status' }).then((r) => {
    const b = r?.body || {};
    upd = b.update || null;
    if (b.updateError) updNote = { text: esc(b.updateError), tone: 'bad' };
    else if (b.updated) updNote = { text: `Updated gh-glossary${b.updated.count ? ` (${b.updated.count} new commit${b.updated.count === 1 ? '' : 's'})` : ''}.${b.updated.reinstall ? ' The installer changed: run <code>host/install.sh</code> again (Windows: <code>host\\install.cmd</code>).' : ''}` };
    if (upd?.state === 'available' || updNote) render();
  }).catch(() => {});
  if (R) { try { ask = (await send({ type: 'allow-pending', tabId: tab.id }))?.body?.ask || null; } catch {} }
  render();
  if (!R) return;
  await refresh();
  setInterval(refresh, 3000);
})();
