# Group 4: Whitespace, paste, and test debts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the NBSP-paste literal-`\n` defect; pin milestone attribute order; tag the
table-cell separator; and pay the two cross-track test debts (wrap-a-whitespace-only
selection; char-stack's paragraph-end Ctrl+Space test on the full harness).

**Architecture:** One behavior fix (paste), one one-liner (cell separator), three test-only
tasks. The paste fix lives in whitespace's `$handlePasteForStandardView`
(`libs/shared-react/src/plugins/usj/whitespaceDisplay.plugin.utils.ts`), which claims any
NBSP-carrying paste at HIGH priority and today inserts the whole payload in one
`selection.insertText`, leaving literal `\n` bytes.

**Tech Stack:** Lexical 0.43, Vitest, shared-react + platform packages.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 items
7, 8, 11 and §3 group 4. Sources: `2026-08-14-char-stack-handoff.md` §6b-note and §6d;
`2026-08-14-whitespace-handoff.md` "Deliberately not done".

## Global Constraints

- Invariants doc governs (§1 Invariant I for the paste fix: a byte on screen no USFM line
  can carry is the defect).
- TDD red-then-green; zero new corpus skips; lint/typecheck clean; repo commit footer.
- The paste-claim LADDER matters: `$handlePasteForStandardView` (shared-react, HIGH) runs
  before `MarkerEditPlugin`'s multi-line claim (platform). Do not reorder claims; fix inside
  the whitespace handler.

---

### Task 1: NBSP-carrying multi-line paste splits paragraphs

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/whitespaceDisplay.plugin.utils.ts`
  (`$handlePasteForStandardView`)
- Test: co-located `whitespaceDisplay.plugin.utils.test.tsx` (or wherever that handler's
  existing paste pins live — grep `handlePasteForStandardView` first)

**Interfaces:**
- Consumes: `INSERT_PARAGRAPH_COMMAND` dispatch (the hook `$splitParagraphAtCharStack`
  claims), `selection.insertText`.
- Produces: an NBSP-carrying paste with `\n` in its text inserts line-by-line with an
  INSERT_PARAGRAPH_COMMAND dispatch between lines — the same replay shape
  `MarkerEditPlugin`'s multi-line claim uses (read its handler around the
  `pastedText.split("\n")` site and mirror the replay loop; do not import from platform
  into shared-react — replicate the two-step loop locally, it is four lines).
- Char-stack interplay for free: because the split goes through the command, a paste into a
  char stack closes and reopens the stack per line.

- [ ] **Step 1:** Red test: caret mid-word in `\p \nd thing\nd*` (build per the repo test
  conventions: `$getRoot().append($createParaNode("p").append(...))`), paste payload
  `"one x\ntwo"` through the real paste command path the existing tests for this
  handler use. Assert: TWO paragraphs, no literal `\n` anywhere in any text node, both
  lines inside the reopened style. Expected: FAIL — one paragraph with an embedded `\n`
  (char-stack §6b-note's measured shape).
- [ ] **Step 2:** Red test 2 (plain-text region): paste `"a b\nc"` into a plain
  paragraph — expect two paragraphs, second starting `c`, NBSP glyph preserved in the
  first. Expected: FAIL the same way.
- [ ] **Step 3:** Implement the line replay inside the NBSP claim. Single-line NBSP pastes
  keep the exact current behavior (existing pins must not move).
- [ ] **Step 4:** Green; run the handler's whole test file + `charStackParagraphSplit` +
  the platform paste tests + corpus trio. Zero new skips.
- [ ] **Step 5:** Commit.

### Task 2: Move char-stack's paragraph-end Ctrl+Space test to the full harness

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/charFormatting.utils.test.tsx` — the
  test named "closes the stack without reopening it when nothing follows the caret" (its
  call site documents WHY it ran char-sync-only; that reason died with whitespace's
  transform rewrite)

- [ ] **Step 1:** Move the test to the full-harness mount its siblings use (the composed
  environment with `TextSpacingPlugin`), keep the assertion, extend it to ALSO assert the
  emitted space SURVIVES the commit (the byte the old transform ate). Delete the
  stale-harness comment; say in one line why the full stack is now safe.
- [ ] **Step 2:** Run; expected: PASS immediately (composition already fixed it — this is
  the pin). If it FAILS, the whitespace rewrite did NOT cover this shape: stop, keep the
  red test, record it in the Outcome note as a real regression for the wrap-up chat.
- [ ] **Step 3:** Commit.

### Task 3: The wrap-a-whitespace-only-selection shared test

**Files:**
- Test: `packages/platform/src/editor/markerEdit/markerMenuApply.utils.test.tsx` (append a
  describe; the wrap primitive's tests live here) — or `TextSpacingPlugin.test.tsx` if the
  existing "orphaned lone space" pins there make a better home; pick ONE, say why in the
  test header.

- [ ] **Step 1:** End-to-end: document `\p one two`, select the SPACE between the words,
  apply `\nd` through the wrap path (`$applyMarkerMenuSelection` with a real selection —
  copy the drive shape from the Enter-wrap test). Assert: a `\nd` span whose content is
  exactly the one space, the span shape matching what char-stack's `$isCharContentEmpty`
  does NOT drop (a real space is content), and the orphaned-space transform pins still
  hold (no deletion, no fabrication) — serialize and compare full paragraph USJ.
- [ ] **Step 2:** Run. Whatever the outcome, it is information: green = pin it; red =
  the wrap still produces the empty-span shape whitespace deferred on — keep the red test
  skipped-NEVER, record in Outcome, and fix if the cause is within this group's files
  (the trailing-space transforms); if the cause is the wrap primitive itself, record for
  group 3's owner instead. Do not fix across the group boundary.
- [ ] **Step 3:** Commit.

### Task 4: Milestone attribute-order pin

**Files:**
- Test: `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts` (fold-order tests live
  here) and, if red at the settle level,
  `packages/platform/src/editor/markerEdit/` (the milestone settle path)

- [ ] **Step 1:** Red-or-green pin at the unit level: a milestone whose USJ attributes are
  authored in NON-canonical order (unknowns before sid) — run it through the display fold
  + the settle's re-tokenize (the same round the fixed-point suite runs, but with this
  non-canonical fixture) and assert the SERIALIZED attributes come back in the AUTHORED
  order. Use the corpus fixed-point harness pattern
  (`corpus-transform-fixed-point.test.tsx`) with a one-off fixture rather than editing
  `corpus-data.ts`.
- [ ] **Step 2:** If green: keep the pin, done. If red: the fold's fixed order (sid, eid,
  unknowns) is rewriting a byte on dirty — fix by folding in node-state insertion order in
  `$milestoneAttributeRunPieces`' bytes builder (`attributeDisplay.utils.ts`), keeping the
  display and `canonicalAttributeText` in agreement. Re-run corpus (21 fixtures must stay
  green — canonical order must serialize IDENTICALLY to before).
