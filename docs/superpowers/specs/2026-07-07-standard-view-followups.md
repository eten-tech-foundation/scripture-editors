# Standard View — consolidated follow-up register (post-project handoff)

**Date:** 2026-07-07 (Phase 5 wrap-up; the project's final phase)
**Supersedes:** the in-spec register at
`docs/superpowers/specs/2026-07-04-standard-view-phase5-design.md` §10 (groups A–G). This is the
single standalone handoff document for post-project work.
**Sources:** the SDD ledger `.superpowers/sdd/progress.md` (Phases 0–5, incl. every "Minor
(recorded)" / "FOLLOW-UPS" line), the phase notes (`2026-07-0{2,3,4,7}-standard-view-phase*-notes.md`),
the parent design §13, and the Phase 5 execution reports (`.superpowers/sdd/phase5-task-*-report.md`,
`phase5-task-15-report.md`, `phase5-task-15-fixwave-report.md`).

## Status legend

- **OPEN** — real work remaining; not started or not finished.
- **CLOSED-by-<task/commit>** — resolved during Phase 5 (or an earlier phase); listed here only so
  the pre-Phase-5 register reader can see it was discharged.
- **DOCUMENTED-BEHAVIOR** — a deliberate, accepted PT9 divergence or a product decision to not fix;
  nothing to do unless a Product Owner reverses the call. See also the PO doc
  `2026-07-04-standard-view-pt9-ux-differences.md`.
- **BY-DESIGN** — an accepted engine limitation (design constraint or PT9-consistent), carried
  forward from a phase-notes "Known limitations" section.

Where a fix is estimated, the sizing matches the PO doc: Small = days, Medium = a focused work item,
Large = its own phase.

---

## 0. Closed by Phase 5 (discharged pre-Phase-5 register items)

These were OPEN at Phase 5 start (spec §10 / prior phase notes) and shipped closed. Kept for the
handoff reader's audit trail; no action.

| Item | Closed by |
| --- | --- |
| Clipboard in-app normalization unreachable (null-payload dispatchers bypassed `$handleCopyForStandardView`) | Task 4 (`copyToClipboard(editor,null,data)` handler-side fix) + Task 15 QA (real bytes NBSP-clean, copy+cut) |
| Popover Cancel left the fresh note in the main doc | Task 14/14b (`insertMarker` returns the inserted note's TRUE Lexical key; host overwrites `editingNoteKey`) |
| Popover wrapper-para `\p` glyph artifact (trailing junk after note) | Task 14 (`EDITABLE_WRAPPER_PARA_PREFIX_RETAIN=3`) |
| Popover marker editing inert (glyph-doubling, Tier-2 sentinel abort) | Task 14 (canonical glyph-free note-contents ops, `$handleTextNodes`) |
| Popover Save replace-position displaced +5 (OT-coordinate asymmetry) | Task 15 (`OTCoordinateSystem` "apply" — opaque editable chapter; owner-decided option 1) |
| Scribe `CommandMenuPlugin` not gated for editable markerMode (latent Task-15-class bug) | Task 7 (port of the platform gate) |
| `CLAUDE.md` stale Lexical version (0.33.1) | Task 7 (→ 0.43.0) |
| Redundant bare `.status_unknown`/`.status_invalid` CSS rules | Task 6 (deleted; scoped rules verified to survive) |
| `\xq` quotation-branch test (Phase 3 carryover) | Task 7 (exact `xq` node text pinned; the `\fq` verse-strip path was already covered by Phase 3 Task 5) |
| Opaque blocks (table/figure/sidebar/`\periph`) invisible in every view | Task 6 (library §7 visible-inert `UnknownNode`) + Task 15 cluster E (extension `_usj-nodes.scss` port) + final round (`min-height` for empty blocks) |
| `nodeOptions` note callers/separators were library defaults (TODO(phase5)) | Task 12 (real project settings via name-map; `useProjectSetting`) |
| `OnSelectionChangePlugin` `editor.read` force-flush hazard (9b crash-class enabler) | Task 7 (`getEditorState().read`) |
| Enter-menu `\ip` SmartEnter chosen book-wide on rank-less sheets | Task 15 fix-wave B2 (`5f1e8d1`; gate `\ip` on actual intro context — no `\c` before caret) |
| StyleInfo base-rule specificity lost to static `.usfm.formatted-font` (Phase 4 item 2) | Task 13b (`containerSelector` → `.editor-input.usfm`) |
| OT-collab `closed` threading gap (Phase 3) | Task 14 (`$getNoteOp` carries `unknownAttributes`; `$createNote` honors `closed`) |
| Inline marker menu still on the static USFM table (Phase 4 handoff) | Task 10 (`generateInlineMarkerMenuListItems` re-sourced to the library item-source API) |
| Power-mode default view + `changeScriptureView` cycle including Standard | Task 13 (shipped) + Task 8 (Phase 3, cycle) |

---

## 1. Engine (marker resolution, Tier-1/Tier-2, OT coordinates)

- **Abandonment-window blur policy — OPEN.** Blur-and-never-return leaves the caret node's typed
  literal pending indefinitely; sharpest form: mid-rename a glyph, then a host save/`getUsj`
  serializes the OLD marker while the screen shows the new one (self-heals on the next caret commit).
  Candidates: resolve-all pendings on host save/`getUsj`, or menu-mousedown `preventDefault`.
  Recorded: ledger Task 8 fix-wave "Minor (FOLLOW-UPS REGISTER items)". Small.
- **`appPlacedCaret` mouse-only residual — DOCUMENTED-BEHAVIOR.** The suppression flag persists
  across mouse-only interaction until the next keydown/blur; benign (only preserves pending
  literals; BLUR still sweeps non-caret pendings). Documented in `MarkerEditPlugin` (`ab1445f`).
  Recorded: fixwave "Wave-review fixes → Minor (b)".
- **ScriptureReferencePlugin scrRef-echo robustness — OPEN (partially mitigated).** The async papi
  scrRef round-trip could re-enter `$moveCursorToVerseStart` and yank the caret (the Task-15
  premature-split actor). Mitigated by a bounded FIFO self-echo dedupe (`bc8f934`) + the BookNode
  cursor mover skipping same-document reloads (`0412767`); the underlying `hasSelectionChangedRef`
  boolean is still defeatable by intervening selection changes during the round-trip. HIGH blast
  radius (scribe has its own copy). Recorded: fixwave round 1 cluster A / round 2 item 1. Medium.
- **Type-through-split vs palette-retag — DOCUMENTED-BEHAVIOR (controller-adjudicated, QA run 4).**
  Fluent `\q1␣` settles as a paragraph SPLIT that preserves the (possibly empty) original paragraph;
  the palette Enter/click path RETAGS the current paragraph. Both are PT9-faithful for their flow
  (PT9's popup replaces the typed run and retags; a raw typed marker under reformat starts a new
  para, original kept — byte-faithful). Do NOT "fix". Recorded: ledger QA run 4 (2). PO-doc row added.
- **Two-/three-step undo for palette applies and settle — DOCUMENTED-BEHAVIOR.** apply = 2 steps
  (typed literal edit + the apply's cleanup/retag), settle = 3; inherently multiple user actions,
  not an echo/debounce artifact. Product ruling if it bothers users. Recorded: fixwave round 3
  "2-step undo" + QA run 4.
- **`"apply"` vs `"delta-doc"` OT coordinate split — BY-DESIGN (collab-incomplete).**
  `OTCoordinateSystem` in `delta-common.utils.ts` deliberately splits: `"apply"` treats every
  element embed (the editable `ChapterNode`) as opaque (host-local popover-Save correctness);
  `"delta-doc"` counts the `\c` glyph text (paired with `getEditorDelta` diffs — the Ctrl+T
  auto-open path depends on it). Unifying the two belongs to collab completion. Recorded: ledger
  Task 15; phase4-notes limitations. Large.
- **Delta-doc editable-`VerseNode` verse-skew — BY-DESIGN (bypassed, not fixed).** `getEditorDelta`
  emits BOTH a text op and a verse embed op for an editable `VerseNode` while the delta-doc reverse
  lookup counts text only, so `getInsertedNodeKey` lands +1-per-preceding-verse past the target.
  Bypassed for the popover-Cancel flow (Task 14b routes the fresh-note key from `insertMarker`), but
  the underlying skew remains for any delta-doc consumer. Verses are the only delta-doc-internal skew
  source. Recorded: ledger Task 14. Part of the collab-unification work above.
- **Book `\id` marker glyph absent from editable delta ops — OPEN (confirm with collab owner).**
  Pre-existing Phase 0/1 minor. Recorded: ledger Phase 0/1 Task 6; register B.
- **Validation pass is O(document) per commit — BY-DESIGN.** Accepted for chapter-sized docs;
  revisit for book-sized docs. Recorded: phase4-notes limitations; register A.
- **Pre-existing end-token laxity vs PT9 — BY-DESIGN.** Unmatched closer leaves the char stack
  intact; `+`-stripped `findLastIndex` lets a bare `\zfoo*` close a nested `\+zfoo`
  (`usfmFragmentToUsj.ts` ~356–372). Recorded: Phase 4 Task 3 minors; register A.
- **`rebuildAttempted` byte-identical-content skip — BY-DESIGN.** Two scopes sharing byte-identical
  trigger content in one commit can skip a would-succeed rebuild; recovery needs a DIRECT content
  re-edit (Enter/blur do not retrigger). Recorded: Phase 2 Task 11; register A.
- **Multi-para caret drift after a literal-`\p` split — BY-DESIGN (cosmetic).** Recorded: Phase 2
  Task 6; register A.
- **Assorted BY-DESIGN engine limitations (register A, unchanged):** annotation `TypedMarkNode`s
  flattened by Tier-2 rebuilds (host-reapplied overlay assumption); milestone attribute text
  live-edited but never re-tokenized; verses with `sid`/alt/pub/`unknownAttributes` atomic in
  Tier-2; chapter junk-text edits fall back to the stored number silently; cross-node space runs not
  collapsed; literal `~` → NBSP one-way; PT9 `vp*`/`va*` leading-space trim not replicated; typed
  unknown markers now settle into structured `UnknownNode`/char shape on caret departure (Task 15
  cluster 3 softened the old "stay literal until reload" for the standard-view live-typing path — no
  longer strictly reload-gated). Recorded: phase2-notes / register A.

## 2. Palette UX (backslash + Enter menus; passive and focused modes)

- **Focused palette keyboard is forwarding-driven, not true DOM focus — DOCUMENTED-BEHAVIOR.**
  Lexical re-focuses its root element on every DOM-selection reconcile, so the overlay input cannot
  hold true focus while the document has a live selection; keyboard usability is delivered via
  capture-phase forwarding (filter/arrows/Enter/Escape) for selection-wrap and Enter sessions. On
  ACTIVE palettes driven externally, the COMMIT path resolves from the host's
  `filterPaletteItems`-filtered list + store index while the visible list/highlight is cmdk's own
  (fuzzy) filtering of the controlled input value — the two orderings can diverge, so the
  committed item can DIFFER from the one that looks selected (not merely a cosmetic highlight
  offset; final whole-branch review sharpened this). Recorded: fixwave round 3 cluster 2. Medium
  to make the input truly focusable cross-frame or to unify the two filters.
- **Mixed-modality filter drift — OPEN.** Locally typed palette chars are unknown to the session
  filter string; the next forwarded key resets the input to the stale session string. Candidate:
  document, or sync-on-commit. Recorded: fixwave round 3 review "Minor (FOLLOW-UPS)". Small.
- **Ctrl/Cmd chords swallowed as filter chars during selection/Enter sessions — CLOSED (final
  review fold-in).** The shared forwarding table (`handleMarkerPaletteSessionKeyDown`) never
  ingests or claims real chords: the session dismisses and the chord does its normal job (Ctrl+C
  copies the wrapped selection again). Both consumers inherit the fix by construction.
- **Enter-menu / selection-wrap forwarding-table duplication — CLOSED (drift CONFIRMED by the
  final whole-branch review, then extracted).** The predicted drift materialized: the round-3
  capture-phase rework (stopPropagation on session-ending keys, the every-key-claiming 'selection'
  session, Enter-session type-to-filter) landed only in the web view, leaving the FootnoteEditor
  copy bubble-phase without stopPropagation — an in-session Enter there let MarkerEditPlugin's
  KEY_ENTER mutate the note BEFORE the palette commit applied (double mutation), and the wrap
  palette's text-loss protection was absent. Fixed by extracting the single source
  (`handleMarkerPaletteSessionKeyDown`, `platform-bible-react`
  `components/advanced/marker-palette-keydown.util.ts`), consumed by BOTH the web view and
  `FootnoteEditor`; unit matrix + popover pins added.
- **Empty-filter commit orphans an open palette — OPEN.** A commit with an empty filter orphans the
  palette until a click-outside. Candidates: dismiss when the filtered list is empty, or host
  resolve-`undefined` on no candidates. Recorded: ledger Task 10 minor. Small.
- **AltGraph/CapsLock dismiss the palette — OPEN (rare).** AltGr-chord layouts hit the same shape as
  the old Shift bug, far rarer. Recorded: ledger Task 10 minor. Small.
- **Passive listbox lacks an accessible name — OPEN (a11y).** cmdk defaults to "Suggestions".
  Recorded: ledger Task 9 minor. Small.
- **Localization-aware palette filtering — OPEN.** The host filters raw labels while the component
  renders localized labels, so `LocalizeKey` labels would diverge; constrained today by JSDoc to
  plain-string labels. Recorded: ledger Task 9 "FOLLOW-UPS". Small–Medium.
- **PT9 dual-StartsWith filter residual — OPEN (minor parity).** A literal `"+w"`-labeled item
  matches filter `"+w"` in PT9 but not in the strip-only port. Conformant to brief. Recorded: ledger
  Task 9 minor. Small.
- **closeTag endMarker source mismatch — OPEN (final whole-branch review minor).** The close-tag
  item's marker text is built from the sheet's `endMarker` (or `marker + '*'` fallback) in
  `closeTagItems`, but the apply side matches/strips via `marker + '*'` shapes — a sheet whose
  `endMarker` differs from `marker + '*'` (nonstandard custom.sty) could offer a close tag the
  apply can't match. Small.
- **closeTag pick during a selection-wrap session is a silent no-op — OPEN (final whole-branch
  review minor).** `$closeCharSpanAtCaret` expects a collapsed caret inside the span; committing a
  close-tag item while a text selection is active does nothing, with no user feedback. Small.
- **`$retagParagraph` no-prefix fallback — OPEN (final whole-branch review minor).** When the
  paragraph's first child is not a MarkerNode (degenerate/legacy shape), the retag updates para
  state but skips the glyph rewrite and falls back to `para.selectEnd()` — glyph and state can
  disagree until the next rebuild. Small.
- **`LITERAL_TRIGGER_PREFIX_REGEX` citation breadth — NOTE (final whole-branch review).** The
  cleanup regex `\\[a-z0-9+*]*$/i` is broader than the cited PT9
  `MarkerDropdownControl.cs:216-219` charset (adds `*` and case-insensitivity); intentional for
  closer-form runs, but the comment's citation overstates the parity. Documentation-only.
- **Passive palette list height reserved 44px for a nonexistent input — CLOSED (final review
  fold-in).** Passive mode now uses the full `maxHeight` budget; the -44 input reservation applies
  only to the active branch.
- **Space-commit / palette-click cross-frame save window — OPEN (bounded).** The debounced-save
  flush-on-window-blur can fire a mid-marker save on the cross-frame palette-CLICK path (bounded,
  pre-wave-class exposure; trace-verified). Recorded: fixwave "FIX WAVE + LIFECYCLE FIX" new Minor.
  Small.
- **`removeChild` NotFoundError on rapid palette replace — OPEN (not reproducing).** The
  Radix-Presence/portal double-teardown race is theoretically present but did not reproduce once the
  zombie-palette churn was gone; follow-up only if it reappears. Recorded: fixwave round 3 "Console
  errors / removeChild".
- **Muted (non-basic) dimming uses an inline style — DOCUMENTED-BEHAVIOR.** `tw:opacity-60` had no
  backing rule in the renderer (no Tailwind build there); switched to inline `opacity: 0.6`.
  Recorded: fixwave round 3 cluster 4.
- **Enter-trigger branch of `$applyParagraphSelection` untested — OPEN (low exposure).** Recorded:
  ledger Task 8 fix-wave minor. Small.

## 3. Popover / notes UX

- **Popover Enter → `\fp` broken — OPEN (PO-visible).** Inside the FootnoteEditor popover, Enter
  plain-splits the wrapper instead of inserting `\fp`: the DOM caret sits at the wrapper-para start
  after Radix's open-autofocus, and Lexical's keydown path follows the DOM. Library
  `$handleEnterInNote` is correct (jsdom-verified) and `MarkerEditPlugin` mounts in the popover.
  **Candidate FALSIFIED live:** `onOpenAutoFocus={preventDefault}` made it WORSE (focus never
  entered the popover — Radix autofocus is load-bearing for the into-popover handoff); reverted with
  evidence. Proper fix: FootnoteEditor re-asserts `selectNote(0)`+focus AFTER Radix's autofocus
  settles (rAF/microtask, or on `FOCUS_COMMAND` when the caret lands at the wrapper start). Recorded:
  fixwave round 2 item 2 + close-out follow-up 1; ledger Task 15 CLOSED open-items. Small–Medium.
- **Caller-click popover open (pane hidden) unreliable — OPEN (pre-existing Phase 4).**
  `noteCallerOnClick` is structurally correct; ranked break-point candidates: `footnotesPaneVisibleRef`
  mis-reading `true` while hidden (state/ref desync), stale `editingNoteKey.current` from a prior
  session, or the collapsed caller not carrying an `onClick` (adaptor gives only
  `ImmutableNoteCallerNode` an `onClick`). Instrument the handler entry + refs at click time.
  Recorded: fixwave round 1 cluster D; ledger Task 13/15. Small once pinned.
- **Double-insert retarget race — OPEN.** Two rapid Ctrl+T during the pre-insert await window can
  retarget `editingNoteKey` to note B while the popover edits note A → Cancel deletes B. Needs a
  per-insert session token tying the correction to its popover session (exceeds the Task-14b
  envelope). Recorded: ledger Task 14b "FOLLOW-UPS". Small.
- **Lexical-upgrade dependency (`scheduleMicroTask == queueMicrotask`) — OPEN (watch on upgrade).**
  The Task-14b `editingNoteKey`-overwrite ordering proof relies on Lexical 0.43's
  `scheduleMicroTask` being `queueMicrotask` and zero async hops in the listener-flush chain.
  Re-verify on any Lexical bump. Recorded: ledger Task 14b "FOLLOW-UPS". Small.
- **Popover `noteMode: expanded` disables standard-view whitespace/copy-NBSP rules on note content —
  OPEN.** Inside the popover `isStandardView()` is false, so §4 whitespace-display and copy-NBSP
  normalization are inactive on note content. Needs an `isStandardView`/`getViewMode` rework in
  `scripture-editors`. Recorded: Phase 3 Task 9 limitation; register C. Medium.
- **`footnotes.component.tsx` `focusRequest` bounds-check reorder — CLOSED (fixed by `d206e992`,
  Phase 3 final-review fix wave; the final whole-branch reviewer verified the shipped code).** The
  ref assignment now lands after the bounds check. Previously recorded: Phase 3 Task 11 minor;
  register C.
- **Footnotes-pane duplicate-note content-equality ambiguity — OPEN (pre-existing pane behavior).**
  Byte-identical duplicate notes are ambiguous to `findNoteIndexByOps`. Recorded: Phase 3 Task 11;
  register C.
- **No scroll-into-view for an off-screen pane row — OPEN.** Recorded: Phase 3 Task 11; register C.
- **Expanded-state literal-caller path untested — OPEN.** Recorded: Phase 3 Task 4; register C.
- **Popover para-level typing lands in the skipped `\p` `marker-trailing-space` node — BY-DESIGN.**
  Unchanged from Phase 4 Task 13b (the content-start prefix-node exemption fix in Task 15 cluster 3
  addressed the body para-start case, not the popover wrapper). Recorded: phase4-notes limitations.
- **Mid-typing marker interleaving inside note content can leave a stray unmatched closer —
  BY-DESIGN.** Key-by-key `\zln …\zln* ` with commits between keystrokes; single-commit `insertText`
  of the same sequence resolves cleanly. Recorded: phase4-notes limitations; register C.
- **Mac Cmd+T — OPEN.** Ctrl+T has no Cmd+T branch (matches the pre-existing Ctrl+F precedent;
  verify on macOS). Recorded: Phase 3/Task 12; register C. Small.

## 4. Host / extension

- **Cell-click BCV navigation chain (book-row → chapter-cell → verse-cell) — OPEN (needs human QA).**
  The submit+reload pipeline is verified healthy under both focus conditions and the round-2
  navigation regression was fixed (`da1c8e9e7f`, book|chapter identity gate on the sync deferral);
  the synthetic-CDP cell-click chain could not be driven conclusively (cmdk/Radix selection
  semantics — QA's own flaky note). Referred to the next human QA pass. Recorded: ledger QA run 4;
  final-round item 1.
- **Post-cleanup pre-arrival save window — OPEN (sub-second, narrow).** After a chapter switch, one
  debounced save can route through the new chapter's data selector before the arrival replace lands
  (doubly narrowed by `currentlyWritingUsjToPdp` + the arrival replace; the only remaining
  cross-chapter path). Recorded: ledger final-round CONFIRMED new Minor. Small.
- **Debounced-save crash window — DOCUMENTED-BEHAVIOR (mitigated).** The 700 ms trailing debounce
  means a renderer death within the window could lose the final edits; mitigated by
  `flushable-debouncer.util.ts` (flush on effect cleanup keyed on book/chapter, on unmount, and
  best-effort on `blur`/`pagehide`/`beforeunload`). The interval is chosen to kill the per-keystroke
  echo storm — ballpark-consistent with PT9's UI timer granularity, NOT a cited PT9 constant.
  Recorded: fixwave "IMPORTANT — debounced PDP save lifecycle" + "Minor (a)".
- **`LoadStatePlugin` reload cluster (PT-3890 / PT-3797 / PT-3909) — OPEN (coordination item).** The
  power-mode default raises exposure (parent design risk #2). Task 15 touched adjacent code
  (`cf3da4e` SKIP_DOM_SELECTION_TAG for unfocused external replaces; BookNode mover same-doc skip;
  `useEditorPdpSync` deferral), but the reload-cluster coordination remains. Recorded: register E.
  Medium.
- **Ctrl+K insert-verse-number host command — OPEN (non-goal this project).** No host command
  exists; PT9 rules documented in spec §9 (`UsfmSnippetInserter.cs:195-225`). Recorded: register E /
  spec §9 non-goals. Medium (new host command + porting the rules).
- **Caller-sequence project settings — DOCUMENTED-BEHAVIOR (wontfix, verified).** No note/cross-ref
  caller SEQUENCE settings exist in ParatextData (PA/PublishingAssistant's `CallerSequence` is a
  different subsystem/prefs store); `noteCallers` stays the library default and `crossRefCallers`
  stays hard-coded `['†']` (spec-sanctioned). Recorded: ledger Task 12 "CALLER-SEQUENCE OUTCOME";
  register E.
- **Verse-bridge `verseRangeSeparator` formula untested — OPEN.** No UI builds a bridge ref yet.
  Recorded: Phase 3 Task 5; register E. Small.
- **New setting labels/descriptions authored fresh — OPEN (copy pass).** No PT9 UI copy was found;
  do a copy pass before release if these surface in UI. Recorded: ledger Task 12 minor. Small.
- **`main.ts` also imports the re-sourced web-view utils — CLOSED-by-Task-15.** The activation
  failure (editor package's React-bundled monolith dragged into `main.js` via
  `platform-scripture-editor.utils.ts` value imports) was fixed by splitting the editor-package value
  imports into a web-view-only module + a cold-start activation smoke (now a permanent QA
  requirement). Recorded: ledger Task 15 RUN 1 + FIX. No action; noted so the pattern is remembered.

## 5. Styling / StyleInfo (register D, mostly OPEN)

- **Formatted-view project CSS — OPEN (PO/host decision).** `useProjectStylesheet` is standard-view
  only by design; formatted view keeps the static stylesheet. Recorded: spec decision 5 / non-goals;
  register D. Medium.
- **Zoom wiring — OPEN (host decision pending).** `UsjCssOptions.zoom` implemented but unused.
  Recorded: register D; spec non-goals. Small once the host decides.
- **Vendored-sty parser fields unexercised — OPEN.** `fontName`/`lineSpacing`/`subscript`/
  `notRepeatable` + the no-`StyleType` skip branch are unexercised by the vendored sheet or tests;
  plus the README "uncategorized-excluded" wording and `schema.json` `usfmStyleUrl` URL-only
  description. Recorded: Phase 4 Task 2; register D. Small.
- **Demo-only fallback asymmetry — OPEN.** Demo classification uses a simplified table vs
  validation's `defaultStyleInfo`. Recorded: Phase 4 final review; register D.
- **Defensive Unknown-entry divergence (tokenizer vs guards) — OPEN.** Recorded: Phase 4 final
  review; register D.
- **Pathological `\+f` note token — OPEN.** Recorded: Phase 4 final review; register D.
- **`MarkerValidationPlugin` `styleInfo` prop unmemoized upstream — OPEN.** Recorded: Phase 4 final
  review; register D.
- **`isBasic` ordering degrades to plain natural sort if descriptions lack `"(basic)"` —
  DOCUMENTED-BEHAVIOR.** Recorded: spec §9; register G.

## 6. Process / test debt

- **`test-76` name staleness + post-split glyph-typing coverage — OPEN.** The caret-bounded
  termination change (round 3 cluster 1) superseded the Task-9 "immediate mid-word split" design;
  test 76's body was kept byte-identical with a comment-only rewrite, so its name now overclaims and
  the post-split glyph-typing path is no longer mid-flow covered. Recorded: fixwave round 3 review
  minor. Small.
- **`getEditorState().read` drops the `{editor}` options bag — OPEN (latent footgun).**
  `getActiveEditor()` is null inside the `OnSelectionChangePlugin` callback; inert today (whole call
  graph verified), latent if `selection.utils` ever needs editor context. Recorded: ledger Task 7
  minor. Small.
- **`compareMarkerText` exported module-level for tests only — OPEN.** The digit-aware tie-break is
  unreachable through the public API (no supported marker has a 2+ digit suffix); exported solely to
  pin it. Recorded: ledger Task 1 minor. Trivial.
- **Untested apply-path branches — OPEN (coverage).** Content-end `closeTag` branch, nested-outer
  degrade fallback, note-kind apply, and raced-prefix cleanup are untested (jsdom-limited);
  `$selectAfterCharNode` guards `$isTextNode` without `!$isMarkerNode` (narrow content-end-close
  edge). Recorded: ledger Task 3 minors. Small.
- **Missing cheap gate tests — OPEN.** No wiring-level test for the `Editor.tsx` `isReadonly` guard
  (Task 2); the brief-claimed "existing" non-standard-view clipboard gate test does not exist and
  the gating code is untested (Task 4); Task 5 QA-harness assertions are loose (QA-only latitude).
  Recorded: ledger Tasks 2/4/5 minors. Small.
- **`scribe`'s parallel `usj-marker-action` copy untouched — OPEN.** Out of scope for Phase 5's
  editable-wrap `$wrapNode` fix; check if scribe ever gains editable marker modes. Recorded: ledger
  Task 3 minor.
- **Duplicated near-identical C# hook/guard/memo blocks (~60 lines) — OPEN (candidate helper).**
  Recorded: ledger Task 12 minor. Small.
- **Assorted cosmetic doc/comment nits — OPEN (trivial).** Stale sentinel doc comment (Task 13);
  `retain=3` magic constant documentation (Task 14, test-pinned); defensive-comment overstatement of
  noteMarker keyboard-unreachability (Task 5); Task-6 test locals use `null` over `undefined`; etc.
  Recorded: per-task "Minor (recorded)" lines.

## 7. Documented-behavior divergences from PT9 (register G — accepted this phase)

All DOCUMENTED-BEHAVIOR; see the PO doc for plain-language framing. No action unless a PO reverses:

- **Palette rendering cosmetics** — the palette paints in the renderer's top-level document (outside
  the iframe, so it can escape the panel bounds) and rows don't preview each style's own font/color
  the way PT9's WinForms grid does. (Type-through, Space-commit, `*`-close, Escape-leaves-text are
  all PT9 parity via the passive palette — Tier 2 resolves the typed run on termination.)
- **No marker-popup-off setting** — PT9 offers `UseMarkerPopup` (default on, user-toggleable); a
  matching PT10 setting is a follow-up. Small.
- **Enter menu always shows** — one extra keystroke per paragraph vs PT9 SmartEnter's immediate
  `\p`; Enter-Enter reproduces the outcome. A direct-insert (no-menu) mode is a small later change.
- **Escape-on-Enter cancels the split entirely** vs PT9's non-SmartEnter path leaving the raw break.
- **Deprecated markers not filtered** — exact PT9 parity (PT9 has no Exclude/DEPRECATED filter).
- **`id` excluded from the palette** — PT9 offers it; our structural insert path doesn't support it.
- **`fig` from the menu inserts the char span without PT9's figure dialog** — dialog is a parent-§13
  follow-up. Medium.
- **Study Bible additions popup branch** (`IncludeSpecialStyles=false`, `AllowExtendedNotes=true`)
  not implemented — Study Bible is parent-§13 out of scope.

## 8. Parent design §13 register (unchanged, by reference)

Restated for completeness; each is a recorded parent-design follow-up unaffected by this project.
See `docs/superpowers/specs/2026-07-01-standard-view-design.md` §13.

AutoCorrect (`autocorrect.txt`); toolbar style-dropdown hardening; real table/figure/sidebar node
types with in-place editing; editable footnotes pane; note insert dialogs + caller renumbering;
`\fe`/`\ef`/`\ex` insertion affordances; figure properties dialog + `link:fig`/`link:ref`; ruby
glossing; Study Bible; annotations-as-such; spell-check (platform-level); protected-resource copy
caps; invisible-characters mode; PT9 origin-range/section-head note options; Alt+X (char ↔ hex);
cross-window current-verse highlighting; double-click trailing-space trim; literal editing of
`\ca`/`\cp`/`\va`/`\vp` runs.

---

## First things a post-project pass should pick up

1. **Popover Enter → `\fp`** (§3) — PO-visible, evidence + a falsified candidate already in hand;
   the cleanest remaining user-facing defect in the note-editing flow.
2. **Caller-click popover open when the pane is hidden** (§3) — pre-existing, needs one instrumented
   click to pin which gate returns early.
3. **Human QA of the cell-click BCV chain** (§4) — the only Phase-5 verification not machine-drivable.
4. **Abandonment-window / host-save resolve-all policy** (§1) — the sharpest correctness edge
   (mid-rename glyph serialized stale on save); small, and it removes a whole latent class.
5. **`LoadStatePlugin` reload cluster** (§4) — coordination item whose exposure the power-mode
   default raised.
