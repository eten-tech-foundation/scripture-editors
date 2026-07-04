# Standard View Phase 5 — Extension wiring + menus (design)

**Date:** 2026-07-04 (brainstormed with the owner; all contested decisions individually approved)
**Parent design:** `docs/superpowers/specs/2026-07-01-standard-view-design.md` §5.4 (menus), §7 (opaque
blocks), §9 (extension wiring), §12 (Phase 5 sequencing)
**Handoffs consumed:** `2026-07-02-standard-view-phase2-notes.md` "What Phase 5 needs";
`2026-07-04-standard-view-phase4-notes.md` "Phase 5 handoff pointers"
**Repos:** library `scripture-editors` branch `standard-view` (Part A); extension worktree
`/home/lyonsm/paranext-core-standard-view` branch `standard-view` (Part B). PT9 C# at
`/home/lyonsm/Paratext` is read-only reference; PT9 parity governs over plan letter.

## Scope

Phase 5 is the final phase: marker-creation affordances (context-aware `\`-menu with a
StyleInfo-backed filtering API, Enter paragraph-style menu), clipboard normalization wiring,
power-mode default view, opaque-block rendering (§7), project-settings sourcing for note
callers/separators, a passive command-palette mode in the paranext-core overlay service
(§1.6), three bug/hazard fixes, hygiene, two communication deliverables (§11), and — as the
project's final phase — a mandated wrap-up pass that publishes the consolidated all-phases
follow-up register (§10). Out of scope: Ctrl+K insert-verse-number
(no host command exists in paranext-core — verified; creating one is a new PT9-port feature),
zoom (host decision pending), formatted-view project CSS (stays standard-only; PO/host follow-up),
Mac Cmd+T, OT coordinate unification (Tasks 14/15 constraint — `OTCoordinateSystem` in
`delta-common.utils.ts` is split by design and must not be casually changed).

## Approved decisions

1. **Menu ownership split ("extension keeps trigger"):** the library ships a pure, headless
   item-source API (PT9 `MarkerItemSource` port) plus `EditorRef` context/apply methods; the
   extension owns the in-app triggers (window keydown) and renders via the Platform.Bible
   **overlay service** (`papi.overlays.showCommandPalette`) because overlays painted inside a
   sandboxed WebView iframe are clipped at its bounds. No `onMarkerMenuRequest` EditorOptions
   seam. The library-side menu plugin becomes a **QA-only harness** (marked as such in doc
   comments; not polished; not maintained for production — P10 is the only production consumer).
2. **Document-first backslash (PT9 model) via a PASSIVE palette:** with a collapsed caret,
   typed `\` is not `preventDefault`ed — it lands as literal text, and subsequent marker
   characters keep landing in the document exactly as in PT9; the palette is a non-focusable
   assist overlay (§1.6) whose filter mirrors the literal run after the `\`. Space closes the
   palette and lands — Tier 2 then resolves the typed marker on termination, byte-for-byte
   PT9's Space-commit outcome; `*` closes likewise; Escape just closes (text stays — spec §5.4
   verbatim); Enter/click selects from the palette (structural insert + literal-prefix
   cleanup). With a non-collapsed selection the trigger IS `preventDefault`ed and a focused
   palette is used (PT9 wrap-selection model; §1.3). PT9 veterans' fluent `\q1<space>`
   type-through works unchanged; Escape is never required. Remaining divergences are cosmetic
   (§9): the palette paints in the renderer's top-level document, and rows don't preview each
   style's own font/color the way PT9's WinForms grid does.
3. **Enter menu preselection = PT9 SmartEnter choice:** `\ip` when valid at the position, else
   `\p` (PT9 `KeyPressEditHandler.InsertEnter`, `KeyPressEditHandler.cs:189-201`) — NOT
   clone-current-marker. Implemented by ORDERING the SmartEnter choice first (the palette
   highlights the first item; Enter-Enter is the fast path). No overlay-service API change.
4. **Clipboard = handler-side fix:** `MarkerEditPlugin`'s existing COPY/CUT registrations, on a
   `null` event, build the normalized payload and call `copyToClipboard(editor, null, data)`,
   returning `true`. Zero call-site changes. Rationale: `@lexical/clipboard`'s
   `copyToClipboard(editor, null)` registers a one-shot `COPY_COMMAND` handler at
   `COMMAND_PRIORITY_CRITICAL` that intercepts the synthesized real event ABOVE our HIGH handler
   and writes the stock payload — so the in-app null-payload dispatch chain can never reach
   `$handleCopyForStandardView` (this is why Task 15 QA saw the stock path win). The `data`
   parameter bypasses that: Lexical writes exactly the payload we hand it, via its own
   execCommand mechanism (works in sandboxed iframes without permission grants, identical on
   Windows/Linux/macOS). Native context menu stays suppressed in all views; the custom menu's
   Copy/Cut become functional-normalized through the same fix.
5. **Formatted-view project CSS: stays standard-only.** Recorded follow-up.
6. **Scope triage: all four bundles IN** — opaque-block §7 rendering; nodeOptions settings
   sourcing; bug/hazard fixes (OnSelectionChangePlugin read hazard, popover Cancel residual,
   popover wrapper-para glyph artifact); cheap hygiene (scribe CommandMenuPlugin gate, CLAUDE.md
   Lexical version, bare `.status_*` CSS consolidation, `\fq`/`\xq` quotation test).
7. **Power default:** web views with `interfaceMode === 'power'` and no saved `viewType` default
   to `'standard'`; saved state always respected; simple mode unchanged.
8. **Passive palette API shape (owner-decided after design discussion):** a `passive?: boolean`
   flag on the existing `CommandPaletteRequest` — NOT a sibling method — plus webViewId-keyed
   driver methods `updateCommandPalette(webViewId, { filterText?, moveSelection? })`,
   `commitCommandPaletteSelection(webViewId)`, `dismissCommandPalette(webViewId)`. Rationale:
   passive mode has the SAME lifecycle/outcome contract as active (`showCommandPalette` still
   resolves with the selected id or `undefined`); it only adds an input channel, and the
   service's one-palette-per-WebView invariant makes `webViewId` a sufficient handle — one
   method, one host/store path, request/item shapes shared by construction. Concurrent palettes
   per webview are explicitly not needed (focus is singular; replace-on-new-request already
   yields correct UX if the popover and main editor race); if that invariant ever changes, an
   ID-returning variant can be added compatibly. `filterText` updates are passive-only;
   `dismissCommandPalette` is valid for both modes.

## 1. Marker menu system

### 1.1 Item-source API (library, platform package)

New `packages/platform/src/editor/markerMenu/markerItemSource.ts` (name indicative), exported
from the platform package barrel:

```ts
interface MarkerMenuContext {
  source: "paragraph" | "character";     // chosen per PT9 HandleBackslash (see 1.2)
  paraMarker?: string;                    // current paragraph's marker
  previousParaMarkers: string[];          // forward-ordered para markers before the caret (stack replay)
  openCharMarkers: string[];              // currently open char spans, innermost first
  noteMarker?: string;                    // set when the caret is inside a note's content
  hasTextSelection: boolean;
}
interface MarkerMenuItem {
  marker: string;                         // e.g. "q1", "ft*", "+wj*"
  kind: "paragraph" | "character" | "note" | "closeTag";
  description?: string;                   // StyleInfo description
  isBasic: boolean;                       // ordering + host greying
}
function getMarkerMenuItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[];
function getEnterMenuItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[];
```

PT9 `MarkerItemSource` port (`ParatextBase/ScriptureEditor/MarkerItemSource.cs:77-199`), fidelity
points, each pinned by a unit test:

- **Paragraph source:** nothing inside notes (`:173`); otherwise replay `previousParaMarkers`
  through the occursUnder+rank stack logic and offer every paragraph style valid on the resulting
  stack (`GetValidParagraphTags` `:183-199`). Reuse/extract the existing canonical interpreter
  `isParagraphTagValid` (`packages/platform/src/editor/markerEdit/markerValidation.utils.ts:45-63`,
  already a `TagValidator.cs:18-57` port) rather than re-porting.
- **Character source:** requires `paraMarker` (else empty); char styles offered when
  `occursUnder` is empty or contains `paraMarker` (`:142-144`). Inside a note: only char styles
  whose `occursUnder` contains `noteMarker` (`:114-119`) — this is what makes the FootnoteEditor
  popover menu offer `fr/fq/ft` under `f`.
- **Note styles:** character source only, and only when NOT inside a note (`:130-135`).
- **Close-tag entries first:** one per open char span, innermost first, `+`-prefixed endmarker
  when not the outermost (`:149-159`).
- **Character-empty → paragraph fallback** (PT9 FB 21054, `MarkerDropdownEditHandler.cs:118-127`):
  folded INTO `getMarkerMenuItems` — if the character source yields zero items, recompute as
  paragraph source.
- **Strips (PT9-verified):** for a normal project PT9's popup passes `IncludeSpecialStyles =
  true` (`UsfmSinglePaneControl.cs:298-309` — the `id/c/cl/v` strip only applies to Study Bible
  additions books, out of scope per parent §13), so `c`/`v`/`cl` ARE offered — inserting `\v`
  from the popup is a real PT9 flow, and `markerActions` already supports `c`/`v`
  (`usj-marker-action.utils.ts:53-78`). Unconditional skips: `zpa*`
  (`MarkerDropdownControl.cs:100-102`) and — adapted divergence, recorded — `id` (and any
  entry `isUsjMarkerSupported` refuses), since our structural insert path doesn't support it.
  PT9 does NOT filter deprecated markers — match PT9 (do not filter; record).
- **Ordering:** within groups, basic-before-nonbasic then natural alphanumeric (`TagComparer`
  `:201-294`, `s2 < s10`); globally, stable basic-first (`:101`). `isBasic` per PT9 =
  description contains `"(basic)"` (`ScrTag.cs:425`) — plan verifies `defaultStyleInfo`/project
  descriptions carry this; if absent, degrade to plain natural sort (record).
- `getEnterMenuItems` = paragraph source with the SmartEnter choice (`ip` if valid on the stack,
  else `p`) moved to the front (decision 3).

Data source: `styleInfo ?? defaultStyleInfo` (consumer's responsibility, matching
`MarkerValidationPlugin`'s effective-sheet pattern).

### 1.2 EditorRef surface (library)

Two additions to `EditorRef` (`packages/platform/src/editor/editor.model.ts` /
`Editor.tsx`; re-exposed by `Marginal.tsx`):

- `getMarkerMenuContext(): (MarkerMenuContext & { anchorRect?: DOMRect-like }) | undefined` —
  cheap synchronous selection read. Source selection per PT9 `HandleBackslash`
  (`MarkerDropdownEditHandler.cs:96-139`): caret at a paragraph's content start (immediately
  after the marker prefix glyphs) → `paragraph`; mid-text → `character`; non-collapsed
  selection → `character`. Also reports `noteMarker` (caret inside expanded note content) so
  the extension can route Enter correctly, and the caret rect (iframe-relative) for palette
  anchoring. Returns `undefined` when unavailable (readonly, no selection).
- `applyMarkerMenuSelection(item: MarkerMenuItem, opts: { trigger: "backslash" | "enter";
  literalPrefixLanded: boolean })` — single history entry each:
  - `backslash` + open/note kinds: when `literalPrefixLanded` (collapsed-caret trigger), delete
    the literal trigger prefix — the contiguous run of `\` + marker characters
    (letters/digits/`+`/`*`) immediately preceding the caret in the anchor text node (covers
    fast-typed chars that raced in before the palette focused; no-op when absent) — then run
    the existing structural insert (`getUsjMarkerAction(...).action`,
    `usj-marker-action.utils.ts:91`; notes go through `$insertNote` and trigger the host's
    `openFootnoteEditorOnNewNote` as today). When the trigger had a non-collapsed selection
    (`literalPrefixLanded: false` — see 1.3), no prefix cleanup; a char-kind selection wraps
    the selected text via the action's existing `$wrapTextSelectionInInlineNode` path
    (`usj-marker-action.utils.ts:139`) — PT9's wrap-selection outcome
    (`MarkerDropdownControl.cs:267-275`).
  - `closeTag` kind: terminate the innermost open span whose endmarker matches the item (the
    `+` prefix is display-only nesting notation) at the caret via the existing char-span split
    machinery (Phase 2 Ctrl+Space `$splitCharAtCaret`-class utilities), not re-tokenization.
  - `enter` trigger: delegates to `splitParagraphWithMarker`.
- `splitParagraphWithMarker(marker: string)` — performs the paragraph split at the current
  selection and injects the CHOSEN marker prefix into the new paragraph (sets the new para's
  marker + visible prefix via the `$injectMarkerPrefix`/`$createMarkerPrefix` path,
  `markerEditDeletion.utils.ts:23-36`), caret after the prefix, one history entry.

The existing `INSERT_PARAGRAPH_COMMAND` HIGH handler + `splitExpected` clone-marker path
(`MarkerEditPlugin.tsx:190-197` → `markerEditDeletion.utils.ts:38-47`) **stays as-is** — it is
the fallback for paragraph inserts that don't come from the wired keydown (paste-of-newline,
IME, hosts that don't implement the Enter menu).

### 1.3 Extension wiring — main editor (Part B)

In the web view's existing keydown effect (`platform-scripture-editor.web-view.tsx:1218-1294`),
standard view only (`viewType === 'standard'`; other views unchanged):

- **`\` branch (`:1225-1238`) reworked, split by selection shape (PT9 parity):**
  - **Collapsed caret (document-first, PASSIVE palette):** do NOT `preventDefault` — the `\`
    lands as literal text and the palette opens with `passive: true` (§1.6); the editor keeps
    focus throughout. While open: marker characters and Backspace are NOT intercepted (they
    land in the document); the filter mirrors the literal run after the `\`, read from editor
    state on each commit (update listener — robust to IME/fast typing by construction);
    ArrowUp/ArrowDown are intercepted → `updateCommandPalette(..., { moveSelection })`; Enter
    is intercepted → `commitCommandPaletteSelection` (show promise resolves with the id);
    Space and `*` are NOT intercepted (they land) and dismiss the palette (PT9's Space-commit
    and `*`-close outcomes arrive via Tier 2 on termination); Escape dismisses (text stays).
    `literalPrefixLanded: true`.
  - **Non-collapsed selection (wrap case, FOCUSED palette):** DO `preventDefault` — letting
    the `\` land would REPLACE the selection the user wants wrapped; PT9 keeps the selection
    and wraps it on commit (`MarkerDropdownEditHandler.cs:130-137`,
    `MarkerDropdownControl.cs:267-275`). Character source; standard autofocused palette
    (typing filters it; nothing lands in the doc); on dismiss the selection is intact; restore
    editor focus after resolve/dismiss. `literalPrefixLanded: false`.
  - Both: read `editorRef.getMarkerMenuContext()`; build items via
    `getMarkerMenuItems(styleInfo ?? defaultStyleInfo, ctx)`; map `MarkerMenuItem[]` →
    `CommandPaletteItem[]` (marker → `id`/`label`, description → `description`, close tags
    grouped first, `isBasic:false` → visual de-emphasis via `group`/`badge` as fits);
    `papi.overlays.showCommandPalette({ items, anchor: ctx.anchorRect, passive })`
    (`overlay.service-model.ts:230-233`; anchor coords are iframe-relative by contract —
    `:65-70`). On resolve with an id → `editorRef.applyMarkerMenuSelection(item,
    { trigger: 'backslash', literalPrefixLanded })`; on `undefined` (dismiss/Escape/Space) →
    nothing further (whatever landed is the document's truth; Tier 2 owns it).
  - **Focus/blur:** the passive path never blurs the editor (no focus steal), which removes
    the blur-vs-pending-marker interplay from the main flow entirely. The focused-palette
    cases (wrap here; Enter menu below) do blur, but nothing pending has landed in those
    cases; restore editor focus after resolve/dismiss (PT9 returns focus to the document).
- **New Enter branch (plain Enter only — Shift/Ctrl/Alt+Enter untouched):** consult
  `getMarkerMenuContext()` FIRST — if `noteMarker` is set, pass through (Phase 3 `\fp` path,
  `$handleEnterInNote`, must keep working); otherwise `preventDefault()` and show the palette
  with `getEnterMenuItems` (SmartEnter choice first).
  On resolve → `editorRef.splitParagraphWithMarker(marker)`; on dismiss → nothing (Enter
  cancelled — spec §5.4). Scoped like the `\` branch: `document.activeElement === editorInput`,
  not read-only.
- **Item source swap for other views:** `generateInlineMarkerMenuListItems`
  (`platform-scripture-editor.utils.ts:419-459`) re-sourced from the exported filtering API in
  contextMarker-only character/paragraph mode (replacing the static
  `usfmMarkers[parentMarker].children` at `:429-433`), keeping its existing interception model
  and `editorRef.insertMarker` insertion (`:451`). Closes the Phase 4 handoff item.

### 1.4 FootnoteEditor popover (lib/platform-bible-react + web view)

- Replace the Task 14 gate (`footnote-editor.component.tsx:509`): in editable marker mode the
  doc-keydown no longer swallows `\` — it applies the same 1.3 selection-shape rule (collapsed:
  passive palette + key forwarding, driven from the popover's own inner editor; selection:
  preventDefault + focused wrap) via a new optional prop family provided by the web view
  wrapping the palette and its drivers (e.g. `markerPalette?: { show(items, anchorRect,
  passive), update(...), commit(), dismiss() }`); non-editable popover behavior unchanged.
- The web view provides `showMarkerPalette` wrapping `papi.overlays.showCommandPalette` (same
  webViewId, same iframe origin — anchors stay valid). The FootnoteEditor builds
  context/items from ITS OWN inner `editorRef` (`getMarkerMenuContext` reports the in-note
  character source) and applies selections via that same ref. Enter inside the popover keeps the
  direct `\fp` insert (no menu).
- `lib/platform-bible-react/dist` is tracked — rebuild + commit as in Phase 3/4.

### 1.5 Library QA harness (Part A, QA-only)

Rework `UsjNodesMenuPlugin` (`libs/shared-react/src/plugins/usj/UsjNodesMenuPlugin.tsx`) for the
editable-marker mode branch only (non-editable demo behavior unchanged; existing
`scrRef && !hasExternalUI` mount gate stays, so it never mounts in P10):

- Document-first trigger (`\` lands; menu opens without preventDefault) for a collapsed caret,
  preventDefault + wrap for a non-collapsed selection (same 1.3 rule); items from the same
  item-source API + `defaultStyleInfo`/`styleInfo`, apply via the same internal `$`-functions
  backing `applyMarkerMenuSelection`; an Enter interception (HIGH, ahead of MarkerEditPlugin's)
  driving `splitParagraphWithMarker` for demo QA of the Enter flow. Query capture by the
  existing `NodeSelectionMenu` is acceptable (mirrors the palette's focus model).
- **Marked QA-only** in doc comments: not production UI, no completeness/maintenance guarantee,
  no polish beyond what QA needs. P10 renders via the overlay service (decision 1).

### 1.6 Overlay service: passive palette mode (Part B, paranext-core renderer)

Additive change; no existing overlay callers or behavior touched (decision 8):

- `CommandPaletteRequest` gains `passive?: boolean` (`overlay.service-model.ts:118-136`). Same
  request/item shapes and the same return contract for both modes: `showCommandPalette`
  resolves with the selected item id, or `undefined` on dismissal.
- New webViewId-keyed driver methods on `IOverlayService` (the one-palette-per-WebView
  invariant is the handle): `updateCommandPalette(webViewId, { filterText?: string;
  moveSelection?: number })` (filterText passive-only; no-op when none active),
  `commitCommandPaletteSelection(webViewId)` (resolves the show promise with the highlighted
  item's id), `dismissCommandPalette(webViewId)` (resolves `undefined`; valid for both modes).
  Exposed through the same `papi.overlays` registration; `papi.d.ts` regenerated.
- Store: the `commandPalette` `OverlayEntry` gains mutable `filterText`/`selectedIndex`
  (precedent: popover's mutable `content` + `updateOverlayContent`, `overlay-store.ts:124`).
- Component (`overlay-command-palette.component.tsx`): passive mode renders no `CommandInput`
  and never calls `focus()` (`:183` is the only focus steal; anchored mode already
  `preventDefault`s open-autofocus, `:260-261`); items filtered by marker-prefix on
  `filterText`; highlight driven by `selectedIndex`; grouped-list rendering reused.
- Deliberately omitted: concurrent palettes per webview (focus is singular; the existing
  replace-on-new-request rule already yields correct UX if the popover and main editor ever
  race — the older palette's promise ABORTs and its trigger text simply stays literal). An
  ID-returning variant remains a compatible future addition if that invariant ever changes.

## 2. Clipboard normalization (decision 4)

- Extract the payload builder from `$handleCopyForStandardView`
  (`whitespaceDisplay.plugin.utils.ts:33-49`) into a shared
  `$getStandardViewClipboardData(editor)` returning `{ "text/plain" (NBSP→space inverted),
  "text/html", "application/x-lexical-editor" }` — logic exists once.
- `MarkerEditPlugin`'s COPY/CUT registrations (`MarkerEditPlugin.tsx:150-159`): on a real
  `ClipboardEvent`, unchanged path; on `null`, build the payload, call
  `copyToClipboard(editor, null, data)` (verify exact `LexicalClipboardData` shape against
  `@lexical/clipboard@0.43` at plan time), for CUT remove the selected text after the copy
  settles, and return `true`.
- No changes to `ClipboardPlugin`, `ContextMenuPlugin`, or `EditorRef.copy/cut` — all present
  and future null-payload dispatchers get normalization; other view modes fall through to
  RichText bit-identically; user impact: in-app copies stop leaking U+00A0 (which could
  materialize as literal `~` when pasted back into Paratext).

## 3. Power-mode default view (decision 7)

`platform-scripture-editor.web-view.tsx:348`: `useWebViewState('viewType', isPowerMode ?
'standard' : 'formatted')`. Saved `viewType` is respected automatically (`main.ts:496-511`
spreads saved state). Plan-time care: `useSetting('platform.interfaceMode','simple')` resolves
async (`:388-393`) — the default must not flash or persist `'formatted'` for a power-mode view
before the setting loads (defer initial render on the setting's loading state or equivalent).
The `changeScriptureView` cycle already includes `standard` (Task 8, `:940-956`).

## 4. Opaque-block rendering (§7)

Today `UnknownNode.createDOM()` hard-codes `display: none`
(`libs/shared/src/nodes/features/UnknownNode.ts:115-119`) — tables/figures/sidebars/`\periph`
content loaded as `UnknownNode` is INVISIBLE in every view, not a subdued block. Implement §7
for standard view, CSS-mode-gated so other views keep today's behavior:

- `createDOM` emits a class (+ `data-marker` for the lead marker) instead of inline
  `display:none`; static `usj-nodes.css` keeps `display:none` as the default rule and reveals
  it under the standard-view mode classes (`.marker-editable`) as a subdued read-only container:
  visible content, lead-marker label (e.g. `::before` from `data-marker`),
  `contentEditable=false`, whole-block selection/deletion only (Lexical semantics for
  non-editable element DOM verified at plan time with tests), caret navigation skips over it.
- `\optbreak` renders as an INLINE atomic `//` token, not a block (§7; PT9 renders it inline
  mid-sentence). Its current editor-state representation is verified at plan time (Phase 0
  corpus proves it round-trips; the rendering path may not be `UnknownNode`).
