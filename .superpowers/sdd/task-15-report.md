# Task 15 report — Opaque-chapter OT position counting for host-local embed ops (popover Save displacement)

**Status: DONE.** The popover-Save position displacement (Task 14 §7 Concern 1) is fixed per
the owner's decision (option 1, host-local correctness): position computation used by
host-local produce→apply round trips now counts in the same coordinate system as
`$applyUpdate`'s traversals (every embed opaque — editable chapter = 1 unit, its `\c 1 `
glyph text not counted). The divergence from the pinned delta-DOC coordinates is accepted
and documented in code. In-app: popover Save replaces the note IN PLACE; SFM on disk clean
and correctly positioned; undo restores; all main-editor regressions pass; project restored
to as-found state including removal of the Task-13 test `custom.sty`.

**Note:** this file overwrites Phase 2's stale `task-15-report.md` (the old "Integration:
whole-repo suites + in-browser verification" report, superseded — its content lives on in
the ledger and the Phase 2 findings doc). Verified stale before overwriting.

---

## 1. Call-site audit (FIRST, as briefed)

Every consumer of `$getOTPositionOfNode` and `$getNodeFromOTPosition` (repo-wide grep;
only `delta-common.utils.ts` itself, `DeltaOnChangePlugin.tsx`, and
`packages/platform/src/editor/Editor.tsx` consume them):

| Call site | Counterpart traversal | Coordinate system it needs | Verdict |
| --- | --- | --- | --- |
| `$getReplaceEmbedOps` (delta-common.utils.ts, retain at :82→now :101) → `Editor.replaceEmbedUpdate` (Editor.tsx:246) → `$applyUpdate` | `$applyUpdate` insert/delete traversals (`$traverseAndDelete`, `$findAndInsertRecursive`: `$isTextNode` → text length, else `$isEmbedNode` → opaque 1 no descent, para-like → children+1) | **apply** | CHANGED — retain computed with `"apply"` |
| `Editor.applyUpdate` → `getInsertedNodeKey` (Editor.tsx:241) | Reverse of wherever `$applyUpdate` actually placed the inserted embed (it interpreted the retain with its own traversals) | **apply** | CHANGED — passes `"apply"` |
| `Editor.handleChange` → `getInsertedNodeKey` (Editor.tsx:386) | Ops come from `DeltaOnChangePlugin`; embed-insert ops only ever come from its `getEditorDelta(prev).diff(getEditorDelta(cur))` fallback (the single-text fast path can't produce an insert-embed op) → doc-delta diff retains | **delta-doc** | KEPT (default) — live consumer: paranext `openFootnoteEditorOnNewNote` (platform-scripture-editor.web-view.tsx:1530) uses this key to auto-open the FootnoteEditor popover on Ctrl+T note insert; switching it would break that flow in editable docs with a chapter |
| `DeltaOnChangePlugin.tsx:79` fast-path retain | Its own `getEditorDelta` diff fallback — both paths feed the SAME doc-delta op stream emitted to the host via `onChange`/`onUsjChange` (the external collab endpoint, symmetric with the old counting) | **delta-doc** | KEPT (default) — comment added at the call site |

Conclusion: NOT all live consumers pair with the apply traversal → per the brief, split
rather than silently change: parameterized all three exported functions with an explicit
`OTCoordinateSystem` argument, defaulting to the legacy `"delta-doc"` counting so unknown
external callers keep their behavior; the two host-local sites opt into `"apply"`.

## 2. Fix design

`libs/shared-react/src/plugins/usj/collab/delta-common.utils.ts`:

- New exported type **`OTCoordinateSystem = "delta-doc" | "apply"`** with the
  coordinate-divergence documentation the owner asked for (where the coordinate system is
  defined): the two systems differ only in editable marker mode; `"apply"` = every embed
  opaque (matches `$applyUpdate`); `"delta-doc"` = legacy counting matching the doc delta
  for chapters (embed 1 + glyph text); divergence ACCEPTED, unification = future collab
  work. Also records the pre-existing delta-doc-side wrinkle found during the audit: an
  editable `VerseNode` is a TextNode, so both systems count its glyph text, but
  `getEditorDelta` additionally emits its verse embed op — unchanged by this task.
- **`$isOpaqueContentNode(node, coordinates)`** — the general rule, not ChapterNode
  special-casing: note/unknown are opaque in BOTH systems (their contents nest inside the
  embed op in the doc delta — the pre-existing `openContentEmbeds` mechanism); in `"apply"`,
  ANY element-based embed (`$isElementNode && $isEmbedNode`, i.e. editable `ChapterNode`,
  and any future element embed) joins them. Decorator embeds (ImmutableChapter/Verse,
  Milestone, ImmutableUnmatched) have no children — already consistent. TextNode embeds
  (editable `VerseNode`) hit the `$isTextNode` branch first on BOTH sides — already
  consistent with the apply traversal.
- **`$getOTPositionOfNode(node, coordinates = "delta-doc")`** and
  **`$getNodeFromOTPosition(otPosition, coordinates = "delta-doc")`** — forward/reverse of
  the same map, both driven by the same `$isOpaqueContentNode` guard (symmetry enforced by
  construction + a round-trip test). `OpenContentEmbed.node` widened `NoteNode | UnknownNode`
  → `ElementNode`.
- **`getInsertedNodeKey(ops, editorState, coordinates = "delta-doc")`** — passes through.
- **`$getReplaceEmbedOps`** — retain now computed with `"apply"`; JSDoc states the ops are
  host-local (made for `$applyUpdate`).

`packages/platform/src/editor/Editor.tsx`: `applyUpdate`'s `getInsertedNodeKey` passes
`"apply"` (comment explains why); `handleChange`'s call keeps the default with a comment.
`DeltaOnChangePlugin.tsx`: comment at the fast-path retain documenting why it must stay
delta-doc. Public API: shared-react has no extract-api target/report; platform's API report
regenerated with no drift (EditorRef signatures unchanged).

Symmetry check across embed-bearing containers (briefed): BookNode/ImpliedParaNode are
para-like (not embeds) — both sides count children + closing 1, consistent, untouched.
Known residual apply-side wart (documented, out of scope — changing `$applyUpdate` is the
rejected option 2): `UnknownNode` is NOT in `$isEmbedNode`, so `$applyUpdate`'s traversals
descend into an existing unknown element's children while both position functions and the
doc delta treat it as opaque 1. Pre-existing on the apply side, not triggered by the popover
flow, recorded here and on the type's JSDoc territory (unknown embeds).

## 3. TDD evidence (red first)

New tests written and run BEFORE the fix:

- `delta-common.utils.test.tsx` — new `describe("apply coordinates (opaque element embeds)")`
  with an editable-chapter doc (ChapterNode "1" + glyph text child `\c 1 `, para `p` with
  "first " / note / " tail"):
  1. `$getOTPositionOfNode(note, "apply")` = 7 (chapter 1 + "first " 6) AND legacy default
     still 12 (chapter 1 + glyph 5 + "first " 6) — **RED**: got 12 for "apply".
  2. Reverse mapping: `$getNodeFromOTPosition($getOTPositionOfNode(note,"apply"), "apply")`
     is the note; legacy reverse at 12 unchanged.
  3. Full replace round trip: `$getReplaceEmbedOps` → `$applyUpdate` (editable viewOptions)
     → note REPLACED in place (1 note, same child slot, contains "replaced"), "first " and
     " tail" byte-intact, chapter glyph untouched, and `getInsertedNodeKey(ops, state,
     "apply")` returns the NEW note's key — **RED**: 2 notes (old note not deleted; the
     exact displacement mechanism).
