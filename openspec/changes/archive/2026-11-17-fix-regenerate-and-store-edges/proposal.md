# Proposal

## Why

The baseline specs recorded four behaviours as they are because they were found while reading the
code, not because they are wanted. Each can lose or hide a reader's definitions without saying so.

## What Changes

- Regenerate replaces a page's terms only after the run succeeds. A failed run leaves the page's
  earlier terms in place.
- Regenerate keeps terms the reader defined by selection on that page.
- Saving an owner-layer term removes a term with the same id from the current repository's glossary,
  so the new definition is the one shown.
- A Select run is identified by the whole selected text. Two different selections on one page always
  get their own runs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `define-runs`: the Regenerate requirement changes (order, failure, selected terms); the Select key
  requirement is replaced.
- `glossary-store`: the requirement on reusing an id changes for a term that moves to the owner layer.

## Impact

- `host/host.mjs`: Regenerate order and what it deletes, the glossary handed to a regenerating run,
  saving across layers, the Select job key.
- `extension/content.js`: the Regenerate box's hint text.
- `README.md`: the Regenerate description.
- New host tests for storing and regenerating; none exist today.
- Stored data: no migration. Stale repository copies already on disk stay until their term is saved
  again or the page is regenerated.
