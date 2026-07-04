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

**Result: 6/8 PASS.**

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | `\s1` red via custom.sty merge | PASS | Generated rule `.editor-input .usfm_s1 { font-weight: bold; color: #FF0000; font-size: 100%; margin-top: 8pt; margin-bottom: 4pt; text-align: center; }` — base s1 properties kept, red merged in; computed color rgb(255,0,0), weight 700 |
| 2 | Project default font on editor container | **FAIL** | Base rule IS injected (`.editor-input { font-family: "Andika"; font-size: 18pt; }` with the project font temporarily set to Andika/18) but computed style stayed `"Charis SIL", …` 16px: static `.usfm.formatted-font` (0,2,0) outranks the generated `.editor-input` base rule (0,1,0). Per-marker rules tie at (0,2,0) and win by injection order — only the base rule loses. |
| 3 | `\zln text\zln* ` in `\p` → char span, blue | PASS | State: `char/zln` = [`marker/zln` "\zln", text " text", `marker/zln` "\zln*"]; DOM `span.usfm_zln` rgb(0,0,255) weight 700; glyph classes `opening`/`closing` with no status classes. Stylesheet-first classification beat the z-milestone wildcard. |
| 4 | `\zfoo ` in body → split + `status_unknown` | PASS | New `para` marker `zfoo` holding the tail text; glyph class `opening status_unknown`, computed rgb(204,30,20) weight 700 |
| 5 | `\ft ` in body → `status_invalid` | PASS | Glyph `opening status_invalid`, rgb(204,30,20) + 1px rgb(204,30,20) border-bottom; the document's legitimate `char/ft` nodes inside real footnotes stayed undecorated (context sensitivity) |
| 6 | `\zln ` inside `\s1` → `status_invalid` | PASS | Both zln glyphs `status_invalid` (red + underline) while the `\s1` opener glyph stays clean and red — occursUnder `p q1 q2` enforced |
| 7 | FootnoteEditor popover classify/validate | **FAIL** | No Tier-1/Tier-2 resolution inside the popover at all: `\zfoo `/`\zln x\zln* ` (native `beforeinput` insertion, same method that resolves in the main editor in <2s) remain literal text — no `char` node, no `status_*` classes, no console errors. Reproduced at both note-content (`\ft` span) and paragraph level inside the popover. Popover class list is identical to the main editor (`marker-editable`), so `MarkerEditPlugin` should be enabled; root cause not chased (out of task charter). |
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

- **Generated base-rule specificity (QA item 2):** `generateUsjCss`'s default
  `containerSelector: ".editor-input"` produces a base rule that static `.usfm.formatted-font`
  outranks. Candidate one-liner: emit the base rule under a (0,2,0)+ prefix (e.g.
  `.editor-input.usfm`) or pass a stronger `containerSelector` from the extension. Phase 5
  fast-follow.
- **Popover marker editing dead (QA item 7):** see table; needs a dedicated debugging pass
  (suspects: Tier-2 rebuild guard behavior in the popover's fragment document shape).
- Validation pass is O(document) per commit — accepted for chapter-sized docs; revisit if
  book-sized docs land.
- Pre-existing end-token laxity vs PT9 (unmatched closer leaves charStack intact; `+`-stripped
  matching) in `usfmFragmentToUsj.ts` (~356-372).
- Bare `.status_unknown`/`.status_invalid` rules at `usj-nodes.css:2299-2307` are now redundant
  (identical values, lower specificity than the scoped ones) — consolidation candidate.
- Vendored-sty parser: 4 fields (`fontName`/`lineSpacing`/`subscript`/`notRepeatable`) + the
  no-StyleType skip branch unexercised by the vendored sheet or tests; README
  "uncategorized-excluded" wording; `schema.json` `usfmStyleUrl` description still URL-only.
- Phase 3 carryovers: OT-collab `closed` threading (`delta-apply-update.utils.ts:1747`);
  `\fq`/`\xq` quotation-branch test; footnote popover whitespace/copy NBSP rules; Mac Cmd+T.

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