- `note-ops-popover-roundtrip.test.tsx` Save leg — the Task 14 "deliberately NOT asserted"
  position block replaced with assertions: note count unchanged, sentinel note at the
  ORIGINAL index 0, and the post-save host USJ deep-equals the pre-save USJ with ONLY note 0
  swapped for the popover note (`replaceUsjNote` helper) — **RED**: count changed.

After the fix: all green. `delta-common.utils.test` 55/55; popover round-trip 3/3.

## 4. Gates (all `--skip-nx-cache`)

| Gate | Result |
| --- | --- |
| `nx run-many -t test -p shared-react @eten-tech-foundation/platform-editor` | PASS — shared-react 1084 passed/2 skipped (20 files); platform 314 passed/3 skipped (27 files) |
| `nx run-many -t typecheck -p shared-react platform-editor` | PASS |
| `nx run-many -t lint -p shared-react platform-editor` | PASS — 0 errors; 3 warnings all pre-existing in untouched files (filterAndRankItems.ts no-console, selection.utils.data-driven.test.ts no-loop-func x2). One transient error in my new test (no-dynamic-delete) fixed by replacing the delete-loop with `replaceUsjNote` |
| `nx format:check` (after `format:write` import reorder) | PASS |
| `nx extract-api platform-editor` | PASS — no API report drift (shared-react has no extract-api target) |

## 5. Propagation + in-app verification (runbook order)

Marker = the `"delta-doc"` string literal (new in this change, survives minification):

