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

**A footnote char marker ENDS the span it is written inside; it does not close and reopen it.**
This is an owner correction to the plan, which recorded the `\fq` apply as already correct. It was
not: it reopened an `\ft` after the new marker.

A note-content marker carries the implicit-close convention (`closed="false"`, no closing glyph) and
is terminated by the next bare marker. So writing `\fq` — or `\fp`, or `\xt`, or any of them — at a
caret inside `\ft` IS how that `\ft` ends. No `\ft*` is emitted, no `\ft` is reopened, and
everything after the caret becomes the new marker's content. Explicitly-closed spans in between
(`\+nd`) still close and reopen, now inside the new marker.

```
\f + \ft A \+nd ho|ly\+nd* B\f*                     (caret at |, press Enter or apply \fq)

\fp before this work:  \f + \ft A \+nd ho\+nd* B\fp ly\f*
\fq before this work:  \f + \ft A \+nd ho\+nd*\fq \ft \+nd ly\+nd* B\f*
both, now:             \f + \ft A \+nd ho\+nd*\fp \+nd ly\+nd* B\f*
```

The rule lives in the primitive as `$endsImplicitly`, keyed on BOTH spans carrying `closed="false"`,
so it discriminates correctly in the cases that must NOT change:

| At a caret inside | Applying | Result |
| --- | --- | --- |
| `\ft` (implicit) | `\fq`/`\fp`/`\xt` (implicit) | `\ft` ends; new marker takes the remainder |
| `\ft` (implicit) | `\w`/`\add` (explicit) | `\ft` closes and REOPENS after the new span |
| `\wj` (explicit) | anything | `\wj*` emitted, `\wj` REOPENS |

A range SELECTION still reopens in every case: the new marker's extent ends where the selection
does, so the text after it needs its style back.

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

- **Multi-line paste mid-span** — the only char-stack route still taking the generic split. §6b has
  the measured damage and two candidate fixes with their blast radius.
- **Bug 1's original caret symptom** — "caret landing at the end of the new paragraph" — is gone
  without being fixed: it came from the unwrap's reinsertion loop, and the split no longer produces a
  span for the unwrap to run on. Where the caret goes after a split is now settled (§6c).
- **The shared test for bug 1's caret symptom.** The plan says structural-caret and I should agree on
  who writes it. I have not been able to reach that chat, so I wrote only the content assertions
  (`charStackParagraphSplit.test.tsx`) and left the caret assertion to them; the fixtures there are
  ready to extend.
- **Nothing in C#.** This track never reached the USJ/USFM or USX/USFM serialization paths, so the
  approval gate was never in play.

---

## 6. Open items and settled ones, with enough detail to act on without me

### 6a — DONE. Range Ctrl+Space now clears every level

Owner decision: Ctrl+Space over a selection is an unformatter, so it strips the style at every
level, and a span left with nothing goes. Attribute bytes survive as literal plain text, exactly as
`$unwrapCharNode` writes them.

```
\p \wj \+nd holy\+nd*\wj*          select "holy"  ->  \p holy
\p \wj A \+nd holy\+nd* B\wj*      select "holy"  ->  \p \wj A \wj*holy\wj  B\wj*
\p \w holy|grace\w*                 select "holy"  ->  \p holy|grace
\p \w holy|gloss="stuff"\w*         select "holy"  ->  \p holy|gloss="stuff"
```

Implemented by splitting the boundary text at the selection edges and lifting each covered node out
of its whole stack, so the close/reopen at every level is the shared primitive rather than a second
implementation. The primitive now also re-emits a dropped span's attribute bytes through
`canonicalAttributeText` — the same serializer `$unwrapCharNode` uses, so the two paths cannot spell
the same attributes differently.

### 6b. Multi-line paste mid-span still takes the generic split

**Repro.** Standard view. `\p \nd thing\nd*`. Put the caret between `thi` and `ng`. Paste two
lines of plain text (`"one\ntwo"`).

**Now** (measured): `["\p \nd thione", "\p twong"]`. The closing marker is gone from the left half
and the span's own tail `ng` has been stranded, unformatted, after the pasted `two` in the new
paragraph — the same damage Enter used to do, plus a reordering.

**Why.** `@lexical/clipboard`'s text/plain handling calls `selection.insertParagraph()` directly per
newline instead of dispatching INSERT_PARAGRAPH_COMMAND, which is the hook the Enter fix uses.
`MarkerEditPlugin`'s PASTE handler already documents this and arms `splitExpected` by hand for the
same reason.

**Two ways to fix it, and they differ in blast radius.**

*Narrow:* claim the paste path as well, the way Enter is claimed. Fixes only paste.

