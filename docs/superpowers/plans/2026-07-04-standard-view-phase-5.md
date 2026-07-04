# Standard View Phase 5 — Extension Wiring + Menus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Standard View port: PT9-parity marker-creation menus (passive `\`-palette + Enter paragraph menu) driven by a StyleInfo-backed item-source API, working clipboard normalization, power-mode default view, visible inert opaque blocks, project-settings-sourced note callers/separators, three bug/hazard fixes, hygiene, and the final all-phases wrap-up.

**Architecture:** The library (platform package) ships a pure PT9-`MarkerItemSource` port plus `EditorRef` context/apply methods; the extension owns the in-app triggers (window keydown) and renders through a new **passive mode** of the paranext overlay-service command palette (flag on the existing request + webViewId-keyed driver methods), so keystrokes stay in the document exactly like PT9. The library's own menu plugin becomes a QA-only harness for demo verification.

**Tech Stack:** TypeScript, Lexical 0.43, Nx/Vitest (scripture-editors); React renderer + C# ParatextData + papi d.ts (paranext-core worktree).

**Spec:** `docs/superpowers/specs/2026-07-04-standard-view-phase5-design.md` (commit `1f7f74c`). PT9 reference source (READ-ONLY): `/home/lyonsm/Paratext`.

## Global Constraints

- Library repo: `/home/lyonsm/scripture-editors`, branch `standard-view`. Extension repo: worktree `/home/lyonsm/paranext-core-standard-view`, branch `standard-view`. NEVER edit `/home/lyonsm/paranext-core` (main checkout); NEVER commit to any `main`; NEVER push or open PRs without explicit user approval.
- ALL Nx gates run with `--skip-nx-cache`. Prefix nx with `volta run pnpm` (e.g. `volta run pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache`).
- Prefer `undefined` over `null`. Lint bans non-null assertions (`!`) and raw NBSP characters in regex (write ` `).
- Every commit message ends EXACTLY with these two lines:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_014aWWYsauyqUV57dZqJ3eq5
  ```
- `docs/superpowers/` and `.superpowers/` are gitignored — stage files there with `git add -f` (`.superpowers/sdd/progress.md` is already tracked).
- `packages/platform/src/editor/Editor.tsx` plugin children are ordered alphabetically by component name within the alphabetical block (see CLAUDE.md).
- Run `nx extract-api` for a package after changing its public API; commit the updated api report.
- Runtime propagation to Platform.Bible follows `docs/superpowers/2026-07-03-paranext-propagation-blocker.md`: `nx build platform-editor --skip-nx-cache` → `pnpm -C packages/platform devpub` → in the worktree `npm stop` → `npm run build:extensions` (fresh build; `--watch` won't pick up a yalc swap) → `./.erb/scripts/refresh.sh`. Verify by editor STATE (`root.__lexicalEditor.getEditorState().toJSON()`), NOT the collapsed main-editor DOM.
- Test-building Lexical trees: chain `.append(...)` inside `$getRoot().append(...)`; construct nodes via `$create<X>Node` helpers (see CLAUDE.md Code Style).
- **PT9 parity governs over plan letter** — reviewers must check plan code against PT9 SOURCE where parity is claimed (this caught two plan-authorship errors in Phase 4).
- DO NOT change `OTCoordinateSystem` semantics (`libs/shared-react/src/plugins/usj/collab/delta-common.utils.ts`) — the `"apply"`/`"delta-doc"` split is by design (Tasks 14/15).

## File Structure (what changes where)

**Part A — scripture-editors (Tasks 1-8):**

| File | Role |
| --- | --- |
| `packages/platform/src/editor/markerMenu/markerItemSource.ts` (new) | PT9 MarkerItemSource port: `MarkerMenuContext`/`MarkerMenuItem`, `getMarkerMenuItems`, `getEnterMenuItems` |
| `packages/platform/src/editor/markerEdit/markerValidation.utils.ts` (edit) | export `isParagraphTagValid` + `ParaStackEntry` (reused by item source) |
| `packages/platform/src/editor/markerMenu/markerMenuContext.utils.ts` (new) | `$getMarkerMenuContext` (selection → context + anchor rect) |
| `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts` (new) | `$applyMarkerMenuSelection`, `$splitParagraphWithMarker` |
| `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts` (edit) | export `$createMarkerPrefix`/`$injectMarkerPrefix` |
| `packages/platform/src/editor/markerEdit/charFormatting.utils.ts` (edit) | export `$closeCharSpanAtCaret` (built on `$splitCharNodeAt`/`$unwrapCharNode`) |
| `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts` (edit) | extract `$getStandardViewClipboardData`; null-event copy/cut leg |
| `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (edit) | COPY/CUT null-event branch via `copyToClipboard(editor, null, data)` |
| `packages/platform/src/editor/editor.model.ts` + `Editor.tsx` + `Marginal.tsx` + `src/index.ts` (edit) | `EditorRef.getMarkerMenuContext`/`applyMarkerMenuSelection`/`splitParagraphWithMarker`; exports |
| `libs/shared-react/src/plugins/usj/UsjNodesMenuPlugin.tsx` (edit) | QA-only document-first harness for editable mode (platform passes items/apply callbacks) |
| `libs/shared/src/nodes/features/UnknownNode.ts` (edit) | class-based visible-inert DOM (no inline `display:none`) |
| `packages/platform/src/usj-nodes.css` (edit) | `.unknown-block` rules (hidden default, visible subdued in `.marker-editable`); `.status_*` consolidation |
| `libs/shared-react/src/plugins/usj/OnSelectionChangePlugin.tsx` (edit) | no-flush read fix |
| `packages/scribe/src/editor/Editor.tsx` (edit) | CommandMenuPlugin markerMode gate |
| `CLAUDE.md` (edit) | Lexical 0.33.1 → 0.43.0 |

**Part B — paranext-core-standard-view (Tasks 9-15):**

