# Spec Delta

## MODIFIED Requirements

### Requirement: Select result
A Select run SHALL store one term marked as asked for by the reader. When it finishes the panel says
so with the time taken, and the new definition opens pinned at the term. A result whose pattern
cannot be used fails with a message to select a slightly different span. When the panel can no longer
get the run's state, it says so and whether the selection is defined.

#### Scenario: Done
- **WHEN** a Select run finishes
- **THEN** the term is underlined on the page and its definition is open and pinned

#### Scenario: Progress
- **WHEN** a Select run is going
- **THEN** the panel shows the selection and the seconds elapsed

#### Scenario: Host stopped during the run
- **WHEN** the host stops while a Select run is going
- **THEN** the panel says it lost track of the run, not that the selection was defined
