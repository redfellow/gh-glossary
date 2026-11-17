# Spec Delta

## Purpose

Decides what gets defined on a GitHub page, how each definition is written, and which layer it
belongs to. This spec is sent to every run ahead of the operation's skill.

Spec version: **3**. Every stored term records the spec version it was made under. Any change to the
requirements below raises this number.

## ADDED Requirements

### Requirement: Term fields
A term SHALL be a word, identifier, symbol or short phrase that appears on a GitHub page, returned
with `id`, `term`, `category`, `layer`, `pattern`, `code`, `def` and `verified`. `id` is the
identifier itself for code and kebab-case otherwise. `code: true` means matched case-sensitively
everywhere including code and diffs; `code: false` means matched case-insensitively in prose only.

#### Scenario: Code identifier
- **WHEN** the term is the function `resolveBlob`
- **THEN** its `id` is `resolveBlob` and `code` is `true`

#### Scenario: Prose concept
- **WHEN** the term is the concept "control plane"
- **THEN** its `id` is `control-plane` and `code` is `false`

### Requirement: Source location fields
A `code` or `domain` term SHALL carry `where`, the `path` or `path:line` its meaning was taken from.
A `reference` term SHALL carry `link`, the URL of the issue, pull request or document.

#### Scenario: Code term
- **WHEN** a `code` term's definition site is `host/guard.mjs` line 46
- **THEN** `where` is `host/guard.mjs:46`

#### Scenario: Reference term
- **WHEN** a `reference` term is issue 34 of the page's repository
- **THEN** `link` is that issue's URL

### Requirement: One category per term
Each candidate SHALL be given exactly one category. When more than one fits, the first in this order
is used: `reference`, `domain`, `code`, `external`, `library`, `acronym`.

#### Scenario: Identifier that is also an acronym
- **WHEN** a candidate is a constant named `TTL` defined in the repository
- **THEN** its category is `code`, not `acronym`

### Requirement: Reference category
A candidate SHALL qualify as `reference` when it is an issue or pull request number, or a named,
dated team event or decision mentioned on the page. Its meaning comes from the issue or pull request
title and body, or from the repository document that records the event.

#### Scenario: Issue number
- **WHEN** the page mentions `#34`
- **THEN** it qualifies as `reference` and is defined from that issue's title and body

#### Scenario: Event with no record
- **WHEN** the page mentions "relay review 2026-10-21" and no repository document records it
- **THEN** the definition says that no record was found

### Requirement: Domain category
A candidate SHALL qualify as `domain` when it is a noun or noun phrase with a project-specific
meaning and the repository's own docs, specs or code use it as a named concept: it appears in the
README, `CLAUDE.md`, `docs/`, `openspec/`, `specs/`, or as part of an identifier. Its meaning comes
from the document or code that defines it.

#### Scenario: Concept named in the docs
- **WHEN** the page says "run folder" and the README describes the run folder
- **THEN** it qualifies as `domain` and `where` points to the README

#### Scenario: Phrase the repository never names
- **WHEN** a noun phrase appears on the page but nowhere in the repository's docs, specs or identifiers
- **THEN** it does not qualify as `domain`

### Requirement: Code category
A candidate SHALL qualify as `code` when it is an identifier defined in this repository: a function,
class, type, interface, constant, table, column, environment variable, CLI command, script name or
config key whose definition can be found with `git grep`. Its meaning comes from the definition site.

#### Scenario: Function defined in the repository
- **WHEN** the page uses `storeTerms` and `git grep` finds its definition
- **THEN** it qualifies as `code` with `where` set to that `path:line`

#### Scenario: Identifier defined elsewhere
- **WHEN** the page uses an identifier that is not defined in this repository
- **THEN** it does not qualify as `code`

### Requirement: External category
A candidate SHALL qualify as `external` when it is a named product, service, protocol, standard or
RFC outside this repository. Its definition gives its role as used in this repository or across its
owner's repositories, with general facts only as needed.

#### Scenario: Named service
- **WHEN** the page mentions Ory Hydra, OAuth 2.1 or RFC 9728
- **THEN** each qualifies as `external` and is defined by its role here

### Requirement: Library category
A candidate SHALL qualify as `library` when it is a third-party package API, an SQL or extension
operator, or a framework call used on the page. Its definition says how this code uses it, with the
package's documented meaning.

