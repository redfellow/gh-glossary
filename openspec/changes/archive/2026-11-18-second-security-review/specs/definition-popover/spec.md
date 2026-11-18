# Spec Delta

## MODIFIED Requirements

### Requirement: Glossary text is shown safely
Everything taken from the glossary SHALL be shown only inside extension pages, escaped. A term's
`link` SHALL be offered only when it is an `https` address without a user name or password, without
its query or fragment, with a path of at most 120 characters (a longer path is dropped), labelled
with the whole address it opens, and opened without a referrer. A linked term id is
looked up only among the glossary's own ids.

#### Scenario: Markup in a definition
- **WHEN** a definition contains `<script>` or an `<img>` tag
- **THEN** it is shown as text and nothing runs or loads

#### Scenario: Non-https link
- **WHEN** a term's `link` starts with `javascript:` or `http://`
- **THEN** no link is offered

#### Scenario: Link with a query
- **WHEN** a term's `link` is `https://example.com/docs?d=secret#x`
- **THEN** the box offers "Open example.com/docs" to `https://example.com/docs`

#### Scenario: Data in a long path
- **WHEN** a term's `link` is `https://docs.attacker.example/` followed by 160 characters
- **THEN** the box offers "Open docs.attacker.example" to `https://docs.attacker.example/`

#### Scenario: Id that is a built-in name
- **WHEN** a definition contains `[[constructor]]` and no term has that id
- **THEN** it is shown as plain text
