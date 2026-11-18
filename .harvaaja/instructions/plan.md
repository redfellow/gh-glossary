# Planning this workspace

Rules for planners, on top of härvääjä's own. Keep them about this workspace: how its tests are named, run and
tiered, what its end-to-end tests are, and anything every plan must include.

## Proofs

- Name each task's proof as the narrowest command of this workspace's test runner that covers the task, and lint
  or type checks of only the files it touches.
- Mark which tests are fast enough for every round: a first-line comment `@harvaaja-test-tier: fast`,
  `integration` or `host` lets härvääjä leave the slow ones to the release check.

## This repository's commands

- One test file: `node --test host/store.test.mjs` (any `*.test.mjs` path). `npm test` runs every file and
  takes no per-file argument, so do not name a single file through it.
- The whole suite: `npm test`.
- Syntax of one file (no linter or type checker is set up): `node --check <file>`.
- Test files sit next to the module they test, named `<module>.test.mjs`, in `assets/`, `extension/` or
  `host/`. `npm test` only globs those three folders, so a test anywhere else does not run unless the change
  also edits the `test` script in `package.json`.
- The suite has no browser, no network and no Docker. The tests stub `gh`, `git` and `claude` on PATH.
- No automated test covers the extension in Chrome. A change to the popup, the content script or the
  definition frame also needs a manual check in Chrome, and the plan says so as a step a person does.

## Every plan includes

- The OpenSpec change that alters behavior, with its delta spec under `openspec/changes/<name>/specs/`. The
  rules of what gets defined live in `openspec/specs/term-definition/spec.md`, and a change to them raises that
  spec's version.
- For a change to `host/guard.mjs`, a test in `host/guard.test.mjs` for each refused and each allowed case it
  touches.
