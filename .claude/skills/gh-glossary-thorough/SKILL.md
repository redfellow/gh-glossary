---
name: gh-glossary-thorough
description: gh-glossary Thorough operation. Define and verify the qualifying terms on one GitHub page, link related terms, and correct existing definitions, following gh-glossary SPEC.md.
---

# gh-glossary-thorough

Follow `SPEC.md` (gh-glossary definition spec), which comes before these instructions. This is the
**Thorough** operation (SPEC section 9).

## Inputs

The prompt names the page. You have:
- the working directory: a checkout of the commit the page shows
- the run folder: `page.json` / `page.diff` for PRs, issues and discussions; for a file or README,
  read it from the checkout
- `glossary.json` in the run folder: every term already defined (both layers), with definitions

Read-only `gh` and `git` commands are allowed. Do not modify anything.

## Steps

1. Read the page text: the whole document, or for a PR the description, comments and diff.
2. List candidates and give each a category by SPEC section 2. Drop everything section 3 excludes.
   Candidates already matched by a glossary pattern are not added; they go to step 6 instead.
3. Verify every remaining candidate at its source (section 8): open the definition site for `code`,
   the defining document for `domain`, the issue or PR for `reference`, the usage in this repo for
   `external` and `library`. Drop any candidate the source shows does not qualify.
4. Order and cut by section 4; set `capHit`.
5. Write each term by sections 5-7 with `verified: true`. Add `[[id]]` links to related terms, new or
   existing, wherever the relation helps the reader.
6. For every **existing** glossary term that appears on the page, check its definition against the
   source and its pattern against section 6 (use `git grep` on the repo's docs to see whether the
   pattern also matches unrelated text). If it is wrong, out of date or too broad, return a correction:
   `id`, the new `def` and/or `pattern` (and `code` if it changes), and a one-line `reason`. Leave
   correct terms alone.
7. Check every pattern against section 6 before answering.

Answer with the structured output only.
