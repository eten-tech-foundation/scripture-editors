# Standard view — Phase 4 (StyleInfo integration) completion notes

**Date:** 2026-07-04
**Spec:** `docs/superpowers/specs/2026-07-03-standard-view-phase4-styleinfo-design.md` (commit d0c52f3; two post-review corrections applied in this docs commit)
**Plan:** `docs/superpowers/plans/2026-07-03-standard-view-phase-4.md` (commit f60d1a2)
**Ledger:** `.superpowers/sdd/progress.md` (Phase 4 section)

## What landed

### Part A — library (`scripture-editors`, branch `standard-view`, f60d1a2..d037693)

| Task | Commits | Delivered |
| --- | --- | --- |
| 1 | f60d1a2..c844382 | `StyleInfo`/`MarkerStyleInfo` types, `MarkerType.Milestone`, `createMarkerLookup` seam |
| 2 | c844382..e55e4aa | Rich bundled `defaultStyleInfo` generated from vendored usfm.sty |
| 3 | e55e4aa..7fcb419 (a252e90 + review fix) | Stylesheet-first tokenizer; PT9 unknown-marker + unmatched-closer handling; PT9-faithful unknown-in-note auto-close; suffix-convention milestone heuristic gate |
| 4 | 7fcb419..dc1d036 (5dd708f + review fix) | `MarkerLookup` threaded through Tier-1/Tier-2 (30 call sites); stylesheet-first kind guards; latent `$rebuildNoteContent` no-options bug fixed |
| 5 | dc1d036..7b626c1 | `EditorOptions.styleInfo` threaded to the marker engine |
| 6 | 7b626c1..588f37a (2396630 + review fix) | `$validateDocument` — branch-for-branch PT9 `ValidateUsxStyles`/`TagValidator` port incl. no-push semantics for empty-occursUnder tags |
| 7 | 588f37a..124a802 | `MarkerValidationPlugin` — `status_unknown` (bold red) / `status_invalid` (red underline) decoration on marker glyphs only |
| 8 | 124a802..82c55a5 (54e56bc + coverage fix) | `generateUsjCss` — PT9 `CSSCreator.CreateUsfmCss` port (base project font rule + per-marker `.usfm_<m>` rules) |
| 9 | f77e808 (+52b6b65 ledger) | `Marker`/`MarkerType`/`CategoryType` exports (clears ae-forgotten-export); whole-repo gates green; demo browser QA |
| 9b | 52b6b65..d037693 | Phase 2 engine fix: pending-marker resolution moved out of the frozen post-commit context (rename + caret-move crash, `\zfoo` caret scrambling) — unplanned, required for runtime QA |

### Part B — extension (paranext worktree `standard-view`, d206e992a34..54bf9155fc8)

| Task | Commits | Delivered |
| --- | --- | --- |
| 10 | d206e992a34..b55ec7f256a | C# `getStyleInfo(bookNum)` on `ParatextProjectDataProvider` serializing the merged `ScrStylesheet` (custom.sty merge incl.); wire shape camelCase / raw dict keys / null omission / inches / `#RRGGBB`; 8 tests vs real `DummyScrStylesheet` |
| 11 | b55ec7f256a..a9b09642975 | `platformScripture.StyleInfo` d.ts project-interface types (all 24 `MarkerStyleInfo` fields) |
| 12 | a9b09642975..54bf9155fc8 (6bc22ad27ec + gate fix) | Web view subscribes to StyleInfo for the current book → `EditorOptions.styleInfo` + `useProjectStylesheet` injects `generateUsjCss` output (standard view only); FootnoteEditor popover inherits via options spread; popover `contextMenu: undefined` fix |

## Runtime QA (Task 13, Platform.Bible in-app, wgPIDGIN scratch project)

