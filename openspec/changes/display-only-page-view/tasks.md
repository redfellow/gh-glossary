# Tasks

## 1. Shared code and the content script

- [x] 1.1 Move routing and term matching into `extension/shared.js` (a classic script that sets `globalThis.ghl`), loaded before `content.js` and by the extension pages; keep the route and matching tests passing against it
- [x] 1.2 Strip `extension/content.js` to routing, matching, underlines (constructed style sheet), hit-testing against its own ranges, the tab and the frame's position; remove the in-page panel, its pop-out, the popover markup and the Define button; draw the tab and the frame in a closed shadow root

## 2. Definition frame

- [x] 2.1 Add `extension/popover.html|js` (web-accessible to github.com only): box, provenance, linked terms, Back, trail and the safe link, from terms the content script sends; report height, pin and close through the background

## 3. Popup and context menu

- [x] 3.1 Add `extension/popup.html|js`: repository and page, Definitions switch, Quick, Thorough, Regenerate, status lines and Send to Claude, from the active tab's URL
- [x] 3.2 In `extension/background.js`: open the popup for a trusted tab click; start define and select runs and tell the tab to reload; add the context-menu item; relay frame events to their tab; narrow the content script's routes to `GET /api/page` and `GET /api/job`
- [x] 3.3 Update the extension tests for the new files and routes; `npm test` passes

- [x] 3.4 Ask to allow inside the popup instead of a separate window: the background keeps the waiting run, the popup shows the question with Cancel focused, an allow starts the run, closing the popup cancels; Define from the context menu opens the popup with the question; remove `allow.html` and `allow.js`

## 4. Check in Chrome

- [x] 4.1 Headless Chrome for Testing 153 with the unpacked extension and the real host on `redfellow/gh-glossary`'s home page: 93 underlines drawn; the page finds no extension controls, no `<style>`, no shadow root and no extension iframe; hover opens the frame with the definition, a click pins it with a close button; a page-script click on the tab opens nothing and a real click opens the popup with the page's data
- [ ] 4.2 By hand in Chrome on one allowed repo: hover and pin a definition, follow a linked term, click the tab and run Quick from the popup, allow a new repo, define a selection from the context menu (2026-11-18: hover and pin checked on PR #5; the rest needs the toolbar popup and context menu, which browser automation cannot see)
  - Done in Chrome 157: definitions open on hover and pin; the tab opens the popup with the page's data. After the first try the box gets up to three quarters of the page's height, shows its scrollbar only on hover, and stays hidden until it has drawn the new term.
  - Done in Chrome 157: Quick from the popup on a repository not allowed asks in the popup, and the run starts after Allow.
  - Still to try: follow a linked term, define a selection from the context menu (and allow from it).

## 5. Docs

- [x] 5.1 Update README (Architecture, Safety) for the tab, the popup and the frame
- [ ] 5.2 Replace `assets/screenshots/panel-pr.png` (the old in-page panel) with a screenshot of the toolbar popup

## Workflow follow-up

- Archive `harden-guard-and-store` first; then this change.
