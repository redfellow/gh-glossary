# Spec Delta

## MODIFIED Requirements

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

### Requirement: Each sender gets only the requests it needs
The extension SHALL pass host requests only from its own content script on `https://github.com/`, its
toolbar popup and its own options page. The content script may only read a page's data and a Select
job, and only for the repository its own tab shows; the popup may also start runs and allow; the
options page may read host status and the allowlist, remove from the allowlist, and check that a
folder exists.

#### Scenario: Content script removes an allowance
- **WHEN** the content script asks to remove a repository from the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Options page allows
- **WHEN** the options page asks to add to the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script reads another repository
- **WHEN** the content script of a tab on `acme/widgets` asks for the glossary of `acme/secret`
- **THEN** the request is refused before it reaches the host

## ADDED Requirements

### Requirement: git in a run reads only the checkout's configuration
git started by a run SHALL read no global or system configuration, and git environment variables that
run programs or change what git reads SHALL be removed, so a repository's `.gitattributes` cannot
point a reader's own diff driver or text converter at its files.

#### Scenario: Reader's text converter
- **WHEN** the reader's global git config defines `diff.conv.textconv` and the repository's
  `.gitattributes` says `*.txt diff=conv`
- **THEN** `git show`, `git log -p` and `git blame` in a run do not start that converter
