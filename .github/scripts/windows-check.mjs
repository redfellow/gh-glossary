// Checks the Windows install on a real Windows machine (run by CI after host\install.cmd):
// the registry points at a valid manifest, the launcher starts the host and it answers over native
// messaging, the guard hook command works in Git Bash, and claude starts through resolveCommand.
// Usage: node .github/scripts/windows-check.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { frame } from '../../host/native.mjs';
import { resolveCommand, hookCommand } from '../../host/platform.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NAME = 'io.github.redfellow.gh_glossary';
const step = (s) => console.log(`\n== ${s}`);

step('registry and manifest');
const reg = execFileSync('reg', ['query', `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NAME}`, '/ve'], { encoding: 'utf8' });
const manifestPath = reg.match(/REG_SZ\s+(.+)/)[1].trim();
console.log(manifestPath);
const raw = fs.readFileSync(manifestPath);
assert.notEqual(raw[0], 0xef, 'manifest has a byte order mark');
const manifest = JSON.parse(raw.toString('utf8'));
assert.equal(manifest.name, NAME);
assert.equal(manifest.type, 'stdio');
assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${fs.readFileSync(path.join(ROOT, 'extension', 'EXTENSION_ID'), 'utf8').trim()}/`]);
assert.ok(fs.existsSync(manifest.path), 'launcher missing');

step('host through the launcher, as Chrome starts it (cmd.exe /c)');
const replies = await new Promise((resolve, reject) => {
  const p = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', manifest.path, 'chrome-extension://test/', '--parent-window=0'], { windowsVerbatimArguments: false });
  let buf = Buffer.alloc(0); const got = [];
  const t = setTimeout(() => { p.kill(); reject(new Error(`no reply; stdout so far: ${JSON.stringify(buf.toString())}`)); }, 30_000);
  p.stderr.on('data', (d) => process.stderr.write(d));
  p.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32LE(0)) {
      const n = buf.readUInt32LE(0);
      got.push(JSON.parse(buf.subarray(4, 4 + n).toString('utf8'))); buf = buf.subarray(4 + n);
    }
    if (got.length === 2) { clearTimeout(t); p.stdin.end(); resolve(got); }
  });
  p.on('error', reject);
  p.stdin.write(frame({ id: 1, method: 'GET', path: '/api/health' }));
  p.stdin.write(frame({ id: 2, method: 'GET', path: '/api/dir', query: { path: ROOT } }));
});
console.log(JSON.stringify(replies));
assert.equal(replies.find((r) => r.id === 1).body.ok, true);
assert.equal(replies.find((r) => r.id === 2).body.ok, true);

step('guard hook command in Git Bash');
const bash = path.join(path.dirname(path.dirname(execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0])), 'bin', 'bash.exe');
console.log(bash);
const guard = path.join(ROOT, 'host', 'guard.mjs');
const runHook = (input) => execFileSync(bash, ['-c', hookCommand(process.execPath, guard)], {
  input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, GHG_ROOTS: JSON.stringify([ROOT]), GHG_REPO: 'redfellow/gh-glossary' },
});
const denied = runHook({ tool_name: 'Read', tool_input: { file_path: 'C:\\Windows\\win.ini' }, cwd: ROOT });
console.log(denied);
assert.match(denied, /"permissionDecision":"deny"/);
const allowed = runHook({ tool_name: 'Read', tool_input: { file_path: path.join(ROOT, 'README.md') }, cwd: ROOT });
assert.equal(allowed, '', 'a read inside the root was refused');
const otherDrive = runHook({ tool_name: 'Read', tool_input: { file_path: 'D:\\a\\README.md' }, cwd: ROOT });
assert.match(otherDrive, /"permissionDecision":"deny"/);

step('claude through resolveCommand');
const c = resolveCommand('claude', ['--version']);
console.log(c.file, c.args.join(' '));
const version = execFileSync(c.file, c.args, { encoding: 'utf8' });
console.log(version.trim());
assert.match(version, /\d+\.\d+\.\d+/);

console.log('\nall Windows checks passed');