| File | Role |
| --- | --- |
| `src/renderer/services/overlays/overlay.service-model.ts` (edit) | `CommandPaletteRequest.passive`; entry `filterText`/`selectedIndex`; driver method types; shared `filterPaletteItems` |
| `src/renderer/services/overlays/overlay-store.ts` (edit) | `updateCommandPaletteState` mutator |
| `src/renderer/services/overlays/overlay.service-host.ts` (edit) | `updateCommandPalette`/`commitCommandPaletteSelection`/`dismissCommandPalette` |
| `src/renderer/components/overlays/overlay-command-palette.component.tsx` (edit) | passive rendering mode (no input, no focus, external filter/highlight) |
| `lib/papi-dts/papi.d.ts` (regenerated) | new service surface |
| `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (edit) | standard-view `\`/Enter trigger rework; palette drivers; power default; settings-sourced nodeOptions |
| `extensions/src/platform-scripture-editor/src/platform-scripture-editor.utils.ts` (edit) | `generateInlineMarkerMenuListItems` re-sourced to the library item-source API |
| `lib/platform-bible-react/src/components/advanced/footnote-editor/footnote-editor.component.tsx` (edit) | editable-mode palette prop family; wrapper-para glyph fix; dist rebuild |
| `c-sharp/Services/ProjectSettingsNames.cs` + `extensions/src/platform-scripture/contributions/projectSettings.json` + d.ts (edit) | four new setting mappings |
| `c-sharp-tests/` (edit) | settings tests |

**Wrap-up (Task 16):** `docs/superpowers/specs/2026-07-XX-standard-view-followups.md` (new), PO/simple-mode docs finalized, `2026-07-04-standard-view-phase5-notes.md` (new), ledger.

---

### Task 1: Marker item-source API (PT9 `MarkerItemSource` port)

**Files:**
- Create: `packages/platform/src/editor/markerMenu/markerItemSource.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerValidation.utils.ts` (export `isParagraphTagValid` + `ParaStackEntry`; NO behavior change)
- Modify: `packages/platform/src/index.ts` (export types + functions)
- Test: `packages/platform/src/editor/markerMenu/markerItemSource.test.ts`

**Interfaces:**
- Consumes: `StyleInfo`/`MarkerStyleInfo` (`libs/shared/src/utils/usfm/styleInfo.ts`), `defaultStyleInfo`, `isParagraphTagValid(stack, tag)` (markerValidation.utils.ts:45 — newly exported), `isUsjMarkerSupported` (`adaptors/usj-marker-action.utils.ts:81`).
- Produces (used by Tasks 2, 3, 5, 10, 11):

```ts
export interface MarkerMenuContext {
  /** Chosen per PT9 HandleBackslash (MarkerDropdownEditHandler.cs:96-139). */
  source: "paragraph" | "character";
  /** Current paragraph's marker (undefined at e.g. book level). */
  paraMarker?: string;
  /** styleType-paragraph markers before the caret, forward order (validity stack replay). */
  previousParaMarkers: string[];
  /** Currently open char-span markers, innermost first (SelectionStyleTags.CharacterStyles). */
  openCharMarkers: string[];
  /** Set when the caret is inside a note's content (note marker, e.g. "f"). */
  noteMarker?: string;
  /** Non-collapsed selection (wrap case). */
  hasTextSelection: boolean;
  /** Caret is inside visible marker glyph text (extension lets Enter pass through). */
  inMarkerText: boolean;
}
export interface MarkerMenuItem {
  marker: string;                 // "q1" | "ft*" | "+wj*" | "f" ...
  kind: "paragraph" | "character" | "note" | "closeTag";
  description?: string;
  isBasic: boolean;
}
export function getMarkerMenuItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[];
export function getEnterMenuItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[];
```

**Port rules (each pinned by a test; PT9 refs are authoritative):**

1. Paragraph source (`MarkerItemSource.cs:168-199`): empty inside notes; else replay `previousParaMarkers` through `isParagraphTagValid(stack, tag, /*add*/ true)` semantics to build the stack, then offer every `styleType === "paragraph"` sheet entry for which a NON-MUTATING validity check passes. Implementation note: the exported `isParagraphTagValid` mutates its stack on success — probe with a copy (`[...stack]`) per candidate.
2. Character source (`:109-147`): requires `paraMarker` (else empty list before fallback). In-note (`noteMarker` set): only `styleType === "character"` entries whose `occursUnder` includes `noteMarker` (`:114-119`). Outside notes: character entries with `occursUnder` empty OR containing `paraMarker` (`:142-144`); note styles (`styleType === "note"`) added when NOT in a note (`:130-135`).
3. Close tags (`:149-159`): from `openCharMarkers` (innermost first), entry `marker = (i === openCharMarkers.length - 1 ? "" : "+") + endMarker` where `endMarker = styleInfo.markers[m]?.endMarker ?? `${m}*``; `kind: "closeTag"`; placed FIRST in the returned list, innermost first.
4. Character-empty → paragraph fallback (`MarkerDropdownEditHandler.cs:118-127`): if `source === "character"` and rules 2-3 yield zero items, recompute as paragraph source.
5. Skips: `zpa`-prefixed markers (`MarkerDropdownControl.cs:100-102`); entries `isUsjMarkerSupported(marker)` rejects (recorded adapted divergence — excludes `id`). `c`/`v`/`cl` are NOT skipped (PT9 `IncludeSpecialStyles: true` for normal projects, `UsfmSinglePaneControl.cs:298-309`). Deprecated markers NOT filtered (PT9 parity).
6. Ordering (`TagComparer` `:201-294` + `:101`): within the open/note groups, natural alphanumeric (`s2 < s10` — compare by splitting trailing digits) with `isBasic` items first (stable). Close tags stay first overall. `isBasic = !!entry.description?.includes("(basic)")` (`ScrTag.cs:425`; `defaultStyleInfo` carries `"(basic)"` — verified).
7. `getEnterMenuItems`: paragraph-source items with the PT9 SmartEnter choice moved to index 0 — `ip` if a paragraph-validity probe passes for `ip` at this stack, else `p` (`KeyPressEditHandler.cs:189-201`). If the chosen marker is absent from the sheet, fall back to plain paragraph ordering.

- [ ] **Step 1: Export the validity primitive.** In `markerValidation.utils.ts` change `interface ParaStackEntry` → `export interface ParaStackEntry` and `function isParagraphTagValid` → `export function isParagraphTagValid`. No body changes. Run `volta run pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- src/editor/markerEdit/markerValidation.utils.test.tsx` → PASS (unchanged).
- [ ] **Step 2: Write failing tests** in `markerItemSource.test.ts`. Build a small inline `StyleInfo` fixture (markers: `p` (paragraph, occursUnder `["c"]`, rank 4, description `"Paragraph (basic)"`), `q1`/`q2` (paragraph under `["c"]`), `s1` (paragraph under `["c"]`, rank 8), `ip` (paragraph, occursUnder `["id"]`), `wj` (character, occursUnder `["p","q1","q2"]`, endMarker `wj*`, description `"... (basic)"`), `nd` (character, empty occursUnder, endMarker `nd*`), `f` (note, endMarker `f*`), `fr`/`ft` (character under `["f"]`), `zpa-x` (character), `v` (character-ish per sheet), `id` (paragraph)). Cases (exact assertions):
  - paragraph source at `previousParaMarkers: ["p"]` offers `p`,`q1`,`q2`,`s1` and NOT `fr` (character) or anything inside notes context.
  - paragraph source with `noteMarker: "f"` → empty (falls to nothing; no fallback recursion).
  - character source under `paraMarker: "p"` offers `wj` (occursUnder match), `nd` (empty occursUnder), `f` (note style), NOT `fr` (occursUnder `f` only), NOT `zpa-x`, NOT `id`.
  - in-note character source (`noteMarker: "f"`) offers `fr`,`ft` only — no note styles, no `wj`.
  - `openCharMarkers: ["+w", "wj"]`-style nesting: with `openCharMarkers: ["nd","wj"]` the first two items are `nd*` then `+wj*`, kinds `closeTag`.
  - character source with zero yield (e.g. `paraMarker: "zzz"` unknown, no open spans, in-note-less but empty) falls back to the paragraph list.
  - ordering: basic (`p`,`wj`) precede non-basic within their group; `q10` sorts after `q2` (add `q10` to fixture).
  - `getEnterMenuItems` with `previousParaMarkers: ["id"]` puts `ip` first; with `["p"]` puts `p` first.
- [ ] **Step 3: Run to verify failure.** `volta run pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache -- src/editor/markerMenu/markerItemSource.test.ts` → FAIL (module missing).
- [ ] **Step 4: Implement `markerItemSource.ts`** per the port rules. Core sketch:

```ts
import { isUsjMarkerSupported } from "../adaptors/usj-marker-action.utils";
import { isParagraphTagValid, ParaStackEntry } from "../markerEdit/markerValidation.utils";
import { StyleInfo } from "shared";

function toStackEntry(styleInfo: StyleInfo, marker: string): ParaStackEntry | undefined {
  const entry = styleInfo.markers[marker];
  if (!entry) return undefined;
  return { marker, rank: entry.rank ?? 0, occursUnder: entry.occursUnder ?? [] };
}

function buildParaStack(styleInfo: StyleInfo, previousParaMarkers: string[]): ParaStackEntry[] {
  const stack: ParaStackEntry[] = [];
  for (const marker of previousParaMarkers) {
    const tag = toStackEntry(styleInfo, marker);
    if (tag) isParagraphTagValid(stack, tag); // mutating replay, PT9 GetValidParagraphTags
  }
  return stack;
}

