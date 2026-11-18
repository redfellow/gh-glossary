# Proposal

## Why

A prompt injection review of `main` at `edd1396` probed the real pipeline three times (Quick,
sonnet/medium: a hidden HTML comment, a blunt "system message" comment, a convention planted in the
checkout's `CLAUDE.md`). No probe steered the model, and the checkout's own `CLAUDE.md`, rules,
skills, agents and commands were confirmed not to load under `--setting-sources user`. The review
still found ten weaker spots, one of them a way past the guard:

1. The guard's list of refused characters misses three zsh expansions. `git diff --stat =node =gh`
   passed the real hook and diffed two files outside the roots (confirmed end to end; zsh turns
   `=name` into that command's path). With `setopt extendedglob`, `^` and a `~` inside a word are
   glob operators: in a checkout holding a file named `-Osh x.sh`, `git grep ^zzz` ran `x.sh`, and
   a file named `--output=…` made `git log ^zzz` write a file (confirmed in zsh; not reproduced
   through Claude Code, whose shell snapshot copies the reader's `setopt` lines).
2. A pull request run reads the pull request's head, so in a fork's pull request the README,
   `CLAUDE.md` and docs the skills name as sources are the author's. Its terms go to the whole
   repository (or owner), reusing an id replaces any stored term, Thorough corrections rewrite any
   term, and `verified` is the model's own claim.
3. A run's output is handed to later runs as `glossary.json` with nothing marking it as data, and
   the owner layer carries it from one repository's runs to another's.
4. A file page's path, up to 500 characters from the address, is written into the run's prompt.
5. `page.json` holds raw Markdown, so an HTML comment in a description or comment reaches the run
   while the reader sees nothing.
6. A definition's `link` may point at any https host. It is the one way a run's text can leave the
   machine, and needs a click.
7. Neither the spec nor the skills say that what a run reads is data, and a run has no way to
   report text that addressed it: all three probes dropped the injected text silently.
8. A correction's `reason` and `id` have no length limit (a 2 MB reason was stored), and the host
   saves fields the spec does not name (`selected: true` would survive Regenerate; today only the
   CLI's schema check stops it).
9. No spend limit is set by default, so a steered Thorough run can use 30 minutes of opus.
10. Send to Claude opens a session without the guard and points it at the same pull request.

## What Changes

- The guard hands Claude Code the command rebuilt from the words it checked, each quoted, so the
  reader's shell and its options expand nothing in them. An unquoted word starting with `=` is
  refused as well.
- The run's prompt holds only text the host wrote; a file's path and ref go in a file in the run
  folder. HTML comments outside code and invisible Unicode tag characters are removed from
  descriptions, comments and reviews before a run gets them.
- The `term-definition` spec gains a requirement that everything a run reads is data (spec version
  4), and runs can return a short `notes` text about what they did not follow, shown in the popup.
- A `link` is kept only when it is on `github.com` under the repository's owner, in the host and in
  the definition box. **BREAKING**: links to other sites are no longer offered (5 of the 17 stored
  links, all to `www.rfc-editor.org`).
- Corrections get length limits, and only the fields the spec names are saved from a term.
- Runs get a default spend limit: 2 US dollars for Quick and Select, 10 for Thorough.
- Thorough gets an owner term from another repository in full only when the whole owner is allowed.
- New, off by default: the host tells outside pages apart (a fork's pull request; a pull request,
  issue or discussion opened by someone who is not an owner, member or collaborator; a file page at
  a commit that is not on the default branch) and the reader picks a mode in the popup. "Limit
  writes" stops runs on those pages from replacing or correcting other pages' terms and from
  writing the owner layer. "Outside pages" also keeps their terms on their own page and leaves
  outsiders' comments out of what runs read.
- README Safety says what each mode leaves open, and that Send to Claude is outside the guard.

## Capabilities

### New Capabilities

- `outside-content`: which pages and comments come from people without write access, the mode the
  reader picks for them, and what each mode lets their runs store and show.

### Modified Capabilities

- `run-sandbox`: one plain command at a time (the rebuilt command, `=`); what each sender may ask.
- `define-runs`: what a run is given (prompt text, hidden text, owner terms); spend limits; new:
  a run reports text it did not follow.
- `term-definition`: new requirement, text read during a run is data.
- `glossary-store`: what one run may save; new: where a link may point.
- `definition-popover`: how links are offered; provenance of a term from an outside page.

## Impact

- `host/guard.mjs`, `host/host.mjs`, `host/store.mjs`, `host/rules.mjs`, `schema/*.schema.json`,
  `.claude/skills/gh-glossary-*/SKILL.md`, `extension/background.js`, `extension/popup.js`,
  `extension/popover.js`, `extension/content.js`, `README.md`, and their tests.
- `openspec/specs/term-definition/spec.md` is the run's system prompt: the new requirement reaches
  runs when it is synced there, with the spec version raised to 4.
- `config.json` gains `outside` (the mode) and per-mode `maxBudgetUsd`.
- Stored data is not rewritten. Terms saved before this change carry no outside mark and are
  treated as coming from inside.
- One more `gh` request per run on a pull request or issue (who opened it), and one for a file page
  addressed by a commit.
