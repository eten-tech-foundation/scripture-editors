# Standard View — Phase 3 Implementation Plan (Footnote UX)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Standard view PT9-parity footnote UX: notes editable in the existing `FootnoteEditor` popover under the marker-editing engine, insertion snippets (`\`-menu / context menu / Ctrl+T / Ctrl+Shift+T) with PT9 semantics, data-driven callers, unclosed notes rendered expanded inline, Enter-in-notes → `\fp`, and a footnotes pane that can auto-show/hide (behind a PO-toggle setting) with caller-click focus.

**Architecture:** Phase 3 spans two repos joined by the platform-yalc flow. **Part A** (`scripture-editors`, branch `standard-view`) does the engine + insertion work in the editor library: a precondition refactor removing the reverse adaptor's module-level view-options singleton so a second editor instance (the note popover) can coexist; a note-scoped Tier 2 re-tokenization path (`$rebuildNoteContent`) that lifts the three `$isNoteNode` dead-zone guards left by Phase 2; unclosed-note expanded rendering; Enter→`\fp`; data-driven caller sequences (footnote a–z, cross-ref `†`, `-`→`*`); and PT9 snippet semantics threaded through `$createNoteChildren` via `UsjNodeOptions`. **Part B** (`paranext-core`, new branch `standard-view` off `main`, worked in a git worktree) consumes the rebuilt library over yalc, adds a `'standard'` view type, wires the footnotes-pane auto behavior behind a PO-toggle setting, adds caller-click pane-focus, and adds the context-menu / keyboard insertion entry points. The reverse adaptor stays the single source of truth for serialization; the `FootnoteEditor` popover already hosts a full `Editorial` editor, so most "threading" is making that second editor instance safe and functional, not building a new editor.

**Tech Stack:** TypeScript, Lexical 0.43 (`registerNodeTransform`, `registerCommand`, `$parseSerializedNode`, `DecoratorNode`), Vitest + @testing-library/react, Nx + pnpm (scripture-editors); Vite + React + Platform.Bible extension APIs + yalc (paranext-core). Repos: `/home/lyonsm/scripture-editors` (branch `standard-view`), `/home/lyonsm/paranext-core` (worktree off `main`). PT9 behavioral reference: `/home/lyonsm/Paratext` (read-only).

## Global Constraints

- **scripture-editors** work stays on branch `standard-view`. **paranext-core** work goes on a **new local branch `standard-view` off its `main`, in a git worktree** (never edit `/home/lyonsm/paranext-core` directly, never commit to `main`). **Never push either repo.** `/home/lyonsm/Paratext` is read-only PT9 C# reference — never modify.
- **ALL verification gates run with `--skip-nx-cache`** — the Nx cache produced false greens repeatedly in Phase 2. `pnpm nx test <project> --skip-nx-cache`, likewise `lint`/`typecheck`/`format:check`/`extract-api`.
- Nx project names: `shared` = `libs/shared`, `shared-react` = `libs/shared-react`, `@eten-tech-foundation/platform-editor` = `packages/platform` (plain `platform` is the demo app; `nx dev platform` serves it at `localhost:5173`), `utilities` = `packages/utilities`. Only `@eten-tech-foundation/platform-editor` and `utilities` have `extract-api` targets. File filter: `pnpm nx test <project> --skip-nx-cache -- <file-substring>`.
- `libs/shared` uses nodenext resolution: relative imports in `shared` tests need explicit `.js` extensions; `packages/platform` and `shared-react` resolve extensionless. Repo lint bans non-null assertions (use throw-guard + const-capture — `let` narrowing does not survive into closures) and raw NBSP in regex literals (use ` ` escapes).
- Code style: prefer `undefined` over `null`; construct Lexical nodes via `$create<X>Node` / `$create<X>Nodes` helpers; **never call `editor.update()` from inside a listener** (commands/transforms run inside the update and are fine); in Lexical tests chain `.append(...)` inside `$getRoot().append(...)` per repo CLAUDE.md.
- `<*Plugin />` children in `packages/platform/src/editor/Editor.tsx` are ordered alphabetically within the block that starts at `ActiveTextPlugin`.
- `docs/superpowers/` is gitignored — `git add -f` for files under it. The lint-staged prettier hook may print FAILED lines for those paths; the commit still succeeds — verify with `git log -1 --stat`.
- Commit messages end with **exactly** these two trailer lines:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ
  ```
- Cross-repo bridge: `cd packages/platform && pnpm devpub` builds + `yalc push`es `@eten-tech-foundation/platform-editor`; in paranext-core `npm run editor:link` consumes it (both `lib/platform-bible-react` and `extensions/src/platform-scripture-editor` depend on it at `~0.8.14`; the yalc-linked copy is currently `0.8.15`, pre-standard-view). Part B cannot begin until Task 7 (Part A build/push) is done.

## Key facts verified during planning (do not rediscover)

- **Reverse adaptor singleton (task zero target).** `editor-usj.adaptor.ts` holds `let _viewOptions` (line 77), set only by `initialize(logger, viewOptions?)` (line 79, called at `Editor.tsx:182`), read only via `isStandardView()` (line 86) which is consulted in `createCharMarker()` (line 190) and `recurseNodes()` TextNode branch (lines 448–450). `deserializeEditorState(editorState)` (line 89) → `deserializeSerializedEditorState(serialized)` (line 95). Neither takes viewOptions. Production deserialize callers: `Editor.tsx:229`, `Editor.tsx:369`. The **forward** adaptor `serializeEditorState(usj, viewOptions?)` already threads viewOptions per-call (sets `_viewOptions` at the top of each synchronous call, line 168) and is call-safe; the **reverse** adaptor is the genuine init-latched singleton corrupted by a second editor.
- **`shared-react` view exports** (all re-exported from package root): `ViewOptions`, `MarkerMode` (`"visible"|"editable"|"hidden"`), `NoteMode` (`"collapsed"|"expandInline"|"expanded"`), `getViewMode`, `getViewOptions`, `getDefaultViewOptions`, `STANDARD_VIEW_MODE` (`"standard"`), `FORMATTED_VIEW_MODE`, `PARAGRAPH_STRUCTURE_VIEW_MODE`. `@eten-tech-foundation/platform-editor` re-exports `getViewOptions`, `getDefaultViewOptions`, `getViewMode`, `STANDARD_VIEW_MODE`, `PARAGRAPH_STRUCTURE_VIEW_MODE`, `viewModeToViewNames` from its `index.ts`.
- **Note-scope dead-zone guards to lift (Phase 2 left these):**
  - `$requestTier2ForNode` (`tier2Rebuild.utils.ts:417-432`) — line 424 `if ($isNoteNode(current)) return; // note content is its own scope (Phase 3)`.
  - `$textNodeTier2Transform` (`markerEditTier2Trigger.utils.ts:20-52`) — `$isNoteNode(parent)` in the `||` skip-list at lines 31-37.
  - `$displayWhitespaceTransform` (`whitespaceDisplay.plugin.utils.ts:22-42`) — `$isNoteNode(parent)` in the same skip-list at lines 31-37.
  - **Keep** the atomic-sentinel treatment of a NoteNode inside a *paragraph* rebuild: `isRebuildSentinel` (`tier2Rebuild.utils.ts:112-118`) and `$appendChildrenFragment` (`tier2Rebuild.utils.ts:189-190`). A note survives an *outer* paragraph rebuild by identity; a note-scoped rebuild is the *inner* path.
