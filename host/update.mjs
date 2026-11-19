// Updating gh-glossary itself from its GitHub repository (openspec/specs/self-update).
// Only a clean checkout of main is updated: on another branch, or with changes to tracked files, the
// reader is working on gh-glossary and nothing is offered. An update makes main the same as
// origin/main (a reset, so a force-pushed main updates too). Commits made on main and never pushed
// are replaced, and stay in git's reflog. Nothing here runs Claude.
//
// git is (args) => Promise<stdout>, run in the gh-glossary folder.

export const BRANCH = 'main';
const REMOTE_REF = `refs/remotes/origin/${BRANCH}`;
// The installer writes the launcher: a change to these means install.sh (install.cmd) should run again.
const INSTALL_FILES = /^host\/install\.(sh|cmd|ps1)$/;
const SHA = /^[0-9a-f]{40,64}$/;

// Why main cannot be updated now, or null: not on main, or tracked files changed.
async function blocked(git) {
  const branch = (await git(['symbolic-ref', '--short', '-q', 'HEAD']).catch(() => '')).trim();
  if (branch !== BRANCH) return { state: 'off-main', branch: branch || null };
  const dirty = (await git(['status', '--porcelain', '--untracked-files=no'])).trim();
  if (dirty) return { state: 'dirty' };
  return null;
}

// Fetches origin's main and compares. States: off-main, dirty, unreachable, current, available.
// available carries the commits to come ({ count, titles }), how many commits main has that origin
// does not (local), and the commit an update moves to (to).
export async function updateStatus(git) {
  const no = await blocked(git);
  if (no) return no;
  try { await git(['fetch', '-q', 'origin', `+refs/heads/${BRANCH}:${REMOTE_REF}`]); }
  catch (e) { return { state: 'unreachable', error: String(e.message).slice(0, 300) }; }
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  const to = (await git(['rev-parse', REMOTE_REF])).trim();
  if (head === to) return { state: 'current', head };
  const count = Number((await git(['rev-list', '--count', `HEAD..${to}`])).trim()) || 0;
  const local = Number((await git(['rev-list', '--count', `${to}..HEAD`])).trim()) || 0;
  const titles = (await git(['log', '--format=%s', '-n', '10', `HEAD..${to}`])).split('\n').map((s) => s.trim()).filter(Boolean);
  return { state: 'available', head, to, count, local, titles };
}

// Moves main to the commit the reader was shown (to). Refuses if main cannot be updated now, or if
// origin's main is no longer that commit. Returns { updated, from, to, reinstall }.
export async function applyUpdate(git, to) {
  if (typeof to !== 'string' || !SHA.test(to)) return { code: 400, body: { error: 'bad commit' } };
  const no = await blocked(git);
  if (no) return { code: 409, body: { ...no, error: no.state === 'dirty' ? 'The gh-glossary folder has uncommitted changes, so it was not updated.' : `The gh-glossary folder is on ${no.branch || 'no branch'}, not ${BRANCH}, so it was not updated.` } };
  const now = (await git(['rev-parse', REMOTE_REF])).trim();
  if (now !== to) return { code: 409, body: { error: 'The update changed since it was checked: check again.', stale: true } };
  const from = (await git(['rev-parse', 'HEAD'])).trim();
  if (from === to) return { code: 200, body: { updated: false, from, to, reinstall: false } };
  const changed = (await git(['diff', '--name-only', from, to])).split('\n').map((s) => s.trim());
  await git(['reset', '-q', '--hard', to]);
  return { code: 200, body: { updated: true, from, to, reinstall: changed.some((f) => INSTALL_FILES.test(f)) } };
}
