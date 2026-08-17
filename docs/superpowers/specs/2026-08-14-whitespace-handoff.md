# Whitespace track — handoff

Branch: `sv/whitespace` (scripture-editors), `sv/whitespace-core` (paranext-core).
Plan: `2026-08-11-whitespace-ownership.md`; governed by `2026-08-11-standard-view-invariants.md`.

## What changed

### 1. The USX parser preserves whitespace-only text nodes (`fix(utilities)`)

`usx-to-usj.ts` now classifies a whitespace-only text node by MEANING: document content iff it
contains no line break (USX running text never contains line breaks — USFM is line-based), XML
pretty-printing otherwise. All six boundary-matrix rows from invariants §7c round-trip; the four
previously-lost rows (first child single/multi, only child, multi-space between/last) are direct
red-to-green pins in `whitespace-only-text.test.ts`, with guard-rail pins that newline+indent
formatting stays dropped. A USJ→USX→USJ net over the five testUSFM oracles
(`testusfm-usj-usx-round-trip.test.ts`) is green.

**Plan correction discovered:** the oracle net does NOT fail "on 2SA-1 only". Three more fixtures
fail on a different class — Paratext 9.5's USJ carries `sid: ""`/`vid: ""`, the serializer omits
empty attributes (falsy check) and the parser drops para `vid` deliberately. The net canonicalizes
empty-string attributes out on both sides, with the rationale in the test. 2SA-1's failure was the
only whitespace loss, and it is fixed.

### 2. The user-visible loss is settled: LOAD leg, not C# (capture pins, paranext-core)

`NoteLeadingSpaceRoundTripCaptureTests.cs` (new file on `sv/whitespace-core`, both `\f` and `\fe`
hosts) proves ParatextData preserves the space after a folded `\cat*` on every leg: GetChapterUsx
emits it as the note's whitespace-only first child, SetChapterUsx writes it back byte-for-byte,
USX→USFM→USX is a fixed point. **ParatextData is exonerated for this byte; the loss was entirely
`usxStringToUsj` on the load leg, which item 1 fixes. No C# serialization change is needed — the
approval gate was never triggered.** The file deliberately does not touch
`VerseAttributeFoldRoundTripCaptureTests.cs` (attribute-markers track's file, on their branch);
the two suites pin disjoint facts and merge without conflict.

### 3. The trailing-space transform keeps one job (`fix(whitespace)`)

- **ADD is an allowlist now, in both transforms.** `$textNodeTrailingSpaceTransform` adds only
  before a verse (the canonical shape ParatextData re-inserts); `$verseNodeTransform` inserts only
  after a char span or annotation-wrapped text. Every other neighbor class — milestones, block
  unknowns, table cells, unmatched closers, note-final text, notes — canonically abuts with no
  space. This replaced two exclusion lists whose recurring failure mode was "a new node class
  appeared and the list didn't learn it".
- **DELETE is reduced to the empty-verse space** (which cannot round-trip through ParatextData;
  its existing pins stand). A lone space typed into an empty paragraph, paragraph-final after a
  char span, or before a milestone survives.
- **All five corpus skip entries are deleted**; both suites run at full count (21/21 fixed-point,
  10/10 testUSFM) with zero skips.
- One pre-existing pin was corrected: "should add a space if typing before a verse in a para
  starting with an UnknownNode" pinned the fabrication itself (the typed text lands before the
  block unknown, not the verse; the corpus figure oracle has no space there).

### 4. A second fabricator found by the un-skip: collapsed-note separators merged into content

