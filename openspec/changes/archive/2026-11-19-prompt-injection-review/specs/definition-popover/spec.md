# Spec Delta

## MODIFIED Requirements

### Requirement: Provenance
The box SHALL show when the term was defined, the page it came from as a link, the commit, the model,
whether it was verified at its source, and the spec version. A term defined by selection is marked
"You asked". A corrected term also shows the revision date and reason. While the reader's outside
mode is not off, a term from an outside page is marked "From an outside contributor's page" and its
verification line is not shown.

#### Scenario: Term from another page
- **WHEN** the term was first defined from pull request 12 of the same repository
- **THEN** the box says it is from "PR #12", linked to that pull request

#### Scenario: Corrected term
- **WHEN** a Thorough run corrected the term
- **THEN** the box shows "Revised", the date and the reason

#### Scenario: Term from an outside page
- **WHEN** the mode is "limit writes" and the term came from a fork's pull request
- **THEN** the box says "From an outside contributor's page" and shows neither "Verified at source"
  nor "Not verified at source"

#### Scenario: Mode off
- **WHEN** the mode is off and the term came from a fork's pull request
- **THEN** the box shows it as any other term

### Requirement: Glossary text is shown safely
Everything taken from the glossary SHALL be shown only inside extension pages, escaped. A term's
`link` SHALL be offered only when it is an `https` address on `github.com` under the page's
repository owner, without a user name or password, without its query or fragment, with a path of at
most 120 characters (a longer path is dropped), labelled with the whole address it opens, and opened
without a referrer. A linked term id is looked up only among the glossary's own ids.

#### Scenario: Markup in a definition
- **WHEN** a definition contains `<script>` or an `<img>` tag
- **THEN** it is shown as text and nothing runs or loads

#### Scenario: Non-https link
- **WHEN** a term's `link` starts with `javascript:` or `http://`
- **THEN** no link is offered

#### Scenario: Link with a query
- **WHEN** the page is of `acme/widgets` and a term's `link` is
  `https://github.com/acme/widgets/issues/34?d=secret#x`
- **THEN** the box offers "Open github.com/acme/widgets/issues/34" to
  `https://github.com/acme/widgets/issues/34`

#### Scenario: Data in a long path
- **WHEN** the page is of `acme/widgets` and a term's `link` is `https://github.com/acme/` followed
  by 160 characters
- **THEN** the box offers "Open github.com" to `https://github.com/`

#### Scenario: Link to another site
- **WHEN** a term's `link` is `https://docs.attacker.example/x`
- **THEN** no link is offered

#### Scenario: Id that is a built-in name
- **WHEN** a definition contains `[[constructor]]` and no term has that id
- **THEN** it is shown as plain text
