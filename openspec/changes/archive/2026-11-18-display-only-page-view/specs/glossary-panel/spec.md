# Spec Delta

## MODIFIED Requirements

### Requirement: Shown on handled pages only
The tab SHALL be shown on every handled page and hidden on every other page. The toolbar popup says
on an unhandled page that the page is not handled.

#### Scenario: Unhandled page
- **WHEN** the reader moves to a page that is not handled
- **THEN** the tab is hidden and stays hidden when the window is resized

### Requirement: Starts as a tab on the right edge
The tab SHALL start on the right edge near the top the first time the extension runs. After that the
edge and height the reader dragged it to are kept.

#### Scenario: Fresh install
- **WHEN** the extension runs for the first time
- **THEN** the tab is on the right edge near the top

#### Scenario: Reader opened it earlier
- **WHEN** the reader opened the popup on an earlier page
- **THEN** the next page shows the tab; the popup opens only when the reader clicks

#### Scenario: Reader moved it earlier
- **WHEN** the reader dragged the tab to the left edge on an earlier page
- **THEN** it is on the left edge on the next page

### Requirement: The tab
The tab SHALL show the name, the number of known terms when there are any, and a dot: blue and
pulsing while a run for this page or a selection is going, red after an error. The count is struck
through when Definitions is off. The tab holds no other controls.

#### Scenario: Run in progress
- **WHEN** a Quick run for the page is queued or running
- **THEN** the tab shows a pulsing blue dot

#### Scenario: Run failed
- **WHEN** the page's last run failed
- **THEN** the tab shows a red dot

### Requirement: Controls
The toolbar popup SHALL name the repository and page, and offer the Definitions switch with the
number of known terms, Quick and Thorough buttons, a Regenerate box, and Send to Claude where that is
offered. Quick and Thorough are disabled while the page's data is loading or a run for the page is
going; Regenerate is disabled until the page has been defined once.

#### Scenario: Run going
- **WHEN** a run for the page is queued or running
- **THEN** Quick and Thorough are disabled

#### Scenario: Duration hints
- **WHEN** the reader hovers Quick or Thorough
- **THEN** the hint names the model and effort and says "usually under a minute" for Quick and "about 5 min" for Thorough

### Requirement: Status lines
The toolbar popup SHALL say, for the page: that a run is queued or running and for how long; that the
last run failed and why; or the number of terms from this page with the date, model and duration of
the last run and the number corrected. A page never defined says so and gives the number of terms
known for the repository. The tab's tooltip repeats these lines.

#### Scenario: Never defined
- **WHEN** the page has no run on record and the repository has 14 known terms
- **THEN** the popup says the page has not been defined yet and that 14 terms are known

#### Scenario: Not allowed yet
- **WHEN** the repository is not on the allowlist
- **THEN** the popup says that Quick or Thorough will ask first

### Requirement: Host not reachable
When the host cannot be reached, the popup SHALL say so, name the install script to run, and offer no
page data, and the tab shows a red dot. When the extension was reloaded under an open page, the popup
tells the reader to reload the page.

#### Scenario: Host not installed
- **WHEN** the host is not registered
- **THEN** the popup says the host is not reachable and to run `host/install.sh`

## REMOVED Requirements

### Requirement: Hover pops the panel out of the tab
**Reason**: There is no panel in the page; its controls are in the toolbar popup, which only the reader's click opens.
**Migration**: Click the tab or the toolbar icon.

### Requirement: Opening and docking
**Reason**: The page always shows the tab; the open panel is the toolbar popup.
**Migration**: Click the tab or the toolbar icon.

### Requirement: Open panel position and size
**Reason**: Chrome places the toolbar popup.
**Migration**: None.

## ADDED Requirements

### Requirement: The tab opens the controls
The reader's click on the tab without dragging SHALL open the toolbar popup. A click made by a page
script opens nothing.

#### Scenario: Click
- **WHEN** the reader clicks the tab
- **THEN** the toolbar popup opens for this page

#### Scenario: Scripted click
- **WHEN** a page script dispatches a click on the tab
- **THEN** nothing opens
