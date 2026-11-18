# Design

The content script keeps `selJobs`, the Select runs it started that have not ended, and `selAsked`,
the number of the last Define asked for (a Define of a known term counts, so a run finishing later
does not open over the box it showed). One timer polls every job every two seconds; finished ones
are removed, the glossary is loaded once, and only a job whose number is `selAsked` opens its box.

Pending words are marked with one steady highlight, `ghl-pending`: an amber background at 40% of
GitHub's attention colour with a wavy underline (the attention-muted background alone is 15% opaque in
the dark theme and was invisible). The reader's selection is cleared once the run starts, so the
browser's selection colour does not cover it. GitHub's code view selects in a textarea and has no
range to highlight; those Defines show only in the tab and the popup.