Propagation per the runbook (`docs/superpowers/2026-07-03-paranext-propagation-blocker.md`): fresh
`nx build platform-editor --skip-nx-cache` → `devpub` (byte-identical bundle in worktree
`node_modules`, Phase 4 markers present) → `npm stop` → `dotnet build ParanextDataProvider.csproj`
→ fresh `npm run build:extensions` (bundle contains `generateUsjCss`/`useProjectStylesheet`/
`platformScripture.StyleInfo`) → `refresh.sh` (headless xvfb, CDP 9223).

Test `custom.sty` (wgPIDGIN; original preserved as `custom.sty.phase4-original.bak`): `\Marker zln`
character marker (Endmarker `zln*`, OccursUnder `p q1 q2`, `\Color 16711680` = #0000FF, `\Bold`)
plus `\Marker s1 \Color 255` (= #FF0000) merge test. Verification by editor state
(`.editor-input.__lexicalEditor.getEditorState().toJSON()`) + `getComputedStyle`, per the runbook.

**Result: 6/8 PASS** at Task 13; after Task 13b (below): **7/8 PASS** — item 2 fixed and
re-verified in-app; item 7 root-caused (delta round-trip malformation, not the options
override). After Task 14 (user-sanctioned dedicated fix, 2026-07-04): **8/8 PASS with one
inline caveat** — item 7 fixed (canonical glyph-free note ops in editable marker mode, commit
2a09b69 + worktree 9fc945fff82) and re-verified in-app, BUT popover Save is only half-usable:
the written note CONTENT is clean (state + SFM), while its replace POSITION lands +5 OT units
off (pre-existing `$getOTPositionOfNode` vs apply-traversal chapter-glyph asymmetry — Save
stays unusable for real edits until the owner's OT-coordinate decision; see item 7 row and
limitations).

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `\s1` red via custom.sty merge | PASS | Generated rule `.editor-input .usfm_s1 { font-weight: bold; color: #FF0000; font-size: 100%; margin-top: 8pt; margin-bottom: 4pt; text-align: center; }` — base s1 properties kept, red merged in; computed color rgb(255,0,0), weight 700 |
| 2 | Project default font on editor container | **PASS** (fixed in 13b) | Task 13: base rule was injected but lost — static `.usfm.formatted-font` (0,2,0) outranked the generated `.editor-input` base rule (0,1,0); per-marker rules tied at (0,2,0) and won by injection order, so only the base rule lost. Task 13b fix (2bd0f05): `generateUsjCss` default `containerSelector` → `".editor-input.usfm"` (base rule (0,2,0) ties the static rule and wins by order; per-marker rules rise to (0,3,0)). Re-verified in-app: injected `.editor-input.usfm { font-family: "Andika"; font-size: 18pt; }`; computed on `.editor-input`: `font-family: Andika`, `font-size: 24px` (= 18pt). |
| 3 | `\zln text\zln* ` in `\p` → char span, blue | PASS | State: `char/zln` = [`marker/zln` "\zln", text " text", `marker/zln` "\zln*"]; DOM `span.usfm_zln` rgb(0,0,255) weight 700; glyph classes `opening`/`closing` with no status classes. Stylesheet-first classification beat the z-milestone wildcard. |
| 4 | `\zfoo ` in body → split + `status_unknown` | PASS | New `para` marker `zfoo` holding the tail text; glyph class `opening status_unknown`, computed rgb(204,30,20) weight 700 |
| 5 | `\ft ` in body → `status_invalid` | PASS | Glyph `opening status_invalid`, rgb(204,30,20) + 1px rgb(204,30,20) border-bottom; the document's legitimate `char/ft` nodes inside real footnotes stayed undecorated (context sensitivity) |
| 6 | `\zln ` inside `\s1` → `status_invalid` | PASS | Both zln glyphs `status_invalid` (red + underline) while the `\s1` opener glyph stays clean and red — occursUnder `p q1 q2` enforced |
| 7 | FootnoteEditor popover classify/validate | **PASS** (fixed in Task 14) | Root cause was the 13b diagnosis: `getNoteOps` serialized char-span glyph MarkerNodes + the closing `\f*` as text ops; `applyUpdate` re-synthesized glyphs → doubled glyphs + `ImmutableUnmatchedNode` → Tier-2 sentinel abort → literal settle. Task 14 fix (commit 2a09b69): canonical glyph-free note contents ops in editable marker mode (`$handleTextNodes` skips glyph MarkerNodes/editable caller text/structural NBSP inside notes; `$getNoteOp` carries unknownAttributes incl. `closed="false"`; `$createNote` re-adds the NBSP separator and honors `closed` on materialization) — note contents ops are now identical across marker modes and the ops→apply round trip is an idempotent fixed point (pinned by `note-ops-popover-roundtrip.test.tsx` + updated `opsGen1v1Editable`/`opsGen1v1Standard`). Worktree 9fc945fff82 gates FootnoteEditor's `\`-keydown menu trigger off when `markerMode === "editable"`. In-app re-verification (wgPIDGIN GEN 1): popover note loads well-formed (single glyphs, no unmatched — state-verified); Tier-1 rename `\ft`→`\fq` restyles on caret departure; typed `\zln …\zln* ` classifies as `char/zln` (blue, custom.sty); typed `\zfoo ` becomes `char/zfoo` with `status_unknown` glyphs rgb(204,30,20)/700 (unknown-in-note→char per PT9); literal `\` reaches the popover editor (menu suppressed); popover Save writes the note content CLEANLY into host state and SFM on disk (`\ft pau\ft*` — no doubled glyphs, no NBSP bytes). Save's replace POSITION is displaced by a separate pre-existing body OT-coordinate asymmetry (see limitations). |
| 8 | Console 0 errors; typing latency | PASS | `console.error`/`window.onerror`/`unhandledrejection` hooks empty across the whole session; 30-char burst insert committed in 8 ms with validation active; all marker resolutions completed within the 2 s observation windows |

### QA method note (typed markers in-app)

Raw keyboard `\` never reaches the Lexical document in-app: the extension's window keydown handler
`preventDefault`s the trigger and opens its own marker-menu popup whose search input steals focus
(fast-typed following keys can race into the document — observed "azln n" text corruption, undone).
The FootnoteEditor popover swallows `\` the same way via its own menu trigger. Items 3-6 were
therefore driven by `document.execCommand("insertText", …)` (native `beforeinput`, which Lexical
consumes exactly like typing) — everything downstream of the keydown (Tier-1/Tier-2, classification,
validation) is exercised identically. Phase 5's menu/filtering work should decide how literal
marker typing and the menu coexist (PT9 allows both).

### Additional runtime observations (not checklist items)

- Clicking a collapsed note caller (pane hidden) did not open the FootnoteEditor popover in this
  run; the popover was exercised via the Ctrl+T insert path instead (which works, incl. the
  Phase 3 `\f + \fr 1:1 \ft \f*` insert shape). Needs a manual re-check.
- The popover's Cancel button (deleteIfNew path) left the freshly inserted note in the main
  document (cleaned up via toolbar Undo).

## Known limitations carried forward

- **Generated base-rule specificity (QA item 2):** RESOLVED in Task 13b (2bd0f05) — default
  `containerSelector` is now `".editor-input.usfm"`; re-verified in-app (computed Andika/18pt).
- **Popover marker editing dead (QA item 7):** RESOLVED in Task 14 (2a09b69 library +
  9fc945fff82 worktree) — canonical glyph-free note contents ops in editable marker mode; see
  the QA table and `.superpowers/sdd/task-14-popover-report.md` for the contract redefinition.
  Remaining follow-ons from that work:
  - **Popover Save replace-position displacement (pre-existing, NEW finding):**
    `$getOTPositionOfNode` (used by `$getReplaceEmbedOps` for the retain) double-counts an
    editable-mode chapter — embed (1) PLUS its `\c 1 ` glyph text child via DFS descent (+5) —
    while `$applyUpdate`'s insert/delete traversals treat the chapter as an opaque embed (1).
    In-app: popover Save wrote the (clean) note 5 OT units past the original — between
    "time|wen" with the space deleted and the original note not removed. The two coordinate
    systems (delta-doc coordinates where body glyph text counts vs tree coordinates where
    embeds are opaque) need an owner decision — same unfinished editable-mode collab territory
    as findings #2/#3; NOT touched by Task 14 (out of sanctioned scope; noted in
    `note-ops-popover-roundtrip.test.tsx`'s Save-leg comment). Cleanup in QA was via host undo
    (which fully reverted the displaced write, state + disk verified).
  - **Popover wrapper-para glyph artifact (pre-existing):** `applyUpdate([noteOp])` inserts the
    note at OT index 0, BEFORE the popover wrapper para's `\p` glyph prefix;
    `$paraMarkerDeletionTransform` then injects a fresh prefix, leaving the ORIGINAL `\p `
    glyph pair as visible trailing junk after the note (the qa7 screenshot's trailing `\p`).
    Display-only: MarkerNode/NBSP are presentation nodes, so popover USJ and note ops stay
    clean; never written on Save. Fix candidates: insert after the para prefix, or drop the
    `PARAGRAPH_USJ` wrapper para (FootnoteEditor).
  - **Popover para-level typing** still lands in the `\p` glyph's `marker-trailing-space` node
    (skipped by design) — unchanged from 13b.
  - Mid-typing marker interleaving inside note content (key-by-key `\zln …\zln* ` with commits
    between keystrokes) can leave a stray `unmatched zln*` from intermediate Tier-2 rebuilds —
    engine caret-restoration/rebuild interplay, not the ops contract (single-commit insertText
    of the same sequence resolves cleanly, per Task 13 item 3 and the popover QA).
- Validation pass is O(document) per commit — accepted for chapter-sized docs; revisit if
  book-sized docs land.
- Pre-existing end-token laxity vs PT9 (unmatched closer leaves charStack intact; `+`-stripped
  matching) in `usfmFragmentToUsj.ts` (~356-372).
- Bare `.status_unknown`/`.status_invalid` rules at `usj-nodes.css:2299-2307` are now redundant
  (identical values, lower specificity than the scoped ones) — consolidation candidate.
- Vendored-sty parser: 4 fields (`fontName`/`lineSpacing`/`subscript`/`notRepeatable`) + the
  no-StyleType skip branch unexercised by the vendored sheet or tests; README
  "uncategorized-excluded" wording; `schema.json` `usfmStyleUrl` description still URL-only.
- Phase 3 carryovers: ~~OT-collab `closed` threading (`delta-apply-update.utils.ts:1747`)~~
  RESOLVED in Task 14 (`$getNoteOp` carries unknownAttributes; `$createNote` passes `closed`
  to `$createWholeNote`); `\fq`/`\xq` quotation-branch test; footnote popover whitespace/copy
  NBSP rules; Mac Cmd+T.

## Phase 5 handoff pointers

- **Marker menu + filtering API consuming `StyleInfo`:** the extension's inline marker menu
  (`generateInlineMarkerMenuListItems`) still uses its own item source; wire it to the project
  `StyleInfo` (classification + occursUnder filtering), and resolve the `\`-interception vs
  literal-typing conflict noted above.
- **Formatted-view CSS follow-up:** `useProjectStylesheet` is standard-view-only by design
  (spec non-goal); formatted view keeps the static stylesheet until Phase 5 decides.
- **Zoom:** `UsjCssOptions.zoom` is implemented but unused (host zoom decision pending).
- **`OnSelectionChangePlugin` `editor.read`-in-handler latent hazard** (flagged during Task 9b):
  the force-flush inside the selection handler is what made the frozen-state crash reachable;
  worth removing the hazard class, not just the crash.
- **CLAUDE.md stale Lexical version:** says 0.33.1, repo is on 0.43.0.
- Project settings for note callers/separators (extension `nodeOptions` TODO(phase5) fallbacks:
  `chapterVerseSeparator`, `verseRangeSeparator`, callers) are still library defaults.
