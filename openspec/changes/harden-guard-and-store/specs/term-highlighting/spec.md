# Spec Delta

## MODIFIED Requirements

### Requirement: Underlines follow the page
When GitHub adds or changes content after the page has loaded, the extension SHALL underline terms
in the new content shortly afterwards. When any stored term changes, underlines and definitions are
redrawn. A term whose pattern matches an empty string on the page is left out, so it cannot hide
other terms.

#### Scenario: Lazily loaded diff
- **WHEN** GitHub loads another file's diff as the reader scrolls
- **THEN** known terms in it become underlined

#### Scenario: New term defined
- **WHEN** a run adds a term that appears on the page
- **THEN** it becomes underlined without a reload

#### Scenario: Correction only
- **WHEN** a Thorough run corrects definitions and adds no term
- **THEN** the corrected definitions are shown without a reload

#### Scenario: Term that matches nothing visible
- **WHEN** a stored term's pattern matches an empty string in the page's text
- **THEN** that term is not underlined and every other term still is
