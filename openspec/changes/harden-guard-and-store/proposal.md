# Proposal

## Why

A review of `15ede9c` found three ways around the run guard, each confirmed against real git and gh:

- `git grep -O./evil.sh hello` runs a script from the checkout. The `-O` check only matched short
  options made of letters, so a value written straight after the option got through.
- `git diff /dev/null /path/to/file` prints any file the reader can read. git switches to
  `--no-index` by itself when a path is outside the repository. `git blame -S <file>` and
  `--ignore-revs-file <file>` leak a file's first line in their error.
- `gh issue view 1 -Rother/private` reads the reader's other private repositories, because `-R` with
  its value attached was not recognised.

Anything a run reads can end up in a definition or its link. The guard named the options it refused,
so each option it had not thought of was allowed. It also let unknown tools and unparsable input
through to the run's tool list, which includes the reader's own `permissions.allow` rules.

The same review found smaller defects: a glossary with one JSON typo read as empty and was then
overwritten; writes were not atomic; a character split across two reads of a process's output was
garbled; a run that only made corrections did not update the page; a repository named `_org` shared
the owner glossary's file; a failed job lookup showed as "Defined"; reply parts over 1 MB were
possible with 3-byte characters; a file page key could contain line breaks that went into the prompt;
and a pattern Claude wrote could take exponential time on every page of an owner.

A second review of the change itself found that the new option tables could be fooled: where the
guard thought an option took the next word as its value and git did not, a hidden option ran
(`git log -U --output=<file>` wrote any file; `git diff -U --no-index` through a committed symlink
read one). It also found that page scripts could start runs and steer the in-page allow prompt, that
polynomial and zero-width patterns still got through, that Send to Claude put address text into a
shell command, that one allowed repository could rewrite the owner's terms from other repositories,
and smaller issues in links, blob lookups, message framing and URL decoding.

## What Changes

- The guard allows only listed options for each git subcommand and gh command, reads short options
  with the value attached and bundled, refuses absolute paths, drive letters and `..` in git operands,
  refuses gh `--jq` and `--template`, and refuses every tool other than Read, Grep, Glob, Bash and the
  run's structured reply and task list, as well as input it cannot parse.
- A glossary file that exists but does not parse is an error; nothing overwrites it. Writes go
  through a temporary file and a rename.
- Patterns that repeat a group, use a backreference or are over 500 characters are refused when saved
  and left out when read.
- The owner glossary moves from `_org/` to `@org/`, a name no repository can have. An existing
  `_org/glossary.json` is moved on first use.
- The host decodes process output as a UTF-8 stream; reply parts are sized for 3 bytes per character;
  file page keys may not contain control characters.
- The page redraws when any stored term changes; a Select run whose job is lost says so.
- Consent moves to an extension window; runs start only from real clicks.
- Send to Claude percent-encodes paths and refs; links show their host and lose query and fragment.
- A run changes owner terms only from its own repository, unless the owner is allowed.

## Capabilities

### Modified Capabilities

- `run-sandbox`: the git, gh, fail-closed and message-limit requirements.
- `run-consent`: the allow prompt and who may allow.
- `send-to-claude`: templates encode paths and refs.
- `definition-popover`: how links are offered.
- `glossary-store`: pattern checks, unreadable files, where the owner glossary lives, owner terms.
- `define-runs`: a lost Select job.
- `term-highlighting`: redraw after a correction, terms that match empty.

## Impact

- `host/guard.mjs`, `host/store.mjs`, `host/host.mjs`, `host/native.mjs`, `host/rules.mjs`,
  `extension/content.js`, `extension/background.js`, `extension/link.js`, new `extension/allow.html`
  and `extension/allow.js`, `README.md`, and their tests.
- Stored data: `cache/data/<owner>/_org/glossary.json` is moved to `@org/` the first time that owner's
  glossary is read or written.
- Runs that used options now unlisted are refused with a message naming the option; Claude retries
  without it.
