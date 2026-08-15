# Structural deletion and caret — handoff

Track 3 of the Standard-view effort. Plan: `2026-08-14-structural-deletion-and-caret.md`; governed
by `2026-08-11-standard-view-invariants.md`. Branch `sv/structural-caret`, five commits.

## What changed

### 1. Whole-paragraph deletion (plan defect 1) — `0f93d7b7`, cut test `a9096675`

Deleting a paragraph's entire visible representation (glyph + separator + content) now removes the
paragraph; nothing serializes a phantom `\p`/`\q1` afterwards.

- **The provenance signal**, modelled on the registry's `remove-owner` policy: the Backspace/Delete
  KEY_DOWN handler and a CRITICAL-priority CUT handler (`MarkerEditPlugin.tsx`) read the
  still-intact pre-delete selection and record every paragraph it covers whole — from before the
  glyph to the paragraph end, judged positionally so verse atoms and element points work — into a
  new `MarkerEditContext.wholeParaDeleteExpected` set (`$armWholeParaDeletion`,
  `markerEditDeletion.utils.ts`). The update listener clears it each commit, exactly like
  `splitExpected`.
- **The guard's empty branch** (`$paraMarkerDeletionTransform`) reaps exactly the armed keys.
  Unattributed emptiness is untouched — the transient-emptiness pins were written FIRST and stayed
  green throughout.
- **Last-paragraph case**: when the deletion covered every paragraph (select-all shape), one
  survivor resets to `\p` with its visible prefix via the existing `$setParaMarkerWithPrefix`
  fallback, so the document keeps one visibly-typable paragraph. This mirrors the existing
  "no previous paragraph" reset; see "decisions to review" below.
