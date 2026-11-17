# Proposal

## Why

gh-glossary runs only on macOS and Linux. The extension itself works in any Chromium browser, but the
native host cannot be registered on Windows, and several parts of the host assume a POSIX system.
Windows readers who use Claude Code get nothing.

## What Changes

- A Windows install script (`host/install.ps1`, started by `host/install.cmd`) registers the host for
  Chrome, Edge, Brave and Chromium under the current user's registry, shows where it is registered,
  and removes it, like `host/install.sh` does on macOS and Linux.
- The host starts `claude`, `gh` and `git` on Windows: an `.exe` is started directly, and an npm
  `.cmd` shim is followed to the program it starts, so no command line goes through `cmd.exe`.
- The guard hook command is quoted so it works in the shell Claude Code uses on Windows.
- A run's subprocesses are stopped as a tree on Windows when a run times out or the host quits.
- Folder names under `cache/` that Windows reserves (`con`, `nul`, names ending in a dot) are made
  safe, and repository copies allow long paths.
- Send to Claude folders accept Windows absolute paths (`C:\code\repo`, `\\server\share\repo`).
- Messages that name the install script name both scripts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `run-sandbox`: "Only the extension reaches the host" names both install scripts and the systems
  they cover.
- `glossary-panel`: "Host not reachable" names both install scripts.
- `send-to-claude`: "Options" accepts Windows absolute folders.

## Impact

- New `host/platform.mjs` (command resolution, hook quoting, process-tree stop, safe folder names)
  with tests; `host/host.mjs` and `host/guard.mjs` use it.
- New `host/install.ps1`, `host/install.cmd`; `.gitignore` gains the Windows launcher and manifest.
- `extension/options-parse.js`, `extension/options.js`, `extension/content.js`, `extension/options.html`.
- `README.md`: Windows setup.
- Stored data: no change on macOS and Linux. On Windows there is no earlier data.
- Not tested on a Windows machine in this change: the install script and a real run need one.
