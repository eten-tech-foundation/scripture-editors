# Char-stack split primitive (Ctrl+Space)

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first — this plan
assumes its invariants and its deliberate-divergence list.

## Goal

Ctrl+Space inserts a genuinely UNFORMATTED space anywhere inside character-styled text: close the
whole open character-style stack innermost-to-outermost, emit a plain space that belongs to no span,
reopen the whole stack outermost-to-innermost.

Target behavior, caret between `thi` and `ng`:

```
\wj \+nd thing\+nd*\wj*   ->   \wj \+nd thi\+nd*\wj* \wj \+nd ng\+nd*\wj*
```

## Why this is one primitive

In Paratext 9 this is not a bespoke algorithm. Ctrl+Space is *"select one space, then apply the
blank character style to it"* — `StyleApplicator.ApplyCharacterStyle` with an empty tag. The same
close-and-reopen engine backs the character-style apply and the style combo box's blank entry.

Two corrections to earlier assumptions, both load-bearing:

- **PT9's reopen order is inverted for nested styles.** Its reopen loop walks `CharTags`
  (innermost-first) and emits index 0 without a `+`, so a two-deep stack comes back with the markers
  swapped. The path is untested in PT9 — its suite only covers single-level cases. **We reopen
  outermost-first.** Port the intent, not the code.
- **In PT9, `\fp`, marker-dropdown insertion, and paragraph splits are NOT this primitive** — they
  rely on implicit parser closing with no reopen, and PT9 drops character styles across a paragraph
  split. **We deliberately diverge on all three.** The owner wants the stack reopened after `\fp`
  and after a paragraph split, and `\fq` already does it correctly. So the primitive gains callers
  PT9 never had; see "Deliberate divergence" below.

## Current defects

1. Only the innermost span is closed — the implementation reads the caret node's direct parent and
   never walks ancestors.
2. **The space is inserted inside the surviving outer span**, so the "unformatted" space still
   carries the outer marker. This defeats the feature even at depth 1 inside a nested structure.
3. On a range selection containing no char spans the handler declines the key, so the browser types
   a literal space. PT9 inserts no space at all on a range.

## Scope

**In:** the shared close/reopen primitive; Ctrl+Space for collapsed caret and range; note-internal
character styles; space reuse; the run-boundary cases.

**Out:** the character-style apply path and the style dropdown adopting the primitive (a follow-up
once it exists and is proven); anything in the whitespace or closers tracks.

## Prerequisites

None. This track is independent of the registry work and of the whitespace track.

## TDD tasks

Each is red-first. Behavior statements, not line references, so the plan survives the branch moving.

1. **Depth-1, space is unstyled.** Caret mid-word in `\nd thing\nd*`; assert the resulting space's
   parent is the paragraph, not a char span. (Guards defect 2 directly.)
2. **Depth-2 close order.** Caret mid-word in `\wj \+nd thing\+nd*\wj*`; assert closers appear
   innermost-then-outermost before the space.
3. **Depth-2 reopen order.** Assert openers appear outermost-then-innermost after the space, with
   `+` on the nested one only — the full target string above.
4. **Caret placement.** Caret lands immediately after the space, at the start of the reopened run.
5. **Space reuse.** With an existing space one character ahead, no new space is inserted; the
   existing one is pulled out of the span. Look forward one character only, never backward.
6. **Run start.** Caret at the very start of a styled run deletes the opener rather than emitting an
   empty `\nd \nd*` span.
7. **Run end, nothing after.** Stack is closed and NOT reopened.
8. **Inside a note.** `\ft`/`\fq`/`\fr` are character styles and must close and reopen; the enclosing
   `\f`/`\x` must not.
9. **Range selection.** No space is inserted; character formatting is cleared over the range. Covers
   fully-enclosed, partially-covered, and interior (three-way split) cases.
10. **Plain text.** Ctrl+Space outside any character style inserts a plain space and moves on — it
    never no-ops and never fails.
11. **Extract the primitive.** One function taking the caret and returning the close/emit/reopen
    plan; Ctrl+Space becomes its first caller. The extraction lands only after 1-10 are green, so the
    refactor is covered.

## Acceptance

- All ten behaviors green.
- The corpus suite stays at its full count with zero skips.
- The transform fixed-point test stays green.
- Lint and typecheck clean in both root and nx contexts.

## Risks

- **Space reuse interacts with the whitespace track.** Reusing an existing intra-span space pulls it
  out of the span, which is a content edit at a site the whitespace track is also changing.
  Coordinate before touching shared separator logic.
- **Closing-glyph spelling.** PT9 builds closers as `marker + "*"` in this path but uses the
  stylesheet's `Endmarker` in its marker menu. We use one spelling; do not introduce a second here.
- **No normalization backstop.** PT9 leans on a global whitespace normalization pass to swallow
  accidental double spaces. We have no equivalent, so each path must be exact rather than
  approximately right.

## The primitive already exists — this track is an extraction, not a build

RESOLVED (owner-confirmed): `\fq` + Enter already does the whole operation correctly. In
`\ft start \+nd asdf\+nd* end` with the caret between `as` and `df`:

```
\ft start \+nd as\+nd*\fq \ft \+nd df\+nd* end
```

