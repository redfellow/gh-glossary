# Spec Delta

## MODIFIED Requirements

### Requirement: Checked only when the reader uses the extension
The extension SHALL check for an update only when the popup opens or a Define starts from the
context menu, and at most once a day. A ready update SHALL show as a badge on the toolbar icon, a line
in the popup with the commit titles and **Update now**, and **Update GitHub Glossary now** in the icon's
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
