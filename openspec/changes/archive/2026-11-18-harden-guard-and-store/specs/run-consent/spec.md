# Spec Delta

## MODIFIED Requirements

### Requirement: Allow prompt
The first Quick, Thorough or Define on a repository that is not allowed SHALL open the extension's own
allow window, which names the repository and offers three choices: cancel, allow this repository, or
allow all of the owner's repositories. Cancel has the focus. After an allow choice the action the
reader asked for goes ahead, if the same page is still open.

#### Scenario: Allow the repository
- **WHEN** the reader clicks Quick on `acme/widgets` and then "Allow widgets" in the allow window
- **THEN** `acme/widgets` is added to the allowlist and the Quick run starts

#### Scenario: Cancel
- **WHEN** the reader cancels, presses Enter or Escape, or closes the window
- **THEN** nothing is added and no run starts

#### Scenario: Asked twice
- **WHEN** the allow window is open and another page asks again
- **THEN** the open window comes to the front and no second one opens

### Requirement: Only a real click allows
The allowlist SHALL be added to only from the allow window, which is an extension page no script on
github.com can reach. The content script cannot ask the host to add to the allowlist, and Quick,
Thorough, Regenerate and Define start a run only from the reader's own click.

#### Scenario: Scripted click
- **WHEN** a page script clicks Quick, Thorough, Regenerate or Define
- **THEN** no run starts and no allow window opens

#### Scenario: Content script asks the host directly
- **WHEN** the content script sends a request to add to the allowlist
- **THEN** the extension refuses it before it reaches the host
