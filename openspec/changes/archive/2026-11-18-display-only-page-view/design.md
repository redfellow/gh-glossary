# Design

## Principle

The github.com page is untrusted, like the content a run reads. Anything that decides, starts or
allows something, and anything that shows text a run wrote, lives in an extension page (toolbar
popup, definition frame, options). The content script keeps only what has to touch the
page: finding term occurrences, drawing underlines, the tab, and saying which term the pointer is on.

## Verified: CSS Custom Highlight API from a content script

Tested in Chrome for Testing (Playwright build 1243, `--headless=new`, unpacked test extension, page on
127.0.0.1, events sent through the DevTools protocol as trusted input):

| Check | Result |
|---|---|
| Content script (isolated world) creates `Range`s and `CSS.highlights.set(name, new Highlight(...))` | Works |
| Styled through `document.adoptedStyleSheets` from the content script | Renders (screenshot: term drawn with the `::highlight` colours); no `<style>` element added |
| Trusted click mapped to a term with `document.caretPositionFromPoint` against the script's own ranges | Hit on the term, miss beside it |
| Page script reads `CSS.highlights` | **Sees it**: `size`, the name, and every range with its text (`["relay"]`) |
| Page script calls `CSS.highlights.delete(name)` | **Succeeds**: underlines disappear |
| Page script reads the extension iframe (`contentDocument`) | `null`: cross-origin, unreadable |
| Page script sees `document.adoptedStyleSheets` | Sees one sheet (its `::highlight` rule) |

The highlight registry belongs to the document, not to the world, so it is shared with page scripts.
Consequences, accepted in this design:

- A page script can learn **which words on the page are glossary terms**, not their definitions. On
  github.com the page's own scripts are GitHub's, which already have the page text; the exposure is
  the reader's choice of terms. Ranges carry no ids, so the names used are opaque (one highlight per
  kind, e.g. `ghl-a`, `ghl-b`).
- A page script can **remove or add underlines**. That only affects what the reader sees on that page;
  no run, allow or stored data follows from it.
- Hit-testing never consults the registry: the content script keeps its own list of ranges and term
  ids and checks the caret position against it, so a page that adds fake highlights cannot make the
  extension open a definition for a range it did not create.

Not tested: behaviour on github.com itself (its CSP does not apply to content scripts or
`adoptedStyleSheets` constructed in the isolated world, but this should be confirmed on the real site
in task 1.1), and Firefox (not a target).

## The tab and the toolbar popup

The tab is drawn by the content script inside a closed shadow root, so page scripts cannot read its
text or restyle its inside. It keeps today's look, edge, drag along the edge and switch of sides. A
click without a drag is forwarded to the background only when `isTrusted`; the background calls
`chrome.action.openPopup()`.

Tested in Chrome for Testing 153 (headless, unpacked test extension, clicks sent as trusted input
through the DevTools protocol):

| From the content script's click handler, via a message to the background | Real click | Page script `.click()` |
|---|---|---|
| `chrome.action.openPopup()` | Opens the popup | Also opens it |
| `chrome.sidePanel.open()` | Opens the side panel | Refused: needs a user gesture |

`openPopup()` does not require a gesture, so the content script's `isTrusted` check is what keeps a
page script from opening the popup. Opening the popup is not consent to anything: the reader still
has to click Quick, Thorough or allow inside extension pages.

The popup routes the active tab's URL with the same routing code as the content script
(`extension/shared.js`) and asks the tab's content script for the page's canonical owner/repo
spelling (from GitHub's meta tag, accepted only when it equals the address ignoring case). It reads
the page's data from the host, shows the status lines, and asks the background to start runs. The
background starts the run and then tells the tab to reload its data, so the run goes ahead even if the
popup closes.

## Asking to allow, in the popup

`harden-guard-and-store` asked in a separate extension window. Now that the controls are in the
popup, which no page script can reach, the question is asked there instead: a new window opened
wherever the browser placed it, often far from the page. When the host refuses a run because the
repository is not allowed, the background keeps the run waiting as one question
(`{ id, repo, what, tab, address, request }`) and the popup shows it in place of Quick and Thorough,
with Cancel focused so Enter cancels. An allow adds to the allowlist and sends the waiting request,
if the tab still shows the same address. Cancel, Escape, or closing the popup drops the question (the
popup holds a port; its disconnect cancels a question it showed), and a newer question replaces an
older one. For a Define from the context menu the background opens the popup with
`chrome.action.openPopup()`; if Chrome cannot open it, the tab's tooltip says to click the tab, and
the popup shows the waiting question when it opens.

## Definition frame

The content script inserts one `<iframe src="chrome-extension://…/popover.html#<nonce>">`
(web-accessible to `https://github.com/*` only) in the same closed shadow root as the tab, and
positions it at the term. Page scripts can see that an iframe exists but cannot read its document
(tested: `contentDocument` is `null`).

Messages: the content script sends `pop-glossary` (the page's terms, repository, colour scheme) when
the glossary changes and `pop-show` (term id, pinned) on hover or click, with `chrome.runtime`
messaging, which page scripts cannot send or read; the frame ignores messages without its nonce. The
frame reports its height, pinning, Back and close through the background, which relays them to the
frame's own tab with `chrome.tabs.sendMessage`. The frame renders the box, provenance, linked terms,
Back and the trail exactly as the in-page popover did.

## Define a selection

A `chrome.contextMenus` item for `selection` on `https://github.com/*`: "Define “%s” with
gh-glossary". On click the background asks the tab's content script for the selection's text and
surrounding context. If the text is already a term, the content script opens it; otherwise the
background checks the length, asks to allow if needed, starts the Select run and hands the job key to
the content script, which tracks it (tab dot) and opens the new definition when it is done. A page
script cannot trigger the menu item.

## Host routes per sender

| Sender | May ask the host |
|---|---|
| Content script | `GET /api/page`, `GET /api/job` |
| Definition frame | nothing (gets terms from the content script) |
| Toolbar popup | `GET /api/page`, `GET /api/job`; starts runs through the background |
| Background itself | `POST /api/define`, `POST /api/select`, `POST /api/allow` (for an answer in the popup) |
| Options page | unchanged |

## Risks

- Hover feel: the frame is created once and reused, and the term data is already in it, so showing a
  definition costs one message and a resize.
- The frame and the tab follow GitHub's light or dark theme by a flag the content script reads from
  the page's computed background, not from Primer variables, since the frame cannot see them.
- A page script can open the popup only by getting the reader to click the tab; it cannot click inside
  the popup.
