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

## Postscript (2026-08-07): wave-2a gate passed, live visual check done

Repo gate: `nx run-many -t lint,typecheck,test` clean across all projects (0 lint errors,
722 tests passed); corpus pin confirmed 141/141 paragraphs, 0 skip-listed; root `eslint .`
clean (only pre-existing unrelated warnings in demo apps). Local editor build pushed into the
running paranext-core app via yalc (branch is unpushed, so this bypassed
`link-dev-packages`' revision flow); the webpack DLL was rebuilt so the dev renderer served
the fresh code (freshness confirmed by grepping the `attribute-run` CSS class literal in both
`packages/platform/dist/index.js` and paranext-core's `.erb/dll/renderer.dev.dll.js`).

Live-checked in Standard view (WEB_edit sample project, Luke 4 — typed `\va` in since this
copy of WEB has no pre-existing verse attributes):

- A verse's `\va` run renders as ONE wrapper element, `<span class="attribute-run usfm_va">`,
  confirmed via direct DOM inspection — the wrapper-element migration (item 8) holds structurally.
- Editing the `\va` value and departing settles it correctly (canonical re-render, no
  duplication) — confirmed in both the live DOM and the on-disk SFM.
- Deleting a whole `\va` run and departing clears it fully: no wrapper in the DOM, no `\va`
  bytes on disk, no resurrection.
- Typing `//` creates a proper atomic optbreak (`<unknown data-tag="optbreak">`); a single
  Backspace on it deletes the whole node in one action — no husk, caret lands cleanly at the
  boundary. Confirmed in DOM, disk, and caret position.
- A char span with attributes (`\nd test|stuff="thing"\nd*`): deleting just the attribute run
  and departing leaves `\nd test\nd*` with the attribute fully gone — verified against the
  on-disk SFM (ground truth), no residue.
- Hover-grays-the-green (item 6, the noted specificity tie) could not be observed live: the
  Scripture Editor webview's vendored CSS in paranext-core
  (`extensions/src/platform-scripture-editor/src/_usj-nodes.scss`) is still pinned at
  scripture-editors commit `ba0e846b`, 14+ commits behind — it has no `.attribute-run` rule at
  all yet (confirmed by removing the `usfm_va` class from a live wrapper node and observing the
  color fall through to the default text color, not the documented dim gray). This is a
  pre-existing, already-tracked gap with its own isolated-worktree plan
  (`paranext-core/docs/superpowers/plans/2026-08-06-standard-view-marker-styles-resync.md`), not
  a regression from this wave — noting it here since it also means the live app does not yet
  show PT9-parity small-gray glyphs for `\va`/`\vp` runs (the green value color IS visible, from
  an older pre-existing rule, but the glyph-vs-value size/color unification work needs that CSS
  resync to actually render).

One test-methodology artifact surfaced and was ruled out: replacing a value's last character via
a synthetic `execCommand('insertText')` range-replace produced a duplicated trailing character
after settle; redoing the same edit with real `Backspace` + keypress events was clean. Concluded
this was a synthetic-range boundary quirk in the test harness, not a product bug — not filed.

Backlog status: items 1–3 (from the "TJ-approved, NOT YET DONE" list) done; item 6 (mid-sentence
settle) closed/pinned; item 8 (wrapper styling) closed — the wrapper-element migration is
structurally verified live, pending only the separate paranext-core CSS resync to be visually
complete. The three live bugs (stale invisible attribute, undead optbreak, empty-`\va` re-fold)
are fixed and re-verified live in this session. Phases 1 and 2a (the wrapper-element flip +
cleanup) are landed; the phase-2b registry and phase 3 (settled `getUsj()`) are planned next.

## Postscript (2026-08-10): backlog item 4 closed — verse-9 lossy warn retired by settled getUsj

Phase 3 (settled `getUsj()`, wave 4) landed and was re-verified live end-to-end. **Backlog item 4
is closed**: the verse-9 `content[16]` warn (`\nd come togedda \nd*`'s inner trailing space before
the closer) no longer fires. The regression net is `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx`
(editor, all four editor-side pipelines pinned byte-faithful) plus
`c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs` (host, ParatextData's own round-trip
pinned). The class of warn this belonged to — a save snapshot taken mid-edit, before the editor's
own content had settled — is retired **by construction**, not by a point fix: `EditorRef.getUsj()`
is now always a Tier-2 fixed point, and every save-scheduling site (`handleEditorialUsjChange`,
the debounced-save capture, the cross-chapter flush) reads through it instead of forwarding the
raw `onUsjChange` payload, so there is no longer a code path that can schedule an unsettled
snapshot.

Live re-verification (paranext-core `standard-view`, WEB_edit sample project — WEB itself is
read-only in this dev environment, so WEB_edit is the editable counterpart already used for every
prior live check in this ledger; content is otherwise identical WEB text — Luke 4, DLL freshness
confirmed by grepping the `Settled USJ skipped` runtime literal in both the editor's own
`packages/platform/dist/index.js` and paranext-core's `.erb/dll/renderer.dev.dll.js` before and
after rebuild):

- **Verse-9 warn absent under repeated saves.** Created the suspect span live (`\nd come togedda
  \nd*` at Luke 4:9, inner trailing space before the closer, matching the Task-10 pin's shape
  exactly) and saved it. Then edited OTHER paragraphs repeatedly (5+ edit/save cycles across
  verses 14, 22, 31, 35) with the chapter actively focused — the exact condition
  (`isActivelyEditing` + same document + stable non-convergent echo) the warn requires. Grepped
  the renderer log for `round-tripped through the PDP to DIFFERENT content` after every cycle:
  zero new hits (the only 4 hits in the log are historical, dated 2026-08-07, from an unrelated
  zzz6/Genesis `altnumber`/`sid` field-ordering difference).
- **Mid-marker-typing save, still no warn.** Typed `\q1` at the end of a verse with ~250ms between
  characters so the 700ms debounce fired while the literal sat incomplete (passive palette open,
  "No results found"); the save landed with the literal correctly excluded (on-disk verse
  unchanged), confirming settled `getUsj()` — not the retired pre-save commit — is what a
  mid-typing save now captures. No warn.
- **Task-13 cross-chapter palette race (the one live check with no component pin).** Typed `\f` in
  Luke 4:37 (passive backslash-palette session), then navigated to Luke 5 before the 700ms
  debounce fired. Grepped the OLD chapter's on-disk SFM: the `\f` literal was never written —
  `handleEditorialUsjChange` now schedules `editorRef.current?.getUsj() ?? usj` (settled,
  transient-excluded) instead of the raw `onUsjChange` payload, so the cross-chapter flush replays
  canonical bytes. Navigating back to Luke 4 showed the settled equivalent (no `\f`, no
  corruption) — consistent with disk. One cosmetic artifact observed: the marker-palette popover
  itself stayed visually open (pinned to its old screen position) across both the chapter switch
  and a subsequent `Escape`, until a click elsewhere in the page dismissed it via its own
  click-outside handler. This matches Task 13's disclosed, deliberately-deferred caveat ("editor
  remount/editorRef churn has no explicit palette-session clear") — a UI-only leftover, not a data
  defect (the underlying document content was correct throughout).
- **Undo holds, no auto-resettle.** Typed `\q1 ` (terminated) at the end of a verse, let it settle
  into a real `q1` paragraph split, then `Ctrl+Z` twice (once to undo the split, once to undo the
  typed literal) back to the original text; held for 2.2s with no auto-resettle back. Disk matched
  the fully-reverted state.
- **Wave-1 regressions still live: attribute-run deletion clean; optbreak deletion has a
  mixed result.** Deleting a freshly-created char attribute run (`\nd test2\nd*`) via real
  character-by-character `Backspace` settled clean on disk (byte-identical to the pristine WEB
  original apart from this wave's intentional edits). Deleting a freshly-typed `//` optbreak,
  however, took **two** `Backspace` presses to fully clear — the DOM showed an empty
  `<unknown data-tag="optbreak">` husk after the first press (parent decorator present, inner
  `//` content gone), removed by the second press — where the wave-2a postscript above records "a
  single Backspace... deletes the whole node in one action — no husk". The end state was clean
  either way (no `//` residue on disk, matching this task's acceptance bar), and the two presses
  land within the same debounce window so a real user would not observe an intermediate saved
  husk. Flagged rather than filed: this could be a genuine partial regression of live bug #2
  ("Undead optbreak") re-appearing behind a different repro shape (a fresh `//` that only tokenizes
  into the atomic decorator after a PDP round-trip, not instantly on live typing — the two-press
  behavior was only reproducible via a keyboard `End`-then-`Backspace` sequence at the settled/
  reloaded node, not the original live-typed one), or it could be intended two-step decorator
  selection UX. Worth a short, targeted follow-up (Task 16 gate or later) rather than blocking this
  task's own acceptance, since backlog item 4's own bar — the verse-9 warn — is unambiguously met.

One self-inflicted testing-methodology artifact, corrected before continuing: an early attempt to
delete the pre-existing `\va 1a\va*` run at Luke 4:1 via `Range.selectNode()` on the wrapper
element (rather than character-level `Backspace`) visually removed it from the DOM without Lexical
registering the change (no debounced save fired), and a later stray `Backspace` — sent after that
dead selection — silently ate adjacent characters that DID get saved, corrupting verse 1 on disk.
Diagnosed via `diff` against the pristine, untouched `WEB` project's copy of the same verse;
repaired directly in the on-disk SFM (app stopped first, to avoid racing its own save path) back
to byte-identical with the original; app restarted clean and the fix reconfirmed live. Not a
product defect — `Range.selectNode()` on a multi-child element bypasses Lexical's own
selection-sync path the same way a raw `execCommand` does (the wave-2a postscript's already-noted
class of artifact); real per-character `Backspace` (used for the rest of this session's edits)
does not have this problem.

Item 4 is closed. The remaining open items from this doc are the phase-2b registry, phase 3's
already-landed settled `getUsj()` (this postscript), and the two follow-ups noted above (CSS
resync for hover-grays-the-green; the optbreak two-press observation).