- **Tier 2 rebuild anatomy to mirror for `$rebuildNoteContent`:** `$rebuildParas` (`tier2Rebuild.utils.ts:329-414`) → `$buildParaFragment` (216-229) → `$appendChildrenFragment` (179-214) → `pushSentinel`/`ATOMIC_SENTINEL` (67-76 / 41) → tokenizer `usfmFragmentToUsjContent` → `serializeEditorState(...)` (386) → `$parseSerializedNode` → `$replaceSentinels` (232-263) → symmetry guard `countSentinels` (266-276) → fixed-point guard `$signatureOf`/`$appendSignature` (173-177 / 136-171) → `$restoreSelectionAtOffset` (287-327). **Caveat:** the serializer emits `root → para → content`; a note fragment's loose char content is wrapped in a default `\p` (`PARA_MARKER_DEFAULT`), so `$rebuildNoteContent` must **unwrap the para** and splice its children into the note.
- **NoteNode** (`libs/shared/src/nodes/usj/NoteNode.ts`): `__isCollapsed` (line 60), `setIsCollapsed`/`getIsCollapsed` (151-168), `createDOM` picks `collapsed`/`expanded` class from `__isCollapsed` (194-204), `updateDOM` full-replaces on collapse flip (206). `isValidMarker` valid set = `f, fe, ef, efe, x, ex` (21-33). **`fp` is a CHAR marker, not a note marker.** Constructor caller default (74-75): `caller ?? (marker === "x"||"ex" ? HIDDEN_NOTE_CALLER : GENERATOR_NOTE_CALLER)`. `GENERATOR_NOTE_CALLER="+"`, `HIDDEN_NOTE_CALLER="-"` (`node-constants.ts:22,27`).
- **`isCollapsed` is decided by `noteMode`, NOT by `closed`.** `createNote` (`usj-editor.adaptor.ts:452`) and `$createWholeNote` (`node-react.utils.ts:242`) both compute `isCollapsed = noteMode !== "expanded"`. The tokenizer sets `note.closed = "false"` on unterminated notes (`usfmFragmentToUsj.ts:256-260`); `closed` survives as an unknown attribute (not in `NOTE_MARKER_OBJECT_PROPS`). "Unclosed → expanded" does **not** exist yet.
- **Enter / paragraph split** (`MarkerEditPlugin.tsx`): `KEY_ENTER_COMMAND` handler (167-175) returns `$isSelectionInMarkerNode()` to swallow Enter inside marker glyph text, else `false` → Lexical dispatches `INSERT_PARAGRAPH_COMMAND` (176-183) which sets `context.splitExpected.current = true`. NoteNode `isInline(): true`, so a paragraph split inside a note is structurally invalid — Enter-in-note must intercept at `KEY_ENTER_COMMAND` and return `true`.
- **Caller node** (`libs/shared-react/src/nodes/usj/ImmutableNoteCallerNode.tsx`): `DecoratorNode`, `decorate()` (175-200) renders `<button onClick={onClick} title={previewText} data-caller-id=…>`; label is `""` (CSS-generated) when `caller==="+" && collapsed`, else the literal `__caller`. `onClick` = `nodeOptions.noteCallerOnClick` (a no-op in the platform demo; **wired in paranext** at `platform-scripture-editor.web-view.tsx:438-458`). The `title` attribute is the hover tooltip (native, ~500 ms browser delay). `data-caller="+"` collapsed callers get their glyph from CSS `@counter-style note-callers` (`usj-nodes.css:2180-2201`), whose symbols `NoteNodePlugin.useNodeOptions` rewrites at runtime from `nodeOptions.noteCallers` (`NoteNodePlugin.tsx:79-91`, `updateCounterStyleSymbols` 422-451). There is **no** cross-ref sequence, no `†`, no `-`→`*` today. `-` (HIDDEN) renders as literal `-`.
- **Insertion already exists** (no snippet abstraction, no Ctrl+T): `$insertNote` (`node-react.utils.ts:129-150`) → `$createNoteChildren` (175-220) builds `\fr chap:verse` (hardcoded `:`), optional `\fq`/`\xq` from `selection.getTextContent().trim()` (no marker stripping, no `\+fv`), and a `\ft`/`\xt` placeholder; `$insertNoteWithSelect` (158-173) selects the last char child (`\ft`/`\xt`) when the note is inserted expanded — so **caret-lands-after-`\ft` already works when the note is expanded**. `getUsjMarkerAction` (`usj-marker-action.utils.ts:91-117`) routes note markers to `$insertNote`; `EditorRef.insertMarker("f")` (`Editor.tsx:312-327`) is the imperative entry. `UsjNodeOptions` (`usj-node-options.model.ts:20-38`) already has `noteCallers?`, `noteCallerOnClick?`, `extraValidMarkers?`.
- **PT9 snippet semantics** (`/home/lyonsm/Paratext/ParatextBase/ScriptureEditor/UsfmSnippetInserter.cs`, `CreateNoteUsfm` lines 91-124; `RemoveMarkersAndFootnotes` 444-489; `DefaultCallerMapper.cs`; `ScrLanguage.cs:290-300`, `ViewUsfmXhtmlConverter.cs:73-74`): footnote snippet = `\f {caller} \fr {chap}{cvSep}{verse}` + (selection ? ` \fq {stripped}` ) + ` \ft ` with `\f*` after the caret; cross-ref = `\x {caller} \xo {chap}{cvSep}{verse}` + (selection ? ` \xq {stripped}`) + ` \xt ` + `\x*`. Caret lands after `\ft `/`\xt `. Fallback callers: `f`→`+`, `x`→`-` (project `DefaultFootnoteCaller`/`DefaultCrossRefCaller` override). `chapterVerseSeparator = Settings.ChapterVerseSeparator`; `verseRangeSeparator = Settings.VerseRangeSeparatorList.First()`. Quotation stripping removes markers + nested notes and emits `\+fv {n}\+fv*` for embedded verse numbers (`isFootnote=true` for both `\fq` and `\xq`). Display caller sequences: `FootnoteCallers` (default a–z character set) and `CrossReferenceCallers` (default `†` = `†`), wrapped **modulo sequence length** in document order per note type. `-` displays as `*` (PT9 `AllowInvisibleChars=false`).
- **paranext-core surfaces** (paths relative to `/home/lyonsm/paranext-core`):
  - `FootnoteEditor` = `lib/platform-bible-react/src/components/advanced/footnote-editor/footnote-editor.component.tsx`. Renders `Editorial` from `@eten-tech-foundation/platform-editor` with `options.view = { ...editorOptions.view ?? getDefaultViewOptions(), noteMode: 'expanded' }` (lines 205-213) and `hasExternalUI: true`. Props already include `editorOptions: EditorOptions` (carries `view: ViewOptions`) and `parentEditorRef?`. **`MarkerEditPlugin` mounts inside `Editorial` (ungated) already** — so when `editorOptions.view.markerMode === "editable"`, the popover editor already runs the marker engine on note content.
  - Note popover shown via `showFootnoteEditor` boolean state in `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (262); opened by `nodeOptions.noteCallerOnClick` (438-458, gated `isReadOnly`) and by `openFootnoteEditorOnNewNote` (1353-1394); rendered at 1977-2002 with `editorOptions={options}` (same `options` memo as the host editor, `view: viewOptions`).
  - Footnotes pane: visibility is per-web-view `useWebViewState<boolean>('footnotesPaneVisible', false)` (web-view 511-520); toggled menu→`platformScriptureEditor.toggleFootnotes`→controller `toggleFootnotesPaneVisibility` (main.ts 613-634)→message→listener (775-779). Pane is display-only (`FootnoteList` = "read-only display"). Position/size also per-web-view persisted (`FootnotesLayout`, `platform-scripture-editor-footnotes.component.tsx`). Pane caller-select drives `editorRef.current?.selectNote(index)` (web-view 1237-1246) — navigate/highlight, not edit.
  - View type: `ScriptureEditorViewType = 'formatted' | 'markers'` (`types/platform-scripture-editor.d.ts:282`); `getViewOptionsForType(viewType, isPowerMode)` (web-view 211-227) imports `getViewOptions`/`getDefaultViewOptions`/`PARAGRAPH_STRUCTURE_VIEW_MODE` from the library. Read-only: `isReadOnly` (`useWebViewState('isReadOnly', true)`, 331); `isReadOnlyEffective` (465-470); `onUsjChange` gated by raw `isReadOnly` (1734). `options` memo (709-737) sets `view: viewOptions`, `contextMenu: [...]`, `markerMenuTrigger: '\\'`.

## Decisions locked for this plan (refinements within the approved design — flag disagreement at plan review, not mid-task)

1. **Task-zero scope = reverse adaptor only.** Thread `viewOptions` per-call through the reverse adaptor (`deserializeEditorState`/`deserializeSerializedEditorState`/`isStandardView`/`recurseNodes`/`createCharMarker`), removing its module `_viewOptions`. The **forward** adaptor is left as-is: it already sets `_viewOptions` from its per-call `viewOptions` argument at the top of each synchronous serialize (line 168) with no `await` before any read, so two editors cannot interleave a serialize — it is call-safe. A regression test (Task 0 Step 6) proves a note-mode serialize between two host-mode serializes does not corrupt output. This keeps task zero surgical while eliminating the real corruption vector (init-latched reverse reads fired asynchronously on change).
2. **Note-scope rebuild reuses the paragraph rebuild machinery.** `$rebuildNoteContent` is a sibling of `$rebuildParas` in `tier2Rebuild.utils.ts`, reusing `$appendChildrenFragment`, `pushSentinel`/`$replaceSentinels`, `countSentinels`, `$signatureOf`, and `$restoreSelectionAtOffset`. It builds the note's **content** fragment (children between the caller/opening marker and the closing marker), tokenizes, serializes, **unwraps the tokenizer's default `\p`**, and splices the rebuilt char nodes back into the note. The note's opening `MarkerNode` + caller + closing `MarkerNode` are preserved by identity (not rebuilt).
3. **Snippet parameters flow through `UsjNodeOptions`, not a new `EditorRef` method.** Add `chapterVerseSeparator?`, `verseRangeSeparator?`, `defaultFootnoteCaller?`, `defaultCrossRefCaller?`, `crossRefCallers?` to `UsjNodeOptions`. `$createNoteChildren`/`$createWholeNote` read them (with `:` / `-` / `+` / `†` fallbacks). Paranext populates them from project settings (Phase 5 hardens the source; Phase 3 supplies fallbacks). This avoids a public `EditorRef` API surface change and reuses the existing `insertMarker("f")` path for Ctrl+T.
4. **Caller sequences: mechanism now, project data later.** Phase 3 implements the *display* generation for both note types (footnote a–z, cross-ref `†`, `-`→`*`, custom literal, modulo wrap) via a second `@counter-style` and the caller node, fed by `noteCallers`/`crossRefCallers` node options with bundled defaults. Real per-project caller character sets arrive via paranext project settings in Phase 5. (Accept the CSS `alphabetic` system's bijective a…z,aa,ab… vs PT9's strict modulo a…z,a,b… as a known minor divergence for the footnote sequence when a project exceeds 26 notes; flagged to PO. Cross-ref default `†` is a single-symbol cyclic style, which is modulo-correct.)
5. **Caller tooltip = existing native `title`.** The caller `<button title={previewText}>` already shows a formatted-preview hover tooltip at the browser's native delay. Phase 3 only ensures `previewText` is populated (it is, via `getPreviewTextFromSerializedNodes`) and adds a test; no custom hover timer. Spec §6 explicitly accepts "ours shows formatted content vs PT9's raw USFM."
6. **Pane behavior default = PT9 (manual/persistent), auto behind a PO-toggle setting defaulted OFF.** Per the kickoff. The setting is a per-web-view `useWebViewState<boolean>('footnotesAutoShow', false)`. When ON: auto-show the pane for `viewType === 'standard'` when the chapter has ≥1 note, auto-hide when none, with a per-web-view `footnotesAutoOverride` flag set by any manual toggle (manual wins until chapter change resets it). When OFF: today's manual/persistent behavior (no change). Caller-click-opens-popover-when-pane-hidden is kept **regardless** of the setting (it is the only note-editing surface this pass). Caller-click-focuses-pane-when-visible is the PT9 behavior added in Task 11.
7. **Part B does the minimum paranext plumbing to run + test standard-view footnotes; power-mode default, menu cycle, and opaque-block polish stay Phase 5.** Task 8 adds `'standard'` to the view-type union + `getViewOptionsForType` mapping + read-only gate + a way to select it for QA; the polished power default and `changeScriptureView` cycle are Phase 5 (spec §12 assigns them there).
8. **`\fe` handled if trivial (it already is), `\ef`/`\ex` out.** `NoteNode.isValidMarker` already accepts `fe`/`ef`/`ex`; `$createNoteChildren` already has `fe`/`ef`/`efe` cases. Phase 3 keeps `\f`/`\x` as the wired entry points (Ctrl+T/Ctrl+Shift+T) and does not add `\ef`/`\ex` dialogs or menu entries. No new work for `\fe`.

---

# Part A — scripture-editors (branch `standard-view`)

### Task 0: Thread viewOptions per-call through the reverse adaptor (task-zero precondition)

**Files:**
- Modify: `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` (lines 77, 79-93, 95-115, 84-87, 181-199, `recurseNodes` ~353/448)
- Modify: `packages/platform/src/editor/Editor.tsx` (lines 182, 229, 369)
- Modify: `packages/platform/src/editor/adaptors/editor-usj-adaptor.test.ts` (deserialize callers)
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts:42` (deserialize caller)
- Modify: `packages/platform/src/editor/markerEdit/markerEditLoop.test.tsx:294`, `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx` (deserialize callers)

