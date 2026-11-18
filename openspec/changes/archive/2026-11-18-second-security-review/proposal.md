# Proposal

## Why

An independent security review of `main` after `harden-guard-and-store` found no way around the guard
while it runs, but seven weaker spots:

- A pattern made of many optional parts (`.?` repeated, then a character that never occurs) passed
  every pattern rule and takes seconds per match, so one injected term could freeze every page of a
  repository. A run's number of terms and field sizes were not capped either.
- Without the guard (hooks turned off by settings the host cannot read), the run's `Bash(git …:*)` and
  `Bash(gh …:*)` rules still approved `git log --output`, `git grep --open-files-in-pager` and
  `gh --jq`, so the run could write files, start programs, and write the guard's mark itself.
- On Windows the guard resolved symlinks on a `\\host\share` path before refusing it, which connects
  to that host.
- A repository's `.gitattributes` could point a reader's own global diff driver or text converter at
  its files.
- A definition's link kept its path while the box showed only its host.
- The Glob check was lexical, so `{..,x}/**` and a symlinked folder got past it.
- A content script could read the glossary of any repository, not only its tab's.

## What Changes

- Patterns: at most six `?` or alternative groups per top-level alternative (four next to a repeat),
  and a timed run on short probe texts. A run saves at most 200 terms and 200 corrections; long
  fields drop the term.
- The run has no Bash rules; the guard approves each command it checked.
- The guard refuses network and device paths first and resolves only paths already under a root;
  Glob refuses `..` anywhere and checks its leading folder through symlinks.
- git in a run reads no global or system config, and git variables that run programs are removed.
- The box shows a link's whole address and drops paths over 120 characters.
- Content-script reads must name the repository of the sender's tab.

### Modified Capabilities

- `run-sandbox`: read-only tools, files inside the roots, senders; new: git configuration.
- `glossary-store`: pattern checks; new: run output caps.
- `definition-popover`: how links are offered.

## Impact

- `host/guard.mjs`, `host/host.mjs`, `host/store.mjs`, `extension/background.js`,
  `extension/popover.js`, `extension/popover.html`, `README.md`, and their tests.
- No stored pattern in the local cache (908) is refused by the new rules.
