# Design

## Context

See proposal.md for motivation. Two facts shape the approach:

- `SPEC.md` is a runtime input. The host writes it, followed by the operation's skill, into the
  system prompt of every run, and reads `Spec version: **N**` from it to stamp stored terms.
- The three skills refer to it by section number ("SPEC section 6").

## Goals / Non-Goals

**Goals:**

- One home for every rule: `openspec/specs/`.
- Specs that describe what the code does today, apart from the three changes in the proposal.
- Stored terms keep a comparable spec version.

**Non-Goals:**

- Fixing the four recorded behaviours (Regenerate order, Regenerate and selected terms, stale copy on
  layer change, Select key collision). Each can be its own change.
- Renaming the `ghl-` prefixes and `@ghl-test` markers left from gh-lens.
- New tests for capabilities that have none today.

## Decisions

### The host sends the main `term-definition` spec as the prompt

The host reads `openspec/specs/term-definition/spec.md` where it read `SPEC.md`, and appends the
operation's skill as before.

- Alternative: generate a prose prompt from the spec at build time. Rejected: a second file to keep in
  step, and no build step exists today.
- Alternative: keep `SPEC.md` and have the spec point at it. Rejected by the user: rules belong in
  OpenSpec.

### The version line stays in the spec's Purpose section

The Purpose of `term-definition` carries `Spec version: **3**`, so the host's existing lookup works
with only the path changed. It is bumped by hand when the rules change, as before.

- Alternative: a content hash. Rejected: versions would no longer be ordered, and wording-only edits
  would change them.

### Specs are synced to main before the host is switched

The main spec file does not exist until the change's deltas are synced. The first task group syncs
them, so the host is never pointed at a missing file and `SPEC.md` is deleted only after its
replacement is in place.

### Skills name requirements, not section numbers

Each skill refers to requirements of `term-definition` by name ("Pattern form", "Never-defined
vocabulary"). Requirement names are stable across reordering; section numbers no longer exist.

### The cap is removed, not replaced

`TERM_CAP`, the "cap is N" prompt line, `capHit` (schemas, run record, panel line) and the
order-and-cut rules all go. A run defines every qualifying term. Run length is still bounded by
`maxMinutes` and the optional `maxBudgetUsd`.

- Alternative: enforce the cap in the host by cutting the result. Rejected by the user.

### Rules the host does not check stay as instructions to the run

Most of `term-definition` is followed by the model, not checked in code. `glossary-store` states the
only checks the host makes (pattern is valid, has no capturing group, does not match the empty
string). `where` and `link` stay as instructions; the store accepts terms without them.

## Risks / Trade-offs

- [Requirement-and-scenario wording changes what the model defines] → Run Quick on one page before
  and after the switch and compare term count, categories and a sample of definitions.
- [Without a cap, a very large page gives a long run and a large glossary] → `maxMinutes` stops the
  run; the first long run observed is the trigger to revisit.
- [Spec edits now change run behaviour] → Any change to `term-definition` bumps the version line; the
  spec says so.
- [Baseline specs written from reading code may misstate edge cases] → Tasks include checking each
  spec against the existing tests; later changes correct the baseline as MODIFIED requirements.

## Migration Plan

1. Sync the delta specs to `openspec/specs/`.
2. Point the host and skills at the new spec; remove the cap; update the panel and README.
3. Compare a Quick run before and after.
4. Delete `SPEC.md`.

Rollback is `git revert`: stored glossaries are not migrated, and terms made under version 3 remain
readable by the old code.
