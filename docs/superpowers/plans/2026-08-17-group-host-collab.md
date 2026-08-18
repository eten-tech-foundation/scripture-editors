# Group 5: Host and collab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the three never-scheduled host/collab items: the collab `closed="false"`
end-to-end test (paranext-core), promotion of the round-trip warn to a first-class detector
(paranext-core), and the unknown-attributes-on-embeds passthrough (scripture-editors
shared-react) that un-skips its forward pin.

**Architecture:** Two paranext-core deliverables in
`extensions/src/platform-scripture-editor/`; one scripture-editors deliverable in
`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`. This group's worktree
pair spans BOTH repos; the core side consumes the editor via yalc — after ANY shared-react
change, rebuild + `devpub` platform-editor and re-link before running core tests.

**Tech Stack:** Vitest in both repos; yalc for the cross-repo link.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 items
16–17. Sources: invariants §8's Host row; the skip comment above "should carry unknown
attributes on every embed kind the apply side accepts" in
`libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx` (~line 1300) — it
IS the spec for item 17.

## Global Constraints

- **Approval gate:** do NOT change C# serialization code. None of this group's work should
  go near it; if a defect chase leads there, STOP and record.
- The OTHER skipped test in that file ("…including the table") is the table-OT
  representation — OUT of scope (very-low bucket). Do not un-skip or chase it.
- TDD red-then-green; zero new skips beyond that one deliberate table skip; lint/typecheck
  clean in BOTH repos; repo commit footers in both.
- Cross-repo loop: `pnpm nx build @eten-tech-foundation/platform-editor && (cd
  packages/platform && pnpm run devpub)` in scripture-editors, then `npm run editor:link`
  in paranext-core.

---

### Task 1: Unknown attributes ride every embed kind (scripture-editors)

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`
- Test: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx` — the
  `it.skip("should carry unknown attributes on every embed kind the apply side accepts")`

**Interfaces:**
- Consumes: the skipped test's fixture (`editorStateWithUnknownItemsNoTable`) and its
  asserted CORRECT shape — the test was deliberately written against the desired wire
  format so that closing the gap turns it green.
- Produces: `getEditorDelta` emits each embed's unknown attributes (e.g. `category`,
  `attr-unknown`) in the embed op's attribute payload for book/para/chapter/verse/
  milestone — mirroring what `delta-apply-update.utils.ts`'s receive side already accepts
  (read its embed constructors to confirm the exact key names it reads).

- [ ] **Step 1:** Un-skip the test; run
  `env -u _VOLTA_TOOL_RECURSION pnpm nx test shared-react -- editor-delta`. Expected: FAIL
  with attributes missing from the emitted ops (the recorded gap).
- [ ] **Step 2:** Implement: at each embed-emission site in `getEditorDelta`'s dispatch
  (book/para/chapter/verse/milestone — the skip comment enumerates them), include the
  node's unknown-attribute state in the op. Follow how the RECEIVE side names them so
  the round trip closes; add nothing the receive side does not accept.
- [ ] **Step 3:** Green; then run the WHOLE collab test directory (adaptor + apply +
  delta-common) — the ops fixtures elsewhere in the file may need regenerating if they
  now legitimately carry attributes; regenerate per that file's existing
  fixture-refresh convention (its header says how), never by hand-editing expected ops.
- [ ] **Step 4:** Commit (scripture-editors).

### Task 2: Collab `closed="false"` end-to-end test (paranext-core)

**Files:**
- Create: a test beside the existing collab/delta tests in
  `extensions/src/platform-scripture-editor/src/` — grep for the existing delta/apply
  test file naming there and match it.
- Reference: `2026-08-14-attribute-markers-handoff.md` Stage 0.1 — implicitly-closed
  `\fr`/`\ft` spans carry `closed="false"` on the editor USX path (the fact this test
  pins end-to-end).

**Interfaces:**
- Consumes: the merged editor via yalc (rebuild+devpub+link FIRST — Task 1 changed the
  adaptor).
- Produces: a pin that a remote apply creating an implicitly-closed char span
  (`closed="false"`, no closing glyph) round-trips through the collab pipeline without
  fabricating a closer and without dropping the flag.

- [ ] **Step 1:** Rebuild/devpub/link (see Global Constraints loop). Sanity: core's
  extension suite green before writing anything.
- [ ] **Step 2:** Write the test red-first if a defect exists, green-pin otherwise: build
  a delta op stream that inserts `\f + \fr 1:1 \ft note text` (implicit closes), apply it
  through the extension's apply path, serialize back, assert `closed="false"` on the
  `fr`/`ft` spans and NO `\fr*`/`\ft*` bytes anywhere. Then edit an adjacent byte locally
  and re-serialize — the flag survives.
- [ ] **Step 3:** Run the extension suite. Green. Commit (paranext-core).

### Task 3: Round-trip warn becomes a detector (paranext-core)

**Files:**
- Modify: grep `extensions/src/platform-scripture-editor/src/` for the existing
  round-trip warn (search "round-trip" / "roundtrip" / the warn's message text) — the
  detector wraps THAT site; do not invent a second comparison.
- Test: beside it, matching local conventions.

**Interfaces:**
- Produces: a named export (e.g. `detectRoundTripDivergence(usjIn, usjOut): Divergence |
  undefined` — adapt the name to local style) that returns a structured result (first
  diverging path + both values) instead of only logging; the existing warn call becomes
  `const d = detect…; if (d) logger.warn(<message built from d>)`. Console remains the
  consumer this round — the promotion is that the comparison is now a TESTABLE unit with
  a structured result, not a side effect.

- [ ] **Step 1:** Red test: feed the detector two USJ trees that differ in one nested
  text; assert the returned divergence names the path and both values. FAIL (function
  does not exist).
- [ ] **Step 2:** Extract/implement; wire the existing warn through it; assert via a
  second test that identical trees return `undefined`.
- [ ] **Step 3:** Extension suite green. Commit (paranext-core).

### Task 4: Gates in both repos and outcome note

- [ ] **Step 1:** scripture-editors: `nx run-many -t test lint typecheck` — green/clean,
  zero new skips (the table skip remains, deliberately).
- [ ] **Step 2:** paranext-core: `npm test`, `npm run typecheck`, `npm run lint` — green.
  (If lint fails on `eslint-plugin-paranext`, build it first:
  `npm run build --workspace=eslint-plugin-paranext`.)
- [ ] **Step 3:** Append "Outcome" to this plan — including whether Task 2's pin was
  born green or exposed a defect — commit with `git add -f` (scripture-editors side).
