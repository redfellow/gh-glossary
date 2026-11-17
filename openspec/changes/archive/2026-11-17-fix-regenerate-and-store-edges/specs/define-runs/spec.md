# Spec Delta

## MODIFIED Requirements

### Requirement: Regenerate
With Regenerate ticked, a page run SHALL define the page as if its own terms did not exist, and
replace them only when the run succeeds: the stored terms whose origin is this page are then removed,
in both layers, and the run's terms saved. A failed run leaves the stored terms as they were. Terms
the reader defined by selection on this page are kept.

#### Scenario: Regenerate succeeds
- **WHEN** the reader ticks Regenerate and clicks Quick, and the run succeeds
- **THEN** the page's earlier terms are removed and the run's terms replace them

#### Scenario: Regenerate fails
- **WHEN** the run fails or is stopped
- **THEN** the page's earlier terms are still stored and shown

#### Scenario: Terms are shown during the run
- **WHEN** a regenerating run is queued or running
- **THEN** the page's earlier terms are still underlined

#### Scenario: Selected term on the page
- **WHEN** the page has a term the reader defined by selection, and the reader regenerates the page
- **THEN** that term is kept unchanged

## ADDED Requirements

### Requirement: Select runs are keyed by page and selected text
A Select run SHALL be identified by the repository, the page and the whole selected text. The same
selection made again while its run is queued or running returns that run; a different selection gets
its own run.

#### Scenario: Same selection twice
- **WHEN** a Select run is going and the reader starts another for the same text on the same page
- **THEN** the first run is returned and no second run starts

#### Scenario: Different selections with a shared start
- **WHEN** a Select run is going and the reader selects different text that begins with the same 30 bytes
- **THEN** a second run is queued for the new selection

## REMOVED Requirements

### Requirement: Select runs are keyed by page and start of text
**Reason**: Two different selections that shared their first 30 bytes were treated as one run, so the
second was never defined.
**Migration**: None. Replaced by "Select runs are keyed by page and selected text".