#### Scenario: Operator and framework call
- **WHEN** the page uses `@>`, `jsonb_each` or `vi.mock`
- **THEN** each qualifies as `library`

### Requirement: Acronym category
A candidate SHALL qualify as `acronym` when it is a token of 2 to 6 capital letters or digits, with an
optional trailing `s`, that is not never-defined vocabulary and is not covered by another category.
Its definition gives the expansion and its meaning here.

#### Scenario: Project acronym
- **WHEN** the page uses `RLS` and no other category covers it
- **THEN** it qualifies as `acronym`

#### Scenario: Common acronym
- **WHEN** the page uses `API` or `JSON`
- **THEN** it does not qualify

### Requirement: Every qualifying term is returned
Quick and Thorough SHALL return every candidate on the page that qualifies under any of the six
categories and is not excluded. There is no limit on the number of terms, and a term is not left out
because it seems minor or because many others were found.

#### Scenario: Pull request with a diff
- **WHEN** a pull request's description and diff mention an issue number, two external products, a
  third-party package and ten identifiers defined in the repository
- **THEN** all fourteen are returned, along with the project concepts the text names

#### Scenario: Each category is checked
- **WHEN** candidates are listed for a page
- **THEN** the page is read from top to bottom once for each category, so no category is skipped

### Requirement: Never-defined vocabulary
Everyday English and general programming vocabulary that any working developer knows SHALL NOT be
defined by Quick or Thorough.

#### Scenario: Common words
- **WHEN** a candidate is one of: function, array, commit, branch, merge, test, build, deploy,
  server, client, query, index, cache, token, user, config, file, folder, endpoint, request, response,
  log, error, bug, type, string, number, boolean, null, async, promise, callback, loop, class, module,
  package, import, export, repository
- **THEN** it is not defined

#### Scenario: Common abbreviations
- **WHEN** a candidate is one of: PR, issue, CI, CD, API, URL, URI, HTTP, HTTPS, JSON, YAML, SQL, CSS,
  HTML, ID, UI, UX, CLI, OS, DB, IDE, SDK, TODO, README
- **THEN** it is not defined

### Requirement: Never-defined language names
Language keywords, built-ins and standard-library names SHALL NOT be defined by Quick or Thorough
unless the page uses them in a way specific to this project.

#### Scenario: Built-in
- **WHEN** a candidate is `const`, `Promise`, `Array.map`, `node:path` or `JSON.stringify` in its
  ordinary use
- **THEN** it is not defined

### Requirement: Never-defined locals and literals
Function parameters and local variables whose meaning is clear from the code shown, and file paths,
URLs, commit SHAs, version numbers, dates and numbers SHALL NOT be defined by Quick or Thorough.

#### Scenario: Local variable
- **WHEN** a candidate is a loop variable in the diff shown
- **THEN** it is not defined

#### Scenario: Literal
- **WHEN** a candidate is a commit SHA or a version number
- **THEN** it is not defined

### Requirement: Already-defined terms are not added again
A candidate that a glossary term's pattern already matches, in either layer, SHALL NOT be added by
Quick or Thorough.

#### Scenario: Existing pattern matches
- **WHEN** the glossary holds a term whose pattern matches "atoms" and the page says "atoms"
- **THEN** no new term is returned for it

### Requirement: Org layer
A term SHALL be given layer `org` when it means the same in every repository of this repository's
owner: parts of a platform those repositories share, owner-wide infrastructure and shared services,
and `external` items as that owner's repositories use them. An `org` definition reads correctly from
any of the owner's repositories and never names or depends on this repository.

#### Scenario: Shared service
- **WHEN** a term names an identity service every repository of the owner uses the same way
- **THEN** its layer is `org` and its definition does not mention this repository

### Requirement: Repo layer
Every term that does not meet the org layer rule SHALL be given layer `repo`. When an org-level term
has a repository-specific twist, the twist is a separate `repo` term or the whole term is `repo`.

#### Scenario: Repository-specific twist
- **WHEN** a shared concept is used here with an extra restriction found only in this repository
- **THEN** the restriction is defined as a `repo` term

