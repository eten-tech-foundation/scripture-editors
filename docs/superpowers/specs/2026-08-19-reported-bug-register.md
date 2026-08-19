# Standard view: the reported-bug register

Every bug TJ reported across the effort, reconciled against what actually shipped.

`[x]` = fixed, with evidence in a handoff, summary, or later round.
`[ ]` = not fixed, or fixed in a way that does not cover the reported behavior.

Status tags: **PARTIAL** (some of it) · **MIS-SCOPED** (recorded, but aimed at a different bug) ·
**WEAK** (claimed fixed, evidence does not clearly cover the report) · **DEFERRED** (deliberate) ·
**UNVERIFIED** (plausibly fixed by a later round, never checked against this repro) ·
**NOT-REPRODUCED** (a test at the Phase-3 anchor and the one before it was GREEN at both, so nothing
in this effort repaired it and it was never broken at either base — pinned forward regardless).

Rounds referenced: the six tracks + integration (`2026-08-14`/`08-17` handoffs), then three
follow-up rounds `fb`, `fb2`, `fb3` (`docs/superpowers/plans/2026-08-18-fb*.md`, merged to
`sv/residual-backlog`), then the closeout round
(`docs/superpowers/plans/2026-08-19-bug-register-closeout.md`, this branch).

**Pin paths** are relative to `packages/platform/src/editor/` unless labelled otherwise. The
closeout round's anchors are `f0800f35` (the Phase-3 branch point) and `85fec66d` (the standard-view
tip it was rebased onto).

---

## Cursor and caret

- [ ] **C1** Editing an opening inline marker makes the cursor jump around. *No record anywhere.*
- [x] **C2** Enter, Enter, then backspace ×3 to remove the fresh `\p `: caret should return between
      the two words, not jump to paragraph end. — fb-engine-fixes defect 2, with this exact repro.
      Earlier rounds targeted "end of the previous line", which is a different place for a
      mid-paragraph Enter.
- [ ] **C3** Typing an unmatched `\nd*` moves the cursor several characters forward; a matched closer
      does not. **UNVERIFIED** — marker-resolution made unmatched closers caret-addressable text and
      fb2 fixed a class of typed-byte caret offsets, but no pin covers this gesture.
