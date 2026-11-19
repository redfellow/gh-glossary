# Proposal

## Why

gh-glossary is installed as a git checkout, and updating it means running `git pull` in that folder
and then reloading the extension in `chrome://extensions`. Readers forget, and a checkout that is
behind keeps running old host code (in November 2026 a fix to the slow-pattern probe sat unpulled).

## What changes

- The host learns `GET /api/update` (fetch `origin/main`, compare with the checkout) and
  `POST /api/update { to }` (reset `main` to that commit). Both run git directly; Claude is not
  involved, so nothing an update reads can steer it.
- An update is offered only on a clean checkout of `main` (no changes to tracked files) that differs
  from `origin/main`. On any other branch nothing is checked or shown, so a checkout someone is
  developing in is left alone. Making `main` equal to `origin/main` with a reset means a force-pushed
  `main` updates too; commits made on `main` and never pushed are replaced and stay in git's reflog,
  and the popup says so before the click.
- The check runs only when the reader uses the extension (the popup opens, or a Define from the
  context menu), at most once a day. Nothing polls in the background.
- When an update is ready the toolbar icon gets a badge, the popup a line with the commit titles and
  **Update now**, and the icon's right-click menu **Update gh-glossary now**. Only the popup and that
  menu can install it; a page, the content script or the definition frame cannot.
- After the update the extension reloads itself, which restarts the host on the new code. The popup
  then says it was updated, and says to run the installer again if it changed.
- An update is refused while a run is queued or running, and if `origin/main` moved after the check.

## Impact

- New `host/update.mjs` and its tests; routes in `host/host.mjs`.
- `extension/background.js`: the check, badge, menu item and reload. `extension/popup.*`: the line.
- New capability spec `self-update`; README's Updating notes.