### Requirement: Pattern form
A pattern SHALL be JavaScript regex source that uses only non-capturing groups and does not match the
empty string. It SHALL put word boundaries around words and identifiers, include inflected forms, and
put the longer alternative first.

#### Scenario: Inflected form
- **WHEN** the term is "atom"
- **THEN** a valid pattern is `\batoms?\b`

#### Scenario: Longer alternative first
- **WHEN** the term is known as both "Ory Hydra" and "Hydra"
- **THEN** a valid pattern is `\bOry Hydra\b|\bHydra\b`

### Requirement: Pattern specificity
A pattern SHALL NOT match ordinary uses of a common word. A term of 3 characters or fewer, or one
that is an ordinary English word, SHALL be `code: true` or a multi-word phrase. A `code` term's
pattern SHALL match the identifier exactly and not substrings of longer identifiers.

#### Scenario: Short term
- **WHEN** the term is "CP" for Control Plane
- **THEN** `\bCP\b` with `code: true` is allowed and a case-insensitive `cp` is not

#### Scenario: Identifier inside a longer one
- **WHEN** the term is `route` and the page also has `routeKey`
- **THEN** the pattern does not match inside `routeKey`

### Requirement: Definition shape
A definition SHALL be 1 to 4 sentences in plain words and active voice. The first sentence says what
the term is. The second says what it does or means in this repository, or across the owner's
repositories for `org` terms. Further sentences give a concrete example or why it matters, only when
that helps.

#### Scenario: Two-sentence definition
- **WHEN** a `code` term is a function
- **THEN** sentence one says what kind of thing it is and sentence two says what it does here

### Requirement: Definition markup
A definition SHALL use only this markup: `[[id]]` or `[[id|label]]` to link a glossary term,
backticks for code, and `<br>` for a line break.

#### Scenario: Linked term
- **WHEN** a definition mentions another glossary term with id `run-folder`
- **THEN** it is written as `[[run-folder]]` or `[[run-folder|the run folder]]`

### Requirement: Definitions state only what the source supports
A definition SHALL state only what its source supports. When the source is unclear, it says what is
known and stops.

#### Scenario: Unclear source
- **WHEN** the only source for a term is a one-line mention
- **THEN** the definition reports that mention and adds no guessed detail

### Requirement: Verification flag
`verified` SHALL be `true` only when the meaning was checked against the category's source: the
definition site for `code`, the defining document for `domain`, the issue or pull request for
`reference`, the usage in this repository for `external` and `library`. Otherwise it is `false`.

#### Scenario: Meaning taken from the page only
- **WHEN** a `domain` term is defined from the page text without opening the defining document
- **THEN** `verified` is `false`

### Requirement: Quick operation
Quick SHALL define every qualifying term on the page from the page and the repository's docs. It
traces code only as far as finding a `code` term's definition site for `where`, and verifies only
`reference` terms, with one lookup each.

#### Scenario: Code term in Quick
- **WHEN** Quick defines a `code` term
- **THEN** `where` is its definition site and `verified` is `false`

#### Scenario: Reference term in Quick
- **WHEN** Quick defines `#34` after reading that issue
- **THEN** `verified` is `true`

### Requirement: Thorough operation
Thorough SHALL define every qualifying term on the page, verify each one it adds at its source, and
link related terms. A candidate the source shows does not qualify is dropped.

#### Scenario: Verified term
- **WHEN** Thorough adds a term
- **THEN** `verified` is `true` and related terms are linked in its definition

### Requirement: Thorough corrections
Thorough SHALL check every existing glossary term that appears on the page. When a definition is
wrong or out of date, or its pattern breaks the pattern requirements, Thorough returns a correction
with the term's `id`, a new `def`, `pattern` or both, and a one-line `reason`. Correct terms are left
alone.

#### Scenario: Pattern too broad
- **WHEN** an existing term's pattern also matches unrelated text in the repository's docs
- **THEN** a correction is returned with a narrower pattern and the reason

### Requirement: Select operation
Select SHALL define exactly the text the reader selected, in the sense it has in its surrounding
context, whatever its category and even when the never-defined requirements would exclude it. It
returns one verified term whose pattern matches the selection as it appears on the page.

#### Scenario: Selecting a common word
- **WHEN** the reader selects "cache"
- **THEN** one term is returned for it, with the closest-fitting category
