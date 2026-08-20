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

- [x] **Step 1:** Read the three files above. Confirm: (a) the deferred resolve passes
  `lastAnchorKey` as except-key; (b) `$exceptKeysAround(undefined)` returns an empty set;
  (c) `settleCascadeDepth` resets in exactly the KEY_DOWN and CLICK handlers.
- [x] **Step 2:** If (b) is false, STOP and record the actual semantics in the plan-deviation
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

- [x] **Step 1:** Write the failing test: mount the trio; build `\p \nd ⟨nbsp⟩Lord\nd*`; put
  the caret INSIDE the opener glyph and make a pending edit (retype `\nd` to `\wj` — the
  Tier-1 closer/opener pend path); assert the node is pending (bytes unsettled). Then
  `await vi.advanceTimersByTimeAsync(IDLE_SETTLE_DELAY_MS + 50)` WITHOUT moving the caret,
  flush microtasks, and assert the document settled exactly as caret departure would have
  settled it (same assertion as the existing departure test for that edit — copy the expected
  shape from `markerEditTier1`'s or `unmatchedCloser.test.tsx`'s departure pins, whichever
  matches the chosen edit).
- [x] **Step 2:** Run it: `env -u _VOLTA_TOOL_RECURSION pnpm nx test
  @eten-tech-foundation/platform-editor -- debounceSettle`. Expected: FAIL — nothing settles
  (no timer exists; `IDLE_SETTLE_DELAY_MS` is not exported).
- [x] **Step 3:** Add a second failing test: same setup, but advance time in two halves with a
  keystroke (dispatch KEY_DOWN through the editor like `damagedGlyphSettle` does) between
  them; assert the pend did NOT settle (the gesture reset the timer), then a full idle period
  after the keystroke DOES settle it.
- [x] **Step 4:** Add a third failing test: after the timer settles, assert the settle merged
  into history correctly — one Ctrl+Z (dispatch UNDO_COMMAND) restores the pre-settle literal
  (the same undo contract the departure settle has).
- [x] **Step 5:** Commit the red tests.

