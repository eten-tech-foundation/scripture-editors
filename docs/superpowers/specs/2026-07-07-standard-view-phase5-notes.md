# Standard view — Phase 5 (extension wiring + menus) completion notes

**Date:** 2026-07-07 (final phase of the Standard View project)
**Spec:** `docs/superpowers/specs/2026-07-04-standard-view-phase5-design.md` (commit `1f7f74c`)
**Plan:** `docs/superpowers/plans/2026-07-04-standard-view-phase-5.md` (commit `ba8eaed`)
**Ledger:** `.superpowers/sdd/progress.md` (Phase 5 section)
**Follow-ups:** all open items and accepted divergences are consolidated in
`docs/superpowers/specs/2026-07-07-standard-view-followups.md` — the single post-project handoff
register (this note points at it rather than duplicating the list).

Phase 5 is the last phase. It delivered the PT9-parity marker-creation affordances (context-aware
`\`-menu with a StyleInfo-backed item source, Enter paragraph-style menu), clipboard normalization,
the power-mode default view, §7 opaque-block rendering, real project-settings sourcing for note
callers/separators, a passive command-palette mode in the paranext-core overlay service, three
bug/hazard fixes, hygiene, and the two owner-requested communication documents.

## What landed

### Part A — library (`scripture-editors`, branch `standard-view`, `ba8eaed..1e9f46d`)

| Task | Commits | Delivered |
| --- | --- | --- |
| 1 | `ba8eaed..1ec8cee` | PT9 `MarkerItemSource` port — `markerMenu/markerItemSource.ts` (`getMarkerMenuItems`/`getEnterMenuItems` + `MarkerMenuContext`/`MarkerMenuItem`), barrel-exported; `isParagraphTagValid`/`ParaStackEntry` exported |
| 2 | `1ec8cee..b42a4a4` | `getMarkerMenuContext` — PT9 `HandleBackslash` source selection (para-content-start vs mid-text vs selection vs in-note), `anchorRect`; recursive `$isAtParagraphContentStart` (leading char-span shape) |
| 3 | `b42a4a4..dbd4ab5` | `applyMarkerMenuSelection` (open/note/closeTag kinds, literal-prefix cleanup, selection-wrap) + `splitParagraphWithMarker`; editable-mode `$wrapNode` glyph-preserving fix (necessary-for-spec) |
| 4 | `dbd4ab5..f28c943` | Clipboard normalization — `$getStandardViewClipboardData`; `MarkerEditPlugin` COPY/CUT null-dispatch builds the payload and calls `copyToClipboard(editor,null,data)`; real-event path declines (returns `false`) |
| 5 | `f28c943..e7e0ec4` | QA-only `editableHarness` branch on `UsjNodesMenuPlugin` (document-first `\`, Enter interception; not production UI — P10 uses the overlay service) |
| 6 | `e7e0ec4..75bdc0a` | §7 visible-inert `UnknownNode` — class-based `createDOM` (`unknown-block`/`unknown-inline`, `data-marker`/`data-tag`, `contentEditable=false`), CSS default-hidden, revealed subdued under `.marker-editable`; bare `.status_*` rules deleted; `\ref`+`\optbreak` inline (corpus-proven) |
| 7 | `75bdc0a..779d70f` | `OnSelectionChangePlugin` `editor.read`→`getEditorState().read` (9b hazard class removed); scribe `CommandMenuPlugin` gate; `\xq` quotation test; `CLAUDE.md` Lexical 0.43.0 |
| 8 | `779d70f..3e0c0b4` | Part-A demo QA + fixes: PT9 final stable `OrderBy(IsBasic)` combined-list ordering (user decision); paragraph-kind apply = RETAG in place; blur excepts the caret node (phantom-marker fix) |

### Part B — extension (paranext worktree `standard-view`, `9fc945fff82..da1c8e9e7f`)

| Task | Commits | Delivered |
| --- | --- | --- |
| 9 | `9fc945fff82..bd0eb2c5e3e` | Overlay service passive palette — `passive` flag on `CommandPaletteRequest` + webViewId-keyed `updateCommandPalette`/`commitCommandPaletteSelection`/`dismissCommandPalette` drivers; passive component mode (no input, no focus steal); `papi.d.ts` regen |
| 10 | `bd0eb2c5e3e..2d34b988cf7` | Standard-view `\`/Enter palettes wired in the web-view keydown (forwarding table; legacy `\` byte-preserved under a `viewType` guard); `generateInlineMarkerMenuListItems` re-sourced to the library API; `CommandPaletteItem.muted` + `badge:'end'` |
| 11 | `2d34b988cf7..48db2e9a50a` | `FootnoteEditor` `markerPalette` prop family (in-popover `\` palette via the web view's `showMarkerPalette`); forwarding table parity; `\fp` on Enter untouched; `lib/platform-bible-react/dist` rebuilt+committed |
| 12 | `48db2e9a50a..07679e89c17` | Four project settings mapped (`chapterVerseSeparator`/`verseRangeSeparator`/`defaultFootnoteCaller`/`defaultCrossRefCaller`) via `ProjectSettingsNames.cs` + `projectSettings.json` (name-map only); `useProjectSetting` reads replace the fallbacks |
| 13 | `07679e89c17..96bc70cbb9c` | Power-mode default view — `useWebViewState('viewType', …)` default + a fire-time store-probing correction effect (verify-first: the naive default was sticky-wrong); saved state respected; simple unchanged |
| 14 / 14b | `96bc70cbb9c..24fe6156b1e` | Popover wrapper-glyph fix (`retain:3`); popover-Cancel fix (`insertMarker` returns the inserted note's TRUE Lexical key; host overwrites `editingNoteKey` via `queueMicrotask`) |
| 15 | `909556b033f..da1c8e9e7f` | Runtime QA + the fix-wave saga (below): activation split, engine race fixes, capture-phase triggers, §7 scss port, focus-forwarding, debounced saves, navigation-regression fix |

C# settings work landed inside Task 12 (`NoteCallerAndSeparatorSettingTests` 12/12; `c-sharp`
1317/6skip). The registered default `"."` for `chapterVerseSeparator` is a real PT9-faithful behavior
change for tag-less projects in ALL views (documented in the PO/simple-mode docs).

## The QA + fix-wave saga (honest summary)

Task 15 was the runtime-QA gate, and it was the hard part of the phase. It ran **four QA runs** and
**three fix-wave rounds plus a final round**, with several hypotheses falsified live before the true
causes were found. The short version:

- **QA run 1** never got to the checklist: the phase's first genuinely cold
  `npm-stop → rebuild → relaunch` exposed a **pre-existing activation failure** — Task 10's
  `getMarkerMenuItems`/`defaultStyleInfo` VALUE imports in `platform-scripture-editor.utils.ts` (also
  imported by `main.ts`) dragged the editor package's React-bundled monolith into `main.js`, so
  `platformScriptureEditor` failed to activate (react/jsx-runtime unreachable in the extension-host
  sandbox). Fix: split the editor-package value imports into a web-view-only module + a **cold-start
  activation smoke, now a permanent QA requirement**. The prior six QA sessions had never re-run
  `activate()`.
- **QA run 2** (post-activation-fix) verified real wins — clipboard bytes NBSP-clean, popover
  Cancel/Save byte-clean (Tasks 14/14b live), power default, project-settings read path (papi
  `chapterVerseSeparator ':' ≠ registered '.'` proves the Settings.xml read), §7 blocks — but
  surfaced three failure clusters that jsdom cannot see: literal `\` force-settling ~190 ms after
  landing; Enter splitting before the menu; §7 CSS never ported to the extension's forked
  `_usj-nodes.scss`.
- **Fix wave round 1** falsified the "cross-frame blur nulls the selection" hypothesis (focus never
  left the editor while typing). True actor: **ScriptureReferencePlugin's async scrRef echo**
  re-entering `$moveCursorToVerseStart` and yanking the caret onto the marker glyph, which the engine
  read as a user departure and resolved the pending literal into a split. Also fixed Enter via a
  **capture-phase** trigger listener (Lexical dispatches Enter synchronously from its own
  bubble-phase keydown, so the window bubble handler ran too late), gated `\ip` on real intro
  context, and ported §7 to the forked scss.
- **Fix wave round 2** went **two falsifications deep** on the caret-ejection: the real in-app actor
  was the **BookNode "created" mutation listener** re-firing on every PDP echo-replace (`0412767`),
  compounded by the PDP echo-replace clobbering mid-typing text. Root fix: a **700 ms trailing
  debounce** on the keystroke-driven PDP saves (`5afaa4a292`) killed the echo storm at the source, and
  **fluent type-through went live** (the headline deliverable). A naive popover-Enter candidate
  (`onOpenAutoFocus={preventDefault}`) was **falsified live** and reverted (Radix autofocus is
  load-bearing for the into-popover handoff).
- **The wave review** (opus, both repos) approved the engine side across nine adjudications and
  caught one Important — the debounce lacked a flush/cancel lifecycle — fixed with
  `flushable-debouncer.util.ts` (flush on effect-cleanup keyed on book/chapter before the saver
  re-points; best-effort on blur/pagehide/beforeunload). It also corrected the "700 ms = PT9-parity"
  framing (no cited PT9 constant; chosen to kill the echo storm).
- **QA run 3 + fix wave round 3** closed the remaining live clusters: mid-word text loss (root cause
  in the ENGINE's caret-unbounded termination check, not the apply — fixed by caret-bounding);
  focused-palette keyboard (forwarding-driven fallback, since Lexical re-grabs root focus every
  reconcile); departure-settle never firing (the content-start caret sat in an exempted
  `marker-trailing-space` NBSP node); muted dimming (`tw:opacity-60` had no backing rule → inline
  style).
- **QA run 4 (final sweep)** confirmed all four round-3 clusters dead in-app and adjudicated the
  **type-through-split vs palette-retag** behavior pair as document-don't-fix (both PT9-faithful for
  their flow). One **navigation regression** surfaced and was traced to OUR round-2 latent
  `useEditorPdpSync` deferral swallowing different-document arrivals; the **final round** fixed it
  with a book|chapter identity gate, wired Enter-menu type-to-filter, and gave empty opaque blocks a
  `min-height`.

Net: every user-facing Phase 5 behavior is LIVE and in-app verified — fluent type-through, passive +
focused palettes, settle-on-departure, selection-wrap, Enter menu with filter, clipboard
normalization, power default, project-settings sourcing, §7 blocks, and popover Cancel/Save/wrapper.
The residuals are enumerated in the follow-ups register.

## Runtime QA method notes (carried forward)

- **Verify by editor STATE, not collapsed DOM** — standard-view notes render collapsed inline; the
  authoritative check is `root.__lexicalEditor.getEditorState().toJSON()`, before/after diff.
- **Cold-start activation smoke is now mandatory** after any change to the main-bundle import graph.
- **Propagation runbook** (`docs/superpowers/2026-07-03-paranext-propagation-blocker.md`): fresh
  `nx build platform-editor --skip-nx-cache` → `devpub` → `npm stop` →
  (`dotnet build ParanextDataProvider.csproj` if C# changed) → fresh `npm run build:extensions` →
  `refresh.sh`. `--watch` does NOT re-emit on a same-version yalc swap; a fresh `build:extensions`
  does. A **foreign yalc push on 2026-07-06 overwrote the worktree's linked dist** mid-project —
  re-devpub + fingerprint-verify the linked dist as a standing precaution during multi-branch work.
- **Synthetic input:** raw `\` never reaches Lexical in-app (the extension intercepts the keydown);
  drive marker typing via `document.execCommand("insertText", …)` (native `beforeinput`); avoid
  `browser_type` without `slowly:true` (it `.fill()`s and wipes the Lexical doc). The book-row →
  chapter-cell → verse-cell chain is not conclusively drivable via synthetic CDP (cmdk/Radix
  semantics) — referred to human QA.

## Known limitations carried forward

All of them — engine/OT, palette UX, popover/notes, host/extension, styling, process debt, and the
accepted PT9 divergences — live in the consolidated register:
**`docs/superpowers/specs/2026-07-07-standard-view-followups.md`.**

The user-facing subset (for the Product Owner) is in
`docs/superpowers/specs/2026-07-04-standard-view-pt9-ux-differences.md`; the simple-mode team's
subset is in `docs/superpowers/specs/2026-07-04-standard-view-simple-mode-impact.md`.

## Handoff pointers — what a post-project pass should pick up first

1. **Popover Enter → `\fp`** — PO-visible; evidence + a falsified candidate are in the follow-ups
   register (§3). FootnoteEditor should re-assert `selectNote(0)`+focus after Radix autofocus settles.
2. **Caller-click popover open (pane hidden)** — pre-existing Phase 4; one instrumented click pins
   which gate returns early.
3. **Human QA of the cell-click BCV navigation chain** — the only Phase-5 verification not
   machine-drivable; the submit+reload pipeline itself is verified healthy.
4. **Abandonment-window / host-save resolve-all policy** — the sharpest correctness edge
   (mid-rename glyph serialized stale on save); small, removes a latent class.
5. **`LoadStatePlugin` reload cluster** (PT-3890/PT-3797/PT-3909) — coordination item whose exposure
   the power-mode default raised.

## Final state

- **Library** `scripture-editors` branch `standard-view` HEAD **`1e9f46d`** — whole-repo gates green
  cache-bypassed (shared 166, shared-react 1088/2skip, platform-editor 376/3skip, scribe 2);
  typecheck/lint/format/extract-api clean.
- **Extension** paranext worktree `standard-view` HEAD **`da1c8e9e7f`** — extension suite 210,
  renderer overlays 184, `c-sharp` 1317/6skip; typecheck/lint/`build:extensions` clean.
- Neither repo pushed by this wrap-up task (push is a separate owner-approved step).
