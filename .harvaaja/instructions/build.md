# Building this workspace

Rules for implementers and fixers, on top of härvääjä's own. Keep them about this workspace: the commands that
run one test file, lint or type check, and conventions the code must follow.

## Proofs

- Run only the test files that cover what you changed, with this workspace's test runner: `node --test <file>`.
  Run `npm test` once before you finish, since it is the suite every round runs.
- There is no linter and no type checker. To check syntax of a file, run `node --check <file>`.
- A new test gets a first-line comment `@harvaaja-test-tier: fast`, `integration` or `host`: fast for
  isolated logic, integration for anything that needs real processes, files or services, host for what can't
  run in the sandbox. Existing test files do not have the comment yet; add it to the ones you create.

## Conventions

- Plain Node ESM: `.mjs` files with `import` and `node:` built-ins. The host (`host/`) has no npm dependencies,
  so do not add one without a plan that says why.
- The browser code in `extension/` is loaded as it is by Chrome: no bundler and no npm imports. Shared code the
  extension and tests both use lives in `extension/shared.js` or `extension/link.js`.
- Tests use `node:test` and `node:assert/strict`, and make temp folders with `fs.mkdtempSync(path.join(os.tmpdir(), ...))`.
  They never write into the repository or the person's home folder.
- Code must work on macOS, Linux and Windows. Platform differences go through `host/platform.mjs`, which has
  its own tests. Tests that need a POSIX shell skip on `win32`.
- Line endings are fixed by `.gitattributes`: `.cmd` and `.ps1` are CRLF, `.sh` is LF. Keep them that way.
- Do not write to `cache/`, `config.json` or `host/.launcher.sh`: they are the person's local state and are git-ignored.
- The guard (`host/guard.mjs`) and the run's read-only tool list are the safety boundary of every run. Do not loosen
  a refusal, or add a tool or `gh`/`git` option to the allowed list, without a spec change and a test that proves the
  new case is safe.
