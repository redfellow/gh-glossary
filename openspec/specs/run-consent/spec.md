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
The first Quick, Thorough or Define on a repository that is not allowed SHALL show a prompt next to
the control with three choices: allow this repository, allow all of the owner's repositories, or
cancel. After an allow choice the action the reader asked for goes ahead.

#### Scenario: Allow the repository
- **WHEN** the reader clicks Quick on `acme/widgets` and then "Allow widgets"
- **THEN** `acme/widgets` is added to the allowlist and the Quick run starts

#### Scenario: Cancel
- **WHEN** the reader cancels, presses Escape or clicks outside the prompt
- **THEN** nothing is added and no run starts

### Requirement: Only a real click allows
The allowlist SHALL be added to only by the reader's own click on the prompt. A click made by a
script on the page is ignored, and no other part of the extension can add to it.

#### Scenario: Scripted click
- **WHEN** a page script dispatches a click on the prompt's allow button
- **THEN** nothing is added to the allowlist

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
