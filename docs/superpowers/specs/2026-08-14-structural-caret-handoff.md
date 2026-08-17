# Structural deletion and caret — handoff

Track 3 of the Standard-view effort. Plan: `2026-08-14-structural-deletion-and-caret.md`; governed
by `2026-08-11-standard-view-invariants.md`. Branch `sv/structural-caret`.

## What changed

### 1. Whole-paragraph deletion (plan defect 1) — `0f93d7b7`, `a9096675`, caret pin in `72518fe3`

Ratified semantics (repo owner, 2026-08-17):

- Delete just the marker (`\q1` of `\p one` / `\q1 two`) → content merges into the previous
  paragraph (existing behavior, tested).
- Delete a whole line (`\q1 two`, visible marker included) → the line is removed entirely; the
  caret lands at the END of the previous line (pinned).
- Delete everything → one visible `\p ` remains (default marker deliberately, even if the survivor
  was a `\q1`), caret at its content start.

Implementation: the Backspace/Delete KEY_DOWN handler and a CRITICAL-priority CUT handler
(`MarkerEditPlugin.tsx`) read the still-intact pre-delete selection and record every paragraph it
covers whole — from before the glyph to the paragraph end, judged positionally — into
`MarkerEditContext.wholeParaDeleteExpected` (`$armWholeParaDeletion`,
`markerEditDeletion.utils.ts`). `$paraMarkerDeletionTransform`'s empty branch reaps exactly the
armed keys; unattributed emptiness is untouched (transient-emptiness pins written first, green
throughout). The field is optional so hand-built test contexts elsewhere need no change (no set →
never reap).

### 2. Typing over a selection is delete-then-type — `72518fe3`

Ratified semantics: a replacement deletes the selection exactly as the delete key would, then
types. Concretely (`\p one` / `\q1 two`):

- Select the whole `\q1 two` line, type `x` → one line, `\p one` + `x` as plain content at its
  end, caret after the `x`.
