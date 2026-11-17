// Code shared by the content script and the extension's own pages (popup, definition frame,
// service worker): which GitHub page an address is, and where the glossary's terms occur in a text.
// A classic script that sets globalThis.ghl, so a content script, an extension page and a module
// service worker can all load it.

(function (g) {
  'use strict';

  // ---------- which page is this ----------
  // kind: pr-conversation | pr-files | pr-other | issue | discussion | blob | readme
  // @ghl-test begin route
  // First path segments that are GitHub's own pages, not an owner.
  const RESERVED = new Set(['about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'copilot', 'dashboard', 'enterprise', 'enterprises',
    'events', 'explore', 'features', 'gist', 'github-copilot', 'issues', 'login', 'logout', 'marketplace', 'new', 'notifications', 'orgs', 'organizations',
    'pricing', 'pulls', 'readme', 'search', 'security', 'sessions', 'settings', 'signup', 'site', 'sponsors', 'stars', 'team', 'topics', 'trending', 'users']);
  // nwo: the page's own owner/repo spelling, used when it equals the address ignoring case.
  function route(nwo, pathname = location.pathname) {
    let parts;
    try { parts = pathname.split('/').filter(Boolean).map(decodeURIComponent); } catch { return null; } // a malformed % escape: not a page we handle
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

  // The host query for a routed page.
  function pageQuery(R) {
    const q = { repo: R.repo };
    if (R.blob) q.blob = R.blob; else q.page = R.page;
    if (R.ref) q.ref = R.ref;
    return q;
  }

  // ---------- where terms occur ----------
  // @ghl-test begin match
  // A matcher over a glossary's terms: code terms match case-sensitively, prose terms ignoring case.
  // A term whose pattern matches an empty string in some text would hide every term after it in the
  // combined regex, so it is left out from then on.
  function matcher(allTerms) {
    const skip = new Set();
    let code = null, prose = null;
    const byId = Object.create(null); // no prototype: an id such as constructor or __proto__ is just an id
    for (const t of allTerms) byId[t.id] = t;
    const valid = (t) => { try { new RegExp(t.pattern); return true; } catch { return false; } };
    for (const t of allTerms) if (!valid(t)) skip.add(t.id); // one bad pattern must not break the combined regex
    function build() {
      const terms = allTerms.filter((t) => !skip.has(t.id));
      const make = (list, flags) => {
        if (!list.length) return null;
        try { return { re: new RegExp(list.map((t) => `(${t.pattern})`).join('|'), flags), list }; } catch { return null; }
      };
      code = make(terms.filter((t) => t.code), 'g');
      prose = make(terms.filter((t) => !t.code), 'gi');
    }
    build();
    // Every match in text as { s, e, t }, or null when a term matched an empty string (it is then
    // left out and the caller starts over).
    function matchesIn(m, text) {
      const out = []; m.re.lastIndex = 0; let x;
      while ((x = m.re.exec(text))) {
        const gi = x.findIndex((v, i) => i > 0 && v !== undefined) - 1;
        if (!x[0]) {
          if (m.list[gi]) { skip.add(m.list[gi].id); build(); return null; }
          m.re.lastIndex++; continue;
        }
        out.push({ s: x.index, e: x.index + x[0].length, t: m.list[gi] });
      }
      return out;
    }
    // Non-overlapping hits in text, code terms first: [{ s, e, id }].
    function hits(text, withProse, exclude = null) {
      for (let tries = 0; tries < 50; tries++) {
        const found = [];
        let again = false;
        for (const m of [code, withProse ? prose : null]) {
          if (!m) continue;
          const ms = matchesIn(m, text);
          if (!ms) { again = true; break; }
          for (const { s, e, t } of ms) if (t && t.id !== exclude && !found.some((h) => s < h.e && e > h.s)) found.push({ s, e, id: t.id });
        }
        if (!again) return found;
      }
      return [];
    }
    // The term whose pattern matches all of text, if any.
    function termFor(text) {
      return allTerms.find((t) => !skip.has(t.id) && (() => { try { return new RegExp(`^(?:${t.pattern})$`, t.code ? '' : 'i').test(text); } catch { return false; } })());
    }
    return { hits, termFor, byId, get count() { return allTerms.length - skip.size; } };
  }
  // @ghl-test end match

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  g.ghl = Object.freeze({ route, pageQuery, matcher, esc });
})(globalThis);
