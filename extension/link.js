// Builds the claude://code/new link that opens a Claude Code session in the Claude desktop app with
// the composer prefilled. Pure logic, shared by the service worker, the options page and the tests.

export const DEFAULT_TEMPLATES = {
  pr: '{repo}#{number} {url}\n\nRead the pull request with gh: gh pr view {number} --repo {repo}',
  doc: '{repo} {path} at {ref} {url}\n\nRead the document with gh: gh api "repos/{repo}/contents/{path}?ref={ref}" -H "Accept: application/vnd.github.raw"',
};

// {repo}, {number}, {path}, {ref} and {url}; anything else in braces is left as it is.
export function fill(template, vars) {
  return String(template).replace(/\{(repo|number|path|ref|url)\}/g, (_, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])));
}

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9_.-]{1,100}$/;
// A path or ref comes from the page's address, so it can hold quotes, ;, $ and line breaks. It is
// percent-encoded (as a URL path would be anyway), so in the prompt it is one plain word that cannot
// close the quotes of the gh command around it or start a new line.
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const encPath = (p) => p.split('/').map(enc).join('/');

// req: { kind: 'pr' | 'doc', repo, number?, path?, ref? }. folder: an absolute path already checked to exist, or null.
export function claudeLink(templates, req, folder) {
  if (!REPO_RE.test(req.repo || '')) throw new Error('bad repo');
  let vars;
  if (req.kind === 'pr') {
    if (!/^\d{1,7}$/.test(String(req.number))) throw new Error('bad PR number');
    vars = { repo: req.repo, number: String(req.number), url: `https://github.com/${req.repo}/pull/${req.number}` };
  } else if (req.kind === 'doc') {
    const p = String(req.path || ''), ref = String(req.ref || '');
    if (!p || p.split('/').includes('..') || !ref) throw new Error('bad document path');
    const path = encPath(p), r = enc(ref);
    vars = { repo: req.repo, path, ref: r, url: `https://github.com/${req.repo}/blob/${r}/${path}` };
  } else throw new Error('bad kind');
  let url = `claude://code/new?q=${encodeURIComponent(fill(templates[req.kind], vars))}`;
  if (folder) url += `&folder=${encodeURIComponent(folder)}`;
  return { url, folder: !!folder };
}
