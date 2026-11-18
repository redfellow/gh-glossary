# Tasks

## 1. Guard

- [x] 1.1 Replace the git and gh option checks in `host/guard.mjs` with per-command option tables that read bundled short options and attached values; refuse absolute, drive-letter and `..` git operands; refuse gh `--jq` and `--template`; verify with tests for `git grep -O./x`, `git diff /dev/null <file>`, `git blame -S`, `gh issue view 1 -Rother/repo` and the allowed forms in "Read-only git commands"
- [x] 1.2 Refuse tools other than Read, Grep, Glob, Bash, StructuredOutput and TodoWrite, and input that does not parse; verify by test and by a headless `claude -p` run with the host's flags, in which `git log` ran, `git grep -O./evil.sh` and `git diff /dev/null /etc/hosts` were refused, the script did not run, and the structured reply came back

## 2. Store

- [x] 2.1 Make `readJson` throw for a file that exists but does not parse, and `writeJson` write through a temporary file; verify a broken glossary fails a run and is left unchanged
- [x] 2.2 Refuse repeated groups, backreferences and patterns over 500 characters in `checkPattern`, and leave failing stored terms out of `mergedGlossary`; verify no stored pattern in the local cache is refused
- [x] 2.3 Move the owner glossary to `@org/`, moving an existing `_org/glossary.json` on first use; update `README.md`

## 3. Host and extension

- [x] 3.1 Decode process output as a UTF-8 stream; size reply parts for 3 bytes per character; refuse control characters in file page keys; verify with native-messaging tests
- [x] 3.2 Redraw when any stored term changes; report a lost Select job as lost; verify `npm test` passes
- [ ] 3.3 In Chrome on one allowed page: run Thorough where it only corrects and see the corrections without a reload; run Quick on an owner with an existing `_org` glossary and see its terms after the move

## 4. Second review

- [x] 4.1 Close the guard's option desync (`git log -U --output=x`): next-word values may not start with `-`, `-U`/`--unified`/`--format`/`--word-diff-regex`/`--diff-filter` take attached values only, and write/read/run options are refused in any position; resolve symlinks in git paths; verify with tests and a headless `claude -p` run
- [x] 4.2 Refuse more than two repeats, two repeats that can meet, and patterns that can match empty within text; drop a term that matches empty on the page; build the term table without a prototype; verify no stored pattern is refused
- [x] 4.3 Ask for consent in the extension instead of the page (first a window, `allow.html`; since `display-only-page-view` the toolbar popup, and `allow.html`/`allow.js` are gone), remove `/api/allow` from the content script's routes, and require a real click on Quick, Thorough, Regenerate and Define; verify by source tests
- [x] 4.4 Percent-encode the path and ref in Send to Claude; label links with their host and drop query and fragment; open the claude:// link from a closed shadow root; keep local folders out of job errors
- [x] 4.5 Let a run change an owner term only when it came from the run's repository or the owner is allowed; move `_org` only when it is an owner glossary
- [x] 4.6 Cap blob addresses and lookups and remember misses; skip the rest of an oversized message; time out host requests after two minutes; treat a malformed `%` escape as an unhandled page
- [x] 4.7 (Replaced by `display-only-page-view`, which asks in the toolbar popup; tested there in Chrome 157.) In Chrome: the allow window opens from Quick on a repository not allowed, Enter cancels, "Allow" starts the run; a scripted click on Quick from the page console starts nothing

## 5. Third review

- [x] 5.1 Run the guard's check in `decide()`, which turns any exception into a deny; refuse a tool input that is not an object; exit 2 on a crash outside it; verify with tests for `file_path: {}`, `path: [...]` and the hook process
- [x] 5.2 Check `git log -L` values like a `rev:path` and their file through the symlink check; fix the comment that said no option takes a file; verify with tests
- [x] 5.3 Allow file reading only as `Read(//<root>/**)` for the two roots; set `disableAllHooks: false` in the run's settings; refuse to start when managed settings disable hooks or allow only managed hooks; verify with tests and headless `claude -p` runs (scoped rules deny Read, Grep and Glob outside the roots without the hook; the flag's `false` wins over a lower-level `true`; with the host's flags the guard denied a read outside and allowed `git log`)
- [x] 5.4 Save a new owner-layer term in the repository glossary unless the owner is allowed; update `README.md`; verify with tests
- [x] 5.5 Have the guard mark every call it checks in a per-run file (`GHG_MARK`) outside the run's folders, and discard a run's result when no mark was left; verify with a test and headless runs with hooks on and off

## Workflow follow-up

- Archive the change after 3.3 and 4.7 pass.
