# Spec Delta

## MODIFIED Requirements

### Requirement: One plain command at a time
A command SHALL be a single program with plain or quoted words. Pipes, `;`, `&&`, redirects, command
substitution, variables, unquoted globs, backslashes and line breaks are refused, and so is an
unquoted word that starts with `=`. The command that runs SHALL be the one rebuilt from the words
that were checked, each quoted, so the reader's shell and its options expand nothing in them.

#### Scenario: Pipe
- **WHEN** a run tries `git log | head`
- **THEN** the call is refused

#### Scenario: Quoted words
- **WHEN** a run tries `git grep "foo bar"`
- **THEN** the call is allowed

#### Scenario: Command name written with =
- **WHEN** a run tries `git diff =node =gh`
- **THEN** the call is refused

#### Scenario: Shell with extended globbing
- **WHEN** the reader's shell has extended globbing on, the checkout holds a file named `-Osh x.sh`,
  and a run tries `git grep ^zzz`
- **THEN** git receives `^zzz` as its pattern, no file name takes its place, and `x.sh` does not run

#### Scenario: Revision written with ~ and ^
- **WHEN** a run tries `git log HEAD~3..HEAD^`
- **THEN** the call is allowed and git receives that word as written

### Requirement: Each sender gets only the requests it needs
The extension SHALL pass host requests only from its own content script on `https://github.com/`, its
toolbar popup and its own options page. The content script may only read a page's data and a Select
job, and only for the repository its own tab shows; the popup may also start runs, allow, and choose
how outside pages are treated; the options page may read host status and the allowlist, remove from
the allowlist, and check that a folder exists.

#### Scenario: Content script removes an allowance
- **WHEN** the content script asks to remove a repository from the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Options page allows
- **WHEN** the options page asks to add to the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script reads another repository
- **WHEN** the content script of a tab on `acme/widgets` asks for the glossary of `acme/secret`
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script changes the outside mode
- **WHEN** the content script asks to change how outside pages are treated
- **THEN** the request is refused before it reaches the host
