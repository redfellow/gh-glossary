# Tasks

## 1. Host

- [x] 1.1 Add `host/platform.mjs`: find commands on the Windows PATH, follow npm shims, refuse other batch files, quote the hook command for Git Bash, stop process trees with `taskkill`, make reserved folder names safe, compare paths case-insensitively; verify with `host/platform.test.mjs`
- [x] 1.2 Use it in `host/host.mjs` (spawn, timeout and quit, hook command, cache folders, long paths on clone, main-module check) and `host/guard.mjs` (main-module check, `..` between backslashes in Glob patterns); verify `npm test` passes and the host answers `/api/health` over native messaging

## 2. Install

- [x] 2.1 Add `host/install.ps1` and `host/install.cmd` (install, uninstall, status under HKCU for Chrome, Edge, Brave, Chromium); ignore the launcher and manifest; keep `.cmd` and `.ps1` in CRLF
- [ ] 2.2 On a Windows machine: run `host\install.cmd`, load the extension, run Quick on one allowed page with the native `claude` and once with the npm `claude`, then `status` and `uninstall`

## 3. Extension and docs

- [x] 3.1 Accept Windows absolute folders in options; name `host\install.cmd` in the panel and options messages; verify with a folder-parsing test
- [x] 3.2 Add Windows setup to `README.md`

## Workflow follow-up

- Archive the change after 2.2 passes.