- Tier 2 exclusion already holds (sentinel handling); no engine change.

Acceptance (§7): loading/saving a book containing a table/figure/sidebar stays lossless in
standard view with edits elsewhere in the chapter — AND the construct is now visible/inert.

## 5. nodeOptions project settings

Replace the Task 12 TODO(phase5) fallbacks (`platform-scripture-editor.web-view.tsx:489-529`)
with real project settings. The generic C# read path already exists
(`ParatextProjectDataProvider.cs` `getSetting` `:124`, `ParametersDictionary` fall-through
`:1312-1334`) — no new C# read plumbing:

- Add PB↔PT name pairs in `c-sharp/Services/ProjectSettingsNames.cs` + registrations with
  defaults in `extensions/src/platform-scripture/contributions/projectSettings.json` (+ d.ts
  types): `platformScripture.chapterVerseSeparator` → `ChapterVerseSeparator`,
  `...verseRangeSeparator` → `RangeIndicator`, `...defaultFootnoteCaller` →
  `DefaultFootnoteCaller`, `...defaultCrossRefCaller` → `DefaultCrossRefCaller`. Registered
  defaults mirror ParatextData's (`ProjectSettings.cs:713,731-734,1300-1322`; note PT default
  chapter-verse separator is `.`).
- Caller SEQUENCES (`noteCallers`/`crossRefCallers`): expose the same way IF the corresponding
  Settings.xml keys exist (plan verifies exact ParatextData names, e.g. footnote/cross-ref
  caller sequence settings); otherwise keep library defaults and record.
