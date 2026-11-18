# Design

The content script keeps `selJobs`, the Select runs it started that have not ended, and `selAsked`,
the number of the last Define asked for (a Define of a known term counts, so a run finishing later
does not open over the box it showed). One timer polls every job every two seconds; finished ones
are removed, the glossary is loaded once, and only a job whose number is `selAsked` opens its box.

The pending highlight cannot be animated with CSS (`::highlight` styles do not animate), so the
script swaps the ranges between `ghl-pending` and `ghl-pending-dim` every 700 ms, or shows one
steadily when the reader prefers reduced motion. GitHub's code view selects in a textarea and has no
range to highlight; those Defines show only in the tab and the popup.