Both note-layout twins (`createNote` in the forward adaptor, `$createWholeNote` in shared-react)
built the collapsed note's NBSP separators as BARE text nodes. Lexical's first normalization pass
merges simple text nodes with equal state, so a separator fused into adjacent content and
serialization's exact-NBSP drop could no longer see it — one display byte leaked into USJ as a
data space (2SA-2's note-final text). Both twins now build the same tagged token separator as the
para-marker prefix (`marker-trailing-space` + token mode). `note-shape-twin` pins the twin
equality; serialized fixtures and the regenerated `2sa.lexical.*.ts` carry the new shape.

### 5. The preserve pin (`whitespacePreservation.test.tsx`)

A source-file space survives a Tier-2 rebuild, a remote apply, and a paste — including space-only
inserts (red first against the old delete branch). **The paste-provenance tag the plan predicted
turned out unnecessary:** with fabricate and delete gone entirely, there is nothing left to gate
by provenance. If either job ever returns behind a provenance check, these pins go red first.

### 6. Separator deletion means what the bytes mean (`feat(whitespace)`)

- `separatorRemovalTokenizesIdentically` lives beside the tokenizer's name scan
  (`usfmFragmentToUsj.ts`, unit-pinned) — heal iff the bytes tokenize identically without the
  byte; `*` never heals (closing marker); name characters rename.
- **Char opener separators:** a prefix-position deletion is a leaf-only edit that never ran the
  span's element transform, so nothing pended and the byte silently resurrected on save. The
  Tier-2 trigger's text transform now reports the caret-held gap against the owning span. On
  departure, `$settlePendedDisplayOwner` routes by the predicate: identical → O(1) in-place heal
  via `$syncOpenerSeparators`; changed → paragraph re-tokenize (`\nd`+`one` → marker `ndone`,
  resolved positionally like ParatextData resolves unknowns; `\nd`+`*more` → closing markers).
- **Para prefixes:** `$healMarkerTrailingSeparator` no longer heals a caret-held deletion in the
  same update (a silent no-op on a user edit). It graces + pends; a new shared predicate
  (`$paraPrefixSeparatorCaretHeld`, one definition for the transform's grace and the settle's
  re-pend) prevents the mid-gesture settle; departure re-tokenizes (`\q2`+`body` → `q2body`;
  `\p`+`\nd …` heals). Machine drift with no caret at the site still heals immediately.
- Hardened: an opener directly before a char attribute run's `|…` text takes a standalone spacer
  — the old classification would have healed by prefixing an NBSP INTO the run's canonical bytes.

### 7. Typed-character pins at engine whitespace sites (`verseAdjacentTyping.test.tsx`)

Byte halves of plan task 4, all green against today's code (items 11/12 needed no fix after the
task-2 rework; see "not done" for the remaining halves):

- Space before a verse inserts on screen; the run collapses at serialization (PT9 reformat
  timing, per the whitespaceDisplay map — deliberate, not a silent no-op).
