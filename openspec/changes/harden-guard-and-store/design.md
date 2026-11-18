# Design

## Allowlist, not blocklist

Each git subcommand and gh command has a table of the options a run may pass: long options as flag,
value or optional value, short options the same way. Short flags may be bundled (`-nw`); a short
option that takes a value takes the rest of the word (`-O./x`, `-Rother/repo`) or the next word. git
accepts unambiguous abbreviations of long options; only whole names are in the tables, so an
abbreviation is refused. The tables list what reading code needs, so options that write files, read
files named by the run, start programs or show signatures (gpg) are refused without being named.

gh `--jq` is refused because gojq exposes environment variables through `$ENV`. `--template` is
refused with it; `--json` alone gives the same data.

## Paths in git operands

git operands are revisions and paths. An operand is refused if it starts with a drive letter, or if
any `:`-separated part is absolute (POSIX or Windows) or has a `..` step. Revision ranges (`a..b`,
`HEAD~3..HEAD`) have no `..` step and stay allowed. git grep's pattern (the first operand when no
`-e` is given) and option values are not paths, with one exception: `-L <range>:<file>` names a
file, so its value is checked like a `rev:path` and its file through the symbolic-link check. Git
refuses a file outside the repository there too, but the guard does not rely on that. Other option
values are not checked as paths, which would refuse searches for URLs.

## Unknown tools

Read, Grep, Glob and Bash are checked as before. `StructuredOutput` (the run's reply under
`--json-schema`, confirmed to pass through the PreToolUse hook) and `TodoWrite` are allowed. Every
other tool is refused, so the reader's own `permissions.allow` rules (loaded with
`--setting-sources user`) cannot widen a run, and a tool Claude Code adds later starts out refused.

The check runs inside a try/catch: any exception (a `file_path: {}` makes `path.isAbsolute` throw) is
a deny. Claude Code reads a hook that exits 1 as a non-blocking error and runs the call, so a crash
outside the check exits 2, which blocks it.

## When the guard does not run

The guard is the one barrier, and the reader's settings can turn hooks off (`disableAllHooks`), as
can managed settings (`disableAllHooks`, or `allowManagedHooksOnly`, under which the host's hook is
not a managed one). Two changes keep a run safe then:

- The host's `--settings` sets `disableAllHooks: false`. Flag settings win over user settings, so a
  reader's own `disableAllHooks` no longer turns the guard off (checked with a headless run: with a
  lower-level `disableAllHooks: true` the hook ran only when the flag set `false`).
- Managed settings win over the flag, so the host reads the managed settings files (and
  `managed-settings.d/`) before a run and refuses to start when they turn hooks off. MDM profiles,
  the Windows registry and server-managed settings are not files and are not read.
- `--allowedTools` allows file reading only as `Read(//<root>/**)` for the checkout and the run folder
  instead of bare `Read`, `Grep` and `Glob`; Claude Code applies Read rules to Grep and Glob too
  (checked with a headless run without the hook: Read, Grep and Glob outside the roots were denied,
  inside allowed). The `Bash(git …:*)` rules cannot be limited to paths, so without the guard git could
  still name a file outside; the managed-settings check is what covers that.

## Slow patterns

A regex cannot be interrupted in the content script. The host refuses the forms that can backtrack
exponentially: a group followed by `*`, `+` or `{}` (found after removing escapes and character
classes), backreferences, and sources over 500 characters. None of 709 stored patterns uses these.
`mergedGlossary` applies the same check, so terms stored earlier or edited by hand are left out of
what pages get.

## Owner glossary folder

Repository names allow `_`, `.` and `-` but not `@`, so `@org` cannot collide with a repository.