- [x] **C4** Typing a verse marker mangles the next word and the cursor. — marker-resolution; the
      pended `\` was read as departed and settled mid-word.
- [ ] **C5** Up/Down arrow on a verse marker jumps to the next paragraph. *No record anywhere.*
- [ ] **C6** Mouse-click after a footnote at paragraph end: caret disappears; Space then scrolls the
      page. Arrow-left works. *No record anywhere.* A pre-existing `TODO` in `ArrowNavigationPlugin`
      names the underlying gap: there is no text position after a trailing note.
- [x] **C7** Escape makes the caret disappear. — the culprit was rich-text's default
      `KEY_ESCAPE_COMMAND` calling `editor.blur()`; a plugin now claims it and suppresses only the blur.
- [x] **C8** Typing a backslash next to a verse leaves the caret before it. — a second Tier-1 arm keeps
      the caret on the typed character.

## Closing markers and marker resolution

- [x] **K1** Unmatched-then-deleted closer: following text does not settle to styled inline.
- [x] **K2** Editing a closer instantly resolves it, moves the cursor past it, leaves it unmatched and
      uneditable. — closer and self-closing edits now always pend.
- [x] **K3** An unmatched closer is not editable in place. — it is editable text now, not a decorator.
- [x] **K4** Renaming a nested opener unmatches its closer instead of renaming it.
- [x] **K5** Deleting an unmatched nested closer destroys everything inside the enclosing span.
      **WEAK** — the handoff states plainly that its test is *a forward pin of the desired behavior,
      not a red-green fix*; the original destruction was never reproduced.
- [x] **K6** Deleting a closer with trailing content does not move that content into the now-open span.
      (The log-storm half of this report is **S8**, still open.)
- [x] **K7** Editing a closer on a span with attributes: attributes gone from file, kept in editor.
      Note the resolution is agreement-by-demotion — attributes become content bytes on both sides.
- [x] **K8** Edit a closer, then type a new one before it: old closer gone from editor, not from file.
- [x] **K9** Typing at the end of a closer keeps the style.
- [x] **K10** An unmatched closer inside an open span of the same marker should become that span's
      closer. — re-matching now falls out of re-tokenization; the paste repro is pinned.
- [x] **K11** Typing `\va` after a verse resolves at `\v` two keystrokes early.
- [x] **K12** `\nd` + Enter with the caret after another closer fabricates `\nd \nd \nd*`.
      **NOT-REPRODUCED** — green at both anchors, under BOTH palette eras (the active palette lands
      nothing before the commit; the passive one, which the report was filed against, left the typed
      `\nd` for the commit to clean up). Pinned: `markerMenu/markerMenuApply.utils.test.tsx`,
      "applying a char marker after another closer inserts exactly one glyph pair". Note an empty
      `\nd \nd*` pair IS the correct outcome of an Enter commit — the report is about a third glyph.

## Whitespace and separators

- [x] **W1** Cannot delete the space after a paragraph marker.
- [x] **W2** Deleting the space after an opening inline marker does nothing; should rename the marker.
- [ ] **W3** Forward-Delete of spaces between parts fails; Backspace works. **MIS-SCOPED** — the
      whitespace work is direction-agnostic and fixes a *deleted-then-resurrected* byte. The reported
      defect is a byte that is never deleted at all, in one direction only.
- [x] **W4** Wrapping a selection in `\nd` emits no separator after the opener.
      **NOT-REPRODUCED** — green at both anchors; a display pin already existed at the anchor. What
      was missing is the SEMANTIC half: that pin asserts the NBSP is shown and says outright that the
      saved bytes were already right, which was true when a missing separator was cosmetic. Under the
      tokenize-identity rule `\ndone` now scans as a marker named `ndone`, so the new pin departs to
      force a settle and asserts the emitted USJ still says marker `nd` with content `one`:
      `markerMenu/markerMenuApply.utils.test.tsx`, "a wrapped selection still serializes as marker nd
      with its own content".
- [x] **W5** Wrapping a whitespace-only selection produces an empty pair beside an orphaned space.
- [x] **W6** Space after `\v` just moves the cursor. **Caret half MEASURED, and it is correct now:**
      the typed space lands as a real byte at the head of the following text and the caret sits
      immediately after it. The reported "no byte inserted" is not what happens.
- [ ] **W7** Space before the space on a nested `\+nd ` just moves the cursor.
      **Same defect as W8, not a separate one** — measured on a `\+nd` nested inside `\wj`, the bytes
      and the caret are identical to the flat case. Whatever is decided for W8 applies here.
- [ ] **W8** Space on a normal `\nd ` inserts, but the cursor ends past both spaces.
      **NEEDS AN OWNER RULING — the behavior is deliberate, not a slip.** Localized to
      `$moveCaretPastMarker` (`markerEdit/markerEditTier1.utils.ts`), called from both arms of Tier
      1's in-place rename and documented as intending exactly this: a space typed at a complete
      marker's end reads as a TERMINATED OPENER EDIT — the same gesture as finishing `\s1` and typing
      the space that ends the name — so the caret lands where content would be typed next. Here the
      rename is a no-op, so the only visible effect is the caret moving two positions for one
      keystroke. The position the report asks for sits INSIDE engine-owned display bytes, which
      Invariant II excludes from document positions, so it may not be a legal caret position at all.
      Note the current shape accepts a keystroke and discards it, which Invariant I's no-silent-no-ops
      corollary forbids — visibly refusing the space is a third option. Three options with costs are
      laid out in the handoff.
- [x] **W9** `\p ` + space does nothing (lone space silently deleted).
- [x] **W10** Typing next to a verse fabricates a leading space. **Re-diagnosed, not repaired** — the
      space is the verse's structural leading-attribute space the writer emits regardless; pinned
      moot. Two documents gave contradictory causes before this was settled.
- [x] **W11** The space after `\cat*` in a note is deleted. — the loss was `usxStringToUsj` on the
      load leg; ParatextData exonerated by capture test.
- [x] **W12** `\nd\wj`: the space heals back when a marker follows. — ratified as the
      tokenize-identity rule.

## Enter and paragraph structure

- [x] **E1** Enter does nothing after inline markers or before a paragraph marker. — fb2 defect 2.
      Its own sweep records this as previously **UNTRACKED — reported by no plan's defect list**.
- [x] **E2** Enter at the end of a paragraph whose last element is an inline marker does not open the
      paragraph palette. — fb2 defect 2, same fix.
- [ ] **E3** Enter should show a temporary new line that disappears if no marker is chosen (P9
      parity). **NEEDS YOUR RULING** — triaged in wave 6. The "disappears" half already holds and
      is pinned: Enter claims the key and SUPPRESSES the split (the in-editor menu in
      `UsjNodesMenuPlugin`, the host palette in its capture-phase Enter claim), so dismissing
      leaves the document byte-identical — `markerMenuHarness.test.tsx`, "Escape cancels the split
      (document unchanged)". The "temporary new line" half does not exist at all; adding it means a
      provisional paragraph kept out of history, out of the save path, and out of the delta sync.
      Manual script item 64.
- [x] **E4** Enter ×2 mid-span with attributes: attributes and closer vanish from the left span, right
      span unwrapped, caret to end. **Two-stage** — the attributes half landed in char-stack, but for
      the whole integration round the production Enter path did not use the fixed code. Real from the
      follow-up round on.
- [x] **E5** Enter ×2 mid-nested-span: unformatted tail, closers gone, caret arbitrary. Same staging
      caveat as E4.
- [x] **E6** Enter in a nested marker in the footnote editor closes but does not reopen after `\fp `.
- [x] **E7** Deleting a whole paragraph including its marker leaves an empty line and `\p` in the file.

## Palettes, menus, apply

- [x] **P1** Backslash after `\p `'s space opens the paragraph palette; should open inline.
      **MIS-SCOPED for two rounds** — the backlog recorded the *book/header region* case and the fix
      made that region offer *paragraph* markers: the mirror image at a different site. Your version
      landed only in fb3, by splitting the content-start probe in two.
- [ ] **P2** `\f` + Space with a selection does nothing. **PARTIAL** — Space-over-selection now wraps
      generally, but wrapping a selection in a *note* is a different operation and no document says
      which happens for `\f`.
- [x] **P3** Use the active palette in Standard view. — decided and shipped in fb-palette-active; the
      trigger `\` no longer lands in the document.
- [ ] **P4** Changing the paragraph marker with the top dropdown does not update the current editor.
      **DIAGNOSED, HOST FIX PENDING** — wave 6. The chain is fully wired and `formatPara` retags
      correctly whenever a selection exists (`Editor.test.tsx`). The dropdown is the only one of the
      four marker-apply surfaces that does not restore the caret first, and opening its popover
      takes focus off the editor, where Lexical's blur processing can null the selection.
      `formatPara` now WARNS rather than returning quietly, so the failure is visible; the repair is
      the host-side selection restore the `\` and Enter palettes already perform. Manual script
      item 65.
- [x] **P5** An empty-filter commit orphans the palette. — fixed, then **deliberately reversed**: P9
      leaves a zero-match palette open, and the dismissal was this project's invention. Do not re-file.
- [x] **P6** Space with a non-collapsed selection should wrap like Enter.

## Attributes and attribute markers

- [x] **A1** Typing the closer `\w*` deletes the default attribute.
      **NOT-REPRODUCED** — green at both anchors. Pinned on the shape most at risk, `\w`'s BARE
      default attribute (`|G5485`), where the attribute name appears nowhere in the bytes:
      `markerEdit/charAttributeTypedSettle.test.tsx`, "typing a closing marker keeps the span's
      default attribute".
- [ ] **A2** Undo and move off does not settle attribute text into real attribute state.
      **STILL OPEN, but no headless repro.** The premise recorded here was wrong: char attribute runs
      ARE covered — the display-run registry carries a `char` descriptor with all nine duties, and the
      reported gesture was already pinned (`markerEdit/markerEditUndoResettle.test.tsx`). What that pin
      lacked was the app's real plugin stack, since this run kind is jointly owned by `CharNodePlugin`'s
      sync and its documented failure mode is the two interacting. Re-run with both syncs around the
      engine: still green. Also green for a named attribute, `\w`'s bare default, a second attribute
      appended to an existing run, and — correctly — NOT parsed on an unclosed span, where the
      tokenizer agrees the `|` bytes are content. Pinned: `markerEdit/charAttributeTypedSettle.test.tsx`.
      Needs a precise repro from the owner; see the handoff.
- [x] **A3** `ca`/`cp` on a chapter do not display at all. — both display and edit; `cp` shipped in
      its inline form by owner choice, own-line layout ticketed separately.
- [x] **A4** `cat` on notes and `esb` does not display. — notes now build the run
      (**editable-expanded only**; collapsed deliberately shows nothing). The `esb` half was
      **refuted**: sidebar `cat` does render, pinned by test. If your repro was a collapsed note or a
      real project rather than a headless fixture, re-check.
- [x] **A5** Milestone attributes reorder; authored order should survive. — fb-milestone-order. The
      original diagnosis was wrong: order was lost at **load**, not in the fold.
- [x] **A6** Typing `vp` after a verse marker makes crazy logs. Part of the log-storm class — see
      **S4-S7** for the diagnosis. Editor-side pin: `markerEdit/logStormGestures.test.tsx`,
      "`\vp` typed right after a verse marker".
- [x] **A7** `closed="false"` on USJ↔editor state and on deltas. **WEAK** — the collab pin was
      *born green*; nothing was repaired. Worth saying what you originally saw.

## Milestones

- [ ] **M1** Typing `\qt-s ` then `\*` eats the space and jumps the caret forward one.
      **UNVERIFIED** — fb2's typed-byte matrix claims no kind discards a typed byte any more, but
      this repro is named nowhere.
- [x] **M2** The milestone marker name is editable on screen and silently never persists.
      Fixed in `sv/fb5/milestone-edit` (merged to `sv/residual-backlog`), not by this round —
      the fixed-point signature folded a milestone's sid/eid/attributes but not its `marker`, so a
      rename compared equal, the rebuild was refused as a no-op, and the stale marker survived into
      the file. Confirmed RED at this branch's pre-rebase base by running that branch's own test here.
      Pinned: `markerEdit/milestoneMarkerEdit.test.tsx`.

## Unknown and opaque blocks

- [x] **U1** Typing a marker that becomes an unknown block is messy and hides following content.
      **PARTIAL** — fixed for `\tr` and for the stranded-caret class; an arbitrary unknown marker
      (`\asdf`) typed mid-paragraph was found only in a later round.
- [x] **U2** `\tr ` mid-paragraph makes a mess. — the row rendered no opening glyph in any marker
      mode. Residual: deleting a `\tr ` glyph does not rejoin the paragraph (no settle scope in tables).
- [x] **U3** `\fig ` does not gray out. **DEFERRED** — owner decision: a `\fig` with no attributes is
      genuinely not a figure yet.
- [x] **U4** Adding attributes to a typed `\fig` loses its text content. — a keystroke reaching an
      opaque block's token-mode text replaced all of it; blocks stay read-only and the keystroke is
      refused.
- [ ] **U5** Unknown blocks do not let you copy the marker name. **TESTED, SPLIT IN TWO** — wave 6.
      The register's own guess was wrong: the marker name IS real DOM text (the decorator writes it
      into its element), and a selection spanning the block carries the block's full USFM in both
      `text/plain` and the internal Lexical payload — now pinned in
      `whitespaceDisplay.plugin.utils.test.tsx`. Two halves of the report survive: `text/html` drops
      the whole block, so a paste into a word processor loses the marker name AND the caption; and
      the block cannot be selected on its own, because it is read-only by the U6 ruling. Manual
      script item 66.
- [x] **U6** Unknown content is not editable at all. **DEFERRED** — owner decision: read-only, with
      the keystroke now visibly refused rather than silently swallowed.

## Settle, loops, logs

- [x] **S1** Undo undoes USFM-equivalent settles. **DEFERRED** — multi-step gestures are deliberately
      multi-step in history. Note this answers "why two steps", not your actual question: why a settle
      that changed no USFM consumes an undo at all.
- [x] **S2** Settle after debounce, P9-style. — shipped with a 1000 ms idle timer firing the *same*
      settle computation as caret departure, so the two clocks cannot drift. Configurable in fb.
- [x] **S3** Deleting the `*` on `\va*` then moving into `\v 2` freezes the app. — two defects: span
      combination across rendered glyphs, plus byte-based piece classification. Cascade-depth backstop
      added.
- [x] **S4** Backslash-bar endlessly logs "deferring an incoming PDP update".
- [x] **S5** Double-slash optbreak endlessly logs the same.
- [x] **S6** Newline + `\p` + typing endlessly logs the same.
- [x] **S7** Typing unsupported grayed-out markers makes crazy logs.
- [x] **S8** Inline marker, content after the closer, delete the closer: crazy logs. Content half was
      already fixed; the log half is resolved with S4-S7 below.

      **S4-S7, A6 and S8's log half are ONE class, and it was fixed in the HOST before Phase 3 even
      branched** — which is why no track here owns it and why the editor-side bisect is green at both
      anchors. That host line fires once per PDP update that disagrees with the editor while the
      editor is focused, so an endless run of them needs an endless run of PDP updates, which come
      from the editor saving. Three candidate drivers were checked:
      (1) a non-idempotent `usj -> usx -> usj` round-trip, which the host's own damping comment names
      as the shape that sustains the loop — every reported pattern reaches a fixed point, the only
      diffs being USJ key order, which the host compares structurally;
      (2) the editor cycling commits — bounded for all six gestures, and equally bounded at the
      anchor;
      (3) the deferral path logging without a bound — this was the real one. paranext-core now logs a
      single warn at the non-convergence threshold with debug otherwise (2026-07-15) and damps the
      echo loop outright (2026-08-03), and already pins all three behaviors in
      `use-editor-pdp-sync.hook.test.ts`.
      Editor-side pins: `markerEdit/logStormGestures.test.tsx`, one commit bound per reported gesture.
      **Not settled:** whether ParatextData's own USX -> USFM -> USX leg is idempotent for these
      shapes. It sits between the two converter calls and is invisible from this repo — manual check.

## Notes and footnotes

- [x] **N1** Adding a footnote on a non-nested consecutive inline marker nests it and deletes the
      closing marker. **FIXED THIS ROUND.** Reachable by the most ordinary gesture there is — caret at
      the end of the word, or the word selected, then add a footnote. Both land the insertion point on
      the boundary before the span's closing glyph, where Lexical's `selection.insertNodes()` SPLITS
      the span; the orphaned closer-only half is then read as "opener deleted" and `$unwrapCharNode`
      drops every glyph on unwrap. `$insertNoteWithSelect` now places the note at that one boundary
      itself (`libs/shared-react/src/nodes/usj/note.utils.ts`). Pinned:
      `markerEdit/noteInsertion.test.tsx`, "note insertion at a closed char span's content end".
- [ ] **N2** `\fp` does not render as a new line. *Not in this effort's record* — it is a known issue
      in a July document (popover inserts a plain line break) that dropped out of scope.
- [x] **N3** `\p` is visible in the footnote editor. — fb-footnote-editor.
- [x] **N4** Ctrl+T with the caret on a verse-number marker duplicates the verse digit into body text.
      **NOT-REPRODUCED** — green at both anchors. Pinned anyway because it rides the same insertion
      path N1 broke, at the other place that path meets engine-owned display bytes:
      `markerEdit/noteInsertion.test.tsx`, "footnote insertion on a verse marker keeps the verse
      number out of body text".

## Ctrl+Space

- [x] **X1** Ctrl+Space in nested chars handles only the innermost. — closes innermost-out, emits an
      unstyled space, reopens outermost-in.
- [x] **X2** Ctrl+Space in `ft` adds a space and another `\ft` instead of closing then opening.
      **RULED (owner): the report was right.** A footnote character marker IS a character format, so
      Ctrl+Space strips it, matching Paratext 9 — `\ft` alone becomes `\ft* \ft `, and a `\+nd`
      nested inside it closes and reopens both levels. Without the emitted closer the space is
      trailing content of the still-open `\ft`, so the feature was a silent no-op inside a note.
      The earlier convention is NOT retired, only narrowed: it governs marker INSERTION, where
      writing `\fq`/`\fp` is itself how the `\ft` ends and no closer is emitted. The two gestures
      share the close-and-reopen primitive and are now told apart by an explicit per-caller option.
      Pins: `charFormatting.utils.test.tsx` (four Ctrl+Space cases — flat, nested, range, content
      end), `charStack.utils.test.ts` (the primitive), and the insertion side in
      `markerMenuApply.utils.test.tsx` and `noteEnterFp.test.tsx`.
- [x] **X3** The Ctrl+Space space lands inside the surviving outer span.

## View modes and other

- [x] **V1** Standard view in Simple mode does not lock paragraph structure. **SHIPPED — verified in
      wave 6.** Standard is unreachable in Simple mode by three mechanisms in paranext-core
      (`resolveViewTypeForInterfaceMode`): the default view, the view cycle, and coercion of a
      `standard` persisted from a power-mode session — unit-tested there. Made MOOT rather than
      fixed in place: structure protection is still derived independently of the view type, so the
      answer was to make the combination unreachable. The decision itself was never written down —
      the doc that posed it stops at "tell us which you want". Manual script item 67.
- [ ] **V2** USFM project styles are not looking great. *No record* — owner said this was being handled
      elsewhere.
- [x] **V3** Verse bridging (`\v 5-6`) — owner reported it *seems fine*, and it is; pinned by
      `markerEdit/verseBridge.test.tsx`. A loaded bridge keeps its bytes in the glyph, the node, the
      serialized USJ and the emitted USX, and typing `-6` onto `\v 5` retags the verse. The
      note-reference leg was already pinned in shared-react's `node-react-utils.test.ts`.
      **One divergence found and pinned:** with the bridge HALF typed (`\v 5-`) the screen and the
      node both carry the trailing separator and the serializer does not —
      `parseNumberFromMarkerText` truncates to the last complete token and then overrides the node's
      faithful number, so a save mid-bridge silently drops a byte the screen is showing. The fix is
      a decision about what a verse number may contain; the narrowest candidate is to let the token
      end on a trailing `-`/`,`.
- [x] **V4** testUSFM **rendering** check — landed in wave 6 as a rendering leg on the two corpus
      suites that already mount the editor (`corpusRendering.test-helpers.ts`): a node that reports
      text content must render it, at load and again after the dirty pass. Stated over
      `TextNode`/`DecoratorNode` rather than a class list, so CSS-generated glyphs fall out of scope
      by construction; verified discriminating by blanking a decorator's `createDOM`. Costs no extra
      mounts. What it CANNOT check is anything the stylesheet paints — no stylesheet is loaded in
      any test, and whole view modes are painted by `content: attr(...)` over `font-size: 0` text.
      That needs the browser or visual-regression harness this repo does not have.
- [ ] **V5** Indicate when something can only be deleted, not edited (atomicity affordance).
      *No record anywhere.* Explicitly routed away as separate product design.
- [ ] **V6** Top toolbar has no inline markers. **DEFERRED** — owner deprioritized.

---

## Summary

| | Count |
| --- | --- |
| Fixed | 51 |
| Open | 30 |

Counted from the list above after wave 6. The figures this table carried before (44 fixed, 32 open,
21 of the open never scoped) did not match the list even then — recount before quoting them.

**Never scoped in any plan, handoff, backlog, or follow-up round:**
C1, C5, C6, K12, W3, W4, E3, P4, A1, A2, A6, M2, U5, S4, S5, S6, S7, N1, N2, N4, V1–V6.
(Wave 6 has since triaged E3, P4, U5, V1, V3 and V4 — see their entries.)

**Highest consequence among those** — all are silent data loss or fabricated bytes:
**M2** (milestone name edits never persist), **A1** (`\w*` destroys the default attribute),
**W4** (wrap emits no separator, so the marker renames on settle), **A2** (typed attribute text never
settles), **K12** (fabricates an empty pair in the file), **N1** (note insertion deletes a closer),
**N4** (Ctrl+T duplicates the verse digit).
