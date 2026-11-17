---
name: gh-glossary-quick
description: gh-glossary Quick operation. Define the qualifying terms on one GitHub page from the page and the repo's docs, following gh-glossary SPEC.md.
---

# gh-glossary-quick

Follow `SPEC.md` (gh-glossary definition spec), which comes before these instructions. This is the
**Quick** operation (SPEC section 9).

## Inputs

The prompt names the page. You have:
- the working directory: a checkout of the commit the page shows
- the run folder: `page.json` / `page.diff` for PRs, issues and discussions; for a file or README,
  read it from the checkout
- `glossary.json` in the run folder: every term already defined (both layers)

Read-only `gh` and `git` commands are allowed. Do not modify anything.

## Steps

1. Read the page text: the whole document, or for a PR the description, comments and diff.
2. List candidates and give each a category by SPEC section 2. Drop everything section 3 excludes,
   including terms whose glossary pattern already matches them.
3. For each candidate, take the meaning from the source column of section 2, but stop at the page,
   README, CLAUDE.md, `docs/`, specs, and the definition site found with `git grep` (for `where`).
   Do not trace code further. For `reference`, run one `gh issue view` / `gh pr view`.
4. Order and cut by section 4; set `capHit`.
5. Write each term by sections 5-7. `verified` is `true` only for `reference` terms you looked up.
6. Check every pattern against section 6 before answering.

Answer with the structured output only.
