# Group 3: Split and stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the char-stack convergence: the Enter-MENU split goes through the
close-and-reopen primitive (with the caret inside the reopened span), and range Ctrl+Space
becomes stack-aware at OUTER nesting levels.

**Architecture:** Both items are consumers of `$liftOutOfCharStack` /
`$splitParagraphAtCharStack` (`libs/shared/src/nodes/usj/charStack.utils.ts`,
`packages/platform/src/editor/markerEdit/charFormatting.utils.ts`). Item 1 replaces
`$splitParagraphWithMarker`'s bare `selection.insertParagraph()`; item 2 replaces the range
branch's text-offset boundary test with child-index-aware boundary detection, reusing the
already-settled attributed-span rule (attribute bytes survive as literal text via
`canonicalAttributeText`, exactly as `$unwrapCharNode` spells them).

**Tech Stack:** Lexical 0.43, Vitest, platform-editor + shared packages.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 item 3
and §3 group 3. Primary sources: `2026-08-14-structural-caret-handoff.md` (work item D — read
in full) and `2026-08-14-char-stack-handoff.md` §3 + §6a (the outer-level analysis and the
attributed-span rule).

## Global Constraints

- Invariants doc governs; read §4 (type-through-split vs palette-retag is RATIFIED — do not
  disturb) and §7b (Ctrl+Space reopen order is a deliberate PT9 divergence — outermost-first).
- TDD red-then-green; zero new corpus skips; lint/typecheck clean; repo commit footer.
- `libs/shared` has an extract-api target only via consumers — after ANY change to
  `charStack.utils.ts` exports, run `env -u _VOLTA_TOOL_RECURSION pnpm nx run-many -t
  extract-api` and commit report changes.

---

### Task 1: Menu split rides the primitive (structural-caret work item D)

**Files:**
- Modify: `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts`
  (`$splitParagraphWithMarker`)
- Modify: `packages/platform/src/editor/markerEdit/charFormatting.utils.ts` only if
  `$splitParagraphAtCharStack`'s entry shape needs a param (prefer reuse over copy)
- Test: `packages/platform/src/editor/markerEdit/charStackParagraphSplit.test.tsx` (extend —
  its fixtures were built to be extended) and
  `packages/platform/src/editor/markerMenu/markerMenuApply.utils.test.tsx` (the
  caret-survival test at EOF gets UPDATED expectations)

**Interfaces:**
- Consumes: `$splitParagraphAtCharStack` (charFormatting.utils.ts) — the command-path split
  that prefixes the separator eagerly and parks the caret inside the reopened run
  (`$selectCharContentStart` convention).
- Produces: `$splitParagraphWithMarker(marker)` splits mid-span WITHOUT producing a
  glyph-less continuation span; new paragraph carries `marker` with its visible prefix; caret
  at the INSIDE of the reopened innermost span's content start.

- [ ] **Step 1:** Red test in `charStackParagraphSplit.test.tsx`: drive the MENU path
  (`EditorRef.splitParagraphWithMarker` or `$splitParagraphWithMarker` directly inside an
  update, matching how `markerMenuApply.utils.test.tsx` drives it) with the caret mid-word
  in `\p \wj \+nd thing\+nd*\wj*`. Assert: tail `ng` still nested-styled in the new
  paragraph (`\p \wj \+nd ng\+nd*\wj*` with the retag applied), no glyph-less span existed
  post-commit (assert on the committed tree), caret collapsed at the innermost reopened
  span's content start. Expected: FAIL (tail loses the style via the unwrap today).
- [ ] **Step 2:** Implement: inside `$splitParagraphWithMarker`, when the caret sits inside
  a char stack (reuse the detection `$splitParagraphAtCharStack` uses — extract a shared
  predicate if it is inline), perform the split through the primitive, THEN retag the new
  paragraph with `marker` + prefix injection in the same update (the existing retag code
  below the `insertParagraph` call — keep its `splitExpected`/deletion-transform notes
  intact and update the doc comment, which currently documents the bypass).
