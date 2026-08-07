# Settled `getUsj()` Output (Wave 4 / Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `EditorRef.getUsj()` return SETTLED USJ — the document a Tier-2 settle would produce — without mutating the editor, and retire the host's mutating pre-save `commitPendingMarkerEdits()` call, so consumers always receive canonical USJ while pending edits stay pending on screen (spec `docs/superpowers/specs/2026-08-06-display-run-consolidation-design.md` §8).

**Architecture:** A read-only "virtual settle" runs inside `editorState.read()`. It takes the editor state's own JSON (`editorState.toJSON()`), locates every settle SCOPE (the `ParaNode` or expanded `NoteNode` that owns a pended key — the same walk `$requestTier2ForNode` uses), and for each scope runs the SAME `$buildParaFragment`/`$buildNoteFragment` + `usfmFragmentToUsjContent` + `usjEditorAdaptor.serializeEditorState` pipeline a real settle runs. The only half that is not literally shared is the materialize step: a real settle splices live Lexical nodes, while the virtual settle splices the equivalent SERIALIZED subtrees into the JSON copy (Lexical forbids node creation inside a read). U+FFFC sentinels are substituted with the preserved nodes' own serialized subtrees, so sentinels serialize in place and never move. One final `editorUsjAdaptor.deserializeSerializedEditorState` over the patched JSON produces the output USJ, so text coalescing, implied-para flattening, and every exclusion gate behave exactly as they do today. The editor is never touched.

An in-editor command surface (today: the marker palette) can declare its in-progress input to the editor through a new `EditorRef.setTransientInput` — the analogue of an IME composition string. While declared, the settle subtracts exactly those bytes from the fragment BEFORE tokenizing, so the paragraph settles as if they had never been typed; the document, the screen, `onUsjChange`, and OT deltas are untouched. The declaration is re-verified against the live caret at every `getUsj()` call and IGNORED when it does not hold, so a stale declaration degrades to a visible phantom marker in one save and never to silently dropped user content.

**Tech Stack:** TypeScript, Lexical, React, vitest (per-package via pnpm), nx monorepo (`@eten-tech-foundation/platform-editor`, `shared`, `shared-react`); paranext-core extension host (React, vitest via the `extensions` workspace).

## Global Constraints

- Editor repo: `~/source/repos/workspaces/standard-view/scripture-editors`, branch `standard-view-pt-4187`. Bare paths below are relative to it.
- Host repo: `~/source/repos/workspaces/standard-view/paranext-core`, branch `standard-view`. Host paths are always written with the `extensions/…` prefix and an explicit "(paranext-core)" note.
- PT9 reference at `~/source/repos/Paratext` is read-only. NEVER edit it.
- The corpus test `packages/platform/src/editor/markerEdit/tier2Rebuild.corpus.test.tsx` must stay **141/141 with zero skips** at every commit.
- Fixed points (spec §9, must not change): tokenizer/losslessness core (`usfmFragmentToUsjContent`, `extractAttributes`, `scanMilestone`, NBSP↔space flattening); `canonicalAttributeText`; the editor→USJ and delta exclusion gating SEMANTICS (display bytes never in ops or saved USJ); Tier-2's preserve-or-refuse machinery (fixed-point signature, sentinel symmetry, guard rails, termination); the corpus losslessness + round-trip property tests — extended, never weakened.
- Prefix every `pnpm`/`nx` invocation with `env -u _VOLTA_TOOL_RECURSION` and judge success by EXIT CODE, not output tail.
- Editor-repo test commands: per-package `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run <file-substring>`; wave gate `env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test` from the repo root plus root `env -u _VOLTA_TOOL_RECURSION npx eslint .` — both clean before the wave is declared done.
- Host-repo (paranext-core) test command: `cd extensions && npx vitest run src/platform-scripture-editor/src/<file>`; host gates `npm run lint` and `npm run typecheck` from the paranext-core root.
- Subagents run tests in the **FOREGROUND only**. No background test runs.
- Editor-repo commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- paranext-core commit messages end with `Co-authored-by: Claude Fable 5 <noreply@anthropic.com>` (that repo's own lowercase convention — see its CLAUDE.md).
- Code comments stand on their own: no plan/task/spec-section/JIRA breadcrumbs in code comments.
- Behavior-preserving refactor steps are pinned green BEFORE and AFTER: run the named suite before touching the file, confirm green, refactor, run it again.
- `docs/superpowers/` is gitignored in the editor repo — `git add -f` any spec/plan file; lint-staged's `[FAILED] …ignored by .gitignore` lines on such commits are benign (the commit still lands; verify with `git log -1 --stat`).

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts` | Gains ONE read accessor so `Editor.tsx` can consume the existing per-editor pend channel. No new plumbing. | Modified (Task 1) |
| `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` | Gains `$settleScopeForNode` (the ONE scope walk), exports `$buildNoteFragment` and `countSentinels`; `$buildParaFragment`'s export doc updated. | Modified (Task 2) |
| `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts` | `$settledUsj` — the read-only settle: scope collection, transient-input subtraction, fragment+tokenize, serialized sentinel substitution, patched-JSON → USJ. | Create (Tasks 3, 5, 9) |
| `packages/platform/src/editor/Editor.tsx` | `getUsj()` returns settled USJ (fast path unchanged when nothing is pending); holds the transient-input declaration and implements `setTransientInput`. | Modified (Tasks 4, 9) |
| `packages/platform/src/editor/editor.model.ts` | `EditorRef.getUsj` / `commitPendingMarkerEdits` contract docs; the new `setTransientInput` method and its `TransientInput` type. | Modified (Tasks 4, 9) |
| `packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx` | Unit pins for the virtual settle over each scope kind. | Create (Tasks 3, 5) |
| `packages/platform/src/editor/settledGetUsj.test-helpers.tsx` | Shared mounting/assertion harness for the settled-output suites. | Create (Task 6), extended (Task 8) |
| `packages/platform/src/editor/settledGetUsj.test.tsx` | Uniformity + no-mutation pins; the virtual↔real equivalence property; the Tier-2 fixed-point property. | Create (Tasks 6, 7, 8) |
| `packages/platform/src/editor/transientInput.test.tsx` | The transient-input contract: exclusion, clearing, every staleness mode, apply-consumes-literal, the mid-palette flush shape. | Create (Task 9) |
| `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx` | Backlog item 4: byte-fidelity pins for the verse-9 `\nd` span across every editor-side pipeline. | Create (Task 10) |
| `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts` (paranext-core) | The mutating pre-save settle AND the palette-literal strip plumbing are REMOVED from the save path. | Modified (Tasks 12, 13) |
| `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (paranext-core) | Drops the commit wiring and the strip arguments; declares the palette's in-progress literal to the editor per keystroke. | Modified (Tasks 12, 13) |
| `extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.ts` (paranext-core) | Lossy-warn meaning updated; first warn per difference logs the untruncated entries. | Modified (Task 14) |

---

## Task 1: A read accessor on the existing pend side channel

The spec asks `MarkerEditPlugin` to "expose its pending set to `Editor.tsx` through the phase-1 side channel". That channel already exists and already publishes the LIVE `Set` per editor (`registerPendedDisplayOwners`, called from `MarkerEditPlugin`'s registration effect at `MarkerEditPlugin.tsx:332`). It only lacks a reader that takes an editor instead of relying on `$getEditor()`. Adding that reader is the whole task — `MarkerEditPlugin.tsx` is not touched at all, which also keeps this wave off wave-3's heaviest file.

**Files:**
- Modify: `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts` (41 lines; add after `registerPendedDisplayOwners`, which ends at line 20)
- Test: `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.test.ts` (create)

**Interfaces:**
- Consumes: `registerPendedDisplayOwners(editor: LexicalEditor, pendedKeys: Set<NodeKey>): () => void` (`libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts:12`).
- Produces: `getPendedDisplayOwners(editor: LexicalEditor): ReadonlySet<NodeKey> | undefined` — exported from `shared` via the existing `export * from "./pendedDisplayOwners.utils.js";` at `libs/shared/src/nodes/usj/index.ts:19` (no barrel edit needed).

- [ ] **Step 1: Write the failing test**

Create `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.test.ts`:

```ts
import {
  getPendedDisplayOwners,
  registerPendedDisplayOwners,
} from "./pendedDisplayOwners.utils";
import { createEditor, LexicalEditor } from "lexical";

describe("getPendedDisplayOwners", () => {
  it("returns the live set the engine registered for that editor", () => {
    const editor: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    const pendedKeys = new Set<string>(["1"]);
    registerPendedDisplayOwners(editor, pendedKeys);

    const read = getPendedDisplayOwners(editor);
    expect(read?.has("1")).toBe(true);

    // LIVE, not a copy: a key the engine pends after registration is visible to the reader.
    pendedKeys.add("2");
    expect(getPendedDisplayOwners(editor)?.has("2")).toBe(true);
  });

  it("returns undefined for an editor with no engine registered, and after unregistering", () => {
    const editor: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    expect(getPendedDisplayOwners(editor)).toBeUndefined();

    const unregister = registerPendedDisplayOwners(editor, new Set<string>());
    expect(getPendedDisplayOwners(editor)).toBeDefined();
    unregister();
    expect(getPendedDisplayOwners(editor)).toBeUndefined();
  });

  it("keeps two editors' sets separate", () => {
    const main: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    const popover: LexicalEditor = createEditor({ onError: (error) => throwIt(error) });
    registerPendedDisplayOwners(main, new Set<string>(["main"]));
    registerPendedDisplayOwners(popover, new Set<string>(["popover"]));

    expect(getPendedDisplayOwners(main)?.has("popover")).toBe(false);
    expect(getPendedDisplayOwners(popover)?.has("main")).toBe(false);
  });
});

function throwIt(error: Error): never {
  throw error;
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run pendedDisplayOwners`
Expected: FAIL — `getPendedDisplayOwners` is not exported.

- [ ] **Step 3: Add the accessor**

In `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts`, immediately after `registerPendedDisplayOwners` (line 20):

```ts
/**
 * The live pending-owner set registered for `editor`, or `undefined` when no marker-edit engine is
 * mounted on it (a non-editable marker mode, or an editor that has torn down). The SAME mutable Set
 * the engine holds, not a snapshot — a reader that keeps the reference sees later pends — so
 * callers must treat it as read-only. Takes the editor explicitly rather than reading `$getEditor()`
 * so it can be called from outside a read/update (the editor-facing `getUsj()` path decides whether
 * to enter a read at all based on whether anything is pending).
 */
export function getPendedDisplayOwners(editor: LexicalEditor): ReadonlySet<NodeKey> | undefined {
  return pendedOwnersByEditor.get(editor);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run pendedDisplayOwners`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts libs/shared/src/nodes/usj/pendedDisplayOwners.utils.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): read the live pended-owner set by editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: One settle-scope definition, and the fragment builders the virtual settle needs

`$requestTier2ForNode` already encodes "which node owns this pending key's re-tokenization scope" as an inline walk. The virtual settle must ask exactly the same question, so the walk is extracted (behavior-preserving) instead of copied. `$buildNoteFragment` and `countSentinels` become exported for the same reason.

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` (1070 lines; `$buildParaFragment` doc at :505-510, `$buildNoteFragment` at :892, `countSentinels` at :599, `$requestTier2ForNode` at :1058)
- Test: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx` (existing — add one describe block)

**Interfaces:**
- Consumes: `$isNoteNode`, `$isUnknownNode`, `$isParaNode` from `shared`; `NoteNode`, `ParaNode` from `shared`.
- Produces:
  - `export function $settleScopeForNode(node: LexicalNode): ParaNode | NoteNode | undefined`
  - `export function $buildNoteFragment(note: NoteNode, getMarkerFn: MarkerLookup): { out: FragmentAccumulator; contentNodes: LexicalNode[] } | undefined` (was module-private)
  - `export function countSentinels(content: MarkerContent[]): number` (was module-private)
  - unchanged: `$buildParaFragment(para: ParaNode, getMarkerFn: MarkerLookup): FragmentAccumulator | undefined`

- [ ] **Step 1: Pin the current suite green before touching the file**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild`
Expected: PASS (both `tier2Rebuild.utils.test.tsx` and `tier2Rebuild.corpus.test.tsx`; corpus logs `checked 141 paragraph(s), 0 skip-listed`).

- [ ] **Step 2: Write the failing test**

Append to `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx` (add `$settleScopeForNode` to the existing `./tier2Rebuild.utils` import, and `$createNoteNode`/`$isNoteNode` to the existing `shared` import):

```tsx
describe("$settleScopeForNode", () => {
  it("returns the owning paragraph for a node in ordinary paragraph content", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const text = para.getLastChild();
      if (!text) throw new Error("expected paragraph text");
      expect($settleScopeForNode(text)).toBe(para);
    });
  });

  it("returns the NOTE, not its paragraph, for a node inside note content", async () => {
    const { editor } = await testEnvironment(() => {
      const note = $createNoteNode("f", "+");
      note.append($createMarkerNode("f"), $createTextNode("+"), $createTextNode("note body"));
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const note = para.getChildren().find($isNoteNode);
      if (!note) throw new Error("expected a NoteNode");
      const body = note.getLastChild();
      if (!body) throw new Error("expected note content");
      expect($settleScopeForNode(body)).toBe(note);
    });
  });

  it("returns undefined inside an opaque block, matching the Tier-2 bail", async () => {
    const { editor } = await testEnvironment(() => {
      const sidebar = $createUnknownNode("esb", "esb");
      sidebar.append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}inside`)),
      );
      $getRoot().append(sidebar);
    });
    editor.getEditorState().read(() => {
      const sidebar = $getRoot().getFirstChild();
      if (!$isUnknownNode(sidebar)) throw new Error("expected an UnknownNode");
      const para = sidebar.getFirstChild();
      if (!$isParaNode(para)) throw new Error("expected a nested ParaNode");
      const text = para.getLastChild();
      if (!text) throw new Error("expected paragraph text");
      expect($settleScopeForNode(text)).toBeUndefined();
    });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild.utils`
Expected: FAIL — `$settleScopeForNode` is not exported from `./tier2Rebuild.utils`.

- [ ] **Step 4: Extract the scope walk and widen the two exports**

In `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts`:

(a) Replace the body of `$requestTier2ForNode` (currently lines 1058-1070) with:

```ts
/**
 * The re-tokenization SCOPE a node belongs to: the expanded note whose content contains it, or
 * the paragraph that contains it — or `undefined` when it has neither (an opaque block interior,
 * where the bytes stay literal, or a detached node). Note content is checked FIRST because a note
 * inside a paragraph is its own scope: the note node, its marker glyphs, and its caller are
 * preserved across a rebuild while only its content re-tokenizes.
 *
 * The single definition of scope, shared by the mutating settle below and the read-only settle in
 * virtualSettle.utils.ts. Both must route a given pending key to the SAME scope, or the settled USJ
 * a consumer reads and the structure a later real settle produces would be derived from different
 * regions of the document.
 */
export function $settleScopeForNode(node: LexicalNode): ParaNode | NoteNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent()) {
    if ($isNoteNode(current)) return current;
    if ($isUnknownNode(current)) return undefined;
    if ($isParaNode(current)) return current;
  }
  return undefined;
}

/** Route a Tier-1-unexpressible edit to Tier 2 via its scope ({@link $settleScopeForNode}).
 * Returns whether the routed rebuild actually SPLICED — a guard-rail or fixed-point refusal mutates
 * nothing, and the deferred-resolution history bookkeeping ($resolvePendingMarkers callers) needs to
 * tell the two apart. */
export function $requestTier2ForNode(node: LexicalNode, context: Tier2Context): boolean {
  const scope = $settleScopeForNode(node);
  if (!scope) return false;
  return $isNoteNode(scope) ? $rebuildNoteContent(scope, context) : $rebuildParas([scope], context);
}
```

(b) Add `export` to `countSentinels` (line 599) and extend its doc:

```ts
/** U+FFFC occurrences across tokenized content — must equal the preserved-run count. Exported for
 * the read-only settle (virtualSettle.utils.ts), which runs the same symmetry bail-out before it
 * splices anything into its output. */
export function countSentinels(content: MarkerContent[]): number {
```

(c) Add `export` to `$buildNoteFragment` (line 892) and extend its doc's first paragraph with:

```
 * Exported for the read-only settle (virtualSettle.utils.ts): note content is its own settle scope,
 * and the settled output a consumer reads must be built from the SAME fragment the mutating rebuild
 * below would build. Every other caller in this module still reaches it through
 * `$rebuildNoteContent`.
```

(d) Replace `$buildParaFragment`'s export rationale (lines 505-510) with:

```ts
/**
 * Exported for two callers outside this module's own rebuild path. The read-only settle
 * (virtualSettle.utils.ts) builds the SAME fragment a mutating rebuild would, which is what makes
 * the settled USJ a consumer reads and the structure a later real settle produces one computation
 * rather than two implementations. A test also compares a loose-shape paragraph's fragment `.text`
 * against its hand-built wrapped-shape equivalent for byte-for-byte equality
 * (`tier2Rebuild.utils.test.tsx`) — the direct evidence that wrapping a run changes nothing about
 * what gets tokenized.
 */
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild`
Expected: PASS — the new describe block plus every pre-existing test, and the corpus still logs `checked 141 paragraph(s), 0 skip-listed`.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx
git commit -m "$(cat <<'EOF'
refactor(platform): extract the one settle-scope walk; widen the fragment builders

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: The virtual settle for paragraph scopes

**Files:**
- Create: `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts`
- Test: `packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx` (create)

**Interfaces:**
- Consumes: `$buildParaFragment(para, getMarkerFn): FragmentAccumulator | undefined`, `countSentinels(content): number`, `$settleScopeForNode(node): ParaNode | NoteNode | undefined`, `ATOMIC_SENTINEL: string`, `FragmentAccumulator`, `Tier2Context` — all from `./tier2Rebuild.utils` (Task 2); `usfmFragmentToUsjContent(text, options): MarkerContent[]` from `shared`; `usjEditorAdaptor.serializeEditorState(usj, viewOptions): SerializedEditorState` from `../adaptors/usj-editor.adaptor`; `editorUsjAdaptor.deserializeSerializedEditorState(state, viewOptions): Usj | undefined` from `../adaptors/editor-usj.adaptor`; `getPendedDisplayOwners(editor)` (Task 1) is called by the CALLER, not here.
- Produces: `export function $settledUsj(serializedState: SerializedEditorState, pendedKeys: ReadonlySet<NodeKey>, context: Tier2Context): Usj | undefined` — the settled document, or `undefined` when nothing settleable was pending (the caller then keeps its cached USJ). Must be called inside a `read()` of the editor state `serializedState` came from. Task 9 extends this signature with a fourth parameter, `transientInput?: TransientInput`; Tasks 3–8 use the three-parameter form.

- [ ] **Step 1: Write the failing test**

Create `packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx`:

```tsx
/**
 * The read-only settle: the USJ a Tier-2 settle WOULD produce, computed without touching the
 * editor. Each case drives a real pending edit through the mounted engine, reads the settled USJ,
 * and then asserts the editor itself is unchanged — the two halves of the contract.
 */
import { testEnvironment, viewOptions } from "./markerEdit.test-helpers";
import { $settledUsj } from "./virtualSettle.utils";
import { Tier2Context } from "./tier2Rebuild.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isMarkerNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
} from "shared";

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Read the settled USJ exactly as `Editor.tsx`'s `getUsj()` does. */
function settledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  const serializedState = editorState.toJSON();
  const pendedKeys = getPendedDisplayOwners(editor) ?? new Set<string>();
  return editorState.read(() => $settledUsj(serializedState, pendedKeys, context));
}

/** The `marker` of the USJ content entry at `index`, or undefined when it is not a marker object. */
function markerAt(usj: Usj | undefined, index: number): string | undefined {
  const entry = usj?.content[index];
  if (!entry || typeof entry === "string") return undefined;
  return (entry as MarkerObject).marker;
}

describe("$settledUsj — paragraph scopes", () => {
  it("returns undefined when nothing is pending, so the caller keeps its cached USJ", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });
    expect(settledUsjOf(editor)).toBeUndefined();
  });

  it("settles an abandoned in-place marker rename in the OUTPUT without mutating the editor", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });

    // Rename the `\p` glyph to `\q1` in place and leave it pending (no caret departure).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    expect(markerAt(settledUsjOf(editor), 0)).toBe("q1");

    // The editor is untouched: the paragraph is still `\p` with the pending literal on screen.
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      expect(para.getMarker()).toBe("p");
      expect(para.getTextContent()).toContain("\\q1");
    });
  });

  it("keeps a preserved node's own USJ in place where its U+FFFC placeholder stood", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}before `),
        $createUnknownNode("optbreak", "optbreak"),
        $createTextNode(" after"),
      );
      $getRoot().append(para);
    });

    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    expect(markerAt(settled, 0)).toBe("q1");
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const optbreakIndex = (para as MarkerObject).content?.findIndex(
      (entry) => typeof entry !== "string" && entry.type === "optbreak",
    );
    // The sentinel serialized IN PLACE: between the two text runs, not moved to an end.
    expect(optbreakIndex).toBe(1);
  });
});
```

Add the imports this file needs that are not already listed: `act` from `@testing-library/react`, `$createUnknownNode` from `shared`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run virtualSettle`
Expected: FAIL — cannot resolve `./virtualSettle.utils`.

