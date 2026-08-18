# Group 6: Glyph-kinds heal audit + doc corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

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

- [ ] **Step 1:** For each kind — char OPENER glyph (`\nd`), char CLOSER glyph (`\nd*`),
  para-prefix glyph (`\p`) — trace what happens when its BYTES are damaged/removed by a
  non-user code path (no caret at the site). Record a 3×2 matrix (kind × {user-edit,
  machine-drift}) with the handling function or NONE for each cell, as a comment block in
  the Task 2 test file. Cells already known: user-edit closer → pend
  (`$markerNodeTransform` closer branch); user-edit opener separator → tokenize-identity
  routing; user para-prefix separator → grace+pend.
- [ ] **Step 2:** Sanity-check the matrix against the fixed-point corpus: a kind whose
  machine-drift cell is NONE should be demonstrable — a transform-free byte mutation that
  survives to serialization uncorrected.

### Task 2: Red tests for the empty heal cells; minimal fixes

**Files:**
- Create: `packages/platform/src/editor/markerEdit/glyphDriftHeal.test.tsx`
- Modify: whichever function the matrix names as the natural home per gap — expected:
  the `MarkerNode` transform's canonical check (`$isCanonicalMarkerNode` already detects
  damage; the question per kind is whether an un-pended damaged glyph HEALS or lingers).

- [ ] **Step 1:** Per empty cell, write the drift test: build the canonical structure,
  mutate the glyph bytes inside an update with NO selection at the site (machine
  provenance), commit, assert the bytes return to canonical on the next transform pass
  WITHOUT anything pending. Expected: FAIL where the matrix says NONE.
- [ ] **Step 2:** Per red test, implement the smallest heal at the traced site, gated on
  provenance exactly as `$healMarkerTrailingSeparator` gates (no caret at the site =
  heal; caret-held = existing pend path — write the twin test proving the pend path is
  untouched).
- [ ] **Step 3:** If a cell turns out already covered (test born green), keep the test as
  the pin and record it in the matrix comment. Run the settle suites +
  `damagedGlyphSettle` + corpus trio after EACH fix — this area is where the freeze
  lived; the commit-bound harness pattern from `damagedGlyphSettle.test.tsx` is
  mandatory for any test that could cascade.
- [ ] **Step 4:** Commit per cell (test+fix together).

### Task 3: `char` and `optbreak` scanners classify by rendered bytes

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (`$charClosingGlyph`'s
  CALLERS' classification and the optbreak first-child scan — read settle-loop handoff §3
  first: `$charClosingGlyph` itself was deliberately NOT gated because a bytes-gate there
  flips `expectedPieces` to `$clearRun`, deleting user attribute bytes; the safe change
  is classifying the SCANNED PIECE, not the anchor)
- Test: `libs/shared/src/displayRun/displayRunRegistry.test.ts` (the damaged-glyph
  divergence tests — extend with char/optbreak rows)

- [ ] **Step 1:** Red tests: a byte-damaged char-run TextNode piece and a damaged optbreak
  first child each report divergence (mirroring the existing `$runDiverges` damage tests
  for va/vp/milestone). Expected: FAIL (state-classified today).
- [ ] **Step 2:** Implement with `$isCanonicalMarkerNode` / byte comparison, WITHOUT
  touching `$charClosingGlyph`'s anchor role. Run `damagedGlyphSettle.test.tsx` — the
  char `\nd*` sibling case there MUST stay green (it terminates today; the change must
  not turn a terminating case into a graced-then-degraded one without recording it).
  If the char closer's behavior CHANGES shape (degrades where it used to self-correct),
  STOP: revert Step 2 for the char kind, keep the optbreak half if independent, and
  record the tension in the Outcome — settle-loop's §3 reasoning wins over this task.
- [ ] **Step 3:** Commit.

### Task 4: Invariants-doc corrections

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-standard-view-invariants.md`

- [ ] **Step 1:** Apply the backlog §7 corrections verbatim: (a) §8 — delete or narrow the
  pt-4187 fence entry (record WHY: measured stale; both files since edited with owner
  approval); (b) §8 registry note — ten kinds, `cat`/`ca` ordered before `milestone`,
  pointer to the ordering comment; (c) §7c — mark the load-leg question SETTLED, citing
  `NoteLeadingSpaceRoundTripCaptureTests.cs`; (d) add the chapter/verse whitespace-skip
  asymmetry + post-9.5 upgrade tripwire (one short paragraph in §3 or §7c, citing
  `VerseAttributeFoldRoundTripCaptureTests.cs`).
- [ ] **Step 2:** Commit with `git add -f` (docs/superpowers is gitignored).

### Task 5: Gate and outcome note

- [ ] **Step 1:** Full `nx run-many -t test` (zero new skips) + `lint typecheck` clean +
  `extract-api` if shared's surface moved.
- [ ] **Step 2:** Append "Outcome": the final audit matrix, cells fixed vs born-green,
  and the char-scanner decision (changed or deliberately left, with the reasoning).
  Commit with `git add -f`.
