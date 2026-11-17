# Spec Delta

## MODIFIED Requirements

### Requirement: Navigation is followed
The extension SHALL notice when GitHub changes the address without a page load. On a change to a
different handled page it closes any open definition and loads that page's data; on a change to an
unhandled page it removes underlines and hides the tab. The popup and the context menu take the page
from the tab's address as Chrome reports it, and name the repository before anything starts.

#### Scenario: From one pull request to another
- **WHEN** the reader follows a link from pull request 12 to pull request 13
- **THEN** the tab and the popup show pull request 13's data without a reload

#### Scenario: To an unhandled page
- **WHEN** the reader moves from a file page to a directory listing
- **THEN** underlines are removed and the tab is hidden