function paragraphItems(styleInfo: StyleInfo, context: MarkerMenuContext): MarkerMenuItem[] {
  if (context.noteMarker) return []; // MarkerItemSource.cs:173
  const stack = buildParaStack(styleInfo, context.previousParaMarkers);
  return Object.values(styleInfo.markers)
    .filter((e) => e.styleType === "paragraph" && includeMarker(e.marker))
    .filter((e) => {
      const tag = toStackEntry(styleInfo, e.marker);
      return tag ? isParagraphTagValid([...stack], tag) : false; // probe on a copy
    })
    .map((e) => toItem(e, "paragraph"))
    .sort(compareItems);
}
```

  (`includeMarker` = `!marker.startsWith("zpa") && isUsjMarkerSupported(marker)`; `compareItems` = basic-first then natural alphanumeric; `characterItems` + close-tag prefixing + fallback per rules 2-4; `getEnterMenuItems` probes `ip` on the replayed stack.)
- [ ] **Step 5: Run tests to verify pass**, then whole project: `volta run pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache` → PASS.
- [ ] **Step 6: Export from `packages/platform/src/index.ts`** (`getMarkerMenuItems`, `getEnterMenuItems`, types `MarkerMenuContext`, `MarkerMenuItem`), run `volta run pnpm nx extract-api @eten-tech-foundation/platform-editor --skip-nx-cache`, commit the api.md drift.
- [ ] **Step 7: Commit** `feat(platform): PT9 MarkerItemSource port — StyleInfo-backed marker menu item source`.

### Task 2: `EditorRef.getMarkerMenuContext`

**Files:**
- Create: `packages/platform/src/editor/markerMenu/markerMenuContext.utils.ts`
- Modify: `packages/platform/src/editor/editor.model.ts` (EditorRef method), `packages/platform/src/editor/Editor.tsx` (useImperativeHandle — near `insertMarker` at :319), `packages/platform/src/editor/Marginal.tsx` (delegate)
- Test: `packages/platform/src/editor/markerMenu/markerMenuContext.utils.test.tsx`

**Interfaces:**
- Consumes: `MarkerMenuContext` (Task 1); node predicates from `shared` (`$isParaNode`, `$isCharNode`, `$isNoteNode`, `$isMarkerNode`, `$isChapterNode`, `$isBookNode`); `textTypeState`.
- Produces: `$getMarkerMenuContext(): (MarkerMenuContext & { anchorRect?: { x: number; y: number; width: number; height: number } }) | undefined` and `EditorRef.getMarkerMenuContext(): ... | undefined` (returns `undefined` when readonly or no range selection).

**Derivation rules:**
- `source`: `"paragraph"` when the caret is collapsed at the paragraph's CONTENT start — anchor sits at offset 0 of the first non-prefix child, or inside/immediately after the marker prefix (`$isParaMarkerPrefix` first child + `marker-trailing-space` node); otherwise `"character"`. Non-collapsed selection → `"character"` (`MarkerDropdownEditHandler.cs:130-137`).
- `paraMarker`: nearest `ParaNode` ancestor's `getMarker()`.
- `previousParaMarkers`: walk root's block-level children before (and including ancestors of) the caret's paragraph, in document order, collecting `ParaNode.getMarker()`, `"c"` for chapter nodes, `"id"` for the book node (the stack replay filters to styleType-paragraph entries itself — `c`/`id` ARE paragraph-typed in the sheet, which is what makes `s1` under `c` validate).
- `openCharMarkers`: `CharNode` ancestors of the anchor, innermost first.
- `noteMarker`: nearest `NoteNode` ancestor's `getMarker()`.
- `inMarkerText`: anchor node is a `MarkerNode` (visible glyph text).
- `anchorRect`: from `window.getSelection().getRangeAt(0).getBoundingClientRect()` (iframe-relative viewport coords — exactly what the overlay service expects), `undefined` in headless tests.

- [ ] **Step 1: Write failing tests** (use `markerEdit.test-helpers.tsx` harness): para-start caret → `source: "paragraph"`, correct `previousParaMarkers` for a `[id, c, p, q1]` doc with caret in `q1`; mid-text caret → `"character"` + `paraMarker: "q1"`; caret inside `\wj` span inside `\p` → `openCharMarkers: ["wj"]`; caret in expanded-note `\ft` → `noteMarker: "f"`; non-collapsed selection → `hasTextSelection: true`, `source: "character"`; caret inside a MarkerNode glyph → `inMarkerText: true`.
- [ ] **Step 2: Verify FAIL, implement, verify PASS** (commands as Task 1, test file path adjusted).
- [ ] **Step 3: Wire `EditorRef`.** `editor.model.ts`: add after `insertMarker` (:132):

```ts
/** Snapshot of the marker-menu context at the current selection (standard-view marker menus).
 * Returns undefined when the editor is readonly or has no range selection. */
getMarkerMenuContext(): (MarkerMenuContext & { anchorRect?: { x: number; y: number; width: number; height: number } }) | undefined;
```

  `Editor.tsx` handle: guard `if (options.isReadonly) return undefined;` then `return editorRef.current?.getEditorState().read(() => $getMarkerMenuContext());` — NOTE: read via `getEditorState().read`, not `editor.read` (no force-flush; same hazard class as Task 7's OnSelectionChange fix). `Marginal.tsx`: delegate like the neighboring methods (:186-187 pattern).
- [ ] **Step 4: extract-api + commit** `feat(platform): EditorRef.getMarkerMenuContext — selection-derived marker menu context`.

### Task 3: Apply methods — `applyMarkerMenuSelection` + `splitParagraphWithMarker`

**Files:**
- Create: `packages/platform/src/editor/markerMenu/markerMenuApply.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts` (export `$createMarkerPrefix`, `$injectMarkerPrefix` — no body change)
- Modify: `packages/platform/src/editor/markerEdit/charFormatting.utils.ts` (add exported `$closeCharSpanAtCaret`)
- Modify: `editor.model.ts`, `Editor.tsx`, `Marginal.tsx`, `packages/platform/src/index.ts`
- Test: `packages/platform/src/editor/markerMenu/markerMenuApply.utils.test.tsx`

**Interfaces:**
- Consumes: `MarkerMenuItem` (Task 1); `getUsjMarkerAction` (:91) + `isUsjMarkerSupported`; `$splitCharNodeAt`/`$unwrapCharNode` (charFormatting/markerEditDeletion); `$createMarkerPrefix`/`$injectMarkerPrefix`.
- Produces:

```ts
// EditorRef additions:
applyMarkerMenuSelection(item: MarkerMenuItem, opts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean }): void;
splitParagraphWithMarker(marker: string): void;
// charFormatting.utils.ts:
export function $closeCharSpanAtCaret(endMarker: string): boolean; // closes innermost matching span
```

**Behavior (single history entry each — one `editor.update` per call):**
- `applyMarkerMenuSelection`, open/note kinds: if `literalPrefixLanded`, delete the literal trigger prefix first — in the anchor TextNode, match `/\\[a-z0-9+*]*$/i` ending at the caret offset (PT9 marker characters, `MarkerDropdownControl.cs:216-219`) and remove that range (no-op when absent); then run `getUsjMarkerAction(item.marker, expandedNoteKeyRef, viewOptions, nodeOptions, logger).action({ editor, reference: scrRef })`. When `literalPrefixLanded: false` (wrap case), skip cleanup — the action's `$wrapTextSelectionInInlineNode` path (:139) wraps the intact selection.
- `closeTag` kind: `$closeCharSpanAtCaret(endMarker)` where `endMarker = item.marker.replace(/^\+/, "")` — find the innermost `CharNode` ancestor whose sheet endmarker (or `marker + "*"`) equals `endMarker`; split at the caret via `$splitCharNodeAt` and `$unwrapCharNode` the right half (text after the caret leaves the span); caret at the split point outside the span. Caret at span content end → just move the selection after the span (span already effectively closed).
- `splitParagraphWithMarker(marker)`: `selection.insertParagraph()`; on the NEW paragraph: `setMarker(marker)` then `$injectMarkerPrefix(newPara)` (prefix present ⇒ `$paraMarkerDeletionTransform`'s no-prefix branches never fire; `splitExpected` untouched). Caret lands on the content side (the inject helper already does this).

- [ ] **Step 1: Write failing tests**: literal-prefix cleanup removes exactly `\q` typed before caret then inserts a `q1` para via the structural action (assert final tree shape + single undo step restores both); cleanup no-ops when nothing literal precedes; wrap case (selection `"holy"` inside `\p`, item `wj`) produces `char/wj` wrapping `holy` with the selection's text intact and NO text deleted; closeTag on `nd*` with caret mid-`\nd` span leaves left half styled, right half plain (mirror the Ctrl+Space split shape assertions in `charFormatting.utils.test.tsx`); nested `+wj*` closes the inner `wj` of `nd>wj` nesting; `splitParagraphWithMarker("q2")` from mid-`p` yields `[p(left), q2(right w/ visible prefix)]`, caret after prefix, single undo restores; existing Enter path (INSERT_PARAGRAPH via RichText + splitExpected) still clones — regression via `markerEditDeletion.utils.test.tsx` suite staying green.
- [ ] **Step 2: FAIL → implement → PASS** (whole platform-editor suite cache-bypassed).
- [ ] **Step 3: Wire EditorRef methods** (model + Editor.tsx handle + Marginal delegate). `Editor.tsx` guards mirror `insertMarker` (:320-334): readonly throw, scrRef throw, `isUsjMarkerSupported` check for open kinds. Export `MarkerMenuItem` already from Task 1; extract-api.
- [ ] **Step 4: Commit** `feat(platform): marker-menu apply methods — structural insert w/ literal cleanup, close-tag split, split-with-marker`.

### Task 4: Clipboard normalization — null-event leg

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (:150-159)
- Test: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx` (extend)