with the caret immediately before the reopened `\ft`. The stack closes innermost-to-outermost, the
new marker lands, and the stack reopens outermost-to-innermost — including the implicit close of
`\ft` by the sibling `\fq`. That is the target behavior, and it is a DELIBERATE improvement over PT9,
which never reopens on this path.

**Located.** It is NOT in `markerMenuApply.utils.ts` or `markerEditNote.utils.ts` as this plan
originally guessed. It lives in the adaptor's marker-action module,
`packages/platform/src/editor/adaptors/usj-marker-action.utils.ts`:

- `$liftOutOfChar` (~:561) — the single-level close-and-reopen primitive.
- `$applyNonNestInsideChar` (~:594) — the driver that iterates it up the stack, stopping at
  `$charContainer` (the nearest non-char ancestor: note or paragraph).

The ordering is correct and **falls out of the loop shape rather than from explicit ordering code**:
each iteration closes the current innermost span and reopens a continuation after the lifted node, so
the next iteration's "after" set already contains that continuation. Closers emerge
innermost-to-outermost, openers outermost-to-innermost.

Reached via `$applyMarkerMenuSelection` → `getUsjMarkerAction` → the non-NEST-inside-a-span guard.
NEST-vs-split is stylesheet-driven, which is why `\fq` (no NEST) takes this path and `\nd` (NEST)
nests in place instead. Behavior is already pinned — see the `describe("non-NEST apply from INSIDE a
char span closes and reopens (PT9 StyleApplicator)")` suite in `markerMenuApply.utils.test.tsx`.

**Caret nuance to carry into the extraction:** the code parks the caret INSIDE the new span's own
content, not "before the reopened `\ft`" as this plan previously said. Same screen position,
different tree point. Specify the extracted primitive's caret parameter as a tree point, not as a
description — Ctrl+Space wants a different point than `\fq` does.

So the work is an extraction with **five** callers, not three.

| Caller | Today |
| --- | --- |
| `\fq` + Enter (marker apply) | **Correct.** The reference implementation. |
| `\fp` + Enter (note Enter) | Closes the stack, never reopens. Also has a depth-2 content gap: it collects only the caret's own innermost-span siblings, so outer-span content after a nested span is left behind. |
| Ctrl+Space | Closes only the innermost, and puts the space INSIDE the surviving outer span. |
| **Paragraph split mid-span (new bug 1)** | Lexical's generic inline split runs unmodified. |
| **Paragraph split mid-NESTED-span (new bug 2)** | Same, iterated per level. |

`\fq` + Space does no special insertion at all, consistent with the ratified Space-versus-Enter
split — Space is type-through, Enter is the apply path. Leave it alone.

This reorders the task list: extraction moves EARLY (characterize the working `\fq` path first, then
extract), and the Ctrl+Space and `\fp` behaviors become new callers of proven code rather than new
implementations. Task 11 is no longer a trailing refactor.

**Caret placement differs by caller and is intentional.** The extracted primitive takes a caret tree
point as a parameter rather than deciding it.

## Deliberate divergence: paragraph splits DO reopen the stack

PT9 drops character styles across a paragraph split. We do not. New bugs 1 and 2 are the same defect
at depth 1 and depth 2, and the owner's stated expectation is that the tail is re-wrapped in the same
marker with the same attributes. **Record this as a decision, not an oversight** — a later reader
comparing against PT9 will otherwise "restore parity" and reintroduce it.

### Why the split path breaks today

Lexical's `RangeSelection.insertParagraph` splits every inline ancestor via `$splitNodeAtPoint`,
which calls `CharNode.insertNewAfter`. That builds a continuation span with **no opening glyph, no
closing glyph, and no `unknownAttributes`** — only `closed:"false"` is carried, deliberately. Then:

- **The LEFT span** keeps its opener but has lost its attribute run and its closer to the split. Its
  `unknownAttributes` STATE is untouched, which is exactly why the file still has the attributes
  while the screen does not. It cannot regenerate the run either: the char descriptor's
  `expectedPieces` returns no run when the closing glyph is absent.
- **The RIGHT span** has a non-marker first child, so the deletion transform reads it as
  opener-less and unwraps it. The unwrap then DISCARDS the moved attribute bytes — it filters out
  `textType === "attribute"` children and re-derives replacements from the span's own
  `unknownAttributes`, which the bare continuation span does not have.

At depth 2 the unwrap cascade runs twice, dropping both closers — the reported "unformatted text,
closing markers gone."

**The fix is to make the split a caller of the primitive**: close the stack innermost-to-outermost on
the left, reopen it outermost-to-innermost in the new paragraph, using the `$liftOutOfChar` /
continuation-span shape instead of Lexical's `insertNewAfter`.

### The caret half is NOT this track

Bug 1's third symptom — caret landing at the end of the new paragraph — has a separate cause. The
Enter-menu apply places an ELEMENT point on the paragraph, and the unwrap's reinsertion loop then
drags that point forward past every reinserted child without pulling it back on the matching remove.
That is a general defect of element-point caret placement surviving a same-commit unwrap, not
char-stack-specific. It belongs to the structural-deletion-and-caret track.