- Web view: `useProjectSetting` reads replace the hard-coded fallbacks; snippet references and
  callers become project-correct.

## 6. Bug/hazard fixes

- **`OnSelectionChangePlugin` read hazard**
  (`libs/shared-react/src/plugins/usj/OnSelectionChangePlugin.tsx:19`): `editor.read(...)`
  inside the `SELECTION_CHANGE_COMMAND` handler force-flushes mid-dispatch — the enabler of the
  9b frozen-state crash class. Fix by reading without flushing
  (`editor.getEditorState().read(...)`) or deferring (9b `queueMicrotask` precedent); pin with
  a regression test.
- **Popover Cancel/deleteIfNew residual:** the delete path exists
  (`closeFootnoteEditor(true)` → `replaceEmbedUpdate(key, [])`, web-view.tsx:1516-1523) but
  Task 13 QA (pre-Task-15) observed Cancel leaving the fresh note. Task 15's `"apply"`
  coordinates may already have fixed it — re-verify in-app; fix any residual (e.g.
  `editingNoteKey` unset on the Ctrl+T path).
- **Popover wrapper-para glyph artifact:** `applyUpdate([noteOp])` inserts the note at OT
  index 0, BEFORE the popover wrapper para's `\p` glyph prefix, leaving the original glyph pair
  as trailing junk (phase4-notes limitation). Fix per the recorded candidates: insert after the
  para prefix, or drop the `PARAGRAPH_USJ` wrapper (`footnote-editor.component.tsx:139`).
  Display-only today; fix must not change the note-ops contract (Task 14).

