# Display-run consolidation: hand-off for the planning chat

Status: hand-off (2026-08-05).

**Path convention: the planning chat runs from paranext-core**
(`~/source/repos/workspaces/standard-view/paranext-core`, branch `standard-view`). The editor
repo is at `../scripture-editors` (branch `standard-view-pt-4187`) — this doc lives there, and
every bare repo path below (`libs/…`, `packages/…`, `docs/…`, `scripts/…`,
`.superpowers/…`) is relative to `../scripture-editors` unless it is explicitly a
paranext-core path (`c-sharp/…`, `extensions/…`).

Companion docs (READ FIRST, in full):
- `../scripture-editors/.superpowers/sdd/2026-07-30-attribute-display/architecture-assessment.md`
  (the full inventory/costing)
- `../scripture-editors/docs/superpowers/specs/2026-07-30-attribute-display-design.md`
  (the governing attribute-display spec; its rules stand)

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
chat, implemented independently of phases 1-2). CORRECTION to the architecture assessment (its
§3c claimed `commitPendingMarkerEdits()` has zero paranext-core call sites): the debounced save
DOES call it (live-captured 2026-08-05 — `COMMIT_PENDING_MARKERS_COMMAND` fires ~700ms after
edits), and that MUTATING pre-save settle was the third undo-resettle trigger (now gated by the
suppression window). This strengthens the phase-3 rationale: a mutating pre-save commit is
exactly the wrong shape — when phase 3 lands, the debounced save should STOP dispatching the
commit command entirely and rely on settled output, retiring the trigger class instead of
gating it. `getUsj()` must return SETTLED USJ without mutating the editor — pending edits stay pending on screen, but consumers always receive the
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

## Backlog: every open item as of 2026-08-05 (this section is the durable record — the
## session ledger under `.superpowers/sdd/` is local-only and may not survive)

**TJ-approved, NOT YET DONE (slipped between waves — do these early, they are small):**

1. **Editable-para `\p`-prefix delta leak** (TJ approved 2026-08-04): the paragraph's own
   `\p ` glyph text flows into collab content ops on the produce side while the apply side
   re-synthesizes the prefix — the last unexcluded glyph class, same shape as the fixed verse
   leak. Fix: extend the glyph exclusion in `editor-delta.adaptor.ts` + align the position
   helpers, mirroring the verse OT unification (mechanical now; the `OTCoordinateSystem` doc
   in delta-common.utils.ts documents the divergence).
2. **Log-noise quick fix** (TJ approved): recurring `optbreak-undefined`/`figure-fig` pattern
   in the app logs (pre-existing, probably a style-lookup miss for those markers in
   paranext-core's styling pipeline). Short log-inspection session; fix if small.
3. **`scripts/mcp-launcher.js` lint** (TJ chose the ignore-comment option): add the justified
   eslint-disable for `no-require-imports` — the last root-context error.

**Needs a live capture (no TJ action required — the sample data is deterministic):**

4. **Verse-9 lossy divergence**: in the E2E sample project (the WEB bundle the isolated suite
   installs; paranext-core `c-sharp/assets/WEB`, Luke 4), the pre-existing span `\nd come togedda\nd*` (verse
   9, arrives as content[16]) makes the sync warn fire on EVERY full-chapter save regardless
   of edit target. Both static pipelines are PROVEN byte-faithful (C# capture test
   `NdSpanRoundTripCaptureTests` + adaptor probe), so it is a live-editing divergence — prime
   suspect: inner-trailing-space handling (the space before the closer). Repro: open that
   chapter in Standard view, edit anything, save; the (now per-difference) warn prints the
   exact differing entries. Fix whichever side mangles the space.

**Needs one verification (headlessly in the new chat — no TJ action required):**

5. **RESOLVED (TJ manually verified 2026-08-05)**: the undo re-settle — undo now holds and
   nothing auto-settles. Three stacked mechanisms were fixed (historic-commit transform
   blindness; effect-teardown state wipe; the debounced save's forced commit, gated behind the
   suppression window). Do NOT re-investigate; the pins live in
   `packages/platform/src/editor/markerEdit/markerEditUndoResettle.test.tsx` and
   `markerEditUndoRerenderResettle.test.tsx`.
6. **Mid-sentence typed-marker settle**: a verification-session observation (typing
   `\nd hello\nd*` with the caret mid-sentence in existing text did not settle on departure;
   at a clean paragraph end it did). TJ could not reproduce; possibly resolved by the
   caret-restoration fix. One headless per-keystroke check mid-existing-text; fix or close.

**Small ledgered items worth keeping:**

7. `$getTextContentExcludingMarkers` (node.utils.ts) excludes decorator display text only by
   accidental fall-through (fragile coincidence, works today) — give it an explicit exclusion
   when touching that file.
8. The folded va/vp GLYPHS still lack the green-superscript styling (only the value got it);
   deliberately held for the phase-2 wrapper-element decision rather than patching the
   three-piece styling a second time (TJ may request the interim patch).
9. `\fig` whose attribute value contains `//` degrades to char-with-attrs on rebuild instead
   of a faithful figure (improved from attribute-loss; tokenizer figure-assembler rejoin
   landed, the faithful-figure re-fold did not).

Resolved-and-closed (do NOT re-investigate): flushSync (TJ dropped), scribe parallel copies
(TJ dropped), 2sa.lexical fixtures (regenerated + always-on freshness pin), parse-fail
idempotence pin (landed), root-vs-nx eslint alignment (landed; only item 3 above remains).

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

## Prompt for the planning chat (run it from paranext-core)

> Plan the display-run consolidation for the Paratext 10 Standard-view editor per
> `../scripture-editors/docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md`
> (read it and the two companion docs it names FIRST, in full — note its path convention:
> bare repo paths are relative to `../scripture-editors`). We are running from paranext-core
> (branch `standard-view`); the editor repo is at `../scripture-editors` (branch
> `standard-view-pt-4187`). PT9 reference (never edit): `~/source/repos/Paratext`.
>
> Goal: plan all three phases — the shared deletion/pend extraction (phase 1) so the three
> live bugs are fixed BY the consolidation rather than by three more per-kind patches; the full
> display-run registry (phase 2, including the wrapper-element-vs-loose-siblings decision); and
> settled getUsj() output (phase 3) — with the assessment's fixed points untouched and the
> corpus/round-trip property tests green throughout. Also pick up the handoff Backlog's
> "TJ-approved, NOT YET DONE" items early — they are small and independent. Brainstorm the
> driver's shape against the existing per-kind code, write the design + implementation plan
> with TDD steps, and get TJ's sign-off before implementing.
