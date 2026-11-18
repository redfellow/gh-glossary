# Spec Delta

## MODIFIED Requirements

### Requirement: What one run may save is capped
A run SHALL save at most 200 terms and 200 corrections. A term whose `id` is over 100 characters,
`term` over 200, `def` over 4000, `where` over 500 or `link` over 500 SHALL be dropped and logged,
and so SHALL a correction whose `id` is over 100 characters or whose `reason` is over 300. Only the
fields the `term-definition` spec names are saved from a term; any other field a run returns is left
out.

#### Scenario: Too many terms
- **WHEN** a run returns 205 terms
- **THEN** the first 200 are saved and the log says 5 were dropped

#### Scenario: Long reason
- **WHEN** a Thorough run returns a correction whose reason is 2000 characters long
- **THEN** the correction is dropped and the log says why

#### Scenario: Field the spec does not name
- **WHEN** a page run returns a term that also carries `selected: true`
- **THEN** the term is saved without that field, and Regenerate of its page removes it

## ADDED Requirements

### Requirement: A link stays on GitHub under the owner
A term's `link` SHALL be saved, and given to pages, only when it is an `https` address on
`github.com` whose path starts with the repository's owner. Any other link is left out and logged;
the term itself is kept.

#### Scenario: Issue of the repository
- **WHEN** a run on `acme/widgets` returns a term with link `https://github.com/acme/widgets/issues/34`
- **THEN** the term is saved with its link

#### Scenario: Another site
- **WHEN** a run returns a term with link `https://docs.attacker.example/x`
- **THEN** the term is saved without a link and the log says why

#### Scenario: Another owner on GitHub
- **WHEN** a run on `acme/widgets` returns a term with link `https://github.com/someone-else/notes`
- **THEN** the term is saved without a link

#### Scenario: Stored before the rule
- **WHEN** a glossary file holds a term with link `https://www.rfc-editor.org/rfc/rfc9728`
- **THEN** pages are given the term without its link, and the file is unchanged