- [ ] **Step 3:** Update the caret-survival test in `markerMenuApply.utils.test.tsx`: the
  unwrap no longer runs on this path, and the expected point is now INSIDE the reopened
  span (structural-caret's handoff says to update it alongside — quote that in the test's
  comment). Run both files. Green.
- [ ] **Step 4:** Regression sweep: `noteEnterFp.test.tsx`, `charFormatting.utils.test.tsx`,
  `markerMenuHarness.test.tsx`, `paraWholeDeletion.test.tsx` (the deletion transform sees a
  different split shape now), and the corpus trio. All green, zero new skips.
- [ ] **Step 5:** Commit.

### Task 2: `$unwrapCharNode` reorder stays honest (guard, not change)

**Files:**
- Test: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.ts` (or the
  file that pins the unwrap — find `unwrap` pins by grep before assuming the filename)

- [ ] **Step 1:** After Task 1, the unwrap's remaining callers are opener-deletion and
  multi-line-paste edge shapes. Grep call sites of `$unwrapCharNode`; for each caller,
  confirm an existing test still exercises it end-to-end. If any caller lost its last
  test-covered path (because Task 1 rerouted it), write ONE pin that reaches the unwrap
  through a still-live path (opener glyph deletion is the canonical one).
- [ ] **Step 2:** Run; green; commit (test-only).

### Task 3: Outer-level stack-aware range Ctrl+Space

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/charFormatting.utils.ts` (the range
  branch of `$removeCharFormattingFromSelection`)
- Test: `packages/platform/src/editor/markerEdit/charFormatting.utils.test.tsx`

**Interfaces:**
- Consumes: `$liftOutOfCharStack`, `$isCharContentEmpty`, `$dropContentEmptySpans`,
  `canonicalAttributeText` — all existing.
- Produces: for a selection whose boundary sits at an outer level's CHILD INDEX (not a text
  offset), the range branch clears every level over exactly the selected extent, keeping
  the unselected head/tail of each outer span styled.

- [ ] **Step 1:** Red tests, straight from char-stack's handoff §6a table plus the outer
  case it documents as wrong today:
  - `\p \wj \+nd holy\+nd*\wj*`, select `holy`, Ctrl+Space → `\p holy` (BOTH levels
    cleared; today yields `\p \wj holy\wj*`? — no: today yields `\p holy` for full
    coverage... build the case their handoff names as the actual failure: `\p \wj A \+nd
    holy\+nd* B\wj*`, select `holy` → expected `\p \wj A \wj*holy\wj  B\wj*`-equivalent
    per their §6a listing — copy the EXACT expected strings from
    `2026-08-14-char-stack-handoff.md` §6a; the handoff's shapes are owner-ratified).
  - The outer-boundary case: `\p \wj one \+nd two\+nd* three\wj*`, select `two three`
    (starts at a child boundary of the outer span) → inner cleared over `two`, outer
    cleared over `two three`, `one` KEEPS `\wj`. Expected today: FAIL (whole outer span
    unwrapped, `one` loses its style).
- [ ] **Step 2:** Implement child-index boundary detection: the branch currently asks
  "does the selection start/end mid-span" by text offset inside the span's direct text
  child; generalize to: for each covered span at any level, compute whether the selection
  boundary falls strictly inside it by comparing (child index, offset) pairs; split the
  span's children at the boundary (existing text-split for text boundaries; child-list
  split otherwise) and lift only the covered part through `$liftOutOfCharStack`. A fully
  covered attributed span re-emits its bytes through `canonicalAttributeText` (the shipped
  §6a rule — do not invent a second spelling).
- [ ] **Step 3:** Green; then run the whole `charFormatting.utils.test.tsx` (the shipped
  §6a/§9 pins must not move) plus `charStackParagraphSplit.test.tsx` and corpus. Zero new
  skips.
- [ ] **Step 4:** Commit.

### Task 4: Gate and outcome note

- [ ] **Step 1:** Full `nx run-many -t test`, then `lint typecheck`, then `extract-api`
  (charStack exports may have grown). All green/clean.
