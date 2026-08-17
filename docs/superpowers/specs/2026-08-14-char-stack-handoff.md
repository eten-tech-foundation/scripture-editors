# Char-stack split primitive: handoff

Branch `sv/char-stack`. Plan: `docs/superpowers/plans/2026-08-11-char-stack-split.md`. Governing
invariants: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`.

The plan was right that this is an extraction of working code rather than a new build, and right
about where the working code lives. Four of its five callers now go through the extracted primitive.
The corrections below are the useful part of this document.

---

## 1. What shipped

**The primitive** — `libs/shared/src/nodes/usj/charStack.utils.ts`, new, exported from `shared`:

| Export | What it is |
| --- | --- |
| `$liftOutOfChar` | The single-level close-and-reopen, moved verbatim from `usj-marker-action.utils.ts` (two behavior changes, §3). |
| `$liftOutOfCharStack` | The driver: iterates the above outwards until the node reaches its container, or the optional `stopAt` span. |
| `$innermostCharAncestor`, `$charStackContainer` | Moved from `usj-marker-action.utils.ts` (`$charContainer` renamed and generalized to take any node). |
| `$isCharContentEmpty` | New. "This span holds only its glyphs and their structural separator", the rule that decides whether a half survives. |

Closer ordering still falls out of the loop shape rather than from ordering code, exactly as the plan
described; the module doc says so at the extraction site so the next reader does not add an explicit
sort.

**The callers.**

| Caller | Before | After |
| --- | --- | --- |
| `\fq` + Enter — `$applyNonNestInsideChar` | The reference implementation | Unchanged behavior; now calls `$liftOutOfCharStack` |
| Ctrl+Space — `$removeCharFormattingFromSelection` | Split the innermost span only, space landed INSIDE the surviving outer span | Space is placed at the caret and lifted out of the whole stack, so it belongs to no span |
| Ctrl+Space on a range | Declined the key when the range held no char spans | Always handled; still inserts no space |
| `\fp` + Enter — `$startFpAtCaret` | Closed the stack, never reopened; collected only the anchor's own siblings | Break marker lifted out of the spans nested inside the note-content child, so nested styles reopen inside the `\fp` and the outer span's trailing content rides along |
| Paragraph split mid-span — new `$splitParagraphAtCharStack` | Lexical's generic inline split | `MarkerEditPlugin`'s INSERT_PARAGRAPH handler claims the command and splits through the primitive |

**Files touched.** `libs/shared/src/nodes/usj/charStack.utils.ts` (+ test, + `index.ts` export);
`packages/platform/src/editor/markerEdit/charFormatting.utils.ts` (+ test);
`packages/platform/src/editor/markerEdit/markerEditNote.utils.ts` (+ `noteEnterFp.test.tsx`);
`packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (one command handler);
`packages/platform/src/editor/adaptors/usj-marker-action.utils.ts` (the extraction site);
`packages/platform/src/editor/markerEdit/charStackParagraphSplit.test.tsx` (new).

`usj-marker-action.utils.ts` and `MarkerEditPlugin.tsx` are not claimed by any track in the
invariants' ownership table. The edits to them are the extraction itself and a single command
handler; flagging them here rather than assuming silence meant consent.

---

## 2. Plan tasks, one by one

Plan tasks 1-8 and 10 are green as behaviors, all red-first. Task 11 (extract the primitive) moved
early as the plan itself directed.

| Plan task | Where |
| --- | --- |
| 1 depth-1 space is unstyled, 2 depth-2 close order, 3 depth-2 reopen order | `charFormatting.utils.test.tsx`, "closes innermost-out, emits an unstyled space, and reopens outermost-in" — one USFM-bytes assertion covers all three |
| 4 caret placement | "lands the caret immediately after the space" |
| 5 space reuse | "reuses the space one character ahead instead of inserting a second one" (depth 2), plus the pre-existing depth-1 PT9-parity test |
| 6 run start | "drops the opened span rather than reopening an empty one at a run's start" |
| 7 run end, nothing after | "closes the stack without reopening it when nothing follows the caret" and "…but text follows the span" |
| 8 inside a note | "closes and reopens note-content spans but not the enclosing note" |
| 9 range selection | "claims a range with no character styles and inserts nothing" and "leaves no empty marker pair when the range covers a span's whole word"; the three coverage cases were already covered and stay green |
| 10 plain text | pre-existing "inserts a plain space when the caret is in plain text" |
| 11 extraction | `charStack.utils.ts` + `charStack.utils.test.ts` |

Task 3's target string from the plan reproduces byte-for-byte:
`\wj \+nd thing\+nd*\wj*` with the caret between `thi` and `ng` yields
`\wj \+nd thi\+nd*\wj* \wj \+nd ng\+nd*\wj*`.

---

## 3. Where I diverged from the plan, and why

**Two behavior changes inside the extracted `$liftOutOfChar`.** The plan called this a verbatim
move. It is not quite:

