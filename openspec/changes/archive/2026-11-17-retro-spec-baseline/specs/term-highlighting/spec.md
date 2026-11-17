# Spec Delta

## Purpose

Underlines the known glossary terms on a handled GitHub page so the reader can see which words have a
definition, without altering GitHub's own page content.

## ADDED Requirements

### Requirement: Where terms are underlined
The extension SHALL underline terms in rendered Markdown on the repository home page, file pages,
issues, discussions and the pull request Conversation view; in source lines on non-Markdown file
pages; and in diff lines on the pull request Files changed view.

#### Scenario: Issue
- **WHEN** an issue's body and comments contain known terms
- **THEN** those terms are underlined in the body and in each comment

#### Scenario: Other pull request tab
- **WHEN** the reader is on a pull request's Commits or Checks tab
- **THEN** nothing is underlined

### Requirement: Code terms and prose terms match differently
A term stored with `code: true` SHALL match case-sensitively on every underlined surface. A term
stored with `code: false` SHALL match case-insensitively and only in rendered Markdown and in diffs
of Markdown files.

#### Scenario: Prose term in a source file
- **WHEN** a `code: false` term's word appears in a line of a source file
- **THEN** it is not underlined

#### Scenario: Prose term in a Markdown diff
- **WHEN** a `code: false` term's word appears in the diff of a `.md` or `.mdx` file
- **THEN** it is underlined

#### Scenario: Code term in different case
- **WHEN** a `code: true` term is `CP` and the text says `cp`
- **THEN** it is not underlined

### Requirement: Matches stay inside one block
A match SHALL NOT run across two paragraphs, list items, table cells, headings, source lines or diff
lines.

#### Scenario: Phrase split across lines
- **WHEN** the two words of a two-word term end one source line and start the next
- **THEN** it is not underlined

### Requirement: Matches do not overlap
Within one block a stretch of text SHALL be underlined for at most one term. Code terms are matched
before prose terms, and an earlier match keeps its text.

#### Scenario: Code term inside a prose phrase
- **WHEN** a code term and a prose term both match overlapping text
- **THEN** the code term is underlined and the prose term is not

### Requirement: Text that is never underlined
Comments in source files, line numbers and diff markers, buttons, text being edited in a comment
form, and the extension's own panel and boxes SHALL NOT be underlined.

#### Scenario: Comment in a source file
- **WHEN** a known term appears inside a code comment on a file page
- **THEN** it is not underlined

#### Scenario: String in a source file
- **WHEN** a known code term appears inside a string literal on a file page
- **THEN** it is underlined

### Requirement: The page's content is not rewritten
Underlines SHALL be drawn without adding, removing or wrapping elements in GitHub's page content.

#### Scenario: Underlining a paragraph
- **WHEN** terms in a paragraph are underlined
- **THEN** the paragraph's elements and text are the same as before

### Requirement: Underlines follow the page
When GitHub adds or changes content after the page has loaded, the extension SHALL underline terms
in the new content shortly afterwards. When the glossary changes, underlines are redrawn.

#### Scenario: Lazily loaded diff
- **WHEN** GitHub loads another file's diff as the reader scrolls
- **THEN** known terms in it become underlined

#### Scenario: New term defined
- **WHEN** a run adds a term that appears on the page
- **THEN** it becomes underlined without a reload

### Requirement: Definitions switch
The reader SHALL be able to turn underlines off and on with the panel's Definitions switch, and the
choice is remembered across pages and browser restarts.

#### Scenario: Switching off
- **WHEN** the reader turns Definitions off
- **THEN** all underlines disappear, any open definition closes, and hovering a term shows nothing
