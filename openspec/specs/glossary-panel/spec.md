# glossary-panel Specification

## Purpose

Gives the reader one place on every handled page to see the glossary's state and start runs: a panel
that can be open, collapsed, or docked to a screen edge as a small tab.

## Requirements

### Requirement: Shown on handled pages only
The panel SHALL be shown on every handled page and hidden on every other page.

#### Scenario: Unhandled page
- **WHEN** the reader moves to a page that is not handled
- **THEN** the panel is hidden and stays hidden when the window is resized

### Requirement: Starts as a tab on the right edge
The first time the extension runs, the panel SHALL be docked as a tab on the right edge. After that
the reader's last choice, docked or open, is kept.

#### Scenario: Fresh install
- **WHEN** the extension runs for the first time
- **THEN** the panel is a tab on the right edge near the top

#### Scenario: Reader opened it earlier
- **WHEN** the reader opened the panel on an earlier page
- **THEN** it is open on the next page

### Requirement: The tab
The docked tab SHALL show the name, the number of known terms when there are any, and a dot: blue and
pulsing while a run for this page or a selection is going, red after an error. The count is struck
through when Definitions is off.

#### Scenario: Run in progress
- **WHEN** a Quick run for the page is queued or running
- **THEN** the tab shows a pulsing blue dot

#### Scenario: Run failed
- **WHEN** the page's last run failed
- **THEN** the tab shows a red dot

### Requirement: Hover pops the panel out of the tab
Moving the pointer onto the tab SHALL show the full panel flush to that edge and kept on the screen.
It folds back shortly after the pointer leaves, unless a control inside it has focus or the allow
prompt is open. Nothing about the pop-out is stored.

#### Scenario: Leave
- **WHEN** the pointer leaves the popped-out panel and nothing in it has focus
- **THEN** it folds back to the tab after about a third of a second

#### Scenario: Back before it folds
- **WHEN** the pointer returns while the panel is folding
- **THEN** it opens again

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion
- **THEN** the panel appears and folds without animation

### Requirement: Opening and docking
Clicking the tab SHALL open the panel and keep it open. The Docked switch, or dragging the open panel
until the pointer touches a screen edge, SHALL dock it to the nearer edge. Turning the Docked switch
off while the panel is popped out keeps it open where it is.

#### Scenario: Click right after arriving
- **WHEN** the reader presses the tab within 0.4 seconds of the pointer arriving
- **THEN** it counts as a click on the tab and the panel opens

#### Scenario: Drag to the edge
- **WHEN** the reader drags the open panel and lets go with the pointer at the left edge
- **THEN** the panel docks as a tab on the left

### Requirement: Moving the tab
The reader SHALL be able to drag the tab along its edge, and dragging it across the middle of the
screen moves it to the other edge. The position is remembered.

#### Scenario: Drag across
- **WHEN** the reader drags the tab from the right half of the screen to the left half
- **THEN** the tab sits on the left edge

### Requirement: Open panel position and size
The reader SHALL be able to move the open panel by its title row, resize it, and collapse it to its
title row. Position, size and the collapsed state are remembered, and the panel is kept on the
screen. A collapsed panel still shows in full while popped out of the tab.

#### Scenario: Reopen after a restart
- **WHEN** the reader moved and resized the panel and later restarts the browser
- **THEN** the open panel has the same position and size

### Requirement: Controls
The open panel SHALL offer the Definitions switch with the number of known terms, the Docked switch,
Quick and Thorough buttons, a Regenerate box, and Send to Claude where that is offered. Quick and
Thorough are disabled while the page's data is loading or a run for the page is going; Regenerate is
disabled until the page has been defined once.

#### Scenario: Run going
- **WHEN** a run for the page is queued or running
- **THEN** Quick and Thorough are disabled

#### Scenario: Duration hints
- **WHEN** the reader hovers Quick or Thorough
- **THEN** the hint names the model and effort and says "usually under a minute" for Quick and "about 5 min" for Thorough

### Requirement: Status lines
The panel SHALL say, for the page: that a run is queued or running and for how long; that the last
run failed and why; or the number of terms from this page with the date, model and duration of the
last run and the number corrected. A page never defined says so and gives the number of terms known
for the repository.

#### Scenario: Never defined
- **WHEN** the page has no run on record and the repository has 14 known terms
- **THEN** the panel says the page has not been defined yet and that 14 terms are known

#### Scenario: Not allowed yet
- **WHEN** the repository is not on the allowlist
- **THEN** the panel says that Quick or Thorough will ask first

### Requirement: Host not reachable
When the host cannot be reached, the panel SHALL say so, name the install script to run, and offer
no page data. When the extension was reloaded under an open page, it tells the reader to reload the
page.

#### Scenario: Host not installed
- **WHEN** the host is not registered
- **THEN** the panel says the host is not reachable and to run `host/install.sh`