- Select `q1 two` (sparing the backslash), type `x` → the surviving `\` and the `x` join as the
  pending literal `\x` (bytes `\p one` + `\x`); how it settles is the marker-resolution engine's
  business.

Implementation: a `CONTROLLED_TEXT_INSERTION_COMMAND` handler at NORMAL priority — below
structure protection's block at HIGH, above the default insertion at EDITOR — performs the delete
half for glyph-touching selections (`$prepareReplaceSelection`: same arming as the delete keys,
then `removeText()`) and lets the default insertion run at the collapsed caret. Selections that
touch no marker glyph keep the stock replacement, which is already delete-then-insert for plain
content. Without this, Lexical landed the typed text in the emptied glyph node and the engine
read the replacement as a marker rename in progress.

### 3. Element-point caret across a same-commit unwrap (plan defect 2) — `b78cf0e2`

The Enter-menu apply mid-span parks the caret at the new paragraph's content boundary as an
element point; the same-commit unwrap of the glyph-less span half dragged it past the reinserted
content (verified against Lexical 0.43's `$updateElementSelectionOnCreateDeleteNode`). Fix:
`$unwrapCharNode` reinserts the span's children AFTER it (identical tree), so the point never
moves and the removal resolves it onto the first reinserted child. Also pinned: deleting only a
paragraph's visible prefix merges it with the caret at the junction (already held).

**Reconciled with the char-stack track (2026-08-17, see below): no conflict; both changes stand.**

### 4. Escape caret loss (plan defect 3) — `bfd92df9`

Instrumented diagnosis: the layer is `@lexical/rich-text`'s default `KEY_ESCAPE_COMMAND` handler
(`editor.blur()` → focus dropped + `removeAllRanges()`), not the palette claim table and not the
host overlay-dismiss. Fix: `EscapeKeyPlugin` (platform, mounted in `Editor.tsx`) claims the
command at LOW, suppressing only the blur; the DOM event is untouched so palette key-capture and
window-level Escape listeners are unaffected (pinned). Active in all views/marker modes —
ratified.

### 5. Verse-adjacent typed character, caret half (plan defect 4) — `70493148`

Typing `\` between the verse number and the glyph's display space (`\v 1\ `) fell through to a
whole-paragraph Tier-2 rebuild whose caret restore dropped the caret at the PARAGRAPH START. A
second Tier-1 arm in `$verseNodeTransform` (`VERSE_MARKER_REST_REGEX`) extracts the
`\`-initiated rest — same tree the rebuild produced — with the caret kept on the typed
character. Glyph-END typing and number-extension (`\v 1a`) pinned. Defects 2 and 4 do NOT share
a mechanism (element-point drag vs Tier-2 caret restore).

## Char-stack reconciliation (checked against `standard-view-char-stack`, commits `cc5ecd98..92a79678`)

Their work: `$splitParagraphAtCharStack` claims `INSERT_PARAGRAPH_COMMAND` (HIGH) and splits by
closing the style stack on the left and reopening it in the new paragraph — the glyph-less
continuation span is never produced on that path. They did **not** touch
`markerEditDeletion.utils.ts` (their handoff says so explicitly), so there is no textual conflict
with the unwrap reorder; `markerMenuApply.utils.test.tsx` was edited by both but in disjoint
regions (they changed note-internal tests mid-file; this track appended a describe at EOF) — git
merges it clean.

Both fixes remain load-bearing after merge:

- Their close-and-reopen covers splits that go through `INSERT_PARAGRAPH_COMMAND`.
- The production Standard-view mid-span Enter does NOT: Enter opens the Enter menu
  (`UsjNodesMenuPlugin` claims INSERT_PARAGRAPH at CRITICAL), and committing calls
  `EditorRef.splitParagraphWithMarker` → `selection.insertParagraph()` DIRECTLY (deliberately, per
  its doc comment) — bypassing their handler. That path still produces the glyph-less half, still
  unwraps, and still needs this track's caret fix. Multi-line paste mid-span likewise (their
  handoff's own not-done list).

**Post-merge reconciliation work (see work item D below):** route `$splitParagraphWithMarker`
through the close-and-reopen primitive so both Enter flavors preserve the style stack, and settle
the caret question their handoff raises — after a close-and-reopen split, should the caret sit
BEFORE the reopened span (today's `$placeCaretAtBoundary` element-content convention) or INSIDE it
at content start? This track's recommendation as caret owner: **inside** — the user's caret was
inside the styled run, and since we deliberately diverge from PT9 by preserving the style, typing
should continue it. Note that resolving D changes the expected shape of this track's
caret-survival test (no unwrap runs on that path afterwards); update it alongside.

## What was verified

- Suites: `paraWholeDeletion.test.tsx` (11), `escapeKey.test.tsx` (2),
  `verseAdjacentTyping.test.tsx` (3), the caret-survival test in `markerMenuApply.utils.test.tsx`.
- Full workspace vitest run: 121 files, 3076 passed, 7 skipped (all pre-existing, zero new).
  Corpus: `corpus-round-trip` 111 green; `tier2Rebuild.corpus` 141 paragraphs, 0 skip-listed;
  transform fixed point green.
- Visible-stop normalizer / shift-extend / structure-keyboard suites fresh (not cached): 170 green.
- `nx run-many -t lint`: 0 errors (pre-existing `no-console` warnings only, untouched files).
  `nx run-many -t typecheck`: all 10 projects clean.
- No public API change; `extract-api` not needed.

## Post-merge work items

Each written to be executable by a chat with no context beyond this section.

### A. Tier-2 rebuild caret restoration drops unmappable carets at the paragraph start

**Blocked on:** `tier2Rebuild.utils.ts` being off-limits (actively edited on
`standard-view-pt-4187`); do this after that lands. Caret anchoring is the Coordinates track's
remit (§8).

**The defect:** when `$rebuildParas` re-tokenizes a paragraph and cannot map the pre-rebuild caret
onto a rebuilt text offset, the caret lands at the paragraph start. Observed reproduction (before
`70493148` removed this entry path): standard view, paragraph `\p \v 1 In the beginning`, caret
between the number and the glyph's display space (`\v 1| `), type `\` — the caret ended on the
`\p` glyph at offset 0. `markerEditTier1.utils.ts`'s own comments describe the same class for
element points ("the rebuild cannot map an element point onto a rebuilt text offset, so it dumped
the caret at the paragraph START"). Other entry paths still exist: any keystroke that puts a
marker-bearing node into a shape Tier 1 refuses routes the whole paragraph through the rebuild.

**Shape of a fix:** the rebuild's caret restore needs a fallback that maps "unmappable" carets to
the nearest surviving DOCUMENT position (e.g. byte-offset anchoring across the rebuilt paragraph —
Invariant II's one-position-language) instead of defaulting to the paragraph start. Write the red
test by picking any Tier-2-routed edit with a caret the restore currently loses; assert the
resulting point.

### B. Fabricated space in the verse-adjacent repro (Whitespace track's half)

`\v 2 Da`, type `\` right after the `2`: QA reported a space fabricated next to the typed
character. The space comes from the text-spacing transforms (`TextSpacingPlugin.tsx` and the
`$addTrailingSpace` family — Whitespace-owned per §8; §7 of the invariants names the two
fabrication sources). This track's `verseAdjacentTyping.test.tsx` deliberately mounts WITHOUT
`TextSpacingPlugin` and asserts nothing about spacing, so its caret pins hold either way — extend
that file with the full plugin stack (`testEnvironmentWithDisplaySyncs`) and pin the no-fabricated-
space half there.

### C. Enter, Enter, then backspacing the fresh `\p ` away should return the caret

**Desired behavior (repo owner, 2026-08-17):** Enter Enter (create a fresh `\p ` line via the
Enter menu) then Backspace ×N until the `\p ` prefix is gone should dissolve the fresh line and
land the caret exactly where it was before the Enters (the end of the previous line).

**Why it is not done here, in order of blockage:**

1. The first backspace after the split lands on the engine-owned NBSP separator (caret is at the
   fresh paragraph's content boundary, `[glyph, separator, |]`). Today
   `$healMarkerTrailingSeparator` (Whitespace-owned, `markerEditDeletion.utils.ts`) re-asserts the
   separator on the next transform pass — the backspace is expected to be a visible no-op. Whether
   a USER's separator deletion should instead pend (and what it means — the tokenize-identity
   rule) is exactly the Whitespace track's separator-grace work. Until that lands, the gesture
   never reaches the glyph.
2. jsdom cannot drive the gesture: a backspace at an element point routes through
   `RangeSelection.modify` → the native `Selection.modify`, which jsdom does not implement
   (`TypeError: domSelection.modify is not a function`). Key-by-key tests of this sequence need a
   browser runner; state-level tests can simulate the deletions directly.
3. Once (1) defines what backspacing the prefix does, extend the provenance arm for the collapsed
   case: in `MarkerEditPlugin`'s KEY_DOWN Backspace/Delete arming, also record the CARET's
   paragraph when the selection is collapsed; in `$paraMarkerDeletionTransform`'s empty branch,
   treat an armed-collapsed paragraph that ends the commit empty as a whole-representation
   deletion (reap; Lexical's removal then places the caret at the previous line's end — the pinned
   whole-line-delete behavior). The transient-emptiness pins in `paraWholeDeletion.test.tsx` must
   stay green — they are the guard against over-reaping.

**Already working today:** selecting the fresh line's visible `\p ` (its entire representation —
the line is otherwise empty) and deleting dissolves the line with the caret at the previous line's
end, via the shipped whole-representation arm. Only the backspace-by-backspace route is blocked.

### D. Route `$splitParagraphWithMarker` through the char-stack close-and-reopen

After merging `standard-view-char-stack`: `$splitParagraphWithMarker`
(`markerMenuApply.utils.ts`) still uses `selection.insertParagraph()`, so an Enter-MENU split
mid-span produces a glyph-less continuation half that the deletion transform unwraps — the tail
loses its character style (char-stack's bug 1 content symptom, still live on the production menu
path). Reuse `$splitParagraphAtCharStack`'s machinery (`charFormatting.utils.ts`) so the menu
split also closes-and-reopens, then retags the new paragraph. Settle the caret convention at the
same time: this track recommends the caret land INSIDE the reopened span at its content start
(typing continues the style). Update this track's caret-survival test in
`markerMenuApply.utils.test.tsx` to the new expected point; the unwrap reorder in
`$unwrapCharNode` stays regardless (opener deletion and multi-line paste still reach it).

## Manual test script

1. Standard view. Select all of a `\q1` paragraph including the visible `\q1 ` and Backspace →
   the line disappears entirely, caret at the END of the previous line; save; no `\q1` in the
   file. Repeat with forward Delete and Ctrl+X (cut also fills the clipboard).
2. Same selection, but TYPE `x` instead → the line disappears and `x` lands as plain content at
   the end of the previous line, caret after it.
3. Select `q1 two` (leave the backslash) and type `x` → the line shows the pending literal `\x`;
   it settles by the usual marker rules on departure.
4. Select every paragraph in the chapter and delete → one empty `\p ` remains, visible prefix
   intact, typing works.
5. Undo after (1) → paragraph returns whole.
6. Select just the visible `\q1 ` prefix and delete → content merges into the previous paragraph,
   caret at the junction.
7. Caret mid-word inside `\nd …\nd*` → Enter → Enter → caret at the START of the new paragraph's
   content; typing lands there. (After work item D, also verify the tail keeps its style and
   decide-by-feel the caret-inside question.)
8. Press Escape with a caret in the text, no palette open → caret stays. Type `\`, Escape →
   palette closes, caret stays. Host find bar / marker menu Escape unchanged.
9. `\v 2 Da`, caret right after the `2`, type `\` → caret immediately after the backslash; verse
   number still `2`. A letter typed there instead extends the number (`2a`). A fabricated space
   may still appear until work item B lands.
10. Enter Enter then backspace repeatedly on the fresh `\p ` → expect today: backspace appears to
    do nothing at the separator (work item C); the select-the-prefix-and-delete route works.
11. Regression sweep: arrow traversal over glyphs/display runs and shift+arrow extension.
