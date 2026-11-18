# run-sandbox Specification

## Purpose

Treats every run as possibly prompt-injected, since a GitHub page is text from the internet: limits
what a run may read and execute, and limits who may talk to the host.

## Requirements

### Requirement: Read-only tools
A run SHALL have only file reading and searching, and these commands: `git log`, `show`, `diff`,
`grep`, `blame`, `status`, `ls-files`, and `gh pr view`, `pr diff`, `pr checks`, `issue view`. Web
access, file writing and editing are off, and anything not listed is refused without asking. The
run's tool rules SHALL NOT allow any command: the check approves each command it has checked, so a
run whose check does not run can run only the commands Claude Code itself treats as read-only, and
none that writes a file, starts a program or prints the environment.

#### Scenario: Write attempt
- **WHEN** a run tries to write or edit a file
- **THEN** the call is refused

#### Scenario: Other command
- **WHEN** a run tries `curl`, `cat` or `git push`
- **THEN** the call is refused

#### Scenario: Check not running
- **WHEN** a run's hook does not run and the run tries `git log -1 --output=<file>`,
  `git grep --open-files-in-pager=<program>` or `gh pr view 1 --json body --jq .body`
- **THEN** the call is refused and nothing is written

### Requirement: Files only inside the checkout and run folder
A run SHALL read and search files only inside its checkout and its run folder, with symbolic links
resolved before the check. A network or device path SHALL be refused before the file system is
asked about it, and only a path that is already under a root as written is resolved at all. The run's own tool permissions allow file reading only under those two
folders, so a read elsewhere is refused even if the check does not run.

#### Scenario: Path outside
- **WHEN** a run tries to read a file in the reader's home folder
- **THEN** the call is refused

#### Scenario: Symlink out of the checkout
- **WHEN** a file in the checkout is a symbolic link to a file outside it
- **THEN** reading it is refused

#### Scenario: Search pattern that climbs out
- **WHEN** a file search pattern contains `..` anywhere (`{..,x}/**` included), an absolute path
  outside the roots, or starts with a folder that is a symbolic link out of the checkout
- **THEN** the call is refused

#### Scenario: Network path
- **WHEN** a run tries to read `\\host\share\x` or `//host/share/x`
- **THEN** the call is refused without connecting to `host`

#### Scenario: Check not running
- **WHEN** a run's hook does not run and the run reads, searches or lists a folder outside its roots
- **THEN** the call is refused

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

### Requirement: git cannot write, leave the repository or start a program
A git command SHALL have its subcommand first and SHALL use only the options listed for that
subcommand, written in full: short options may be bundled and may carry their value in the same
word, and each one is checked either way. A value given as the next word SHALL NOT start with `-`,
and options that write a file, read outside the repository or run a program are refused wherever
they appear. Its revision and path operands SHALL NOT be absolute, start with a drive letter, contain
a `..` step in any part of a `rev:path`, or lead out of the checkout through a symbolic link. The
same holds for the file named in a `-L <range>:<file>` value.

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

#### Scenario: Line range in a file outside
- **WHEN** a run tries `git log -L 1,1:../secret.txt`
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
A tool input of the wrong type, or any error while checking, SHALL be a refusal: the check never
ends in a way Claude Code reads as a non-blocking hook error.

#### Scenario: No roots
- **WHEN** the check runs without its folders configured
- **THEN** every tool call is refused

#### Scenario: Tool the reader allows
- **WHEN** the reader's user settings allow a tool the run does not need
- **THEN** a run's call to it is refused

#### Scenario: Unreadable call
- **WHEN** the check is given input that is not JSON
- **THEN** the call is refused

#### Scenario: Value of the wrong type
- **WHEN** a run calls Read with `file_path: {}` or Grep with `path: [...]`
- **THEN** the call is refused

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

### Requirement: A run does not start without its check
The host SHALL turn hooks on for every run, over the reader's own settings. When managed settings
turn hooks off or allow only managed hooks, the host SHALL NOT start the run and the page SHALL say
why. A run whose check never ran SHALL have its result discarded before anything is stored.

#### Scenario: Reader turned hooks off
- **WHEN** the reader's user settings set `disableAllHooks`
- **THEN** a run still has its check

#### Scenario: Organization allows only managed hooks
- **WHEN** a managed settings file sets `allowManagedHooksOnly` or `disableAllHooks`
- **THEN** no run starts, and the job error names the setting

#### Scenario: Hooks off by a setting the host cannot read
- **WHEN** an MDM profile turns hooks off and a run finishes with a result
- **THEN** the result is discarded, nothing is stored, and the job error says the guard did not run

### Requirement: git in a run reads only the checkout's configuration
git started by a run SHALL read no global or system configuration, and git environment variables that
run programs or change what git reads SHALL be removed, so a repository's `.gitattributes` cannot
point a reader's own diff driver or text converter at its files.

#### Scenario: Reader's text converter
- **WHEN** the reader's global git config defines `diff.conv.textconv` and the repository's
  `.gitattributes` says `*.txt diff=conv`
- **THEN** `git show`, `git log -p` and `git blame` in a run do not start that converter
