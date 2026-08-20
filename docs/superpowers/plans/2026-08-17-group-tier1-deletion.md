# Group 7: Tier-1 and deletion follow-ups — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four engine follow-ups: unify the two verse rest-extraction arms; pin (and close if
red) the fabricated-space half of the verse-adjacent repro; implement Enter-Enter-then-
backspace dissolution (structural-caret work item C, stages 2–3); and generalize
leading-attribute handling from per-marker regexes to the markers map's `leadingAttributes`.

**Architecture:** All in `packages/platform/src/editor/markerEdit/` —
`markerEditTier1.utils.ts` (`$verseNodeTransform`, the leading-attribute regexes),
`markerEditDeletion.utils.ts` + `MarkerEditPlugin.tsx` (the armed-deletion machinery), and
`verseAdjacentTyping.test.tsx`. Order matters: the unification (small) first, the
generalization (largest blast radius) last.

**Tech Stack:** Lexical 0.43, Vitest, platform + shared packages.

**Spec:** `docs/superpowers/specs/2026-08-17-residual-backlog-recommendations.md` §1 items
9, 10 + §3 group 7. Sources: `2026-08-14-structural-caret-handoff.md` work items B and C
(read §C's three-stage spec in full — stage 1 already landed via the whitespace merge);
`2026-08-14-whitespace-handoff.md` "Deliberately not done" (map-derived generalization).

## Global Constraints

- Invariants §2 "Leading-attribute whitespace collapses" defines the target semantics for
  Task 4: ONE rule from the map's ordered `leadingAttributes`, no per-marker exceptions.
- The transient-emptiness pins in `paraWholeDeletion.test.tsx` are the guard against
  over-reaping — they must stay green through Task 3.
- TDD red-then-green; zero new corpus skips; lint/typecheck clean; repo commit footer.

---

### Task 1: Unify the verse rest-extraction arms

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`
  (`$verseNodeTransform`)
- Test: `packages/platform/src/editor/markerEdit/verseAdjacentTyping.test.tsx`

- [x] **Step 1:** Extract the VERSE_TEXT_REGEX arm's merge-into-following-content block
  (the `next.getType() === TextNode.getType() && next.getMode() === "normal" &&
  $getState(next, textTypeState) !== "attribute"` branch) into a local helper
  `$insertRestAfterVerse(node, rest, caretOffsetInRest)` used by BOTH arms; the
  VERSE_MARKER_REST_REGEX arm passes its computed caret target (its `caretOffset
  >= prefix.length` mapping) instead of unconditional fresh-node insertion.
- [x] **Step 2:** Red test first: caret between number and separator in a verse FOLLOWED
  by plain content (`$appendVersePara` gives one), type `\`, assert the extracted rest
  MERGED into the following content node (one text node, `\` + former-space + original
  content) with the caret after the `\`. Expected today: FAIL (fresh node until Lexical
  normalization). Then implement; green.
- [x] **Step 3:** All three existing caret pins in the file stay green untouched. Run
  `typedMarkerResolution.test.tsx` (the shield tests — the merge is what they rely on).
- [x] **Step 4:** Commit.

### Task 2: Fabricated-space pin (work item B — verify, likely mooted)

**Files:**
- Test: `packages/platform/src/editor/markerEdit/verseAdjacentTyping.test.tsx`

- [x] **Step 1:** The byte suites in this file already mount the full trio. Add the ONE
  missing pin: `\v 2 Da` built per the existing tests, type `\` right after the `2`,
  serialize, assert byte-for-byte NO space beyond the verse's structural
  leading-attribute space appears anywhere (the whitespace handoff argues the "fabricated
  space" reading no longer holds — this pin decides it).
- [x] **Step 2:** Green (expected): item B is closed; say so in the test comment.
  Red: the transform rewrite missed this shape — fix belongs in `TextSpacingPlugin.tsx`'s
  allowlist (whitespace's design: ADD only before a verse / after a char span); make the
  minimal allowlist correction with its own red-green pair.
- [x] **Step 3:** Commit.

### Task 3: Enter-Enter, then backspace the fresh `\p ` away (item C stages 2–3)

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (the KEY_DOWN
  Backspace/Delete arming — extend to record the CARET's paragraph when the selection is
  collapsed)
- Modify: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts`
  (`$paraMarkerDeletionTransform`'s empty branch — an armed-COLLAPSED paragraph that ends
  the commit empty is a whole-representation deletion: reap)
- Test: `packages/platform/src/editor/markerEdit/paraWholeDeletion.test.tsx` (extend; its
  transient-emptiness pins are the over-reap guard and MUST stay green)

**Interfaces:**
- Consumes: `MarkerEditContext.wholeParaDeleteExpected` (the armed-keys set),
  `$armWholeParaDeletion`.
- Produces: after the para-prefix separator pends (stage 1, already merged) and the user
  backspaces through glyph and prefix until the paragraph is EMPTY in one gesture chain,
  the paragraph dissolves and Lexical lands the caret at the previous line's end.

- [x] **Step 1:** State-level red test (jsdom cannot drive element-point backspaces —
  structural-caret §C.2; simulate the deletions directly as their existing tests do):
  fresh `\p ` line below a content line; arm via a collapsed-selection Backspace KEY_DOWN
  with the caret in the fresh paragraph; remove prefix nodes to empty within the commit;
  assert the paragraph is REAPED and the caret sits at the previous line's end. Expected:
  FAIL (empty branch ignores armed-collapsed today).
- [x] **Step 2:** Twin guard test FIRST, born green and staying green: the same emptying
  WITHOUT the collapsed-arm (a rebuild transiently emptying) is NOT reaped — this is the
  existing transient-emptiness contract; reference it, do not duplicate it if an existing
  pin already covers the exact shape.
- [x] **Step 3:** Implement: KEY_DOWN arming records the collapsed-caret paragraph key
  (separate field or a tagged entry in the same set — pick what keeps
  `$paraMarkerDeletionTransform`'s reads obvious); the empty branch reaps armed-collapsed
  paragraphs. Green.
- [x] **Step 4:** Run `paraWholeDeletion.test.tsx` in full + the deletion-utils tests +
  corpus trio. Zero regressions.
- [x] **Step 5:** Commit.

### Task 4: Map-derived leading attributes

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (the
  VERSE_TEXT_REGEX / chapter regex sites)
- Reference: `libs/shared/src/converters/usfm/attributeMarkersMapAgreement.test.ts` — the
  vendored markers-map slice with `leadingAttributes` (attribute-markers Stage 0.2); the
  invariants §2 rule this implements.
- Test: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.ts` (or the
  file's existing test home — grep first) + `verseAdjacentTyping.test.tsx` byte pins as
  the regression net.

**Interfaces:**
- Produces: one exported helper in `shared` beside the vendored map facts (e.g.
  `leadingAttributeSpec(marker): { names: string[] } | undefined` — naming per local
  style) and Tier-1 arms for `\f`'s caller and `\id`'s code driven by it; `\v`/`\c`
  keep byte-identical behavior through the generalized path.

- [x] **Step 1:** Characterize first: the existing verse/chapter pins
  (`verseAdjacentTyping`, the chapter transform tests) are the frozen contract. Run them;
  they gate every step below.
- [x] **Step 2:** Red tests for the NEW beneficiaries: (a) `\f + ` glyph edit — a second
  space between `\f` and `+` cannot demote the caller (`\f  +` still caller `+`); (b)
  `\id` code — `\id  MAT` is still code MAT. Drive through the same Tier-1 transform
  entry the verse tests use. Expected: FAIL or fall through to Tier-2 today (record
  which).
- [x] **Step 3:** Implement the shared spec helper reading the vendored ordered
  `leadingAttributes`; rewrite the verse/chapter arms to consume it (regexes may remain
  as the TOKENIZATION of "word", but the marker/attribute KNOWLEDGE comes from the map);
  add the `f`/`id` arms.
- [x] **Step 4:** Full regression: `verseAdjacentTyping`, chapter suites,
  `attributeMarkersMapAgreement`, corpus trio, then the whole platform suite. If ANY
  verse/chapter pin moves, the generalization changed behavior — stop and fix; the
  contract is byte-identity for existing markers.
- [x] **Step 5:** `extract-api` if shared exports grew. Commit.

### Task 5: Gate and outcome note

- [x] **Step 1:** Full `nx run-many -t test` (zero new skips) + `lint typecheck` clean.
- [x] **Step 2:** Append "Outcome": Task 2's verdict (mooted or fixed), Task 4's
  before/after for `f`/`id`, any contract tension found. Commit with `git add -f`.

---

## Outcome (2026-08-17)

All four tasks shipped; every gate green. Commits `1d6867ae`, `dd22898e`, `736d88b6`,
`3c0de67a`, `5eb73549` on `sv/rb/tier1-deletion`.

### Task 1 — unification shipped; the expected red did not materialize

The new tree pin (one merged node after the verse, caret kept after the typed `\`) was
expected to fail and was GREEN on first run: Lexical's dirty-leaf normalization merges the
fresh rest node into the following sibling and transfers the caret by commit time, so the
committed states of the two arms were already identical. The refactor still shipped —
`$insertRestAfterVerse` makes the merge one explicit code path instead of one explicit branch
plus an incidental reliance on normalization — and the pin stays as a regression net.

### Task 2 — verdict: the fabricated space is MOOT

The full-trio pin (`\v 2 Da`, `\` typed right after the number; on-screen paragraph bytes AND
whole-document USJ asserted byte-for-byte) was green on first run. No `TextSpacingPlugin`
allowlist change was needed. Work item B of the structural-caret handoff is closed.

### Task 3 — shipped as planned

`$armCollapsedParaDeletion` (separate provenance set, `collapsedDeleteCaretParas`) plus the
empty branch reading both arms. Red test failed for the planned reason (armed-collapsed
ignored) after one harness adjustment: dispatching the arming KEY_DOWN in jsdom reaches
Lexical's real collapsed-backspace handling, which needs the native `Selection.modify` — the
test claims KEY_DOWN at NORMAL priority (below the engine's HIGH arming) and simulates the
deletions, the same state-level convention the whole-selection tests use. Twin guard (caret
inside, no delete key → no reap) born green. Transient-emptiness pins untouched and green.
The caret lands at the previous line's end via Lexical's own removal handling — no explicit
placement was needed.

### Task 4 — map-derived leading attributes; two plan corrections

**Plan correction 1:** `attributeMarkersMapAgreement.test.ts` does NOT contain the
`leadingAttributes` slice (it vendors the attribute-marker relation only). The slice was
vendored fresh: `libs/shared/src/converters/usfm/leadingAttributes.ts`
(`leadingAttributeNames`), verbatim from paranext-core's markers map (3.0; 3.1 declares the
identical set), with its own agreement pins.

**`\v`/`\c` byte-identity:** held. The verse/chapter regexes now come from
`leadingAttributeGlyphRegexes(marker)` — a factory that throws for a marker the map declares
no leading attribute for — and every existing pin passed untouched.

**`\f` before/after:** before, a second space typed beside the expanded caller (` +⍽` →
`  +⍽`) was unreachable by any settle: nothing pended it, `$buildNoteFragment` refuses a
non-byte-exact caller so the note rebuild could never run, and the reverse adaptor (which
drops only a byte-exact caller) leaked the whole diverged caller text into note content.
After: `$noteCallerTextTransform` (Tier-1, driven by the map's `caller` declaration) collapses
the whitespace in place (`\f  +` stays caller `+`) and retags the caller to the typed word
(` +x⍽` → caller `+x`), mirroring the verse-number arm. Scope-guarded to shapes with both
flanking whitespace runs present — a deleted flanking separator is separator-grace territory
(tokenize-identity), left to existing machinery, pinned born-green.

**`\id` before/after: no behavior change, deliberately.** The editor renders `\id CODE` as an
uneditable `ImmutableTypedTextNode` (a DecoratorNode) in every marker mode, and book bytes are
literal-by-policy (`$inLiteralOnlyBlock` — "book stays: it has no settle scope,
deliberately"). There is no reachable Tier-1 arm to add and no red test to write. The entry is
covered declaratively (`leadingAttributeNames("id")` → `["code"]`, pinned with the rationale
in the test) so the slice stays a verbatim copy of the map.

**Residual (recorded, not fixed):** a HISTORIC restore of a diverged caller
(`$rependPendShapedNodes`) is not re-pended — it settles on the next dirtying of the node
instead of on caret departure. Pending it would be a stuck key today: the only settle route
for a pended caller is the note rebuild, which refuses the shape. Same class as the
pre-repend-scan behavior for other literals; a departure settle would need either
`$resolvePendingMarkers` (coordination-guarded) or `$buildNoteFragment` to learn the shape.

### Gate

- `nx run-many -t test`: 9 projects green. `shared:test` failed once in the parallel run and
  Nx itself flagged it a flaky task; green in isolation (36 files, 521 tests) and on rerun.
  Platform suite: 66 files, 1170 passed, zero skips, corpus fixtures all green.
- `nx run-many -t lint typecheck`: 10 projects clean (pre-existing `no-console` warnings
  only). One new-code error was caught and fixed: raw NBSP in the caller regex
  (`no-irregular-whitespace`) — respelled as ` `.
- `extract-api`: both projects run, no report changes. Note `shared` has NO extract-api
  target — its dist ships per-module d.ts (the new export is present in
  `dist/converters/usfm/index.d.ts`), so "extract-api if shared exports grew" is a no-op by
  construction.

### Cross-group findings

- **Nx sync drift (pre-existing):** `nx run-many -t test` refuses to start because
  `packages/platform/tsconfig.lib.json` and `packages/scribe/tsconfig.lib.json` carry
  references Nx now considers stale (shared-react/test-data, shared-react/shared). Gates here
  ran with `--skip-sync` rather than letting sync REMOVE references outside this group's
  remit. Some group (or the integrator) should resolve it once, deliberately.
- The KEY_DOWN-at-NORMAL claim trick (Task 3's harness) is reusable by any group needing an
  armed KEY_DOWN in jsdom without Lexical's native-selection delete path.
