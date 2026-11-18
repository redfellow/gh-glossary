# definition-popover Specification

## Purpose

Shows a term's definition in a box next to the term, lets the reader pin it and follow linked terms,
and says where the definition came from.

## Requirements

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

### Requirement: Click pins the definition
Clicking an underlined term, or clicking inside an unpinned box, SHALL pin the box so it stays open
when the pointer leaves. A pinned box has a close button.

#### Scenario: Click on a term
- **WHEN** the reader clicks an underlined term with no text selected
- **THEN** its definition opens pinned

#### Scenario: Term inside a link
- **WHEN** the reader clicks an underlined term that is part of a link
- **THEN** the link is followed and nothing is pinned

### Requirement: Closing
A pinned box SHALL close on its close button, on Escape, and on a click outside it. An unpinned box
closes when the page scrolls; a pinned box moves with its term.

#### Scenario: Escape
- **WHEN** a definition is pinned and the reader presses Escape
- **THEN** the box closes

#### Scenario: Scroll while pinned
- **WHEN** a definition is pinned and the reader scrolls
- **THEN** the box stays next to its term

### Requirement: Linked terms can be followed
Inside a definition, `[[id]]` and `[[id|label]]` links to known terms, and any other text a known
term's pattern matches, SHALL be clickable. Clicking one pins the box and shows that term, with a
Back button and a trail of the terms visited.

#### Scenario: Following a link
- **WHEN** the reader clicks a linked term inside a definition
- **THEN** the box shows the linked term, a Back button, and a trail such as "first › second"

#### Scenario: Back
- **WHEN** the reader clicks Back
- **THEN** the box shows the previous term

#### Scenario: Link to an unknown id
- **WHEN** a definition contains `[[missing-id|some label]]` and no such term exists
- **THEN** the label is shown as plain text

#### Scenario: The term's own name
- **WHEN** a definition's text contains the term being shown
- **THEN** that occurrence is not made clickable

### Requirement: What the box shows
The box SHALL show the term's name, its category, its layer as "this repo" or "all <owner> repos",
its `where` when present, and its definition with backticks rendered as code and `<br>` as a line
break.

#### Scenario: Org term
- **WHEN** the term's layer is `org` and the repository's owner is `acme`
- **THEN** the box is labelled "all acme repos"

### Requirement: Provenance
The box SHALL show when the term was defined, the page it came from as a link, the commit, the model,
whether it was verified at its source, and the spec version. A term defined by selection is marked
"You asked". A corrected term also shows the revision date and reason.

#### Scenario: Term from another page
- **WHEN** the term was first defined from pull request 12 of the same repository
- **THEN** the box says it is from "PR #12", linked to that pull request

#### Scenario: Corrected term
- **WHEN** a Thorough run corrected the term
- **THEN** the box shows "Revised", the date and the reason

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