1. `pnpm nx build platform --skip-nx-cache` → `packages/platform/dist/index.js` marker x3. ✓
2. `pnpm -C packages/platform devpub` → worktree `node_modules/@eten-tech-foundation/platform-editor/dist/index.js` marker x3 (fresh mtime). ✓
3. Worktree: `npm stop` → `npm run build:extensions` (fresh invocation, per runbook) →
   `extensions/dist/platform-scripture-editor/src/main.js` marker x9 (3 embeds x3, normal). ✓
4. `./.erb/scripts/refresh.sh` (headless xvfb + CDP 9223). App up, wgPIDGIN (Editable)
   Standard view, GEN 1.

**In-app QA (state-based per runbook recipe; error hooks installed first; driven via
pw-server.mjs):**

- **As-found capture:** 17 notes at paths 8/4, 8/6, 8/8, 8/10, 8/12, 9/4, 9/6, 9/8, 9/10,
  12/3, 12/4, 12/6, 12/8, 14/3, 25/3, 25/6, 25/7; para 8 (v1) serialized JSON snapshotted.
- **Popover Save in place — PASS (the fix):** clicked note 8/4's caller → FootnoteEditor
  popover loaded the note well-formed; typed sentinel `T15SAVE` into the `\ft` span (7 real
  keypresses — each one live-applied a `replaceEmbedUpdate` to the host via
  `parentEditorRef`, so the fixed path ran SEVEN successive produce→apply replaces).
  Host state after: **note count 17 (unchanged)**; para 8 children shape identical
  (`…"tDa time ", note, "time wen"…`); sentinel present ONLY in note 8/4's `\ft`
  (`char/ft = "␣T15SAVE"`, single glyphs, no unmatched); neighbors "tDa time " / "time wen"
  byte-intact; caller previewText updated. Contrast with Task 14's pre-fix observation of
  the same flow: note inserted +5 late between "time|wen", space eaten, count 17→18.
- **SFM on disk — PASS:** line 10 of `01GENwgPIDGIN.SFM`:
  `\v 1 tDa time \f + \fr 1:1 \fr*\ft T15SAVE\ft*\f*time wen\f + …` — clean, correctly
  positioned, no doubled markers, no NBSP bytes.
- **Undo restores — PASS:** host Ctrl+Z → sentinel gone (no `T15` remnants anywhere in
  state), para 8 JSON **byte-identical** to the as-found snapshot, disk line 10 back to
  baseline (0 sentinel occurrences file-wide).
- **Main-editor regressions:**
  - `\s1` red — PASS: `para usfm_s1`, computed rgb(255,0,0), weight 700 (marker glyph too).
  - `\zfoo ` body split + `status_unknown` — PASS: inserted via the task-13 insertText
    methodology (the app's own MarkerMenu intercepts raw `\` keypresses — observed and
    Escape-dismissed, no document mutation); result: para split at the insertion point, new
    `para/zfoo` = [marker `\zfoo` (`opening status_unknown`, rgb(204,30,20)/700), " ",
    "an da world."]; one Ctrl+Z restored byte-identical, 0 remnants.
  - Ctrl+T insert — PASS: note inserted at the caret (" eryting" → " eryt"+note+"ing"),
    count 17→18, **popover auto-opened on the new note** — this is the preserved
    `"delta-doc"` `getInsertedNodeKey` path feeding `openFootnoteEditorOnNewNote`, verified
    live post-change. Popover Cancel closed without deleting (same behavior Task 14
    recorded: "Cancel + undo"); one Ctrl+Z restored 17 notes, para 8 byte-identical.
- **Console:** error/unhandledrejection hooks captured only the known benign
  "ResizeObserver loop completed with undelivered notifications" — zero application errors.
- **Final integrity:** note inventory re-run → 17 notes at the identical as-found paths.

## 6. Post-QA cleanup (user-ordered "all cleanups") — confirmation

- **QA document edits:** all reverted via in-editor undo, verified in state (para 8
  byte-equal to as-found, 17 notes at as-found paths) AND on disk (0 occurrences of
  `T15SAVE`/`zfoo`; line 10 == baseline).
- **Test custom.sty REMOVED:** `wgPIDGIN/custom.sty` was the 10-line Task-13 QA artifact
  (`\Marker zln` blue/bold + `\Marker s1 \Color 255` red override). The project is an hg
  repo; the artifact had REPLACED the real 858-line project custom.sty (Paratext 8 upgrade
  styles). Restored via `hg revert --no-backup custom.sty` → original 858-line file back,
  `hg status` clean for it. Copy of the removed test file preserved at
  `<scratchpad>/removed-test-custom.sty`; its full content is also quoted in the ledger
  history (Task 13). NOTE: the in-app "s1 red" check ran BEFORE this removal (it depends on
  that override); future QA needing s1-red/zln-blue must re-create it.