**Interfaces:**
- Consumes: `ViewOptions` (already imported from `shared-react`).
- Produces:
  - `initialize(logger: LoggerBasic | undefined): void` — **drops the `viewOptions` param**; sets only `_logger`. The module `_viewOptions` variable is deleted.
  - `deserializeEditorState(editorState: EditorState, viewOptions?: ViewOptions): Usj | undefined`
  - `deserializeSerializedEditorState(serializedEditorState: SerializedEditorState, viewOptions?: ViewOptions): Usj | undefined`
  - `isStandardView(viewOptions: ViewOptions | undefined): boolean` (module-private)
  - `recurseNodes(nodes, viewOptions)` and `createCharMarker(node, content, viewOptions)` gain a trailing `viewOptions` param threaded from the deserialize entry points.
  - The default-export `EditorUsjAdaptor` object keeps `{ initialize, deserializeEditorState }`; the `deserializeEditorState` on it now forwards its optional `viewOptions`.

- [ ] **Step 1: Write the failing regression test (reverse adaptor is instance-safe)**

Add to `editor-usj-adaptor.test.ts` (uses the existing `serializeEditorState`/`deserializeSerializedEditorState` named imports and `getViewOptions`/`STANDARD_VIEW_MODE` from `shared-react`):

```ts
  it("uses per-call viewOptions, not a latched module singleton (task zero)", () => {
    // Build a standard-view state with a stored NBSP (renders as display `~`).
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3 000 men</para></usx>`,
    );
    initialize(undefined); // no viewOptions latched
    reset();
    const standardState = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    // Deserializing WITH standard viewOptions inverts display `~` back to a data NBSP...
    const asStandard = deserializeSerializedEditorState(standardState, getViewOptions(STANDARD_VIEW_MODE));
    expect(JSON.stringify(asStandard)).toContain(`3 000 men`);

    // ...and deserializing the SAME state WITHOUT standard viewOptions leaves display `~` literal,
    // proving the result depends on the per-call arg, not on whatever `initialize` last saw.
    const asDefault = deserializeSerializedEditorState(standardState, undefined);
    expect(JSON.stringify(asDefault)).toContain(`3~000 men`);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- editor-usj-adaptor`
Expected: FAIL — `deserializeSerializedEditorState` ignores the 2nd argument today; both assertions read the singleton set by `initialize`.

- [ ] **Step 3: Thread viewOptions through the reverse adaptor**

In `editor-usj.adaptor.ts`:

1. Delete the module var and rewrite `initialize`/`isStandardView`:

```ts
/** Logger instance */
let _logger: LoggerBasic;

export function initialize(logger: LoggerBasic | undefined) {
  if (logger) _logger = logger;
}

/** §4 whitespace display rules are Standard-view-only (spec: must not leak into other modes). */
function isStandardView(viewOptions: ViewOptions | undefined): boolean {
  return viewOptions !== undefined && getViewMode(viewOptions) === STANDARD_VIEW_MODE;
}
```

2. Thread `viewOptions` through the deserialize entry points and the recursion:

```ts
export function deserializeEditorState(
  editorState: EditorState,
  viewOptions?: ViewOptions,
): Usj | undefined {
  if (editorState.isEmpty()) return EMPTY_USJ;
  return deserializeSerializedEditorState(editorState.toJSON(), viewOptions);
}

export function deserializeSerializedEditorState(
  serializedEditorState: SerializedEditorState,
  viewOptions?: ViewOptions,
): Usj | undefined {
  if (!serializedEditorState.root || !serializedEditorState.root.children) return;

  const rootChildren = serializedEditorState.root.children;
  if (
    rootChildren.length === 1 &&
    isSerializedImpliedParaNode(rootChildren[0]) &&
    (!rootChildren[0].children || rootChildren[0].children.length === 0)
  )
    return EMPTY_USJ;

  const children = removeImpliedParasRecurse(rootChildren);
  const content = recurseNodes(children, viewOptions);
  if (!content) return;

  return { type: USJ_TYPE, version: USJ_VERSION, content };
}
```

3. Give `recurseNodes` a trailing `viewOptions: ViewOptions | undefined` parameter, replace its internal `isStandardView()` calls (the two sites near lines 448/729-equivalent in the reverse file) with `isStandardView(viewOptions)`, pass `viewOptions` into every recursive `recurseNodes(...)` call and into `createCharMarker(childNode, content, viewOptions)`.

4. Give `createCharMarker` a trailing `viewOptions: ViewOptions | undefined` parameter and change its guard to `if (!isStandardView(viewOptions))`.

- [ ] **Step 4: Update production deserialize callers in `Editor.tsx`**

- Line 182: `editorUsjAdaptor.initialize(logger);` (drop the `, viewOptions`).
- Line 229 (`applyUpdate`): `const newUsj = editorUsjAdaptor.deserializeEditorState(editorState, viewOptions);`
- Line 369 (`handleChange`): `const newUsj = editorUsjAdaptor.deserializeEditorState(editorState, viewOptions);`

(`viewOptions` is already in scope at both sites — it is the `Editor.tsx:160` memo.)

- [ ] **Step 5: Update test deserialize callers**

In `editor-usj-adaptor.test.ts`, `corpus-round-trip.test.ts:42`, `markerEditLoop.test.tsx:294`, and `tier2Rebuild.utils.test.tsx` deserialize call sites, pass the same viewOptions used to serialize (or `undefined` where the test asserts default behavior). For `corpus-round-trip.test.ts` the harness serializes with `getViewOptions(viewMode)` at line 41 — pass that same value into the line-42 `deserializeSerializedEditorState(editorState, getViewOptions(viewMode))`.

- [ ] **Step 6: Run tests to verify they pass + whole-package regression**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- editor-usj-adaptor`
Expected: PASS (incl. the new task-zero test).
Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache` then `pnpm nx test shared-react --skip-nx-cache && pnpm nx test shared --skip-nx-cache`
Expected: PASS — corpus round-trip still 60/60, markerEdit suites green.

- [ ] **Step 7: extract-api + commit**

`initialize`'s signature changed but it is not part of the package's *public* API surface (it is consumed internally + via `LoadStatePlugin` through the `EditorAdaptor` interface, which does not declare the reverse `deserializeEditorState`). Run `pnpm nx extract-api platform-editor --skip-nx-cache` and confirm `git status --short` shows no `etc/*.api.md` drift; if it does, review and include it.

```bash
git add packages/platform/src/editor/adaptors/editor-usj.adaptor.ts packages/platform/src/editor/Editor.tsx packages/platform/src/editor/adaptors/ packages/platform/src/editor/markerEdit/
git commit -m "refactor: thread viewOptions per-call through reverse adaptor (phase 3 task zero)

The reverse adaptor latched viewOptions in a module singleton at initialize,
which a second editor instance (footnote popover) would corrupt. Thread it per
deserialize call instead so two editors with different view modes can coexist.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 1: Unclosed notes render expanded inline (§6)

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` (`createNote` 442-490)
- Modify: `libs/shared-react/src/nodes/usj/node-react.utils.ts` (`$createWholeNote` 234-281 — keep the two in sync per the in-file comment)
- Modify: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts` (new tests)
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-data.ts` if needed (the "unclosed note (closed=false)" fixture already exists at ~122-124)

**Interfaces:**
- Consumes: `markerObject.closed` (typed on `MarkerObject` via the existing `NoteMarkerObject` augmentation; `"false"` for unterminated notes).
- Produces: a note with `closed === "false"` is built **expanded** (content inline, no collapsed caller, no synthesized closing marker) regardless of `noteMode`; a closed note is unchanged (collapsed per `noteMode`). Round-trip preserves `closed` via `unknownAttributes` (already true).

- [ ] **Step 1: Write the failing tests**

In `usj-editor-adaptor.test.ts`, next to the existing note tests:

```ts
  it("renders an unclosed note (closed=false) expanded even in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f" closed="false"><char style="ft">open note</char></note> after</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(false);
    // expanded editable layout uses editable caller TEXT, not an ImmutableNoteCallerNode
    expect(note.children.some((c) => c.type === ImmutableNoteCallerNode.getType())).toBe(false);
    // no synthesized closing marker for an unclosed note
    const markerTexts = note.children.filter(isSerializedMarkerNode).map((m) => m.text);
    expect(markerTexts).not.toContain("\\f*");
    // round-trips the closed flag
    expect(JSON.stringify(note)).toContain(`"closed":"false"`);
  });

  it("still collapses a closed note in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f"><char style="ft">closed note</char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(true);
  });
```

(Import `isSerializedNoteNode`/`isSerializedMarkerNode`/`ImmutableNoteCallerNode` alongside the existing serialized-node guards; fix child indexes against the actual serialized shape when running.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- usj-editor-adaptor`
Expected: the first test FAILS (`isCollapsed` is `true`; an `ImmutableNoteCallerNode` is present; a `\f*` marker is synthesized).

- [ ] **Step 3: Implement in `createNote`**

Replace the `isCollapsed` line and the layout gate/closing-marker append in `createNote`:

```ts
  const caller = markerObject.caller ?? "*";
  // Unclosed notes (closed="false") render expanded inline (PT9 `opennote`); only closed
  // notes honor noteMode collapse.
  const isUnclosed = markerObject.closed === "false";
  const isCollapsed = isUnclosed ? false : _viewOptions?.noteMode !== "expanded";
  const unknownAttributes = getUnknownAttributes(markerObject, NOTE_MARKER_OBJECT_PROPS);

  let openingMarkerNode: SerializedTextNode | SerializedImmutableTypedTextNode | undefined;
  let closingMarkerNode: SerializedTextNode | SerializedImmutableTypedTextNode | undefined;
  if (_viewOptions?.markerMode === "editable") {
    openingMarkerNode = createMarker(marker);
    // An unclosed note has no closer to display.
    if (!isUnclosed) closingMarkerNode = createMarker(marker, "closing");
  } else if (_viewOptions?.markerMode === "visible") {
    openingMarkerNode = createImmutableTypedText("marker", openingMarkerText(marker) + " ");
    if (!isUnclosed) closingMarkerNode = createImmutableTypedText("marker", closingMarkerText(marker));
  }
  const children: SerializedLexicalNode[] = [];
  let callerNode: SerializedImmutableNoteCallerNode | SerializedTextNode;
  if (openingMarkerNode) children.push(openingMarkerNode);
  // Expanded layout whenever the note is expanded (either noteMode expanded OR unclosed).
  if (_viewOptions?.markerMode === "editable" && !isCollapsed) {
    callerNode = createText(getEditableCallerText(caller));
    children.push(callerNode, ...childNodes);
  } else {
    const spaceNode = createText(NBSP);
    callerNode = createNoteCaller(caller, childNodes);
    children.push(callerNode, spaceNode, ...childNodes.flatMap(addSpaceNodes(spaceNode)));
  }
  if (closingMarkerNode) children.push(closingMarkerNode);
```

- [ ] **Step 4: Mirror the change in `$createWholeNote`**

In `node-react.utils.ts` `$createWholeNote`, thread the same rule. `$createWholeNote` receives `marker`/`caller`/`contentNodes` but not the source `MarkerObject`; add an optional `closed?: string` parameter (default `undefined`) and apply the identical `isUnclosed`/`isCollapsed`/closing-marker logic, so imperative note construction (insertion) matches load-time. Update its callers (`$insertNote` line 147) to pass `undefined` (freshly inserted notes are closed). Keep the "Keep this function updated with logic from ... `createNote`" comment accurate.

- [ ] **Step 5: Run tests + corpus regression**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- usj-editor-adaptor`
Expected: PASS. Then `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- corpus-round-trip` — the existing unclosed-note fixture must still round-trip (60/60): `closed="false"` survives via `unknownAttributes`, and expanded rendering does not change the reverse mapping (the reverse adaptor reads structure, not collapse state). Then `pnpm nx test shared-react --skip-nx-cache`.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/adaptors/usj-editor.adaptor.ts libs/shared-react/src/nodes/usj/node-react.utils.ts packages/platform/src/editor/adaptors/
git commit -m "feat: render unclosed notes expanded inline (spec §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 2: Note-scope Tier 2 re-tokenization (`$rebuildNoteContent`) + lift the three note skips (§5.2/§6)

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` (`$requestTier2ForNode` 417-432; add `$rebuildNoteContent` + `$buildNoteFragment`)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts` (skip-list 31-37)
- Modify: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts` (skip-list 31-37)
- Create: `packages/platform/src/editor/markerEdit/noteContentRebuild.test.tsx`

**Interfaces:**
- Consumes: `$rebuildParas` helpers (`$appendChildrenFragment`, `pushSentinel`, `$replaceSentinels`, `countSentinels`, `$signatureOf`, `$restoreSelectionAtOffset`, `FragmentAccumulator`), `usfmFragmentToUsjContent`, `usjEditorAdaptor.serializeEditorState`, `NoteNode.isValidMarker`, `$isNoteNode`, `$isMarkerNode`, `$isImmutableNoteCallerNode`.
- Produces:
  - `$rebuildNoteContent(note: NoteNode, viewOptions: ViewOptions, logger?: LoggerBasic): boolean` — re-tokenizes a note's **content** (children strictly between the caller/opening-marker prefix and the closing marker), preserving the note node identity, its opening `MarkerNode`, its caller, and its closing `MarkerNode`. Returns `true` if it rebuilt, `false` on any guard-rail refusal (preserve-or-refuse).
  - `$requestTier2ForNode` line 424 changes from `return;` to `return void $rebuildNoteContent(current, viewOptions, logger);`
  - `$textNodeTier2Transform` and `$displayWhitespaceTransform` skip-lists drop `$isNoteNode(parent)` so a terminated backslash sequence (Tier 2 trigger) and space runs (whitespace display) inside a note are handled.

- [ ] **Step 1: Write the failing tests**

Create `noteContentRebuild.test.tsx`. Use `baseTestEnvironment` from `react-test.utils.tsx` and the engine `test-helpers`. Build an editor in standard view containing an **expanded** note (unclosed, so it renders inline per Task 1), then simulate typing a `\fq ` marker inside its `\ft` content and assert the tokenizer restructures the note's children — not the containing paragraph:

```tsx
import { $getRoot, $isTextNode } from "lexical";
import { $isNoteNode, $isCharNode } from "shared";
import { STANDARD_VIEW_MODE, getViewOptions } from "shared-react";
// helpers per packages/platform/src/editor/markerEdit/markerEdit.test-helpers.tsx

describe("note-scope Tier 2 rebuild", () => {
  it("re-tokenizes typed marker text inside note content, leaving the note atomic to the paragraph", async () => {
    // Arrange: a standard-view editor with an inline-expanded (unclosed) note whose
    // \ft content is a single TextNode.  (Load via the adaptor with closed="false".)
    const { editor } = renderStandardEditorWithUnclosedNote(); // helper: builds \f + \ft "A note"

    // Act: type "\\fq quote " before "A note" inside the \ft span (drives $textNodeTier2Transform).
    await typeInNoteContent(editor, "\\fq quote ");

    // Assert: the note now contains a \fq char span followed by the \ft span; still ONE note in the para.
    editor.getEditorState().read(() => {
      const notes = $getRoot().getAllTextNodes; // placeholder; walk the tree for NoteNode
      const note = findOnlyNote($getRoot());
      expect($isNoteNode(note)).toBe(true);
      const charMarkers = note.getChildren().filter($isCharNode).map((c) => c.getMarker());
      expect(charMarkers).toEqual(["fq", "ft"]);
    });
  });

  it("refuses (preserve-or-refuse) and leaves literal text when the note fragment is a no-op", async () => {
    const { editor } = renderStandardEditorWithUnclosedNote();
    await typeInNoteContent(editor, "C:\\temp path "); // backslash, not a marker
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      // literal backslash text stays as text, note not restructured, no infinite loop
      expect(note.getTextContent()).toContain("C:\\temp path");
    });
  });

  it("displays note-content space runs as NBSP", async () => {
    const { editor } = renderStandardEditorWithUnclosedNote();
    await typeInNoteContent(editor, "two  spaces");
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getTextContent()).toContain(`two  spaces`);
    });
  });
});
```

Author the helpers (`renderStandardEditorWithUnclosedNote`, `typeInNoteContent`, `findOnlyNote`) in the test file or extend `markerEdit.test-helpers.tsx`, following the Phase 2 jsdom lessons (adjacent plain TextNodes merge at mount — give separators `textType` state; selection set in initial-state builders does not survive mount — set it inside an `editor.update` after mount; drive "typing" with `node.setTextContent(...)` / `selection.insertText(...)` inside `editor.update`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- noteContentRebuild`
Expected: FAIL — with the note skips still in place, typed `\fq ` stays literal text (no `fq` char span), and note-content spaces are not displayed as NBSP.

- [ ] **Step 3: Add `$buildNoteFragment` and `$rebuildNoteContent`**

In `tier2Rebuild.utils.ts`, add a note-scoped fragment builder and rebuild that reuse the paragraph machinery. Model exactly on `$buildParaFragment`/`$rebuildParas`:

```ts
/**
 * Build the re-tokenizable fragment for a note's CONTENT children (everything that is not the
 * note's own opening MarkerNode, its caller, or its closing MarkerNode). Preserve-or-refuse:
 * a note whose own marker/attributes the engine cannot re-derive is never rebuilt.
 */
