# Proposal

## Why

gh-glossary was split out of gh-lens with working code but no OpenSpec specs, so there is no
baseline to write future changes against. Its one rulebook, `SPEC.md`, lives outside OpenSpec, and it,
the README and the code disagree in a few places.

## What Changes

- Add baseline specs for the system as it behaves today, in ten capabilities.
- Move the content of `SPEC.md` into the `term-definition` spec and delete `SPEC.md`. The host sends
  that spec to every run in place of `SPEC.md`. The spec version goes from 2 to 3.
- **BREAKING** Remove the 60-term cap everywhere: the prompt line, `capHit` in the output schemas and
  in the per-page run record, the "cap reached" panel line, and the order-and-cut rules. The cap was
  only stated to the model and never enforced.
- Remove the README sentence "Nothing is sent to Claude until you say so". The allowlist stays and is
  specified as it works.
- Change the panel's duration tooltips to match the README and recorded runs: Quick "usually under a
  minute", Thorough "about 5 min".
- Record, without fixing, four behaviours that may surprise:
  - Regenerate deletes the page's terms before the run, so a failed run leaves the page without them.
  - Regenerate also deletes terms the reader defined by selection on that page.
  - A term redefined in the other layer leaves its old copy in place; the repo copy is the one shown.
  - Two selections on one page that start with the same 30 bytes share one Select run.

## Capabilities

### New Capabilities

- `term-definition`: what gets defined and how: term fields, categories, exclusions, layers, patterns,
  definition style, verification, and what Quick, Thorough and Select each produce. Replaces `SPEC.md`.
- `page-routing`: which GitHub pages are handled, how each is keyed, and how navigation is followed.
- `term-highlighting`: where and how known terms are underlined on a page.
- `definition-popover`: the box that shows a definition: hover, pin, linked terms, provenance.
- `glossary-panel`: the panel and its docked tab: controls, status, position and size.
- `define-runs`: starting, queuing, tracking and recording Quick, Thorough, Select and Regenerate runs.
- `glossary-store`: the two stored layers, how they merge, and how run output is checked and saved.
- `run-consent`: the allowlist that decides where runs may start, and how the reader changes it.
- `run-sandbox`: what a run may read and execute, and who may talk to the host.
- `send-to-claude`: the link that opens a Claude Code session on a pull request or document.

### Modified Capabilities

None. No specs exist yet.

## Impact

- `SPEC.md`: deleted. `README.md`: SPEC.md section, Safety wording, panel text, cap mentions.
- `host/host.mjs`: prompt source and version lookup, cap line, `capHit` in the run record.
- `schema/quick.schema.json`, `schema/thorough.schema.json`: `capHit` removed.
- `.claude/skills/gh-glossary-{quick,thorough,select}/SKILL.md`: references to SPEC.md sections and
  the cut step.
- `extension/content.js`: duration tooltips, "cap reached" status line.
- Stored data: terms keep their recorded spec version; old `capHit` values in `pages.json` are ignored.