- [ ] **Step 3: Write the implementation**

Create `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts`:

```ts
/**
 * The READ-ONLY settle. `EditorRef.getUsj()` must hand consumers the canonical document — the one a
 * Tier-2 settle would produce — while the user's pending edits stay pending on screen. Settling is
 * re-tokenization of displayed bytes, which is a pure computation, so this recomputes it into the
 * OUTPUT instead of mutating the editor: it runs the SAME fragment build + tokenize + serialize
 * pipeline `$rebuildParas`/`$rebuildNoteContent` run, over a throwaway JSON copy of the editor
 * state.
 *
 * The one half that cannot be literally shared with the mutating rebuild is materialization: a real
 * settle parses the tokenizer's output into live nodes and splices them into the tree, and Lexical
 * forbids creating nodes inside a `read()`. So the splice happens in the SERIALIZED domain here —
 * the same `usjEditorAdaptor.serializeEditorState` output the mutating path parses, spliced as JSON
 * — and one `editorUsjAdaptor.deserializeSerializedEditorState` over the patched document produces
 * the result, so text coalescing, implied-para flattening, and every display-byte exclusion gate
 * behave exactly as they do for an unsettled read. That divergence is the wave's named risk, and
 * `settledGetUsj.test.tsx`'s equivalence property is what holds the two halves together.
 *
 * Uniform by design: there is NO caret-held exception. A half-typed `|stuf` settles to literal
 * content in the output, because that is what those bytes mean to anything downstream that parses
 * them; the mutating settle's caret grace exists to avoid re-tokenizing under a live caret, which a
 * computation that never touches the tree cannot do.
 */

import editorUsjAdaptor from "../adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import {
  $buildParaFragment,
  $settleScopeForNode,
  ATOMIC_SENTINEL,
  countSentinels,
  FragmentAccumulator,
  Tier2Context,
} from "./tier2Rebuild.utils";
import {
  MarkerContent,
  USJ_TYPE,
  USJ_VERSION,
  Usj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getRoot,
  $isElementNode,
  LexicalNode,
  NodeKey,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import { $isNoteNode, NoteNode, ParaNode, usfmFragmentToUsjContent } from "shared";

/** Where a live node's serialized counterpart sits: the JSON node itself, plus the children array
 * holding it (the array a splice must target — its index is re-read at splice time, since earlier
 * splices into the same array shift positions). */
interface SerializedSite {
  readonly node: SerializedLexicalNode;
  readonly siblings: SerializedLexicalNode[];
}

/** A serialized element's children, or `undefined` for a leaf. */
function serializedChildren(node: SerializedLexicalNode): SerializedLexicalNode[] | undefined {
  const { children } = node as { children?: SerializedLexicalNode[] };
  return Array.isArray(children) ? children : undefined;
}

/** A serialized TextNode's text, or `undefined` for anything else. */
function serializedText(node: SerializedLexicalNode): string | undefined {
  const { text } = node as { text?: string };
  return typeof text === "string" ? text : undefined;
}

/**
 * Pair every live node with its serialized counterpart. `EditorState.toJSON()` exports children in
 * tree order, so a parallel walk is exact — and it is the only way to make the pairing, since
 * serialized nodes carry no keys.
 */
function $mapSerializedSites(
  liveNodes: LexicalNode[],
  serializedNodes: SerializedLexicalNode[],
  out: Map<NodeKey, SerializedSite>,
): void {
  const count = Math.min(liveNodes.length, serializedNodes.length);
  for (let index = 0; index < count; index++) {
    const live = liveNodes[index];
    const json = serializedNodes[index];
    out.set(live.getKey(), { node: json, siblings: serializedNodes });
    const children = serializedChildren(json);
    if (children && $isElementNode(live)) $mapSerializedSites(live.getChildren(), children, out);
  }
}

/** U+FFFC occurrences across a serialized tree — the serialize-side half of the symmetry bail-out
 * (`$rebuildParas` counts them on its parsed tree; there is no parsed tree here). */
function countSerializedSentinels(nodes: SerializedLexicalNode[]): number {
  let count = 0;
  for (const node of nodes) {
    const children = serializedChildren(node);
    if (children) {
      count += countSerializedSentinels(children);
      continue;
    }
    const text = serializedText(node);
    if (text !== undefined) for (const character of text) if (character === ATOMIC_SENTINEL) count++;
  }
  return count;
}

/**
 * Replace each U+FFFC in a freshly serialized rebuild tree with the serialized form of the
 * preserved node run it stands for, in fragment order — the JSON analogue of `$replaceSentinels`.
 * A placeholder's own text node is split around it, so a preserved node lands exactly where its
 * placeholder stood and never migrates to a block boundary.
 */
function replaceSerializedSentinels(
  roots: SerializedLexicalNode[],
  runs: SerializedLexicalNode[][],
): void {
  let queueIndex = 0;
  const visitList = (list: SerializedLexicalNode[]): void => {
    for (let index = 0; index < list.length; index++) {
      const node = list[index];
      const children = serializedChildren(node);
      if (children) {
        visitList(children);
        continue;
      }
      const text = serializedText(node);
      if (text === undefined || !text.includes(ATOMIC_SENTINEL)) continue;
      const pieces = text.split(ATOMIC_SENTINEL);
      const replacement: SerializedLexicalNode[] = [];
      pieces.forEach((piece, pieceIndex) => {
        if (pieceIndex > 0) replacement.push(...(runs[queueIndex++] ?? []));
        // Spread the placeholder's own node so a split piece keeps its format and node state
        // (a text run's textType tag rides there).
        if (piece.length > 0) replacement.push({ ...node, text: piece });
      });
      list.splice(index, 1, ...replacement);
      index += replacement.length - 1;
    }
  };
  visitList(roots);
}

/** The serialized counterparts of one fragment's preserved runs, or `undefined` when any node in
 * them has none (a shape the parallel walk could not pair — abort rather than drop a node). */
function serializedRunsOf(
  fragment: FragmentAccumulator,
  sites: Map<NodeKey, SerializedSite>,
): SerializedLexicalNode[][] | undefined {
  const runs: SerializedLexicalNode[][] = [];
  for (const run of fragment.sentinels) {
    const serializedRun: SerializedLexicalNode[] = [];
    for (const node of run) {
      const site = sites.get(node.getKey());
      if (!site) return undefined;
      serializedRun.push(site.node);
    }
    runs.push(serializedRun);
  }
  return runs;
}

/**
 * The serialized nodes a settled `para` becomes, or `undefined` when the settle refuses. Mirrors
 * `$rebuildParas`' guard sequence — guard rails, empty tokenizer output, sentinel symmetry — so a
 * paragraph the mutating rebuild would leave alone is left alone here too. The fixed-point
 * signature check is deliberately absent: refusing a no-op matters only when a splice would re-arm
 * a transform and loop, and nothing here mutates the editor, so splicing an identical result into
 * the output is simply the identity.
 */
function $settledParaNodes(
  para: ParaNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
): SerializedLexicalNode[] | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const fragment = $buildParaFragment(para, getMarkerFn);
  if (!fragment) return undefined;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragment.text, {
    getMarker: getMarkerFn,
  });
  if (content.length === 0) return undefined;
  if (countSentinels(content) !== fragment.sentinels.length) {
    logger?.warn("[MarkerEdit] Settled USJ skipped: sentinel/preserved-node count mismatch");
    return undefined;
  }
  const rebuilt = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  ).root.children;
  if (countSerializedSentinels(rebuilt) !== fragment.sentinels.length) {
    logger?.warn(
      "[MarkerEdit] Settled USJ skipped: serialized sentinel/preserved-node count mismatch",
    );
    return undefined;
  }
  const runs = serializedRunsOf(fragment, sites);
  if (!runs) {
    logger?.warn("[MarkerEdit] Settled USJ skipped: a preserved node had no serialized form");
    return undefined;
  }
  replaceSerializedSentinels(rebuilt, runs);
  return rebuilt;
}

/**
 * The settled USJ for the editor state `serializedState` was exported from, or `undefined` when
 * nothing settleable is pending (the caller keeps whatever it already has). Call INSIDE a
 * `read()` of that same state. `serializedState` is mutated in place and must therefore be a fresh
 * `toJSON()` result the caller does not otherwise hold.
 */
export function $settledUsj(
  serializedState: SerializedEditorState,
  pendedKeys: ReadonlySet<NodeKey>,
  context: Tier2Context,
): Usj | undefined {
  if (pendedKeys.size === 0) return undefined;

  const paraScopes = new Map<NodeKey, ParaNode>();
  const noteScopes = new Map<NodeKey, NoteNode>();
  for (const key of pendedKeys) {
    const node = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    const scope = $settleScopeForNode(node);
    if (!scope) continue;
    if ($isNoteNode(scope)) noteScopes.set(scope.getKey(), scope);
    else paraScopes.set(scope.getKey(), scope);
  }
  if (paraScopes.size === 0 && noteScopes.size === 0) return undefined;

  const sites = new Map<NodeKey, SerializedSite>();
  $mapSerializedSites($getRoot().getChildren(), serializedState.root.children, sites);

  for (const para of paraScopes.values()) {
    const site = sites.get(para.getKey());
    if (!site) continue;
    const rebuilt = $settledParaNodes(para, sites, context);
    if (!rebuilt) continue;
    const index = site.siblings.indexOf(site.node);
    if (index < 0) continue;
    site.siblings.splice(index, 1, ...rebuilt);
  }

  return editorUsjAdaptor.deserializeSerializedEditorState(serializedState, context.viewOptions);
}
```