## 7. Hygiene (rides along)

- Scribe: gate `<CommandMenuPlugin />` (`packages/scribe/src/editor/Editor.tsx:207`) off for
  `markerMode === "editable"` (port of the platform gate, `Editor.tsx:466-468`) — closes the
  recorded latent Task-15-class bug.
- CLAUDE.md: Lexical version 0.33.1 → 0.43.0.
- Consolidate redundant bare `.status_unknown`/`.status_invalid` rules
  (`packages/platform/src/usj-nodes.css:2299-2307`).
- Add the `\fq`/`\xq` quotation-branch test (Phase 3 carryover).

## 8. Testing and QA

- **Unit (library):** item-source port pinned against PT9 semantics (stack replay w/ rank,
  char occursUnder incl. in-note, notes gating, close-tag nesting/`+`/order, char-empty→para
  fallback, strips, basic-first + natural sort, SmartEnter-first for Enter items);
  `getMarkerMenuContext` (para-start vs mid-text vs selection vs in-note);
  `applyMarkerMenuSelection` (literal-prefix cleanup incl. raced chars, selection-wrap with
  selection preserved and NO prefix cleanup, close-tag split, single-undo);
  `splitParagraphWithMarker` (marker + prefix + caret + fallback path untouched); clipboard
  `$getStandardViewClipboardData` + null-dispatch handler (real-event path
  regression-pinned); passive-path no-blur invariant (editor keeps focus; filter mirrors from
  editor state incl. IME/fast typing) and focused-palette blur benign (nothing pending
  landed); `UnknownNode` visible-inert rendering + whole-block selection/deletion + mode
  gating; `OnSelectionChangePlugin` no-flush regression.
