# Quick on redfellow/tiili pull request 220: before and after

Baseline: `baseline-quick-pr-220.json`, a Quick run under `SPEC.md` version 2 (sonnet/medium).
After: Quick with Regenerate under the `term-definition` spec, version 3, same model and effort.

| Run | Terms | domain | code | reference | external | library |
|---|---|---|---|---|---|---|
| Baseline (SPEC.md v2) | 18 | 6 | 8 | 1 | 2 | 1 |
| Spec v3, first wording | 6 | 2 | 4 | 0 | 0 | 0 |
| Spec v3, with "Every qualifying term is returned" | 24 | 4 | 16 | 0 | 1 | 3 |

## What happened

The first run under the new wording returned a third of the baseline. None of the twelve missing
terms was covered by a term from another page. The old prompt said "The cap is 60 new terms", which
also told the model how many terms to expect; with the cap removed nothing said to be complete.

Adding the requirement "Every qualifying term is returned" to `term-definition`, and pointing step 2
of the Quick and Thorough skills at it, brought the count to 24.

## Remaining differences from the baseline

- Not returned: `marked-for-attention` and `fast-lane` (domain), `#220` (reference to the page's own
  pull request), `Icon Composer` (external).
- Returned under another id: `working-frames` as `hot-cursor`, `shown` as `shown-struct`.
- New: eight more code identifiers (`KOIVU`, `RING_MIN`/`RING_MAX`, `set_icon`, `IconChoice`,
  `start_ticker`, `reduce_motion`, `show_os`, `RING_TICK`) and two library names (`NSBezierPath`,
  `NSColor`).
- `Liquid Glass` moved from the repo layer to the owner layer.

One run each is a small sample: some of this is run-to-run variation, not wording. The glossary also
differed (the baseline ran before `tints.rs` was defined), though no missing term is covered by it.

Definitions read side by side for `koivu`, `attention-ring`, `set_attention`, `ring_opacity` and
`RING_TICKS`: same meaning, same length, same use of `[[links]]`.
