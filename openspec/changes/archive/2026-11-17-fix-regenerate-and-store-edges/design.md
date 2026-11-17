# Design

## Context

See proposal.md for motivation. Today the host handles Regenerate by deleting every term whose
origin is the page, then starting the run. The run is given the remaining glossary, so it defines
the page's terms afresh. Storing, deleting and correcting terms live in `host/host.mjs` next to code
that starts processes, and have no tests.

## Goals / Non-Goals

**Goals:**

- A failed Regenerate changes nothing on disk.
- The run still sees the page as if its own terms were not defined, so it redefines them.
- Storage rules that can be tested without starting a run.

**Non-Goals:**

- Cleaning up stale repository copies already on disk.
- Undo for a Regenerate that succeeded with worse definitions.
- Changing how corrections pick a layer.

## Decisions

### Hide the page's terms from the run, delete them only on success

A regenerating run is handed the glossary without the terms it will replace. Nothing is deleted
until the run returns a result; then the old terms are removed and the new ones saved in one step.

- Alternative: delete first and restore on failure. Rejected: the host can stop mid-run (browser
  quits), which would skip the restore.

### "The terms it will replace" excludes selected terms

Terms marked as asked for by the reader stay in the glossary handed to the run and are not deleted.
The run does not define them again, because already-defined terms are not added.

- Alternative: delete them and rely on the run to redefine them. Rejected: Quick does not define
  never-defined vocabulary, which is exactly what readers select.

### Saving to the owner layer removes the id from this repository only

When a run saves an `org` term, a term with that id in the run's own repository glossary is removed.
Other repositories' glossaries are not touched: a different repository may hold that id on purpose as
its own meaning, which the store's "repository's meaning wins" rule exists for. Saving a `repo` term
leaves an owner-layer term with the same id alone for the same reason.

### Select job key uses a hash of the whole text

The key becomes repository, page and the SHA-256 of the selected text, shortened to 16 hex
characters. Identical selections still share a run.

### Move storage functions to their own module

`storeTerms`, `applyCorrections`, the page-term removal and `checkPattern` move to `host/store.mjs`,
taking file paths as arguments, so tests can run them against a temporary folder. Behaviour does not
change in the move; the behaviour changes land after it.

## Risks / Trade-offs

- [A regenerating run that succeeds with an empty result removes the page's terms] → That is what
  Regenerate means; the panel then shows 0 terms from this page.
- [A term from another page with the same id as a new term is still replaced] → Unchanged behaviour,
  covered by the existing "reusing an id" rule.
- [Old stale repository copies keep winning until touched] → Listed in the proposal; Regenerate on
  the page that owns the copy clears it.