- [ ] **Step 2:** Append "Outcome" to this plan (shipped/deviations/deferred), commit with
  `git add -f`.

---

## Outcome (2026-08-17)

**Shipped — all three implementation tasks, full gate green.**

### Task 1 — Menu split rides the primitive (`d67d57d9`)

As planned. `$splitParagraphWithMarker` now tries `$splitParagraphAtCharStack()` first and falls
back to `selection.insertParagraph()` for non-stack carets. No entry-shape param was needed on the
primitive — `charFormatting.utils.ts` was untouched by this task. The retag of the fresh paragraph
uses `setMarker` + `$injectMarkerPrefix` rather than `$setParaMarkerWithPrefix`: the latter
unconditionally re-parks the caret at the paragraph's content boundary, which would have overridden
the primitive's ratified caret point (INSIDE the innermost reopened span at content start).
`$injectMarkerPrefix` only follows a paragraph-start caret, so both caret shapes come out right.
The caret-survival pin in `markerMenuApply.utils.test.tsx` moved to the new point alongside, per
the structural-caret handoff's instruction. `markerEditNote.utils.ts` was never needed.

### Task 2 — Unwrap guard (`55a9acb6`, test-only)

Both remaining `$unwrapCharNode` callers ($charNodeDeletionTransform` opener-deletion;
`$closeCharSpanAtCaret`) still had end-to-end coverage. What HAD lost its last pin was the unwrap's
reinsert-AFTER ordering (the element-point caret fix), previously pinned only by the repurposed
caret-survival test. One new pin reaches it through opener deletion with an element-point caret at
the span's own child index. Mutation-verified: flipping the unwrap to `insertBefore` fails exactly
this test.

### Task 3 — Outer-level range Ctrl+Space (`e3924642`) — DEVIATION: different defect than planned

The plan predicted the outer-boundary case would fail structurally ("whole outer span unwrapped,
`one` loses its style") and prescribed child-index boundary detection. The code had moved past
that: the char-stack handoff's §6a rewrite (split boundary text, lift each covered node out of its
whole stack) already handles child-index boundaries correctly by construction, and the §6a pins
were present verbatim and green. The ACTUAL red-test failure was one leaked byte:
`\p \wj one \wj*two  three` — the reopened span's structural NBSP separator surviving on the tail.

Root cause (confirmed by instrumentation): when iteration 1's reopen prefixes the separator onto a
later covered node, it does so through a writable clone, leaving the loop's captured reference
stale. Lexical 0.43's `TextNode.setTextContent` short-circuits on `this.__text === text` against
the STALE instance's own field — so the shed (`" three"` == the pre-prefix text) silently no-ops.
Fix: shed on `target.getLatest()`. Three lines, not a boundary-detection rewrite; the plan's step 2
implementation was not needed. Both child-index boundary shapes (selection starting at an inner
span's content start; ending at its content end) are now pinned.

### Gate

- Full `nx run-many -t test`: platform 66 files / 1168 passed / 0 skipped; shared 517 passed;
  utilities 51 passed; shared-react 26 files / 1535 passed / 2 pre-existing skips. shared-react
  timed out once under full-parallel load and passed unchanged in isolation (Nx marked the task
  flaky) — the known full-suite concurrency flake.
- Corpus: `tier2Rebuild.corpus` 141 paragraphs checked, 0 skip-listed; round-trip, testusfm, and
  transform fixed-point suites green. Zero new skips anywhere.
- `lint`/`typecheck`: 10 projects, 0 errors; the 13 warnings are the pre-existing
  `no-console`/`jsx-a11y` ones in scribe/perf-vanilla. The six changed files are eslint-clean.
- `extract-api`: zero report drift (no shared exports changed; `charStack.utils.ts` untouched).

### Cross-track note

The stale-reference `setTextContent` no-op is a general hazard: any transform or loop holding
Lexical node references across mutations that clone those nodes can hit the same silent
short-circuit when the "new" text equals the reference's pre-clone text. Worth knowing for the
whitespace track's space-maintenance transforms.
