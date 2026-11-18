# Design

## Approving commands in the guard

A PreToolUse hook that returns `permissionDecision: "allow"` lets a call run without a matching rule,
also under `--permission-mode dontAsk`. The guard returns it for every Bash command it has checked,
and the run's `--allowedTools` keeps only `Read(//<root>/**)` for its two folders. When hooks do not
run, Claude Code's own read-only command check decides: in a headless run with hooks off, `git log`,
`git grep` and `git show` ran, while `git log --output`, `git grep --open-files-in-pager`,
`git diff --no-index` and `gh pr view --jq` were denied and no file was written. The guard's mark is
kept as a check that the guard ran, but it is no longer what keeps such a run safe.

## Pattern cost

Exponential matching comes from choice points a failing match can combine: each `?` and each group
with `|`. Counting them per top-level alternative (a `|` at the top starts a new count) bounds the
work; the stored patterns use at most five. The shape rules cannot see everything, so each pattern
is also run in `node:vm` on four 90-character probes built from its own characters, with a 50 ms
limit. Results are cached by pattern, since every page read checks every stored pattern.

## Paths

`inside()` refuses a path that starts with two slashes or backslashes, then checks it lexically
against each root as written and with the root's own symlinks resolved; only then does it resolve the
path's symlinks. A path outside is never passed to `realpath`.

## git configuration

The run's environment sets `GIT_CONFIG_GLOBAL` to an empty file and `GIT_CONFIG_NOSYSTEM=1`, and
removes `GIT_EXTERNAL_DIFF`, pagers, `GIT_DIR` and similar variables. The checkout's own `.git/config`
is written by the host, so a `diff=<driver>` in `.gitattributes` names a driver that is not defined.

## Accepted

- The reader's own Claude Code `permissions.allow` rules (user settings are loaded) still apply when
  hooks are off.
- Hooks turned off by MDM, the registry or server-managed settings are only detected after the run.
