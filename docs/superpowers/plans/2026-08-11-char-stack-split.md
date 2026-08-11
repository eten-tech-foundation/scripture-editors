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
- **`\fp`, marker-dropdown insertion, and paragraph splits are NOT this primitive.** They rely on
  implicit parser closing with no reopen; PT9 drops character styles across a paragraph split. See
  the open question below.

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

## Open question — blocking task 11's scope only

The product owner wants Enter inside a note to close AND reopen the stack around `\fp`:

```
\ft test \+nd as\+nd*\fp \ft \+nd df\+nd* test
```

PT9 does not do this — its `\fp` path closes implicitly and never reopens. The owner cited `\fq`
insertion as behaving that way. **Confirm whether `\fq` mid-nesting actually reopens the stack in
Platform.Bible today.** If it does, this primitive gains a second caller and the note-Enter case
joins this track. If it does not, the reopen-on-`\fp` behavior is a new product decision and should
be scoped separately rather than smuggled in here.
