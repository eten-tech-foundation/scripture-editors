# Group 6: Glyph-kinds heal audit + doc corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [x]`) syntax for tracking.

**Goal:** Close the residual glyph-kinds gap the cheap way: audit the machine-drift HEAL
quadrant for opener glyphs, closer glyphs, and para-prefix glyphs (pend/settle already exist
as Tier-1 arms); switch the `char` and `optbreak` piece scanners to rendered-bytes
classification; and land the invariants-doc corrections the integration flagged. The
wholesale descriptor-registry migration is explicitly OUT of scope.

**Architecture:** Audit-first: for each of the three kinds, a targeted test distinguishes
USER deletion (must pend — already covered) from MACHINE drift (must heal — the un-audited
quadrant). "Machine drift" is reproduced by mutating bytes inside an update carrying no
user-gesture provenance (the same shape `$syncDisplayRun`'s heal tests use — find one and
copy its drive). Fix only measured gaps.

**Tech Stack:** Lexical 0.43, Vitest, shared + platform packages.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 item 15
and backlog §4/§7. Sources: settle-loop handoff §7 (the scanner warning), invariants §8's
registry note and Heal-by-provenance rule (§2).

## Global Constraints

- Invariants §2: heal by PROVENANCE, never caret proximity. A heal that fires on a
  user-held site is the defect class this whole effort removed — every new heal must have a
  user-deletion twin test proving it does NOT fire there.
- TDD red-then-green; zero new corpus skips; lint/typecheck clean; repo commit footer.
- Do NOT restructure the display-run registry or add descriptors this round.

---

### Task 1: Audit matrix (read-only)

**Files:**
- Read: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (piece scanners),
  `libs/shared/src/displayRun/` (registry + `$syncDisplayRun`),
  `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (opener-separator
  heal routing, `$settlePendedDisplayOwner`),
  `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts`
  (`$healMarkerTrailingSeparator`).

- [x] **Step 1:** For each kind — char OPENER glyph (`\nd`), char CLOSER glyph (`\nd*`),
  para-prefix glyph (`\p`) — trace what happens when its BYTES are damaged/removed by a
  non-user code path (no caret at the site). Record a 3×2 matrix (kind × {user-edit,
  machine-drift}) with the handling function or NONE for each cell, as a comment block in
  the Task 2 test file. Cells already known: user-edit closer → pend
  (`$markerNodeTransform` closer branch); user-edit opener separator → tokenize-identity
  routing; user para-prefix separator → grace+pend.
- [x] **Step 2:** Sanity-check the matrix against the fixed-point corpus: a kind whose
  machine-drift cell is NONE should be demonstrable — a transform-free byte mutation that
  survives to serialization uncorrected.

### Task 2: Red tests for the empty heal cells; minimal fixes

**Files:**
- Create: `packages/platform/src/editor/markerEdit/glyphDriftHeal.test.tsx`
- Modify: whichever function the matrix names as the natural home per gap — expected:
  the `MarkerNode` transform's canonical check (`$isCanonicalMarkerNode` already detects
  damage; the question per kind is whether an un-pended damaged glyph HEALS or lingers).

- [x] **Step 1:** Per empty cell, write the drift test: build the canonical structure,
  mutate the glyph bytes inside an update with NO selection at the site (machine
  provenance), commit, assert the bytes return to canonical on the next transform pass
  WITHOUT anything pending. Expected: FAIL where the matrix says NONE.
- [x] **Step 2:** Per red test, implement the smallest heal at the traced site, gated on
  provenance exactly as `$healMarkerTrailingSeparator` gates (no caret at the site =
  heal; caret-held = existing pend path — write the twin test proving the pend path is
  untouched).
- [x] **Step 3:** If a cell turns out already covered (test born green), keep the test as
  the pin and record it in the matrix comment. Run the settle suites +
  `damagedGlyphSettle` + corpus trio after EACH fix — this area is where the freeze
  lived; the commit-bound harness pattern from `damagedGlyphSettle.test.tsx` is
  mandatory for any test that could cascade.
- [x] **Step 4:** Commit per cell (test+fix together).

### Task 3: `char` and `optbreak` scanners classify by rendered bytes

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (`$charClosingGlyph`'s
  CALLERS' classification and the optbreak first-child scan — read settle-loop handoff §3
  first: `$charClosingGlyph` itself was deliberately NOT gated because a bytes-gate there
  flips `expectedPieces` to `$clearRun`, deleting user attribute bytes; the safe change
  is classifying the SCANNED PIECE, not the anchor)
- Test: `libs/shared/src/displayRun/displayRunRegistry.test.ts` (the damaged-glyph
  divergence tests — extend with char/optbreak rows)

- [x] **Step 1:** Red tests: a byte-damaged char-run TextNode piece and a damaged optbreak
  first child each report divergence (mirroring the existing `$runDiverges` damage tests
  for va/vp/milestone). Expected: FAIL (state-classified today).
- [x] **Step 2:** Implement with `$isCanonicalMarkerNode` / byte comparison, WITHOUT
  touching `$charClosingGlyph`'s anchor role. Run `damagedGlyphSettle.test.tsx` — the
  char `\nd*` sibling case there MUST stay green (it terminates today; the change must
  not turn a terminating case into a graced-then-degraded one without recording it).
  If the char closer's behavior CHANGES shape (degrades where it used to self-correct),
  STOP: revert Step 2 for the char kind, keep the optbreak half if independent, and
  record the tension in the Outcome — settle-loop's §3 reasoning wins over this task.
- [x] **Step 3:** Commit.

### Task 4: Invariants-doc corrections

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`

