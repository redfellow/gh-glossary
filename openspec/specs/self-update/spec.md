# self-update Specification

## Purpose
Lets the reader update gh-glossary from the extension, on a checkout of `main` they are not working
in, without running git or reloading the extension by hand.

## Requirements

### Requirement: An update is offered only on a clean main
The host SHALL offer an update only when the gh-glossary checkout is on `main`, has no changes to
tracked files, and its commit differs from `origin/main` after a fetch. On any other branch, or a
detached HEAD, it SHALL fetch nothing and offer nothing. Untracked files do not count as changes.

#### Scenario: Behind
- **WHEN** the checkout is a clean `main` and `origin/main` has two new commits
- **THEN** an update is offered with the two commit titles

#### Scenario: Another branch
- **WHEN** the checkout is on a branch other than `main`
- **THEN** nothing is fetched and no update is offered

#### Scenario: Uncommitted changes
- **WHEN** a tracked file has changes
- **THEN** no update is offered, and an update asked for is refused and keeps the changes

#### Scenario: Force-pushed main
- **WHEN** `origin/main` was rewritten
- **THEN** an update is offered, saying how many commits on `main` it replaces

### Requirement: Checked only when the reader uses the extension
The extension SHALL check for an update only when the popup opens or a Define starts from the
context menu, and at most once a day. A ready update SHALL show as a badge on the toolbar icon, a line
in the popup with the commit titles and **Update now**, and **Update gh-glossary now** in the icon's
right-click menu.

#### Scenario: Popup opened twice in a day
- **WHEN** the popup opens again within a day of the last check
- **THEN** the host is not asked again

#### Scenario: GitHub cannot be reached
- **WHEN** the fetch fails
- **THEN** nothing changes, no update is offered, and the next check is a day later

#### Scenario: Host not running
- **WHEN** the host cannot be reached at the check
- **THEN** nothing is recorded and the next use of the extension checks again

### Requirement: Only the reader installs an update
An update SHALL be installed only from the popup's **Update now** or the icon's menu item, and only
the commit that was checked. The content script, the definition frame, other extension pages and
other extensions SHALL NOT check for or install an update. Updating runs git directly and does not
start Claude.

#### Scenario: A page asks
- **WHEN** the content script asks the host to update
- **THEN** the request is refused and does not reach the host

#### Scenario: Origin moved after the check
- **WHEN** `origin/main` changed between the check and the click
- **THEN** nothing is installed and the reader is told to check again

### Requirement: The update takes effect at once
After an update the extension SHALL reload itself, which restarts the host on the new code, and the
popup SHALL then say it was updated. If the installer changed, the popup SHALL say to run it again.
An update SHALL be refused while a run is queued or running.

#### Scenario: Run in progress
- **WHEN** the reader clicks Update now during a Thorough run
- **THEN** nothing is installed and the popup says to update when the run has finished