- The field is **optional** on `MarkerEditContext` so the ~10 hand-built contexts in other tracks'
  test files did not need touching (no set → never reap, the guard's safe default).

### 2. Element-point caret across a same-commit unwrap (plan defect 2) — `b78cf0e2`

Enter-menu apply mid-span (`\nd Lo|rd\nd*` → split) parked the caret at the new paragraph's content
boundary as an element point; the same-commit unwrap of the glyph-less span half dragged it past
the reinserted content (verified against Lexical 0.43's
`$updateElementSelectionOnCreateDeleteNode`: inserts at the point's offset advance it; the
wrapper's removal doesn't pull it back).

Fix: `$unwrapCharNode` reinserts the span's children **after** the span, in order, then removes it
— byte- and tree-identical output, but insertions land past the point's offset so it never moves,
and the removal resolves it onto the first reinserted child. This is the plan's "re-resolve the
point after the structural edit" option: the fix rides with the edit, and `$placeCaretAtBoundary`
stays a single unchanged convention.

**Ownership flag:** §8 assigns `$unwrapCharNode` to the Marker-resolution track. The change is a
deliberately minimal reorder (one loop + comment), and every suite that exercises the unwrap
(markerEditDeletion, markerEditComposed, charFormatting, damagedGlyphSettle,
charAttributeDeletionSettle, markerEditTier1, markerEditCommit — 110 tests) is green. The
Marker-resolution chat should review the diff; if their work restructures the unwrap, the
requirement to preserve is "reinsert on the far side of the doomed span relative to a
content-start element point", pinned by the new test in `markerMenuApply.utils.test.tsx`.

Also pinned (no code change needed): deleting only the visible prefix merges the paragraph with
the caret at the junction — Lexical leaves a text point that follows the moved node's key.

### 3. Escape caret loss (plan defect 3) — `bfd92df9`

**Diagnosis first, instrumented:** with a caret in the editor and no palette open, Escape reaches
`KEY_ESCAPE_COMMAND` unclaimed (probe at CRITICAL confirmed dispatch), the editor-state selection
survives, and the DOM range count drops 1 → 0. The only registered handler is
`@lexical/rich-text`'s default at `COMMAND_PRIORITY_EDITOR`, which calls `editor.blur()` —
`rootElement.blur()` plus `domSelection.removeAllRanges()`. Neither suspected layer was at fault:
`NodeSelectionMenu`'s claim table only exists while a palette is mounted and never touches the
selection, and the host's overlay-dismiss is a window keydown listener that can't reach the editor
selection.

Fix: new `EscapeKeyPlugin` (platform, mounted in `Editor.tsx`'s alphabetical block) claims
`KEY_ESCAPE_COMMAND` at `COMMAND_PRIORITY_LOW` — just above the RichText default — and does
nothing else. No preventDefault, no stopPropagation, so palette key-capture and window-level
Escape listeners are unaffected (pinned). The comment-plugin's Escape handling lives on its own
inner composer and is untouched.

Mounted for **all marker modes**, not just editable: the blur-on-escape default costs the caret in
every view, and no view relies on it. Flag if you want it gated.

### 4. Verse-adjacent typed character (plan defect 4, caret half) — `70493148`

Reproduced, mechanism established: typing `\` **between the number and the glyph's display space**
(`\v 1\ `) made a shape `VERSE_TEXT_REGEX` cannot express (rest without a separator), fell through
to a whole-paragraph Tier-2 rebuild, and the rebuild's caret restore dropped the caret at the
**paragraph start** (worse than the reported before-the-backslash). Typing at the glyph END was
already handled by Tier 1's extraction with the caret kept — now pinned.

Fix: a second Tier-1 arm in `$verseNodeTransform` (`VERSE_MARKER_REST_REGEX`): `\` is a tokenizer
name-scan terminator, so it ends the number's word; the `\`-initiated rest (including the former
display space, which stops being number-adjacent) extracts to a plain sibling — the same tree the
rebuild produced, verified by probe — with the caret mapped onto the character the user typed.
An ordinary character typed there still extends the number (`\v 1a`, PT9 GetNextWord) — pinned.

**Explicitly: defects 2 and 4 do NOT share a fix.** Defect 2 is an element point dragged by
same-commit reinsertion; defect 4 is Tier-2 rebuild caret restoration, bypassed for this shape
because `tier2Rebuild.utils.ts` is off-limits (being edited on `standard-view-pt-4187`).

**Coordination with Whitespace:** the shared test lives in
`markerEdit/verseAdjacentTyping.test.tsx`. It deliberately mounts only the marker-edit engine (no
`TextSpacingPlugin`) and asserts nothing about spacing around the extracted character — the
fabricated-space half is theirs to add, ideally to this same file with the full plugin stack.

## What was verified

- New suites: `paraWholeDeletion.test.tsx` (10), `escapeKey.test.tsx` (2),
  `verseAdjacentTyping.test.tsx` (3), plus the caret-survival test in
  `markerMenuApply.utils.test.tsx`.
- Full `nx run-many -t test`: 9 projects green; platform-editor 1039 passed / 5 skipped (all five
  pre-existing, none added). Corpus: `corpus-round-trip` 111 green, `tier2Rebuild.corpus` 141
  paragraphs 0 skip-listed, transform fixed point green.
- Visible-stop normalizer / shift-extend / structure-keyboard suites re-run fresh (not cached):
  170 tests green.
- `nx run-many -t lint`: 0 errors (13 pre-existing `no-console` warnings in perf files this track
  never touched). `nx run-many -t typecheck`: all 10 projects clean.
- No public API change (`MarkerEditContext` is not in the API report; `EscapeKeyPlugin` is
  internal), so no `extract-api` run was needed.

## Deliberately not done

- **No change to `tier2Rebuild.utils.ts` caret anchoring**, although defect 4 proved it drops a
  caret it cannot map at the paragraph start. Off-limits per §8 (active on
  `standard-view-pt-4187`); the general fix belongs to the Coordinates track's caret-anchoring
  work. My fix removes one common way of entering that path, not the path's defect.
- **No fabricated-space fix** in the verse-adjacent repro — Whitespace's half.
- **Typing over a whole-paragraph selection** is left on marker-rename semantics (Lexical lands
  the typed text in the glyph node; Tier 1 treats it as a rename in progress). Pinned as
  not-reaped; whether the rename outcome is right belongs to Marker resolution.
- **The Enter-Enter-then-backspace repro** from the plan was not separately reproduced end-to-end:
  its layers (separator heal on backspace, glyph deletion grace) belong to Whitespace and Marker
  resolution. The merge-junction caret it likely reduces to is pinned and green.
- No scribe changes.

## Decisions TJ should review

1. **Last-paragraph reset marker**: a select-all delete's survivor resets to `\p` (default),
   discarding its previous marker (e.g. `\q1`). Chosen to match the existing lone-paragraph
   fallback; PT9's exact behavior not verified.
2. **Escape claim scope**: all marker modes, all views (see above).
3. **The `$unwrapCharNode` reorder** — Marker resolution's file per §8; needs their ack.
4. **Arm keys**: Backspace, Delete (any modifiers), and CUT. `DELETE_WORD`/`DELETE_LINE` variants
   with a range selection also collapse to a plain range delete through the same key events, but I
   did not separately test Ctrl+Backspace over a whole-paragraph selection.

## Manual test script

1. Standard view. Select all of a `\q1` paragraph including the visible `\q1 ` and Backspace →
   the line disappears entirely; save; confirm no `\q1` in the file. Repeat with forward Delete
   and with Ctrl+X (cut must also put the text on the clipboard).
2. Select every paragraph in the chapter and delete → one empty `\p ` remains, visible prefix
   intact, typing works.
3. Undo after (1) → paragraph returns whole (glyph, separator, content).
4. Select just the visible `\q1 ` prefix (glyph through the space) and delete → content merges
   into the previous paragraph, caret sits at the junction (start of the moved text).
5. Caret mid-word inside a `\nd …\nd*` span → Enter → Enter (commit the highlighted paragraph
   pick) → the caret sits at the START of the new paragraph's content, and typing lands there,
   not at the paragraph end.
6. Press Escape with a caret in the text, no palette open → caret stays visible, keyboard input
   continues at the same spot. Then: type `\` (palette opens), Escape → palette closes, caret
   still there. Host find bar / marker menu Escape behavior unchanged.
7. `\v 2 Da` with the caret right after the `2` → type `\` → the caret is immediately after the
   backslash (next keystroke lands after it), verse number still `2`. Also try typing a letter
   there → number becomes `2<letter>` (PT9 word rule). Watch separately for a fabricated space
   (whitespace track's half — expected still present until their fix).
8. Regression sweep: arrow left/right across marker glyphs and display runs (visible-stop), and
   shift+arrow selection growth — unchanged.
