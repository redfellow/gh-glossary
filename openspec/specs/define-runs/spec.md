# define-runs Specification

## Purpose

Starts, queues, tracks and records the runs that write definitions: Quick and Thorough for a whole
page, Select for one selection, and Regenerate to redo a page.

## Requirements

### Requirement: Page runs
The reader SHALL be able to start a Quick or a Thorough run for the current handled page. The run
follows the `term-definition` spec and that operation's skill, and returns its terms as structured
output.

#### Scenario: Quick on a pull request
- **WHEN** the reader clicks Quick on pull request 12 of an allowed repository
- **THEN** a Quick run for `pr-12` is accepted and the panel shows it queued or running

#### Scenario: Unknown mode
- **WHEN** a page run is requested with a mode other than quick or thorough
- **THEN** the request is refused

### Requirement: The code a run reads
A run SHALL work in a checkout of the code the page shows: the pull request's head for a pull
request, the page's ref for a file or branch home page, and the default branch otherwise. Stored
terms record that commit.

#### Scenario: Pull request
- **WHEN** a run starts for pull request 12
- **THEN** the checkout is at the pull request's head commit

#### Scenario: Issue
- **WHEN** a run starts for an issue
- **THEN** the checkout is at the default branch's latest commit

### Requirement: What a run is given
A run SHALL be given the page's content and the existing glossary. For a pull request that is its
title, description, comments, reviews and diff; for an issue or discussion its body and comments; for
a file or home page the file in the checkout. Thorough gets existing definitions in full; Quick and
Select get ids, names, layers and patterns.

#### Scenario: Discussion
- **WHEN** a run starts for a discussion
- **THEN** it is given the discussion's title, body, comments and replies

### Requirement: One run at a time
The host SHALL run one run at a time and queue the rest in the order they were started. Starting a
run that is already queued or running for the same page returns that run.

#### Scenario: Second page while one is running
- **WHEN** a Thorough run is going and the reader starts Quick on another page
- **THEN** the second run is queued and starts when the first ends

#### Scenario: Same page twice
- **WHEN** the reader starts a run for a page that already has one queued or running
- **THEN** no second run is created

### Requirement: Model, effort and limits
Each operation SHALL use the model and effort configured for it, defaulting to sonnet at medium for
Quick and Select and opus at high for Thorough. A run is stopped after the configured number of
minutes, 30 by default, and an optional spend limit per run can be set.

#### Scenario: Time limit
- **WHEN** a run is still going after the configured minutes
- **THEN** it is stopped and reported as failed

#### Scenario: Changed configuration
- **WHEN** the reader edits the configuration file
- **THEN** the new values apply after the extension is reloaded

### Requirement: Run status
The extension SHALL be able to ask for a run's state: queued, running, done or failed with the
reason. The panel refreshes while a page run is going. A finished run is forgotten ten minutes
later; a failed run is reported until the page is run again.

#### Scenario: Failure
- **WHEN** a run returns no structured result
- **THEN** its state is failed and the panel shows the reason

### Requirement: Page run record
After a page run the host SHALL record for that page: when it ran, the mode, model, commit, number of
terms added and corrected, cost when known, duration, and the spec version.

#### Scenario: After Thorough
- **WHEN** a Thorough run adds 9 terms and corrects 2
- **THEN** the page's record says 9 added and 2 corrected, and the panel shows it

### Requirement: Regenerate
With Regenerate ticked, a page run SHALL define the page as if its own terms did not exist, and
replace them only when the run succeeds: the stored terms whose origin is this page are then removed,
in both layers, and the run's terms saved. A failed run leaves the stored terms as they were. Terms
the reader defined by selection on this page are kept.

#### Scenario: Regenerate succeeds
- **WHEN** the reader ticks Regenerate and clicks Quick, and the run succeeds
- **THEN** the page's earlier terms are removed and the run's terms replace them

#### Scenario: Regenerate fails
- **WHEN** the run fails or is stopped
- **THEN** the page's earlier terms are still stored and shown

#### Scenario: Terms are shown during the run
- **WHEN** a regenerating run is queued or running
- **THEN** the page's earlier terms are still underlined

#### Scenario: Selected term on the page
- **WHEN** the page has a term the reader defined by selection, and the reader regenerates the page
- **THEN** that term is kept unchanged

### Requirement: Define a selection
Selecting 1 to 120 characters on one line of a handled page SHALL offer a Define button next to the
selection. Clicking it starts a Select run with the selected text and up to 600 characters of the
surrounding paragraph or line, on rendered pages and in the source view.

#### Scenario: Selection in a paragraph
- **WHEN** the reader selects "control plane" in a comment
- **THEN** a button labelled Define “control plane” appears next to it

#### Scenario: Selection too long or multi-line
- **WHEN** the selection is over 120 characters or spans lines
- **THEN** no button appears

#### Scenario: Selection in a text field
- **WHEN** the selection is inside a comment box or the extension's own panel
- **THEN** no button appears

### Requirement: Selection already defined
When a known term's pattern matches the whole selection, the button SHALL say Show and open that
term's definition pinned, without a run.

#### Scenario: Known term selected
- **WHEN** the reader selects text a glossary pattern fully matches
- **THEN** the button reads Show “…” and clicking it opens the definition

### Requirement: Select result
A Select run SHALL store one term marked as asked for by the reader. When it finishes the panel says
so with the time taken, and the new definition opens pinned at the term. A result whose pattern
cannot be used fails with a message to select a slightly different span.

#### Scenario: Done
- **WHEN** a Select run finishes
- **THEN** the term is underlined on the page and its definition is open and pinned

#### Scenario: Progress
- **WHEN** a Select run is going
- **THEN** the panel shows the selection and the seconds elapsed

### Requirement: Select runs are keyed by page and selected text
A Select run SHALL be identified by the repository, the page and the whole selected text. The same
selection made again while its run is queued or running returns that run; a different selection gets
its own run.

#### Scenario: Same selection twice
- **WHEN** a Select run is going and the reader starts another for the same text on the same page
- **THEN** the first run is returned and no second run starts

#### Scenario: Different selections with a shared start
- **WHEN** a Select run is going and the reader selects different text that begins with the same 30 bytes
- **THEN** a second run is queued for the new selection

### Requirement: Runs end with the host
A run SHALL be stopped when the host stops, which happens when the browser quits or the extension is
reloaded. A stopped run is lost and not resumed.

#### Scenario: Browser quits mid-run
- **WHEN** the browser quits while a Thorough run is going
- **THEN** the run is stopped and nothing from it is stored

### Requirement: Run logs
The host SHALL keep a log and the raw result of every run, and a log of its own activity, on the
reader's machine.

#### Scenario: Failed run
- **WHEN** a run fails
- **THEN** its log holds the error and the run's state names the log