- [x] **Step 1:** Apply the backlog §7 corrections verbatim: (a) §8 — delete or narrow the
  pt-4187 fence entry (record WHY: measured stale; both files since edited with owner
  approval); (b) §8 registry note — ten kinds, `cat`/`ca` ordered before `milestone`,
  pointer to the ordering comment; (c) §7c — mark the load-leg question SETTLED, citing
  `NoteLeadingSpaceRoundTripCaptureTests.cs`; (d) add the chapter/verse whitespace-skip
  asymmetry + post-9.5 upgrade tripwire (one short paragraph in §3 or §7c, citing
  `VerseAttributeFoldRoundTripCaptureTests.cs`).
- [x] **Step 2:** Commit with `git add -f` (docs/superpowers is gitignored).

### Task 5: Gate and outcome note

- [x] **Step 1:** Full `nx run-many -t test` (zero new skips) + `lint typecheck` clean +
  `extract-api` if shared's surface moved.
- [x] **Step 2:** Append "Outcome": the final audit matrix, cells fixed vs born-green,
  and the char-scanner decision (changed or deliberately left, with the reasoning).
  Commit with `git add -f`.

---

## Outcome (2026-08-17)

### The measured audit matrix (final)

| Glyph kind         | USER edit (caret holds the site)                                                                                     | MACHINE drift (no caret at the site, un-pended)                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| char opener `\nd`  | `$markerNodeTransform` opening branch: terminated form renames in place, else pends; departure settles — UNCHANGED    | was **NONE** — the transform pended the drift as a user edit and the next departure settled the damaged bytes INTO the document (`\nd`→`\n` auto-renamed the span to `n`). Now **HEALS in place**. |
| char closer `\nd*` | closer branch: pends (typed-at-end splits out); departure degrades via Tier 2 (damagedGlyphSettle) — UNCHANGED        | was **NONE** — same misattributed pend; the settle degraded the span to `closed="false"` and absorbed the following content. Now **HEALS in place**.                     |
| para prefix `\p`   | opening branch, same as char opener; the trailing separator keeps its own grace+pend (`$healMarkerTrailingSeparator`) — UNCHANGED | was **NONE** — drift settled as a paragraph rename. Now **HEALS in place**.                                                                                              |

Measurement notes: serialization derives from node state, so un-settled drift never reached USJ
directly — the defect was the LATER settle turning drift into a document change ("displayed bytes
win" is correct for user edits only). The sanity check demanded by Task 1 Step 2 is the red form
of the three drift tests: pre-fix, each drift settled into the document within one deferred
resolve.

### Cells fixed vs born-green

- **Fixed (red then green), one shared site**: all three machine-drift heal cells, via a single
  heal branch at the top of `$markerNodeTransform` — un-pended divergence with no caret at the
  glyph's edit surface heals through the new `$restoreCanonicalMarkerText` (exported beside
  `MarkerNode`'s one `__text` writer). Provenance = the pend ledger (cross-commit; kept honest by
  `$rependPendShapedNodes` across undo) plus caret-at-edit-time within the damaging update — the
  same gate `$healMarkerTrailingSeparator` uses, NOT the forbidden later-heal-by-caret-proximity.
  Deviation from Task 2 Step 4: one commit for the three cells (test+fix together), because the
  traced site is one function, not three.
- **Born-green pins kept**: the three user-deletion twins (identical damage, caret held → no heal,
  departure settles exactly as before), the undo-shaped ledger pin (a machine re-dirty of a
  restored literal must not resurrect canonical bytes), the char value-divergence rows (both
  directions), and the char-closer anchor pin.
- **Bonus coverage**: the heal branch covers every `MarkerNode` uniformly, so run glyphs
  (`\va*`, milestone `\*`, `\cat`…) now heal machine drift in place instead of the old
  pend-plus-sync-debris path. Verse (`VerseNode`) and chapter glyphs are NOT MarkerNodes and keep
  their own transforms (literal-with-state-fallback) — outside this audit's 3×2 scope.

### The char/optbreak scanner decision

