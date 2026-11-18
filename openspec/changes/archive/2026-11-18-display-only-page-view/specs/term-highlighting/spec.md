# Spec Delta

## MODIFIED Requirements

### Requirement: The page's content is not rewritten
Underlines SHALL be drawn with the CSS Custom Highlight API and a style sheet built by the extension,
without adding, removing or wrapping elements in GitHub's page content. Which term an underline
belongs to is kept by the extension only: a page script can see which words are underlined, but not
their definitions, and underlines it adds or removes do not change what the extension opens.

#### Scenario: Underlining a paragraph
- **WHEN** terms in a paragraph are underlined
- **THEN** the paragraph's elements and text are the same as before

#### Scenario: Highlight added by the page
- **WHEN** a page script registers a highlight over a word that is not a term
- **THEN** pointing at or clicking that word opens nothing

## ADDED Requirements

### Requirement: Nothing in the page starts a run
The extension SHALL add to GitHub's page only the underlines, the tab and the definition frame. None
of them starts a run, allows a repository or opens Claude; the tab only opens the toolbar popup.

#### Scenario: Page script looks for controls
- **WHEN** a page script searches the document for Quick, Thorough, Regenerate or Define buttons
- **THEN** there are none
