# run-consent Specification

## Purpose

Lets the reader decide on which repositories runs may start, and change that decision later.

## Requirements

### Requirement: Runs start only for allowed repositories
The host SHALL refuse a Quick, Thorough or Select run unless the repository, or its owner, is on the
allowlist. Names are compared without regard to letter case.

#### Scenario: Not allowed
- **WHEN** a run is requested for a repository that is not on the allowlist
- **THEN** the host refuses it and says the repository is not on the allowlist

#### Scenario: Owner allowed
- **WHEN** `acme` is an allowed owner and a run is requested for `Acme/widgets`
- **THEN** the run is accepted

### Requirement: Allow prompt
The first Quick, Thorough or Define on a repository that is not allowed SHALL ask in the toolbar
popup, which names the repository and offers three choices: cancel, allow this repository, or allow
all of the owner's repositories. Cancel has the focus. For a Define from the context menu the popup
opens with the question. After an allow choice the action the reader asked for goes ahead, if the
same page is still open. No separate window opens.

#### Scenario: Allow the repository
- **WHEN** the reader clicks Quick on `acme/widgets` and then "Allow widgets" in the popup
- **THEN** `acme/widgets` is added to the allowlist and the Quick run starts

#### Scenario: Cancel
- **WHEN** the reader cancels, presses Enter or Escape, or closes the popup
- **THEN** nothing is added and no run starts

#### Scenario: Asked twice
- **WHEN** a question is waiting and another Quick, Thorough or Define asks for a repository
- **THEN** the newer question replaces it and the first action does not start

#### Scenario: Define from the context menu
- **WHEN** the reader chooses Define on a selection in a repository that is not allowed
- **THEN** the popup opens with the question, and the Select run starts after an allow

### Requirement: Only a real click allows
The allowlist SHALL be added to only by an answer in the toolbar popup, which is an extension page no
script on github.com can reach. Runs SHALL start only from the toolbar popup and the context menu. The
content script can neither add to the allowlist nor start a run.

#### Scenario: Scripted click
- **WHEN** a page script clicks, focuses or restyles anything in the page
- **THEN** no run starts and nothing is added to the allowlist

#### Scenario: Content script asks the host directly
- **WHEN** the content script sends a request to add to the allowlist or start a run
- **THEN** the extension refuses it before it reaches the host

### Requirement: The allowlist is kept and can be changed
The allowlist SHALL be stored in the host's configuration file on the reader's machine and survive
restarts. The options page lists every allowed owner and repository and lets the reader remove each.

#### Scenario: Remove
- **WHEN** the reader removes an owner in the options page
- **THEN** runs for that owner's repositories are refused again, unless the repository itself is listed

### Requirement: What happens without permission
Showing a page of a repository that is not allowed SHALL start no run. The host does read stored
glossaries for it and, for file and branch pages, asks GitHub through the reader's `gh` login which
commit the address names.

#### Scenario: File page of a repository not allowed
- **WHEN** the reader opens a file page of a repository that is not on the allowlist
- **THEN** stored terms are shown, the ref is looked up through `gh`, and no run starts
