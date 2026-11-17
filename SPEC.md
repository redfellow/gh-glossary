# gh-glossary definition spec

Spec version: **2**. Every stored term records the spec version it was made under (`spec`).

This document decides **what gets defined, how, and in which layer**. The skills
(`.claude/skills/gh-glossary-*`) carry out one operation each and follow this spec; the host enforces
what can be checked in code. When behaviour and spec disagree, the spec wins and the code is fixed.

## 1. Terms

A **term** is a word, identifier, symbol or short phrase that appears on a GitHub page and has a stored
definition. Every term has:

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Stable key: the identifier itself for code, otherwise kebab-case. Reusing an id replaces that term. |
| `term` | yes | Display name. |
| `category` | yes | One of the categories in section 2. |
| `layer` | yes | `repo` or `org` (section 5). `org` means the repository's owner: the GitHub organization or user. |
| `pattern` | yes | JavaScript regex source that finds the term in text (section 6). |
| `code` | yes | `true`: matched case-sensitively, everywhere including code and diffs. `false`: matched case-insensitively, in prose only (Markdown, issues, PR text). |
| `def` | yes | The definition (section 7). |
| `where` | for `code`, `domain` | `path` or `path:line` the meaning was taken from. |
| `link` | for `reference` | URL of the issue, PR or document. |
| `verified` | yes | `true` only when the meaning was checked against the source the spec names for its category (section 8). |

The host adds `origin` (repo and page it came from), `definedAt`, `ref` (commit), `model` and `spec`.

## 2. Categories

Each candidate belongs to exactly one category; when two fit, take the first in this list.

| Category | Qualifies when (all must hold) | Source of the meaning |
|---|---|---|
| `reference` | An issue or PR number (`#34`), or a named, dated team event or decision ("relay review 2026-10-21", "challenge 1") mentioned on the page. | The issue/PR title and body (`gh issue view`, `gh pr view`), or the repo document that records the event. If none exists, say so in the definition. |
| `domain` | A noun or noun phrase with a project-specific meaning, and the repo's own docs, specs or code use it as a named concept (it appears in README, CLAUDE.md, `docs/`, `openspec/`, `specs/`, or as part of an identifier). | The repo document or code that defines it; `where` points there. |
| `code` | An identifier defined **in this repository**: function, class, type, interface, constant, table, column, env var, CLI command, script name, config key. Its definition can be found with `git grep`. | The definition site; `where` is `path:line`. |
| `external` | A named product, service, protocol, standard or RFC outside this repo (Ory Hydra, Entra, OAuth 2.1, RFC 9728, pgvector). | Its role as used in this repo or across its owner's repos; general facts only as needed. |
| `library` | A third-party package API, SQL/extension operator or framework call used on the page (`@>`, `<=>`, `jsonb_each`, `fc.asyncProperty`, `vi.mock`). | How this code uses it; the package's documented meaning. |
| `acronym` | Any token of 2-6 capital letters or digits (with optional trailing `s`) on the page that is not on the common list in section 3 and not already covered by another category. | Expansion plus meaning here. |

## 3. Never define

- Words on the **common list**: everyday English, and general programming vocabulary any working
  developer knows (function, array, commit, branch, merge, test, build, deploy, server, client, query,
  index, cache, token, user, config, file, folder, endpoint, request, response, log, error, bug, type,
  string, number, boolean, null, async, promise, callback, loop, class, module, package, import,
  export, repository, PR, issue, CI, CD, API, URL, URI, HTTP, HTTPS, JSON, YAML, SQL, CSS, HTML, ID, UI,
  UX, CLI, OS, DB, IDE, SDK, TODO, README).
- Language keywords, built-ins and standard-library names (`const`, `Promise`, `Array.map`, `node:path`,
  `JSON.stringify`) unless the page uses them in a way specific to this project.
