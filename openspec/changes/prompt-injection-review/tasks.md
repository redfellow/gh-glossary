# Tasks

## 1. Guard: the command that runs is the command that was checked

- [x] 1.1 Refuse an unquoted word that starts with `=` in `splitArgs` (`host/guard.mjs`); verify with a guard test that `git diff =node =gh` is refused and `git log --format=%h` is still allowed
  - proof: `node --test host/guard.test.mjs`
- [x] 1.2 For an approved Bash call, print `updatedInput` with the command rebuilt from the checked words, each single-quoted, keeping the call's other input fields; verify with tests for a word containing `'`, an empty word, `^zzz`, `HEAD~3..HEAD^` and a quoted word with spaces
  - proof: `node --test host/guard.test.mjs`
- [x] 1.3 Check headless with the real guard and the host's flags: `git diff --stat =node =gh` is refused; `git log HEAD~1..HEAD` runs, as the rebuilt command; and `git grep ^zzz` in a checkout holding `-Osh x.sh` runs no script when the reader's zsh sets `extendedglob`. Record the three results in the pull request
  - proof: `node --test host/guard.test.mjs`
- [x] 1.4 Update the README Safety section and sync the "One plain command at a time" requirement into `openspec/specs/run-sandbox/spec.md` (the sender requirement is synced in 6.10); verify with `openspec validate --specs`
  - proof: `openspec validate --specs`

## 2. What a run is given

- [x] 2.1 Build the run's prompt in a pure function and write `target.json` (kind, number, path, ref, readme) to the run folder; verify with a test that a file page key holding instruction text and U+2028 yields a prompt without that text
  - proof: `node --test host/run.test.mjs`
- [x] 2.2 Say in the three skills' Inputs sections that the path and ref are in `target.json`; verify with a headless Quick run on a file page that the run reads it and defines the file's terms
  - proof: `node --test host/run.test.mjs`
- [x] 2.3 Remove HTML comments (inside code too: see design.md) and Unicode tag characters from every description, comment, review and reply before `page.json` is written; verify with tests for a comment in prose, in a fenced block, in an inline code span, an unterminated comment, tag characters, and a tag character inside `-->`
  - proof: `node --test host/run.test.mjs`
- [x] 2.4 Give a Thorough run an owner term in full only when its origin is the run's repository or the whole owner is allowed; verify with a store test for both cases
  - proof: `node --test host/store.test.mjs`
- [x] 2.5 Sync the `define-runs` "What a run is given", "The prompt holds only the host's text" and "Text the page hides is removed" requirements into the main spec; verify with `openspec validate --specs`
  - proof: `openspec validate --specs`

## 3. Data, not instructions

- [x] 3.1 Sync the "Text read during a run is data" requirement into `openspec/specs/term-definition/spec.md` and raise its spec version to 4; verify that a run's `system.md` holds the requirement and that a new term records `spec: 4`
  - proof: `grep -E "Text read during a run is data" openspec/specs/term-definition/spec.md`
  - proof: `node --test host/host.test.mjs`
- [x] 3.2 Add the optional `notes` string to the three schemas and tell each skill when to fill it; verify that `--json-schema` accepts a reply with and without it
  - proof: `node --test host/run.test.mjs`
- [x] 3.3 Cut `notes` to 500 characters and keep it in the page's record, or in the Select job's result; verify with a host test
  - proof: `node --test host/run.test.mjs`
- [x] 3.4 Show the note in the popup's status lines, escaped, and for a Select run in the tab's message; verify in Chrome with a run that returns a note
  - proof: `node --test extension/content.test.mjs`
  - Seen in Chrome for Testing 150 with a stand-in for claude that returned a note holding an `<img>` tag: the popup showed "The run reported: …" as text after a page run and after a Define, with no image element. Two real Quick runs on pages of this repository returned no note, so no real run's note was seen there; the probes of 3.5 show real runs returning one.
- [x] 3.5 Run the review's three probes again as fixtures (hidden HTML comment, "system message" comment, convention in the checkout's `CLAUDE.md`), headless with the host's flags; verify that no canary reaches the output and that `notes` names the text, and record the results in the pull request
  - proof: `node --test host/host.test.mjs`

## 4. Store and links

- [x] 4.1 Drop a correction whose `id` is over 100 characters or whose `reason` is over 300; verify with a store test, and that no stored correction reason (longest: 147) would be refused
  - proof: `node --test host/store.test.mjs`
- [x] 4.2 Save only the fields the spec names from a term; verify with a test that `selected: true` from a page run is not saved and that Regenerate removes the term
  - proof: `node --test host/store.test.mjs`
- [x] 4.3 Keep a `link` only on `github.com` under the repository's owner, when saving and when reading a glossary for a page; verify with store tests for the four scenarios and by counting the local cache (12 of 17 stored links kept)
  - proof: `node --test host/store.test.mjs`
- [x] 4.4 Apply the same rule in the definition box (`linkOf` in `extension/popover.js`), using the repository the box was told; verify by updating the link assertions in `extension/content.test.mjs`
  - proof: `node --test extension/content.test.mjs`
- [x] 4.5 Sync the `glossary-store` and `definition-popover` link and cap requirements into the main specs and update the README; verify with `openspec validate --specs`
  - proof: `openspec validate --specs`

## 5. Spend limits

- [x] 5.1 Default `modes.<operation>.maxBudgetUsd` to 2 for Quick and Select and 10 for Thorough, with the top-level `maxBudgetUsd` still overriding all; verify with a test of the arguments each operation is started with, and that a run stopped at the limit says so and saves nothing
  - proof: `node --test host/run.test.mjs`
  - proof: `node --test host/host.test.mjs`
- [x] 5.2 Document the defaults in the README's `config.json` table and sync the `define-runs` limits requirement; verify with `openspec validate --specs`
  - proof: `openspec validate --specs`

## 6. Outside pages

- [x] 6.1 Confirm the fields on real pages before coding: `authorAssociation` on comments and reviews in `gh pr view --json comments,reviews`, on a discussion and its comments through GraphQL, and `status` from `gh api repos/<repo>/compare/<sha>...<default>` for a commit on and off the default branch; record the shapes as test fixtures
  - proof: `node --test host/run.test.mjs`
- [x] 6.2 Work out whether a page is outside for pull requests, issues, discussions and file pages whose ref is neither a branch nor a tag, treating a failed lookup as outside; verify with tests over the recorded fixtures for the five "Which pages are outside" scenarios
  - proof: `node --test host/run.test.mjs`
- [x] 6.3 Mark every saved term with `outside: true` when its page was outside, from the host's fields only; verify with a store test, and that a run cannot set or clear the mark
  - proof: `node --test host/store.test.mjs`
- [x] 6.4 Keep the mode as `outside` in `config.json` (default `off`), return it from `GET /api/page`, and add a host request to set it; verify with host tests for the three values and a bad value
  - proof: `node --test host/host.test.mjs`
- [x] 6.5 Let only the popup send the set-mode message through the service worker; verify with a test that the content script and the options page are refused
  - proof: `node --test extension/background.test.mjs`
- [x] 6.6 Apply "Limit writes" in `storeTerms` and `applyCorrections` when the mode is not off; verify with store tests for the five scenarios
  - proof: `node --test host/store.test.mjs`
- [x] 6.7 In the outside pages mode, leave terms marked outside out of the glossary read for other pages and for runs on other pages; verify with store tests for the three "Outside terms stay on their page" scenarios
  - proof: `node --test host/store.test.mjs`
- [x] 6.8 In the outside pages mode, leave outsiders' comments, reviews and replies out of `page.json` and count them in the page's record; verify with tests over the recorded fixtures
  - proof: `node --test host/run.test.mjs`
- [x] 6.9 Add the mode picker and the left-out count to the popup, and the "From an outside contributor's page" line to the definition box; verify in Chrome in all three modes on a fork's pull request
  - proof: `node --test extension/content.test.mjs`
  - Seen in Chrome for Testing 150 on cli/cli#15069, with the popup page loaded in a background tab beside the page (the toolbar's own popup opens only in a focused window): the three modes are listed; choosing one reaches the host's `config.json`; after a real Quick in the outside pages mode the popup says "3 comments by outside contributors were not read."; the box says "From an outside contributor's page · spec v4" in the two limiting modes and "Not verified at source · spec v4" with the mode off; another page of the repository is given 0 of the 9 terms in the outside pages mode and all 9 in the other two.
- [x] 6.10 Write the README section on outside pages (what each mode does, that off is the default and what it leaves open, that Send to Claude is outside the guard) and sync the `outside-content`, `run-sandbox` sender and `definition-popover` provenance requirements; verify with `openspec validate --specs`
  - proof: `openspec validate --specs`

## 7. Integration

- [x] 7.1 Run `npm test` and `openspec validate --specs`; verify both pass
  - proof: `openspec validate --specs`
- [ ] 7.2 End to end in Chrome with the extension reloaded: Quick on a pull request, Define on a selection, a definition with a link, and a mode change; verify each behaves as its spec says
  - Seen in Chrome for Testing 150 against a copy of the host: Quick from the popup page on a fork's pull request (9 terms, underlined on the page), Define on a word selected by a double click (the menu's click was sent to the extension by script; the definition opened pinned, marked "You asked"), a definition offering "Open github.com/cli/cli/issues/15066", and the mode changes above.
  - Still to do by hand in your own Chrome: open the popup from the toolbar or the tab, and choose Define from the real context menu.

## Workflow follow-up

- Open the pull request once group 1 is in: it publishes the commands that pass the guard today.
- Archive the change after review.
