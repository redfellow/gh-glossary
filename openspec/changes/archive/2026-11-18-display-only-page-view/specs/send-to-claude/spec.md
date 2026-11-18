# Spec Delta

## MODIFIED Requirements

### Requirement: Where it is offered
The toolbar popup SHALL offer Send to Claude on every pull request page and on file pages of Markdown
documents (`.md`, `.mdx`, `.markdown`), and nowhere else. Nothing for it is put into GitHub's page.

#### Scenario: Issue
- **WHEN** the popup shows an issue
- **THEN** Send to Claude is not offered

#### Scenario: Source file
- **WHEN** the popup shows a `.js` file page
- **THEN** Send to Claude is not offered