Note: `noteScopes` is collected but not yet consumed — Task 5 adds the note pass. Leave the collection in place; a pending key inside a note simply does not settle until then, which is the pre-wave behavior for that shape.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run virtualSettle`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the corpus and the marker-edit suites**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEdit tier2Rebuild`
Expected: PASS; corpus logs `checked 141 paragraph(s), 0 skip-listed`.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/markerEdit/virtualSettle.utils.ts packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx
git commit -m "$(cat <<'EOF'
feat(platform): compute settled USJ for pended paragraphs without mutating the editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `getUsj()` returns settled USJ

**Files:**
- Modify: `packages/platform/src/editor/Editor.tsx` (614 lines; `getUsj()` at :256-258, imports at :57-113)
- Modify: `packages/platform/src/editor/editor.model.ts` (292 lines; `getUsj` doc at :54-55, `commitPendingMarkerEdits` doc at :56-73)
- Test: `packages/platform/src/editor/Editor.test.tsx` (existing; the pin at :385-430)

**Interfaces:**
- Consumes: `getPendedDisplayOwners(editor): ReadonlySet<NodeKey> | undefined` (Task 1); `$settledUsj(serializedState, pendedKeys, context): Usj | undefined` (Task 3); `markerLookup: MarkerLookup` (`Editor.tsx:182`), `viewOptions: ViewOptions` (`Editor.tsx:179`), `logger` (prop).
- Produces: `EditorRef.getUsj(): Usj | undefined` — now always the SETTLED document.

- [ ] **Step 1: Write the failing test**

In `packages/platform/src/editor/Editor.test.tsx`, replace line 422 and its comment, and add a no-mutation assertion after it. The block from line 419 becomes:

```tsx
    const root = lexical.getRootElement();
    if (!root) throw new Error("editor root not found");
    act(() => root.blur());
    // Settled without settling: the host reads the canonical marker even though the rename is
    // still pending.
    expect(paraMarkerOf(ref.current?.getUsj())).toBe("q1");

    // ...and the editor still shows the pending literal — reading the USJ mutated nothing.
    lexical.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      expect(para.getMarker()).toBe("p");
      expect(para.getTextContent()).toContain("\\q1");
    });

    act(() => {
      ref.current?.commitPendingMarkerEdits();
    });

    // Synchronously fresh - the host save reads getUsj() right after committing.
    expect(paraMarkerOf(ref.current?.getUsj())).toBe("q1");
```

Also rename the test to `settles an abandoned mid-rename in the output, leaving the editor pending`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run Editor.test`
Expected: FAIL — `expected 'p' to be 'q1'` at the first `paraMarkerOf` assertion.

- [ ] **Step 3: Wire the settle into `getUsj()`**

In `packages/platform/src/editor/Editor.tsx`:

(a) Add to the `./markerEdit/...` import group (after line 19's `MarkerEditPlugin` import):

```tsx
import { $settledUsj } from "./markerEdit/virtualSettle.utils";
```

(b) Add `getPendedDisplayOwners,` to the alphabetical `from "shared"` import list (between `externalTypedMarkType,` at line 64 and `LoggerBasic,` at line 65).

(c) Replace `getUsj()` (lines 256-258) with:

```tsx
    getUsj() {
      const editor = editorRef.current;
      if (!editor) return editedUsjRef.current;
      // Nothing pending: the cached serialization IS the settled document, and skipping the
      // recompute keeps the common read as cheap as it has always been.
      const pendedKeys = getPendedDisplayOwners(editor);
      if (!pendedKeys || pendedKeys.size === 0) return editedUsjRef.current;
      // `getEditorState().read`, NOT `editor.read` - the latter force-flushes any in-flight update
      // mid-dispatch, and this is called from host save paths that can run during one.
      const editorState = editor.getEditorState();
      const serializedState = editorState.toJSON();
      return (
        editorState.read(() =>
          $settledUsj(serializedState, pendedKeys, {
            viewOptions,
            getMarker: markerLookup,
            logger,
          }),
        ) ?? editedUsjRef.current
      );
    },
```

- [ ] **Step 4: Update the `EditorRef` contract docs**

In `packages/platform/src/editor/editor.model.ts`, replace lines 54-55 with:

```ts
  /**
   * Get USJ Scripture data — always SETTLED, whatever the screen currently shows mid-edit. In
   * editable marker modes a marker rename, a typed marker literal, or an edited display run stays
   * pending in the document until the caret departs; this returns the document those bytes MEAN
   * (the same re-tokenization a departure settle performs), computed without touching the editor,
   * so the user's edit stays pending on screen and their caret and undo history are untouched.
   * Settling is uniform: a half-typed `|stuf` settles to literal content, because that is what
   * those bytes mean to anything that parses them.
   */
  getUsj(): Usj | undefined;
```

And replace the first paragraph of `commitPendingMarkerEdits`' doc (lines 57-61) with:

```ts
  /**
   * Settle pending mid-edit marker text (Standard view's marker-editing engine) IN THE DOCUMENT,
   * so the screen shows the finished structure. NOT required before reading the USJ to save —
   * {@link EditorRef.getUsj} already returns settled output — so a host that only needs canonical
   * USJ should not call this at all: it mutates the document, which pushes a history entry and can
   * re-settle content the user just undid.
   */
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run Editor.test virtualSettle`
Expected: PASS.

- [ ] **Step 6: Run the whole platform package**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run`
Expected: PASS, corpus 141/141 with 0 skips. If any other test asserted STALE `getUsj()` output, it is now testing a retired contract — update it to the settled expectation and note the change in the commit body.

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src/editor/Editor.tsx packages/platform/src/editor/editor.model.ts packages/platform/src/editor/Editor.test.tsx
git commit -m "$(cat <<'EOF'
feat(platform): getUsj returns settled USJ without mutating the editor

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Expanded-note scopes

A pending key inside an expanded note belongs to the NOTE's re-tokenization scope, not its paragraph's — and a note that also rides inside a settling paragraph is preserved there as a sentinel, so the note pass must run FIRST and rewrite the very serialized subtree the paragraph pass then reuses.

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts` (Task 3)
- Test: `packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx` (Task 3)

**Interfaces:**
- Consumes: `$buildNoteFragment(note, getMarkerFn): { out: FragmentAccumulator; contentNodes: LexicalNode[] } | undefined` (Task 2); `$isMarkerNode`, `textTypeState` from `shared`; `$getState` from `lexical`.
- Produces: no new exported surface — `$settledUsj`'s existing signature now also settles note scopes.

- [ ] **Step 1: Write the failing test**

Append to `packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx`:

```tsx
describe("$settledUsj — expanded note scopes", () => {
  it("settles a typed marker literal inside expanded note content", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      note.append(
        $createMarkerNode("f"),
        $createTextNode("+"),
        $createTextNode("note body"),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });

    // Type a complete char-span literal into the note content and leave it pending.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const body = note.getChildren()[2];
        if (!body) throw new Error("expected note body text");
        body.setTextContent("note \\nd body\\nd*");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The literal became a real char span in the OUTPUT; the note node, marker and caller survive.
    expect((note as MarkerObject).marker).toBe("f");
    expect((note as MarkerObject).caller).toBe("+");
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "nd",
      ),
    ).toBe(true);

    // The editor still holds the literal.
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\nd body\\nd*");
    });
  });
});
```

Add `testEnvironmentExpanded` to the `./markerEdit.test-helpers` import and `$createNoteNode`, `$isNoteNode` to the `shared` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run virtualSettle`
Expected: FAIL — the note's content still contains the literal string, no `char` entry.

- [ ] **Step 3: Add the note pass**

In `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts`, add `$buildNoteFragment` to the `./tier2Rebuild.utils` import and `import { ViewOptions } from "shared-react";` to the imports, then insert this function above `$settledUsj`. The `\p`-wrapper unwrap below reads the serialized node-state key Lexical writes (`$`) rather than calling `$isMarkerNode`/`$getState`, because it runs on JSON, not on parsed nodes:

```ts
/**
 * The serialized nodes a settled note's CONTENT becomes, paired with the live content nodes they
 * replace — or `undefined` when the settle refuses. Mirrors `$rebuildNoteContent`: content is
 * tokenized in note context, re-serialized with expanded notes so char spans come back inline, and
 * the tokenizer's default `\p` wrapper (plus the visible para prefix glyph and its trailing space)
 * is unwrapped, since none of that belongs inside a note.
 */
function $settledNoteContent(
  note: NoteNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
): { rebuilt: SerializedLexicalNode[]; contentNodes: LexicalNode[] } | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn);
  if (!built) return undefined;
  const { out, contentNodes } = built;
  if (contentNodes.length === 0) return undefined;
  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text, {
    getMarker: getMarkerFn,
    isNoteContext: true,
  });
  if (content.length === 0) return undefined;
  if (countSentinels(content) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: sentinel/preserved-node count mismatch");
    return undefined;
  }
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const topLevel = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    noteViewOptions,
  ).root.children;
  const wrapperChildren = topLevel.length === 1 ? serializedChildren(topLevel[0]) : undefined;
  if (!wrapperChildren) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: unexpected serialized shape");
    return undefined;
  }
  let contentStart = 0;
  if (wrapperChildren[0]?.type === "marker") {
    contentStart = 1;
    const second = wrapperChildren[1];
    const secondState = second as { $?: { textType?: string } };
    if (second && second.type !== "marker" && secondState.$?.textType === "marker-trailing-space")
      contentStart = 2;
  }
  const rebuilt = wrapperChildren.slice(contentStart);
  if (rebuilt.length === 0) return undefined;
  if (countSerializedSentinels(rebuilt) !== out.sentinels.length) {
    logger?.warn(
      "[MarkerEdit] Settled note USJ skipped: serialized sentinel/preserved-node count mismatch",
    );
    return undefined;
  }
  const runs = serializedRunsOf(out, sites);
  if (!runs) {
    logger?.warn("[MarkerEdit] Settled note USJ skipped: a preserved node had no serialized form");
    return undefined;
  }
  replaceSerializedSentinels(rebuilt, runs);
  return { rebuilt, contentNodes };
}
```

Then, in `$settledUsj`, insert this loop between `$mapSerializedSites(...)` and the paragraph loop:

```ts
  // Notes FIRST: a settled note that also rides inside a settling paragraph is preserved there as
  // a sentinel, and the paragraph pass substitutes the very serialized subtree this pass has just
  // rewritten in place — so the paragraph's output carries the settled note, not the pending one.
  for (const note of noteScopes.values()) {
    const site = sites.get(note.getKey());
    const noteChildren = site ? serializedChildren(site.node) : undefined;
    if (!noteChildren) continue;
    const built = $settledNoteContent(note, sites, context);
    if (!built) continue;
    const firstSite = sites.get(built.contentNodes[0].getKey());
    if (!firstSite) continue;
    const start = noteChildren.indexOf(firstSite.node);
    if (start < 0) continue;
    noteChildren.splice(start, built.contentNodes.length, ...built.rebuilt);
  }
```

`ViewOptions` is the only new import this step needs beyond `$buildNoteFragment`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run virtualSettle`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the note rebuild and popover suites**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run noteContentRebuild note-ops-popover-roundtrip`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/markerEdit/virtualSettle.utils.ts packages/platform/src/editor/markerEdit/virtualSettle.utils.test.tsx
git commit -m "$(cat <<'EOF'
feat(platform): settle expanded-note content in getUsj output

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Uniform settling — no caret-held exception

**Files:**
- Create: `packages/platform/src/editor/settledGetUsj.test-helpers.tsx`
- Create: `packages/platform/src/editor/settledGetUsj.test.tsx`

