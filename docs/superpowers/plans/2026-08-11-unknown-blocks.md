# Unknown and opaque blocks

Track plan. Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` first.

## Goal

Get unknown and opaque blocks — tables, figures, sidebars, `\periph`, and any marker the editor
cannot model structurally — to a **non-buggy** state. The product owner's stated bar: editable is
fine, read-only is fine, but the current behavior is not.

That framing sets the design order: fix the defects first, decide editability second, once the
defects show which choice is cheaper.

## Current defects

All observed; none diagnosed yet.

1. **Typing a marker that becomes an unknown block is messy and hides the following content.**
   Reported for `\tr ` typed mid-paragraph.
2. **`\fig ` does not gray out** the way other unsupported markers do — inconsistent affordance,
   and concerning because graying is the signal that a marker is not structurally modeled.
3. **Adding attributes to a typed `\fig` turns it gray and messy AND loses its text content.**
   Content loss is the most serious item in this track.
4. **`$textNodeTrailingSpaceTransform` fabricates a trailing space before a block-level unknown.**
   Confirmed by the transform fixed-point test: the `figure (USFM 3 attributes)` fixture turns
   `"Text with figure."` into `"Text with figure. "` on a bare dirty pass. Shared with the whitespace
   track — see coordination below.

## What already works, and must not regress

- Unknown blocks render their full USFM read-only, selectable and copyable.
- A sidebar's `\cat` bytes ARE rendered inside the sidebar's read-only display. This contradicts a
  report that sidebar `cat` "does not show up at all" — **resolve that discrepancy first**, since it
  decides whether the sidebar work belongs to this track or the attribute-markers track.
- Empty opaque blocks stay visible via a minimum height.
- Blocks are excluded from re-tokenization: the tokenizer keeps their text literal, and both the
  backslash and optbreak trigger paths skip them, because a pending literal the engine will never
  rebuild would leave a stuck key.

That last point is the crux of the editability question: **opaque blocks are outside the settle
system by construction.** Making them editable means giving them a settle path, which is the same
missing-piece as the chapter-settle story in the attribute-markers track.

## Scope

**In:** the four defects; the affordance decision (gray or not, and on what rule); a settle story for
unknown blocks IF the editability decision needs one.

**Out:** the whitespace transform rewrite (whitespace track owns the transform; this track owns only
the block-adjacent exemption); note-content display; the display-run registry.

## Prerequisites

None to start. Defect 4 needs coordination, not sequencing.

## TDD tasks

Diagnosis before design — three of the four defects have no root cause yet.

1. **Reproduce and diagnose defect 1** headlessly: type `\tr ` mid-paragraph, capture the resulting
   tree, and identify what "hides the next content" means structurally — content absorbed into the
   block, content still present but not rendered, or content genuinely dropped. Write the failing
   test at whichever layer the loss occurs.
2. **Reproduce and diagnose defect 3.** Content loss on attribute typing is the highest-severity
   item. Determine whether the bytes are lost at tokenize time, at block construction, or on the
   next rebuild.
3. **Pin defect 2 as a rule, not a case.** "Which markers gray out" should follow from a declared
   property — the marker's presence and type in the stylesheet or markers map — not from a list.
   `\fig` not graying is a symptom; the test should assert the rule across a representative set.
4. **Defect 4** is a one-line exemption in the trailing-space transform, but it belongs to the
   whitespace track's rewrite. Coordinate: this track supplies the failing fixture (already failing
   in the fixed-point test), the whitespace track lands the fix.
5. **Decide editability, with evidence.** After 1-3, the choice is informed: if the defects resolve
   inside the read-only model, keep it and stop. If they only resolve by giving blocks a settle
   path, that is a materially larger effort and should be scoped with the chapter-settle story,
   which has the same shape.
6. **Affordance for whatever stays read-only.** Per the no-silent-no-ops invariant: typing into a
   read-only block must be visibly refused rather than accepted and discarded. This is the concrete
   instance of the atomicity work for this track.

## Acceptance

- All four defects have a failing test that then passes.
- No content is lost by any typed-marker or attribute-typing sequence covered by the tests.
- The graying rule is derived from a declared property and asserted across several markers.
- Corpus suite at full count with zero skips; transform fixed-point test green, including the figure
  fixture.
- If blocks stay read-only: typing into one is visibly refused, not silently dropped.

## Risks

- **Diagnosis may reroute the track.** If defect 3's content loss turns out to be a tokenizer defect
  rather than a node defect, the fix lands in the tokenizer, which is a fixed point other tracks
  depend on. Escalate rather than editing it inside this track.
- **The editability decision has a long tail.** Choosing "editable" pulls in a settle path, caret
  semantics, and collab exclusions for a node class that has never had any of them. Do not commit to
  it before task 5's evidence exists.
- **The sidebar `cat` discrepancy** may move work between this track and attribute markers. Resolve
  it in the first session.
