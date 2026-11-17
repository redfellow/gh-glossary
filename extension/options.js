import { DEFAULT_TEMPLATES } from './link.js';
import { parseFolders } from './options-parse.js';

const $ = (id) => document.getElementById(id);
const api = (method, path, opts = {}) => chrome.runtime.sendMessage({ type: 'api', method, path, ...opts });

async function load() {
  const { templates = {}, folders = {} } = await chrome.storage.local.get(['templates', 'folders']);
  $('tpl-pr').value = templates.pr ?? DEFAULT_TEMPLATES.pr;
  $('tpl-doc').value = templates.doc ?? DEFAULT_TEMPLATES.doc;
  $('folders').value = Object.entries(folders).map(([k, v]) => `${k} = ${v}`).join('\n');
}

function status(text, cls = '') { $('status').textContent = text; $('status').className = cls; }

async function save() {
  const { folders, bad } = parseFolders($('folders').value);
  if (bad.length) { status(`Not understood: ${bad[0]}`, 'bad'); return; }
  const missing = [];
  for (const [k, p] of Object.entries(folders)) {
    const r = await api('GET', '/api/dir', { query: { path: p } });
    if (!r?.body?.ok) missing.push(k);
  }
  await chrome.storage.local.set({ templates: { pr: $('tpl-pr').value, doc: $('tpl-doc').value }, folders });
  status(missing.length ? `Saved. No such folder for ${missing.join(', ')} (the app will ask).` : 'Saved.', missing.length ? 'bad' : 'ok');
}

async function health() {
  const r = await api('GET', '/api/health');
  if (r?.code === 200) {
    const m = r.body.modes;
    $('health').innerHTML = '';
    $('health').className = 'ok';
    $('health').textContent = `Connected. Quick ${m.quick.model}/${m.quick.effort}, Thorough ${m.thorough.model}/${m.thorough.effort}, Select ${m.select.model}/${m.select.effort}.`;
  } else {
    $('health').className = 'bad';
    $('health').textContent = `Not connected: ${r?.body?.error || 'no answer'}. Run host/install.sh in the gh-glossary folder, then reload the extension.`;
  }
}

function renderAllow(allow) {
  const ul = $('allow'); ul.textContent = '';
  const rows = [...(allow.owners || []).map((n) => ['owner', n]), ...(allow.repos || []).map((n) => ['repo', n])];
  if (!rows.length) { const li = document.createElement('li'); li.textContent = 'Nothing yet.'; li.className = 'hint'; ul.append(li); return; }
  for (const [scope, name] of rows) {
    const li = document.createElement('li');
    const span = document.createElement('span'); span.textContent = scope === 'owner' ? `${name} (all repos)` : name;
    const b = document.createElement('button'); b.textContent = 'Remove';
    b.addEventListener('click', async () => { const r = await api('POST', '/api/disallow', { body: { scope, name } }); if (r?.code === 200) renderAllow(r.body); });
    li.append(span, b); ul.append(li);
  }
}

$('save').addEventListener('click', save);
$('reset').addEventListener('click', () => { $('tpl-pr').value = DEFAULT_TEMPLATES.pr; $('tpl-doc').value = DEFAULT_TEMPLATES.doc; status('Templates reset; Save to keep.'); });
load();
health();
api('GET', '/api/allowlist').then((r) => { if (r?.code === 200) renderAllow(r.body); });
