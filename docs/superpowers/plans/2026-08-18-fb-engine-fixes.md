# Marker-edit engine fixes: unknown-split rejoin and Enter-split backspace restore

Branch `sv/fb/engine-fixes`. Two live defects reported against the Standard-view editor, both in
the marker-edit engine (`packages/platform/src/editor/markerEdit/`). Governing invariants:
`docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

Both fixes landed strict red-green: the failing test was written and its failure REASON confirmed
against the live behavior (reproduced in a probe harness first) before any engine code changed.

---

## Defect 1 — stray `\p` when an unknown block marker is corrected to an inline marker

Repro: `\p some stuff` → type `\asdf ` mid-paragraph → settles to `\p some ` + `\asdf stuff`
(unknown block paragraph — correct, the tokenizer defaults an unknown token to a paragraph in body
context). Edit the glyph `asdf` → `w` (a known char marker) → on settle: `\p some ` + **`\p \w
stuff`** — a fabricated `\p` the user never typed. Expected: ONE paragraph `\p some \w stuff`.

### Root cause (verified, matches the reporter's diagnosis)

`$applyOpenerRename`'s paragraph branch routes a non-paragraph-kind rename to Tier 2 via
`$requestTier2ForNode`, whose scope resolver always rebuilds `[the one containing paragraph]`. The
artifact paragraph re-tokenizes in isolation, and a fragment whose leading marker is a CHAR-kind
marker forces the tokenizer's default `\p` wrapper — the paragraph split survives even though its
only reason to exist (a block-shaped leading marker) is gone. In the file, `\p some` + newline +
`\w stuff` is ONE paragraph (a newline before an inline marker is ordinary whitespace).

### Fix shape

`markerEditTier1.utils.ts`, `$applyOpenerRename`: when the rename routes to Tier 2 AND the shape is
exactly the unknown-split artifact, widen the rebuild scope to `[previous, para]` —
`$rebuildParas` always took a `ParaNode[]`; this is its first two-paragraph caller. The joined
fragment re-tokenizes to the byte-exact result of tokenizing `\p some \w stuff` (verified directly
against the tokenizer: the fragment joiner's extra whitespace collapses identically).

Artifact detection, deliberately narrow:

- the paragraph's OWN marker is unknown (`getMarker(...)` returns `undefined` or
  `MarkerType.Unknown`) — its paragraph-ness was fabricated by the unknown-token default, never
  authored. A user's `\p`/`\q1` has `MarkerType.Paragraph` and keeps its own scope;
- the NEW marker is char-kind (`isCharKindMarker`) — notes/milestones keep today's routing;
- the edited glyph is the paragraph's LEADING glyph (first child) — a stray opener mid-paragraph
  says nothing about the split;
- a previous sibling ParaNode exists. A refused widened rebuild (guard rails on the previous
  paragraph) falls back to today's single-scope route.

### Tests (`unknownSplitRejoin.test.tsx`, new, beside `typedMarkerResolution.test.tsx`)

- Full repro through the transforms: type `\asdf ` character-by-character, retype the glyph to
  `\w`, depart; assert ONE paragraph and USJ content deep-equal to
  `usfmFragmentToUsjContent("\p some \w stuff")` — byte-exact by construction, `closed:"false"`
  on the unclosed span included.
- Guard: a REAL `\p` paragraph's glyph retyped to `\w` does NOT merge (stays two paragraphs).
- Guard: a genuine `\p` whose first content child is a `\w` span does not merge on an unrelated
  settle of that paragraph (a terminated `\nd x\nd*` typed into its tail).

---

## Defect 2 — Enter-Enter then backspacing the injected `\p ` prefixes away eats the space and flings the caret

Repro: `\p asdf| \nd asdf\nd*` (caret before the space) → Enter, Enter (fresh `\p ` line between
`\p asdf` and `\p  \nd asdf\nd*`, caret at the third paragraph's content boundary) → backspace the
injected representation away. Today: the content space before `\nd` is deleted and the caret is
flung to the merged paragraph's END. Expected: the document returns byte-exactly to its pre-Enter
serialization with the caret at the junction after "asdf".

### Root cause (empirically established with a step-by-step probe of the real command pipeline)

Two independent actors, both in `markerEditDeletion.utils.ts`:

1. **The heal's canonicalize arm absorbed a content byte.** The first Backspace deletes the
   engine's prefix separator; the user's content space slides into the second-child position; and
   `$healMarkerTrailingSeparator`'s canonicalize arm — which exists for a TYPED space right after
   the glyph — converted it into a token separator unconditionally, BEFORE the caret-held grace
   arm could run. The document byte became engine scaffolding, and the marker-deleted merge later
   dropped it as an "orphaned separator": the space vanished from the file.
2. **The merge let Lexical relocate an orphaned caret.** When the last prefix glyph byte is
   deleted, the caret's node is destroyed and the point lands on the dissolving paragraph itself.
   `previous.append(...)` + `para.remove()` relies on "moved nodes keep their keys; selection
   follows" — true only for a caret IN a moved child. An element point on the removed paragraph
   (or a point in a dropped separator) was relocated by Lexical's generic sibling fallback —
   observed as an element point past the merged content (the "very END" fling).

The `$armCollapsedParaDeletion` reap itself was NOT the actor — the reap arm never fires in this
flow (no paragraph ends a commit empty); the suspect list's "trailing-space/separator machinery
absorbing the space as an engine byte" was the confirmed half.

### Fix shape

1. `$healMarkerTrailingSeparator`: the canonicalize arm now graces (pends the paragraph) instead
   of absorbing whenever THIS commit carries a delete-key gesture with the collapsed caret in this
   paragraph — `context.collapsedDeleteCaretParas.has(para)`, the provenance signal the collapsed
   deletion arm already records. Heal-by-provenance, not geometry: a typed space keeps the
   immediate canonicalize; a genuine caret departure still settles the paragraph by re-tokenizing
   the displayed bytes (where a lone `\p`-adjacent space legitimately becomes the structural one).
2. `$paraMarkerDeletionTransform`'s merge branch: a collapsed caret the merge would orphan (on the
   dissolving paragraph, or in a dropped child) is placed explicitly at the JUNCTION — the
   boundary before the first moved child, via the shared `$placeCaretAtBoundary` convention — and
   a caret in a moved child is left to follow the move exactly as before.

With both, the full backspace chain (three presses dissolve the third paragraph's injected prefix
and merge it into the fresh line; three more dissolve the fresh line's own prefix) restores the
document byte-identically, caret at the junction — verified against the pre-Enter serialization.

### Tests (`paraWholeDeletion.test.tsx`, extending the file's state-level drive convention)

- The full chain: real KEY_ENTER splits, then six armed Backspace commits whose deletion half is
  simulated at state level (jsdom cannot drive Lexical's native `Selection.modify` path), with the
  deferred settle flushed between presses. Pins the mid-chain state (space survives the first
  merge; caret at the junction), the final single paragraph, caret at the junction, and
  `usjOf(editor)` deep-equal to the pre-Enter capture.
- The orphaned-caret shape in isolation: an element point on the dissolving paragraph whose moved
  content is a char span (nothing hosts a text point) must land at the boundary BEFORE the span,
  not past it. Verified to bite: with the junction placement disabled, it fails (caret past the
  span).
- Every existing pin in the file — the transient-emptiness guards included — stayed green
  untouched.

---

## Deviations from the task brief

- The brief's repro counts "Backspace ×3"; the byte-wise gesture is six presses (each injected
  `\p ` is three displayed bytes: separator, `p`, `\`). After three presses the fresh middle line's
  representation is visually gone (the two lines merge); the stated EXPECTED end state — the full
  pre-Enter restore — needs the second three. The test drives and pins both halves.
- The brief suggested the reap path as a possible actor; the probe exonerated it (no paragraph
  empties in this flow). No change to the reap or its arming.
- Defect 1's fix landed in `$applyOpenerRename` (the one funnel both the terminated-rename and the
  bare-rename departure settle pass through) rather than in the generic scope resolver — the
  rename is the only place the "marker kind changed under an unknown paragraph" fact is known.

## Verification

- Targeted suites (all green, zero skips): unknownSplitRejoin (3), paraWholeDeletion (15),
  verseAdjacentTyping, typedMarkerResolution, unmatchedCloser, glyphDriftHeal, debounceSettle,
  the corpus trio (corpus-round-trip 116, corpus-testusfm-round-trip 10,
  corpus-transform-fixed-point 22) plus tier2Rebuild.corpus.
- Full platform-editor suite: 69 files, 1206 tests, all green.
- Full gate `nx run-many -t test lint typecheck`: green (see the final report for numbers).