**Interfaces:**
- Consumes: `copyToClipboard` + `LexicalClipboardData` from `@lexical/clipboard` (verify the type export name in 0.43 — it is the third parameter type of `copyToClipboard`; if unexported, define the structural shape locally: `{ "text/plain"?: string; "text/html"?: string; "application/x-lexical-editor"?: string }`).
- Produces: `export function $getStandardViewClipboardData(editor: LexicalEditor): LexicalClipboardData | undefined` (undefined when selection collapsed/non-range).

- [ ] **Step 1: Extract the payload builder.** In `whitespaceDisplay.plugin.utils.ts`:

```ts
export function $getStandardViewClipboardData(editor: LexicalEditor): LexicalClipboardData | undefined {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return undefined;
  const data: LexicalClipboardData = {
    "text/plain": selection.getTextContent().replaceAll(NBSP, " "),
  };
  const html = $getHtmlContent(editor);
  const lexical = $getLexicalContent(editor);
  if (html) data["text/html"] = html;
  if (lexical) data["application/x-lexical-editor"] = lexical;
  return data;
}
```

  Rewrite `$handleCopyForStandardView`'s real-event branch to consume it (`event.clipboardData.setData(...)` per key; behavior identical), and add the null branch:

```ts
export function $handleCopyForStandardView(
  event: ClipboardEvent | null | undefined,
  editor: LexicalEditor,
  isCut: boolean,
): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const data = $getStandardViewClipboardData(editor);
  if (!data) return false;
  if (!event || !("clipboardData" in event) || event.clipboardData == null) {
    // Null-payload dispatch (ClipboardPlugin / ContextMenuPlugin / EditorRef): write via
    // Lexical's execCommand mechanism with OUR pre-normalized payload. copyToClipboard(null)
    // without `data` would intercept its own synthesized event at COMMAND_PRIORITY_CRITICAL
    // and write the stock payload — which is why this branch must pass `data` (spec §2).
    void copyToClipboard(editor, null, data);
    if (isCut) selection.removeText();
    return true;
  }
  event.preventDefault();
  for (const [mime, value] of Object.entries(data)) event.clipboardData.setData(mime, value);
  if (isCut) selection.removeText();
  return true;
}
```

  `MarkerEditPlugin.tsx` (:152/:157): change the casts `event as ClipboardEvent` → pass `event instanceof ClipboardEvent ? event : null` (jsdom-safe: use `objectKlassEquals`-style duck check `event && typeof event === "object" && "clipboardData" in event ? event : null` if `instanceof` misbehaves under jsdom).
- [ ] **Step 2: Tests** (extend existing file; jsdom): dispatching `COPY_COMMAND` with `null` payload in a standard-view harness with a non-collapsed selection calls through to `document.execCommand("copy")` — stub `execCommand` to synchronously fire a synthetic `ClipboardEvent`-shaped `copy` event with a recording `clipboardData` (`DataTransfer` polyfill or minimal `{ setData, getData }` recorder) on the root; assert `text/plain` has NBSP→space inverted; CUT variant also removes the selected text; real-event path unchanged (existing tests stay green); non-standard view mode does NOT register the handlers (existing gate test). If jsdom's execCommand dance proves untestable end-to-end, split the assertion: unit-test `$getStandardViewClipboardData` output + a spy asserting `copyToClipboard` was called with `(editor, null, data)` (mock `@lexical/clipboard`), and leave the true end-to-end to Task 15 in-app QA (clipboard BYTES check) — note which route was taken in the report.
- [ ] **Step 3: FAIL → implement → PASS; commit** `fix(platform): standard-view clipboard normalization reaches in-app copy/cut (null-dispatch leg)`.

### Task 5: QA harness — document-first `UsjNodesMenuPlugin` (editable mode)

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/UsjNodesMenuPlugin.tsx`
- Modify: `packages/platform/src/editor/Editor.tsx` (:435-444 mount — pass new props in editable mode)
- Test: `packages/platform/src/editor/markerMenu/markerMenuHarness.test.tsx` (new, platform package — the harness composition is platform-level)

**Interfaces:**
- Consumes: Tasks 1-3 exports via props (the shared-react plugin must NOT import from platform — platform depends on shared-react, not vice versa). New optional props on `UsjNodesMenuPlugin`:

```ts
{
  /** QA-ONLY editable-mode branch (see doc comment). When provided, the plugin runs the
   * document-first harness instead of the legacy typeahead. */
  editableHarness?: {
    getContext: () => (MarkerMenuContextLike & { anchorRect?: ... }) | undefined; // platform passes editorRef-backed impls
    getItems: (context: MarkerMenuContextLike) => { marker: string; kind: string; description?: string }[];
    getEnterItems: (context: MarkerMenuContextLike) => { marker: string; kind: string; description?: string }[];
    apply: (item, opts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean }) => void;
  };
}
```

  (Type the context/item shapes structurally in shared-react — `MarkerMenuContextLike` local structural type — so no platform import is needed.)
- Produces: demo-verifiable flows for Task 8 browser QA. **Not a production surface.**

- [ ] **Step 1: Doc-comment the QA-only status** at the top of the editable branch: `QA HARNESS ONLY — P10 renders marker menus via the host overlay service (spec §1.5). Not maintained for production; no polish or completeness guarantees beyond what demo QA needs.`
- [ ] **Step 2: Implement the editable branch** (mounted when `editableHarness` prop present; legacy behavior otherwise — non-editable demo unchanged): root keydown listener WITHOUT `preventDefault` for the trigger with a collapsed selection (menu opens, `\` lands; NodeSelectionMenu query capture is acceptable — mirrors palette focus model); `preventDefault` + menu for non-collapsed selection; Escape closes only; selection → `apply(item, { trigger: "backslash", literalPrefixLanded: collapsedAtOpen })`; INSERT_PARAGRAPH_COMMAND at `COMMAND_PRIORITY_CRITICAL` (above MarkerEditPlugin's HIGH) opening the Enter menu (paragraph items, SmartEnter-first) — `return true` (suppress split); selection → `apply(item, { trigger: "enter", ... })`; Escape → nothing (split cancelled); caret-in-note or in-marker-text contexts pass through (`return false`).
- [ ] **Step 3: Platform wiring.** `Editor.tsx` mount (:435-444): in editable markerMode pass `editableHarness` built from `editorRef` methods + `getMarkerMenuItems`/`getEnterMenuItems` with `styleInfo ?? defaultStyleInfo`; other modes unchanged.
- [ ] **Step 4: Tests** (platform, jsdom): typed `\` lands as literal text AND the menu opens; Escape leaves `\`; menu selection inserts structurally and removes the `\`; Enter opens the paragraph menu with `p` first and Escape cancels the split (document unchanged); Enter menu selection splits with the chosen marker; inside an expanded note, Enter still inserts `\fp` (harness passes through). FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(shared-react,platform): QA-only document-first marker menu harness for editable mode`.

