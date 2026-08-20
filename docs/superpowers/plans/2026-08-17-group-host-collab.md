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

- [x] **Step 1:** Un-skip the test; run
  `env -u _VOLTA_TOOL_RECURSION pnpm nx test shared-react -- editor-delta`. Expected: FAIL
  with attributes missing from the emitted ops (the recorded gap).
- [x] **Step 2:** Implement: at each embed-emission site in `getEditorDelta`'s dispatch
  (book/para/chapter/verse/milestone — the skip comment enumerates them), include the
  node's unknown-attribute state in the op. Follow how the RECEIVE side names them so
  the round trip closes; add nothing the receive side does not accept.
- [x] **Step 3:** Green; then run the WHOLE collab test directory (adaptor + apply +
  delta-common) — the ops fixtures elsewhere in the file may need regenerating if they
  now legitimately carry attributes; regenerate per that file's existing
  fixture-refresh convention (its header says how), never by hand-editing expected ops.
- [x] **Step 4:** Commit (scripture-editors).

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

- [x] **Step 1:** Rebuild/devpub/link (see Global Constraints loop). Sanity: core's
  extension suite green before writing anything.
- [x] **Step 2:** Write the test red-first if a defect exists, green-pin otherwise: build
  a delta op stream that inserts `\f + \fr 1:1 \ft note text` (implicit closes), apply it
  through the extension's apply path, serialize back, assert `closed="false"` on the
  `fr`/`ft` spans and NO `\fr*`/`\ft*` bytes anywhere. Then edit an adjacent byte locally
  and re-serialize — the flag survives.
- [x] **Step 3:** Run the extension suite. Green. Commit (paranext-core).

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

- [x] **Step 1:** Red test: feed the detector two USJ trees that differ in one nested
  text; assert the returned divergence names the path and both values. FAIL (function
  does not exist).
- [x] **Step 2:** Extract/implement; wire the existing warn through it; assert via a
  second test that identical trees return `undefined`.
- [x] **Step 3:** Extension suite green. Commit (paranext-core).

### Task 4: Gates in both repos and outcome note

- [x] **Step 1:** scripture-editors: `nx run-many -t test lint typecheck` — green/clean,
  zero new skips (the table skip remains, deliberately).
- [x] **Step 2:** paranext-core: `npm test`, `npm run typecheck`, `npm run lint` — green.
  (If lint fails on `eslint-plugin-paranext`, build it first:
  `npm run build --workspace=eslint-plugin-paranext`.)
- [x] **Step 3:** Append "Outcome" to this plan — including whether Task 2's pin was
  born green or exposed a defect — commit with `git add -f` (scripture-editors side).

---

## Outcome

All three items landed. Two commits in paranext-core, one in scripture-editors.

### Task 1 — unknown attributes on every embed kind (scripture-editors)

Landed as specified. The skipped test's comment was an accurate spec: the receive side
(`delta-apply-update.utils.ts`) called `getUnknownAttributes` for all seven kinds while the
emit side (`editor-delta.adaptor.ts`) wrote them back for only three, so a client holding
unknown attributes on a book, para, chapter, verse or milestone dropped them on transmit.
Un-skipping went red exactly where the comment predicted (book op missing `category` and
`attr-unknown`), and adding the five missing emissions turned it green.

Rather than five more copies of the `Object.assign` idiom, all seven kinds now route through
one `$assignUnknownAttributes(payload, node)` helper typed on a union of the real node
classes. That is the anti-drift measure the defect argues for — the asymmetry existed because
each kind hand-rolled its own passthrough, so three got it and five did not.

Fixture consequence, as the plan anticipated: `opsWithUnknownItemsNoTable` was a MIXED oracle
whose book/chapter/verse/milestone/para ops recorded the drop. It now carries the attributes
and its header no longer warns readers off it. Its five inline "Drops `category` and
`attr-unknown`" comments are gone. No expected ops were hand-edited to chase a diff — the
five changed entries are exactly the five the fixture documented as wrong.

The table skip is untouched and remains the repo's only literal `it.skip`.

### Task 2 — collab `closed="false"` end-to-end (paranext-core)

**The pin was BORN GREEN. No defect in the apply path.**

Two deviations from the plan's sketch, both forced by what the extension actually is:

1. *There is no USX or delta-apply machinery in the extension to route through.* The
   extension talks USJ end-to-end (`getChapterUSX`/`setChapterUSX` live in the sibling
   `platform-scripture` extension), and its only delta surface is a single
   `editorRef.current.applyUpdate(...)` call. So "the extension's apply path" is the
   yalc-linked editor's `EditorRef.applyUpdate`, and "serialize back" is
   `platform-bible-utils`' `UsjReaderWriter.toUsfm()` reached through the extension's own
   `correctEditorUsjVersion` save shim. The test renders the REAL `<Editorial>` — every other
   core suite mocks `@eten-tech-foundation/platform-editor` — which makes this the only place
   in either repo where the collab apply path and the USFM writer are exercised together.

