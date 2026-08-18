# Feedback round: the `\` palette becomes ACTIVE — Outcome

Owner-directed change (TJ, 2026-08-18): the backslash palette stops being passive. Typing after
`\` filters the palette and never reaches the document; Space commits the typed marker with the
passive palette's ratified end states; Enter commits the highlighted item as before. Two palette
defect reports (Space-with-selection no-wrap; broken filter ranking with a selection) were
investigated through the real app as part of the same round.

Branch: `sv/fb/palette-active` (off the residual-backlog merge). Implementation commit
`81c07e48`; spec/docs follow it.

## What shipped

**`EditableMarkerMenu` (shared-react, `UsjNodesMenuPlugin.tsx`) is now an active palette.**

- The `\` trigger preventDefaults in EVERY selection shape (previously only over a selection).
  Nothing the user types while the palette is open reaches the document in any context —
  collapsed caret, selection, note content alike. The typed characters go to
  `NodeSelectionMenu`'s query capture, which already filtered with exact-match-first ranking
  (`filterAndRankItems`: exact > startsWith > contains).
- **Space commit, collapsed caret:** the typed query is materialized at the caret as the SAME
  literal bytes passive typing would have accumulated — `trigger + query + " "` — in one
  `editor.update`, and the marker-edit engine's Tier 2 (`$textNodeTier2Transform`, terminated-
  marker immediate rebuild) resolves them exactly as it resolved passive typing. All ratified
  Space rows are therefore preserved BY CONSTRUCTION, not re-implemented: open span
  `closed="false"` for an inline marker (no auto-closer), unknown markers settle as typed,
  `\f ` tokenizes to the full note ("commits like Enter", emergent from the tokenizer).
- **Space commit, non-collapsed selection:** unchanged from the residual-backlog palette group's
  work — an EXACT match of the typed query against the offered entries commits the wrap (closed
  span, same shape as the Enter commit, per the owner's earlier ratification); a marker not
  offered refuses visibly (palette closed, selection intact, space prevented).
- **Enter/Tab commit:** unchanged — commits the highlighted item through
  `$applyMarkerMenuSelection` / `$splitParagraphWithMarker`. Zero candidates still dismisses
  (Escape's teardown), now leaving the document unchanged rather than "leaving the literal"
  (nothing lands to leave).
- **Escape:** closes the palette, document byte-identical. See "Escape decision" below.
- **`NodeSelectionMenu` gained `passthroughKeys?: readonly string[]`** — keys the query capture
  must decline so the owner's own handler can claim them wherever it sits in the same
  command-priority chain. Needed because within one Lexical priority tier handlers run in
  registration order, and React effect timing puts the capture AHEAD of the re-registered
  harness handler for exactly one keystroke: the first key after the menu opens. Without this, a
  `\` + immediate Space was swallowed as a filter character. The `\` palette passes `[" "]`; the
  Enter-triggered menu passes nothing (its space keeps filtering, unchanged).

## The trigger-backslash implementation choice

**The `\` never lands.** The alternative — land it and remove it on commit — was rejected:

- Escape's new contract ("document unchanged") would require a MUTATION on Escape (removing the
  landed `\`), breaking the harness's "Escape never mutates" rule and adding an undo step.
- Every commit path would need the literal-prefix cleanup; with never-lands, the cleanup is
  structurally unreachable and item commits always pass `literalPrefixLanded: false`. The end
  state is byte-identical to "landed-then-removed" (the apply's cleanup deleted exactly the
  trigger bytes).
- Saves/settles mid-palette can no longer observe a half-typed literal: the debounce+palette
  KNOWN exposure (manual script item 52 — the idle settle mangling the open palette's literal)
  is structurally gone for the trigger bytes, because there are no trigger bytes in the document.
- Byte-identity for the Space commit is preserved by materializing the full passive literal at
  commit time instead (see above), so Tier 2 sees the same bytes it always saw, just in one
  update instead of N keystrokes.

`literalPrefixLanded` stays in the `EditableMarkerMenuHarness.apply` contract and in
`$applyMarkerMenuSelection` (semantics unchanged, `markerMenuApply.utils.test.tsx` untouched):
hosts whose own palettes DO land literals (paranext-core's overlay) still pass `true`.

## Ratified-table changes (invariants §4, updated in the spec, dated and owner-directed)

1. **Palette row: Passive → Active** (both columns). Owner's direct instruction.
2. **Escape row: "leaves the typed literal" → "closes the palette, document untouched".** The
   old row described the passive palette, where the literal was in the document before Escape
   was pressed. Under an active palette that row is obsolete — nothing lands, so there is no
   literal to leave. THIS IS THE PROMINENT RATIFIED-ROW UPDATE FOR THE OWNER: if "Escape leaves
   the typed literal" was ever load-bearing for anyone, it no longer holds.
3. **"Who completes the marker" (Space): still Tier 2**, but from the materialized commit
   literal rather than per-keystroke document bytes.
4. **The Space-with-selection defect row is closed** (fixed by the residual-backlog palette
   group; verified to hold under the active palette, in tests and in the running app).
5. All APPLY end states — closed="false" on Space, closer on Enter, typed-vs-highlighted marker
   choice, unknown-marker behavior, `\f` — are UNCHANGED.

## The two defect reports, resolved

**B — "Space with a selection still does not wrap in `nx dev platform`":** does NOT reproduce on
this branch. Driven through the real app (Playwright against the dev server, Standard view,
external UI off): selection + `\nd` + Space wraps as `\nd …\nd*` closed span in every timing
variant tried (immediate, 2.5s idle-settle pause before Space, pause after `\`). Root cause of
TJ's report: **`sv/integration` does not contain the palette-menus work**
(`git merge-base --is-ancestor 55f1d2da sv/integration` fails — the Space-wrap commit is only in
the residual-backlog line). The build TJ ran had NO Space handler at all: the space was
swallowed by the palette's query capture (the silent no-op the palette group's outcome
documented). On this branch the wrap works and stays working under the active palette (pinned).

**C — "filter ranking broken with a selection (footnote editor: fq first, w 9th)":** the in-repo
palette's query capture was already selection-independent, so THIS repo's palette filtered
correctly with a selection even before this round (verified in the real app). TJ's symptom —
the UNFILTERED note-context list (fq, xt, addpn, …) — is the signature of a query read from
DOCUMENT bytes, which cannot accumulate while a selection exists: that is `sv/integration`'s
flow (and remains the host palette's flow in paranext-core, out of scope here). Under the
active palette the query NEVER depends on document bytes, so the failure mode is structurally
gone in every context; pinned in both contexts (main editor and note content, selection live,
typed `w` → exact match `w` ranked first, filtered list not context order).

## Test changes (per the regression contract, per test)

`markerMenuHarness.test.tsx` (all changes justified by the passive→active axis; apply end states
untouched):

- "does not preventDefault for a collapsed selection - the literal `\` lands" → INVERTED to
  "preventDefaults for a collapsed selection too - the active palette's trigger never lands".
  The old pin described the retired passive palette.
- "Escape closes the menu without altering the document (the literal `\` stays)" → "Escape
  closes the menu leaving the document unchanged - nothing typed ever landed" (ratified-row
  update; asserts byte-identical content node).
- "selecting a menu item inserts it structurally and removes the literal `\`" → "… - no literal
  trigger prefix ever lands to clean up" (same structural assertions, literal simulation
  dropped; commit arrives with `literalPrefixLanded: false`).
- Zero-candidate commit pin: "leaving the typed literal and the caret" → "leaving the document
  unchanged and the caret alive" (nothing lands under active; teardown contract unchanged).
- "Space over a collapsed caret dismisses … leaves the literal space to land (passive palette)"
  → REPLACED by four active-Space tests: typed marker commits as `closed="false"` open span;
  `\f` + Space commits like Enter (note materialized — the emergent row verified through the
  active flow); `\zz` + Space settles as typed; `\` + immediate Space materializes just the
  trigger byte (the first-key passthrough pin, byte-identical to passive).
- NEW "filter ranking with a selection" describe: main editor and note content — exact match
  first, filtered list. (Green pins on this branch — the C contract.)
- Space-over-selection wrap + visible-refusal tests: UNCHANGED (semantics unchanged).
- Enter trigger, guards, re-entrancy tests: UNCHANGED and green.
- `markerMenuApply.utils.test.tsx`, `markerMenuContext.utils.test.tsx`,
  `markerItemSource.test.ts`: UNTOUCHED, green (apply end states and context/source decisions
  did not change; the book-region and zero-candidate pins from the palette group hold).

## Deviations / notes

- **TJ's directive A described "lets me type into the editor directly" — the merged branch's
  actual pre-change behavior was worse:** the `\` landed, typing went to the palette, and Space
  dismissed while assuming the typed literal was in the document — so `\nd` + Space committed
  NOTHING and left a stray `\ ` in the text (reproduced in the real app). The passive Space row
  was already broken on this branch; the active palette fixes it rather than merely re-homing
  the keystrokes.
- **Undo depth:** a Space commit is now one materialize+settle gesture instead of passive
  per-keystroke history entries. Item applies and settles remain multi-step (ratified). Noted in
  the spec.
- **`\` + immediate Space** materializes `\ ` (unterminated bare backslash + space stays
  literal) — byte-identical to passive; pinned. Whether that end state is DESIRABLE is a
  separate question for the owner; byte-fidelity was chosen over inventing new behavior.
- **The demo's footnote editor (`NoteEditor.tsx`) sets `hasExternalUI: true`,** so no in-repo
  palette mounts there at all — C's note-context pin lives in the harness test (selection inside
  note content), which exercises the same context/item-source path.
- jsdom cannot observe un-prevented-keydown insertion, so the active palette's "nothing lands"
  is pinned via `defaultPrevented` assertions plus real-app verification (Playwright), same
  convention as the file's previous passive pins.

## Cross-group findings

- **`sv/integration` lacks the entire residual-backlog palette line** — feedback gathered
  against it will re-report defects already fixed here (B and C were both that). Worth an
  integration-orchestrator note when triaging owner feedback: check which merge line the
  running build came from first.
- **The host palette in paranext-core still has the passive query-from-document flow**, so C's
  broken-ranking-with-selection symptom will still reproduce in Platform.Bible's own overlay
  until the host palette routes typed characters into its query. Same territory as the palette
  group's earlier host-side findings (empty-palette orphan). Out of scope for this worktree.
- The known ~25-50% flake in `markerMenuApply.utils.test.tsx` (caret-survival `anchor.offset`,
  Group 3 territory) did NOT trip in this round's runs; nothing here touched it.

## Gate

- `nx run-many -t test`: 9 projects green — platform 1206 passed (68 files, includes the new/
  changed harness tests), shared-react 1536 passed / 1 skipped (26 files; the skip is
  pre-existing), shared 524 (36 files), utilities 51 (6 files), scribe 2, perf-react 3. Zero
  new skips. Corpus suites at full count: 148 corpus tests green across the three corpus files
  (round-trip 116, transform-fixed-point 22, testusfm round-trip 10), zero skip-listed.
- `nx run-many -t lint typecheck`: 10 projects, 0 errors (44 pre-existing warnings, all in
  untouched files — none in the files this round changed).
- `extract-api`: no API report drift (shared-react has no report; platform/utilities reports
  unchanged).
- Real-app verification (Playwright against `nx dev platform`, Standard view): active-palette
  collapsed flow, Space wrap with selection, Escape byte-identity, exact-first ranking with a
  selection — all confirmed in the browser.
