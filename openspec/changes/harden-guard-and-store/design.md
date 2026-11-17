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
`-e` is given) and option values are not paths: no listed option reads a file, and checking them
would refuse searches for URLs.

## Unknown tools

Read, Grep, Glob and Bash are checked as before. `StructuredOutput` (the run's reply under
`--json-schema`, confirmed to pass through the PreToolUse hook) and `TodoWrite` are allowed. Every
other tool is refused, so the reader's own `permissions.allow` rules (loaded with
`--setting-sources user`) cannot widen a run, and a tool Claude Code adds later starts out refused.

## Slow patterns

A regex cannot be interrupted in the content script. The host refuses the forms that can backtrack
exponentially: a group followed by `*`, `+` or `{}` (found after removing escapes and character
classes), backreferences, and sources over 500 characters. None of 709 stored patterns uses these.
`mergedGlossary` applies the same check, so terms stored earlier or edited by hand are left out of
what pages get.

## Owner glossary folder

Repository names allow `_`, `.` and `-` but not `@`, so `@org` cannot collide with a repository.
