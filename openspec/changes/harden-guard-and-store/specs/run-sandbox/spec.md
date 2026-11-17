# Spec Delta

## MODIFIED Requirements

### Requirement: git cannot write, leave the repository or start a program
A git command SHALL have its subcommand first and SHALL use only the options listed for that
subcommand, written in full: short options may be bundled and may carry their value in the same
word, and each one is checked either way. A value given as the next word SHALL NOT start with `-`,
and options that write a file, read outside the repository or run a program are refused wherever
they appear. Its revision and path operands SHALL NOT be absolute, start with a drive letter, contain
a `..` step in any part of a `rev:path`, or lead out of the checkout through a symbolic link.

#### Scenario: Abbreviated option
- **WHEN** a run tries `git diff --out=/tmp/x`
- **THEN** the call is refused

#### Scenario: Option before the subcommand
- **WHEN** a run tries `git -C /elsewhere log`
- **THEN** the call is refused

#### Scenario: Value attached to a short option
- **WHEN** a run tries `git grep -O./evil.sh hello`
- **THEN** the call is refused

#### Scenario: Path outside the repository
- **WHEN** a run tries `git diff /dev/null /path/to/file`
- **THEN** the call is refused

#### Scenario: Option that reads a named file
- **WHEN** a run tries `git blame -S revs.txt a.js`
- **THEN** the call is refused

#### Scenario: Option hidden as a value
- **WHEN** a run tries `git log -U --output=/tmp/x -1`
- **THEN** the call is refused

#### Scenario: Symbolic link out of the checkout
- **WHEN** the repository commits `outlink` as a link to a folder outside it and a run names `outlink/secret`
- **THEN** the call is refused

#### Scenario: Revision range
- **WHEN** a run tries `git log HEAD~3..HEAD`
- **THEN** the call is allowed

### Requirement: gh reads only the page's repository
A gh command SHALL use only the options listed for it. A command that names a repository, by `--repo`
or `-R` in any form, or by a URL, SHALL name the run's own repository on `github.com`. It SHALL NOT
open a browser or use `--jq` or `--template`. A command that names none reads the checkout's
repository.

#### Scenario: No repository named
- **WHEN** a run tries `gh pr view 12`
- **THEN** the call is allowed

#### Scenario: Other repository
- **WHEN** a run tries `gh issue view 1 --repo other/repo`
- **THEN** the call is refused

#### Scenario: Other repository, value attached
- **WHEN** a run tries `gh issue view 1 -Rother/repo`
- **THEN** the call is refused

#### Scenario: Browser
- **WHEN** a run tries `gh pr view 12 --web`
- **THEN** the call is refused

#### Scenario: jq expression
- **WHEN** a run tries `gh pr view 12 --json body --jq '$ENV'`
- **THEN** the call is refused

### Requirement: The check fails closed
When the check has not been told the run's checkout and run folder, it SHALL refuse every call. It
SHALL refuse a tool other than file reading and searching, the checked commands, and the run's own
structured reply and task list, and a call it cannot parse, whatever the reader's own settings allow.

#### Scenario: No roots
- **WHEN** the check runs without its folders configured
- **THEN** every tool call is refused

#### Scenario: Tool the reader allows
- **WHEN** the reader's user settings allow a tool the run does not need
- **THEN** a run's call to it is refused

#### Scenario: Unreadable call
- **WHEN** the check is given input that is not JSON
- **THEN** the call is refused

### Requirement: Message limits
The host SHALL drop an incoming message over 4 MB and still read the messages after it. A reply over
1 MB is sent in numbered parts that the extension joins back together, and every request the
extension sends gets an answer within two minutes.

#### Scenario: Large glossary
- **WHEN** a page's glossary reply is over 1 MB
- **THEN** the extension receives the whole reply

#### Scenario: Oversized request
- **WHEN** a message of more than 4 MB arrives, followed by a normal one
- **THEN** the first is dropped and logged, and the second is answered
