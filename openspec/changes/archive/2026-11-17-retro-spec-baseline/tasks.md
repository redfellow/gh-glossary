# Tasks

## 1. Baseline and main specs

- [x] 1.1 Pick one allowed page (a pull request with a diff), run Quick with Regenerate under the current `SPEC.md`, and save the resulting terms for that page to a scratch file; verify the file lists each term's id, category and definition
- [x] 1.2 Check each delta spec against the existing tests (`route`, `dock`, `peek`, `peek-wiring`, `content`, `link`, `guard`, `native`) and correct any scenario a test contradicts; verify `npm test` still passes and `openspec validate retro-spec-baseline --strict` passes
- [x] 1.3 Sync the delta specs to `openspec/specs/`; verify `openspec list --specs` shows all ten capabilities and `openspec/specs/term-definition/spec.md` contains `Spec version: **3**`

## 2. Host reads the term-definition spec

- [x] 2.1 In `host/host.mjs`, read the system prompt and the spec version from `openspec/specs/term-definition/spec.md` instead of `SPEC.md`, and update the file's header comment; verify a run's `system.md` in its run folder starts with the term-definition spec and its log line says `spec 3`
- [x] 2.2 Rewrite the three skills in `.claude/skills/gh-glossary-*/SKILL.md` to name `term-definition` requirements instead of SPEC.md section numbers; verify `grep -rn "SPEC\|section" .claude/skills/gh-glossary-*` finds nothing

## 3. Remove the cap

- [x] 3.1 Remove `TERM_CAP`, the "cap is N" prompt line and `capHit` from the page run record and log line in `host/host.mjs`; verify `grep -n "cap" host/host.mjs` finds nothing
- [x] 3.2 Remove `capHit` from `schema/quick.schema.json` and `schema/thorough.schema.json`, and the cut step from the Quick and Thorough skills; verify `grep -rn "capHit" schema .claude/skills` finds nothing and both schemas still parse as JSON
- [x] 3.3 Remove the "cap reached" text from the panel status line in `extension/content.js`; verify a page whose `pages.json` entry still has `capHit: true` shows a normal status line and `npm test` passes

## 4. Panel and README text

- [x] 4.1 Change the Quick and Thorough tooltips in `extension/content.js` to "usually under a minute" and "about 5 min"; verify by hovering both buttons on a loaded page
- [x] 4.2 In `README.md`: remove the sentence "Nothing is sent to Claude until you say so", remove the "at most 60 per run" text and the `capHit` mention in the cache file list, and replace the "What gets defined: SPEC.md" section and other SPEC.md links with the `term-definition` spec; verify `grep -n "SPEC.md\|60\|Nothing is sent\|cap" README.md` finds nothing

## 5. Switch over

- [x] 5.1 Reload the extension, run Quick with Regenerate on the page from 1.1, and compare with the saved baseline: term count, category spread, and five definitions read side by side; record the comparison in the change folder and adjust `term-definition` wording if categories or counts moved by more than a few terms
- [x] 5.2 Delete `SPEC.md`; verify `grep -rn "SPEC.md" --exclude-dir=openspec --exclude-dir=cache --exclude-dir=.agents .` finds nothing and a Quick, a Thorough and a Select run each finish on one page

## Workflow follow-up

- Archive the change once the runs in 5.2 pass.
- Consider separate changes for the four recorded behaviours listed in proposal.md.
