# Tasks

## 1. Host

- [x] 1.1 Add `host/platform.mjs`: find commands on the Windows PATH, follow npm shims, refuse other batch files, quote the hook command for Git Bash, stop process trees with `taskkill`, make reserved folder names safe, compare paths case-insensitively; verify with `host/platform.test.mjs`
- [x] 1.2 Use it in `host/host.mjs` (spawn, timeout and quit, hook command, cache folders, long paths on clone, main-module check) and `host/guard.mjs` (main-module check, `..` between backslashes in Glob patterns); verify `npm test` passes and the host answers `/api/health` over native messaging

## 2. Install

- [x] 2.1 Add `host/install.ps1` and `host/install.cmd` (install, uninstall, status under HKCU for Chrome, Edge, Brave, Chromium); ignore the launcher and manifest; keep `.cmd` and `.ps1` in CRLF
- [x] 2.2 On Windows (CI `windows-install` job, `.github/scripts/windows-check.mjs`): `host\install.cmd` registers for Chrome and Edge with a BOM-free manifest; the host answers `/api/health` and `/api/dir` through `launcher.cmd` started by `cmd.exe`; the guard hook allows a read in the root and refuses `C:\Windows\win.ini` and another drive under Git Bash; `claude --version` starts through `resolveCommand` for the npm install (shim followed to `bin\claude.exe`) and the native install; `status` lists, `uninstall` removes; `npm test` passes on Windows, macOS and Linux
- [ ] 2.3 On a Windows desktop with a signed-in `claude`: load the extension and run Quick on one allowed page

## 3. Extension and docs

- [x] 3.1 Accept Windows absolute folders in options; name `host\install.cmd` in the panel and options messages; verify with a folder-parsing test
- [x] 3.2 Add Windows setup to `README.md`

## Workflow follow-up

- Archive the change after 2.3 passes.
