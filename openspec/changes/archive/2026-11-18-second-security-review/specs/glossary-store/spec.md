# Spec Delta

## MODIFIED Requirements

### Requirement: Patterns are checked before saving
The host SHALL drop, and log, any term or correction whose pattern is not a valid regular expression,
contains a capturing group, can match an empty string, repeats a group with `*`, `+` or `{}`, uses a
backreference, has more than two repeats (`*`, `+`, `{n,m}`), has two repeats not separated by a
plain character outside any group, has more than six optional parts (`?`) or groups with `|` in one
top-level alternative (four when it also has a repeat), takes over 50 ms on a short text made of its
own characters, or is over 500 characters. A stored term whose pattern fails these
checks is not given to pages or runs. No other rule of the `term-definition` spec is checked by the
host.

#### Scenario: Capturing group
- **WHEN** a run returns a term with pattern `\b(foo|bar)\b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Repeated group
- **WHEN** a run returns a term with pattern `\b(?:a+)+b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Repeats that meet
- **WHEN** a run returns a term with pattern `\w*\w*#`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Matches nothing visible
- **WHEN** a run returns a term with pattern `\b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Stored before the check
- **WHEN** a glossary file holds a term with pattern `\b(?:a+)+b`
- **THEN** pages are given the glossary without it

#### Scenario: Missing where
- **WHEN** a run returns a `code` term without `where`
- **THEN** the term is saved

#### Scenario: Chain of optional parts
- **WHEN** a run returns a term with pattern `.?` twenty-two times followed by `§`
- **THEN** the term is not saved and the run's log says why

## ADDED Requirements

### Requirement: What one run may save is capped
A run SHALL save at most 200 terms and 200 corrections. A term whose `id` is over 100 characters,
`term` over 200, `def` over 4000, `where` over 500 or `link` over 500 SHALL be dropped and logged.

#### Scenario: Too many terms
- **WHEN** a run returns 205 terms
- **THEN** the first 200 are saved and the log says 5 were dropped
