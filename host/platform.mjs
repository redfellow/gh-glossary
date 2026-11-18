// What differs between Windows and macOS/Linux for the host: finding and starting programs, quoting
// the guard hook command, stopping a run's process tree, and folder names Windows will not create.
// Every function takes the platform (and what else it reads) as arguments so the tests can run the
// Windows rules on any system.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WIN_EXTS = ['.exe', '.com', '.cmd', '.bat'];

// Finds cmd on PATH the way cmd.exe would, but only for the extensions we know how to start.
export function which(cmd, { env = process.env, exists = fs.existsSync } = {}) {
  const dirs = String(env.PATH ?? env.Path ?? '').split(';').map((d) => d.replace(/^"(.*)"$/, '$1')).filter(Boolean);
  const exts = path.win32.extname(cmd) ? [''] : WIN_EXTS;
  for (const d of dirs) {
    for (const e of exts) {
      const f = path.win32.join(d, cmd + e);
      if (exists(f)) return f;
    }
  }
  return null;
}

// npm's command shims end by starting "%dp0%\<path>" (or "%~dp0\<path>" in older npm). The last such
// quoted path is the program; an earlier one can be the optional bundled node.exe.
export function shimTarget(text, shimPath) {
  const re = /"%~?dp0%?\\([^"%]+?\.(?:js|cjs|mjs|exe))"/gi;
  let m, last = null;
  while ((m = re.exec(text))) last = m[1];
  return last ? path.win32.join(path.win32.dirname(shimPath), last) : null;
}

// How to start cmd with args: { file, args }. On macOS and Linux this is cmd itself. On Windows an
// .exe is started directly and an npm shim is replaced by what it starts; no argument ever goes
// through cmd.exe, so JSON and quotes in them need no escaping.
export function resolveCommand(cmd, args, { platform = process.platform, env = process.env, exists = fs.existsSync, read = (f) => fs.readFileSync(f, 'utf8'), node = process.execPath } = {}) {
  if (platform !== 'win32') return { file: cmd, args };
  const found = which(cmd, { env, exists });
  if (!found) throw Object.assign(new Error(`${cmd} not found on PATH`), { code: 'ENOENT' });
  const ext = path.win32.extname(found).toLowerCase();
  if (ext === '.exe' || ext === '.com') return { file: found, args };
  const target = shimTarget(read(found), found);
  if (target && exists(target)) {
    return /\.exe$/i.test(target) ? { file: target, args } : { file: node, args: [target, ...args] };
  }
  throw new Error(`${found} is a batch file gh-glossary cannot start safely. Install the native ${cmd} (for claude: https://claude.com/download or "irm https://claude.ai/install.ps1 | iex").`);
}

// The PreToolUse hook command line. Claude Code runs it in a shell: sh on macOS and Linux, Git Bash on
// Windows (which also reads double-quoted C:/ paths the way cmd.exe does).
export function hookCommand(nodePath, script, platform = process.platform) {
  if (platform !== 'win32') {
    const shq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    return `${shq(nodePath)} ${shq(script)}`;
  }
  const dq = (s) => {
    const p = String(s).replace(/\\/g, '/');
    if (/["$`%!]/.test(p)) throw new Error(`cannot quote ${s} for the hook command`);
    return `"${p}"`;
  };
  return `${dq(nodePath)} ${dq(script)}`;
}

// Stops a child and everything it started. On Windows kill() ends only the process itself.
export function stopTree(child, platform = process.platform) {
  if (platform === 'win32' && child.pid) {
    try { spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }).on('error', () => {}); return; } catch {}
  }
  try { child.kill('SIGTERM'); } catch {}
}

// A GitHub owner or repo name as a folder name. Windows refuses device names and drops a trailing dot
// or space, so those get "_" appended there; elsewhere the name is used as it is.
const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;
export function folderName(name, platform = process.platform) {
  return platform === 'win32' && (RESERVED.test(name) || /[. ]$/.test(name)) ? `${name}_` : name;
}

// Whether two paths name the same file, as far as the path text can tell (Windows ignores case).
export function samePath(a, b, platform = process.platform) {
  return platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

// A Claude Code permission rule for everything under an absolute folder: Read(//abs/path/**). Claude
// Code writes Windows paths in POSIX form, C:\Users\x as //c/Users/x.
export function readRule(dir, platform = process.platform) {
  let p = String(dir);
  if (platform === 'win32') p = p.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, d) => `/${d.toLowerCase()}`);
  if (!p.startsWith('/') || /[(),]/.test(p)) throw new Error(`cannot write a permission rule for ${dir}`);
  return `Read(/${p.replace(/\/+$/, '')}/**)`;
}

// Managed settings files, which the host's own --settings cannot override. MDM profiles, the Windows
// registry and server-managed settings are not files and are not read here.
export function managedSettingsFiles(platform = process.platform, { exists = fs.existsSync, list = (d) => fs.readdirSync(d) } = {}) {
  const dirs = platform === 'darwin' ? ['/Library/Application Support/ClaudeCode']
    : platform === 'win32' ? ['C:\\Program Files\\ClaudeCode', 'C:\\ProgramData\\ClaudeCode']
    : ['/etc/claude-code'];
  const j = platform === 'win32' ? path.win32.join : path.posix.join;
  const files = [];
  for (const d of dirs) {
    files.push(j(d, 'managed-settings.json'));
    const drop = j(d, 'managed-settings.d');
    try { if (exists(drop)) files.push(...list(drop).filter((f) => f.endsWith('.json')).sort().map((f) => j(drop, f))); } catch {}
  }
  return files;
}

// Why the guard hook would not run, or null. The host's --settings sets disableAllHooks: false, which
// wins over the reader's own settings; managed settings win over it, so a managed disableAllHooks or
// allowManagedHooksOnly (only managed hooks run) leaves a run without its guard.
export function hooksOffReason(files, read = (f) => fs.readFileSync(f, 'utf8')) {
  for (const f of files) {
    let s;
    try { s = JSON.parse(read(f)); } catch { continue; }
    if (s?.disableAllHooks === true) return `${f} sets disableAllHooks`;
    if (s?.allowManagedHooksOnly === true) return `${f} sets allowManagedHooksOnly`;
  }
  return null;
}
