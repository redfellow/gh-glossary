# Spec Delta

## MODIFIED Requirements

### Requirement: Define a selection
Selecting text on a handled page SHALL offer "Define “…” with GitHub Glossary" in the context menu.
Choosing it starts a Select run with the selected text, if it is 1 to 120 characters on one line, and
up to 600 characters of the surrounding paragraph or line, on rendered pages and in the source view.
A selection that is already a known term opens its definition instead. Several selections may be
defined one after another without waiting: each starts its own run, the host runs them one at a
time, and a selection whose run has not ended is refused again with "Already defining".

#### Scenario: Selection in a paragraph
- **WHEN** the reader selects "control plane" in a comment and opens the context menu
- **THEN** the menu offers Define “control plane” with GitHub Glossary

#### Scenario: Selection too long or multi-line
- **WHEN** the selection is over 120 characters or spans lines and the reader chooses the item
- **THEN** no run starts and a message beside the tab says why

#### Scenario: Selection in a text field
- **WHEN** the selection is inside a comment box and the reader chooses the item
- **THEN** no run starts

#### Scenario: Repository not allowed
- **WHEN** the reader chooses Define on a repository that is not allowed yet
- **THEN** the popup asks, and a message beside the tab says the repository is not allowed and where to answer

#### Scenario: Several selections
- **WHEN** the reader defines "control plane" and, before it is done, "data plane"
- **THEN** both runs start and the tab's tooltip lists both as defining or queued
