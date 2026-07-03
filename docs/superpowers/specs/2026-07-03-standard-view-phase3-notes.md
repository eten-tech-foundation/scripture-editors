# Standard View Phase 3 — Notes (Part A complete; Part B + Phase 4/5 handoff)

Plan: `docs/superpowers/plans/2026-07-02-standard-view-phase-3.md` (commit `a7ff027`), executed via
subagent-driven-development. Ledger: `.superpowers/sdd/progress.md` (Phase 3 section). Branch
`standard-view` (scripture-editors), not pushed. Part B lands in a `paranext-core` worktree branch
`standard-view` off `main`, also unpushed.

## Part A complete (scripture-editors, Tasks 0–7)

Commit range `a7ff027..ce6ba54` (7 task commits + 1 fix). All per-task reviews clean; whole-repo
gates green cache-bypassed at Task 7.

**What landed:**

- **Task 0 — reverse-adaptor viewOptions threading (task zero precondition).** `editor-usj.adaptor.ts`
  no longer holds a module-level `_viewOptions` singleton; `deserializeEditorState`/
  `deserializeSerializedEditorState`/`isStandardView`/`recurseNodes`/`createCharMarker` take
  `viewOptions` per call. `Editor.tsx` deserialize call sites pass it. The **forward** adaptor was
  left as-is (already per-call, synchronous-self-contained; a regression test proves a note-mode
  serialize between two host-mode serializes does not corrupt output). This lets the FootnoteEditor
  popover run a second `Editorial` instance in the same webview without corrupting the host.
- **Task 1 — unclosed notes render expanded inline.** `createNote` + `$createWholeNote` compute
  `isCollapsed = markerObject.closed === "false" ? false : noteMode !== "expanded"`, use the
  expanded layout when `!isCollapsed`, and suppress the synthesized closing marker for unclosed
  notes. `closed` still round-trips via `unknownAttributes`.
- **Task 2 — note-scoped Tier 2 re-tokenization.** New `$rebuildNoteContent` (sibling of
  `$rebuildParas`) re-tokenizes a note's *content* children (between the opening marker/caller and
  the closing marker), preserving the note identity/marker/caller by reference, unwrapping the
  tokenizer's default `\p`, with the same sentinel-count + fixed-point (over content nodes) guard
  rails. The three Phase-2 `$isNoteNode` dead-zone skips were lifted
  (`tier2Rebuild.utils.ts` routing, `markerEditTier2Trigger.utils.ts` trigger walk,
  `whitespaceDisplay.plugin.utils.ts`). `$appendChildrenFragment` was refactored into a shared
  `$appendNodesFragment`. A NoteNode inside a *paragraph* rebuild remains an atomic sentinel.
- **Task 3 — Enter-in-note → `\fp`.** `$handleEnterInNote` (`markerEditNote.utils.ts`) inserts an
  `\fp` char span (with a real opener glyph, via a manual splice — Lexical's `insertNodes` escapes
  the inline note to the nearest block) when the caret is in an expanded note, suppressing the
  paragraph split; collapsed notes and non-note carets fall through unchanged. Also added the
  literal-backslash-in-note cascade regression test (closes a Task 2 coverage gap; no hang).
- **Task 4 — data-driven callers.** Caller label: `+`→CSS-generated, `-`→`*`, custom→literal.
  Cross-ref sequence (default `†`) via a new `@counter-style cross-ref-callers` and
  `crossRefCallers?` on `UsjNodeOptions`. Footnote vs cross-ref buckets by the note's existing
  `usfm_<marker>` class (`.note.usfm_f/.fe/.ef/.efe` vs `.note.usfm_x/.ex`) — **both** counters
  scoped so a cross-ref `+` never increments the footnote counter (verified live in the browser:
  a `usfm_f` note uses `counter(caller, note-callers)`).
- **Task 5 — PT9 snippet semantics.** New `$stripSelectionToQuotation` (`noteQuotation.utils.ts`)
  ports PT9 `RemoveMarkersAndFootnotes(isFootnote=true)`: strips markers + nested notes, converts a
  selected verse to `\+fv N\+fv*` (VerseNode checked before TextNode; nested-note content excluded
  via an ancestor walk because `getNodes()` flattens; partial endpoints sliced with
  `$getCharacterOffsets`). `$createNoteChildren` gained a `nodeOptions` param and uses
  `chapterVerseSeparator ?? ":"` + the stripped quotation; `$insertNote` resolves the default caller
  (`x`/`ex` → `defaultCrossRefCaller ?? "-"`, else `defaultFootnoteCaller ?? "+"`).
