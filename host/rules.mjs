// Pure checks shared by the host and its tests (no side effects on import).
import { createHash } from 'node:crypto';

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const NAME_RE = /^[A-Za-z0-9_.-]{1,100}$/;
export const validRepo = (r) => {
  if (typeof r !== 'string') return false;
  const [o, n, ...more] = r.split('/');
  return !more.length && OWNER_RE.test(o || '') && NAME_RE.test(n || '') && n !== '.' && n !== '..';
};
export const validPage = (p) => typeof p === 'string' && (/^(?:pr|issue|discussion)-\d{1,7}$/.test(p) || p === 'readme' || (/^file:[^\0-\x1f\x7f]{1,500}$/.test(p) && !p.slice(5).split('/').some((x) => x === '..' || x === '.')));
export const validRef = (r) => typeof r === 'string' && r.length < 250 && !/[\0\s~^:?*\[\\]|\.\./.test(r) && !r.startsWith('-');
export const lc = (s) => String(s).toLowerCase();
export const isAllowed = (allow, repo) => allow.repos.some((r) => lc(r) === lc(repo)) || allow.owners.some((o) => lc(o) === lc(repo.split('/')[0]));

// A Select run is identified by its page and the whole selected text.
export const selectKey = (repo, page, text) => `${repo}#${page}#select#${createHash('sha256').update(String(text)).digest('hex').slice(0, 16)}`;
