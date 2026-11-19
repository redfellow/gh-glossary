# Spec Delta

## Purpose

Tells apart the pages and comments written by people without write access to a repository, and lets
the reader choose how far their text may shape the glossary.

## ADDED Requirements

### Requirement: Which pages are outside
A pull request from a fork, and a pull request, issue or discussion opened by someone who is not an
owner, member or collaborator of the repository, SHALL be an outside page. So SHALL a file or home
page addressed by a commit that is not on the default branch. When GitHub does not say who opened a
page, the page is outside. Every saved term records whether its page was outside, in every mode.

#### Scenario: Fork's pull request
- **WHEN** a run starts for a pull request whose head is in a fork
- **THEN** the page is outside

#### Scenario: Issue by a first-time contributor
- **WHEN** a run starts for an issue opened by someone with no role in the repository
- **THEN** the page is outside

#### Scenario: Member's pull request
- **WHEN** a run starts for a pull request a member opened from a branch of the repository
- **THEN** the page is not outside

#### Scenario: File at a fork's commit
- **WHEN** a run starts for a file page addressed by a commit id that the default branch does not
  contain
- **THEN** the page is outside

#### Scenario: File on a branch
- **WHEN** a run starts for a file page addressed by a branch or tag name
- **THEN** the page is not outside

### Requirement: The reader chooses how outside pages are treated
The reader SHALL choose one of three modes in the toolbar popup: off, limit writes, or outside pages.
The choice is kept in the host's configuration, applies to every repository, and is off until the
reader changes it. Only the popup can change it.

#### Scenario: Never chosen
- **WHEN** the reader has not chosen a mode
- **THEN** the mode is off, and runs and pages behave as they did before modes existed

#### Scenario: Chosen
- **WHEN** the reader picks "Outside pages" in the popup and restarts the browser
- **THEN** the popup still shows "Outside pages"

#### Scenario: Page script
- **WHEN** a script on github.com, or the content script, asks to change the mode
- **THEN** the mode is unchanged

### Requirement: Limit writes
In the limit writes and outside pages modes, a run on an outside page SHALL NOT replace a stored term
first defined from another page, SHALL NOT apply corrections, and SHALL save an owner-layer term in
the repository's glossary instead. What it may not save is dropped and logged.

#### Scenario: Id of a term from another page
- **WHEN** a run on a fork's pull request returns a term whose id is stored with another page as its
  origin
- **THEN** the stored term is unchanged and the log says the new one was dropped

#### Scenario: Correction
- **WHEN** a Thorough run on a fork's pull request returns a correction
- **THEN** the correction is dropped and logged

#### Scenario: Owner term
- **WHEN** the whole owner is allowed and a run on a fork's pull request returns a term with layer
  `org`
- **THEN** the term is saved in the repository's glossary

#### Scenario: The page's own earlier term
- **WHEN** a run on a fork's pull request returns a term whose id that same page defined before
- **THEN** the new term replaces it

#### Scenario: Mode off
- **WHEN** the mode is off and a run on a fork's pull request returns a term whose id is stored from
  another page
- **THEN** the new term replaces the stored one

### Requirement: Outside terms stay on their page
In the outside pages mode, a term from an outside page SHALL be given only to that page and to runs
on that page. In the other modes it is given to every page, as any term is.

#### Scenario: Another page
- **WHEN** the mode is "outside pages" and pull request 12, from a fork, defined "relay queue"
- **THEN** "relay queue" is not underlined on issue 3 because of that term

#### Scenario: Its own page
- **WHEN** the mode is "outside pages" and the reader opens pull request 12, conversation or files
- **THEN** its terms are underlined there

#### Scenario: Mode changed back
- **WHEN** the reader changes the mode from "outside pages" to off
- **THEN** the terms from outside pages are given to every page again

### Requirement: Outsiders' comments are left out
In the outside pages mode, comments, reviews and replies written by someone who is not an owner,
member or collaborator SHALL be left out of what a run on any page is given. The page's run record
SHALL say how many were left out, and the popup SHALL show that number.

#### Scenario: Outsider's comment on a member's pull request
- **WHEN** the mode is "outside pages" and a member's pull request has two comments by people with
  no role in the repository
- **THEN** the run is given the page without those two comments, the page is not outside, and the
  popup says two comments by outside contributors were not read

#### Scenario: Member's comment
- **WHEN** the mode is "outside pages" and a comment was written by a collaborator
- **THEN** the run is given the comment

#### Scenario: Other modes
- **WHEN** the mode is off or "limit writes"
- **THEN** every comment is given to the run
