# Proposal

## Why

Two security reviews found that most extension findings share one cause: the extension does trusted
work inside github.com's page, where GitHub's scripts and other extensions can see, click and restyle
it. `harden-guard-and-store` closed the worst of it (the allow question moved to an extension window,
`isTrusted` checks on the panel's buttons, tighter pattern checks), but the panel's buttons, the
Define button and every definition are still page DOM:

- Each run control is safe only while its handler remembers to check `isTrusted`.
- Definitions, provenance and links are drawn into the page, so any page script can read a private
  repository's definitions, and their safety rests on escaping alone.

## What Changes

- **The page shows underlines, the tab and the definition frame, and nothing on it starts a run.**
- **The tab stays.** It keeps its look, its edge and its drag behaviour, and shows the term count and
  run state. Clicking it opens the extension's toolbar popup. It no longer pops out into a panel in the
  page.
- **Controls move to the toolbar popup**: Definitions switch, Quick, Thorough, Regenerate, status lines
  and Send to Claude. The popup is an extension page; the toolbar icon opens it too.
- **Definitions open in an extension frame.** The hover and pinned box is an iframe of an extension
  page placed next to the term, inside a closed shadow root. Page scripts cannot read or click into it.
- **Define a selection is a context-menu item** ("Define “…” with gh-glossary").
- **The allow question moves into the popup.** The separate allow window opened wherever the browser
  put it, often far from the page; the popup is already an extension page no page script can reach.
- **The content script may only read** a page's glossary and a job's state from the host. Define,
  Select and Send to Claude are started by the background on behalf of the popup and the context menu.

## Capabilities

### Modified Capabilities

- `glossary-panel`: the tab opens the popup; the in-page panel, its pop-out and its sizing go away.
- `definition-popover`: the box is an extension frame.
- `term-highlighting`: what the page shows and what a page script can learn from it.
- `run-consent`: the allow question is in the popup; runs start only from the popup and the context menu.
- `define-runs`: Define a selection from the context menu; where a Select run's progress shows.
- `page-routing`: the popup takes the page from the tab's address.
- `send-to-claude`: offered in the popup.

## Impact

- `extension/content.js` keeps routing, matching, underlining, the tab and the frame's position; the
  panel, popover markup and Define button leave it.
- New `extension/popup.html|js`, `extension/popover.html|js`, `extension/shared.js` (routing and
  term matching, loaded by the content script and by extension pages); `manifest.json` gains
  `action.default_popup`, `contextMenus`, `host_permissions` for `https://github.com/*` (so the popup and
  the service worker can read the tab's address; no new install warning, the content script already
  runs there), the popover page as a web-accessible resource, and a minimum of Chrome 127
  (`chrome.action.openPopup`).
- `extension/background.js`: starts define and select runs itself (the popup asks to allow first
  when needed), opens the popup, relays the frame's events, and narrows the content script's routes.
- `extension/allow.html` and `extension/allow.js` are removed.
- Builds on `harden-guard-and-store` (consent, `isTrusted` checks, pattern checks) and is
  written against the specs as they will be after it is archived.
- Not in this change: matching by literal forms instead of patterns. The pattern checks in
  `harden-guard-and-store` cover slow and empty-matching patterns; forms can follow as their own
  change if those checks prove too loose.
