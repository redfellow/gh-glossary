# send-to-claude Specification

## Purpose

Opens a new Claude Code session in the Claude desktop app with the current pull request or Markdown
document already written into the composer, for the reader to send.

## Requirements

### Requirement: Where it is offered
The panel SHALL offer Send to Claude on every pull request page and on file pages of Markdown
documents (`.md`, `.mdx`, `.markdown`), and nowhere else.

#### Scenario: Issue
- **WHEN** the reader is on an issue
- **THEN** Send to Claude is not offered

#### Scenario: Source file
- **WHEN** the reader is on a `.js` file page
- **THEN** Send to Claude is not offered

### Requirement: The link
Clicking Send to Claude SHALL open a `claude://code/new` link whose `q` is the filled template and
whose `folder`, when one is set for the repository and exists, is that folder. Nothing is sent: the
reader presses Enter in the app.

#### Scenario: Pull request with a folder
- **WHEN** the reader clicks Send to Claude on pull request 12 and a folder is set for the repository
- **THEN** the app opens in that folder with the prompt in the composer, and the panel says so

#### Scenario: No folder
- **WHEN** no folder is set for the repository, or the folder set no longer exists
- **THEN** the link carries no folder and the panel says to pick one in the app or set one in options

### Requirement: Templates
There SHALL be one template for pull requests and one for documents. `{repo}`, `{number}`, `{path}`,
`{ref}` and `{url}` are filled in; any other text in braces is left as written. The defaults name the
item, give its URL, and give the `gh` command that reads it.

#### Scenario: Default pull request template
- **WHEN** the default template is used for pull request 12 of `acme/widgets`
- **THEN** the prompt holds `acme/widgets#12`, the pull request's URL and `gh pr view 12 --repo acme/widgets`

#### Scenario: Other braces
- **WHEN** a template contains `{foo}`
- **THEN** `{foo}` appears unchanged in the prompt

### Requirement: Bad input is refused
A link SHALL NOT be built for a repository name that is not `owner/name`, a pull request number that
is not 1 to 7 digits, a document path that is empty or contains `..`, or a missing ref.

#### Scenario: Path with ..
- **WHEN** the document path contains a `..` segment
- **THEN** no link is built and the panel shows an error

### Requirement: Options
The options page SHALL let the reader edit both templates, reset them to the defaults, and set a
folder per repository as `owner/repo = /absolute/path` lines. A line in another form is reported and
nothing is saved; a folder that does not exist is saved with a warning.

#### Scenario: Malformed line
- **WHEN** the reader saves a folder line without `=`
- **THEN** the page reports the line and saves nothing

#### Scenario: Missing folder
- **WHEN** the reader saves a line whose folder does not exist
- **THEN** it is saved and the page names the repository whose folder is missing

### Requirement: Host status in options
The options page SHALL show whether the host is connected and, when it is, the model and effort of
each operation; when it is not, the reason and the install script to run.

#### Scenario: Connected
- **WHEN** the host answers
- **THEN** the page shows "Connected" with Quick, Thorough and Select models and efforts
