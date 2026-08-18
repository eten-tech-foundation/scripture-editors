# Group 1: P9 debounce settle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Invariant IV's second settle clock — an idle debounce timer that runs the SAME
deferred-settle computation the caret-departure clock runs, and that settles even the
caret-held site once the user has been idle past the delay.

**Architecture:** A timer inside `MarkerEditPlugin`'s existing effect, armed whenever
`context.pendingKeys` is non-empty, reset by the same gestures that reset
`settleCascadeDepth` (KEY_DOWN, CLICK) and by every commit. On expiry it re-enters through a
fresh top-level `editor.update()` (the same microtask-discipline the departure settle uses —
NEVER `editor.update` from inside a listener) and calls `$resolvePendingMarkers(context,
undefined)` — no except-key, so the caret-held node settles too. All grace, cascade-backstop,
and history-merge machinery already lives in that path and applies unchanged.

**Tech Stack:** Lexical 0.43, React 19, Vitest (fake timers), platform-editor package.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 item 1;
invariants doc §1 Invariant IV.

## Global Constraints

- Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` FIRST; it governs.
- TDD red-then-green per behavior. Foreground test runs only.
- Corpus suites stay at full count with ZERO new skips.
- Never call `editor.update` from inside a listener; defer via `queueMicrotask`/timer callback
  exactly as the existing deferred resolve does (`MarkerEditPlugin.tsx`, the big comment above
  `queueMicrotask` — read it in full before touching the file).
- Do not change C# serialization code (approval gate; not expected to be near this work).
- Lint and typecheck clean: `env -u _VOLTA_TOOL_RECURSION pnpm nx run-many -t lint typecheck`.
- Commits end with `Co-Authored-By:` per repo convention.

---

### Task 1: Characterize today's two clocks (read-only; no production change)

**Files:**
- Read: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (the update listener,
  BLUR handler, `settleCascadeDepth` resets at the KEY_DOWN/CLICK handlers)
- Read: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`
  (`$resolvePendingMarkers`, `$exceptKeysAround` — confirm `$exceptKeysAround(undefined)`
  yields an empty shield set; if it does not, note what `undefined` means before using it)
- Read: `packages/platform/src/editor/markerEdit/damagedGlyphSettle.test.tsx` (the
  commit-bound test harness pattern — `withCommitBound` — you will reuse it)

**Interfaces:**
- Produces: a one-paragraph note (in the Task 2 test file header) stating what
  `$resolvePendingMarkers(context, undefined)` shields (expected: nothing) and where the
  timer must be reset, verified against the code, not assumed.

- [ ] **Step 1:** Read the three files above. Confirm: (a) the deferred resolve passes
  `lastAnchorKey` as except-key; (b) `$exceptKeysAround(undefined)` returns an empty set;
  (c) `settleCascadeDepth` resets in exactly the KEY_DOWN and CLICK handlers.
- [ ] **Step 2:** If (b) is false, STOP and record the actual semantics in the plan-deviation
  note; the timer must pass whatever value means "shield nothing".

### Task 2: Red test — an idle caret-held pend settles after the debounce

**Files:**
- Create: `packages/platform/src/editor/markerEdit/debounceSettle.test.tsx`
- Reference for harness: `packages/platform/src/editor/markerEdit/damagedGlyphSettle.test.tsx`
  (mounts the CharNodePlugin + MarkerEditPlugin + TextSpacingPlugin trio via
  `markerEdit.test-helpers.tsx`) and `markerEdit.test-helpers.tsx`'s `testEnvironment`.

**Interfaces:**
- Consumes: `testEnvironment` / composed harness from `markerEdit.test-helpers.tsx`;
  `vi.useFakeTimers()`.
- Produces: the constant name the implementation must export:
  `IDLE_SETTLE_DELAY_MS` from `MarkerEditPlugin.tsx`.

- [ ] **Step 1:** Write the failing test: mount the trio; build `\p \nd ⟨nbsp⟩Lord\nd*`; put
  the caret INSIDE the opener glyph and make a pending edit (retype `\nd` to `\wj` — the
  Tier-1 closer/opener pend path); assert the node is pending (bytes unsettled). Then
  `await vi.advanceTimersByTimeAsync(IDLE_SETTLE_DELAY_MS + 50)` WITHOUT moving the caret,
  flush microtasks, and assert the document settled exactly as caret departure would have
  settled it (same assertion as the existing departure test for that edit — copy the expected
  shape from `markerEditTier1`'s or `unmatchedCloser.test.tsx`'s departure pins, whichever
  matches the chosen edit).