### Task 6: Opaque blocks — visible inert `UnknownNode` (§7)

**Files:**
- Modify: `libs/shared/src/nodes/features/UnknownNode.ts` (:115-119)
- Modify: `packages/platform/src/usj-nodes.css` (new rules; also the `.status_*` consolidation from the hygiene bundle rides here since it touches the same file)
- Test: `libs/shared/src/nodes/features/UnknownNode.test.ts` (extend/create), plus a platform corpus assertion

**Interfaces:**
- Produces: `UnknownNode.createDOM()` emits `class="unknown-block" data-marker="<marker>" contenteditable="false"` (no inline `display:none`). CSS contract: hidden by default everywhere (`.unknown-block { display: none; }` — preserves today's behavior in formatted/markers views), visible subdued block in standard view (`.marker-editable .unknown-block { display: block; ... }` + `::before { content: "\\" attr(data-marker); }` lead-marker label).

- [ ] **Step 1: Verify optbreak's representation** (spec plan-verify item): run the Phase 0 corpus fixtures and inspect — `grep -rn "optbreak" packages/platform/src/editor/adaptors/` + load a corpus doc containing `<optbreak/>`; record whether it becomes `UnknownNode` (inline) or another node. If `UnknownNode`: add an inline variant — when `getTag()` indicates an inline construct (`optbreak`), emit `unknown-inline` class instead and CSS renders `//` via `::before` in `.marker-editable` (`display: inline`). If it is NOT an UnknownNode (already rendered some other way), record in the task report and skip the inline variant.
- [ ] **Step 2: Tests**: `createDOM` emits the class + `data-marker` + `contentEditable === "false"` and NO inline display style; existing serialization tests stay green (exportJSON untouched); corpus round-trip suite stays green (`volta run pnpm nx test @eten-tech-foundation/platform-editor --skip-nx-cache` — the Phase 0 corpus asserts USJ deep-equality). Add a Lexical-behavior test: with a doc `[p, unknown(table), p]`, select from para 1 into para 2 and delete → the UnknownNode is removed whole (no partial content edits); typing with caret adjacent never enters the node (selection lands in neighbors).
- [ ] **Step 3: CSS.** Default: `.unknown-block { display: none; }`. Standard view: `.marker-editable .unknown-block { display: block; opacity/border/background: subdued container; user-select: contain; }` + `.marker-editable .unknown-block::before { content: "\\" attr(data-marker); }` styled as a small label (use existing CSS variable conventions in the file; match `.status_*` color treatment for the label). ALSO: delete the redundant bare `.status_unknown`/`.status_invalid` rules at `usj-nodes.css:2299-2307` (identical values, lower specificity than the scoped :2093-2098 rules — hygiene item).
- [ ] **Step 4: FAIL → implement → PASS → commit** `feat(shared,platform): §7 visible inert opaque blocks in standard view + status-rule consolidation`.

### Task 7: Bug/hazard fixes + hygiene (library side)

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/OnSelectionChangePlugin.tsx` (:19)
- Modify: `packages/scribe/src/editor/Editor.tsx` (:207)
- Modify: `CLAUDE.md` (Lexical version line)
- Test: `libs/shared-react/src/plugins/usj/OnSelectionChangePlugin.test.tsx` (new), `packages/scribe/src/editor/CommandMenuPlugin.gate.test.tsx` (new — mirror platform's), `libs/shared-react/src/nodes/usj/noteQuotation.utils.test.ts` (extend — `\fq`/`\xq` branch)

- [ ] **Step 1: OnSelectionChangePlugin.** Replace `editor.read($getUsjSelectionFromEditor)` with `editor.getEditorState().read($getUsjSelectionFromEditor)` — reads the last committed state WITHOUT the force-flush that made the 9b frozen-state crash reachable. Regression test: register a SELECTION_CHANGE handler scenario where a nested dispatch occurs mid-update (mirror the 9b test pattern in the Phase 4 fix commit d037693's test) and assert no throw + `onChange` still fires with the committed selection.
- [ ] **Step 2: Scribe gate.** Port platform's gate verbatim (Editor.tsx:466-468 pattern): `{viewOptions?.markerMode !== "editable" && <CommandMenuPlugin />}` — locate scribe's viewOptions source first; if scribe's Editor has no `viewOptions` in scope at :207, derive from its options the same way platform does. Gate test mirrors `packages/platform/src/editor/CommandMenuPlugin.gate.test.tsx`.
- [ ] **Step 3: `\fq`/`\xq` quotation-branch test** (Phase 3 carryover): in the `$stripSelectionToQuotation`/`$createNoteChildren` test file, add a case with a non-collapsed selection so the created footnote carries `\fq <selected>` (and the `x` variant `\xq`).
- [ ] **Step 4: CLAUDE.md**: `Lexical: Facebook's extensible text editor framework (v0.33.1)` → `(v0.43.0)`.
- [ ] **Step 5: Gates + commit** `fix(shared-react,scribe): OnSelectionChange no-flush read; scribe editable-mode CommandMenu gate; fq/xq test; docs`.

### Task 8: Part A gates, demo browser QA, yalc bridge

- [ ] **Step 1: Whole-repo gates, all cache-bypassed:** `volta run pnpm nx run-many -t test --skip-nx-cache`, `-t typecheck`, `-t lint`, `nx format:check`, `-t extract-api` (commit any intentional api.md drift; `git status --short` clean).
- [ ] **Step 2: Demo browser QA** (real Chrome via Playwright MCP, `nx dev platform`, Standard preset — verify by editor STATE): type-through `\q1<space>` at para start → `q1` paragraph, literal path resolved by Tier 2; `\` mid-text → menu shows char list with close tags first when inside a span; Escape leaves literal `\`; menu selection inserts + cleans prefix; selection-wrap `\wj` keeps text; Enter menu p-first, Enter-Enter splits, Escape cancels; unknown block visible-inert on a corpus doc with a table (standard view) and hidden in formatted; Ctrl+C via ContextMenuPlugin Copy item → clipboard `text/plain` has no ` ` (read via `navigator.clipboard.readText()` in the console).
- [ ] **Step 3: Bridge:** `volta run pnpm nx build platform-editor --skip-nx-cache` → `pnpm -C packages/platform devpub` (auto-links into the worktree). Verify the pushed `dist/index.d.ts` exports `getMarkerMenuItems`/`applyMarkerMenuSelection` surface.
- [ ] **Step 4: Commit** (ledger update only if needed) — Part A complete.

### Task 9: Overlay service — passive command palette (paranext renderer)

**Files:**
- Modify: `src/renderer/services/overlays/overlay.service-model.ts` (:118-136 request; :156-234 interface; :307-323 entry)
- Modify: `src/renderer/services/overlays/overlay-store.ts` (new mutator)
- Modify: `src/renderer/services/overlays/overlay.service-host.ts` (:535-607)
- Modify: `src/renderer/components/overlays/overlay-command-palette.component.tsx`
- Modify: papi exposure point (wherever `overlayService` is registered for webviews — follow `showCommandPalette`'s existing route; regen `lib/papi-dts/papi.d.ts` via the repo's papi.d.ts generation script)
- Test: `src/renderer/services/overlays/overlay.service-host.test.ts` + `overlay-store.test.ts` + component test (extend existing files)

**Interfaces (produces — consumed by Tasks 10, 11):**

```ts
// CommandPaletteRequest gains:
passive?: boolean; // no search input, no focus steal; filter/highlight driven externally
// IOverlayService gains (webViewId-keyed under the one-palette-per-WebView invariant):
updateCommandPalette(webViewId: string, update: { filterText?: string; moveSelection?: number }): Promise<void>; // filterText passive-only; no-op when none active
commitCommandPaletteSelection(webViewId: string): Promise<void>; // resolves show promise with highlighted item id
dismissCommandPalette(webViewId: string): Promise<void>; // resolves undefined; both modes
// service-model exports (shared by host commit + component rendering):
export function filterPaletteItems(items: CommandPaletteItem[], filterText: string | undefined): CommandPaletteItem[];
// prefix match on `label` with leading-'+' stripping (PT9 MarkerDropdownControl.cs:105-114); empty/undefined filter = all items
```

- [ ] **Step 1: Model.** Add `passive?: boolean` to `CommandPaletteRequest`; add `filterText?: string; selectedIndex: number` (mutable, default 0) to the `commandPalette` `OverlayEntry` variant; add the three method signatures with full JSDoc (mirror the popover family's doc style, including the no-op semantics and the passive-only `filterText` rule); implement + export `filterPaletteItems`.
- [ ] **Step 2: Store.** `updateCommandPaletteState(id: string, patch: { filterText?: string; selectedIndexDelta?: number; itemCount: number }): boolean` — clamps `selectedIndex` to `[0, filteredCount-1]`; notifies subscribers (mirror `updateOverlayContent` :124).
- [ ] **Step 3: Host.** Helper `getActiveCommandPalette(webViewId)` = `getOverlaysByWebView(webViewId).find(o => o.type === 'commandPalette')`. `updateCommandPalette`: no-op if none; reject `filterText` updates on non-passive palettes (no-op + warn); recompute filtered count via `filterPaletteItems` for clamping. `commitCommandPaletteSelection`: compute `filterPaletteItems(entry.items, entry.filterText)[entry.selectedIndex]`; skip `disabled` items when resolving (move to next enabled; if none, no-op); `resolveAndRemoveOverlay(id, 'commandPalette', item.id)`. `dismissCommandPalette`: `resolveAndRemoveOverlay(id, 'commandPalette', undefined)`. Add all three to the `overlayService` object (:600-607) and the papi exposure.
- [ ] **Step 4: Component.** In `OverlayCommandPalettePresentational` add `passive?: boolean; filterText?: string; selectedIndex?: number` props. Passive mode: do NOT render `CommandInput`, do NOT run the `inputRef.focus()` effect (:182-184); render `filterPaletteItems(items, filterText)` in the same grouped list markup with highlight styling on `selectedIndex` (plain list items with the CommandItem classes — cmdk's internal filter/navigation is bypassed in passive mode; item CLICK still selects). Active mode: bit-identical to today (regression-pin with the existing tests). Store-connected component passes the entry's mutable fields through.
- [ ] **Step 5: Tests.** Host: update/commit/dismiss round trip (show passive palette → updateFilter narrows → moveSelection clamps → commit resolves show-promise with the highlighted id); filterText on active palette no-ops; no-active no-ops; replace-on-new-request still ABORTs. Component: passive renders no input and never steals focus (`document.activeElement` unchanged after mount); highlight follows `selectedIndex`; click selects. Run the repo's renderer test suite per its README/package scripts.
- [ ] **Step 6: papi.d.ts regen + `npm run build:extensions` sanity + commit** (worktree) `feat(renderer): passive command palette mode — flag on request + webViewId-keyed drivers`.

### Task 10: Web view — standard-view `\`/Enter triggers via the palette

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (keydown effect :1221-1294; new palette-driver module-level helpers)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.utils.ts` (:419-459 re-source)
- Test: extension typecheck/lint + `platform-scripture-editor.utils.test.ts` (extend for the re-sourced generator)

**Interfaces:**
- Consumes: `getMarkerMenuItems`/`getEnterMenuItems`/`defaultStyleInfo` + `EditorRef.getMarkerMenuContext`/`applyMarkerMenuSelection`/`splitParagraphWithMarker` from `@eten-tech-foundation/platform-editor` (Tasks 1-3 via devpub); `papi.overlays.showCommandPalette/updateCommandPalette/commitCommandPaletteSelection/dismissCommandPalette` (Task 9).
- Produces: `openMarkerPalette` + `openEnterPalette` callbacks reused by Task 11's popover wiring.

**Keydown rework (inside the existing effect :1221; standard view only — `viewType === 'standard' && !isReadOnlyEffective`; other views keep the current interception exactly as-is):**

```ts
// component scope (alongside the other refs ~:340): palette session state
// (single owner: this keydown flow)
const paletteSession = useRef<
  { kind: 'backslash'; literalPrefixLanded: boolean; filter: string; items: MarkerMenuItem[] }
  | { kind: 'enter'; items: MarkerMenuItem[] }
  | undefined
>(undefined);
```

- `\` pressed, no session open: `const ctx = editorRef.current?.getMarkerMenuContext(); if (!ctx) return;` — collapsed (`!ctx.hasTextSelection`): do NOT preventDefault (the `\` lands); `passive: true`. Selection: `preventDefault()`; `passive: false` (focused palette). Items: `getMarkerMenuItems(styleInfo ?? defaultStyleInfo, ctx)` mapped `MarkerMenuItem → CommandPaletteItem` (`id: marker`, `label: marker`, `description`, close tags `group: 'Close'` first, non-basic de-emphasis via `group`); `papi.overlays.showCommandPalette({ items, anchor: rectFrom(ctx.anchorRect), passive }, webViewId)` promise → on id: `applyMarkerMenuSelection(itemById, { trigger: 'backslash', literalPrefixLanded })` then `editorRef.current?.focus()`; on undefined/ABORTED: clear session, refocus if focused-mode. Set `paletteSession.current`.
- While a `backslash` **passive** session is open (subsequent keydowns, checked FIRST in the handler): `ArrowDown`/`ArrowUp` → `preventDefault` + `updateCommandPalette(webViewId, { moveSelection: ±1 })`; `Enter` → `preventDefault` + `commitCommandPaletteSelection(webViewId)`; `Escape` → `preventDefault` + `dismissCommandPalette(webViewId)`; `' '` and `'*'` → NO preventDefault (they land) + `dismissCommandPalette(webViewId)` (PT9 Space-commit/`*`-close outcomes land via Tier 2); marker chars `[a-z0-9+*]` and `Backspace` → NO preventDefault (they land in the doc) + mirror the filter: `session.filter` append/pop, then `updateCommandPalette(webViewId, { filterText: session.filter })`. (Filter mirroring is keydown-tracked — display-only; the APPLY reads the real literal run from the document (Task 3), so IME/fast-typing drift can never corrupt the insert. Note this in a comment.) Any other key → dismiss.
- `Enter` pressed, no session, standard view: `const ctx = getMarkerMenuContext()`; pass through (no preventDefault) when `!ctx || ctx.noteMarker || ctx.inMarkerText` (note `\fp` path + marker-completion swallow stay library-owned); else `preventDefault()` + focused palette (`passive: false` — nothing lands on the Enter path) with `getEnterMenuItems` (SmartEnter choice already first = highlighted); on id → `splitParagraphWithMarker(id)` + refocus; on dismiss → refocus only (Enter cancelled). Plain Enter only: bail on `shiftKey || ctrlKey || altKey || metaKey`.
- The existing `\` interception branch (:1225-1238) gains the guard `viewType !== 'standard'` (non-standard views unchanged); FootnoteEditor popover focus is excluded the same way it is today (`document.activeElement === editorInput`).

- [ ] **Step 1: Implement** per the above; keep every new callback in `useCallback` with correct deps (the effect's dep list grows — mirror the existing pattern).
- [ ] **Step 2: Re-source `generateInlineMarkerMenuListItems`** (:419-459): replace the `usfmMarkers[parentMarker].children` walk with `getMarkerMenuItems(styleInfo ?? defaultStyleInfo, { source: 'character', paraMarker: parentMarker, previousParaMarkers: [], openCharMarkers: [], hasTextSelection: false, inMarkerText: false })` (the API's char→para fallback covers paragraph contexts); map to the existing `MarkerMenuItem` (extension) shape — `title` from `item.description` localized when a matching key exists, structure-protection logic unchanged; new `styleInfo` parameter threaded from the web view memo (:1164-1175). Update its unit tests: stylesheet-driven list (project-invalid markers absent; custom.sty markers present when supplied).
- [ ] **Step 3: Extension gates:** worktree `npm run typecheck` (or the package's script) + lint + `npm run build:extensions` clean.
- [ ] **Step 4: Commit** `feat(extension): standard-view marker palettes — PT9 type-through backslash + Enter paragraph menu via passive overlay palette`.

### Task 11: FootnoteEditor popover — palette wiring

**Files:**
- Modify: `lib/platform-bible-react/src/components/advanced/footnote-editor/footnote-editor.component.tsx` (:504-533 keydown; props; :214-228 options memo untouched)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (pass the prop family at :2185-2211)
- Rebuild + commit `lib/platform-bible-react/dist` (tracked)

**Interfaces:**
- Consumes: Task 10's palette drivers (web view builds one implementation and passes it down); the popover's own inner `editorRef` (`getMarkerMenuContext`/`applyMarkerMenuSelection` — Tasks 2-3, available since platform-bible-react already consumes `@eten-tech-foundation/platform-editor`).
- Produces (new optional FootnoteEditor props):

```ts
// PaletteItemLike is a structural subset of the overlay service's CommandPaletteItem —
// define it locally in the component (platform-bible-react must not import renderer types):
type PaletteItemLike = { id: string; label: string; description?: string; group?: string; disabled?: boolean };
markerPalette?: {
  show(items: PaletteItemLike[], anchor: { x: number; y: number; width?: number; height?: number }, passive: boolean): Promise<string | undefined>;
  update(update: { filterText?: string; moveSelection?: number }): Promise<void>;
  commit(): Promise<void>;
  dismiss(): Promise<void>;
};
```

- [ ] **Step 1: Replace the Task 14 gate** (:509). In editable marker mode, when `markerPalette` is provided: implement the SAME selection-shape rule + forwarding block as Task 10, scoped to the popover's `editorInput` (:510-511) and driven by the popover's own `editorRef` (in-note context → `fr/fq/ft` items come from the item source's in-note rule; items built with `getMarkerMenuItems(options.styleInfo ?? defaultStyleInfo, ctx)` — import both from the editor package). Enter inside the popover: UNCHANGED (library `\fp` path; no palette). When `markerPalette` is absent in editable mode, keep the current pass-through-only behavior (literal typing works, no menu) — non-P10 consumers degrade gracefully. Non-editable mode: existing MarkerMenu popup untouched.
- [ ] **Step 2: Web view wiring:** build the `markerPalette` implementation once (wrapping `papi.overlays.*` with `webViewId`) and pass to `<FootnoteEditor markerPalette={...}>` (:2202 region). Same iframe origin ⇒ anchor coords valid unchanged.
- [ ] **Step 3: Rebuild `lib/platform-bible-react/dist`** per the repo's build script and commit (expect small diff — Phase 3 synced it).
- [ ] **Step 4: Extension typecheck + build:extensions; commit** `feat(platform-bible-react,extension): FootnoteEditor marker palette in editable mode (popover parity)`.

### Task 12: nodeOptions project settings (C# + registration + web view)

**Files:**
- Modify: `c-sharp/Services/ProjectSettingsNames.cs` (4 new const pairs + dictionary entries)
- Modify: `extensions/src/platform-scripture/contributions/projectSettings.json` (+ localized strings file for labels/descriptions)
- Modify: `extensions/src/platform-scripture/src/types/platform-scripture.d.ts` (ProjectSettingTypes entries)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (:489-529)
- Test: `c-sharp-tests/` (extend the existing ParatextProjectDataProvider settings tests)

**Mappings (PT defaults from `ParatextData/ProjectSettingsAccess/ProjectSettings.cs`):**

| PB name | PT Settings.xml tag | Registered default |
| --- | --- | --- |
| `platformScripture.chapterVerseSeparator` | `ChapterVerseSeparator` | `.` (PT default, :731-734) |
| `platformScripture.verseRangeSeparator` | `RangeIndicator` | `-` (:713) |
| `platformScripture.defaultFootnoteCaller` | `DefaultFootnoteCaller` | `+` (:1318-1322) |
| `platformScripture.defaultCrossRefCaller` | `DefaultCrossRefCaller` | `-` (:1300-1304) |

- [ ] **Step 1: Caller-sequence check** (spec plan-verify): `grep -n "CallerSequence\|FootnoteSequence\|CrossRefSequence" /home/lyonsm/Paratext/ParatextData/ProjectSettingsAccess/*.cs`. If distinct footnote/cross-ref caller-sequence settings exist, add them the same way (feeding `noteCallers`/`crossRefCallers`); if not, record in the task report and leave library defaults (spec allows).
- [ ] **Step 2: C#.** Add the four const pairs + `s_platformBibleToParatextSettingsNames` entries (the generic `ParametersDictionary` fall-through at `ParatextProjectDataProvider.cs:1312-1334` then serves reads; missing tag → registered default via `ProjectSettingsService.GetDefault`). Tests: read each via `GetProjectSetting` against the test project (assert value or registered default); `dotnet test` the c-sharp-tests project per repo scripts.
- [ ] **Step 3: Registration.** `projectSettings.json`: four properties in the platformScripture group with `%project_settings_platformScripture_<name>_label%`/`_description%` keys (+ english/spanish strings in the extension's localized strings files, mirroring existing entries) and `"includeProjectInterfaces": ["Paratext"]`. d.ts: add to `ProjectSettingTypes`.
- [ ] **Step 4: Web view.** Replace the hard-coded fallbacks (:496-500) with `useProjectSetting(projectId, 'platformScripture.chapterVerseSeparator', ':')` etc. — KEEP the current fallback values as the hook defaults ( `:`/`-`/`+`/`-`/`['†']` ) so pre-C#-restart behavior is unchanged; `isPlatformError` guards like the `platform.name` pattern (:358-370). `nodeOptions` memo deps updated; delete the TODO(phase5) comment.
- [ ] **Step 5: Gates (typecheck, lint, build:extensions, dotnet build+test) + commit** `feat(extension,c-sharp): project-settings-sourced note callers and separators`.

### Task 13: Power-mode default view

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (:348, :388-393)

- [ ] **Step 1: Verify `useSetting` readiness semantics** (spec plan-verify): check `useSetting`'s return signature in `papi-frontend` typings (`lib/papi-dts/papi.d.ts`) — if it exposes a loading flag, gate on it; if not, confirm `useWebViewState` does NOT persist its default (read the hook source in `lib/platform-bible-react` / papi) — only explicit `setViewType` persists.
- [ ] **Step 2: Implement.** `useWebViewState<ScriptureEditorViewType>('viewType', isPowerMode ? 'standard' : 'formatted')`. If step 1 found no readiness flag and the default is non-persisting: accept the possible one-render `formatted`→`standard` flip on first-ever open in power mode and add a comment documenting it (saved-state views never flip — the saved value wins immediately). If the default DOES persist or the flip proves user-visible in Task 15 QA, instead defer the editor mount until the interfaceMode setting resolves (small loading gate) — decide by evidence, record in the report.
- [ ] **Step 3: Manual check via Task 15 QA** (fresh web view in power mode opens standard; existing saved-state views unchanged; simple mode unchanged; `changeScriptureView` cycle intact). Typecheck + commit `feat(extension): power-mode web views default to standard view (saved state respected)`.

### Task 14: Popover Cancel residual + wrapper-para glyph artifact

**Files:**
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (:1516-1552 if residual found)
- Modify: `lib/platform-bible-react/src/components/advanced/footnote-editor/footnote-editor.component.tsx` (:139 `PARAGRAPH_USJ` / :250-291 init)
- Test: library-side popover round-trip suite (`note-ops-popover-roundtrip.test.tsx`) extended if the fix lands in the library-facing flow; otherwise lib component behavior verified in Task 15 QA
- Rebuild `lib/platform-bible-react/dist`

- [ ] **Step 1: Cancel path audit.** Trace `openFootnoteEditorOnNewNote` (:1530-1552): confirm `editingNoteKey.current` is set for the Ctrl+T path before the popover opens; the delete leg `replaceEmbedUpdate(editingNoteKey.current, [])` (:1517-1518) now runs in Task 15-fixed `"apply"` coordinates. If the key IS set and coordinates are right, the Task 13 QA failure may already be fixed — verify in-app during Task 15; fix whatever residual the audit finds (e.g. key unset, or the X-button `onClose` not reaching `closeFootnoteEditor(true)`).
- [ ] **Step 2: Wrapper-para glyph artifact.** In the popover init (:271-283), `applyUpdate([noteOp])` inserts the note at OT index 0, BEFORE the wrapper para's `\p` glyph prefix, leaving the original glyph pair as trailing junk (phase4-notes). Preferred fix (spec candidate 1): compute the insert position AFTER the para prefix — insert via a retain that skips the wrapper para's opaque prefix (in `"apply"` coordinates the para glyphs are text — retain past them), i.e. `applyUpdate([{ retain: <prefix length in apply coords> }, noteOp])`. If that proves brittle, fallback (candidate 2): drop the `PARAGRAPH_USJ` wrapper (:139) and let `applyUpdate` create the para — verify the note-ops fixed point still holds (library round-trip tests). Either way: display-only today — the fix must NOT change note-ops content (Task 14 contract; pin by running the library `note-ops-popover-roundtrip` suite against the chosen shape if the wrapper changes).
- [ ] **Step 3: dist rebuild + typecheck + commit** `fix(extension,platform-bible-react): popover cancel removes fresh note; note inserts after wrapper para prefix`.

### Task 15: Part B gates, propagation, full in-app runtime QA

- [ ] **Step 1: Gates.** Worktree: typecheck, lint, `npm run build:extensions` (fresh), `dotnet build` + c-sharp tests. Library: whole-repo suites cache-bypassed one more time at head.
- [ ] **Step 2: Propagate** per the runbook (Global Constraints). Verify markers of Tasks 1-3/9-11 in the built bundle (grep for `getMarkerMenuContext`, `updateCommandPalette` in `extensions/dist/.../main.js`).
- [ ] **Step 3: Runtime QA (wgPIDGIN, headless CDP per runbook; verify by editor STATE + real clipboard bytes):**
  1. `\`-palette at para start → paragraph list (occursUnder-filtered; custom.sty markers present); mid-text → char list, close tags first when inside a span.
  2. Fluent type-through `\q1<space>` → `q1` paragraph, focus NEVER left the editor (assert `document.activeElement` stays `.editor-input` throughout), following prose lands in the document.
  3. Arrows + Enter palette-select → insert + literal-prefix cleanup; Escape → literal `\` stays and Tier 2 settles on termination; `*` closes the palette and lands.
  4. Selection-wrap: select text, `\`, choose `wj` → wrapped, selection text intact.
  5. Enter menu: `\p`/`\ip` first; Enter-Enter fast path splits; Escape cancels (doc unchanged); Enter inside an expanded note still inserts `\fp`.
  6. Popover: `\` in the popover offers `fr/fq/ft` under `f`; literal `\` still reaches the popover editor; popover Save still replaces in place (Task 15 regression).
  7. Clipboard: Ctrl+C and context-menu Copy → `navigator.clipboard.readText()` contains NO ` `; cut removes + normalizes; paste of USFM still Tier-2 resolves.
  8. Power default: fresh editor web view in power mode opens standard; saved-state view keeps its type; simple-mode fresh view opens formatted; view cycle intact.
  9. Opaque block: corpus/book with a table → visible subdued block in standard, hidden in formatted, whole-block delete + undo, SFM byte-clean on save.
  10. Settings: with wgPIDGIN's Settings.xml values (inspect first), inserted footnote's `\fr` separator + caller match project settings.
  11. Popover Cancel (X) removes the fresh note (Task 14 verify); caller-click with pane hidden opens the popover (Task 13 open observation re-check).
  12. Regressions: `\zfoo` split + `status_unknown`; `s1` red custom.sty; Ctrl+T insert + popover auto-open (delta-doc path MUST stay intact); undo depth single-step per user action; 0 console errors.
  Restore all QA artifacts (undo in-app, disk SFM clean, app stopped) as in Phases 3/4.
- [ ] **Step 4: Commit** worktree + library ledger entries.

### Task 16: Wrap-up — consolidated follow-ups + docs

- [ ] **Step 1:** Write `docs/superpowers/specs/2026-07-04-standard-view-followups.md` (rename date to actual): start from spec §10 groups A-G; re-sweep `.superpowers/sdd/progress.md` "Minor (final review triage)" entries from ALL phases + every phase-notes "known limitations" section; mark items CLOSED by Phase 5 (clipboard gap, popover cancel, wrapper glyph, scribe gate, CLAUDE.md, `.status_*` CSS, `\fq/\xq` test, opaque-block invisibility, nodeOptions fallbacks, OnSelectionChange hazard) and ADD anything new from Phase 5 execution reports.
- [ ] **Step 2:** Finalize `2026-07-04-standard-view-pt9-ux-differences.md` + `2026-07-04-standard-view-simple-mode-impact.md` against what actually shipped (e.g. palette parity results, caller-sequence outcome from Task 12, power-default mechanics from Task 13).
- [ ] **Step 3:** Write `docs/superpowers/specs/2026-07-04-standard-view-phase5-notes.md` (completion notes in the Phase 2/3/4 notes format) + ledger wrap in `.superpowers/sdd/progress.md`.
- [ ] **Step 4:** Final whole-repo gates both repos, cache-bypassed; `git add -f` docs; commit `docs: Phase 5 complete — wrap-up, consolidated follow-ups, PO/simple-mode docs finalized`.

---

## Task ordering / dependencies

- Tasks 1→2→3 sequential (API → context → apply). Task 4 independent after 1 (shares nothing). Task 5 needs 1-3. Tasks 6, 7 independent. Task 8 gates Part A and publishes to the worktree.
- Task 9 (renderer) is independent of Part A — may run any time before 10. Tasks 10, 11 need 8 (devpub) + 9. Tasks 12, 13, 14 independent of 9-11 (14 touches the same FootnoteEditor file as 11 — run 11 before 14 to avoid conflicts). Task 15 last before 16.

## Self-review notes (spec coverage)

Spec §1.1→Task 1; §1.2→Task 2; §1.2 apply/§5.4 close-tags→Task 3; §2→Task 4; §1.5→Task 5; §4/§7→Task 6; §6 hazards+hygiene→Tasks 7, 6(CSS), 14; §1.6→Task 9; §1.3→Task 10; §1.4→Task 11; §5→Task 12; §3→Task 13; §8→Tasks 8, 15; §10/§11→Task 16. Divergences recorded in spec §9 need no tasks. `markerMenuTrigger`/`hasExternalUI` option semantics unchanged (harness keyed on new prop; extension keyed on keydown).