- Function parameters and local variables whose meaning is clear from the code shown.
- File paths, URLs, commit SHAs, version numbers, dates and numbers.
- A term already in the glossary (either layer) whose pattern already matches it. Thorough may correct
  it instead (section 9).

## 4. Order and cap

When more candidates qualify than the operation may add, keep them in this order and cut at the cap:

1. category order: `domain`, `code`, `reference`, `external`, `library`, `acronym`
2. then by number of occurrences on the page, most first
3. then by first appearance on the page

If any qualifying candidate was cut, the result sets `capHit: true`.

## 5. Layers

- `org`: the term means the same in every repository of this repo's owner (the organization or user
  before the `/` in `owner/repo`): parts of a platform those repos share, company-wide infrastructure
  and shared services, and `external` items as that owner's repos use them. An `org` definition must
  read correctly from any of the owner's repos: it never names or depends on this repository.
- `repo`: everything else. If an org-level term has a repo-specific twist, the twist is a separate
  `repo` term or the whole term is `repo`.
- If both layers hold the same `id`, the repo term is shown.

## 6. Patterns

- JavaScript regex source; only non-capturing groups `(?:...)`; must not match the empty string.
  (The host drops terms that break these and logs it.)
- `\b` word boundaries around words and identifiers.
- Include inflected forms (`\batoms?\b`) and the longer alternative first (`\bOry Hydra\b|\bHydra\b`).
- **Specificity:** a pattern must not match ordinary uses of a common word. A term of 3 characters or
  fewer, or one that is an ordinary English word, must be `code: true` (case-sensitive) or a multi-word
  phrase. (`cp` for Control Plane is not allowed; `\bCP\b` with `code: true` is.)
- A `code` term's pattern matches the identifier exactly, not substrings of longer identifiers.

## 7. Definitions

- 1-4 sentences, plain words, active voice.
- Sentence 1 says what it is (its kind and what distinguishes it). Sentence 2 says what it does or
  means in this repo, or for `org` terms across the owner's repos. Further sentences: a concrete example, or why
  it matters, when that helps.
- Link related glossary terms as `[[id]]` or `[[id|label]]`. Use `` `code` `` for code and `<br>` for a
  line break. Nothing else is rendered.
- State only what the source supports. If the source is unclear, say what is known and stop.

## 8. Verification

`verified: true` means the meaning was checked against the category's source in section 2: the
definition site was opened for `code`, the defining document for `domain`, the issue or PR for
`reference`, the usage in this repo for `external` and `library`. `false` means the meaning comes from
the page and nearby docs only.

## 9. Operations

| Operation | Skill | Default model | Scope | May add | Verifies | Other output |
|---|---|---|---|---|---|---|
| **Quick** | `gh-glossary-quick` | sonnet / medium | Terms on the page | ≤ 60 | Only `reference` (one `gh` call each) | none |
| **Thorough** | `gh-glossary-thorough` | opus / high | Terms on the page | ≤ 60 | Every term it adds | Corrections to existing terms that appear on the page; links between terms |
| **Select** | `gh-glossary-select` | sonnet / medium | Exactly the text the reader selected | 1 | Yes | none |

- **Quick** finds candidates on the page, applies sections 2-4, and defines them from the page and the
  repo's docs. It does not trace code beyond finding a `code` term's definition site for `where`.
- **Thorough** does what Quick does, then opens each term's source to verify it, adds `[[links]]` to
  related terms, and checks every *existing* glossary term that appears on the page. When an existing
  definition is wrong, out of date, or its pattern breaks section 6, it returns a **correction**
  (`id`, new `def` and/or `pattern`, and a one-line `reason`).
- **Select** defines the exact text the reader selected, whatever its category, even if section 3
  would exclude it: the reader asked. It returns one term whose pattern matches the selection. If the
  selection is already covered by a glossary term, the extension shows that term instead of running.

**Regenerate** (any of Quick or Thorough with the box ticked) first deletes the terms whose `origin` is
this page, then runs the operation.
