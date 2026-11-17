---
name: gh-glossary-select
description: gh-glossary Select operation. Define exactly the text a reader selected on a GitHub page, following the term-definition spec.
---

# gh-glossary-select

Follow the term-definition spec, which comes before these instructions. This is the **Select**
operation (requirement "Select operation").

## Inputs

The prompt gives the selected text, the sentence or code line around it, and the page. You have:
- the working directory: a checkout of the commit the page shows
- `glossary.json` in the run folder: every term already defined (both layers)

Read-only `gh` and `git` commands are allowed. Do not modify anything.

## Steps

1. Define exactly the selected text, in the sense it has in the surrounding context. The
   "Never-defined" requirements do not apply: the reader asked for this one.
2. Give it a category by the category requirements (the closest fit if none qualifies strictly) and
   a layer by "Org layer" and "Repo layer".
3. Verify it at the category's source ("Verification flag") and set `verified` accordingly.
4. The pattern must match the selected text as it appears on the page, and follow "Pattern form" and
   "Pattern specificity".
5. Link related glossary terms with `[[id]]` where it helps.

Return one term. Answer with the structured output only.
