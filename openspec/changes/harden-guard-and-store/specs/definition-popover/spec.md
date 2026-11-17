# Spec Delta

## MODIFIED Requirements

### Requirement: Glossary text is shown safely
Everything taken from the glossary SHALL be escaped before it is shown. A term's `link` SHALL be
offered only when it is an `https` address without a user name or password, labelled with its host,
without its query or fragment, and opened without a referrer. A linked term id is looked up only among
the glossary's own ids.

#### Scenario: Markup in a definition
- **WHEN** a definition contains `<script>` or an `<img>` tag
- **THEN** it is shown as text and nothing runs or loads

#### Scenario: Non-https link
- **WHEN** a term's `link` starts with `javascript:` or `http://`
- **THEN** no link is offered

#### Scenario: Link with a query
- **WHEN** a term's `link` is `https://example.com/docs?d=secret#x`
- **THEN** the box offers "Open link on example.com" to `https://example.com/docs`

#### Scenario: Id that is a built-in name
- **WHEN** a definition contains `[[constructor]]` and no term has that id
- **THEN** it is shown as plain text
