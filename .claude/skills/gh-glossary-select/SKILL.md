---
name: gh-glossary-select
description: gh-glossary Select operation. Define exactly the text a reader selected on a GitHub page, following gh-glossary SPEC.md.
---

# gh-glossary-select

Follow `SPEC.md` (gh-glossary definition spec), which comes before these instructions. This is the
**Select** operation (SPEC section 9).

## Inputs

The prompt gives the selected text, the sentence or code line around it, and the page. You have:
- the working directory: a checkout of the commit the page shows
- `glossary.json` in the run folder: every term already defined (both layers)

Read-only `gh` and `git` commands are allowed. Do not modify anything.

## Steps

1. Define exactly the selected text, in the sense it has in the surrounding context. Section 3 does
   not apply: the reader asked for this one.
2. Give it a category by section 2 (the closest fit if none qualifies strictly) and a layer by
   section 5.
3. Verify it at the category's source (section 8) and set `verified` accordingly.
4. The pattern must match the selected text as it appears on the page, and follow section 6.
5. Link related glossary terms with `[[id]]` where it helps.

Return one term. Answer with the structured output only.
