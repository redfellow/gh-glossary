# Spec Delta

## MODIFIED Requirements

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