- [ ] **Step 2:** Run it: `env -u _VOLTA_TOOL_RECURSION pnpm nx test
  @eten-tech-foundation/platform-editor -- debounceSettle`. Expected: FAIL — nothing settles
  (no timer exists; `IDLE_SETTLE_DELAY_MS` is not exported).
- [ ] **Step 3:** Add a second failing test: same setup, but advance time in two halves with a
  keystroke (dispatch KEY_DOWN through the editor like `damagedGlyphSettle` does) between
  them; assert the pend did NOT settle (the gesture reset the timer), then a full idle period
  after the keystroke DOES settle it.
- [ ] **Step 4:** Add a third failing test: after the timer settles, assert the settle merged
  into history correctly — one Ctrl+Z (dispatch UNDO_COMMAND) restores the pre-settle literal
  (the same undo contract the departure settle has).
- [ ] **Step 5:** Commit the red tests.

### Task 3: The timer

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx`

**Interfaces:**
- Produces: `export const IDLE_SETTLE_DELAY_MS = 1000;` (PT9-style reformat delay; exported
  for tests). A module-scoped timer handle inside the effect, cleaned up on unmount.

- [ ] **Step 1:** Implement: in the effect that owns `settleCascadeDepth`, add
  `let idleSettleTimer: ReturnType<typeof setTimeout> | undefined`. Add
  `armIdleSettle()`: clears any existing timer; if `context.pendingKeys.size === 0` or the
  plugin is disposed, do nothing; else `setTimeout` for `IDLE_SETTLE_DELAY_MS` whose callback
  mirrors the existing microtask body EXCEPT it passes `undefined` as the except-key:
  respect `disposed`, respect the `settleCascadeDepth >= MAX_SETTLE_CASCADE_DEPTH` backstop
  (same warn), then `editor.update(() => { const mutated = $resolvePendingMarkers(context,
  undefined); settleCascadeDepth = mutated ? settleCascadeDepth + 1 : 0; if (!mutated)
  $addUpdateTag(HISTORY_MERGE_TAG); })`.
- [ ] **Step 2:** Arm/reset points: call `armIdleSettle()` (a) at the END of the update
  listener on every non-historic, non-cursor-tag commit (after the existing anchor
  bookkeeping — pendingKeys may have just changed), and (b) in the KEY_DOWN and CLICK
  handlers right where `settleCascadeDepth = 0` happens. Clear the timer in the effect's
  cleanup alongside `disposed = true`.
- [ ] **Step 3:** Run the Task 2 tests. Expected: PASS. If the caret-held settle is blocked,
  the likely cause is the historic/appPlacedCaret suppression — the timer callback must NOT
  early-return on `appPlacedCaret` (an idle expiry is a real settle trigger); document why at
  the call site.
- [ ] **Step 4:** Run the neighbors that guard this machinery:
  `damagedGlyphSettle`, `markerEditLoop` (if present), `unmatchedCloser`,
  `typedMarkerResolution`, `noteCategorySettle`, `chapterAltnumberSettle`, and the three
  corpus suites. Expected: all green, zero new skips. The mid-typing tests in
  `typedMarkerResolution.test.tsx` are the canary for a timer firing too eagerly under fake
  timers — if any goes red, the arm points are wrong (most likely arming inside the historic
  branch), not the delay.
- [ ] **Step 5:** Commit.

### Task 4: Full-suite gate and handoff note

- [ ] **Step 1:** `env -u _VOLTA_TOOL_RECURSION pnpm nx run-many -t test` — all 9 projects
  green, zero new skips. Then `-t lint typecheck` — 0 errors.
- [ ] **Step 2:** Append a short section to this plan file titled "Outcome" recording: delay
  value chosen, arm/reset points, any deviation from Task 1's findings, and anything left
  red or deferred. Commit (`git add -f` — docs/superpowers is gitignored).
