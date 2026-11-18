# Spec Delta

## MODIFIED Requirements

### Requirement: Define a selection
Selecting text on a handled page SHALL offer "Define “…” with gh-glossary" in the context menu.
Choosing it starts a Select run with the selected text, if it is 1 to 120 characters on one line, and
up to 600 characters of the surrounding paragraph or line, on rendered pages and in the source view.
A selection that is already a known term opens its definition instead. Several selections may be
defined one after another without waiting: each starts its own run, the host runs them one at a
time, and a selection whose run has not ended is refused again with "Already defining".

#### Scenario: Selection in a paragraph
- **WHEN** the reader selects "control plane" in a comment and opens the context menu
- **THEN** the menu offers Define “control plane” with gh-glossary

#### Scenario: Selection too long or multi-line
- **WHEN** the selection is over 120 characters or spans lines and the reader chooses the item
- **THEN** no run starts and the tab's tooltip says why

#### Scenario: Selection in a text field
- **WHEN** the selection is inside a comment box and the reader chooses the item
- **THEN** no run starts

#### Scenario: Several selections
- **WHEN** the reader defines "control plane" and, before it is done, "data plane"
- **THEN** both runs start and the tab's tooltip lists both as defining or queued

### Requirement: Select result
A Select run SHALL store one term marked as asked for by the reader. While it runs the tab's dot
pulses, the selected words are marked with a steady highlight, and the popup shows each selection and the seconds elapsed. When it finishes the new
definition opens pinned at the term only if it is the Define the reader asked for last; the others
are just underlined. A result whose pattern cannot be used fails with a message to select a
slightly different span. When the run's state can no longer be read, the popup says so and whether
the selection is defined.

#### Scenario: Done
- **WHEN** a Select run finishes
- **THEN** the term is underlined on the page and its definition is open and pinned

#### Scenario: Progress
- **WHEN** a Select run is going
- **THEN** the popup shows the selection and the seconds elapsed

#### Scenario: Host stopped during the run
- **WHEN** the host stops while a Select run is going
- **THEN** the popup says it lost track of the run, not that the selection was defined

#### Scenario: Only the last one opens
- **WHEN** the reader defines "control plane" and then "data plane", and "control plane" finishes first
- **THEN** "control plane" is underlined without opening, and "data plane" opens pinned when it finishes
