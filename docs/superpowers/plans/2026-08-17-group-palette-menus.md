# Group 2: Palette and menus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three palette defects: Space with a non-collapsed selection wraps like
Enter; a commit with zero candidates dismisses the overlay instead of orphaning it; typing `\`
in the book/header region offers the paragraph list, not the character list.

**Architecture:** All three live in the palette stack: shared-react's `UsjNodesMenuPlugin`
(key handling, overlay lifecycle) and platform's `markerMenu/` (context snapshot, apply). The
wrap primitive already exists on the Enter path; item 1 is routing Space to it when a
selection exists. Item 3 changes only the `source` decision in `$getMarkerMenuContext`.

**Tech Stack:** Lexical 0.43, React 19, Vitest + React Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 items
2, 5, 6; invariants doc §4 (the ratified palette table — the ONLY defect row is
Space-with-selection; do not change any other row's behavior).

## Global Constraints

- Read `docs/superpowers/specs/2026-08-11-standard-view-invariants.md` §4 FIRST. Every other
  row of the palette table is RATIFIED behavior — regressions there are the main risk.
- TDD red-then-green. Foreground runs only. Zero new skips.
- `markerMenuHarness.test.tsx` already covers the Space-dismiss and Enter-commit rows — those
  pins must stay green untouched.
- Lint/typecheck clean; commits carry the repo `Co-Authored-By` footer.

---

### Task 1: Space with a non-collapsed selection wraps like Enter

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/UsjNodesMenuPlugin.tsx` (the editable-harness
  branch's Space handling)
- Modify (if the harness contract needs a new call):
  `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts`
- Test: `packages/platform/src/editor/markerMenu/markerMenuHarness.test.tsx`

**Interfaces:**
- Consumes: `$applyMarkerMenuSelection(item, { trigger, literalPrefixLanded }, reference,
  deps)` — the existing apply; the wrap case arrives with `literalPrefixLanded: false` (its
  own comment says so). `$wrapTextSelectionInInlineNode` under `getUsjMarkerAction`.
- Produces: Space over a selection behaves as Enter does over that selection — closed span
  `\marker …\marker*` around the selected text.

- [ ] **Step 1:** In `markerMenuHarness.test.tsx`, find the existing Enter-commit-with-
  selection test (the wrap pin). Write its Space twin: same document (`\p some holy text`),
  select `holy`, open the palette by typing `\nd`, press Space. Assert the SAME end state
  the Enter twin asserts (`\p some \nd holy\nd* text`, `closed` present), plus the palette
  overlay is gone. Run; expected: FAIL — today Space dismisses and the selection is
  untouched.
- [ ] **Step 2:** Implement in `UsjNodesMenuPlugin.tsx`'s editable branch: where the Space
  key currently dismisses (passive palette), branch on
  `!selection.isCollapsed()`: a non-collapsed selection routes to the same commit call the
  Enter path makes, with the marker being the TYPED literal (Space semantics: "whatever was
  literally typed", per the §4 table), `trigger: "backslash"`, `literalPrefixLanded` per the
  Enter path's logic. A collapsed selection keeps today's dismiss-and-literal behavior
  EXACTLY.
- [ ] **Step 3:** Run the new test (PASS) and the whole `markerMenuHarness.test.tsx` +
  `markerMenuApply.utils.test.tsx` (all previously green rows stay green — especially
  Space-dismiss-with-collapsed-caret and `\f`'s special-case row).
- [ ] **Step 4:** Edge red test: Space with a selection and an UNKNOWN typed marker (`\zz`)
  — §4 says Space settles unknowns as typed; assert the wrap uses the literal `zz` span
  (closed), not a refusal. If the apply path refuses unknown wraps, record that in the
  Outcome note and pin the refusal as visible (selection intact, overlay dismissed) instead
  — do NOT invent silent behavior.
- [ ] **Step 5:** Commit.

### Task 2: Empty-palette commit dismisses instead of orphaning

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/UsjNodesMenuPlugin.tsx`
- Test: co-located plugin test (`UsjNodesMenuPlugin.test.tsx`) or
  `markerMenuHarness.test.tsx`, whichever already drives the overlay lifecycle — follow the
  existing pattern.

- [ ] **Step 1:** Reproduce first: type `\` then filter characters matching NOTHING (e.g.
  `\qqqq`) so the candidate list is empty, then press Enter. Write the failing test
  asserting: document unchanged EXCEPT the typed literal (which is the passive-palette
  contract), overlay closed, caret alive at the literal's end. Run; expected: FAIL — the
  overlay stays orphaned (invariants §2's named failure). If it does NOT reproduce, STOP:
  record "not reproducible on merged tree" in the Outcome note, keep the test as a green
  pin, and skip Step 2.
- [ ] **Step 2:** Fix in the commit handler: zero candidates → close the overlay, leave the
  literal, keep the caret (reuse the Escape path's teardown — do not write a second
  teardown).
- [ ] **Step 3:** Run the plugin's full test file + `markerMenuHarness.test.tsx`. Green.
- [ ] **Step 4:** Commit.

### Task 3: Book/header region offers the paragraph list

**Files:**
- Modify: `packages/platform/src/editor/markerMenu/markerMenuContext.utils.ts`
  (`$getMarkerMenuContext` — the `source` decision)
- Test: `packages/platform/src/editor/markerMenu/markerMenuContext.utils.test.tsx`

**Interfaces:**
- Consumes: `$isAtParagraphContentStart(para, anchorNode, offset)`;
  `$findNearestAncestor(anchorNode, $isParaNode)`.
- Produces: `source === "paragraph"` when the caret sits outside any `ParaNode` (the
  book/`\id` region), collapsed selection. Everything else unchanged.

- [ ] **Step 1:** Red test in `markerMenuContext.utils.test.tsx`: build a document whose
  first child is a BookNode (`\id 2SA` shape — copy the construction from an existing test
  in that file or from `2sa` fixtures), park a collapsed caret in the book's text, call
  `$getMarkerMenuContext()`. Assert `source === "paragraph"`. Expected: FAIL — today it
  returns `"character"` (the `para === undefined` fall-through).
- [ ] **Step 2:** Implement: in the `source` ternary, a collapsed caret with NO `ParaNode`
  ancestor yields `"paragraph"`. Keep the existing `hasTextSelection` guard (a text
  selection stays `"character"` — wrapping is a char action).
- [ ] **Step 3:** Green + full file green. Then run `markerItemSource.test.ts` and the core
  extension's own generateInlineMarkerMenuListItems tests are OUT of scope (paranext-core);
  note in the Outcome that the host list generation keys off `parentMarker` and was not
  changed.
- [ ] **Step 4:** Commit.

### Task 4: Gate and outcome note

- [ ] **Step 1:** `env -u _VOLTA_TOOL_RECURSION pnpm nx run-many -t test` (9 projects, zero
  new skips), then `-t lint typecheck` (0 errors).
- [ ] **Step 2:** Append an "Outcome" section to this plan: what shipped, what did not
  reproduce, any §4-table row whose expected shape you had to interpret. Commit with
  `git add -f`.
