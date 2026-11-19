# Spec Delta

## MODIFIED Requirements

### Requirement: Controls
The toolbar popup SHALL name the repository and page, and offer the Definitions switch with the
number of known terms, Quick and Thorough buttons, a Regenerate box, and Send to Claude where that is
offered. When an update of gh-glossary is ready it SHALL also show the update's commit titles and
**Update now**, on any page. Quick and Thorough are disabled while the page's data is loading or a
run for the page is going; Regenerate is disabled until the page has been defined once.

#### Scenario: Run going
- **WHEN** a run for the page is queued or running
- **THEN** Quick and Thorough are disabled

#### Scenario: Duration hints
- **WHEN** the reader hovers Quick or Thorough
- **THEN** the hint names the model and effort and says "usually under a minute" for Quick and "about 5 min" for Thorough

#### Scenario: Update ready
- **WHEN** an update is ready and the popup opens on a page gh-glossary does not handle
- **THEN** the popup shows the update's commit titles and Update now
