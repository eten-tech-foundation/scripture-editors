# testUSFM cross-oracle corpus

Vendored copies of paranext-core's `testUSFM` fixtures
(`lib/platform-bible-utils/src/scripture/usj-reader-writer-test-data/`) — **the source of truth
lives there**; re-copy when it changes (same convention as the vendored `usfm.sty` in
`tools/usfm-markers`).

Each `.usj` file is **Paratext 9.5's actual USJ output** for the paired `.usfm` file, making them
an independent oracle for `usfmFragmentToUsjContent`'s ParatextData fidelity
(`usfmFragmentToUsj.corpus.test.ts`). The `testUSFM-2SA-*` chapters deliberately exercise USFM's
edges (attribute markers, milestones, unknown markers, unclosed spans, figures, tables, sidebars,
links); the `web-matthew-*` files are conventional-content baselines.

`testUSFM-2SA-3-corrected.usj` replaces Paratext's raw chapter-3 output, which contains an
acknowledged Paratext 9.5 bug (a `\cp` with markers in its content is partially folded into
`pubnumber` and the remainder stranded as a **top-level char**, an invalid USJ shape). The
corrected file encodes the intended behavior; the tokenizer matches it exactly.

`spacing-word-break.*` is the one fixture NOT captured from Paratext 9.5. Paratext has no exporter
here that emits USJ, so its `.usj` was written by hand — but every text expectation in it was taken
from `ParatextData.dll` itself, by calling `UsfmToken.RegularizeSpaces` on each string through the
`paratextdata` package that `c-sharp` already depends on. That run is the oracle: a ZWSP between two
words survives, a ZWSP surrounded by spaces is dropped, a non-breaking space between two letters
survives, and one sitting inside a run of spaces collapses with them. It covers the spacing the
other fixtures happen not to contain, which is the spacing that matters most for Thai, Khmer, and
Lao. Only the surrounding `\p`/`\v` shape is authored, and it is the simplest the corpus has.

Only the Paratext-flavored fixtures are targeted (not the `-canonical-3.1` spec variants): this
pipeline round-trips chapter data through ParatextData.
