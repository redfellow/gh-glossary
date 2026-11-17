# Spec Delta

## MODIFIED Requirements

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
