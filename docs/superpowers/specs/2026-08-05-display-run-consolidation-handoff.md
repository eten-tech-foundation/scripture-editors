# Display-run consolidation: hand-off for the planning chat

Status: hand-off (2026-08-05). Companion to
`.superpowers/sdd/2026-07-30-attribute-display/architecture-assessment.md` (the full
inventory/costing — READ IT FIRST in the new chat) and
`2026-07-30-attribute-display-design.md` (the governing attribute-display spec; its rules stand).

## Why this effort exists

Five work waves of attribute display produced a recurring bug pattern the assessment names
"missing-quadrant errors": every engine-owned display kind (char attribute runs, milestone runs,
verse `\va`/`\vp` runs, opener separators, nested glyphs, optbreak/unknown bytes, marker
literals) needs the same four duties — construct, self-heal-with-grace, pend-on-edit/delete,
settle-on-departure — and each kind hand-wired its own quartet across ~8 files / ~3,900 LOC.
New kinds and new edit shapes keep landing in an unwired cell.

## The live bugs this effort must fix (TJ repros)

1. **Stale invisible attribute**: settle `\nd test|stuff="thing"\nd*`; delete the `|stuff="thing"`
   run; type `|stuff="thing2"`. The deletion never arms a pend (caret-boundary heuristic misses),
   so `unknownAttributes` keeps the old value invisibly; saves emit
   `test|stuff="thing2"|stuff="thing"`. Deleting the run alone (no retype) also fails to settle.
2. **Undead optbreak**: backspace on an optbreak deletes its `//` display text but leaves the
   empty invisible UnknownNode, which still serializes an optbreak; multiple indistinguishable
   caret positions around the husk. (UnknownNode has NO deletion transform registered anywhere.)
3. **Empty `\va` never re-folds**: typing a value into an empty `\va \va*` char span is an
   ordinary content edit — nothing pends it — so it never re-tokenizes back to `altnumber`;
   the save path folds it on disk and the sync warn fires on every save.

## The approved scope (targeted extraction, NOT the full registry)

Per the assessment's Option B, extract the shared mechanisms; leave the full declarative
"display-run registry" as a later destination:

1. **One uniform deletion/pend-semantics driver**: absent run pieces → pend the OWNER (robustly,
   not via per-kind caret-position heuristics); entirely-absent → per-kind policy
   (owner-removal for milestone AND optbreak/inline-unknowns; attribute-clear via re-tokenize
   for char/verse). All kinds route through it; optbreak gets the transform it never had.
2. **Content-edit-in-source pend**: edits inside attribute-source spans (the empty-`\va` char
   span adjacent to its verse; the analogous ca/cat forms if they gain surfaces) pend the owner
   so departure re-folds. Key the pend decision on "caret is at a display-run site owned by
   kind K", not on the typed node's textType tag.
3. **One parameterized caret-held/grace-site helper** driven by per-kind piece descriptors,
   replacing the four near-duplicate boundary predicates + four reporters + two piece-scanners
   (~330 LOC → ~110), IF the planning session judges the risk acceptable — this is the
   battle-tested caret-race code; the corpus property tests are the net.
4. Fold in the deferred minor: `$selectAfterClosingSpan`'s `$isCharNode` guard if not already
   landed by the small-fix batch.

Explicitly OUT of scope (separate discussions in flight with TJ): settle-before-save /
settled-`getUsj()` output (TJ is designing this — do not implement); the suppression-window
state machine (post-W6-A it is hygiene, not a live bug); the full registry rewrite.

## Fixed points the refactor must not touch (assessment §5)

Tokenizer/losslessness core (`usfmFragmentToUsjContent`, `extractAttributes`, `scanMilestone`,
NBSP↔space flattening); `canonicalAttributeText`; the editor→USJ and delta exclusion gating;
Tier-2's preserve-or-refuse machinery (fixed-point signature, sentinel symmetry, guard rails);
the corpus losslessness + round-trip property tests (the regression net — extend, never weaken).

## Working conventions (proven across the waves)

TDD red→green per behavior; every task reviewed (spec + quality) with named risks; fix rounds
with scoped re-reviews; FOREGROUND-only test runs for subagents; corpus must stay 141/141 with
zero skips; lint+typecheck 0 errors in both root and nx contexts; commit messages end
`Co-Authored-By: <tool> <noreply@...>` per repo convention; comments stand on their own
(no plan/task breadcrumbs). Known environment facts: nx names are scoped
(`@eten-tech-foundation/platform-editor`, `shared`, `shared-react`);
`env -u _VOLTA_TOOL_RECURSION` for pnpm/nx; the W2-D/W5 reports in
`.superpowers/sdd/2026-07-30-attribute-display/` hold per-seam context.

## Prompt for the planning chat

> Plan the display-run consolidation for the Paratext 10 Standard-view editor per
> `docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md` (read it and the
> architecture assessment it references FIRST, in full). Workspace:
> `~/source/repos/workspaces/standard-view/` — scripture-editors (branch
> `standard-view-pt-4187`) + paranext-core (branch `standard-view`). PT9 reference (never
> edit): `~/source/repos/Paratext`.
>
> Goal: extract the shared deletion/pend mechanisms (handoff scope items 1-3) so the three
> live bugs are fixed BY the consolidation rather than by three more per-kind patches, with
> the assessment's fixed points untouched and the corpus/round-trip property tests green
> throughout. Brainstorm the driver's shape against the existing per-kind code, write the
> design + implementation plan with TDD steps, and get TJ's sign-off before implementing.