2. *The plan's literal assertion would have been vacuous.* Asserting "no `\fr*`/`\ft*` bytes"
   after inserting `\f + \fr 1:1 \ft note text` passes whether or not the flag survives:
   measured against the writer, `fr` and `ft` have OPTIONAL closing markers, so
   `UsjReaderWriter` omits `\fr*`/`\ft*` regardless of `closed`. Writing only that test would
   have pinned nothing.

   So the decisive case uses `\nd`, whose closer is not optional: with `closed="false"` the
   writer emits `\nd Lord`, without it `\nd Lord\nd*`. A control test pins the unflagged
   spelling, so the two tests differ only by `closed` and the negative assertion can actually
   fail. The `\fr`/`\ft` case is kept as the representative shape (it is what the editor's USX
   path produces), with its comment stating plainly that it pins the flag's survival in the
   USJ rather than its effect on the bytes.

Four tests: remote insert keeps the flag and writes no closer; the unflagged control gets its
closer; a subsequent LOCAL edit to an adjacent byte leaves the flag alone; the note-internal
`\fr`/`\ft` spans keep theirs.

### Task 3 — round-trip warn becomes a detector (paranext-core)

The plan expected to create a detector; the comparison already existed as
`firstSignificantUsjContentDifference`, a PRIVATE function in `use-editor-pdp-sync.hook.ts`
already returning a structured `{ index, sentEntry, receivedEntry }`. The gap was reachability
and duplication, not structure — so the promotion is an extraction, not a new comparison
(honoring "do not invent a second comparison").

`usj-content-divergence.util.ts` now exports `UsjContentDivergence`,
`detectUsjContentDivergence`, and the two describe helpers. The dedup predicate moved with it
as `areUsjContentDivergencesEquivalent`: previously the hook re-implemented "is this the same
loss" INLINE over the detector's output, so the two halves of one question lived apart. Same
warning text, same behavior — the hook's 22 existing tests pass untouched — and the warn site's
three separate recomputations of the difference (the guard plus one per describe call) collapse
to one.

15 direct tests now cover what the hook's scenario tests could only reach by driving a
25-deferral non-convergence: identical trees, whitespace-only differences, a nested text
difference, first-of-several, a missing entry, absent documents, dedup equivalence, and both
describe forms including truncation.

Note on "names the path": the walk is top-level `content` only, by deliberate existing design
(bounded and cheap). A difference nested inside a paragraph is reported as THAT PARAGRAPH
diverging, with both whole paragraphs as the values. The test asserts that behavior explicitly
rather than deepening the walk, which would have changed the dedup's notion of a distinct loss.

### Gates

- scripture-editors `nx run-many -t test lint typecheck`: GREEN across 10 projects.
  Tests 3272 passed, 1 skipped (utilities 51, shared 517, shared-react 1536 + the 1 table
  skip, platform-editor 1163, scribe 2, perf-react 3; demos/platform has no test files).
- paranext-core `npm run typecheck`: GREEN (exit 0), including `platform-scripture-editor`.
- paranext-core `npm run lint`: GREEN (exit 0). The 7 warnings under
  `platform-scripture-editor` are all pre-existing files; this group's three new/changed
  files lint with 0 errors and 0 warnings (prettier applied).
- paranext-core extension suite: GREEN — 61 files, 872 tests, run against the final linked
  editor (853 before this group; +19 for the 4 implicit-close and 15 detector tests).
- Both documented setup fixes were needed: `generate-dev-build-info.ts` for typecheck and
  `npm run build --workspace=eslint-plugin-paranext` for lint.

**`npm test` (whole repo) exits 1 on `lib/platform-bible-react`, and neither cause is this
group's.** Two distinct things are mixed in there, separated deliberately rather than waved
off:

1. *Infrastructure flake.* 13 files "failed" with `[vitest-worker]: Timeout calling "fetch"`
   / `"onQueued"` and ZERO assertion failures — this workspace runs a Playwright browser
   project, and the machine was at load average 80-105 with sibling worktrees running their
   own gates. Rerun in isolation, all 13 pass (151 tests). The browser project still loses
   its page under that load (`Browser connection was closed while running tests`).

2. *One REAL pre-existing failure*, surfaced only because the flake hid it:
   `footnote-editor.palette-commit.test.tsx` — "Enter-shaped (live selection) commit mid-\ft"
   expects note char markers `['fr','ft','fp']` and gets `['fr','ft','fp','ft']` (the
   `[..., ft, fp, ft]` sandwich its own comment says it pins against).

   Attributed by BISECT, not by argument: the editor was rebuilt, re-devpubbed and re-linked
   with this group's `editor-delta.adaptor.ts` change REVERTED, and the same test still fails
   (2 failures at that commit, vs 1 with the change present). So the divergence predates this
   group. It is also structurally unreachable from this work — the assertion reads
   `getMarker()` off the live Lexical node tree, while this group's change only adds keys to
   emitted delta op objects and never touches node state. The editor was restored, rebuilt
   and re-linked afterwards, and the extension suite re-verified green against it.

   **Cross-group finding: this belongs to whoever owns the footnote/palette split
   (char-stack split or marker resolution), not to host/collab.**

Zero new skips in either repo — the one skip in core's `npm test` output (450 passed | 1
skipped) is pre-existing and not in the files this group touched. No C# was touched and no
defect chase led there.
