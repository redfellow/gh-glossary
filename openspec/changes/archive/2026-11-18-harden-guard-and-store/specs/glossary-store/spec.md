# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