### Task 3: The timer

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx`

**Interfaces:**
- Produces: `export const IDLE_SETTLE_DELAY_MS = 1000;` (PT9-style reformat delay; exported
  for tests). A module-scoped timer handle inside the effect, cleaned up on unmount.

- [x] **Step 1:** Implement: in the effect that owns `settleCascadeDepth`, add
  `let idleSettleTimer: ReturnType<typeof setTimeout> | undefined`. Add
  `armIdleSettle()`: clears any existing timer; if `context.pendingKeys.size === 0` or the
  plugin is disposed, do nothing; else `setTimeout` for `IDLE_SETTLE_DELAY_MS` whose callback
  mirrors the existing microtask body EXCEPT it passes `undefined` as the except-key:
  respect `disposed`, respect the `settleCascadeDepth >= MAX_SETTLE_CASCADE_DEPTH` backstop
  (same warn), then `editor.update(() => { const mutated = $resolvePendingMarkers(context,
  undefined); settleCascadeDepth = mutated ? settleCascadeDepth + 1 : 0; if (!mutated)
  $addUpdateTag(HISTORY_MERGE_TAG); })`.
- [x] **Step 2:** Arm/reset points: call `armIdleSettle()` (a) at the END of the update
  listener on every non-historic, non-cursor-tag commit (after the existing anchor
  bookkeeping — pendingKeys may have just changed), and (b) in the KEY_DOWN and CLICK
  handlers right where `settleCascadeDepth = 0` happens. Clear the timer in the effect's
  cleanup alongside `disposed = true`.
- [x] **Step 3:** Run the Task 2 tests. Expected: PASS. If the caret-held settle is blocked,
  the likely cause is the historic/appPlacedCaret suppression — the timer callback must NOT
  early-return on `appPlacedCaret` (an idle expiry is a real settle trigger); document why at
  the call site.
- [x] **Step 4:** Run the neighbors that guard this machinery:
  `damagedGlyphSettle`, `markerEditLoop` (if present), `unmatchedCloser`,
  `typedMarkerResolution`, `noteCategorySettle`, `chapterAltnumberSettle`, and the three
  corpus suites. Expected: all green, zero new skips. The mid-typing tests in
  `typedMarkerResolution.test.tsx` are the canary for a timer firing too eagerly under fake
  timers — if any goes red, the arm points are wrong (most likely arming inside the historic
  branch), not the delay.
- [x] **Step 5:** Commit.

### Task 4: Full-suite gate and handoff note

- [x] **Step 1:** `env -u _VOLTA_TOOL_RECURSION pnpm nx run-many -t test` — all 9 projects
  green, zero new skips. Then `-t lint typecheck` — 0 errors.
- [x] **Step 2:** Append a short section to this plan file titled "Outcome" recording: delay
  value chosen, arm/reset points, any deviation from Task 1's findings, and anything left
  red or deferred. Commit (`git add -f` — docs/superpowers is gitignored).

---

## Outcome (2026-08-17)

**Shipped.** All four tasks complete; full gate green.

**Delay:** `IDLE_SETTLE_DELAY_MS = 1000` (PT9's debounced-reformat delay), exported from
`MarkerEditPlugin.tsx`.

**Arm/reset points, as landed:**

- The update listener re-arms on every non-suppressed commit, immediately after the
  `lastAnchorKey` bookkeeping and BEFORE the departure-queue early returns (so commits that
  decline to queue a departure resolve still push the clock back). The suppressed paths —
  historic restores, `CURSOR_CHANGE_TAG` yanks, and any commit inside the app-placed window —
  never arm.
- The KEY_DOWN and CLICK handlers re-arm exactly where `settleCascadeDepth = 0` happens.
- `armIdleSettle` with an empty pending set CLEARS the timer; effect cleanup clears it alongside
  `disposed = true`.
- The expiry callback re-checks `disposed`, empty-pending, the app-placed window, and the
  cascade backstop, then runs `$resolvePendingMarkers(context, undefined)` through the shared
  `settlePendingNow` (below).

**Task 1 findings, all confirmed against the code:** (a) the deferred departure resolve passes
`lastAnchorKey`; (b) `$exceptKeysAround(undefined)` returns an empty set, so `undefined` means
"shield nothing"; (c) `settleCascadeDepth` resets in exactly the KEY_DOWN and CLICK handlers
(plus the zero-on-non-mutating-settle reset inside the resolve).

**Refactor made in passing:** the microtask body's cascade-backstop warn and
resolve-plus-history-merge block were extracted into `settleCascadeExceeded()` and
`settlePendingNow(exceptKey)`, shared by both clocks so they cannot drift. No behavior change on
the departure path (all 232 neighbor/corpus tests green unmodified).

**Deviations from the plan:**

1. **The timer callback DOES early-return on `appPlacedCaret`** — the opposite of Task 3 Step
   3's aside. The plan's text contradicted the code's documented invariant: the window binds the
   departure, forced-commit, and blur clocks precisely so restored/yanked content never
   re-settles without a user gesture, and a timer armed BEFORE the window opens (typing then
   Ctrl+Z; typing then a scrRef yank) survives into it. Firing there would reintroduce the
   "undo re-settles ~1s later" bug class. Two tests pin the corrected behavior: the historic
   window after an undo, and a LIVE timer held through a `CURSOR_CHANGE_TAG` yank then released
   by the next gesture. The plan's stated scenario (a caret-held settle blocked in the plain
   idle case) never occurs — no window is armed during ordinary typing, so the core tests pass
   with the guard in place.
2. **No `isComposing()` guard, and no mid-IME test.** A guard plus red test were built and then
   removed after investigation: in jsdom, Lexical's own post-composition selection reconcile
   commits an anchor drift that hands the pend to the caret-DEPARTURE clock, which settles it
   with composition still active — pre-existing behavior, unreachable by my timer. No faithful
   discriminating test is constructible in this environment, and a timer-only guard would make
   the clocks diverge (the defect shape Invariant IV names). If mid-composition settling needs
   suppressing, it belongs in the SHARED settle computation, decided with a real-IME repro.
   Documented at the call site.
3. **Four tests instead of three** — the plan's three plus the live-timer-through-yank-window
   test that deviation 1 required.

**Full-suite numbers (all 9 projects green, `nx run-many -t test`):** utilities 51 passed;
shared 517 passed; shared-react 1535 passed, 2 skipped (both pre-existing in
`editor-delta.adaptor.test.tsx`, untouched); platform-editor 1167 passed (67 files; corpus
suites at full count, `tier2Rebuild.corpus` reporting 141/141 with 0 skip-listed); scribe-editor
2 passed; perf-react 3 passed; test-data / perf-vanilla / platform (demo) have no vitest
summaries (no-op test targets). Zero new skips anywhere. Lint + typecheck: 0 errors (the 13/23/4
warnings in other projects are pre-existing `no-console` in scripts; platform-editor lint is
clean).

**Residual risk, routed to the palette/host owners (cross-group):** there is NO observable
palette-open signal `MarkerEditPlugin` can read (menu open-state is local React state; the
production host renders its own overlay, possibly cross-frame). The trigger literal typed before
opening a palette was previously protected by the caret-anchor gate and the BLUR except-key; the
idle clock now settles the CARET-HELD node too, so a palette session idle past the delay (or a
cross-frame palette click followed by one idle period) settles the trigger literal under the
open palette — and `$removeLiteralTriggerPrefix` deliberately refuses to strip a `MarkerNode`
glyph, so a subsequent palette apply would insert without consuming the literal. The existing
caller obligation on `EditorRef.commitPendingMarkerEdits` ("do not call while a palette session
is open") cannot be discharged for an editor-internal timer; a host-declared palette-session
signal (e.g. wiring the existing `setTransientInput` declaration into the engine's suppression)
is the natural shape. Needs a decision by whoever owns `Editor.tsx`/`editor.model.ts` and the
palette before this branch ships to a palette-bearing host.
