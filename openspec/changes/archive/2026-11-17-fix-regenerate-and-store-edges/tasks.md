# Tasks

## 1. Storage module

- [x] 1.1 Move `storeTerms`, `applyCorrections`, the page-term removal and `checkPattern` from `host/host.mjs` to `host/store.mjs`, taking glossary file paths as arguments, with no behaviour change; verify `npm test` passes and a Quick run on one page stores terms as before
- [x] 1.2 Add `host/store.test.mjs` covering today's rules against a temporary folder (same-layer replace, pattern drop for invalid regex, capturing group and empty match, correction in the repo layer before the owner layer, unknown correction id ignored); verify the new tests pass

## 2. Owner-layer save removes the repository copy

- [x] 2.1 Make saving an `org` term remove a term with that id from the run's repository glossary, and leave owner terms alone when a `repo` term is saved; verify with tests for the four scenarios of "Reusing an id replaces the term in its layer"

## 3. Regenerate replaces on success

- [x] 3.1 Hand a regenerating run the glossary without the page's own terms, keeping terms marked as selected, and delete nothing before the run; verify by test that the glossary given to the run omits the page's unselected terms and includes its selected ones
- [x] 3.2 On a successful regenerating run, remove the page's unselected terms and save the run's terms in one step; on failure change nothing; verify by tests for the success, failure and selected-term scenarios of "Regenerate", with the run replaced by a stub
- [x] 3.3 Change the Regenerate box's hint in `extension/content.js` and the Regenerate bullet in `README.md` to say the page's terms are replaced when the run succeeds and that selected terms are kept; verify `npm test` passes and the README text matches the spec

## 4. Select job key

- [x] 4.1 Key Select runs on a hash of the whole selected text and add a test that two texts sharing their first 30 bytes get different keys and identical texts get the same key; verify the test passes

## 5. Integration

- [x] 5.1 On one allowed page: regenerate with the model set to a name that does not exist (`GHG_MODEL`) and confirm the page's terms are unchanged; then regenerate normally and confirm they are replaced and a selected term on the page is kept

## Workflow follow-up

- Archive the change after 5.1 passes.
