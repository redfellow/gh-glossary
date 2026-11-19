# Spec Delta

## MODIFIED Requirements

### Requirement: Each sender gets only the requests it needs
The extension SHALL pass host requests only from its own content script on `https://github.com/`, its
toolbar popup and its own options page. The content script may only read a page's data and a Select
job, for the repository its own tab shows; the popup may also start runs, allow, choose how outside
pages are treated and update gh-glossary (as may the toolbar icon's menu); the options page may read
host status and the allowlist, remove from it, and check that a folder exists.

#### Scenario: Content script removes an allowance
- **WHEN** the content script asks to remove a repository from the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Options page allows
- **WHEN** the options page asks to add to the allowlist
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script reads another repository
- **WHEN** the content script of a tab on `acme/widgets` asks for the glossary of `acme/secret`
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script changes the outside mode
- **WHEN** the content script asks to change how outside pages are treated
- **THEN** the request is refused before it reaches the host

#### Scenario: Content script installs an update
- **WHEN** the content script or the definition frame asks to check for or install an update
- **THEN** the request is refused before it reaches the host