- [ ] **Step 3:** Commit.

### Task 5: Table-cell separator token tag

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` (`createTableCell`
  — the NBSP separator near line ~547 carries the `marker-trailing-space` tag but NOT
  token mode; mirror `createTableRow`'s shape exactly)
- Test: the adaptor's existing table tests (grep `createTableCell` in tests) — add the
  twin-shape assertion the collapsed-note fix used (`note-shape-twin` pattern: row and
  cell separators serialize with identical mode/tag).

- [ ] **Step 1:** Red test: assert the cell separator's serialized shape has
  `mode: "token"` like the row's. FAIL today.
- [ ] **Step 2:** One-line fix; green; regenerate 2SA fixtures
  (`cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm run generate:test-data`,
  then `npx prettier --write libs/test-data/src/data/2sa.lexical.*.ts`) and run the
  corpus + shared-react selection suites against them.
- [ ] **Step 3:** Commit (fixtures included).

### Task 6: Gate and outcome note

- [ ] **Step 1:** Full `nx run-many -t test` (zero new skips), `lint typecheck` clean.
- [ ] **Step 2:** Append "Outcome" (which tests landed green-first vs red-first; any
  boundary-crossing finding recorded for the wrap-up chat). Commit with `git add -f`.

---

## Outcome

Branch `sv/rb/whitespace-paste-tests`. Five commits, one per task. Two behavior fixes shipped,
three test debts settled, two findings handed back across group boundaries.

### Task-by-task

| Task | Born | Result |
| --- | --- | --- |
| 1 — NBSP multi-line paste | RED | Fixed. Newlines now replay as paragraph splits. |
| 2 — paragraph-end Ctrl+Space on the full harness | GREEN | Pin only; no regression. |
| 3 — wrap a whitespace-only selection | RED | Cause outside this group. Parked skipped. |
| 4 — milestone attribute order | GREEN at the settle, RED at load | Fold exonerated; load leg recorded. |
| 5 — table-cell separator | RED | Fixed, and the ROW needed it too. |

### Task 1 — the paste fix

`$handlePasteForStandardView` lives in `packages/platform/src/editor/markerEdit/`, not
`libs/shared-react/src/plugins/usj/` as the plan's Architecture section says. Both paste claims
therefore sit in the same package, so the plan's "do not import from platform into shared-react —
replicate the two-step loop locally" constraint was moot; the loop is still local to the handler,
which is the shape the plan wanted anyway.

The handler dispatches `INSERT_PARAGRAPH_COMMAND` through `$getEditor()` rather than taking a new
`editor` parameter. That keeps `MarkerEditPlugin.tsx` untouched — a file several other groups are
editing this round — and it is an established pattern here (`markerMenuApply.utils.ts`,
`displayRunSync.utils.ts`). Single-line pastes keep the exact one-`insertText` path they had; line
endings normalize (`\r\n?` → `\n`) first, matching both sibling claims.

One pre-existing pin moved, deliberately: "separates blocks (and `<br>`) with newlines so a
multi-paragraph html paste doesn't merge words" asserted the DEFECT — one paragraph holding
`one~two\nthree\nfour`. It now asserts the three paragraphs that shape means.

A trap worth recording: `$getRoot().getTextContent()` joins block children with newlines of its
own, so it cannot distinguish a literal pasted `\n` from a paragraph boundary. The "no newline
survived" assertion reads per TEXT NODE instead.

### Task 3 — cross-group finding: the wrap primitive drops a whitespace-only selection

Measured, not theorized. Document `\p one two`, select the space between the words, apply `\nd`
through `$applyMarkerMenuSelection` on the full harness:

```
authored:  ["one two"]
result:    ["one ", { type: "char", marker: "nd" }, "two"]     i.e. \p one \nd \nd*two
```

The user's apply silently does nothing AND an empty `\nd \nd*` pair is written to the file.

Cause: `$moveLeadingSpaceToPreviousNode` (`packages/platform/src/editor/adaptors/
usj-marker-action.utils.ts`) moves a wrapped node's leading space out to the previous sibling
unconditionally. When the selection IS that space, the trim empties the node and the wrapper keeps
only its structural separator. The guard is one predicate: decline to move a leading space when it
is the node's entire content.

**Whitespace's half is clean** — neither trailing-space transform deletes or fabricates a byte in
this shape. This is the wrap primitive, so per the plan's boundary rule it goes to the wrap's
owner. Both group 2 (palette-menus, item 2 puts a non-collapsed Space through this same wrap) and
group 3 (split-and-stack) touch this path; whoever lands first should take it. The test is written
and `it.skip`ped with the cause in its header — un-skip it as the red test for that fix.

### Task 4 — the plan's prescribed fix does not apply

The plan expected a red fold rewriting bytes on dirty, fixable by folding in node-state insertion
order. Measured: the whole-document dirty pass is a FIXED POINT — the display fold and the settle
rewrite nothing. A non-canonically ordered milestone (`who` before `sid`) loses its order at LOAD:
`createMilestone` lifts `sid`/`eid` out of the marker object into dedicated `MilestoneNode` fields
and `createMilestoneMarker` re-emits them ahead of the unknowns.

So there is no authored order left in the tree for the fold to preserve — `$milestoneAttributeRunPieces`'
bytes builder cannot fix this, and restoring fidelity means giving the node model an ordered
attribute map (both adaptors plus `MilestoneNode`). Recorded, not attempted: it is a node-model
change well outside this group, and no evidence yet that a real document authors milestones
non-canonically.

Both legs are pinned green — the load-leg pin records today's normalization so a future node-model
change fails it deliberately rather than silently.

### Task 5 — the row was wrong too

The plan said the cell separator lacked token mode and to "mirror `createTableRow`'s shape
exactly". `createTableRow` was missing token mode as well; the para-marker prefix (line ~473) is
the only correct model. Both are fixed, and the cell's bare `"marker-trailing-space"` string
literal now goes through `MARKER_TRAILING_SPACE_TEXT_TYPE`. The twin test covers all three
separators so a future divergence names which one drifted.

2SA fixtures regenerated via `pnpm run generate:test-data` + prettier. Only
`2sa.lexical.editable.ts` changed, and only these separators' `mode` — the visible and hidden
fixtures build no such separators.

### Deviations from the plan

1. Task 1's file lives in `packages/platform`, not `libs/shared-react` (plan Architecture).
2. Task 1 reaches the editor via `$getEditor()` rather than a new parameter, to leave
   `MarkerEditPlugin.tsx` unmodified for other groups.
3. Task 3 is parked skipped rather than left red, per the handoff rule that the branch must be
   green. The plan's "keep the red test" instruction predates that rule.
4. Task 4 is TWO green pins rather than one, split so the load leg and the transform leg localize
   separately; the plan's prescribed fold fix was measured inapplicable.
5. Task 5 fixes the ROW as well as the cell.
6. Task 3's test went to `markerMenuApply.utils.test.tsx` (the plan's first choice), on the
   `fullHarnessEnvironment` mount so both trailing-space transforms are live.

### Suite numbers

Full `nx run-many -t test`: 9 projects green. Per project —

| Project | Tests | Skips |
| --- | --- | --- |
| platform-editor | 1168 (66 files) | 1 — Task 3's parked test, the package's only skip |
| shared-react | 1535 (26 files) | 2 — both pre-existing and named |
| shared | 517 (35 files) | 0 |
| utilities | 51 (6 files) | 0 |

Corpus suites at full count with zero skips throughout: 22 transform fixed-point, 116 adaptor
round-trip, 10 testUSFM round-trip. `KNOWN_FAILURES` in `corpus-transform-fixed-point.test.tsx`
stays empty.

One flake observed and dismissed: `markerMenuApply.utils.test.tsx`'s "parks the caret at the NEW
paragraph's content start" failed once mid-session and passed on two consecutive cache-skipped
re-runs and in the full gate — the known platform timing flake, not a regression.

### For the orchestrator

Two items leave this group unresolved, both deliberately:

1. **The wrap primitive's whitespace-only selection** (Task 3 above) — a one-predicate fix in
   `usj-marker-action.utils.ts`, with a written skipped test ready to un-skip. Route to whichever
   of groups 2/3 lands on the wrap first.
2. **Milestone authored attribute order** (Task 4 above) — needs an ordered attribute map on
   `MilestoneNode`; no owner in this round's groups. Recorded for TJ rather than assigned.