- **Extension/renderer:** typecheck/lint/build:extensions; renderer overlay tests for the
  passive palette mode (no focus steal, external filter/highlight drive, commit/dismiss,
  active-mode behavior regression-pinned); C# tests for the new settings names (existing
  `GetProjectSetting` test patterns).
- **All Nx gates `--skip-nx-cache`** (standing constraint).
- **Runtime QA in-app** (propagation runbook `docs/superpowers/2026-07-03-paranext-propagation-blocker.md`;
  verify by editor STATE, not collapsed DOM): `\`-palette at para start (paragraph list) and
  mid-text (char list, close tags first); fluent type-through `\q1<space>` yields a `q1`
  paragraph with focus never leaving the editor and following prose landing in the document;
  arrows+Enter palette-select inserts + cleans the literal prefix; Escape leaves literal text
  and Tier 2 settles it; selection-wrap keeps the selection; Enter menu with `\p`/`\ip` first,
  Enter-Enter fast path, Escape cancels; popover palette offers `fr/fq/ft` under `f` and literal `\` still reaches the
  popover editor; copy/cut normalization (clipboard BYTES checked for U+00A0 absence);
  power-mode fresh view defaults to standard + saved-state respected + cycle intact; opaque
  block visible/inert/lossless; settings-sourced separators/callers appear in inserted notes;
  caller-click-with-hidden-pane popover recheck (Task 13 open observation); popover Cancel
  removes fresh note; regressions: `\zfoo` split + status_unknown, `s1` red, Ctrl+T
  insert+auto-open (delta-doc path — MUST stay intact), popover Save in place, undo depth.

## 9. Non-goals and Phase 5 recorded divergences

Out of scope this phase: Ctrl+K insert-verse-number (PT9 rules documented: next verse from
bridge end, refuse at chapter/book boundary and duplicates — `UsfmSnippetInserter.cs:195-225`;
needs a host command first); zoom wiring (`UsjCssOptions.zoom` implemented, unused);
formatted-view project CSS (stays standard-only; PO/host follow-up); Mac Cmd+T; OT coordinate
unification (future collab work).

PT9 UX divergences accepted/recorded this phase (from the parity review):

- **Palette rendering cosmetics** (decision 2, post-passive): type-through, Space-commit,
  `*`-close, and Escape-leaves-text are all PT9 parity via the passive palette; what remains
  is cosmetic — the palette paints in the renderer's top-level document (outside the iframe),
  and rows don't preview each style's own font/color the way PT9's WinForms grid does
  (`MarkerItem` styling).
- **No marker-popup-off setting:** PT9 offers `UseMarkerPopup` (default on,
  `ScriptureView.cs:207`, user-toggleable); a matching PT10 user setting is a recorded
  follow-up.
- **Enter menu always shows** (parent spec §5.4): one extra keystroke per paragraph vs PT9
  SmartEnter's immediate `\p` (Enter-Enter reproduces the outcome). If POs prefer PT9's
  no-menu fluency, a direct-insert mode is a small later change.
- **Escape-on-Enter cancels the split entirely** (parent spec) vs PT9's non-SmartEnter path
  leaving the raw break in place.
- **Deprecated markers not filtered** from menus (exact PT9 parity — PT9 has no Exclude and
  does not filter `DEPRECATED*`).
- **`id` excluded from the palette** (PT9 offers it; our structural insert path doesn't
  support it — adapted).
- **`fig` from the menu inserts the char span without PT9's figure dialog** (dialog is a
  parent-§13 follow-up; PT9 popup special-cases `fig` → `insertFigure()`,
  `MarkerDropdownControl.cs:250-255`).
- **`isBasic` ordering degradation** to plain natural sort if stylesheet descriptions lack
  `"(basic)"` (plan verifies).
- **Study Bible additions flag branch** of PT9's popup (`IncludeSpecialStyles=false`,
  `AllowExtendedNotes=true` for SBA books) not implemented — Study Bible is parent-§13 out.

## 10. Consolidated follow-up register (all phases, as known at Phase 5 start)

Phase 5 is the final phase, so this register consolidates every open concern carried across
Phases 0-5. **A mandated Phase 5 wrap-up task re-sweeps this list** against phase execution
(new findings, items closed by Phase 5 work, plus a pass over `.superpowers/sdd/progress.md`
"Minor (final review triage)" entries from all phases) and publishes the final standalone
register as `docs/superpowers/specs/2026-07-XX-standard-view-followups.md` — the single
handoff document for post-project work — and finalizes the §11 communication deliverables.

**A. Marker-engine accepted limitations (by design or PT9-consistent; phase2-notes "Known
limitations"):** annotation `TypedMarkNode`s flattened by Tier 2 rebuilds (host-reapplied
overlay assumption); milestone attribute text live-edited but never re-tokenized; verses with
`sid`/alt/pub/unknownAttributes atomic in Tier 2; chapter junk-text edits fall back to the
stored number silently (no Tier 2 routing; chapters have no direct transform test); cross-node
space runs not collapsed; literal `~` → NBSP one-way; typed unknown markers (and `\esb`) stay
literal until reload (no structured `UnknownNode` from live typing); `rebuildAttempted`
byte-identical-content skip needs a direct re-edit to recover; pre-existing end-token laxity
vs PT9 (`usfmFragmentToUsj.ts` ~356-372); mid-typing marker interleaving in note content can
leave a stray unmatched closer; validation pass O(document)/commit (revisit for book-sized
docs); PT9 `vp*`/`va*` leading-space trim not replicated; popover para-level typing lands in
the skipped `marker-trailing-space` node; multi-para caret drift after literal-`\p` split
(cosmetic).

**B. Collab/OT (path never completed — owner context, Task 14):** `"apply"` vs `"delta-doc"`
coordinate split by design (`OTCoordinateSystem`, `delta-common.utils.ts`) + the editable
`VerseNode` delta-doc wrinkle — unification belongs to collab completion; book `\id` marker
glyph absent from editable delta ops (Phase 0/1 minor; confirm with collab adaptor owner).

**C. Popover/notes UX:** popover forces `noteMode: expanded` → `isStandardView()` false inside
it → §4 whitespace-display and copy-NBSP rules inactive on note content (needs an
`isStandardView`/`getViewMode` rework; Phase 3 Task 9 limitation); Mac Cmd+T shortcut;
expanded-state literal-caller path untested; footnotes-pane duplicate-note content-equality
ambiguity; no scroll-into-view for off-screen pane rows.

**D. Styling/StyleInfo:** zoom (`UsjCssOptions.zoom`) unused pending host decision;
formatted-view project CSS (PO); vendored-sty parser fields unexercised by sheet or tests
(`fontName`/`lineSpacing`/`subscript`/`notRepeatable` + no-StyleType skip); demo-only fallback
asymmetry (classification simplified table vs validation `defaultStyleInfo`); defensive
Unknown-entry divergence tokenizer-vs-guards; pathological `\+f` note token;
`MarkerValidationPlugin` styleInfo prop unmemoized upstream.

**E. Host/extension:** Ctrl+K insert-verse-number host command (PT9 semantics documented in
§9); `LoadStatePlugin` reload cluster (PT-3890/PT-3797/PT-3909 — coordination item, power
default raises exposure; parent design risk #2); caller-sequence settings if the Settings.xml
keys don't pan out (§5); verse-bridge `verseRangeSeparator` formula untested (no UI builds a
bridge ref).

**F. Parent design §13 register (unchanged, restated by reference):** AutoCorrect;
style-dropdown hardening; real table/figure/sidebar node types with in-place editing; editable
footnotes pane; note insert dialogs + caller renumbering; `\fe`/`\ef`/`\ex`; figure properties
dialog + `link:fig`/`link:ref`; ruby glossing; Study Bible; annotations-as-such; spell-check;
protected-resource copy caps; invisible-characters mode; PT9 origin-range/section-head note
options; Alt+X; cross-window current-verse highlighting; double-click trailing-space trim;
literal editing of `\ca`/`\cp`/`\va`/`\vp` runs.

**G. Phase 5's own recorded divergences:** the §9 list (palette rendering cosmetics, no
popup-off setting, Enter-menu keystroke, Escape-on-Enter, deprecated unfiltered, `id`
exclusion, `fig` no-dialog, `isBasic` degradation, SBA branch).

## 11. Communication deliverables

Two owner-requested documents ship with Phase 5 (drafted at spec time, finalized by the §10
wrap-up pass):

- **PO-facing PT9/PT10 UX differences** —
  `docs/superpowers/specs/2026-07-04-standard-view-pt9-ux-differences.md`: plain language, no
  code internals; per entry: situation / PT9 behavior / PT10 behavior / why / cost to make
  PT10 match. Covers every user-visible difference from Phases 0-5.
- **Simple-mode impact note** —
  `docs/superpowers/specs/2026-07-04-standard-view-simple-mode-impact.md`: what this project
  changes for `interfaceMode === 'simple'` users (two behavior changes: stylesheet-driven
  marker-menu items in formatted view; project-correct note callers/separators everywhere),
  the one decision that team owns (whether the view cycle keeps exposing Standard in simple
  mode — Task 8's cycle included it), and the list of standard-view-gated features that do
  NOT affect them.

## Key anchors (implementation)

Library: `useUsfmMarkersForMenu.ts:8,19` (static source being replaced in harness path);
`NodesMenu/index.tsx:21-24` (trigger preventDefault to remove in harness);
`Editor.tsx:435-444` (harness mount gate), `:319-334` (`insertMarker`), `:198-209`
(`EditorRef.copy/cut` — unchanged), `:166` (`createMarkerLookup` seam);
`usj-marker-action.utils.ts:53-209`; `MarkerEditPlugin.tsx:150-159` (COPY/CUT), `:190-197`
(INSERT_PARAGRAPH fallback); `markerEditDeletion.utils.ts:23-47`;
`whitespaceDisplay.plugin.utils.ts:33`; `markerValidation.utils.ts:40-95`;
`styleInfo.ts:30-111`; `defaultStyleInfo.ts`; `UnknownNode.ts:115-119`;
`usj-node-options.model.ts:20-48`; `usj-nodes.css:2299-2307`.
Extension: `web-view.tsx:214,1218-1294` (keydown), `:1164-1193` (menu items/show), `:348`
(viewType default), `:388-393` (interfaceMode), `:489-529` (nodeOptions), `:863-906` (options
memo), `:1516-1528` (closeFootnoteEditor), `:2158-2211` (popovers);
`platform-scripture-editor.utils.ts:419-459`; `footnote-editor.component.tsx:139,214-228,
504-533`; `overlay.service-model.ts:63-136,156-234`;
`overlay-command-palette.component.tsx:183` (autofocus); `ParatextProjectDataProvider.cs:124,
1209-1341`; `ProjectSettingsNames.cs`; `projectSettings.json`; `menus.json` (layout group, if
menu entries needed); `main.ts:1144-1146`.
PT9 reference: `MarkerItemSource.cs:20-294`; `TagValidator.cs:18-57`;
`MarkerDropdownEditHandler.cs:42-139`; `MarkerDropdownControl.cs:94-318`;
`KeyPressEditHandler.cs:178-211`; `SelectionStyleTagsImpl.cs:26-124`; `ScrTag.cs:425,463`;
`UsfmSnippetInserter.cs:195-225`; `ProjectSettings.cs:713,731-734,1300-1322`;
`UsfmSinglePaneControl.cs:287-311` (popup source flags: IncludeSpecialStyles true for normal
projects; onEnter = !SmartEnter && AllowsEnter); `ScriptureView.cs:207` (`UseMarkerPopup =
true` default).
