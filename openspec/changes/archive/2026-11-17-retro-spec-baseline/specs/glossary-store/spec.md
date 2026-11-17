# Spec Delta

## Purpose

Keeps definitions on the reader's machine in two layers, one per repository and one per owner, and
decides what is saved from a run and what a page sees.

## ADDED Requirements

### Requirement: Two layers on disk
Terms SHALL be stored locally in a repository glossary, one per repository, and an owner glossary,
one per owner, shared by all of that owner's repositories. Nothing is stored anywhere else.

#### Scenario: Org term from one repository
- **WHEN** a run on `acme/widgets` returns a term with layer `org`
- **THEN** it is saved in `acme`'s owner glossary and is seen on pages of `acme/gadgets` too

### Requirement: The repository's meaning wins
A page SHALL be given the owner's terms and the repository's terms together. When both layers hold
the same id, the repository's term is the one given.

#### Scenario: Same id in both layers
- **WHEN** `acme`'s owner glossary and `acme/widgets` both hold a term with id `relay`
- **THEN** pages of `acme/widgets` show the repository's definition

### Requirement: Reusing an id replaces the term in its layer
Saving a term whose id already exists in the same layer SHALL replace it. A copy with that id in the
other layer is left as it is.

#### Scenario: Redefined in the same layer
- **WHEN** a run returns a `repo` term whose id is already in the repository glossary
- **THEN** the new term replaces the old one

#### Scenario: Redefined in the other layer
- **WHEN** a run returns an `org` term whose id is already in the repository glossary
- **THEN** both copies exist and the repository's older copy is the one shown

### Requirement: Patterns are checked before saving
The host SHALL drop, and log, any term or correction whose pattern is not a valid regular expression,
contains a capturing group, or matches the empty string. No other rule of the `term-definition` spec
is checked by the host.

#### Scenario: Capturing group
- **WHEN** a run returns a term with pattern `\b(foo|bar)\b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Missing where
- **WHEN** a run returns a `code` term without `where`
- **THEN** the term is saved

### Requirement: What the host adds to a term
The host SHALL add to every saved term its origin (repository and page), the time it was defined, the
commit, the model and effort, and the spec version. A term from a Select run is also marked as asked
for by the reader.

#### Scenario: Term from a pull request
- **WHEN** a run on pull request 12 of `acme/widgets` saves a term
- **THEN** the term's origin is `acme/widgets:pr-12`

### Requirement: Corrections
A correction SHALL change the definition, pattern and code flag it names on the existing term with
that id, in the repository glossary if it is there and otherwise the owner glossary, and record the
revision time, model and reason. The term's origin is unchanged. A correction for an unknown id is
ignored.

#### Scenario: Definition corrected
- **WHEN** a Thorough run returns a correction with a new definition and a reason
- **THEN** the stored term has the new definition, the revision time and the reason

### Requirement: Reading needs no permission
Stored glossaries SHALL be readable for any repository, whether or not it is on the allowlist.

#### Scenario: Removed from the allowlist
- **WHEN** the reader removes a repository from the allowlist
- **THEN** its stored terms are still underlined and shown

### Requirement: Terms stay until removed
A stored term SHALL remain until Regenerate deletes it or the reader deletes or edits the glossary
files by hand. Terms made under an older spec version are kept and shown.

#### Scenario: Spec version raised
- **WHEN** the spec version goes from 2 to 3
- **THEN** terms recorded with version 2 are still shown, labelled with version 2