- **Settings.xml: deliberately LEFT AS IS (documented decision).** `hg diff Settings.xml`
  vs the 2023 baseline shows BOM, gutted ValidCharacters/InvalidCharacters,
  RepeatableWords/NonRepeatableWords, ModelTexts, ReferencedProjectsAndResources — these are
  the user's own Paratext usage data accumulated since 2023, NOT QA edits (Task 13/14
  reports both state Settings.xml was never modified by QA; the fresh mtime is the running
  app rewriting the file on project save). Reverting to the 2023 hg baseline would destroy
  legitimate data, so "restore to as-found" = leave it. Full diff preserved at
  `<scratchpad>/settings-xml-asfound.diff`.
- Also found but NOT touched (pre-existing environment setup, not QA artifacts):
  `ProjectUserAccess.xml` renamed to `ProjectUserAccess.xml_disabled` (likely required for
  the dev app's write access), modified `unique.id`, modified 41MAT/44JHN/45ACT SFMs (other
  sessions), app-generated `*.BAK` files.
- **App stopped:** `npm stop` (webpack + electron killed), CDP 9223 confirmed down.
- **Processes:** `ps` sweep for xvfb/electron/pw-server/remote-debugging — none remaining.
- Worktree `/home/lyonsm/paranext-core-standard-view`: no source changes made (HEAD
  9fc945fff82); only `node_modules` (yalc) and `extensions/dist` rebuilt, as the runbook
  prescribes. `/home/lyonsm/paranext-core` and `/home/lyonsm/Paratext` untouched.

## 7. Self-review

- The fix matches the apply traversal by CLASSIFICATION (`$isTextNode` first, element
  embeds opaque, decorators/TextNode embeds already consistent), not by a ChapterNode
  special case — the brief's "general rule" requirement. The one residual asymmetry
  (UnknownNode: apply-side descends) is on the apply side, whose modification is exactly
  the rejected option 2; recorded rather than smuggled in.
- Forward and reverse maps share the single `$isOpaqueContentNode` guard and are pinned by
  a reverse round-trip test, so they cannot drift independently.
- The legacy default means zero behavior change for every consumer that did not opt in —
  pinned by the untouched 52 pre-existing delta-common tests, the whole shared-react suite,
  and the live Ctrl+T popover-auto-open QA.
- The in-app Save evidence is stronger than the brief's single-Save ask: seven successive
  live replaces kept the count at 17 with byte-intact neighbors, and the whole-doc
  deep-equal assertion in the round-trip test forbids ANY displacement, not just the
  note-count symptom.
- Honest accounting: popover Cancel-leaves-note (pre-existing, host-side, Task 14 saw the
  same), the MarkerMenu interception of raw `\` keypresses (pre-existing app UX; insertText
  methodology documented), and the delta-doc verse-embed wrinkle are all recorded, none
  fixed silently.

## 8. Concerns

1. **Accepted divergence (by owner decision, documented):** `"apply"` retains disagree with
   pinned delta-DOC coordinates wherever an editable chapter precedes the position. If the
   OT collab path is ever completed for editable mode, the two systems must be unified
   (likely by making the doc delta treat element-embed glyph children as non-ops, or the
   apply side honor doc coordinates — findings #2/#3 territory). The JSDoc on
   `OTCoordinateSystem` is the anchor for that future work.
2. **Pre-existing, unchanged:** (a) delta-doc side emits editable VerseNode glyph text AND
   its verse embed op while both position functions and apply count only the text —
   latent doc-coordinate skew for editable verses; (b) apply-side descends into UnknownNode
   children (not in `$isEmbedNode`) while position fns/doc delta treat unknown as opaque;
   (c) popover Cancel does not delete a freshly inserted note (host-side
   `closeFootnoteEditor` finds the key already replaced by the live-apply flow — same
   observation as Task 14's QA).
3. The popover closes when the CDP client disconnects (focus-outside), so multi-connection
   QA of popover flows must keep one pw-server session alive across the whole interaction —
   noted for future runbook use.
4. Ledger's Task 15 dispatch line mentions pushing after completion — NOT done here per the
   task constraints (controller pushes after review).

> [CORRECTED by final whole-review 2026-07-04]: the "apply-side descends into UnknownNode" claim in this report (three mentions) is WRONG — $isEmbedNode includes $isUnknownNode at both base and head, so ALL apply traversals treat UnknownNode as an opaque embed; no asymmetry exists. Likely confusion source: the EmbedNode TYPE union omits UnknownNode while the runtime guard matches it (cleanup candidate for future collab unification). Do not design collab work around the phantom wart.
