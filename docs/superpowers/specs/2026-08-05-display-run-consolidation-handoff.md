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

## The approved scope: two phases toward full unification

TJ's direction: the various node kinds should go through the SAME code paths for their shared
operations (the assessment's four duties). Plan BOTH phases; the planning chat decides pacing
and how much of phase 2 rides with phase 1.

**Phase 1 — targeted extraction** (fixes the live bugs, lower risk; assessment Option B):

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

**Phase 2 — the full display-run registry** (the destination; assessment Option A): a per-kind
descriptor `{ ownerPredicate, ownerOf(dirtiedNode), expectedPieces(ownerState), scanPieces,
graceSite, settleScope, deletionPolicy }` with ONE shared sync transform, ONE caret-held
reporter, ONE pend/settle driver, ONE deletion-semantics function — so ALL FOUR duties for
every kind run through the same code, and a missing-quadrant bug becomes structurally
impossible. ~750 LOC of quartet wiring → ~300. Risk concentrates in the caret-boundary
predicates (each is tuned to where deletions really land for that tree shape); phase 1's
unified deletion semantics is the seam the registry formalizes, which is why it goes first.
Byte formats (`canonicalAttributeText`, NBSP rules, `unknownDisplayParts`) stay per-kind as
descriptor callbacks; the tokenizer and Tier-2 fragment/signature machinery stay OUT of the
registry entirely.

**Phase-2 design question TJ raised (2026-08-05) — wrapper-element runs vs loose siblings:**
today the folded verse/milestone runs are THREE loose sibling TextNodes/MarkerNodes because
their owners are Lexical leaves (VerseNode extends TextNode) or decorators (MilestoneNode) that
cannot hold children — unlike CharNode (an ElementNode), whose runs live inside the span and
inherit its styling in one place. The loose-sibling shape is the root of the recurring
multiplicity problems: styling applied per-piece (the va glyph-styling inconsistency), deletion
per-piece (partial-deletion holes), grace/pend sites computed over piece adjacency. The
planning chat should seriously evaluate wrapping each run in a dedicated ElementNode (e.g. an
AttributeRunNode with the glyphs/value as children, sitting as ONE sibling after the leaf
owner): styling becomes one class on one element; deletion becomes atomic node removal;
grace/pend target one node; the Tier-2 run collectors become "the wrapper's children". Cost:
one more representation migration touching the collectors, exclusion gates, adaptors, and
delta paths — but each SIMPLIFIES. Controller's recommendation: the wrapper element is the
better destination; it removes structurally what the descriptors would otherwise compensate
for in code, and run styling then stops being a per-piece concern at all.

**Phase 3 — settled `getUsj()` output** (TJ's follow-up-4 design; can be planned in the same
chat, implemented independently of phases 1-2): `getUsj()` must return SETTLED USJ without
mutating the editor — pending edits stay pending on screen, but consumers always receive the
canonical document. Design: settling is re-tokenization of displayed bytes, a pure computation
— serialize the current state, and for each paragraph with pending edits run the SAME
fragment-build + tokenize used by real settles, read-only (inside `editorState.read()`),
splicing results into the OUTPUT USJ only. Apply uniformly (no caret-held exception: half-typed
`|stuf` settles to literal content, which is what those bytes mean). Acceptance: `getUsj()`
output is always a Tier-2 fixed point; the paranext-core sync hook's lossy warn then means a
REAL round-trip defect (the warn-quiescence idea becomes unnecessary — remove/simplify the
transient handling accordingly); the save-snapshot timing warn class disappears. Risks to
manage: the virtual settle and the later real settle MUST share one code path (no divergence);
sentinel bookkeeping in read-only mode (sentinels must serialize in place rather than be
moved). Later optional polish (P9 parity, NOT required once this lands): calling
`commitPendingMarkerEdits()` on a P9-like cadence. Rationale recorded: no consumer legitimately
wants unsettled USJ; settle-on-a-timer alone was rejected as papering over the real problem.

Explicitly OUT of scope: the suppression-window state machine (post-W6-A it is hygiene, not a
live bug — absorb into phase 2 if convenient, else skip).

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
> Goal: plan all three phases — the shared deletion/pend extraction (phase 1) so the three
> live bugs are fixed BY the consolidation rather than by three more per-kind patches; the full
> display-run registry (phase 2); and settled getUsj() output (phase 3) — with
> the assessment's fixed points untouched and the corpus/round-trip property tests green
> throughout. Brainstorm the driver's shape against the existing per-kind code, write the
> design + implementation plan with TDD steps, and get TJ's sign-off before implementing.
