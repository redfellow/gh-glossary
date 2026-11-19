# Proposal

## Why

Readers saw the extension as "gh-glossary", which reads like a repository name rather than a product.
The README also carried a lot of internal detail that readers do not need to set up and use the
extension, and did not say plainly what keeps it safe.

## What Changes

- The extension is called GitHub Glossary everywhere a reader sees it: the extension list and toolbar
  button, the popup, the tab, the context menus (Define and the update item), the options page and messages. The repository, folder
  and install commands keep gh-glossary.
- The tab is kept inside the window using its real height, since the longer name makes it taller.
- The README is rewritten for readers, with a Security section that lists the safeguards.

### New Capabilities

None.

### Modified Capabilities

- `glossary-panel`: The name readers see (added), The tab, Moving the tab.
- `define-runs`: Define a selection.
- `self-update`: Checked only when the reader uses the extension (the icon menu's update item).

## Impact

- `extension/manifest.json`, `extension/popup.js`, `extension/popup.html`, `extension/content.js`,
  `extension/background.js`, `extension/options.html`, `extension/popover.html`, `host/host.mjs`,
  `host/platform.mjs`, `host/update.mjs`, `host/install.sh`, `host/install.ps1`, `extension/content.test.mjs`,
  `README.md`.
- The screenshots in `assets/screenshots/` still show the old name.
