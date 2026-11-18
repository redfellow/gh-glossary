# Spec Delta

## MODIFIED Requirements

### Requirement: Hover shows the definition
Resting the pointer on an underlined term SHALL open its definition next to the term after a short
delay, in a frame showing an extension page, and moving off the term and the frame SHALL close it
after a short delay. The pointer shows a help cursor over a term and the term is tinted while its
definition is open. The page cannot read the frame or click inside it.

#### Scenario: Hover
- **WHEN** the pointer rests on an underlined term
- **THEN** the definition opens below it, or above it when there is no room below

#### Scenario: Moving into the box
- **WHEN** the pointer moves from the term into the open definition
- **THEN** it stays open

#### Scenario: Source view
- **WHEN** the term is in GitHub's source view, where a transparent layer covers the lines
- **THEN** hovering it still opens the definition

#### Scenario: Page script reads the frame
- **WHEN** a page script looks for the definition's text in the document
- **THEN** it finds none

### Requirement: Glossary text is shown safely
Everything taken from the glossary SHALL be shown only inside extension pages, escaped. A term's
`link` SHALL be offered only when it is an `https` address without a user name or password, labelled
with its host, without its query or fragment, and opened without a referrer. A linked term id is
looked up only among the glossary's own ids.

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
