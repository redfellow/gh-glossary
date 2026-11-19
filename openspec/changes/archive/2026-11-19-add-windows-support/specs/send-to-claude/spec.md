# Spec Delta

## MODIFIED Requirements

### Requirement: Options
The options page SHALL let the reader edit both templates, reset them to the defaults, and set a
folder per repository as `owner/repo = /absolute/path` lines, where the path may also be a Windows
absolute path (`C:\code\repo` or `\\server\share\repo`). A line in another form is reported and
nothing is saved; a folder that does not exist is saved with a warning.

#### Scenario: Malformed line
- **WHEN** the reader saves a folder line without `=`
- **THEN** the page reports the line and saves nothing

#### Scenario: Missing folder
- **WHEN** the reader saves a line whose folder does not exist
- **THEN** it is saved and the page names the repository whose folder is missing

#### Scenario: Windows folder
- **WHEN** the reader saves `acme/widgets = C:\code\widgets`
- **THEN** the line is accepted and Send to Claude opens the app in that folder

#### Scenario: Relative Windows path
- **WHEN** the reader saves `acme/widgets = code\widgets` or `acme/widgets = C:widgets`
- **THEN** the page reports the line and saves nothing