function $buildNoteFragment(
  note: NoteNode,
): { out: FragmentAccumulator; contentNodes: LexicalNode[] } | undefined {
  if (note.getUnknownAttributes && note.getUnknownAttributes()) return undefined;
  if (!NoteNode.isValidMarker(note.getMarker())) return undefined;

  // Content = children minus the leading opening-marker/caller prefix and the trailing closing marker.
  const children = note.getChildren();
  const contentNodes = children.filter(
    (child) => !$isMarkerNode(child) && !$isImmutableNoteCallerNode(child),
  );
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  // Append only the content children (not the whole note element) so markers/caller are untouched.
  $appendNodesFragment(contentNodes, out); // see Step 3b
  return { out, contentNodes };
}
```

Add `$appendNodesFragment(nodes: LexicalNode[], out: FragmentAccumulator)` — extract the per-node body of the existing `$appendChildrenFragment` loop into a helper that iterates a given node array (so both `$appendChildrenFragment(element, out)` and the note path share one implementation). This is a pure refactor of `$appendChildrenFragment` (lines 179-214): change it to `const children = element.getChildren(); $appendNodesFragment(children, out);` and move the loop body into `$appendNodesFragment`. Run the existing Tier 2 tests after this refactor to confirm zero behavior change before adding the note path.

```ts
export function $rebuildNoteContent(
  note: NoteNode,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  const built = $buildNoteFragment(note);
  if (!built) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: note excluded by guard rails");
    return false;
  }
  const { out, contentNodes } = built;

  // Capture caret as a fragment offset before mutating (mirror $rebuildParas 351-371).
  let caretOffset: number | undefined;
  let anchorInNote = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (note.is(node)) {
        anchorInNote = true;
        break;
      }
    if (selection.isCollapsed()) {
      const span = out.spans.find((c) => c.key === selection.anchor.key);
      if (span)
        caretOffset = Math.min(
          span.start + (span.isSentinel ? 1 : selection.anchor.offset),
          span.end,
        );
    }
  }

  const content = usfmFragmentToUsjContent(out.text);
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  if (countSentinels(content) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  // Serialize note content with noteMode:"expanded" so char spans render editable inline, then
  // UNWRAP the tokenizer's default \p (the serializer emits root -> para -> content).
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    noteViewOptions,
  );
  const topLevel = serialized.root.children;
  // Expect a single implied/para wrapper; unwrap to its children. Refuse anything unexpected.
  if (topLevel.length !== 1 || !("children" in topLevel[0]) || !topLevel[0].children) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: unexpected serialized shape");
    return false;
  }
  const newNodes = topLevel[0].children.map((child) => $parseSerializedNode(child));

  // Fixed-point refusal on the CONTENT nodes only (mirror $rebuildParas 402-405).
  if ($signatureOf(newNodes) === $signatureOfNodes(contentNodes)) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  // Splice: insert new content before the first content node, replace sentinels, remove originals.
  const firstContent = contentNodes[0];
  if (firstContent) newNodes.forEach((n) => firstContent.insertBefore(n));
  else {
    // No prior content (e.g. empty \ft): append before the closing marker if present, else at end.
    const closing = note.getChildren().find((c) => $isMarkerNode(c) && c.getTextContent().endsWith("*"));
    newNodes.forEach((n) => (closing ? closing.insertBefore(n) : note.append(n)));
  }
  $replaceSentinels(newNodes, out.sentinels);
  contentNodes.forEach((n) => n.remove());
  $restoreSelectionAtOffset(newNodes, caretOffset, anchorInNote);
  return true;
}
```

Add `$signatureOfNodes(nodes: LexicalNode[]): string` beside `$signatureOf` (which takes an element/array today — reuse `$appendSignature(nodes, out)` directly): `const out: string[] = []; $appendSignature(nodes, out); return out.join("");`. If `$signatureOf` already accepts a node array, call it directly instead.

- [ ] **Step 4: Lift the three note skips**

1. `tier2Rebuild.utils.ts:424`: change `if ($isNoteNode(current)) return;` to:
   ```ts
   if ($isNoteNode(current)) return void $rebuildNoteContent(current, viewOptions, logger);
   ```
2. `markerEditTier2Trigger.utils.ts:31-37`: remove `$isNoteNode(parent) ||` from the skip `||` chain (leave Book/Chapter/Unknown). Update the comment to note that notes now route to the note-scoped rebuild via `$requestTier2ForNode`.
3. `whitespaceDisplay.plugin.utils.ts:31-37`: remove `$isNoteNode(parent) ||` from the skip `||` chain so space runs inside note content display as NBSP (consistent with paragraph content).

- [ ] **Step 5: Run tests to verify they pass + regression**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- noteContentRebuild`
Expected: PASS. Then the full markerEdit suite and whole package:
Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache`
Expected: PASS — the `$appendChildrenFragment`→`$appendNodesFragment` refactor is behavior-preserving (existing Tier 2 tests green), and paragraph rebuilds still treat a NoteNode as an atomic sentinel (a NoteNode inside a paragraph rebuild is untouched).

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: note-scoped Tier 2 re-tokenization; lift Phase-2 note dead-zone guards (spec §5.2/§6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 3: Enter inside note content inserts `\fp` (§6)

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (`KEY_ENTER_COMMAND` handler 167-175)
- Create: `packages/platform/src/editor/markerEdit/noteEnterFp.test.tsx`
- Possibly Create: `packages/platform/src/editor/markerEdit/markerEditNote.utils.ts` (a `$handleEnterInNote(context): boolean` helper) — keep the plugin lean.

**Interfaces:**
- Consumes: `$getSelection`, `$isRangeSelection`, `$isNoteNode`, `$createCharNode`, `$createTextNode`, `$isCharNode`, `NoteNode`.
- Produces: `$handleEnterInNote(): boolean` — if the collapsed-selection caret is inside an **expanded** NoteNode's content, split the current `\fp`-eligible position and insert a new `\fp` char span (PT9 SmartEnter: Enter in a note starts a footnote-paragraph), place the caret inside it, and return `true` (suppressing the paragraph split). Returns `false` otherwise (caller falls through to existing behavior).

- [ ] **Step 1: Write the failing test**

```tsx
describe("Enter inside note content", () => {
  it("inserts an \\fp char span and does not split the paragraph", async () => {
    const { editor } = renderStandardEditorWithUnclosedNote(); // reuse Task 2 helper
    placeCaretAtEndOfNoteFt(editor); // helper: caret at end of the note's \ft text
    const parasBefore = countParagraphs(editor);
    await pressEnter(editor); // dispatch KEY_ENTER_COMMAND

    editor.getEditorState().read(() => {
      expect(countParagraphs($getRoot())).toBe(parasBefore); // no paragraph split
      const note = findOnlyNote($getRoot());
      const markers = note.getChildren().filter($isCharNode).map((c) => c.getMarker());
      expect(markers).toContain("fp");
    });
  });

  it("still splits the paragraph on Enter outside any note", async () => {
    const { editor } = renderStandardEditorWithUnclosedNote();
    placeCaretInParagraphBody(editor);
    const parasBefore = countParagraphs(editor);
    await pressEnter(editor);
    editor.getEditorState().read(() => expect(countParagraphs($getRoot())).toBe(parasBefore + 1));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- noteEnterFp`
Expected: FAIL — Enter currently splits the paragraph (or is swallowed only inside marker text), never inserts `\fp`.

- [ ] **Step 3: Implement `$handleEnterInNote` and wire it into the KEY_ENTER handler**

Add the helper (in `markerEditNote.utils.ts`):

```ts
/** PT9 SmartEnter: Enter inside expanded note content starts an \fp footnote-paragraph span. */
export function $handleEnterInNote(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  let note: NoteNode | undefined;
  for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
    if ($isNoteNode(node)) {
      note = node;
      break;
    }
  if (!note || note.getIsCollapsed()) return false; // only expanded/inline notes accept Enter

  const fp = $createCharNode("fp").append($createTextNode(""));
  selection.insertNodes([fp]);
  fp.selectEnd();
  return true;
}
```

Update the `KEY_ENTER_COMMAND` handler in `MarkerEditPlugin.tsx` to try the note path first:

```tsx
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          if ($handleEnterInNote()) {
            $resolvePendingMarkers(context);
            return true; // note handled: suppress the paragraph split
          }
          const inMarker = $isSelectionInMarkerNode();
          $resolvePendingMarkers(context);
          return inMarker;
        },
        COMMAND_PRIORITY_HIGH,
      ),
```

- [ ] **Step 4: Run tests + regression**

Run: `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- noteEnterFp && pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- MarkerEditPlugin`
Expected: PASS. Then whole package green.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: Enter inside note content inserts \\fp (spec §6 SmartEnter)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 4: Data-driven caller generation — cross-ref sequence, `†` default, `-`→`*`, custom literal (§6)

**Files:**
- Modify: `libs/shared-react/src/nodes/usj/ImmutableNoteCallerNode.tsx` (`decorate` 175-200 — render `*` for `-`; keep literal for custom)
- Modify: `libs/shared-react/src/nodes/usj/usj-node-options.model.ts` (add `crossRefCallers?`)
- Modify: `libs/shared-react/src/plugins/usj/NoteNodePlugin.tsx` (`useNodeOptions` 79-91 — also rewrite a `cross-ref-callers` counter-style; `data-caller` bucketing)
- Modify: `packages/platform/src/usj-nodes.css` (2180-2201 — add cross-ref `@counter-style` + rules for `-`→`*`) and `packages/scribe/src/styles/index.css` (mirror)
- Modify/Create: `libs/shared-react/src/nodes/usj/ImmutableNoteCallerNode.test.tsx`

**Interfaces:**
- Consumes: `GENERATOR_NOTE_CALLER` (`"+"`), `HIDDEN_NOTE_CALLER` (`"-"`), `NoteNode` marker (to bucket footnote vs cross-ref: `x`/`ex` are cross-ref), `nodeOptions.noteCallers`/`crossRefCallers`.
- Produces:
  - The caller `<button>` renders `*` when `__caller === HIDDEN_NOTE_CALLER` and the note is collapsed; `""` (CSS-generated) when `__caller === GENERATOR_NOTE_CALLER`; the literal `__caller` otherwise (custom).
  - Cross-ref auto-callers (`+` on an `x`/`ex` note) draw from the cross-ref sequence (default `["†"]`) instead of the footnote sequence.
  - `crossRefCallers?: string[]` on `UsjNodeOptions` (default `["†"]`); `noteCallers` default stays a–z.

- [ ] **Step 1: Write the failing tests**

In `ImmutableNoteCallerNode.test.tsx` (or a new decorate test), mount a caller node with `caller="-"` collapsed and assert its rendered label is `*`; mount `caller="+"` and assert the label is empty (CSS-generated); mount `caller="a"` (custom) and assert the label is `a`. If the existing test file mounts via the adaptor, add cases there.

```tsx
  it("renders a hidden caller (-) as *", () => {
    const dom = renderCaller({ caller: "-", collapsed: true });
    expect(dom.querySelector("button")?.textContent).toBe("*");
  });
  it("renders a generator caller (+) empty (CSS-generated)", () => {
    const dom = renderCaller({ caller: "+", collapsed: true });
    expect(dom.querySelector("button")?.textContent).toBe("");
  });
  it("renders a custom caller literally", () => {
    const dom = renderCaller({ caller: "a", collapsed: true });
    expect(dom.querySelector("button")?.textContent).toBe("a");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test shared-react --skip-nx-cache -- ImmutableNoteCallerNode`
Expected: the `-`→`*` case FAILS (renders `-`).

- [ ] **Step 3: Implement the caller label + cross-ref bucketing**

In `ImmutableNoteCallerNode.tsx` `decorate`, change the label expression:

```tsx
      {this.__caller === GENERATOR_NOTE_CALLER && noteIsCollapsed
        ? "" // caller generated by CSS counter (footnote or cross-ref sequence)
        : this.__caller === HIDDEN_NOTE_CALLER && noteIsCollapsed
          ? "*" // PT9: `-` caller displays as `*`
          : this.__caller}
```

To bucket footnote vs cross-ref for the CSS counter, set a `data-note-type` on the caller DOM host from the parent note marker. In `createDOM` (150-156), the node cannot see its parent; instead set it in `decorate` via a wrapper attribute, or (simpler) add a `noteType` field to the caller node populated at build time. Minimal approach: in `createNote`/`$createWholeNote`, when building the `ImmutableNoteCallerNode`, pass the note type and store it; `decorate` renders `<button data-note-type={this.__noteType}>`. Add CSS to select the right counter per `data-note-type`.

Add `crossRefCallers?: string[]` to `UsjNodeOptions` with a doc comment (`Default ["†"]`). In `NoteNodePlugin.useNodeOptions`, rewrite a second counter-style `cross-ref-callers` from `nodeOptions.crossRefCallers ?? ["†"]` alongside `note-callers`.

Add to `usj-nodes.css` (and mirror in scribe `index.css`), beside the existing `@counter-style note-callers` block:

```css
@counter-style cross-ref-callers {
  system: cyclic; /* single-symbol default (†) cycles; multi-symbol wraps modulo */
  symbols: "\2020"; /* updated in TS by NoteNodePlugin from nodeOptions.crossRefCallers */
  suffix: "";
}
.editor-input { counter-reset: caller crossref; }
.immutable-note-caller[data-note-type="crossref"][data-caller="+"] { counter-increment: crossref; }
.note.collapsed .immutable-note-caller[data-note-type="crossref"][data-caller="+"] > button::before {
  content: counter(crossref, cross-ref-callers);
}
```

(Keep the existing `note-callers`/`caller` rules for footnotes; add `[data-note-type="footnote"]` to them if needed to avoid double-counting cross-refs. Confirm `counter-reset` on `.editor-input` covers both counters.)

- [ ] **Step 4: Run tests + snapshot check**

Run: `pnpm nx test shared-react --skip-nx-cache -- ImmutableNoteCallerNode && pnpm nx test shared-react --skip-nx-cache -- NoteNodePlugin`
Expected: PASS. Then `pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache` for regressions (note-caller preview/collapse tests).

- [ ] **Step 5: extract-api (UsjNodeOptions is public) + commit**

Run `pnpm nx extract-api platform-editor --skip-nx-cache` (and check `shared-react`'s report if it has one — it does not have an extract-api target; only platform + utilities do, so the public `UsjNodeOptions` surfaces through the platform report). Include any `etc/*.api.md` change.

```bash
git add libs/shared-react/src/nodes/usj/ libs/shared-react/src/plugins/usj/NoteNodePlugin.tsx packages/platform/src/usj-nodes.css packages/scribe/src/styles/index.css packages/platform/etc/
git commit -m "feat: data-driven note callers — cross-ref sequence, dagger default, - to * (spec §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 5: PT9 snippet semantics — separators, `\fq`/`\xq` quotation stripping with `\+fv`, project default callers (§6)

**Files:**
- Modify: `libs/shared-react/src/nodes/usj/usj-node-options.model.ts` (add `chapterVerseSeparator?`, `verseRangeSeparator?`, `defaultFootnoteCaller?`, `defaultCrossRefCaller?`)
- Modify: `libs/shared-react/src/nodes/usj/node-react.utils.ts` (`$insertNote` 129-150, `$createNoteChildren` 175-220)
- Create: `libs/shared-react/src/nodes/usj/noteQuotation.utils.ts` (`$stripSelectionToQuotation`)
- Create: `libs/shared-react/src/nodes/usj/noteQuotation.utils.test.tsx`
- Modify: `libs/shared-react/src/nodes/usj/node-react.utils.test.tsx` (or the existing `$insertNote` test) for separator/caller assertions

**Interfaces:**
- Consumes: `RangeSelection`, `$isVerseNode`, `$isMarkerNode`, `$isNoteNode`, `$isImmutableNoteCallerNode`, `$isTextNode`, `VerseNode.getNumber`, `nodeOptions` fields.
- Produces:
  - `$stripSelectionToQuotation(selection: RangeSelection): string` — walk the selected nodes; append plain TextNode content; skip MarkerNode / NoteNode / caller decorator content (nested notes and markers removed); for each selected VerseNode emit `\+fv <number>\+fv*`; return the trimmed result. (TS port of PT9 `RemoveMarkersAndFootnotes(..., isFootnote=true)`.)
  - `$createNoteChildren(selection, marker, scriptureReference, nodeOptions, logger)` — **new `nodeOptions` param**; builds `\fr`/`\xo` reference text using `nodeOptions.chapterVerseSeparator ?? ":"` and (for bridges) `nodeOptions.verseRangeSeparator ?? "-"`; builds `\fq`/`\xq` from `$stripSelectionToQuotation` (not raw `getTextContent().trim()`).
  - `$insertNote(...)` — passes `nodeOptions` into `$createNoteChildren` and resolves the default caller: `caller ?? (marker starts "x"/"ex" ? nodeOptions.defaultCrossRefCaller ?? "-" : nodeOptions.defaultFootnoteCaller ?? "+")`.

- [ ] **Step 1: Write the failing tests**

`noteQuotation.utils.test.tsx` — build a selection over mixed content (plain text, a nested char span, a VerseNode) and assert the stripped output:

```tsx
  it("strips markers and emits \\+fv for embedded verse numbers", () => {
    // selection over: "the LORD " + <verse 5> + "said" (with a \nd span around LORD)
    const quotation = runInEditor((selection) => $stripSelectionToQuotation(selection));
    expect(quotation).toBe(`the LORD \\+fv 5\\+fv* said`);
  });
```

In the `$insertNote` test, assert the reference uses a custom separator and the cross-ref default caller:

```tsx
  it("uses the project chapter:verse separator and cross-ref default caller", () => {
    const note = runInsertNote("x", { reference: { chapterNum: 3, verseNum: 16 },
      nodeOptions: { chapterVerseSeparator: ".", defaultCrossRefCaller: "†" } });
    expect(note.getCaller()).toBe("†");
    const xo = note.getChildren().filter($isCharNode).find((c) => c.getMarker() === "xo");
    expect(xo?.getTextContent().trim()).toBe("3.16");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test shared-react --skip-nx-cache -- noteQuotation && pnpm nx test shared-react --skip-nx-cache -- node-react.utils`
Expected: FAIL — no `$stripSelectionToQuotation` module; `$createNoteChildren` hardcodes `:` and takes no `nodeOptions`.

- [ ] **Step 3: Implement**

Create `noteQuotation.utils.ts`:

```ts
import { $isRangeSelection, $isTextNode, LexicalNode, RangeSelection } from "lexical";
import { $isVerseNode, $isMarkerNode } from "shared";
import { $isNoteNode } from "shared";
import { $isImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";

/**
 * PT9 `RemoveMarkersAndFootnotes(text, isFootnote=true)` port: build a footnote/cross-ref
 * quotation from a selection — plain text only, markers and nested notes removed, embedded
 * verse numbers converted to `\+fv N\+fv*`.
 */
export function $stripSelectionToQuotation(selection: RangeSelection): string {
  if (!$isRangeSelection(selection)) return "";
  let result = "";
  for (const node of selection.getNodes()) {
    if ($isNoteNode(node) || $isImmutableNoteCallerNode(node) || $isMarkerNode(node)) continue;
    if ($isVerseNode(node)) {
      result += `\\+fv ${node.getNumber()}\\+fv*`;
      continue;
    }
    if ($isTextNode(node)) {
      // Only the intersecting text of partially-selected endpoints (Lexical returns whole nodes).
      result += node.getTextContent();
    }
  }
  return result.replace(/\s+/g, " ").trim();
}
```

(Refine endpoint handling: for the first/last selected TextNode, slice to `selection.anchor.offset`/`focus.offset` as Lexical's `getNodes()` returns whole boundary nodes; add a test for a partial-word selection. Guard VerseNode: in editable mode a `VerseNode` is itself a TextNode subclass — check `$isVerseNode` **before** `$isTextNode`.)

Add the four fields to `UsjNodeOptions`:

```ts
  /** Chapter/verse separator for inserted note references (PT9 ChapterVerseSeparator). Default ":". */
  chapterVerseSeparator?: string;
  /** Verse-range separator for inserted note references. Default "-". */
  verseRangeSeparator?: string;
  /** Default caller for inserted footnotes (PT9 DefaultFootnoteCaller). Default "+". */
  defaultFootnoteCaller?: string;
  /** Default caller for inserted cross-references (PT9 DefaultCrossRefCaller). Default "-". */
  defaultCrossRefCaller?: string;
  /** Possible cross-reference callers when caller is '+'. Default ["†"]. */
  crossRefCallers?: string[];  // (added in Task 4; confirm not duplicated)
```

Rewrite `$createNoteChildren` to take `nodeOptions` and use the separator + stripped quotation; rewrite `$insertNote` to pass `nodeOptions` and resolve the default caller. Update `getUsjMarkerAction`'s call (`usj-marker-action.utils.ts:91-117`) to pass `nodeOptions` through to `$insertNote` (it already receives `nodeOptions`). Update all `$insertNote`/`$createNoteChildren` callers (grep) to the new arity.

- [ ] **Step 4: Run tests + regression**

Run: `pnpm nx test shared-react --skip-nx-cache -- noteQuotation && pnpm nx test shared-react --skip-nx-cache && pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- usj-marker-action`
Expected: PASS.

- [ ] **Step 5: extract-api + commit**

Run `pnpm nx extract-api platform-editor --skip-nx-cache`; include `etc/*.api.md` changes for the new `UsjNodeOptions` fields.

```bash
git add libs/shared-react/src/nodes/usj/ packages/platform/src/editor/adaptors/usj-marker-action.utils.ts packages/platform/etc/
git commit -m "feat: PT9 note snippet semantics — separators, \\fq/\\xq stripping with \\+fv, default callers (spec §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 6: Caller tooltip verification + demo caller-click wiring (§6)

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` (confirm `createNoteCaller` populates `previewText`)
- Create: `libs/shared-react/src/nodes/usj/ImmutableNoteCallerNode.tooltip.test.tsx` (assert `title` = previewText)
- Modify: `packages/scribe/src/App.tsx` (demo `noteCallerOnClick` — optional, to eyeball click in the demo)

**Interfaces:**
- Consumes: existing `previewText`/`title` rendering (`ImmutableNoteCallerNode.decorate`).
- Produces: a test pinning that the caller `<button title>` equals the formatted note preview (the ~500 ms native tooltip). No new hover-timer code (Decision 5).

- [ ] **Step 1: Write the test**

```tsx
  it("exposes the note preview as the caller tooltip (title)", () => {
    const dom = renderCaller({ caller: "+", previewText: "1:1 A footnote.", collapsed: true });
    expect(dom.querySelector("button")?.getAttribute("title")).toBe("1:1 A footnote.");
  });
```

- [ ] **Step 2: Run to verify it passes (behavior already present) or fails**

Run: `pnpm nx test shared-react --skip-nx-cache -- ImmutableNoteCallerNode.tooltip`
Expected: PASS (pins existing behavior). If it fails, the caller build path is not populating `previewText` — fix `createNoteCaller`/`$createWholeNote` to pass the computed preview.

- [ ] **Step 3: Commit**

```bash
git add libs/shared-react/src/nodes/usj/ packages/scribe/src/App.tsx
git commit -m "test: pin note-caller tooltip (formatted preview) behavior (spec §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 7: Whole-repo gates + build/publish the library over yalc (Part A → Part B bridge)

**Files:** none new — verification + build.

- [ ] **Step 1: Full green gates (cache bypassed)**

```bash
pnpm nx run-many -t test --skip-nx-cache
pnpm nx run-many -t lint --skip-nx-cache
pnpm nx run-many -t typecheck --skip-nx-cache
pnpm nx format:check
pnpm nx run-many -t extract-api --skip-nx-cache
git status --short   # expect empty (no API-report drift)
```

Expected: all green; `git status --short` clean.

- [ ] **Step 2: Browser QA of the engine in the platform demo (standard view)**

Run `pnpm nx dev platform` (serves `localhost:5173`), select Standard view. With Chrome + Playwright MCP, verify (real input where possible; `keyboard.insertText` for literal backslash paths, per Phase 2's documented jsdom/headless caveats):
- An unclosed note in the loaded data renders **expanded inline** (Task 1).
- Typing `\fq quote ` inside an expanded note's `\ft` builds a `\fq` char span (Task 2, note-scope Tier 2).
- Enter inside note content inserts an `\fp` span, no paragraph split (Task 3).
- A `-` caller renders as `*`; a `+` footnote caller shows a letter; a `+` cross-ref caller shows `†` (Task 4).
- `insertMarker("f")` (via the demo, or an evaluate) builds a note whose `\fr` uses the configured separator and whose `\fq` is stripped (Task 5).

Capture screenshots (do not commit). Record results in the findings doc (Step 4).

- [ ] **Step 3: Build + yalc-push the library**

```bash
cd packages/platform && pnpm devpub && cd ../..
```

Expected: `prepublishOnly` builds + runs `extract-api platform-editor`, then `yalc push` publishes `@eten-tech-foundation/platform-editor` to the local yalc store. Confirm the pushed version and that `postpublish` restored `package.json` (`git status` clean).

- [ ] **Step 4: Record the bridge state in the findings doc**

Append a "Phase 3 Part A complete" section to `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md` (or a new `2026-07-03-standard-view-phase3-notes.md`) with: gate results, browser-QA notes, the pushed yalc version, and the exact new/changed public exports Part B consumes (`getViewOptions("standard")`, `UsjNodeOptions` new fields, note-scope engine behavior). Commit with `git add -f`.

```bash
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "docs: phase 3 part A complete — engine done, library yalc-pushed for paranext

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

# Part B — paranext-core (new branch `standard-view` off `main`, in a git worktree)

> **Setup before Task 8:** create the worktree and branch (do not edit `/home/lyonsm/paranext-core` directly):
> ```bash
> cd /home/lyonsm/paranext-core
> git worktree add -b standard-view ../paranext-core-standard-view main
> cd ../paranext-core-standard-view
> npm run editor:link   # yalc link the platform-editor pushed in Task 7
> ```
> All Part B paths below are relative to the worktree root. Never commit to `main`; never push.

### Task 8: Consume the library + add the `'standard'` view type (§9, minimal for Phase 3)

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/types/platform-scripture-editor.d.ts` (line 282: view-type union)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (`getViewOptionsForType` 211-227; read-only gates 465-470; `changeScriptureView` handler 771-773)

**Interfaces:**
- Consumes: `getViewOptions` from `@eten-tech-foundation/platform-editor` (now returns options for `"standard"` after the Task 7 push).
- Produces: `ScriptureEditorViewType = 'formatted' | 'markers' | 'standard'`; `getViewOptionsForType(..., 'standard')` → `getViewOptions("standard")` (editable + collapsed + spacing + formatted-font); standard view is **editable** (not read-only), so the read-only gates must not force it read-only.

- [ ] **Step 1: Add `'standard'` to the union**

`platform-scripture-editor.d.ts:282`: `export type ScriptureEditorViewType = 'formatted' | 'markers' | 'standard';`

- [ ] **Step 2: Map it in `getViewOptionsForType`**

```tsx
const getViewOptionsForType = (viewType: ScriptureEditorViewType, isPowerMode: boolean): ViewOptions => {
  if (viewType === 'standard') {
    return getViewOptions(STANDARD_VIEW_MODE) ?? getDefaultViewOptions();
  }
  if (isPowerMode) {
    const base = getDefaultViewOptions();
    if (viewType === 'markers') return { ...base, markerMode: 'visible', noteMode: 'expanded' };
    return base;
  }
  const paragraphStructure = getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE) ?? getDefaultViewOptions();
  if (viewType === 'markers') return { ...paragraphStructure, noteMode: 'expanded' };
  return paragraphStructure;
};
```

Import `STANDARD_VIEW_MODE` from `@eten-tech-foundation/platform-editor` alongside the existing `PARAGRAPH_STRUCTURE_VIEW_MODE` import (web-view ~9-12).

- [ ] **Step 3: Read-only gates account for `'standard'`**

`isReadOnlyEffective` (465-470) must **not** add `'standard'` to the markers-read-only clause — standard view is editable. Confirm `isReadOnlyEffective` stays `isReadOnly || (viewType === 'markers' && ...)`. `onUsjChange` (1734) is gated by raw `isReadOnly`, which is correct for standard view (edits saved unless the whole editor is read-only). No change needed beyond confirming the markers-only clause is not accidentally broadened.

- [ ] **Step 4: Make `'standard'` selectable for QA**

For Phase 3 testing, extend the `changeScriptureView` message handler (771-773) to cycle `formatted → standard → markers → formatted` (Phase 5 will replace this with the polished power-default + menu). Keep the existing `viewType` persistence (`useWebViewState('viewType', 'formatted')`).

- [ ] **Step 5: Build the extension + smoke**

```bash
npm run build   # or the workspace's extension build; confirm typecheck passes with the new union
```

Expected: typecheck clean (the `getViewOptions("standard")` call resolves now that the library is linked). Open the editor web view, cycle to Standard view, confirm it renders editable + formatted + inline markers + collapsed callers.

- [ ] **Step 6: Commit (on the worktree branch)**

```bash
git add extensions/src/platform-scripture-editor/src/
git commit -m "feat(standard-view): add 'standard' scripture-editor view type

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 9: FootnoteEditor runs note content under the marker engine + caret lands after `\ft ` (§6)

**Files:**
- Modify (verify, likely minimal): `lib/platform-bible-react/src/components/advanced/footnote-editor/footnote-editor.component.tsx` (options memo 205-213; editor load)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (`editorOptions={options}` already carries `view: viewOptions` — confirm it is the standard options when viewType==='standard')

**Interfaces:**
- Consumes: the `Editorial` editor (already mounts `MarkerEditPlugin` when `view.markerMode === "editable"`), the standard `viewOptions` from Task 8.
- Produces: when the host is Standard view, the FootnoteEditor popover edits note content with editable markers (Tier 1 renames of `\fr`/`\ft`/`\fq`; Tier 2 for typed markers — note content is top-level paragraphs inside the popover, so paragraph-scope Tier 2 already applies), and the caret lands after `\ft `/`\xt ` on open.

- [ ] **Step 1: Confirm the popover editor inherits `markerMode: "editable"`**

The FootnoteEditor `options` memo (205-213) spreads `editorOptions.view` and forces `noteMode: 'expanded'`. When the host `options.view` is the standard options (`markerMode: 'editable'`), the popover editor is editable — verify by logging `options.view.markerMode` in the popover, or by observing that note-content markers render as editable glyphs in the popover. No code change if it already inherits; if `editorOptions.view` is undefined in some path, ensure Task 8's standard options flow to `FootnoteEditor editorOptions={options}` (web-view 1996 passes the same `options` memo — confirm).

- [ ] **Step 2: Caret lands after `\ft ` on open**

The popover loads the note from `noteOps` and renders it expanded. Verify the caret lands at the end of the last `\ft`/`\xt` char span (the note-content editing position). The library's `$insertNoteWithSelect` selects the last char child when expanded, but the popover loads via ops, not `$insertNote`. If the caret does not land there, add a focus effect in `footnote-editor.component.tsx` (after the editor mounts and content loads) that selects the end of the last footnote-text char span via the `EditorRef`. Keep it behind the "new note" case (`editingNoteIsNew`) so opening an existing note does not reposition the caret unexpectedly.

- [ ] **Step 3: Manual verification (browser)**

With the library linked (Task 7) and the extension built (Task 8): in Standard view, insert a footnote (Ctrl+T lands in Task 12; for now use the `\`-menu or `insertMarker`), confirm the popover opens with the caret after `\ft `, type note text, retype `\ft`→`\fq` and confirm the Tier 1 rename works inside the popover, and confirm saving emits correct `noteOps`.

- [ ] **Step 4: Commit (only if code changed)**

```bash
git add lib/platform-bible-react/src/components/advanced/footnote-editor/ extensions/src/platform-scripture-editor/src/
git commit -m "feat(standard-view): footnote popover edits note content under the marker engine

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 10: Footnotes-pane auto-show/hide behind a PO-toggle setting + per-web-view override (§6, PRD NN3)

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (footnotes-pane state 511-520; add auto-show effect + override; add the setting)
- Modify: `extensions/src/platform-scripture-editor/contributions/menus.json` (a menu toggle for the auto-show setting) and `src/main.ts` (command + controller message, mirroring `toggleFootnotesPaneVisibility` 613-634)

**Interfaces:**
- Consumes: `footnotesPaneVisible`/`setFootnotesPaneVisible` (existing), the loaded chapter USJ (`usjFromPdp`), `viewType`.
- Produces: `footnotesAutoShow` (per-web-view boolean, default `false` = PT9), `footnotesAutoOverride` (per-web-view boolean, reset on chapter change). When `footnotesAutoShow` is ON and `viewType === 'standard'`: auto-show when the loaded chapter has ≥1 note and the user has not manually overridden this chapter; auto-hide when 0 notes. A manual toggle sets `footnotesAutoOverride = true` (manual wins until chapter change). When OFF: unchanged manual/persistent behavior.

- [ ] **Step 1: Add the setting state + auto effect**

```tsx
const [footnotesAutoShow, setFootnotesAutoShow] = useWebViewState<boolean>('footnotesAutoShow', false);
const footnotesAutoOverrideRef = useRef(false);

// Chapter change resets the manual override (so auto behavior resumes next chapter).
useEffect(() => { footnotesAutoOverrideRef.current = false; }, [scrRef.book, scrRef.chapterNum]);

const chapterHasNotes = useMemo(
  () => (usjFromPdp ? new UsjReaderWriter(usjFromPdp).findAllNotes().length > 0 : false),
  [usjFromPdp],
);

useEffect(() => {
  if (!footnotesAutoShow || viewType !== 'standard' || footnotesAutoOverrideRef.current) return;
  setFootnotesPaneVisible(chapterHasNotes);
}, [footnotesAutoShow, viewType, chapterHasNotes, setFootnotesPaneVisible]);
```

(Reuse the `UsjReaderWriter(...).findAllNotes()` already used by `FootnotesLayout`. Confirm the import path.)

- [ ] **Step 2: Manual toggle sets the override**

In the `toggleFootnotesPaneVisibility` message listener (775-779), set `footnotesAutoOverrideRef.current = true;` before flipping `footnotesPaneVisible`, so a manual show/hide wins over auto until the next chapter.

- [ ] **Step 3: Expose the setting toggle (menu + command)**

Add a menu item `%webView_platformScriptureEditor_toggleFootnotesAutoShow%` in `menus.json` (group with the existing footnotes items), a command `platformScriptureEditor.toggleFootnotesAutoShow` in `main.ts` (mirror `toggleFootnotesPane` 368-396 → controller message → web-view listener that flips `footnotesAutoShow`). Default OFF. Add the localized string.

- [ ] **Step 4: Build + manual verification**

Build the extension. With the setting OFF (default): confirm the pane stays manual/persistent (PT9). Toggle the setting ON: navigate to a chapter with notes → pane auto-shows; to a chapter with none → auto-hides; manually hide on a notes chapter → stays hidden (override) until you navigate away and back.

- [ ] **Step 5: Commit**

```bash
git add extensions/src/platform-scripture-editor/
git commit -m "feat(standard-view): footnotes pane auto-show/hide behind a PO-toggle setting (default off)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 11: Caller-click focuses the pane when visible; opens the popover when hidden (§6, Appendix A #58/#59)

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (`nodeOptions.noteCallerOnClick` 438-458)

**Interfaces:**
- Consumes: `footnotesPaneVisibleRef`, `handleFootnoteSelected`/`editorRef.selectNote`, the existing popover-open path.
- Produces: when the pane is **visible**, a caller click focuses/highlights the note in the pane (PT9 navigate-to-note) instead of opening the popover; when the pane is **hidden**, the caller click opens the popover (existing behavior, kept regardless of settings per Decision 6).

- [ ] **Step 1: Branch the click handler on pane visibility**

```tsx
noteCallerOnClick: isReadOnly
  ? undefined
  : (event, noteNodeKey, isCollapsed, _getCaller, _setCaller, getNoteOps) => {
      if (!isCollapsed || editingNoteKey.current) return;
      // Pane visible → focus/highlight the note there (PT9 navigate-to-note).
      if (footnotesPaneVisibleRef.current) {
        const index = noteIndexForKey(noteNodeKey); // map key → note index (walk editorRef notes)
        if (index >= 0) editorRef.current?.selectNote(index);
        return;
      }
      // Pane hidden → open the popover (existing behavior).
      const noteOp = getNoteOps()?.at(0);
      if (!noteOp || !isInsertEmbedOpOfType('note', noteOp)) return;
      const targetRect = event.currentTarget.getBoundingClientRect();
      setNotePopoverAnchorX(targetRect.left);
      setNotePopoverAnchorY(targetRect.top);
      setNotePopoverAnchorHeight(targetRect.height);
      editingNoteKey.current = noteNodeKey;
      editingNoteOps.current = [noteOp];
      setShowFootnoteEditor(true);
    },
```

Add `footnotesPaneVisibleRef` to the `useMemo` deps (or read the ref, which is stable). Implement `noteIndexForKey` by walking the editor's notes (the pane already maps notes by index via `findAllNotes`; align the index basis with `handleFootnoteSelected`/`selectNote`).

- [ ] **Step 2: Build + manual verification**

Pane hidden: click a caller → popover opens (unchanged). Pane visible: click a caller → the corresponding pane row highlights and the editor scrolls to the note; popover does not open. Both gated only by pane visibility, independent of the auto-show setting.

- [ ] **Step 3: Commit**

```bash
git add extensions/src/platform-scripture-editor/src/
git commit -m "feat(standard-view): caller click focuses the pane when visible, opens popover when hidden (spec §6)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 12: Insertion entry points — context menu + Ctrl+T / Ctrl+Shift+T (§6/§9)

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (`options.contextMenu` 709-737; wire keyboard shortcuts)
- Possibly Modify: `lib/platform-bible-react/src/components/advanced/footnote-editor/...` only if `EditorKeyboardShortcuts` is the chosen shortcut host; otherwise the host web view registers them.

**Interfaces:**
- Consumes: `editorRef.current?.insertMarker('f' | 'x')` (library `EditorRef.insertMarker`), the project separators/callers now threaded via `nodeOptions` (Task 5) — populate `nodeOptions` in the web view's `nodeOptions` memo (438-458 region) with `chapterVerseSeparator`/`verseRangeSeparator`/`defaultFootnoteCaller`/`defaultCrossRefCaller`/`noteCallers`/`crossRefCallers` from project settings where available, fallbacks otherwise.
- Produces: context-menu items "Insert footnote (Ctrl+T)", "Insert cross-reference (Ctrl+Shift+T)", and "Insert verse number (Ctrl+K)" where the host command exists; the two footnote shortcuts fire `insertMarker`, then the existing `openFootnoteEditorOnNewNote` opens the popover (already wired via `handleEditorialUsjChange`).

- [ ] **Step 1: Populate note `nodeOptions` from project settings (with fallbacks)**

In the web view's `nodeOptions` memo, add the snippet/caller fields. Read project settings where the PDP exposes them (chapter/verse separator, default callers, caller sequences); fall back to `':'` / `'+'` / `'-'` / a–z / `['†']`. (Phase 5 hardens the settings source; Phase 3 may hardcode fallbacks with a `// TODO(phase5): read from project settings` note.)

- [ ] **Step 2: Add context-menu items**

Extend the `options.contextMenu` array (709-737) with `ContextMenuOptionConfig` entries:

```tsx
contextMenu: [
  /* existing insert-comment item */
  { title: localizedStrings.insertFootnote /* "Insert footnote (Ctrl+T)" */,
    onSelect: () => editorRef.current?.insertMarker('f'), isDisabled: isReadOnlyEffective },
  { title: localizedStrings.insertCrossReference /* "Insert cross-reference (Ctrl+Shift+T)" */,
    onSelect: () => editorRef.current?.insertMarker('x'), isDisabled: isReadOnlyEffective },
  // Insert verse number (Ctrl+K) — only where the host command exists; otherwise omit this pass.
],
```

Add the localized strings.

- [ ] **Step 3: Add the keyboard shortcuts**

Register Ctrl+T / Ctrl+Shift+T at the web-view level (a keydown handler on the editor container, or extend `EditorKeyboardShortcuts` if it is the shortcut host). On Ctrl+T (no shift): `event.preventDefault(); editorRef.current?.insertMarker('f')`. On Ctrl+Shift+T: `insertMarker('x')`. Guard on `!isReadOnlyEffective` and `viewType === 'standard'` (or wherever insertion is allowed). Ensure these do not collide with browser "reopen tab" — `preventDefault` + capture as needed inside the web view iframe.

- [ ] **Step 4: Build + manual verification**

In Standard view: Ctrl+T inserts a footnote and opens the popover with caret after `\ft `; with text selected first, the `\fq` carries the stripped quotation (verse numbers → `\+fv`). Ctrl+Shift+T inserts a cross-reference (caller `-`→`*` or `†` per settings). Context-menu entries do the same.

- [ ] **Step 5: Commit**

```bash
git add extensions/src/platform-scripture-editor/ lib/platform-bible-react/
git commit -m "feat(standard-view): footnote/cross-ref insertion via context menu + Ctrl+T/Ctrl+Shift+T (spec §6/§9)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

---

### Task 13: Cross-repo browser QA + Phase 4/5 handoff

**Files:**
- Create: `docs/superpowers/specs/2026-07-03-standard-view-phase3-notes.md` (in the **scripture-editors** repo — the canonical docs home; `git add -f`)

- [ ] **Step 1: End-to-end browser QA in Platform.Bible (via yalc)**

With the library linked and the extension built, run Platform.Bible with the standard-view branch worktree. Verify the full footnote UX against PT9 as baseline:
1. Insert footnote (Ctrl+T, context menu, `\`-menu) → popover opens, caret after `\ft `, type text, save → correct `noteOps`.
2. Insert cross-reference (Ctrl+Shift+T) → caller `†`/`*`, `\xo` reference with project separator.
3. Selected-text insertion → `\fq`/`\xq` stripped, embedded verses → `\+fv`.
4. Caller click: pane hidden → popover; pane visible → pane focus/highlight.
5. Caller hover → tooltip shows formatted preview.
6. Unclosed note renders expanded inline; Enter in note content → `\fp`.
7. Retype `\ft`→`\fq` inside the popover → Tier 1 rename; type a new `\fq ` → note-scope Tier 2.
8. Footnotes pane setting OFF → manual/persistent (PT9); ON → auto-show/hide with override.
9. Two editors coexist (host + popover) without serialize corruption (task zero).

Capture screenshots; note any divergences (flag PT9 deltas per spec §6 "deliberate divergences").

- [ ] **Step 2: Write the Phase 4/5 handoff**

Document, with exact function-level anchors: what Phase 4 (StyleInfo) plugs into (the `getMarker` seam for menu/validation, caller sequences from project stylesheet); what Phase 5 (extension wiring) still needs (power-mode default view, polished `changeScriptureView` menu cycle, opaque-block rendering polish, real project-settings source for the `nodeOptions` snippet fields populated with fallbacks in Task 12, the pane setting's permanent home). Record known limitations discovered during QA. Note the paranext-core work lives on the `standard-view` worktree branch, unpushed.

- [ ] **Step 3: Final gates (both repos) + commit the docs**

In scripture-editors: re-run the Task 7 Step 1 gate block (cache bypassed) at branch head; confirm clean. In the paranext worktree: build/typecheck clean. Then:

```bash
cd /home/lyonsm/scripture-editors
git add -f docs/superpowers/specs/2026-07-03-standard-view-phase3-notes.md
git commit -m "docs: phase 3 complete — footnote UX; Phase 4/5 handoff and QA notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01JHhCS9TG3Tj2Z9bSmMdGWQ"
```

Update `.superpowers/sdd/progress.md` with the Phase 3 ledger as tasks complete (per the subagent-driven-development workflow).

---

## Self-review (author checklist against spec §6 / §12 "Phase 3" / Appendix A 58-65)

- **Task zero (thread viewOptions per deserialize call):** Task 0. ✔
- **Insertion snippets (`\`-menu, context menu, Ctrl+T/Ctrl+Shift+T; caret after `\ft`; `\fq` stripping with `\+fv`; project caller defaults + fallbacks; chapter-verse separator):** Tasks 5 (semantics), 12 (entry points), 9 (caret). ✔
- **Caller click/tooltip:** Tasks 6 (tooltip), 11 (click: pane-focus vs popover). ✔
- **Footnotes-pane auto-show/hide + per-web-view override, behind a setting default OFF:** Task 10. ✔
- **Threading MarkerEditPlugin into FootnoteEditor:** Tasks 0 (singleton) + 2 (engine) + 9 (verify it runs in the popover). ✔ (Structurally already mounted; the work is making it safe + functional.)
- **Note-scope Tier 2 (lift NoteNode skips):** Task 2. ✔
- **Enter-in-notes inserts `\fp`:** Task 3. ✔
- **Unclosed notes render expanded:** Task 1. ✔
- **Data-driven callers (footnote/cross-ref sequences, `†`, `-`→`*`, custom literal):** Task 4. ✔
- **Out of scope (honored):** insert dialogs, `\ef`/`\ex`, editable pane, caller renumbering dialog — none attempted. `\fe` needs no work (already valid). Power-mode default / menu cycle polish deferred to Phase 5 (Decision 7). ✔
- **Placeholder scan:** paranext UI tasks (9-13) are integration/browser-verified rather than unit-tested (the extension web view has no unit-test harness for these paths) — this is called out per task, not left as a silent "TODO". The `noteIndexForKey`/`renderStandardEditorWithUnclosedNote`/`typeInNoteContent` helpers are named and their construction constraints (jsdom lessons) are specified; implementers author them following `markerEdit.test-helpers.tsx`. Where a paranext caret/focus effect may be unnecessary (Task 9 Step 2) the step says "if it already inherits, no change".
- **Type consistency:** `$rebuildNoteContent(note, viewOptions, logger)` matches its call site in `$requestTier2ForNode`; `$createNoteChildren`/`$insertNote` gain `nodeOptions` consistently across definition and callers (`getUsjMarkerAction`); `UsjNodeOptions` new fields are referenced by the same names in Tasks 4/5/12; `ScriptureEditorViewType` `'standard'` is used identically in the union, `getViewOptionsForType`, and the read-only gate.
- **Cross-repo ordering:** Part B is explicitly gated on Task 7 (build + yalc push); the worktree/branch setup precedes Task 8.
