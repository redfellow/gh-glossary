import { test } from 'node:test';
import assert from 'node:assert/strict';
import { which, shimTarget, resolveCommand, hookCommand, folderName, samePath } from './platform.mjs';

// A fake Windows disk: the files that exist and what the batch files say.
const files = {
  'C:\\Program Files\\GitHub CLI\\gh.exe': '',
  'C:\\Program Files\\Git\\cmd\\git.exe': '',
  'C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd': `@ECHO off
GOTO start
:find_dp0
SET dp0=%~dp0
EXIT /b
:start
SETLOCAL
CALL :find_dp0

IF EXIST "%dp0%\\node.exe" (
  SET "_prog=%dp0%\\node.exe"
) ELSE (
  SET "_prog=node"
  SET PATHEXT=%PATHEXT:;.JS;=;%
)

endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@anthropic-ai\\claude-code\\cli.js" %*
`,
  'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js': '',
  'C:\\tools\\other.bat': '@echo off\r\npython other.py %*\r\n',
};
const win = {
  platform: 'win32',
  env: { PATH: 'C:\\Program Files\\GitHub CLI;"C:\\Program Files\\Git\\cmd";C:\\Users\\me\\AppData\\Roaming\\npm;C:\\tools' },
  exists: (f) => Object.hasOwn(files, f),
  read: (f) => files[f],
  node: 'C:\\Program Files\\nodejs\\node.exe',
};

test('macOS and Linux start the command by name', () => {
  assert.deepEqual(resolveCommand('claude', ['-p'], { platform: 'darwin' }), { file: 'claude', args: ['-p'] });
  assert.deepEqual(resolveCommand('gh', ['api'], { platform: 'linux' }), { file: 'gh', args: ['api'] });
});

test('Windows finds .exe on PATH, including quoted PATH entries', () => {
  assert.equal(which('gh', win), 'C:\\Program Files\\GitHub CLI\\gh.exe');
  assert.deepEqual(resolveCommand('git', ['log'], win), { file: 'C:\\Program Files\\Git\\cmd\\git.exe', args: ['log'] });
});

test('Windows follows the npm shim to cli.js and starts it with node', () => {
  const settings = JSON.stringify({ hooks: { PreToolUse: [{ matcher: '*' }] } });
  const r = resolveCommand('claude', ['--settings', settings], win);
  assert.equal(r.file, win.node);
  assert.deepEqual(r.args, ['C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js', '--settings', settings]);
});

test('Windows starts a shim that points at an .exe directly', () => {
  const shim = 'C:\\npm\\claude.cmd', exe = 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe';
  const opts = { ...win, env: { PATH: 'C:\\npm' }, exists: (f) => f === shim || f === exe, read: () => '@ECHO off\r\n"%~dp0\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n' };
  assert.deepEqual(resolveCommand('claude', ['-p'], opts), { file: exe, args: ['-p'] });
});

test('shimTarget takes the last quoted path, not the bundled node.exe', () => {
  assert.equal(shimTarget(files['C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd'], 'C:\\npm\\claude.cmd'), 'C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js');
  assert.equal(shimTarget('@echo off\r\npython x.py %*', 'C:\\x.bat'), null);
});

test('Windows refuses other batch files and missing commands', () => {
  assert.throws(() => resolveCommand('other', [], win), /batch file .* cannot start safely/);
  assert.throws(() => resolveCommand('nope', [], win), { code: 'ENOENT' });
});

test('hook command quoting', () => {
  assert.equal(hookCommand('/usr/local/bin/node', "/Users/o'hara/gh-glossary/host/guard.mjs", 'darwin'), `'/usr/local/bin/node' '/Users/o'\\''hara/gh-glossary/host/guard.mjs'`);
  assert.equal(hookCommand('C:\\Program Files\\nodejs\\node.exe', 'C:\\Users\\me\\gh-glossary\\host\\guard.mjs', 'win32'), '"C:/Program Files/nodejs/node.exe" "C:/Users/me/gh-glossary/host/guard.mjs"');
  for (const bad of ['C:\\a"b\\guard.mjs', 'C:\\%TEMP%\\guard.mjs', 'C:\\$x\\guard.mjs']) assert.throws(() => hookCommand('C:\\node.exe', bad, 'win32'));
});

test('folder names Windows would refuse get "_" there only', () => {
  for (const n of ['con', 'NUL', 'aux.js', 'com1', 'lpt9', 'repo.', 'repo ']) assert.equal(folderName(n, 'win32'), `${n}_`);
  for (const n of ['console', 'widgets', 'a.b', 'nul-x']) assert.equal(folderName(n, 'win32'), n);
  assert.equal(folderName('con', 'darwin'), 'con');
});

test('samePath ignores case on Windows only', () => {
  assert.ok(samePath('c:\\x\\host.mjs', 'C:\\X\\host.mjs', 'win32'));
  assert.ok(!samePath('/x/host.mjs', '/X/host.mjs', 'linux'));
});
