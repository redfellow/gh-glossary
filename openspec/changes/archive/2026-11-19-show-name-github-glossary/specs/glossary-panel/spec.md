# Spec Delta

## ADDED Requirements

### Requirement: The name readers see
Everywhere a reader sees the extension, it SHALL be called "GitHub Glossary": the browser's extension
list and toolbar button, the toolbar popup, the tab, the definition frame's title, the context menu,
the options page, and messages shown to the reader. The repository, its folder and the install
commands keep the name gh-glossary, and messages that name the folder use that name.

#### Scenario: Toolbar popup
- **WHEN** the reader opens the toolbar popup
- **THEN** its heading says GitHub Glossary

#### Scenario: Message that names the folder
- **WHEN** the popup says the host is not reachable
- **THEN** it says "The GitHub Glossary host is not reachable" and tells the reader to run the install script from the gh-glossary folder

## MODIFIED Requirements

### Requirement: The tab
The tab SHALL show the name GitHub Glossary, the number of known terms when there are any, and a dot:
blue and pulsing while a run for this page or a selection is going, red after an error. The count is
struck through when Definitions is off. The tab holds no other controls.

#### Scenario: Run in progress
- **WHEN** a Quick run for the page is queued or running
- **THEN** the tab shows a pulsing blue dot

#### Scenario: Run failed
- **WHEN** the page's last run failed
- **THEN** the tab shows a red dot

### Requirement: Moving the tab
The reader SHALL be able to drag the tab along its edge, and dragging it across the middle of the
screen moves it to the other edge. The position is remembered. The whole tab stays inside the window,
whatever its height.

#### Scenario: Drag across
- **WHEN** the reader drags the tab from the right half of the screen to the left half
- **THEN** the tab sits on the left edge

#### Scenario: Dragged to the bottom
- **WHEN** the reader drags the tab past the bottom of the window
- **THEN** the tab's lower end stays at the bottom edge of the window
