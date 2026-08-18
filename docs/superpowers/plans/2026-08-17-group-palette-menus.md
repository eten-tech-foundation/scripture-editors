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

---

## Outcome

All three items shipped. Full gate green: `nx run-many -t test` — 9 projects, and
`nx run-many -t lint typecheck` — 10 projects, 0 errors (13 pre-existing `no-console`
warnings, all in untouched `scribe` files). Zero new skips; the corpus stayed 141/141 with
0 skip-listed.

| Project | Tests |
| --- | --- |
| platform | 1171 passed (66 files) |
| shared-react | 1535 passed, 2 skipped (26 files) |
| shared | 517 passed (35 files) |
| utilities | 51 passed (6 files) |
| perf-react | 3 passed (1 file) |
| scribe, perf-vanilla, test-data | no tests |

### What shipped

**Task 1 — Space over a non-collapsed selection wraps** (`55f1d2da`). Space now commits the
wrap the Enter path already performed: a closed `\marker …\marker*` span around the selected
text, overlay dismissed.

**Task 2 — a commit with zero candidates dismisses** (`002c732a`). Reproduced first: filtering
the palette to nothing and pressing Enter left the overlay mounted over an empty list with no
keystroke able to resolve it. `useMenuCore.select()` returns early when the filtered list is
empty, so it never reaches the `onSelectOption` call that carries `NodeSelectionMenu`'s close.
`EditableMarkerMenu` now claims Enter/Tab with zero candidates and runs Escape's teardown.

**Task 3 — the book/header region is paragraph source** (`c6b387f2`). One-line change to the
`source` ternary, as the plan predicted.

### Deviations

**The plan's stated pins do not exist.** `markerMenuHarness.test.tsx` had ZERO Space tests and
no Enter-commit-with-selection wrap test — Step 1's "find the existing Enter twin" had nothing
to find. It covers `\`-collapsed/non-collapsed preventDefault, Escape, item-select, the Enter
menu, the guards, and re-entrancy. Confirmed against both repos: there is no Space handler
anywhere in the palette stack, in either this repo or paranext-core.

**Space was not "dismissing" — it was being swallowed.** Step 2 says a collapsed selection
"keeps today's dismiss-and-literal behavior EXACTLY". That behavior did not exist. In the
editable harness `NodeSelectionMenu` is UNCONTROLLED, so its query capture claimed `" "` as a
filter character (`event.key.length === 1`): the space never reached the document, marker
completion never ran, and the overlay stayed open over a list filtered to nothing. Both halves
of a silent no-op. Implementing the ratified §4 row — dismiss, and leave the space un-prevented
so the literal lands — is what "keeps today's behavior" was describing, so that is what landed,
pinned by its own test. The ratified row is now true of the harness for the first time.

(The §4 Space row's real implementation is the LEGACY typeahead, which is controlled: the
capture bails, the space reaches the editor, and `\s`-exclusion in the trigger regex kills the
match. The editable harness never inherited it.)

**Which marker Space commits.** Step 2 says the TYPED literal; the §4 defect row says "wrap the
selection the way Enter does"; and the two disagree, because Enter's row is "whatever is
highlighted" while Space's is "whatever was literally typed". Resolved by taking the ACTION
from the defect row (wrap, closed span) and the MARKER from Space's own row: an exact match of
the typed text against the offered entries. In practice they nearly always agree — the ranker
puts an exact match first — and they diverge only on a near-miss, where committing the
highlighted entry would apply a marker the user never typed.

**Step 4's unknown-marker case took the documented fallback.** `\zz` + Space cannot wrap in an
unknown span: `isUsjMarkerSupported` keeps unknown markers out of the item list, and forcing a
synthetic item through `getUsjMarkerAction` yields a no-op action — a silent no-op, which is the
thing being removed. So the refusal is pinned as VISIBLE per the step's own instruction: overlay
dismissed, selection intact, and the space preventDefaulted so it cannot replace the selected
word. §4's "cannot commit one not in the list" (Enter's row) governs here, since the wrap has no
literal in the document for Tier 2 to settle as unknown.

**Where the typed literal comes from.** For the wrap case the `\` trigger preventDefaults, so
nothing typed reaches the document and there is no literal to read. The palette's own filter
query is the only record. `NodeSelectionMenu` gained one optional `onFilterChange(query,
filteredOptions)` callback so the owner reads the filter state rather than re-deriving it —
additive, no behavior change for the typeahead/scribe/`NodesMenu` consumers. This also supplies
Task 2's zero-candidate check, so both tasks share one source of truth for the filter rule.

**`wrapsSelection` was dropped as redundant.** The wrap case is exactly
`trigger === "backslash" && !literalPrefixLanded` — the `\` trigger only lets a literal land when
the selection was collapsed. A second field would have been a drift hazard against the first.
Space's passive semantics are scoped to the backslash trigger; the Enter menu has none.

**Task 3 corrects the context, not the offered list.** The plan implies the book region was
being offered the character list. It was not: with no `paraMarker` the character source is
unconditionally empty, so the existing FB 21054 empty-to-paragraph fallback was already handing
that region the paragraph list. The `source` FIELD was the only wrong thing. A test in
`markerItemSource.test.ts` pins the equivalence so the two paths cannot diverge later. Per Step
3, host-side `generateInlineMarkerMenuListItems` keys off `parentMarker` and was not touched.

### Cross-group findings

**Pre-existing flake, ~25-50% — Group 3 territory.**
`markerMenuApply.utils.test.tsx > $splitParagraphWithMarker — caret survival across the
same-commit unwrap > parks the caret at the NEW paragraph's content start when the split lands
mid-span` fails intermittently on `anchor.offset` (expected 0, received 1). Captured on the
CLEAN tree at `2b5fd64b` before any edit in this worktree, and 3 of 6 runs after. Nothing else
in the suite is unstable. It is the same caret-lands-inside-the-reopened-span behavior as
recommendations §1 item 3, so it belongs to **Group 3 (split-and-stack)** — flagging it because
a full-suite gate in any worktree will trip over it and it is not that group's regression.

**The empty-palette orphan also exists host-side, unfixed.** paranext-core's marker menu
delegates all key handling to cmdk and renders a `CommandEmpty` row; Enter there does nothing
and the popover stays open. The web-view guards only the OPEN (`inlineMarkerMenuItems.length &&
…`), not filtering-to-empty afterwards. Out of scope here — this worktree is scripture-editors
only — but item 5's rationale applies verbatim to the host and is worth a Host-track ticket.

**`\f` commits like Enter with no palette branch involved.** The §4 row is emergent from the
fragment tokenizer: a space-terminated `\f ` tokenizes to a full note with a default `+` caller
(`usfmFragmentToUsj.ts`), which is the structure the Enter commit produces. There is no `\f`
special case in the palette to preserve — the thing not to disturb is the Tier-2 path. Recorded
because the §4 table reads as though the palette owns that row.
