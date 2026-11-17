# Spec Delta

## MODIFIED Requirements

### Requirement: Only the extension reaches the host
The host SHALL be started by the browser for this extension's ID only and talk over standard input
and output. It opens no network port and uses no token. The install script (`host/install.sh` on
macOS and Linux, `host/install.cmd` on Windows) registers it for the current user, shows where it is
registered, and removes it.

#### Scenario: Another extension
- **WHEN** another extension asks the browser to connect to the host
- **THEN** the browser refuses

#### Scenario: Registered on Windows
- **WHEN** the reader runs `host\install.cmd` on Windows
- **THEN** the host is registered for Chrome and for each of Edge, Brave and Chromium that is
  installed, under the current user only, and `host\install.cmd status` lists where

## ADDED Requirements

### Requirement: Runs start no command shell on Windows
On Windows the host SHALL start `claude`, `gh` and `git` without passing their arguments through
`cmd.exe`. An npm command shim is followed to the program it starts; a batch file that is not one is
refused with a message naming the native `claude` install.

#### Scenario: claude installed with npm
- **WHEN** `claude` on the PATH is the npm shim `claude.cmd`
- **THEN** the host starts the script the shim points at with its own `node`

#### Scenario: Unknown batch file
- **WHEN** `claude` on the PATH is a batch file that is not an npm shim
- **THEN** the run fails with an error that says to install the native `claude`