*Wide:* teach `CharNode.insertNewAfter` to build a real continuation. Lexical's `$splitNodeAtPoint`
hands it a `RangeSelection` whose anchor is an ELEMENT point on the span carrying the split index,
so it can (a) insert the left half's closing glyph at that index, before the children about to move,
and (b) return a continuation carrying the opening glyph with the right nesting and `closed` state.
Lexical's own `newElement.append(firstToAppend, ...firstToAppend.getNextSiblings())` completes the
shape, and because `$splitNodeAtPoint` recurses up the inline ancestors it works at every depth.

**I spiked the wide fix and measured it, then reverted.** Fixture `\p \nd thing\nd*` (and
`\p \wj \+nd thing\+nd*\wj*` for the depth-2 row), caret at `thi|ng`, full plugin stack:

| Route | Today | Wide fix, spiked |
| --- | --- | --- |
| Enter, depth 1 | `["\p \nd thi\nd*", "\p \nd ng\nd*"]` (already fixed) | same |
| Enter, depth 2 | `["\p \wj \+nd thi\+nd*\wj*", "\p \wj \+nd ng\+nd*\wj*"]` (already fixed) | same |
| multi-line plain-text paste `"one\ntwo"` | `["\p \nd thione", "\p twong"]` | `["\p \nd thione\nd*", "\p two\ndng\nd*"]` |
| `insertNodes` with a block node | `["\p \nd thi", "\pBLOCKng "]` | `["\p \nd thi\nd*\pBLOCK\nd ng\nd*"]` |
| `insertNodes` with an inline node (verse) | `["\p \nd thi \v 5 ng\nd*"]` — verse swallowed INTO the span | `["\p \nd thi\nd* \v 5 \nd ng\nd*"]` — verse between two intact spans |

**Two findings that make the wide fix bigger than it looks. Do not adopt it as written.**

1. **It cannot supply the opener separator, and the missing space CORRUPTS.** Look at the paste row:
   `\ndng`, not `\nd ng`. `insertNewAfter` returns BEFORE Lexical moves the children in, so it has
   no leading text node to prefix the structural NBSP onto — the eager prefix
   `$buildContinuationCharSpan` does is not available there. The separator sync does not fill it in,
   because the caret sits at that very boundary and the sync's mid-edit grace leaves it alone. Moving
   the caret away then makes it worse, not better: the settle re-tokenizes the bytes and `\ndng`
   becomes a marker named `ndng` in a paragraph of its own —
   `["\p \nd thione\nd*", "\p two", "\ndng "]`. Measured.
2. **It does not place the caret, so the interception cannot simply be deleted.** With the wide fix
   on and `$splitParagraphAtCharStack` disabled, Enter then typing `X` gives
   `["\p \nd thi\nd*", "\p X\ndng\nd*"]` — `X` outside the reopened span, losing §6c. Lexical's
   `insertParagraph` ends with `newBlock.selectStart()`, which lands on the opening glyph.

So the wide fix is the right shape but needs a separator answer and a caret answer before it can
replace anything. The narrow fix (claim paste) buys the paste row only and leaves the verse row.

**View modes.** `insertNewAfter` cannot see `ViewOptions`, so it must infer glyph emission from the
span's own children ("does `this` have an opening `MarkerNode` child"), the same inference
`$buildContinuationCharSpan` makes via `$charHasClosingGlyph`. That is correct for **editable**
(MarkerNode children present → emit) and **hidden** (none → emit none). **"visible" mode is a gap**:
its marker bytes are `ImmutableTypedTextNode`s, not `MarkerNode`s, so the inference says "no glyphs"
and the continuation comes out with no visible marker bytes. Not a regression — today it emits
nothing either — but the wide fix would leave visible mode unimproved unless it also materializes
that shape.

### 6c — DONE. The caret continues the reopened style

Owner decision: after Enter inside a char stack, typing continues the reopened run.

```
\p \wj \+nd thi|ng\+nd*\wj*     Enter, then type X

before:  ["\p \wj \+nd thi\+nd*\wj*", "\p X\wj \+nd ng\+nd*\wj*"]
after:   ["\p \wj \+nd thi\+nd*\wj*", "\p \wj \+nd Xng\+nd*\wj*"]
```

The caret now goes to the start of the reopened span's content, past its structural separator,
descending to the innermost span — the same `$selectCharContentStart` rule the in-note `\fp` break
uses. It is only reached when the new paragraph actually starts with a reopened span; when nothing
reopened, the caret stays an element point at offset 0, which is the shape `$injectMarkerPrefix`
recognizes in order to move it to the content side of the prefix it splices in.

"Element point" is the Lexical selection form that addresses (element, child index) rather than
(text node, character offset). `$placeCaretAtBoundary` uses one deliberately for a paragraph whose
content starts with an element such as a char span — that convention is unchanged for every other
caller; only this split path now descends past it.

### 6d. Cross-track finding, for the whitespace track

A Ctrl+Space that emits its space at the very end of a paragraph loses it:
`$textNodeTrailingSpaceTransform` (`TextSpacingPlugin.tsx:160`) empties any lone-space text node
whose next sibling is not a verse, and that branch runs BEFORE the
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
