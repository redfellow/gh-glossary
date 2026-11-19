# Design

## Registering the host

Chrome on Windows finds a native messaging host through a registry key whose default value is the
path of the host manifest:
`HKCU\Software\Google\Chrome\NativeMessagingHosts\io.github.redfellow.gh_glossary` (Edge:
`Software\Microsoft\Edge`, Brave: `Software\BraveSoftware\Brave-Browser`, Chromium:
`Software\Chromium`). The manifest's `path` may be a `.cmd` file, which Chrome starts through
`cmd.exe`. `install.ps1` writes `host\launcher.cmd` (records `node` and the folders of `node`, `gh`,
`git`, `claude`, as `install.sh` does) and `host\io.github.redfellow.gh_glossary.json` (UTF-8 without
a byte order mark), then sets the keys. Both files are not committed. Only the current user's hive is
written, so no administrator rights are needed. `install.cmd` runs the script with
`-ExecutionPolicy Bypass` so the reader does not have to change the machine's policy.

The launcher starts with `@echo off`: anything `cmd.exe` echoes would land on stdout, which is the
message channel.

## Starting programs

Node starts `.exe` files by name, but refuses `.cmd` and `.bat` files without a shell, and passing
the run's arguments (JSON settings, a JSON schema) through `cmd.exe` would need fragile escaping.
`resolveCommand` therefore looks the name up on `PATH` with the `.exe`, `.com`, `.cmd`, `.bat`
extensions; an `.exe` or `.com` is started directly; a `.cmd` or `.bat` is read and, when it is an npm
shim (`"%dp0%\node_modules\...\cli.js"` or `...\.exe`), the program it points at is started instead,
a script with the host's own `node`. Any other batch file is refused with a message that names the
native `claude` install. On macOS and Linux nothing changes: the name is handed to `spawn` as before.

## Guard hook command

Claude Code on Windows runs hook commands through Git Bash. The hook command uses double quotes and
forward slashes there (`"C:/Program Files/nodejs/node.exe" "C:/…/host/guard.mjs"`), which Git Bash
and `cmd.exe` read the same way. A path containing `"`, `$`,
`` ` `` or `%` is refused, so the command never depends on expansion. macOS and Linux keep single
quotes.

## Stopping runs

`ChildProcess.kill` on Windows ends only the process itself; `claude` may leave `bash` and `git`
behind. On Windows the host runs `taskkill /pid <pid> /T /F` instead.

## Folder names

`cache/data/<owner>/<repo>` and `cache/repos/<owner>/<repo>` use GitHub names directly. On Windows a
segment that is a reserved device name (`con`, `prn`, `aux`, `nul`, `com1`–`com9`, `lpt1`–`lpt9`,
with or without an extension) or ends in `.` or a space gets `_` appended. Other systems keep the
names as they are, so existing data stays where it is. Clones on Windows set `core.longpaths=true`.

## Guard paths

`inside` already uses `path.relative`, which on Windows compares case-insensitively and reports a
path on another drive as absolute (refused). Glob patterns are also checked for `..` between
backslashes. The guard's and host's "am I the main module" checks compare paths case-insensitively on
Windows.
