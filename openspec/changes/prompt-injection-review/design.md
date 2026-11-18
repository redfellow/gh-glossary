# Design

## Context

See proposal.md for the findings. What shapes the approach:

- Claude Code runs a Bash command in the reader's shell (zsh on macOS) after loading a snapshot of
  the reader's aliases, functions and `setopt` lines. The guard splits the command the way a POSIX
  shell would, so every zsh-only expansion is a difference between what was checked and what runs.
- The run's system prompt is `openspec/specs/term-definition/spec.md` followed by the operation's
  skill. The user prompt is three lines the host writes.
- The CLI enforces `--json-schema`, `additionalProperties: false` included (checked: an extra
  `selected` property was rejected). It enforces no string lengths.
- Of 939 stored terms, 701 come from pull request pages. Of 17 stored links, 12 are under
  `github.com/<owner>` and 5 under `www.rfc-editor.org`. The longest stored correction reason is 147
  characters and the longest id 36. The dearest recorded runs cost 0.44 (Quick), 0.27 (Select) and
  2.97 US dollars (Thorough).

## Goals / Non-Goals

**Goals:**

- What the guard checked is what runs, in any shell with any options.
- No text from a page's address, and no text the reader cannot see, reaches a run.
- A steered run has no outbound channel left and cannot grow or outlive its page unnoticed.
- The reader can choose to keep outsiders' text away from the shared glossary.

**Non-Goals:**

- Detecting injected text in the host. The host limits what a run can do; it does not judge text.
- A per-repository outside mode. One mode for all repositories; see Open Questions.
- Hidden text inside files in the checkout (a rendered `.md` hides HTML comments too). A run reads
  those files with Read, which the host does not filter.
- Putting Send to Claude behind the guard. The README says it is outside.
- Rewriting stored glossaries.

## Decisions

### The guard rebuilds the command

For a Bash call it approves, the guard prints `updatedInput` with `command` set to the checked
words, each in single quotes (`'` inside a word as `'\''`), next to `permissionDecision: "allow"`.
Checked with claude 2.1.323, headless, `--permission-mode dontAsk`: a hook that rewrote
`echo ORIGINAL` to quoted words ran the rewritten command, and `=node`, `^zzz`, `HEAD~1` and `it's`
reached the program unchanged. Quoted words are not expanded by bash or zsh under any option, and a
quoted command name is not alias-expanded either.

The guard also refuses an unquoted word that starts with `=`, so the one expansion that works in a
default zsh does not depend on the rewrite being honoured. The `extendedglob` case does not depend
on it either while Claude Code keeps turning that option off (checked: with `setopt extendedglob`
in the reader's `.zshenv`, the command's shell still had it off); the rewrite removes the guard's
reliance on that.

Alternatives: adding `^` and `~` to the refused characters breaks `HEAD~3` and `HEAD^`, which the
spec allows and runs use often. An allowlist of characters for unquoted words has the same cost and
still leaves the next shell option to find.

### A page's address stays out of the prompt

The host writes `target.json` to the run folder: `{ kind, number?, path?, ref?, readme? }`. The
prompt names the operation, the repository (already validated), the kind of page with its number,
the commit and the run folder. The three skills' Inputs sections say where the path and ref are.
The prompt is built by a pure function so a test can give it a hostile page key.

### Hidden text is removed in the host

`gatherPage` parses gh's JSON and passes every body (description, comments, reviews, replies)
through one function before writing `page.json`:

- HTML comments are removed, except inside fenced code blocks and inline code spans, where the page
  shows them. An unterminated `<!--` removes the rest of the body, as GitHub hides it.
- Unicode tag characters (U+E0000 to U+E007F) are removed everywhere.

The diff is left as it is: the page shows a diff's text literally.

### "Data, not instructions" lives in the spec

The requirement is added to the `term-definition` spec, because that file is the system prompt. It
reaches runs once the delta is synced into `openspec/specs/term-definition/spec.md`, and the spec
version there goes to 4. The schemas gain an optional `notes` string. The host cuts it to 500
characters and stores it in the page's record in `pages.json`, or in the Select job's result. The
popup shows it escaped, as it shows every other host string.

### Links are checked in two places

The host keeps a term's `link` only if `new URL(link)` is `https:`, its host is `github.com` and its
path starts with `/<owner>/`, compared without regard to case. The check runs when a run's terms are
saved (the field is dropped, the term kept) and when a glossary is read for a page, as patterns are
checked both times. The definition box applies the same rule with the owner of the repository it was
told, on top of its present checks.