- **optbreak: changed.** It was backwards on BOTH sides: `expectedPieces` said
  `valueText: undefined` while `scanPieces` returned the live token, so `$runDiverges` reported a
  CANONICAL optbreak diverged and a GUTTED one at rest. `valueText` is now the rendered `//`
  (derived from `unknownDisplayParts`, the one renderer of unknown-kind bytes). Purely
  classificatory: the `"read-only"` writer returns before any sync write, and
  `$runEntirelyAbsent` (the remove-owner trigger) is unchanged — a byte-damaged (not deleted)
  token still ends the settle handled-but-inert, same as before; only the registry's truth
  changed. Red row: canonical-does-not-diverge; the damaged/gutted rows discriminate now.
- **char: deliberately NOT changed, pinned.** The run's piece is a plain TextNode whose bytes
  `$runDiverges` already compares — born-green pins added. The `$charClosingGlyph` ANCHOR stays
  state-classified per settle-loop handoff §3 (a bytes-gate there flips a damaged `\nd*` span to
  no-run-wanted, whose sync arm `$clearRun` deletes the user's attribute bytes); pinned with an
  explicit expectedPieces-still-wantsRun test so a future bytes-gate fails loudly. The
  damagedGlyphSettle char `\nd*` case stayed green throughout (still terminates; no shape change).

### What did not ship, and why

- The wholesale descriptor-registry migration for opener/closer/para-prefix glyphs — explicitly
  out of scope; the heal quadrant now exists as a Tier-1 engine arm, recorded in invariants §8.
- Any optbreak byte-damage SETTLE behavior — classification only. A damaged (not deleted) token
  still has no settle arm (falls through handled-inert, `$settleScopeForNode` refuses
  UnknownNodes); with divergence now truthful, a future arm can be built on it.
- Chapter/verse glyph drift handling — different node kinds with their own transforms; out of the
  audited 3×2.

### Doc corrections (Task 4) — landed with one deviation

All four backlog §7 items applied to invariants: fence removed with reason; registry note updated;
§7c load-leg question marked settled (NoteLeadingSpaceRoundTripCaptureTests.cs); the
chapter/verse whitespace-skip asymmetry + post-9.5 tripwire recorded in §7c
(VerseAttributeFoldRoundTripCaptureTests.cs). Deviation: the backlog said "ten kinds registered";
the code registers ELEVEN (`separator`, `char`, `va`, `vp`, `cat`, `ca`, `cp`, `milestone`,
`optbreak`, `opaqueUnknown`, `nestedGlyph`) — the doc now carries the code's count.

### Test-drive idioms (new, for every future group)

Existing tests simulated user typing as caret-less `setTextContent`, which the heal now correctly
reads as machine drift. Two sanctioned idioms replace it (markerEdit.test-helpers):
`$retypeGlyph` (live typing — caret at the text end) and `$pendGlyphEdit` (restored/abandoned
pend — bytes plus a pend-ledger entry via `$reportDestroyedDisplayOwner`, the shape
`$rependPendShapedNodes` produces after an undo). Seven test files converted. The commit-bound
harness (`withCommitBound`) also moved into the shared helpers.

### Cross-group findings

- **Flake**: `markerMenuApply.utils.test.tsx` › "parks the caret at the NEW paragraph's content
  start when the split lands mid-span" failed in 2 of 4 full-suite runs (assertion, ~85ms — not a
  timeout), passes in isolation and in other full runs. Inter-file interference; pre-existing
  class; worth a look from whoever owns test tuneup.
- **Lexical import keeps damaged glyph bytes**: `MarkerNode.updateFromJSON` sets `__text` from the
  serialized text and `setMarker` early-returns when the marker matches, so a copied damaged
  glyph pastes as un-pended damage. Previously that damage lingered; the heal now fixes it in the
  paste commit. No separate fix needed — noting the mechanism.
- **Test-drive artifact**: two `setTextContent` calls on one glyph in one update (write `"\q "`,
  then trim back to `"\q"`) triggered the transform's TERMINATED branch as if the intermediate
  bytes were final — observed while building the ledger pin, sidestepped with `markDirty()` (the
  fixed-point corpus test's drive). Un-diagnosed Lexical wrinkle; avoid net-zero double writes in
  drives.

### Gate (Task 5)

- `nx run-many -t test`: 9 projects green. platform 1170/1170 (0 skipped), shared 520/520,
  shared-react 1535 passed / 2 skipped (both pre-existing), utilities 51/51. **Zero new skips**;
  corpus suites at full count.
- `nx run-many -t lint typecheck`: 10 projects green, 0 errors (the warnings are the pre-existing
  `no-console` class in untouched files).
- `nx run-many -t extract-api`: no API-report diff. `shared` has no extract-api target (only
  `platform` and `utilities` carry API reports); the new `$restoreCanonicalMarkerText` export
  ships in shared's dist typings via the ordinary build.

Commits: `255d6dfa` (heal audit + fix + twins + drive idioms), `f7025e85` (optbreak/char scanner
classification + pins), `48de3b46` (invariants corrections), plus this plan update.
