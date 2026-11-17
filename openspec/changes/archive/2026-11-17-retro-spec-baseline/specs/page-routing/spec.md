# Spec Delta

## Purpose

Decides which GitHub pages the extension handles, how each handled page is keyed for storage and
runs, and how the extension follows GitHub's in-page navigation.

## ADDED Requirements

### Requirement: Handled pages
The extension SHALL handle these pages of a repository: pull request pages, issue pages, discussion
pages, file pages, the repository home page, and the home page of a named branch. Every other page
is not handled.

#### Scenario: Pull request
- **WHEN** the address is `/<owner>/<repo>/pull/12` or any sub-page of it
- **THEN** the page is handled with key `pr-12`

#### Scenario: Issue and discussion
- **WHEN** the address is `/<owner>/<repo>/issues/7` or `/<owner>/<repo>/discussions/3`
- **THEN** the page is handled with key `issue-7` or `discussion-3`

#### Scenario: File
- **WHEN** the address is `/<owner>/<repo>/blob/<ref>/<path>`
- **THEN** the page is handled with key `file:<path>` at that ref

#### Scenario: Repository home
- **WHEN** the address is `/<owner>/<repo>` or `/<owner>/<repo>/tree/<ref>` with a one-segment ref
- **THEN** the page is handled with key `readme`

#### Scenario: Unhandled repository page
- **WHEN** the address is a directory listing, the issue list, or the repository's settings
- **THEN** the page is not handled and the panel is not shown

### Requirement: Pull request views
The extension SHALL tell three views of a pull request apart: Conversation, Files changed, and any
other tab. All three share the pull request's page key.

#### Scenario: Files changed
- **WHEN** the address ends in `/pull/12/files` or `/pull/12/changes`
- **THEN** the view is Files changed

#### Scenario: Other tab
- **WHEN** the address ends in `/pull/12/commits` or `/pull/12/checks`
- **THEN** the view is neither Conversation nor Files changed

### Requirement: GitHub's own pages are not repositories
An address whose first segment is one of GitHub's own sections SHALL NOT be treated as a repository
page.

#### Scenario: Settings and organisations
- **WHEN** the address starts with `/settings`, `/orgs`, `/notifications`, `/marketplace` or the like
- **THEN** the page is not handled

### Requirement: Repository names are checked
The owner SHALL be 1 to 39 letters, digits or hyphens and the repository name 1 to 100 letters,
digits, `_`, `.` or `-`. An address that does not fit is not handled, and the host refuses a
repository, page key or ref that could name a location outside its data folder.

#### Scenario: Odd name in the address
- **WHEN** the owner or repository segment contains other characters
- **THEN** the page is not handled and no request reaches the host

#### Scenario: Path traversal in a page key
- **WHEN** a request carries a file page key with a `..` or `.` path segment
- **THEN** the host answers that the page is bad

### Requirement: Canonical repository spelling
When the page's own metadata names the same repository as the address in different letter case, the
metadata's spelling SHALL be used.

#### Scenario: Address typed in lower case
- **WHEN** the address is `/acme/widgets` and the page metadata says `Acme/Widgets`
- **THEN** the repository is `Acme/Widgets`

#### Scenario: Metadata left from the previous page
- **WHEN** the page metadata still names a different repository than the address
- **THEN** the address's spelling is used

### Requirement: Branch and path of a file address
For a file address the host SHALL find where the ref ends and the path begins by trying the shortest
ref first and accepting the first one that names a commit in the repository.

#### Scenario: Branch name with a slash
- **WHEN** the address is `/blob/feature/login/src/app.js`, `feature` is not a ref and `feature/login` is
- **THEN** the ref is `feature/login` and the path is `src/app.js`

#### Scenario: No ref found
- **WHEN** no leading part of the address names a commit
- **THEN** the request fails with a message that the branch cannot be told from the path

### Requirement: Navigation is followed
The extension SHALL notice when GitHub changes the address without a page load. On a change to a
different handled page it closes any open definition and allow prompt and loads that page's data; on
a change to an unhandled page it removes underlines and hides the panel.

#### Scenario: From one pull request to another
- **WHEN** the reader follows a link from pull request 12 to pull request 13
- **THEN** the panel shows pull request 13's data without a reload

#### Scenario: To an unhandled page
- **WHEN** the reader moves from a file page to a directory listing
- **THEN** underlines are removed and the panel is hidden

### Requirement: Pull request number in the tab title
On every pull request page the tab title SHALL start with `#<number>` followed by a space, once.

#### Scenario: Title set by GitHub
- **WHEN** GitHub sets the title of pull request 12 to "Add login by octocat"
- **THEN** the title becomes "#12 Add login by octocat"

#### Scenario: Moving to another pull request
- **WHEN** the reader moves from pull request 12 to pull request 13
- **THEN** the title starts with `#13` and not `#12`

#### Scenario: Other pages
- **WHEN** the page is an issue or a file
- **THEN** the title is left as GitHub set it