Alternative: also allowing `www.rfc-editor.org` keeps the 5 stored RFC links. Not chosen: one rule,
no list of sites to maintain.

### What a run may save

`storeTerms` copies only `id`, `term`, `category`, `pattern`, `code`, `def`, `verified`, `where`
and `link` from a term, then adds the host's fields. A correction's `id` is capped at 100 characters
and its `reason` at 300.

### Spend limits per operation

`config.modes.<operation>.maxBudgetUsd` defaults to 2 for Quick and Select and 10 for Thorough,
several times the dearest recorded run of each. The existing top-level `maxBudgetUsd`, when set,
still applies to every operation.

### Owner terms from other repositories

`glossaryForRun` gives a Thorough run the full form of an owner term only when the term's origin is
the run's repository or the whole owner is allowed. Without that, the run could not correct the term
anyway.

### Outside pages

Whether a page is outside is worked out for every run, in every mode, and stored on each term as
`outside: true`, so changing the mode later takes effect on terms already saved.

| Page | Outside when | Source |
|---|---|---|
| Pull request | head is in a fork, or the opener is not OWNER, MEMBER or COLLABORATOR | `isCrossRepository` in the `gh pr view` call already made; `author_association` from `gh api repos/<repo>/issues/<n>` |
| Issue | the opener is not OWNER, MEMBER or COLLABORATOR | the same REST call |
| Discussion | the opener is not OWNER, MEMBER or COLLABORATOR | `authorAssociation` added to the GraphQL query |
| File or home page | the ref is a commit id the default branch does not contain | `gh api repos/<repo>/compare/<sha>...<default branch>`: `ahead` or `identical` means contained |

A failed or empty lookup makes the page outside. Checked here: `gh pr view --json isCrossRepository`
returns a boolean, and the REST call returns `OWNER` for a pull request of this repository. Not
checked yet: the `authorAssociation` of comments and reviews in `gh pr view --json comments,reviews`
(the pull request tried has none), and the compare call.

The mode is `outside` in `config.json`: `off` (default), `limit-writes` or `outside-pages`. It is
kept in the host because the host enforces it and because content scripts can read and write
`chrome.storage.local`. The popup sets it through a service-worker message that only the popup may
send, as with allowing a repository; `GET /api/page` returns it so the popup and the box can show
it.

Where each mode acts:

- `limit-writes` and `outside-pages`: `storeTerms` and `applyCorrections` get the page's outside
  flag and apply the "Limit writes" requirement.
- `outside-pages`: the glossary read for a page or a run leaves out terms marked outside whose
  origin is another page, and `gatherPage` leaves out comments, reviews and replies whose author is
  not OWNER, MEMBER or COLLABORATOR, counting them into the page's record.

One definition of "outside" serves both modes. A lighter "limit writes" that looked only at forks
was considered and dropped: two definitions would make the stored mark mean different things.

## Risks / Trade-offs

- [The default mode is off, so findings 2 and 3 stay open until the reader picks a mode] → The
  README says so, and the popup shows the mode on every page.
- [A Claude Code version that stops honouring `updatedInput` would run the command as written] →
  `=` is refused regardless; the headless check in tasks is repeated when the CLI is upgraded.
- [A member whose membership GitHub does not show to the reader's token counts as an outsider] →
  Their pages are outside and their comments left out in the strictest mode; the popup shows the
  count so the reader can tell.
- [Bots (Dependabot, CI comments) count as outsiders] → Intended: their text is third-party text.
- [Removing HTML comments could remove text the page shows, if the scanner misreads a code block] →
  Tests cover fenced blocks, inline code and an unterminated comment.
- [RFC links disappear from five stored terms] → Chosen when this change was planned; the terms
  and their definitions stay.
- [Terms saved before this change carry no outside mark] → They are treated as inside; Regenerate
  on their page marks them.
- [The spec requirement lowers how often injected text is followed but cannot rule it out] → The
  other changes bound what a steered run can do.

## Migration Plan

No stored data changes. `config.json` gains `outside` and per-operation `maxBudgetUsd` only when
the reader sets them. Syncing the `term-definition` delta raises the spec version to 4; earlier
terms keep showing with their own version. Rollback is reverting the commits: terms carrying
`outside` or `notes` in `pages.json` are ignored by the older code.

## Open Questions

- Should the mode later be settable per repository or owner? It would change only where the mode
  is stored and looked up.