1. **A half with only its glyphs AND their separator is dropped**, where the original tested
   `getChildren().every($isMarkerNode)`. Without this, plan task 6 (caret at a run's start) reopens
   an empty `\nd \nd*` at every level above the innermost. The old Ctrl+Space code already used the
   stronger rule locally; it is now the shared one. All reference-path tests stayed green under it.
2. **A span's display run stays with the span whose state it renders.** The `|name="value"` bytes
   sit between the content and the closer, so the old collection carried them into the continuation —
   which `$continuationCharAttributes` deliberately gives no attribute state. The result was
   attributes displayed on a span that does not have them and missing from the span that does. This
   is the same content-versus-presentation split `$unwrapCharNode` already makes.

**`\fp` + Enter reopens the NESTED stack, not the note-content span itself.** The plan's caller table
says the `\fp` path "closes the stack, never reopens", which read literally would mean
`\ft A \fp \ft note` — the `\fq` shape with `fp` substituted. I did not do that. An `\fp` marks a new
paragraph *within* the note, so it replaces `\ft` as the note's content container; reopening `\ft`
after it would add bytes to every flat-note Enter and change 27 existing green tests' shape for a
case that has no defect. What I fixed is the two defects the plan actually names — the dropped nested
styles and the stranded outer-span content:

```
\f + \ft A \+nd ho|ly\+nd* B\f*      (caret at |)
before:  \f + \ft A \+nd ho\+nd* B\fp ly\f*      " B" stranded before the break, \nd dropped
after:   \f + \ft A \+nd ho\+nd*\fp \+nd ly\+nd* B\f*
```

**This is the one place I want a decision** (§6).

**Range Ctrl+Space: one defect fixed, one deferred.** The plan names only the decline. Probing the
range path turned up a second, worse defect that is not about nesting at all — selecting the WORD
(what a double-click gives, so the range starts at offset 1, past the structural separator) split the
span instead of unwrapping it and left the emptied half behind as fabricated bytes:

```
\p \nd holy\nd*        select "holy", Ctrl+Space
before:  \p \nd \nd*holy      <- an empty marker pair, in the file
after:   \p holy
```

Fixed by giving the range branch the same content-emptiness rule the lift uses
(`$dropContentEmptySpans`).

What is still deferred is making the range STACK-aware. Inside `\wj \+nd holy\+nd*\wj*` it now
yields `\p \wj holy\wj*` — inner style cleared, empty pair gone, outer style still applied. The
reason is structural, not effort: the range branch decides "does the selection start/end mid-span"
by TEXT OFFSET inside the span's own direct text child. At an outer level the boundary is a child
INDEX, not an offset, so both tests read false and the code falls through to unwrapping the whole
outer span — including the parts the user did not select. Fixing it properly needs boundary detection
by child index AND a decision about what happens to a fully covered attributed span's `|name="value"`
bytes, which today are reconstructed as literal text by `$unwrapCharNode` — a function the
invariants' contended-file table assigns to the marker-resolution track. That is why I stopped. See
§6.

**I never touched `$unwrapCharNode`.** The plan asked me to confirm which way that would go. The
split fix stops a glyph-less continuation span from being produced at all, so the unwrap is never
reached on this path and `markerEditDeletion.utils.ts` is untouched. The marker-resolution track can
treat that function as uncontended by me.

---

## 4. Verified

Foreground runs, this branch, after the final edit.

- `packages/platform`: 55 files, **1038 passed, 5 skipped** — the same 5 skips as before this work
  (2 in `corpus-testusfm-round-trip`, 3 in `corpus-transform-fixed-point`). No new skips.
- `libs/shared`: 33 files, 475 passed. `libs/shared-react`: 26 files, 1533 passed / 2 pre-existing
  skips. `packages/utilities`: 28 passed. `packages/scribe`: 2 passed.
- Corpus: `tier2Rebuild.corpus` reports **141 paragraphs checked, 0 skip-listed**. The transform
  fixed-point suite is green.
- `nx run-many -t typecheck lint` across all 10 projects: success, 0 errors. The remaining warnings
  are the pre-existing `no-console` / `jsx-a11y` ones in `scribe` and `perf-vanilla`.
- `eslint` and `prettier --check` run directly from the repo root over every changed file: clean.
- `nx run-many -t extract-api`: API reports up to date. `libs/shared` has no extract-api target, so
  the new exports have no report to regenerate.

I did NOT use `nx run-many -t test`: the sibling worktrees were running their own suites and the Nx
project graph timed out at load average ~150. Each project's vitest was run directly instead, which
covers the same files.

---

## 5. Deliberately not done

- **Stack-aware range Ctrl+Space** (§3). Depth-1 is now fully correct; a nested range clears the
  innermost level only. Needs a `$unwrapCharNode` decision that is not mine to make.
- **Multi-line paste through a char stack.** `@lexical/clipboard`'s text/plain handling calls
  `selection.insertParagraph()` directly per newline rather than dispatching
  INSERT_PARAGRAPH_COMMAND — `MarkerEditPlugin`'s own PASTE handler already documents this and arms
  `splitExpected` by hand for the same reason — so a pasted line break landing mid-span still takes
  the generic split. Enter and the in-note paste break both go through the fixed paths. Not one of
  the plan's five callers; the fix I would recommend is in §6.
- **The caret half of bug 1.** Owned by the structural-deletion-and-caret track. The split now parks
  an element point at the new paragraph's start, which is the shape `$injectMarkerPrefix` recognizes,
  so the caret ends at the paragraph's content boundary — before the reopened span, per
  `$placeCaretAtBoundary`'s existing element-content convention. Whether it should instead descend
  INTO the reopened span is a caret-track question, not one I invented an answer to.
- **The shared test for bug 1's caret symptom.** The plan says structural-caret and I should agree on
  who writes it. I have not been able to reach that chat, so I wrote only the content assertions
  (`charStackParagraphSplit.test.tsx`) and left the caret assertion to them; the fixtures there are
  ready to extend.
- **Nothing in C#.** This track never reached the USJ/USFM or USX/USFM serialization paths, so the
  approval gate was never in play.

---

## 6. What I want signed off

**One design question.** Should `\fp` + Enter reopen the note-content span (`\ft`) as well as the
nested spans? I implemented "no" (§3) because it keeps the flat-note behavior identical and matches
what `\fp` means structurally. If the intent was the literal `\fq` shape —
`\ft A \fp \ft note` for every Enter in a note, flat or nested — say so and it is a two-line change
(drop the `stopAt` argument), but it changes the bytes of every existing footnote break.

**One scope call to confirm.** The stack-aware range clear (§3) needs child-index boundary
detection and an answer for a fully covered attributed span's literal `|name="value"` bytes. The
second half lands on `$unwrapCharNode`, which the contended-file table gives to marker resolution, so
I stopped rather than change it. If you want it in this track, it needs that coordination first.

**One recommended follow-up with a bigger blast radius.** The paragraph-split fix intercepts
INSERT_PARAGRAPH_COMMAND, which Enter dispatches but `@lexical/clipboard`'s text/plain paste does
not. Both could be fixed at once by teaching `CharNode.insertNewAfter` to build a real continuation:
Lexical passes it an element point carrying the split index, so it can insert the left half's closing
glyph before the children that are about to move and return a continuation carrying the opening
glyph, and Lexical's own `newElement.append(firstToAppend, ...)` then completes the shape at every
nesting level. That would make the generic split correct for every caller and let the INSERT_PARAGRAPH
interception be deleted. I did not do it: it changes a `shared` node class for all three apps and
every view mode, and the plan specified the caller-side fix. Worth doing deliberately, not as a
drive-by.

**One cross-track finding, for the whitespace track.** A Ctrl+Space that emits its space at the very
end of a paragraph loses it: `$textNodeTrailingSpaceTransform` (`TextSpacingPlugin.tsx:160`) empties
any lone-space text node whose next sibling is not a verse, and that branch runs BEFORE the
`$isParaLikeNode(parent) && node.is(parent.getLastChild())` exemption two lines below it. This is
invariants §7's "deleting a lone space" defect reached from a new direction, and writer rule 3 says
the trailing space is free in the file. I did not touch that file — it is the whitespace track's. The
test that would have caught it (`"closes the stack without reopening it when nothing follows the
caret"`) runs on the char-sync-only harness and says why at the call site; move it to the full
harness once the transform is fixed.

---

## 7. What to test by hand

Standard view, editable markers, expanded notes where relevant.

1. **Ctrl+Space at depth 2.** Type or load `\wj \+nd thing\+nd*\wj*`, put the caret mid-word, press
   Ctrl+Space. Expect two full stacks with a genuinely unstyled space between them, caret after the
   space. Check the saved USFM, not just the screen.
2. **Ctrl+Space over a double-clicked word inside `\nd`.** Expect the style gone and NO leftover
   `\nd \nd*` in the saved USFM. Nested (`\wj \+nd holy\+nd*\wj*`), expect `\nd` gone and `\wj`
   still applied — that second half is the deferred piece in §6, not a surprise.
3. **Ctrl+Space at a run's start and at a run's end.** At the start, expect no empty `\nd \nd*` left
   behind. At the very end of a paragraph, expect the space to survive the save — this is the one in
   §6 that currently does not, and is the fastest way to confirm the whitespace fix when it lands.
4. **Ctrl+Space over a selection of plain text.** Expect nothing to happen. Before this change the
   browser typed a literal space over the selection, deleting it.
5. **Enter mid-word inside `\nd`, then inside `\wj \+nd …\+nd*\wj*`.** Expect the tail in the new
   paragraph still styled, with its closing markers and its `+` nesting intact. Then check where the
   caret is and whether typing goes where you expect — that is the open caret question in §5.
6. **Enter mid-word inside a nested span in a footnote** (`\ft A \+nd holy\+nd* B`, caret inside
   `holy`). Expect `\+nd` reopened inside the `\fp` and `" B"` to follow the break, not precede it.
7. **Enter in a plain flat footnote** (`\ft A note`). Expect exactly the old behavior — this is the
   regression check for §6.
8. **Undo each of the above once.** Each of these happens inside a single `editor.update`, so one
   undo should restore the original completely — worth confirming, since I checked the update
   boundary in code but did not exercise undo end-to-end.