- `\v  5` is verse 5; `\v 7 5` is verse 7 plus body `5`.
- `\` typed inside the verse glyph settles to writer-canonical bytes (verse 2 + `\ Da`); the
  "fabricated space" reading of that repro no longer holds at the byte level — the space is the
  verse's structural leading-attribute space the writer emits regardless.
- Space at a char opener separator lands as its own glyph; collapses on reformat.

## Verified

Full foreground runs, all green, zero new skips: utilities 51, shared 479, shared-react 1535
(+2 pre-existing named skips), platform-editor 1043. Corpus suites at full count with zero skips.
Lint + typecheck clean in nx contexts for all four projects (remaining warnings are pre-existing
in untouched files). C# capture suite: 2/2 green (`dotnet test --filter NoteLeadingSpace`).

## Deliberately not done

- **The paste-provenance tag** — not needed (see item 5). Reintroduce only if a heal/delete ever
  returns behind a provenance decision.
- **Item 13/14 caret halves.** Typing at the opener separator lands the byte but the caret
  teleports (observed: to the para prefix separator); typing `\` in a verse glyph settles
  immediately (no mid-typing grace) and dumps the caret on the para marker. The caret halves are
  the structural-caret track's; the immediate-settle half is marker-resolution's "typed-literal
  resolution timing" slice. The byte pins in `verseAdjacentTyping.test.tsx` deliberately assert
  bytes only, so their fixes can land without touching these tests.
- **The wrap-a-whitespace-only-selection end-to-end test.** The transform half (the orphaned lone
  space must survive) is pinned in `TextSpacingPlugin.test.tsx` in both aftermath shapes; the
  empty-span shape the wrap produces is char-stack's `$wrapTextSelectionInInlineNode` territory —
  one shared test once their wrap fix settles the span shape.
- **Map-derived leading-attribute generalization.** The `\v` behavior is pinned, but Tier-1 still
  implements it with per-marker regexes (`VERSE_TEXT_REGEX`, chapter's own). Deriving the rule
  from the markers map's `leadingAttributes` (so `\f`'s caller and `\id`'s code get it for free)
  remains open — it crosses into Tier-1 core that marker-resolution also edits.
- **Para-side O(1) heal.** Identical-tokenizing para-prefix deletions settle through the
  paragraph re-tokenize rather than an O(1) heal; invariants §2 declares that cost proven
  affordable. The char side has the O(1) path.
- **The table-cell separator** (`usj-editor.adaptor.ts:547`) carries the tag but not token mode —
  same latent merge-class hazard as item 4, unobserved so far (cell fixtures pass). Left alone.
- **`$resolvePendingMarkers` untouched**, per the coordination rule. The para settle rides the
  existing unhandled→re-tokenize arm; grace was added in `$settlePendedDisplayOwner` instead.

## Findings for other tracks

- **Coordinates (Invariant II, measured):** in Standard view `getEditorDelta` emits
  document-space coordinates while `$applyUpdate`'s retain traversal walks display space. A
  retain computed from the document's own delta lands offset by: +2 per book+chapter region, +1
  per editable VerseNode crossed, and char-span glyph bytes count differently again (an insert
  targeted at `beta` in `\p Alpha \nd Lord\nd* beta` landed inside the closer glyph). The
  preserve pin's remote legs simulate the apply (DELTA_CHANGE_TAG + direct mutation) to stay off
  this; they should route through `$applyUpdate` once the one-position-language lands.
- **Marker-resolution:** typed-literal resolution timing for characters typed INSIDE verse
  glyphs — `$verseNodeTransform`'s no-match arm calls `$requestTier2ForNode` immediately, with no
  mid-typing grace (contrast the pending-literal path for plain text). Repro in
  `verseAdjacentTyping.test.tsx`'s backslash test (bytes asserted; timing not).
- **Structural-caret:** two caret repros above (item 13/14). Also: my one-line change in your
  `$paraMarkerDeletionTransform` — the heal call now passes `context` through; the branch logic is
  untouched.
- **Attribute-markers:** the empty-span-with-attributes display shape (opener + spacer + `|…`
  run) now classifies as a spacer site; if your descriptors reshape that layout, the classifier
  in `markerSeparators.utils.ts` is the one place to update.

## Manual tests for TJ

1. **Load-leg fix, end to end with core:** a project with `\f + \cat People\cat* \fr … \ft …\f*`
   — open in Standard view, edit elsewhere in the chapter, save, reload. The space after `\cat*`
   must survive (it was silently deleted before). Requires the rebuilt `utilities` dist in
   paranext-core (devpub).
2. **Separator deletion:** in `\nd ⟨nbsp⟩Lord\nd*`, backspace the separator, click elsewhere —
   the marker should become `ndLord`-style unknown (paragraph split), not heal. Same deletion
   directly before a nested `\+wj` — should heal back. Type `*x` after the separator, delete the
   separator, depart — should become a closing marker, not heal.
3. **Para prefix:** delete the space after `\q2`, click elsewhere — paragraph becomes the unknown
   marker `q2…`; delete the space after `\p` directly before a char span — heals back.
4. **Typed spaces:** a space typed into an empty paragraph must persist (was silently deleted); a
   second space before a verse stays on screen and collapses only on save/reformat.
5. **Collapsed notes:** edit text near a collapsed footnote, save — the note's internal spacing
   must not gain a trailing space (2SA-2's class).
6. **Milestones:** place the caret next to `\ts-s`/`\ts-e` and type/dirty nearby — no space may
   appear between the milestone and the verse or text (both old fabricators).
