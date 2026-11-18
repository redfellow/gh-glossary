# Proposal

## Why

A tab defined one selection at a time and refused another while it ran, and nothing on the page
showed which words were being defined. Defining a second selection that the first run's new pattern
already matched opened the first term's definition, which looked like the wrong box.

## What Changes

- Several Defines may be asked for in a row; each starts a run and the host runs them one at a time.
- Words waiting for or being defined are marked with a steady highlight until their run ends.
- When runs finish, only the Define asked for last opens pinned; the others are underlined.
- The tab's tooltip and the popup list every Define in progress.
- A Define that starts nothing (repository not allowed, bad selection) says why in a message beside
  the tab, not only in its tooltip.

### Modified Capabilities

- `define-runs`: Define a selection, Select result.

## Impact

- `extension/content.js`, `extension/popup.js`, `extension/background.js`, `README.md` and their tests.