- **Task 6 — caller tooltip.** Pinned the existing native `<button title={previewText}>` hover
  tooltip with a test (Decision 5: no custom hover timer).

**Whole-repo gates (Task 7, all `--skip-nx-cache`):** test 9 projects green; typecheck 10; lint 10
(2 pre-existing warnings, 0 errors); format:check clean; extract-api 2; `git status --short` shows
no api.md drift. Test counts at branch head: shared-react 1077, `@eten-tech-foundation/platform-editor`
271 (+3 skip), shared 138.

**Browser QA smoke (Task 7, real Chrome via Playwright MCP, platform demo, Standard view, 0 console
errors):** `editor-input usfm marker-editable text-spacing formatted-font`; markers render as
editable text; the WEB Psalm 1 footnote → `note usfm_f collapsed` with a CSS-generated caller via
the footnote counter (Task 4 bucketing confirmed live) and a populated preview tooltip (Task 6);
"Insert footnote" creates a note through the engine (Task 5 path) with no error. The full footnote
UX (popover editing, snippet quotation, pane, cross-ref `†` callers, unclosed-expanded) is exercised
in Platform.Bible at Task 13 — the demo (hasExternalUI, no FootnoteEditor/pane) can't surface it.

## Bridge state (yalc)

`pnpm -C packages/platform devpub` published `@eten-tech-foundation/platform-editor@0.8.15` (content
updated at the same version number; yalc keys by content hash) to the local yalc store and linked it
into `/home/lyonsm/paranext-core/node_modules/@eten-tech-foundation/platform-editor`. Verified the
pushed `dist/index.d.ts` exports `STANDARD_VIEW_MODE` and the new `UsjNodeOptions` fields.
`package.json` was restored by `postpublish` (tree clean).

## What Part B (paranext-core, Tasks 8–13) consumes from this library

- `getViewOptions("standard")` → `{ markerMode: "editable", noteMode: "collapsed", hasSpacing: true,
  isFormattedFont: true }` (for the new `'standard'` view type).
- `UsjNodeOptions` new fields to populate from project settings (fallbacks in parens): `noteCallers`
  (a–z), `crossRefCallers` (`["†"]`), `chapterVerseSeparator` (`":"`), `verseRangeSeparator` (`"-"`),
  `defaultFootnoteCaller` (`"+"`), `defaultCrossRefCaller` (`"-"`). Feeding these makes inserted-note
  references/callers project-correct.
- `EditorRef.insertMarker("f"|"x")` inserts a footnote/cross-reference through `$insertNote`
  (Task 5), which the host detects (`openFootnoteEditorOnNewNote`) to open the FootnoteEditor popover.
- `MarkerEditPlugin` already mounts inside `Editorial` when `view.markerMode === "editable"`, so a
  standard-view host editor and its FootnoteEditor popover both run the marker engine on note content
  once the adaptor singleton (Task 0) makes two instances safe.

## Known limitations carried forward (from per-task reviews; final-review triage / follow-ups)

- Task 0: `recurseNodes` viewOptions param is 2nd not last (functionally correct).
- Task 1: OT-collab insert path (`delta-apply-update.utils.ts:1747`) doesn't thread `closed` into
  `$createWholeNote`, so a collaboratively-inserted unclosed note renders collapsed until reload
  (pre-existing). Inline `MarkerObject & {closed?}` cast duplicates the non-exported `NoteMarkerObject`.
- Task 2: no dedicated caret-offset assertion for a note-content rebuild.
- Task 5: verse-bridge `verseRangeSeparator` formula untested (no UI builds a bridge ref yet);
  `"visible"` markerMode markers aren't stripped by `$stripSelectionToQuotation` (standard view uses
  editable MarkerNodes, which are stripped).
- Task 4: `demos/platform/**/usj-nodes.css` (vendored, synced from paranext) not updated here.

## Phase 4 / Phase 5 handoff (unchanged pointers, restated for continuity)

Phase 4 (StyleInfo) plugs into the `getMarker` seam (tokenizer classification + Tier-1 kind guards +
validation state) and the caller-sequence data source. Phase 5 (extension wiring) still needs the
polished power-mode default view, the `changeScriptureView` menu cycle, opaque-block rendering
polish, and the real project-settings source for the Task-12 `nodeOptions` snippet fields (populated
with fallbacks in Part B). See `docs/superpowers/specs/2026-07-02-standard-view-phase2-notes.md`
"What Phase 4/5 needs" for the exact function-level anchors.