**Interfaces:**
- Consumes: `EditorRef.getUsj()` (Task 4), `EditorRef.commitPendingMarkerEdits()`; `Editor` from `./Editor`.
- Produces (from the helpers file, reused by Tasks 7, 8 and 9 — a plain module, NOT a `.test.` file, so importing it never re-registers another suite's `describe` blocks; mirrors the existing `markerEdit.test-helpers.tsx` convention):
  - `requireStandardViewOptions(): ViewOptions`
  - `mountStandardViewEditor(usj: Usj): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }>`
  - `spanUsj: Usj`

- [ ] **Step 1: Write the shared harness**

Create `packages/platform/src/editor/settledGetUsj.test-helpers.tsx`:

```tsx
/**
 * Shared harness for the settled-output suites: one Standard-view `Editor` mount behind its public
 * `EditorRef`, plus the raw Lexical editor the tests drive edits through. A plain helper module
 * rather than an export from one of the suites, so a suite that needs it does not re-register the
 * other suite's tests by importing it.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import { LexicalEditor } from "lexical";
import { createRef, ReactElement, RefObject } from "react";
import { getViewOptions, STANDARD_VIEW_MODE, ViewOptions } from "shared-react";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing asserts on), same as the marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

export function requireStandardViewOptions(): ViewOptions {
  const options = getViewOptions(STANDARD_VIEW_MODE);
  if (!options) throw new Error("Standard view options are required for these tests.");
  return options;
}

export const spanUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "start ",
        { type: "char", marker: "nd", content: ["name"] },
        " end",
      ],
    },
    { type: "para", marker: "p", content: ["a second paragraph to depart to"] },
  ],
};

/** Mount `Editor` in Standard view and hand back its public ref plus the raw Lexical editor. */
export async function mountStandardViewEditor(
  usj: Usj,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  const capture: ReactElement = <EditorRefPlugin editorRef={lexicalRef} />;
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={usj} options={{ view: requireStandardViewOptions() }}>
        {capture}
      </Editor>,
    );
  });
  if (!lexicalRef.current) throw new Error("lexical editor was not captured");
  return { ref, lexical: lexicalRef.current };
}
```

- [ ] **Step 2: Write the failing test**

Create `packages/platform/src/editor/settledGetUsj.test.tsx`:

```tsx
/**
 * `getUsj()` is settled, uniformly and without side effects. Uniform means there is no caret-held
 * exception: a half-typed attribute run settles to the literal content those bytes mean, even while
 * the caret sits inside it. Without side effects means the editor still shows the pending edit
 * afterwards — reading the document must never settle it under the user.
 */
import { mountStandardViewEditor, spanUsj } from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isTextNode } from "lexical";
import { $isCharNode, $isParaNode } from "shared";

/** The `\nd` span's USJ entry in a doc shaped like `spanUsj`, or undefined when it is gone. */
function ndSpanOf(usj: Usj | undefined): MarkerObject | undefined {
  const para = usj?.content[2];
  if (!para || typeof para === "string") return undefined;
  const span = (para as MarkerObject).content?.find(
    (entry) => typeof entry !== "string" && entry.type === "char",
  );
  return span && typeof span !== "string" ? span : undefined;
}

describe("settled getUsj — uniform settling", () => {
  it("settles a half-typed attribute run to literal content while the caret is still inside it", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    // Type `|stuf` at the end of the span's content and leave the caret in it.
    await act(async () => {
      lexical.update(() => {
        const span = $getRoot().getAllTextNodes().find((node) => $isCharNode(node.getParent()));
        if (!span || !$isTextNode(span)) throw new Error("span content text not found");
        const typed = `${span.getTextContent()}|stuf`;
        span.setTextContent(typed);
        span.select(typed.length, typed.length);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Settled: the half-typed run is literal CONTENT of the span, not an attribute, and the span
    // carries no invented attribute.
    const span = ndSpanOf(ref.current?.getUsj());
    expect(span?.content?.[0]).toContain("|stuf");
    expect(Object.keys(span ?? {})).not.toContain("stuf");

    // Still pending on screen: the editor holds the typed bytes, untouched.
    lexical.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("|stuf");
    });
  });

  it("leaves the document pending after a read, so a later commit still has work to do", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    await act(async () => {
      lexical.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!glyph) throw new Error("expected a prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    const before = ref.current?.getUsj();
    const beforeText = lexical.getEditorState().read(() => $getRoot().getTextContent());
    // Reading twice must be idempotent AND side-effect free.
    expect(ref.current?.getUsj()).toEqual(before);
    expect(lexical.getEditorState().read(() => $getRoot().getTextContent())).toBe(beforeText);

    act(() => ref.current?.commitPendingMarkerEdits());
    // The commit is what actually changes the DOCUMENT.
    expect(lexical.getEditorState().read(() => $getRoot().getTextContent())).not.toBe(beforeText);
  });
});
```

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run settledGetUsj`
Expected: PASS if Tasks 3–4 are correct. This suite is a CONTRACT pin, so apply the revert test rather than accepting a green-on-first-run: temporarily change `getUsj()` in `Editor.tsx` to `return editedUsjRef.current;` unconditionally, re-run, confirm BOTH tests fail, then restore the implementation and re-run to green. Record the observed failure messages in the commit body.

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/settledGetUsj.test-helpers.tsx packages/platform/src/editor/settledGetUsj.test.tsx
git commit -m "$(cat <<'EOF'
test(platform): pin uniform, side-effect-free settled getUsj output

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: The one-code-path equivalence property

The named risk of this wave is that the virtual settle's materialize half drifts from the real one. This property is the net: over a corpus of pending-edit shapes, with the caret DEPARTED (the precondition — the mutating settle's caret-grace arms deliberately re-pend a caret-held run, which the uniform virtual settle does not, and Task 6 pins that difference separately), the settled `getUsj()` must equal the USJ after driving the real settle.

**Files:**
- Modify: `packages/platform/src/editor/settledGetUsj.test.tsx` (Task 6)

**Interfaces:**
- Consumes: `mountStandardViewEditor(usj)` from `./settledGetUsj.test-helpers` (Task 6); `EditorRef.getUsj()`, `EditorRef.commitPendingMarkerEdits()`.
- Produces: `pendingShapes: PendingShape[]` and `$textContaining(needle)` inside `settledGetUsj.test.tsx`, reused by Task 8's describe block in the same file.

- [ ] **Step 1: Write the failing test**

Append to `packages/platform/src/editor/settledGetUsj.test.tsx`:

```tsx
/** One pending-edit shape: how to create it, from a document the harness loads. */
interface PendingShape {
  readonly name: string;
  readonly usj: Usj;
  readonly $edit: () => void;
}

const twoParaUsj = (first: MarkerObject["content"]): Usj => ({
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: first },
    { type: "para", marker: "p", content: ["depart here"] },
  ],
});

/** The first paragraph's text node whose content includes `needle`. */
function $textContaining(needle: string) {
  const node = $getRoot().getAllTextNodes().find((text) => text.getTextContent().includes(needle));
  if (!node) throw new Error(`no text node containing ${JSON.stringify(needle)}`);
  return node;
}

