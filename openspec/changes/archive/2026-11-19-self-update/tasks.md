# Tasks

## 1. Host

- [x] 1.1 Add `host/update.mjs`: `updateStatus` (off-main, dirty, unreachable, current, available with count, titles, local and to) and `applyUpdate` (reset `main` to the checked commit, report whether the installer changed)
- [x] 1.2 Add `GET` and `POST /api/update` to `host/host.mjs`; refuse an update while a run is queued or running
- [x] 1.3 Test against real repositories: behind, force-pushed, off main, detached, dirty, untracked files, stale commit, bad commit, changed installer, unreachable origin

## 2. Extension

- [x] 2.1 `extension/background.js`: check at most once a day when the popup opens or a Define starts from the context menu; badge, title and the action menu item; install from the popup or the menu only, with the commit that was checked; reload after an update
- [x] 2.2 `extension/popup.*`: the update line with commit titles and Update now, the note about local commits, the line after an update, and a refusal
- [x] 2.3 Test that no sender but the popup can check or install, and that the popup cannot name the commit

## 3. Docs and checks

- [x] 3.1 README: Updating notes on macOS, Windows and Linux
- [x] 3.2 Check in Chrome: badge, popup line, menu item, Update now reloads and the popup says it was updated
