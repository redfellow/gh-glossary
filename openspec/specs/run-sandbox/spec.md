# run-sandbox Specification

## Purpose

Treats every run as possibly prompt-injected, since a GitHub page is text from the internet: limits
what a run may read and execute, and limits who may talk to the host.

## Requirements

### Requirement: Read-only tools
A run SHALL have only file reading and searching, and these commands: `git log`, `show`, `diff`,
`grep`, `blame`, `status`, `ls-files`, and `gh pr view`, `pr diff`, `pr checks`, `issue view`. Web
access, file writing and editing are off, and anything not listed is refused without asking.

#### Scenario: Write attempt
- **WHEN** a run tries to write or edit a file
- **THEN** the call is refused

#### Scenario: Other command
- **WHEN** a run tries `curl`, `cat` or `git push`
- **THEN** the call is refused

### Requirement: Files only inside the checkout and run folder
A run SHALL read and search files only inside its checkout and its run folder, with symbolic links
resolved before the check.

#### Scenario: Path outside
- **WHEN** a run tries to read a file in the reader's home folder
- **THEN** the call is refused

#### Scenario: Symlink out of the checkout
- **WHEN** a file in the checkout is a symbolic link to a file outside it
- **THEN** reading it is refused

#### Scenario: Search pattern that climbs out
- **WHEN** a file search pattern contains `..` or an absolute path outside the roots
- **THEN** the call is refused

### Requirement: One plain command at a time
A command SHALL be a single program with plain or quoted words. Pipes, `;`, `&&`, redirects, command
substitution, variables, unquoted globs, backslashes and line breaks are refused.

#### Scenario: Pipe
- **WHEN** a run tries `git log | head`
- **THEN** the call is refused

#### Scenario: Quoted words
- **WHEN** a run tries `git grep "foo bar"`
- **THEN** the call is allowed

### Requirement: git cannot write, leave the repository or start a program
A git command SHALL have its subcommand first, and SHALL NOT use options that write a file, read
outside the repository or run a program, including their abbreviations: `--output`, `--no-index`,
`--contents`, `--open-files-in-pager`, `--ext-diff`, `--textconv`, `--file`, `--exec`, `--paginate`,
and for `git grep` the short options `-O` and `-f`.

#### Scenario: Abbreviated option
- **WHEN** a run tries `git diff --out=/tmp/x`
- **THEN** the call is refused

#### Scenario: Option before the subcommand
- **WHEN** a run tries `git -C /elsewhere log`
- **THEN** the call is refused

### Requirement: gh reads only the page's repository
A gh command that names a repository, by `--repo` or by a URL, SHALL name the run's own repository on
`github.com`, and SHALL NOT open a browser. A command that names none reads the checkout's repository.

#### Scenario: No repository named
- **WHEN** a run tries `gh pr view 12`
- **THEN** the call is allowed

#### Scenario: Other repository
- **WHEN** a run tries `gh issue view 1 --repo other/repo`
- **THEN** the call is refused

#### Scenario: Browser
- **WHEN** a run tries `gh pr view 12 --web`
- **THEN** the call is refused

### Requirement: The check fails closed
When the check has not been told the run's checkout and run folder, it SHALL refuse every call.

#### Scenario: No roots
- **WHEN** the check runs without its folders configured
- **THEN** every tool call is refused

### Requirement: The repository's own settings do not apply
A run SHALL load only the reader's user-level settings. Settings, hooks and tool servers committed in
the repository being read are not loaded, browser control is off, and the run's conversation is not
saved.

#### Scenario: Hook committed in the repository
- **WHEN** the checked-out repository contains a project settings file with a hook
- **THEN** the hook does not run

### Requirement: Only the extension reaches the host
The host SHALL be started by the browser for this extension's ID only and talk over standard input
and output. It opens no network port and uses no token. The install script registers it, shows where
it is registered, and removes it.

#### Scenario: Another extension
- **WHEN** another extension asks the browser to connect to the host
- **THEN** the browser refuses

### Requirement: Each sender gets only the requests it needs
The extension SHALL pass host requests only from its own content script on `https://github.com/` and
from its own options page. The content script may read a page's data, start and track runs, and
allow; the options page may read host status and the allowlist, remove from the allowlist, and check
that a folder exists.

#### Scenario: Content script removes an allowance
- **WHEN** the content script asks to remove a repository from the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Options page allows
- **WHEN** the options page asks to add to the allowlist
- **THEN** the request is refused before it reaches the host

### Requirement: Message limits
The host SHALL drop an incoming message over 4 MB. A reply over 1 MB is sent in numbered parts that
the extension joins back together.

#### Scenario: Large glossary
- **WHEN** a page's glossary reply is over 1 MB
- **THEN** the extension receives the whole reply

#### Scenario: Oversized request
- **WHEN** a message of more than 4 MB arrives
- **THEN** it is dropped and logged
