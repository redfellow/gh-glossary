---
name: gh-glossary-quick
description: gh-glossary Quick operation. Define the qualifying terms on one GitHub page from the page and the repo's docs, following the term-definition spec.
---

# gh-glossary-quick

Follow the term-definition spec, which comes before these instructions. This is the **Quick**
operation (requirement "Quick operation").

## Inputs

The prompt names the page. You have:
- the working directory: a checkout of the commit the page shows
- the run folder: `page.json` / `page.diff` for PRs, issues and discussions; for a file or README,
  read it from the checkout
- `glossary.json` in the run folder: every term already defined (both layers)

Read-only `gh` and `git` commands are allowed. Do not modify anything.

## Steps

1. Read the page text: the whole document, or for a PR the description, comments and diff.
2. List every candidate ("Every qualifying term is returned"): go through the page once per
   category, in the order of "One category per term", and give each candidate its category. Drop everything the "Never-defined" requirements exclude, and every candidate
   "Already-defined terms are not added again" covers.
3. For each candidate, take the meaning from the source its category requirement names, but stop at
   the page, README, CLAUDE.md, `docs/`, specs, and the definition site found with `git grep` (for
   `where`). Do not trace code further. For `reference`, run one `gh issue view` / `gh pr view`.
4. Write each term by "Term fields", "Source location fields", "Org layer", "Repo layer" and the
   three "Definition" requirements. `verified` is `true` only for `reference` terms you looked up.
5. Check every pattern against "Pattern form" and "Pattern specificity" before answering.

Answer with the structured output only.
