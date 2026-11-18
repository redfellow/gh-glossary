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
