# glossary-store Specification

## Purpose

Keeps definitions on the reader's machine in two layers, one per repository and one per owner, and
decides what is saved from a run and what a page sees.

## Requirements

### Requirement: Two layers on disk
Terms SHALL be stored locally in a repository glossary, one per repository, and an owner glossary,
one per owner, shared by all of that owner's repositories, in a folder no repository's can be.
Nothing is stored anywhere else.

#### Scenario: Org term from one repository
- **WHEN** `acme` is an allowed owner and a run on `acme/widgets` returns a term with layer `org`
- **THEN** it is saved in `acme`'s owner glossary and is seen on pages of `acme/gadgets` too

#### Scenario: Repository named like the owner folder
- **WHEN** `acme` has a repository named `_org`
- **THEN** its glossary and `acme`'s owner glossary are separate files

### Requirement: The repository's meaning wins
A page SHALL be given the owner's terms and the repository's terms together. When both layers hold
the same id, the repository's term is the one given.

#### Scenario: Same id in both layers
- **WHEN** `acme`'s owner glossary and `acme/widgets` both hold a term with id `relay`
- **THEN** pages of `acme/widgets` show the repository's definition

### Requirement: Reusing an id replaces the term in its layer
Saving a term whose id already exists in the same layer SHALL replace it. Saving an owner-layer term
SHALL also remove a term with that id from the glossary of the repository the run was for. Saving a
repository-layer term leaves an owner-layer term with that id as it is, and other repositories'
glossaries are never changed.

#### Scenario: Redefined in the same layer
- **WHEN** a run returns a `repo` term whose id is already in the repository glossary
- **THEN** the new term replaces the old one

#### Scenario: Redefined in the other layer
- **WHEN** a run on `acme/widgets` returns an `org` term whose id is already in `acme/widgets`' glossary
- **THEN** the repository's copy is removed and the owner-layer term is the one shown

#### Scenario: Another repository holds the id
- **WHEN** a run on `acme/widgets` returns an `org` term whose id is in `acme/gadgets`' glossary
- **THEN** `acme/gadgets`' term is unchanged and is still the one shown on its pages

#### Scenario: Repository term over an owner term
- **WHEN** a run returns a `repo` term whose id is in the owner glossary
- **THEN** both exist and the repository's term is the one shown on that repository's pages

### Requirement: Patterns are checked before saving
The host SHALL drop, and log, any term or correction whose pattern is not a valid regular expression,
contains a capturing group, can match an empty string, repeats a group with `*`, `+` or `{}`, uses a
backreference, has more than two repeats (`*`, `+`, `{n,m}`), has two repeats not separated by a
plain character outside any group, or is over 500 characters. A stored term whose pattern fails these
checks is not given to pages or runs. No other rule of the `term-definition` spec is checked by the
host.

#### Scenario: Capturing group
- **WHEN** a run returns a term with pattern `\b(foo|bar)\b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Repeated group
- **WHEN** a run returns a term with pattern `\b(?:a+)+b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Repeats that meet
- **WHEN** a run returns a term with pattern `\w*\w*#`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Matches nothing visible
- **WHEN** a run returns a term with pattern `\b`
- **THEN** the term is not saved and the run's log says why

#### Scenario: Stored before the check
- **WHEN** a glossary file holds a term with pattern `\b(?:a+)+b`
- **THEN** pages are given the glossary without it

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

### Requirement: An unreadable glossary is never overwritten
A glossary file that exists but cannot be read or parsed SHALL be an error for the page or run that
needs it, naming the file, and SHALL be left as it is. Saving writes a temporary file and renames it
over the old one.

#### Scenario: Typo in a hand-edited glossary
- **WHEN** the reader leaves a JSON syntax error in a glossary and a run finishes for that repository
- **THEN** the run fails naming the file, and the file is unchanged

### Requirement: A run changes only owner terms it may
A run SHALL add an owner-layer term only if the reader allowed the whole owner. It SHALL change an
owner-layer term, by saving the same id or by a correction, only if the term was first defined from
the run's own repository or the reader allowed the whole owner. Otherwise the run's term is saved in
its repository's glossary instead, and its correction is dropped and logged.

#### Scenario: New owner term from an allowed repository
- **WHEN** only `acme/evil` is allowed and its run returns an `org` term with an id the owner
  glossary does not have
- **THEN** the term is saved in `acme/evil`'s glossary and is not seen on pages of `acme/widgets`

#### Scenario: Owner term from another repository
- **WHEN** only `acme/evil` is allowed, and its run returns an `org` term or a correction for an id
  that `acme/widgets` first defined in the owner glossary
- **THEN** the owner term is unchanged; the new term is saved in `acme/evil`'s glossary and the
  correction is dropped

#### Scenario: Owner allowed
- **WHEN** `acme` is an allowed owner and a run on `acme/evil` corrects that term
- **THEN** the correction is applied