const pendingShapes: PendingShape[] = [
  {
    name: "para marker renamed in place",
    usj: twoParaUsj(["body text"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const glyph = para.getFirstChild();
      if (!glyph) throw new Error("expected a prefix glyph");
      glyph.setTextContent("\\q1");
    },
  },
  {
    name: "half-typed attribute run appended to a char span",
    usj: twoParaUsj(["start ", { type: "char", marker: "nd", content: ["name"] }, " end"]),
    $edit: () => $textContaining("name").setTextContent(" name|stuf"),
  },
  {
    name: "settled attribute run deleted from a char span",
    usj: twoParaUsj([
      "start ",
      { type: "char", marker: "nd", content: ["name"], stuff: "thing" },
      " end",
    ]),
    $edit: () => $textContaining('|stuff="thing"').remove(),
  },
  {
    name: "marker literal typed mid-paragraph",
    usj: twoParaUsj(["plain body"]),
    $edit: () => $textContaining("plain body").setTextContent("plain \\nd body\\nd* tail"),
  },
  {
    name: "verse alt-number run deleted",
    usj: twoParaUsj([
      { type: "verse", marker: "v", number: "1", altnumber: "2" },
      "verse body",
    ]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const wrapper = para.getChildren().find($isAttributeRunNode);
      if (!wrapper) throw new Error("expected an AttributeRunNode");
      wrapper.remove();
    },
  },
  {
    name: "optbreak display text deleted",
    usj: twoParaUsj(["before ", { type: "optbreak" }, " after"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const optbreak = para.getChildren().find($isUnknownNode);
      if (!optbreak) throw new Error("expected an UnknownNode");
      optbreak.getChildren().forEach((child) => child.remove());
    },
  },
];

describe("settled getUsj — virtual settle equals the real settle", () => {
  it.each(pendingShapes)("$name", async ({ usj, $edit }) => {
    const { ref, lexical } = await mountStandardViewEditor(usj);

    await act(async () => {
      lexical.update($edit);
      await Promise.resolve();
      await Promise.resolve();
    });

    // Depart: park the caret in the SECOND paragraph, then blur, so the real settle below has no
    // caret-held grace arm to take and both halves are settling the same thing.
    await act(async () => {
      lexical.update(() => {
        $textContaining("depart here").select(0, 0);
      });
      await Promise.resolve();
    });
    const root = lexical.getRootElement();
    if (!root) throw new Error("editor root not found");
    act(() => root.blur());

    const virtualUsj = ref.current?.getUsj();

    act(() => ref.current?.commitPendingMarkerEdits());
    const realUsj = ref.current?.getUsj();

    expect(virtualUsj).toEqual(realUsj);
  });
});
```

Add `$isAttributeRunNode` and `$isUnknownNode` to the `shared` import.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run settledGetUsj`
Expected: this is a property test over already-implemented behavior, so treat a green first run as unproven. Verify falsifiability the same way as Task 6: temporarily make `getUsj()` return `editedUsjRef.current` unconditionally, re-run, and confirm EVERY shape fails. Restore and re-run to green.

If a shape fails for real after restoring, that is the wave's central risk materializing — do NOT weaken the property. Diagnose which half diverged by printing both USJ documents, and fix `virtualSettle.utils.ts` so it matches the mutating path.

- [ ] **Step 3: Commit**

```bash
git add packages/platform/src/editor/settledGetUsj.test.tsx
git commit -m "$(cat <<'EOF'
test(platform): pin virtual-settle/real-settle equivalence over pending-edit shapes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: The standing acceptance — settled output is a Tier-2 fixed point

**Files:**
- Modify: `packages/platform/src/editor/settledGetUsj.test-helpers.tsx` (Task 6)
- Modify: `packages/platform/src/editor/settledGetUsj.test.tsx` (Tasks 6, 7)

**Interfaces:**
- Consumes: `pendingShapes` (Task 7) and `mountStandardViewEditor`/`requireStandardViewOptions` (Task 6); `serializeEditorState` from `./adaptors/usj-editor.adaptor`, `$rebuildParas`/`Tier2Context` from `./markerEdit/tier2Rebuild.utils`, `createBasicTestEnvironment` from `libs/shared/src/nodes/usj/test.utils`, `usjReactNodes` from `shared-react`.
- Produces (added to the helpers file, reused by Task 9): `expectTier2FixedPoint(usj: Usj): void` — re-loads settled output into a fresh headless editor and asserts no paragraph rebuilds.

- [ ] **Step 1: Add the fixed-point assertion to the shared harness**

Append to `packages/platform/src/editor/settledGetUsj.test-helpers.tsx`:

```tsx
/** Load `usj` into a fresh headless standard-view editor; mirrors tier2Rebuild.corpus.test.tsx. */
function loadHeadless(usj: Usj): LexicalEditor {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, requireStandardViewOptions());
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

/**
 * Assert `usj` is a Tier-2 fixed point: re-loaded on its own, every paragraph REFUSES a rebuild
 * (returns false) and mutates nothing. Anything else means a consumer was handed USJ that still had
 * settling left in it, which is the standing acceptance for settled output.
 */
export function expectTier2FixedPoint(usj: Usj): void {
  const headless = loadHeadless(usj);
  const context: Tier2Context = {
    viewOptions: requireStandardViewOptions(),
    getMarker: bundledGetMarker,
  };
  const changed: string[] = [];
  headless.update(
    () => {
      $getRoot()
        .getChildren()
        .filter($isParaNode)
        .forEach((para, index) => {
          if ($rebuildParas([para], context)) changed.push(`#${index} \\${para.getMarker()}`);
        });
    },
    { discrete: true },
  );
  expect(changed).toEqual([]);
}
```

Add the imports the helpers file now needs: `initialize as initializeSerialize, reset, serializeEditorState` from `./adaptors/usj-editor.adaptor`; `$rebuildParas, Tier2Context` from `./markerEdit/tier2Rebuild.utils`; `$getRoot` from `lexical`; `$isParaNode, getMarker as bundledGetMarker, TypedMarkNode` from `shared`; `usjReactNodes` from `shared-react`; `expect` from `vitest`; and the deep test-utils import with the boundary escape the corpus test already uses:

```tsx
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";
```

- [ ] **Step 2: Write the failing test**

Append to `packages/platform/src/editor/settledGetUsj.test.tsx` (adding `expectTier2FixedPoint` to the existing `./settledGetUsj.test-helpers` import):

```tsx
describe("settled getUsj — output is always a Tier-2 fixed point", () => {
  it.each(pendingShapes)("$name", async ({ usj, $edit }) => {
    const { ref, lexical } = await mountStandardViewEditor(usj);
    await act(async () => {
      lexical.update($edit);
      await Promise.resolve();
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    if (!settled) throw new Error("expected settled USJ");
    expectTier2FixedPoint(settled);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run settledGetUsj`
Expected: falsifiability check as in Tasks 6–7 (unconditional `editedUsjRef.current` → every shape reports a changed paragraph). Then restore and confirm green.

A genuine failure here names a shape whose settled output still re-tokenizes — fix `virtualSettle.utils.ts` (or the scope walk) rather than skip-listing it. The corpus test's skip-list convention (named mechanism, never a blind skip) applies to this property too.

- [ ] **Step 4: Run the whole platform package**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run`
Expected: PASS, corpus 141/141 with 0 skips.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/settledGetUsj.test-helpers.tsx packages/platform/src/editor/settledGetUsj.test.tsx
git commit -m "$(cat <<'EOF'
test(platform): pin settled getUsj output as a Tier-2 fixed point

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: The transient-input API

An in-editor command surface can have input in flight that it — not the document — owns: the marker palette's trigger literal (`\` + typed filter) sits in the paragraph only until the palette's apply consumes it or the session is dismissed. Settled `getUsj()` would otherwise tokenize those bytes into a real structure (an unknown marker in body text tokenizes as a PARAGRAPH), and a save taken mid-session would write that garbage paragraph to disk.

The fix is a first-class declaration, the analogue of an IME composition string: the surface tells the editor which in-progress bytes it will consume or discard, and the settle subtracts exactly those bytes from the fragment before tokenizing. Nothing else changes — not the editor state, not the screen, not `onUsjChange`, not the OT deltas.

**The declaration is advisory, and its verification is the load-bearing safety property.** At every `getUsj()` the editor re-resolves the declaration against the live caret and the live node text. If it does not verify — the caret moved off the node, the bytes before the caret are not exactly the declared run, the node is gone or already settled, or the host simply forgot to clear — the editor IGNORES the declaration and settles normally. The asymmetry is deliberate: a stale declaration costs at most one save containing a visible phantom marker the user can see and delete, whereas a declaration trusted blindly could silently delete real user content. Never trade the second risk for the first.

**Where the declaration lives, and why not the `pendedDisplayOwners` side channel.** That WeakMap exists because its writer (the platform marker-edit engine) and its readers (the self-healing syncs in `shared`/`shared-react`) sit on opposite sides of a module boundary that forbids a direct import — an editor-scoped side channel is the workaround for an import cycle, not a preferred pattern. The transient declaration has no such constraint: its writer (`Editor.tsx`) and its reader (`virtualSettle.utils.ts`) are both in `packages/platform`. So it lives in a `useRef` on the `Editor` component and is threaded explicitly into the one call that needs it. That keeps per-editor scoping automatic (the ref is per component instance, so the main editor and the footnote popover cannot see each other's declaration), needs no unmount bookkeeping, and — decisively — keeps `$settledUsj` a pure function of its arguments, which is exactly what the equivalence and fixed-point properties in Tasks 7–8 depend on.

**Files:**
- Modify: `packages/platform/src/editor/editor.model.ts` (the `EditorRef` members added in Task 4)
- Modify: `packages/platform/src/editor/Editor.tsx` (the `getUsj()` from Task 4; refs at :152-159)
- Modify: `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts` (Tasks 3, 5)
- Test: `packages/platform/src/editor/transientInput.test.tsx` (create)

**Interfaces:**
- Consumes: `$buildParaFragment`/`$buildNoteFragment` → `FragmentAccumulator` with `spans: FragmentSpan[]` (`{ key, start, end, isSentinel }`, absolute offsets into `fragment.text`) from `./tier2Rebuild.utils`; `$settleScopeForNode` (Task 2); `mountStandardViewEditor`, `expectTier2FixedPoint` from `./settledGetUsj.test-helpers` (Tasks 6, 8).
- Produces:
  - `export type TransientInput = { kind: "marker-literal"; run: string };` (in `editor.model.ts`)
  - `setTransientInput(input: TransientInput | undefined): void;` on `EditorRef`
  - `$settledUsj(serializedState: SerializedEditorState, pendedKeys: ReadonlySet<NodeKey>, context: Tier2Context, transientInput?: TransientInput): Usj | undefined` — the Task-3 function, extended with a fourth parameter.

- [ ] **Step 1: Write the failing test**

Create `packages/platform/src/editor/transientInput.test.tsx`:

```tsx
/**
 * `setTransientInput` — in-progress input an in-editor command surface owns. While declared, the
 * settled output excludes those bytes; the document keeps them for the surface to consume. The
 * declaration is re-verified at every read, and every way it can go stale must degrade to "ignored,
 * settle normally" — a visible phantom marker in one save, never silently dropped content.
 */
import { expectTier2FixedPoint, mountStandardViewEditor } from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $setSelection, TextNode } from "lexical";

const paletteUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: ["tell them"] },
    { type: "para", marker: "p", content: ["a second paragraph"] },
  ],
};

/** Every text string anywhere in `usj`, flattened — what the save would actually carry. */
function allText(usj: Usj | undefined): string {
  const out: string[] = [];
  const walk = (content: MarkerObject["content"]): void => {
    content?.forEach((entry) => {
      if (typeof entry === "string") out.push(entry);
      else walk(entry.content);
    });
  };
  walk(usj?.content);
  return out.join("|");
}

/** Every top-level `para` marker in `usj`, in order. */
function paraMarkers(usj: Usj | undefined): (string | undefined)[] {
  return (usj?.content ?? [])
    .filter((entry): entry is MarkerObject => typeof entry !== "string" && entry.type === "para")
    .map((entry) => entry.marker);
}

/** The first text node whose content includes `needle`. */
function $textContaining(needle: string): TextNode {
  const node = $getRoot().getAllTextNodes().find((text) => text.getTextContent().includes(needle));
  if (!node) throw new Error(`no text node containing ${JSON.stringify(needle)}`);
  return node;
}

/** Type `run` at the end of the first paragraph's body and leave the caret right after it —
 * the exact shape a passive palette session produces, one keystroke at a time. */
async function typePaletteLiteral(
  lexical: Awaited<ReturnType<typeof mountStandardViewEditor>>["lexical"],
  run: string,
): Promise<void> {
  await act(async () => {
    lexical.update(() => {
      const body = $textContaining("tell them");
      const typed = `tell them${run}`;
      body.setTextContent(typed);
      body.select(typed.length, typed.length);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("setTransientInput — declared input is excluded from settled output", () => {
  it("omits the declared run and still yields a Tier-2 fixed point", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("\\q1");
    expect(allText(settled)).toContain("tell them");
    // No phantom paragraph: the document settles as if the trigger had never been typed.
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
    expectTier2FixedPoint(settled ?? { type: "USJ", version: "3.1", content: [] });

    // The document still holds the literal for the palette's apply to consume.
    lexical.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\q1");
    });
  });

  it("settles the literal into structure once the declaration is cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "p"]);

    act(() => ref.current?.setTransientInput(undefined));

    // Undeclared, the same bytes mean what they say: a new `\q1` paragraph.
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("tracks the filter across keystrokes when the host re-declares each time", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\" }));
    await typePaletteLiteral(lexical, "\\");
    expect(allText(ref.current?.getUsj())).not.toContain("\\");

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q" }));
    await typePaletteLiteral(lexical, "\\q");
    expect(allText(ref.current?.getUsj())).not.toContain("\\q");

    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");
    const settled = ref.current?.getUsj();
    expect(allText(settled)).not.toContain("\\q");
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
    expectTier2FixedPoint(settled ?? { type: "USJ", version: "3.1", content: [] });
  });
});

describe("setTransientInput — a stale declaration is ignored, never trusted", () => {
  it("ignores it when the caret has moved off the declared node", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => {
        $textContaining("a second paragraph").select(0, 0);
      });
      await Promise.resolve();
    });

    // Nothing dropped: the bytes settle to what they say, phantom paragraph and all.
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("ignores it when the bytes before the caret are not the declared run", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    // The user typed one more character than the host declared.
    await typePaletteLiteral(lexical, "\\q12");

    expect(allText(ref.current?.getUsj())).toContain("2");
    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q12", "p"]);
  });

  it("ignores it when there is no caret at all", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    await act(async () => {
      lexical.update(() => $setSelection(null));
      await Promise.resolve();
    });

    expect(paraMarkers(ref.current?.getUsj())).toEqual(["p", "q1", "p"]);
  });

  it("ignores it when the literal is already gone and the host never cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    // The palette's apply consumed the literal; the host forgot to clear the declaration.
    await act(async () => {
      lexical.update(() => {
        const body = $textContaining("tell them");
        body.setTextContent("tell them");
        body.select(9, 9);
      });
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    expect(allText(settled)).toContain("tell them");
    expect(paraMarkers(settled)).toEqual(["p", "p"]);
  });
});

describe("setTransientInput — the apply hand-off", () => {
  it("matches the real settle once the literal is consumed and the declaration cleared", async () => {
    const { ref, lexical } = await mountStandardViewEditor(paletteUsj);
    act(() => ref.current?.setTransientInput({ kind: "marker-literal", run: "\\q1" }));
    await typePaletteLiteral(lexical, "\\q1");

    // Apply: the literal prefix is removed and the marker is applied structurally, then the
    // surface releases its claim — exactly the order the palette's apply path uses.
    await act(async () => {
      lexical.update(() => {
        const body = $textContaining("tell them");
        body.setTextContent("tell them");
        body.select(9, 9);
      });
      await Promise.resolve();
    });
    act(() => {
      ref.current?.setTransientInput(undefined);
      ref.current?.formatPara("q1");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const root = lexical.getRootElement();
    if (!root) throw new Error("editor root not found");
    act(() => root.blur());
    const virtualUsj = ref.current?.getUsj();

    act(() => ref.current?.commitPendingMarkerEdits());
    expect(virtualUsj).toEqual(ref.current?.getUsj());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run transientInput`
Expected: FAIL — `setTransientInput` is not a function on `EditorRef`.

- [ ] **Step 3: Declare the contract on `EditorRef`**

In `packages/platform/src/editor/editor.model.ts`, add above the `EditorRef` interface:

```ts
/**
 * In-progress input an in-editor command surface has declared to the editor. `kind` names the shape
 * of the claim so more can be added without widening the method; `run` is the exact byte sequence
 * the surface expects to find immediately before the caret.
 *
 * @public
 */
export type TransientInput = { kind: "marker-literal"; run: string };
```

And add this member immediately after `commitPendingMarkerEdits`:

```ts
  /**
   * Declares in-progress input that an in-editor command surface (e.g. the marker palette) will
   * consume or discard — analogous to an IME composition string. While declared,
   * {@link EditorRef.getUsj} excludes these bytes from its settled output: the containing paragraph
   * settles as if they were absent. Editor state, on-screen content, `onUsjChange`, and OT deltas
   * are untouched. One declaration at a time; calling again replaces it; `undefined` clears it.
   *
   * The declaration is ADVISORY. It is re-verified against the live caret at every `getUsj()`, and
   * ignored whenever it does not hold — the caret moved off the node, the bytes immediately before
   * the caret are not exactly `run`, the node is gone, or the caller forgot to clear. A stale
   * declaration therefore costs at most one save carrying a visible phantom marker; it can never
   * silently drop content the user typed. Callers should still clear it as soon as the input is
   * consumed or the surface closes.
   */
  setTransientInput(input: TransientInput | undefined): void;
```

- [ ] **Step 4: Subtract the declared bytes in the settle**

In `packages/platform/src/editor/markerEdit/virtualSettle.utils.ts`, add `FragmentSpan` to the `./tier2Rebuild.utils` import, `$getSelection`, `$isRangeSelection`, `$isTextNode`, `TextNode` to the `lexical` import, and `import { TransientInput } from "../editor.model";` (a type-only dependency in the other direction from `Editor.tsx`, so no cycle). Then add above `$settledParaNodes`:

```ts
/** A declaration that VERIFIED against the live tree: the node holding the bytes, the caret offset
 * they end at, and the bytes themselves. */
interface TransientLiteral {
  readonly node: TextNode;
  readonly caretOffset: number;
  readonly run: string;
}

/**
 * Resolve a declaration against the live caret, or `undefined` when it does not hold. Every check
 * is a fail-safe: an unverifiable declaration must degrade to "settle normally", because the cost
 * of ignoring a live declaration is one visible phantom marker while the cost of honoring a stale
 * one is silently deleting bytes the user typed.
 *
 * The bytes are located by the CARET, not by the end of the node's text: a palette opened
 * mid-paragraph leaves the trigger literal with the rest of the sentence still after it, so
 * "the node's text ends with `run`" would be false in the ordinary mid-sentence case. Requiring the
 * text ENDING AT THE CARET to end with `run` is the same exact-match check, correct in both
 * positions. A collapsed selection is required for the same reason the surfaces that declare only
 * exist for one: a range selection means the surface claimed the keystrokes and nothing landed.
 */
function $verifiedTransientLiteral(input: TransientInput | undefined): TransientLiteral | undefined {
  if (!input || input.run.length === 0) return undefined;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return undefined;
  const node = selection.focus.getNode();
  if (!$isTextNode(node) || !node.isAttached()) return undefined;
  const caretOffset = selection.focus.offset;
  if (!node.getTextContent().slice(0, caretOffset).endsWith(input.run)) return undefined;
  return { node, caretOffset, run: input.run };
}

/**
 * `fragment.text` with the declared bytes cut out, or the text UNTOUCHED when this fragment does
 * not carry them (the declaration names a node in some other scope) or when the cut cannot be made
 * exactly. The cut is located through the fragment's own spans, so the shared fragment builder is
 * not forked and the real settle is unaffected; the span-length check rejects the one case where a
 * node's fragment contribution is not length-preserving (a whitespace-only para-prefix separator
 * substituted for a plain space), rather than cutting at a shifted offset.
 *
 * Spans go stale after the cut. Nothing downstream reads them — the sentinel substitution walks the
 * tokenized output's placeholders in ORDER, not by offset — and the cut can never remove a
 * placeholder, since the removed bytes were verified equal to `run`.
 */
function fragmentTextWithoutTransient(
  fragment: FragmentAccumulator,
  transient: TransientLiteral,
): string {
  const key = transient.node.getKey();
  const span: FragmentSpan | undefined = fragment.spans.find(
    (candidate) => !candidate.isSentinel && candidate.key === key,
  );
  if (!span) return fragment.text;
  if (span.end - span.start !== transient.node.getTextContentSize()) return fragment.text;
  const cutEnd = span.start + transient.caretOffset;
  const cutStart = cutEnd - transient.run.length;
  if (cutStart < span.start) return fragment.text;
  if (fragment.text.slice(cutStart, cutEnd) !== transient.run) return fragment.text;
  return fragment.text.slice(0, cutStart) + fragment.text.slice(cutEnd);
}
```

Then thread it through the two scope settlers and the entry point:

(a) `$settledParaNodes` gains a fourth parameter and uses the reduced text:

```ts
function $settledParaNodes(
  para: ParaNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  transient: TransientLiteral | undefined,
): SerializedLexicalNode[] | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const fragment = $buildParaFragment(para, getMarkerFn);
  if (!fragment) return undefined;
  const fragmentText = transient
    ? fragmentTextWithoutTransient(fragment, transient)
    : fragment.text;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragmentText, {
    getMarker: getMarkerFn,
  });
```

The rest of the function is unchanged.

(b) `$settledNoteContent` takes the same fourth parameter and applies the same substitution to `out.text`:

```ts
function $settledNoteContent(
  note: NoteNode,
  sites: Map<NodeKey, SerializedSite>,
  context: Tier2Context,
  transient: TransientLiteral | undefined,
): { rebuilt: SerializedLexicalNode[]; contentNodes: LexicalNode[] } | undefined {
  const { viewOptions, getMarker: getMarkerFn, logger } = context;
  const built = $buildNoteFragment(note, getMarkerFn);
  if (!built) return undefined;
  const { out, contentNodes } = built;
  if (contentNodes.length === 0) return undefined;
  const fragmentText = transient ? fragmentTextWithoutTransient(out, transient) : out.text;
  const content: MarkerContent[] = usfmFragmentToUsjContent(fragmentText, {
    getMarker: getMarkerFn,
    isNoteContext: true,
  });
```

The rest of the function is unchanged.

(c) `$settledUsj` gains the fourth parameter, treats a verified declaration as a settle scope of its own, and passes the transient down:

```ts
export function $settledUsj(
  serializedState: SerializedEditorState,
  pendedKeys: ReadonlySet<NodeKey>,
  context: Tier2Context,
  transientInput?: TransientInput,
): Usj | undefined {
  const transient = $verifiedTransientLiteral(transientInput);
  if (pendedKeys.size === 0 && !transient) return undefined;

  const paraScopes = new Map<NodeKey, ParaNode>();
  const noteScopes = new Map<NodeKey, NoteNode>();
  const addScope = (node: LexicalNode): void => {
    const scope = $settleScopeForNode(node);
    if (!scope) return;
    if ($isNoteNode(scope)) noteScopes.set(scope.getKey(), scope);
    else paraScopes.set(scope.getKey(), scope);
  };
  for (const key of pendedKeys) {
    const node = $getNodeByKey(key);
    if (node?.isAttached()) addScope(node);
  }
  // A verified declaration settles its own scope even when nothing there is pending: the whole
  // point is that the declared bytes never reach a consumer, and the paragraph they sit in may
  // otherwise be perfectly settled already.
  if (transient) addScope(transient.node);
  if (paraScopes.size === 0 && noteScopes.size === 0) return undefined;
```

and the two loops pass `transient` through:

```ts
    const built = $settledNoteContent(note, sites, context, transient);
```
```ts
    const rebuilt = $settledParaNodes(para, sites, context, transient);
```

- [ ] **Step 5: Hold the declaration and honor it in `getUsj()`**

In `packages/platform/src/editor/Editor.tsx`:

(a) Add `TransientInput` to the existing `./editor.model` import (line 4: `EditorOptions, EditorProps, EditorRef`).

(b) Add the holder beside the other refs (after `expandedNoteKeyRef` at line 156):

```tsx
  // In-progress input an in-editor command surface has claimed (see `EditorRef.setTransientInput`).
  // A per-instance ref, not an editor-scoped side channel: writer and reader are both in this
  // package, so threading it explicitly into the settle keeps that computation a pure function of
  // its arguments and keeps two Editor instances (main and footnote popover) independent for free.
  const transientInputRef = useRef<TransientInput | undefined>(undefined);
```

(c) Add the method immediately after `commitPendingMarkerEdits` in the `useImperativeHandle` object:

```tsx
    setTransientInput(input) {
      transientInputRef.current = input;
    },
```

(d) Replace the `getUsj()` body from Task 4 with:

```tsx
    getUsj() {
      const editor = editorRef.current;
      if (!editor) return editedUsjRef.current;
      // Nothing pending and nothing declared: the cached serialization IS the settled document, and
      // skipping the recompute keeps the common read as cheap as it has always been.
      const pendedKeys = getPendedDisplayOwners(editor);
      const transientInput = transientInputRef.current;
      if ((!pendedKeys || pendedKeys.size === 0) && !transientInput) return editedUsjRef.current;
      // `getEditorState().read`, NOT `editor.read` - the latter force-flushes any in-flight update
      // mid-dispatch, and this is called from host save paths that can run during one.
      const editorState = editor.getEditorState();
      const serializedState = editorState.toJSON();
      return (
        editorState.read(() =>
          $settledUsj(
            serializedState,
            pendedKeys ?? new Set<string>(),
            { viewOptions, getMarker: markerLookup, logger },
            transientInput,
          ),
        ) ?? editedUsjRef.current
      );
    },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run transientInput settledGetUsj virtualSettle Editor.test`
Expected: PASS. The staleness tests are the ones that matter most — if any of them reports a MISSING `\q1` paragraph rather than a present one, the verification is too permissive and is dropping user content; fix `$verifiedTransientLiteral` before moving on.

- [ ] **Step 7: Run the whole platform package**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run`
Expected: PASS, corpus 141/141 with 0 skips.

- [ ] **Step 8: Commit**

```bash
git add packages/platform/src/editor/editor.model.ts packages/platform/src/editor/Editor.tsx packages/platform/src/editor/markerEdit/virtualSettle.utils.ts packages/platform/src/editor/transientInput.test.tsx
git commit -m "$(cat <<'EOF'
feat(platform): declare transient command-surface input, excluded from settled USJ

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Backlog item 4 — the verse-9 `\nd` span, editor-side capture

The handoff's item 4: in the E2E sample project (WEB, Luke 4) the pre-existing span `\nd come togedda\nd*` in verse 9 (arriving as `content[16]`) makes the editor↔PDP lossy warn fire on every full-chapter save. ParatextData is already exonerated by the C# pin `c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs`, whose finding names the inner trailing space before the closer as the prime suspect and the divergence as live-editing-only.

Planning-time probes (run 2026-08-07, discarded after) additionally cleared THREE editor-side pipelines for the exact suspect shape `\nd come togedda \nd*`: the static USJ→editor-state→USJ adaptor round trip, the same round trip with the real plugin stack mounted and an edit driven in the same paragraph, and the Tier-2 fragment tokenization (`usfmFragmentToUsjContent`). `usxStringToUsj`/`usjToUsxString` were clean too. This task converts those probes into permanent pins, so the live re-verification in Task 15 starts from a known-clean editor and any remaining divergence is attributable.

**Files:**
- Create: `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx`

**Interfaces:**
- Consumes: `serializeEditorState`/`initialize as initializeSerialize`/`reset` from `../adaptors/usj-editor.adaptor`; `deserializeSerializedEditorState`/`initialize as initializeDeserialize` from `../adaptors/editor-usj.adaptor`; `usfmFragmentToUsjContent`, `getMarker as bundledGetMarker` from `shared`; `baseTestEnvironment` from `libs/shared-react/src/plugins/usj/react-test.utils`; `CharNodePlugin`, `TextSpacingPlugin`, `getViewOptions`, `STANDARD_VIEW_MODE` from `shared-react`; `MarkerEditPlugin` from `./MarkerEditPlugin`; `viewOptions` from `./markerEdit.test-helpers`.
- Produces: nothing exported.

- [ ] **Step 1: Write the pins**

Create `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx`:

```tsx
/**
 * A closed character span whose content ends in a space before the closer
 * (`\nd come togedda \nd*`) must survive every editor-side pipeline byte-for-byte. That inner
 * trailing space is SIGNIFICANT content: it is not at the end of a block, so the host's
 * whitespace-insensitive save comparison treats a dropped one as a real divergence, and the
 * editor↔PDP lossy warning fires on every save of the chapter that holds it.
 *
 * ParatextData is not the source: its own captured pins keep the space as content and round-trip
 * the span as a fixed point (paranext-core `c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs`).
 * These are the editor's half of that attribution — static serialization, serialization with the
 * live plugin stack mounted (before and after an edit in the same paragraph), and the Tier-2
 * fragment tokenization every settle runs.
 */
import { viewOptions } from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isTextNode } from "lexical";
import { getMarker as bundledGetMarker, usfmFragmentToUsjContent } from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { CharNodePlugin, getViewOptions, STANDARD_VIEW_MODE, TextSpacingPlugin } from "shared-react";

const SPAN_TEXT = "come togedda ";

const luke4v9Usj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "LUK", content: ["LUK"] },
    { type: "chapter", marker: "c", number: "4" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "9" },
        "He led him to Jerusalem and ",
        { type: "char", marker: "nd", content: [SPAN_TEXT] },
        " and said to him.",
      ],
    },
  ],
};

/** The `\nd` span's content string in a doc shaped like `luke4v9Usj`. */
function ndSpanTextOf(usj: Usj | undefined): unknown {
  const para = usj?.content[2];
  if (!para || typeof para === "string") return undefined;
  const span = (para as MarkerObject).content?.find(
    (entry) => typeof entry !== "string" && entry.type === "char",
  );
  if (!span || typeof span === "string") return undefined;
  return span.content?.[0];
}

describe("closed \\nd span with an inner trailing space", () => {
  it("survives the static USJ -> editor state -> USJ round trip", () => {
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined);
    reset();
    const state = serializeEditorState(luke4v9Usj, viewOptions);
    expect(ndSpanTextOf(deserializeSerializedEditorState(state, viewOptions))).toBe(SPAN_TEXT);
  });

  it("survives serialization with the live plugin stack mounted, before and after an edit", async () => {
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined);
    reset();
    const state = serializeEditorState(luke4v9Usj, viewOptions);
    const { editor } = await baseTestEnvironment(
      undefined,
      <>
        <CharNodePlugin />
        <TextSpacingPlugin />
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      </>,
    );
    await act(async () => {
      editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
    });
    expect(
      ndSpanTextOf(deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions)),
    ).toBe(SPAN_TEXT);

    // Edit the text AFTER the span in the same paragraph: the span's own node is dirtied by the
    // neighbouring commit, which is the shape a live typing session produces.
    await act(async () => {
      editor.update(
        () => {
          const tail = $getRoot()
            .getAllTextNodes()
            .find((node) => node.getTextContent().includes("and said to him."));
          if (!tail || !$isTextNode(tail)) throw new Error("tail text node not found");
          tail.setTextContent(" and said to him!");
        },
        { discrete: true },
      );
    });
    expect(
      ndSpanTextOf(deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions)),
    ).toBe(SPAN_TEXT);
  });

  it("survives the Tier-2 fragment tokenization every settle runs", () => {
    const content = usfmFragmentToUsjContent(
      "\\p \\v 9 He led him to Jerusalem and \\nd come togedda \\nd* and said to him.",
      { getMarker: bundledGetMarker },
    );
    expect(ndSpanTextOf({ type: "USJ", version: "3.1", content: [{}, {}, ...content] } as Usj)).toBe(
      SPAN_TEXT,
    );
  });
});
```

- [ ] **Step 2: Run the revert test on each pin**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run ndInnerTrailingSpace`
Expected: PASS (3 tests). Then prove each pin is falsifiable: change `SPAN_TEXT` to `"come togedda"` (no trailing space) in the two round-trip pins' expectations only, re-run, confirm all three fail, restore, confirm green again.

- [ ] **Step 3: Commit**

```bash
git add packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx
git commit -m "$(cat <<'EOF'
test(platform): pin byte fidelity of a closed span's inner trailing space

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Editor-repo wave gate, and a build the host can consume

**Files:** none modified (verification + publish only).

**Interfaces:**
- Consumes: everything from Tasks 1–10.
- Produces: a yalc-published `@eten-tech-foundation/platform-editor` build carrying settled `getUsj()` and `setTransientInput`, which Tasks 12–15 consume in paranext-core.

- [ ] **Step 1: Repo gate**

Run from the editor repo root:

```bash
env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test
```

Expected: exit code 0 across all projects; the corpus line reports `checked 141 paragraph(s), 0 skip-listed`.

- [ ] **Step 2: Root lint context**

```bash
env -u _VOLTA_TOOL_RECURSION npx eslint .
```

Expected: exit code 0 (pre-existing unrelated warnings in demo apps are acceptable; zero ERRORS).

- [ ] **Step 3: Build and publish for the host**

```bash
cd packages/platform
env -u _VOLTA_TOOL_RECURSION npx nx build @eten-tech-foundation/platform-editor
env -u _VOLTA_TOOL_RECURSION npx nx extract-api @eten-tech-foundation/platform-editor
npx yalc publish
```

Expected: exit code 0 for each; the API report under `packages/platform/etc/` now shows the updated `getUsj` TSDoc plus the new `setTransientInput` member and `TransientInput` type. Build BEFORE extract-api — the API extractor consumes the build output.

- [ ] **Step 4: Commit any API-report churn**

```bash
git add packages/platform/etc
git commit -m "$(cat <<'EOF'
chore(platform): refresh the API report for the settled getUsj and transient-input contracts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

If `git status` reports nothing to commit, skip this step.

---

## Task 12: Retire the mutating pre-save settle (paranext-core)

**Files (all paranext-core):**
- Modify: `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts` (155 lines; `commitPendingMarkerEdits` field at :39-40, call at :153, doc at :107-133)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (2928 lines; the `commitPendingMarkerEdits` lambda at :2197)
- Test: `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts` (298 lines; the three call sites asserting on `commitPendingMarkerEdits` at :40, :65, :87)

**Interfaces:**
- Consumes: `EditorRef.getUsj(): Usj | undefined` — now settled (editor Tasks 4, 9).
- Produces: `interface DebouncedPdpSaveParams` WITHOUT `commitPendingMarkerEdits`; `performDebouncedPdpSave(params: DebouncedPdpSaveParams): void` unchanged otherwise. Task 13 removes two more fields (`isPaletteSessionOpen`, `paletteLiteralRun`).

- [ ] **Step 1: Write the failing test**

In `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`:

- Delete every `const commitPendingMarkerEdits = vi.fn();` declaration and every `commitPendingMarkerEdits,` / `commitPendingMarkerEdits: vi.fn(),` property in a `performDebouncedPdpSave({...})` call (all of them: lines 24/34, 50/60, 73/83, 104, 126, 146, 164, 181, 198, 219, 238).
- Delete the assertions `expect(commitPendingMarkerEdits).not.toHaveBeenCalled();` (lines 40, 65) and `expect(commitPendingMarkerEdits).toHaveBeenCalled();` (line 87).
- Rewrite the third test (line 69-90) as:

```ts
  // Same chapter, no palette: save what the editor shows. The editor's getUsj() is already SETTLED,
  // so the save path never mutates the document to make it so — a pre-save commit would push an undo
  // entry and could re-settle content the user just undid.
  it('saves the settled editor content via the latest save fn on the same chapter', () => {
    const capturedSave = vi.fn();
    const latestSave = vi.fn();
    const getEditorUsj = vi.fn(() => freshEditorUsj);

    performDebouncedPdpSave({
      usj: scheduledUsj,
      scheduledChapterKey: 'GEN|1',
      currentChapterKey: 'GEN|1',
      capturedSave,
      latestSave,
      isPaletteSessionOpen: false,
      getEditorUsj,
    });

    expect(getEditorUsj).toHaveBeenCalled();
    expect(latestSave).toHaveBeenCalledWith(freshEditorUsj);
    expect(capturedSave).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`
Expected: FAIL — TypeScript/vitest reports the missing required `commitPendingMarkerEdits` property on every `performDebouncedPdpSave` call.

- [ ] **Step 3: Remove the pre-save settle**

In `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts`:

(a) Delete the `commitPendingMarkerEdits` field (lines 39-40) and change the `getEditorUsj` doc (line 41) to:

```ts
  /** Read the editor's current USJ. Already settled — see `EditorRef.getUsj`. */
  getEditorUsj: () => Usj | undefined;
```

(b) Replace the third bullet of `performDebouncedPdpSave`'s doc (lines 123-126) with:

```
 * - Otherwise (same chapter), preserve the existing behavior: with a marker-palette session open,
 *   save the SCHEDULED USJ — the raw serialization captured at the keystroke, whose un-settled
 *   trigger literal the strip below removes and the palette's apply is still going to consume;
 *   with no palette session, save what the editor shows, which `EditorRef.getUsj` already returns
 *   settled. Nothing in this path mutates the document: a pre-save settle used to, and that
 *   mutation is exactly what made a debounced save able to re-settle an explicitly-undone literal.
```

(c) Delete `commitPendingMarkerEdits,` from the destructured parameter list (line 142) and delete the `commitPendingMarkerEdits();` call (line 153), so the tail reads:

```ts
  latestSave(getEditorUsj() ?? usj);
}
```

In `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx`, delete line 2197:

```tsx
            commitPendingMarkerEdits: () => editorRef.current?.commitPendingMarkerEdits(),
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Check for other callers**

Run: `grep -rn "commitPendingMarkerEdits" extensions/ src/ --include=*.ts --include=*.tsx`
Expected: zero hits in paranext-core. If any remain, they are additional save paths that must be removed the same way — do it in this commit.

- [ ] **Step 6: Commit**

```bash
git add extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx
git commit -m "$(cat <<'EOF'
refactor(scripture-editor): retire the mutating pre-save marker settle

The editor's getUsj() is settled now, so the save path no longer commits pending
marker edits into the document before reading it.

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Declare the palette's in-progress literal; delete the strip plumbing (paranext-core)

The host currently defends the PDP from a passive palette session's trigger literal by finding it as a STRING in the outgoing USJ and cutting it out (`stripLastLiteralRun`/`stripPaletteLiteral`, plus a `paletteLiteralRun` argument threaded through two save paths). That is a workaround for the editor not knowing the literal was in flight — and it stops working against settled output anyway, since the settle turns `\q1` into a real paragraph that no string search can find.

`setTransientInput` (editor Task 9) replaces it with a declaration. The host tells the editor which bytes the palette owns, the editor's settle subtracts exactly those bytes, and everything downstream — the debounced save, `useEditorPdpSync`'s push-back, the failed-save retry — gets a correct document with no special casing at all. So `isPaletteSessionOpen` and `paletteLiteralRun` both leave `DebouncedPdpSaveParams`: with the literal already excluded upstream, a palette-open save is an ordinary save, and reading the editor is strictly fresher than replaying the snapshot captured at the keystroke.

**Files (all paranext-core):**
- Modify: `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts` (`isPaletteSessionOpen`/`paletteLiteralRun` fields at :27-38, `stripLastLiteralRun` at :52-72, `stripPaletteLiteral` at :80-82, `resolveUsjToSaveToPdp` at :98-105, the two strip branches at :145-152)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.ts` (new pure helper)
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (`openMarkerPalette` at :1546-1619, `openEnterPalette` at :1626-1658, the while-open keydown branch at :1736-1742, `resolveUsjToSaveToPdp` call at :2012-2018, the debounce payload at :2188-2196)
- Test: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.test.ts`
- Test: `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`

**Interfaces:**
- Consumes: `EditorRef.setTransientInput(input: TransientInput | undefined): void` and `TransientInput = { kind: "marker-literal"; run: string }` (editor Task 9); `paletteSession: MutableRefObject<{ kind: 'backslash' | 'enter' | 'selection'; filter: string; … } | undefined>` (`platform-scripture-editor.web-view.tsx:422`); `handleMarkerPaletteSessionKeyDown(event, session, driver): MarkerPaletteKeyOutcome` (`lib/platform-bible-react/src/components/advanced/marker-palette-keydown.util.ts:113`), which mutates `session.filter` in place and returns `'ended'` when the session is over.
- Produces:
  - `export function transientInputForPaletteSession(session: { kind: string; filter: string } | undefined): TransientInput | undefined` (in `platform-scripture-editor.web-view.utils.ts`)
  - `interface DebouncedPdpSaveParams` without `isPaletteSessionOpen` or `paletteLiteralRun`
  - `resolveUsjToSaveToPdp(usjFromEditor: Usj, usjFromPdp: Usj | undefined): Usj | undefined` (two parameters)

- [ ] **Step 1: Write the failing test**

Append to `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.test.ts` (adding `transientInputForPaletteSession` to the existing import from `./platform-scripture-editor.web-view.utils`):

```ts
describe('transientInputForPaletteSession', () => {
  // Only the PASSIVE backslash session leaves bytes in the document: its `\` and every filter
  // character land as literal text. Focused sessions claim their keys, so there is nothing in the
  // document to declare.
  it('declares the trigger plus the current filter for a passive backslash session', () => {
    expect(transientInputForPaletteSession({ kind: 'backslash', filter: '' })).toEqual({
      kind: 'marker-literal',
      run: '\\',
    });
    expect(transientInputForPaletteSession({ kind: 'backslash', filter: 'q1' })).toEqual({
      kind: 'marker-literal',
      run: '\\q1',
    });
  });

  it('declares nothing for focused sessions or no session at all', () => {
    expect(transientInputForPaletteSession({ kind: 'enter', filter: 'q1' })).toBeUndefined();
    expect(transientInputForPaletteSession({ kind: 'selection', filter: 'nd' })).toBeUndefined();
    expect(transientInputForPaletteSession(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.test.ts`
Expected: FAIL — `transientInputForPaletteSession` is not exported.

- [ ] **Step 3: Add the pure helper**

In `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.ts`, add (with `import type { TransientInput } from '@eten-tech-foundation/platform-editor';` alongside the file's existing imports):

```ts
/**
 * What the editor should be told is in flight for `session`, or `undefined` when nothing is.
 *
 * Only a PASSIVE backslash session leaves bytes in the document: the `\` trigger lands as literal
 * text (that is what makes it passive) and every filter character lands after it, so the document
 * carries exactly `\` + filter immediately before the caret. Focused sessions — Enter-triggered and
 * selection-triggered — claim their keystrokes, so nothing of theirs is ever in the document and
 * they declare nothing.
 */
export function transientInputForPaletteSession(
  session: { kind: string; filter: string } | undefined,
): TransientInput | undefined {
  return session?.kind === 'backslash'
    ? { kind: 'marker-literal', run: `\\${session.filter}` }
    : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the declaration into the session lifecycle**

In `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx`, add `transientInputForPaletteSession` to the existing import from `./platform-scripture-editor.web-view.utils`, then:

(a) Add the one-line re-declaration helper immediately below `paletteSessionCounter` (line 438):

```tsx
  /**
   * Tell the editor what the palette currently owns in the document, so a save that fires mid-
   * session does not write the in-progress trigger literal to the PDP. Called wherever
   * `paletteSession.current` is created, mutated, or cleared — the filter changes on every
   * keystroke, and the editor verifies the declared bytes against its own caret at read time, so a
   * declaration that lags by even one character is simply ignored.
   */
  const declarePaletteTransientInput = useCallback(() => {
    editorRef.current?.setTransientInput(transientInputForPaletteSession(paletteSession.current));
  }, []);
```

(b) In `openMarkerPalette`, immediately after the `paletteSession.current = passive ? {...} : {...}` assignment (line 1569) and before the `papi.overlays.showCommandPalette` call:

```tsx
      declarePaletteTransientInput();
```

Add `declarePaletteTransientInput` to that `useCallback`'s dependency array (line 1618).

(c) In `openMarkerPalette`'s `.then` handler, immediately after `clearPaletteSessionIfCurrent(paletteSession, token);` (line 1577), and again in its `.catch` after the same call (line 1614):

```tsx
          declarePaletteTransientInput();
```

The session ref is already cleared at that point, so the helper resolves to `undefined` and releases the claim — before the apply below removes the literal, which is the order the apply path expects.

(d) In `openEnterPalette`, after the session assignment (line 1630) and after each `clearPaletteSessionIfCurrent` (lines 1642, 1653), add the same `declarePaletteTransientInput();` call, and add it to that `useCallback`'s dependency array (line 1657). An Enter session declares nothing, so these calls make the release explicit rather than relying on the previous session having cleaned up.

(e) In the while-open keydown branch (lines 1736-1742), replace:

```tsx
          if (outcome === 'ended') paletteSession.current = undefined;
          return;
```

with:

```tsx
          if (outcome === 'ended') paletteSession.current = undefined;
          // `handleMarkerPaletteSessionKeyDown` mutates `session.filter` in place for a filter
          // keystroke, so the declaration is refreshed AFTER it returns, on the same keystroke that
          // put the character in the document.
          declarePaletteTransientInput();
          return;
```

- [ ] **Step 6: Delete the strip plumbing**

In `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts`:

(a) Delete the `isPaletteSessionOpen` field (lines 27-28) and the `paletteLiteralRun` field (lines 29-38) from `DebouncedPdpSaveParams`.

(b) Delete `stripLastLiteralRun` (lines 45-72) and `stripPaletteLiteral` (lines 74-82) entirely.

(c) Replace `resolveUsjToSaveToPdp` (lines 84-105) with:

```ts
/**
 * Decides what an imperative "save the editor's USJ if it changed" should write to the PDP: returns
 * the USJ to save, or `undefined` when there is nothing new to write.
 *
 * No literal stripping any more: an in-editor command surface with input in flight declares it to
 * the editor (`EditorRef.setTransientInput`), which excludes those bytes from the settled USJ this
 * receives. The caller records the returned USJ as what was sent so the echo comparison converges.
 */
export function resolveUsjToSaveToPdp(
  usjFromEditor: Usj,
  usjFromPdp: Usj | undefined,
): Usj | undefined {
  return areUsjContentsEqualExceptWhitespace(usjFromPdp, usjFromEditor) ? undefined : usjFromEditor;
}
```

(d) Replace `performDebouncedPdpSave`'s body's second half so the same-chapter path has no palette branch left:

```ts
export function performDebouncedPdpSave({
  usj,
  scheduledChapterKey,
  currentChapterKey,
  capturedSave,
  latestSave,
  getEditorUsj,
}: DebouncedPdpSaveParams): void {
  if (scheduledChapterKey !== currentChapterKey) {
    capturedSave(usj);
    return;
  }
  latestSave(getEditorUsj() ?? usj);
}
```

(e) Replace `performDebouncedPdpSave`'s doc bullets — the chapter-mismatch one and the same-chapter one Task 12 rewrote — with:

```
 * - If the chapter changed between scheduling and firing, save the CAPTURED content via the CAPTURED
 *   save fn (both bound to the chapter the content was typed in) and never touch the editor —
 *   reading it would pull the new chapter's content, and the current save fn would write it to the
 *   wrong chapter.
 * - Otherwise (same chapter), save what the editor shows. `EditorRef.getUsj` already returns it
 *   settled, and already excludes any in-progress input an open command surface has declared, so
 *   there is no palette case to special-case and nothing here mutates the document. A pre-save
 *   settle used to, and that mutation is exactly what made a debounced save able to re-settle an
 *   explicitly-undone literal.
```

In `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx`:

(f) Replace the `resolveUsjToSaveToPdp` call (lines 2004-2018) with:

```tsx
      // An open command surface's in-progress input is excluded by the editor itself
      // (`setTransientInput`), so what arrives here is already the document we mean to save.
      const usjToSave = resolveUsjToSaveToPdp(correctEditorUsjVersion(usjFromEditor), usjFromPdp);
```

(g) Delete the `isPaletteSessionOpen` line (2188) and the `paletteLiteralRun` property with its comment (lines 2189-2196) from the `performDebouncedPdpSave` payload.

- [ ] **Step 7: Shrink the save-util tests**

In `extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts`:

- Delete the entire `describe('performDebouncedPdpSave — palette literal stripping', …)` block (from line 112 to the end of that describe) and any remaining `resolveUsjToSaveToPdp` case that passes a third argument.
- Delete the `isPaletteSessionOpen` and `paletteLiteralRun` properties from every remaining `performDebouncedPdpSave({...})` call.
- Delete the now-meaningless second test (`saves the scheduled content via the latest save fn without settling markers when a palette session is open`) — an open palette is no longer a distinct save path.
- Keep the chapter-safety test, the same-chapter test (rewritten in Task 12), and the editor-has-no-USJ fallback test.
- Add one case pinning the two-argument comparison contract:

```ts
describe('resolveUsjToSaveToPdp', () => {
  it('returns undefined when the editor content matches the PDP except for whitespace', () => {
    expect(resolveUsjToSaveToPdp(usjWith('tell them'), usjWith('tell  them'))).toBeUndefined();
  });

  it('returns the editor content when it differs from the PDP', () => {
    expect(resolveUsjToSaveToPdp(usjWith('tell them'), usjWith('tell us'))).toEqual(
      usjWith('tell them'),
    );
  });
});
```

- [ ] **Step 8: Run the host suites, lint and typecheck**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/`
Expected: PASS.

Run: `grep -rn "paletteLiteralRun\|stripPaletteLiteral\|stripLastLiteralRun\|isPaletteSessionOpen" extensions/src/`
Expected: zero hits.

Run from the paranext-core root: `npm run typecheck` and `npm run lint`
Expected: exit code 0 for both.

- [ ] **Step 9: Commit**

```bash
git add extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.ts extensions/src/platform-scripture-editor/src/debounced-pdp-save.util.test.ts extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.ts extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.utils.test.ts
git commit -m "$(cat <<'EOF'
refactor(scripture-editor): declare the palette literal to the editor; drop the save-path strip

The editor now excludes an open command surface's declared in-progress input from
its settled USJ, so the save paths no longer search for and cut the literal out.

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: The lossy warn now means a real defect (paranext-core)

An audit of `use-editor-pdp-sync.hook.ts` against the spec's "simplify away the transient handling that existed solely for unsettled-save echoes": all four transient mechanisms there survive, because none of them is a save-snapshot artifact.

- `nonConvergingDeferralCount` / `NON_CONVERGENCE_WARN_THRESHOLD` — counts deferrals of a CONCURRENT EXTERNAL edit. Unrelated to settling. STAYS.
- `lastEditorUsjPushedWhileDeferring` + `lastIncomingUsjDeferred` — the idempotency damping. It terminates the save/echo loop a genuinely non-idempotent round trip sustains, and its incoming-side half is what distinguishes an external writer from our own echo. A settled save makes such loops RARER, not impossible. STAYS as loop protection.
- `warnedLossyDifferences` (bounded FIFO, `LOSSY_WARN_MEMORY_LIMIT`) — bounds warn spam per distinct difference. STAYS.

What actually went is the pre-save commit plumbing in the SAVE path (Task 12) and the palette-literal strip (Task 13) — the save-snapshot timing machinery. What changes here is meaning: the warn no longer has an "our save was taken mid-edit" explanation, so it names a real round-trip defect and must carry enough detail to act on. Task 15 consumes that detail.

**Files (all paranext-core):**
- Modify: `extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.ts` (392 lines; `describeFirstUsjContentDifference` at :92-107, the warn at :348-354)
- Test: `extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.test.ts` (1361 lines; the lossy-warn tests at :1046, :1127, :1195, :1266)

**Interfaces:**
- Consumes: `firstSignificantUsjContentDifference(sent, received)` (`use-editor-pdp-sync.hook.ts:63`).
- Produces: no new exports; `logger.warn` gains an untruncated `sent`/`received` entry pair, emitted once per distinct difference alongside the existing bounded summary.

- [ ] **Step 1: Write the failing test**

In `extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.test.ts`, extend the existing test at line 1046 (`warns once that our own save round-tripped lossily…`) with, after its current warn assertion:

```ts
    // The warn must carry the FULL differing entries, not only the bounded summary: with settled
    // saves this line names a real round-trip defect, and a 200-character truncation is not enough
    // to attribute one.
    const warnText = String(mockLogger.warn.mock.calls.at(-1)?.[0] ?? '');
    expect(warnText).toContain('Full sent entry:');
    expect(warnText).toContain('Full received entry:');
```

Match the existing suite's logger-mock accessor name rather than introducing `mockLogger` if it differs — read lines 1046-1126 first and reuse whatever they already assert against.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/use-editor-pdp-sync.hook.test.ts`
Expected: FAIL — the warn text contains neither phrase.

- [ ] **Step 3: Widen the warn and restate its meaning**

In `extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.ts`:

(a) Add below `describeFirstUsjContentDifference` (after line 107):

```ts
/**
 * The two differing entries in full, for the ONE warning a given difference ever produces. The
 * bounded summary above is what a repeated line should carry; a defect that fires once needs
 * enough bytes to attribute — the divergences this catches are single-character whitespace shifts
 * inside a span, which a 200-character truncation can hide entirely.
 */
function describeFullUsjContentDifference(sent: Usj | undefined, received: Usj | undefined): string {
  const difference = firstSignificantUsjContentDifference(sent, received);
  if (!difference) return '';
  return (
    `\nFull sent entry: ${JSON.stringify(difference.sentEntry)}` +
    `\nFull received entry: ${JSON.stringify(difference.receivedEntry)}`
  );
}
```

(b) Replace the warn's message (lines 348-354) with:

```ts
              logger.warn(
                `useEditorPdpSync: our own save round-tripped through the PDP to DIFFERENT content ` +
                  `beyond insignificant whitespace and has not converged — the editor is doing ` +
                  `something lossy (a stable non-idempotent USFM round-trip of our own push, not an ` +
                  `external edit). The editor's getUsj() is settled, so this is not a mid-edit save ` +
                  `snapshot: it is a real USJ->USFM->USJ defect. First differing content entry: ` +
                  `${describeFirstUsjContentDifference(editorUsj, usjFromPdp)}` +
                  `${describeFullUsjContentDifference(editorUsj, usjFromPdp)}`,
              );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd extensions && npx vitest run src/platform-scripture-editor/src/use-editor-pdp-sync.hook.test.ts`
Expected: PASS (all 20 tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.ts extensions/src/platform-scripture-editor/src/use-editor-pdp-sync.hook.test.ts
git commit -m "$(cat <<'EOF'
feat(scripture-editor): log the full differing entries on a lossy round-trip warn

Co-authored-by: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Verse-9 live re-verification and the strict-warn acceptance (paranext-core)

The spec's acceptance is that the strict warn lands on a WARN-CLEAN sample project. Task 10 cleared every editor-side static pipeline for the suspect span, Task 12 removed the pre-save mutation, and Task 14 made the remaining warn name its own defect in full. This task runs the live check that decides whether backlog item 4 closes.

**Files:** none by default; a fix (branch B below) modifies whichever side the capture indicts.

**Interfaces:**
- Consumes: the editor build from Task 11; the host changes from Tasks 12-14.
- Produces: a recorded outcome in `docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md` (editor repo) — item 4 closed, or the exact divergence named.

- [ ] **Step 1: Put the settled-getUsj editor build into the running app**

```bash
cd ~/source/repos/workspaces/standard-view/paranext-core
npx yalc add @eten-tech-foundation/platform-editor
npm run build:dll
```

Expected: exit code 0. Confirm the dev renderer really serves the fresh code before trusting anything below:

```bash
grep -c "settledUsj\|Settled USJ skipped" .erb/dll/renderer.dev.dll.js
```

Expected: a non-zero count. A zero here means the DLL is stale and every observation in this task is meaningless — rebuild before continuing.

- [ ] **Step 2: Run the app and reproduce the save**

Use the `app-runner` skill to start Platform.Bible headless with CDP, then the `visual-verification` skill to: open the WEB sample project in Standard view, navigate to Luke 4, type a single character in a paragraph OTHER than verse 9's, and wait past the 700 ms debounce for the save.

- [ ] **Step 3: Read the log**

Use the `log-inspector` skill on the renderer log and search for `round-tripped through the PDP to DIFFERENT content`.

- [ ] **Step 4A (warn absent): close backlog item 4**

Append to `docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md` (editor repo) a dated postscript entry stating: item 4 closed; the verse-9 `content[16]` warn no longer fires after settled `getUsj()` landed; the regression net is `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx` (editor) plus `c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs` (host); and that the class of warn it belonged to — a save snapshot taken mid-edit — is retired by construction rather than by a fix.

```bash
cd ~/source/repos/workspaces/standard-view/scripture-editors
git add -f docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md
git commit -m "$(cat <<'EOF'
docs: close backlog item 4 — verse-9 lossy warn retired by settled getUsj

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4B (warn present): fix the named divergence**

The warn now prints `Full sent entry:` and `Full received entry:` untruncated (Task 14), so the divergence is a concrete byte difference between two known JSON documents — not an investigation. Attribute it with the pins already in place:

1. Copy the FULL sent entry into a new case in `packages/platform/src/editor/markerEdit/ndInnerTrailingSpace.test.tsx` and assert the editor's static and live round trips preserve it. If one of them fails, the defect is editor-side at that stage — fix it there and keep the new case as the pin.
2. If both editor round trips preserve it, the sent entry is correct and the RECEIVED one is the PDP's. Add the sent entry's USFM form as a new `[TestCase]` in `c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs` (paranext-core) with the received bytes as the expectation, run `dotnet test c-sharp-tests/`, and fix whichever side the pin indicts.

Either way the fix lands with its pin in the same commit, using the repo-appropriate trailer, and Step 2 is re-run to confirm the warn is gone before proceeding.

- [ ] **Step 5: Stop the app**

Use the `app-runner` skill to stop Platform.Bible.

---

## Task 16: Wave-4 gate

**Files:** none modified (verification only).

- [ ] **Step 1: Editor repo gate**

```bash
cd ~/source/repos/workspaces/standard-view/scripture-editors
env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test
env -u _VOLTA_TOOL_RECURSION npx eslint .
```

Expected: exit code 0 for both; corpus reports `checked 141 paragraph(s), 0 skip-listed`.

- [ ] **Step 2: Host repo gate**

```bash
cd ~/source/repos/workspaces/standard-view/paranext-core
npm run lint
npm run typecheck
cd extensions && npx vitest run src/platform-scripture-editor/src/
```

Expected: exit code 0 for all three.

- [ ] **Step 3: Confirm the acceptance criteria, each against a named test**

Check each off only with the test file and name that proves it:

- `getUsj()` output is always a Tier-2 fixed point → `settledGetUsj.test.tsx`, `settled getUsj — output is always a Tier-2 fixed point`; and, with a declaration live, `transientInput.test.tsx`, `omits the declared run and still yields a Tier-2 fixed point`.
- Virtual settle output === real settle output → `settledGetUsj.test.tsx`, `settled getUsj — virtual settle equals the real settle`; and across the palette hand-off, `transientInput.test.tsx`, `matches the real settle once the literal is consumed and the declaration cleared`.
- The save-snapshot timing warn class disappears → `debounced-pdp-save.util.test.ts`, `saves the settled editor content via the latest save fn on the same chapter` (no pre-save mutation exists to take a stale snapshot around) plus Task 15's live observation.
- Pending edits stay pending on screen → `settledGetUsj.test.tsx`, `leaves the document pending after a read, so a later commit still has work to do`; and `virtualSettle.utils.test.tsx`, `settles an abandoned in-place marker rename in the OUTPUT without mutating the editor`.
- Uniform settling (half-typed `|stuf`) → `settledGetUsj.test.tsx`, `settles a half-typed attribute run to literal content while the caret is still inside it`.
- A declared in-progress literal never reaches a consumer, and a stale declaration never drops content → `transientInput.test.tsx`, the `setTransientInput — declared input is excluded from settled output` and `setTransientInput — a stale declaration is ignored, never trusted` blocks (all four staleness modes).

- [ ] **Step 4: Push both branches**

```bash
cd ~/source/repos/workspaces/standard-view/scripture-editors && git push
cd ~/source/repos/workspaces/standard-view/paranext-core && git push
```

---

## Residual behavior worth knowing

One path deliberately still saves UN-settled bytes: **the cross-chapter flush.** `performDebouncedPdpSave`'s chapter-mismatch branch saves the CAPTURED raw USJ, because the editor has already moved to another chapter and cannot be read for the old one. A pending literal serializes as literal bytes, which ParatextData parses — the same documented fallback the suppression window relies on. That branch also no longer strips a palette literal (Task 13 deleted the strip), which is only reachable if a palette session somehow survives a chapter switch; navigation dismisses it, and the fallback above covers the bytes if it ever does not.

Two scope notes on `setTransientInput`:

- It affects `getUsj()` ONLY. Nothing about pends, settles, or `commitPendingMarkerEdits` is gated by a declaration, and the existing caller obligation — do not call `commitPendingMarkerEdits` while a palette session is open, because the palette's apply must be the one to consume the literal — stands unchanged.
- The footnote-editor popover runs its own `Editor` instance with its own palette session. It is not wired in Task 13 because its save path is `getNoteOps`/`replaceEmbedUpdate`, not `getUsj`. The declaration is per-instance (a ref on the component), so wiring it later is additive and cannot leak across editors.

Also: the P9-parity idea of calling `commitPendingMarkerEdits()` on a timer is explicitly NOT part of this wave (spec §8: "optional later polish, NOT required"). `commitPendingMarkerEdits` stays on `EditorRef` for hosts that genuinely want the DOCUMENT settled; nothing in paranext-core calls it after Task 12.

---

## Relationship to Wave 3 (the display-run registry)

Wave 4 is independent of Wave 3 and the two can execute in either order. The sequencing constraint in the spec is only that phase 3 lands after phase 1, which is already done.

File-overlap hazards, from a comparison against `docs/superpowers/plans/2026-08-07-display-run-registry.md`'s File Structure table:

- **No shared file is modified by both plans.** Wave 3 restructures `MarkerEditPlugin.tsx`, `markerEditTier1.utils.ts`, `markerEditTier2Trigger.utils.ts`, `attributeDisplay.utils.ts`, `CharNodePlugin.tsx`, `TextSpacingPlugin.tsx`, and the collab coordinate files, and deletes `displayRunDeletion.utils.ts`. Wave 4 touches none of them — deliberately: Task 1 reuses the EXISTING `registerPendedDisplayOwners` channel rather than adding a new publish path from the engine, which is what keeps this wave out of `MarkerEditPlugin.tsx` entirely.
- **`libs/shared/src/nodes/usj/index.ts`** is the one file both waves are near. Wave 3 ADDS an export line there (its Task 1); wave 4 needs no edit at all, because `export * from "./pendedDisplayOwners.utils.js";` (line 19) already re-exports the new accessor. No conflict.
- **`tier2Rebuild.utils.ts`** is wave 4's only edit inside the marker-edit engine, and the spec keeps the tokenizer and the whole Tier-2 fragment/signature machinery explicitly OUT of the registry, so wave 3 does not touch it.
- **Semantic coupling, one direction only:** wave 3 rewrites `$settlePendedDisplayOwner` into registry dispatch, which is what a REAL settle runs. Wave 4's equivalence property (Task 7) drives the real settle through the public `commitPendingMarkerEdits()` command rather than through that function, so it is implementation-agnostic — but it is also the test most likely to catch a wave-3 regression in settle semantics. Whichever wave lands second, run `settledGetUsj.test.tsx` and `transientInput.test.tsx` as part of its gate.
- **`editor.model.ts` and `Editor.tsx`** gain the `setTransientInput` member and its holder (Task 9). Wave 3 touches neither file, so the new public surface cannot collide with the registry work.
- **Both waves end with the same repo gate** (`nx run-many -t lint,typecheck,test` + root `eslint .` + corpus 141/141), so a rebase of one onto the other is verified by re-running that gate; no bespoke merge check is needed.

---

## Self-review

**1. Spec coverage (§8 and the acceptance list).**

| Spec requirement | Task |
|---|---|
| Virtual settle inside `editorState.read()`, serialize as today then splice per scope | 3 |
| Same `$buildParaFragment` / `$buildNoteFragment` + `usfmFragmentToUsjContent` a real settle uses | 2, 3, 5 |
| Splice into the OUTPUT USJ only | 3 (JSON copy, editor untouched — pinned in 4, 6) |
| Preserved node's own serialized USJ substituted for its U+FFFC; sentinels serialize in place | 3 (`replaceSerializedSentinels`, pinned by the optbreak-in-place test) |
| `MarkerEditPlugin` exposes its pending set through the phase-1 side channel | 1 (accessor on the existing channel — decision recorded below) |
| Uniform, no caret-held exception; half-typed `|stuf` → literal content | 6 |
| Pending edits stay pending on screen | 4, 6, 9 |
| One-code-path guarantee, equivalence property test | 7, 9 |
| Standing acceptance: output is always a Tier-2 fixed point | 8, 9 |
| In-progress command-surface input is declarable and excluded from settled output; stale declarations fail safe | 9 (editor contract), 13 (host wiring) |
| `performDebouncedPdpSave` stops calling `commitPendingMarkerEdits`; the trigger is RETIRED not gated | 12 |
| Save-snapshot timing warn class disappears | 12, 13, 15, 16 |
| Lossy-warn machinery stays, now signals real defects; transient handling audited | 14 (audit result: all four damping mechanisms stay; the pre-save commit and the palette-literal strip go) |
| `commitPendingMarkerEdits` remains on the editor API; P9 cadence NOT required | 4 (doc), Residual section |
| Backlog item 4 rides here, capture + fix BEFORE the strict-warn acceptance | 10 (capture/pins) and 15 (live decision + fix), both before the Task 16 acceptance |
| §9 fixed points untouched | No task modifies the tokenizer, `canonicalAttributeText`, the exclusion gates' semantics, or Tier-2's preserve-or-refuse; the virtual settle REUSES the guard sequence, the transient subtraction happens on the fragment TEXT before the tokenizer sees it (the tokenizer itself is untouched), and the corpus test is extended (Tasks 8, 9), never weakened |

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N" — each task repeats the code it needs. Task 15 is the only branching task; both branches carry concrete commands and a concrete artifact, and the branch condition is a single observable (does the warn line appear), not an open investigation. Task 3's implementation deliberately leaves `noteScopes` collected-but-unconsumed for one commit; that is stated in the step rather than implied. Task 9 changes three existing function signatures rather than adding new ones; each is written out in full at its new arity instead of being described as "add a parameter".

**3. Type consistency.** `$settledUsj` is a three-parameter function `(serializedState, pendedKeys, context)` in Tasks 3–5 and their test harness, and Task 9 extends it — once, explicitly, with the full signature written out — to `(serializedState, pendedKeys, context, transientInput?)`; Task 3's Produces block forward-declares that change so a reader arriving at Task 5 is not surprised. `TransientInput = { kind: "marker-literal"; run: string }` is declared once in `editor.model.ts` (Task 9) and referenced by that exact name in `EditorRef.setTransientInput`, in `virtualSettle.utils.ts`, and in the host helper's return type (Task 13) — the host imports it from `@eten-tech-foundation/platform-editor` rather than restating the shape. `getPendedDisplayOwners(editor)` returns `ReadonlySet<NodeKey> | undefined` in Task 1's implementation and is consumed as such in Tasks 3 (test harness), 4 and 9. `$settleScopeForNode` returns `ParaNode | NoteNode | undefined` in Task 2 and is narrowed with `$isNoteNode` in Task 2's `$requestTier2ForNode` and in Task 3/9's scope collection. `Tier2Context` is the existing `{ viewOptions, getMarker, logger? }` in every construction site. `SerializedSite`, `serializedChildren`, `serializedText`, `countSerializedSentinels`, `replaceSerializedSentinels`, and `serializedRunsOf` are defined once in Task 3 and reused unchanged by Tasks 5 and 9. `TransientLiteral` and `fragmentTextWithoutTransient` are defined once in Task 9 and used by both scope settlers at the same arity. `mountStandardViewEditor`/`requireStandardViewOptions`/`spanUsj` (Task 6) and `expectTier2FixedPoint` (Task 8) live in `settledGetUsj.test-helpers.tsx` and are imported by name in Tasks 6–9. `DebouncedPdpSaveParams` loses `commitPendingMarkerEdits` in Task 12 and `isPaletteSessionOpen`/`paletteLiteralRun` in Task 13, with every call site in the test file updated in the same step each time; `resolveUsjToSaveToPdp` goes from three parameters to two in Task 13, with its single production call site updated there.

---

## Execution gate

This plan is NOT approved for execution. It requires TJ's sign-off first (the working convention for every wave of this effort: design → plan → sign-off → implement, with each task reviewed for spec fit and quality).

**Resolved by design, not left as a risk:** planning found that settled `getUsj()` would silently break the host's palette-literal protection, because the strip searches for the literal as a STRING and the settle turns it into structure. The first draft of this plan patched that host-side by routing palette-session saves through a raw-USJ snapshot. TJ replaced that with `setTransientInput` (Task 9): the surface with input in flight declares it, the editor subtracts exactly those bytes at the one place settling happens, and the host's search-and-cut plumbing is deleted outright (Task 13). The hazard is therefore closed at the boundary that owns it rather than compensated for downstream, and the failure mode is inverted from "silently drop content" to "one visible phantom marker", pinned by the four staleness tests.

The risks that remain are the ones the spec already named: the virtual settle's materialize half drifting from the real one (held by Task 7's equivalence property and Task 8's fixed-point property), and the verse-9 divergence needing a live observation before it can be closed (Task 15, with both branches specified).
