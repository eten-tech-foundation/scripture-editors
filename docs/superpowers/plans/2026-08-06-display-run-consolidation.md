# Display-Run Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every display kind's deletion/pend duties through one driver (fixing the stale-attribute, undead-optbreak, and empty-`\va` live bugs), then migrate verse/milestone runs into an `AttributeRunNode` wrapper — per the approved spec `docs/superpowers/specs/2026-08-06-display-run-consolidation-design.md`.

**Architecture:** Wave 0 clears three small TJ-approved backlog items. Wave 1 adds a destruction-driven owner pend (mutation listeners + a prev-state classifier), pend-aware grace in the syncs (via an editor-scoped side channel), one uniform `$settlePendedDisplayOwner` resolution, and a narrow source-site pend — each landed by making a failing live-bug pin pass. Wave 2a introduces the inline `AttributeRunNode` element wrapping verse/milestone runs and migrates builders, scanners, Tier-2 collectors, and exclusion gates to it. Waves 3 (registry) and 4 (settled `getUsj()`) get their own plans written against the landed wrapper (final tasks here).

**Tech Stack:** TypeScript, Lexical, React, vitest (per-package via pnpm), nx monorepo (`@eten-tech-foundation/platform-editor`, `shared`, `shared-react`).

## Global Constraints

- Repo: `~/source/repos/workspaces/standard-view/scripture-editors`, branch `standard-view-pt-4187`. All paths below are relative to that repo unless prefixed `paranext-core:` (= `~/source/repos/workspaces/standard-view/paranext-core`, branch `standard-view`).
- PT9 reference at `~/source/repos/Paratext` is read-only. NEVER edit it.
- The corpus test `packages/platform/src/editor/markerEdit/tier2Rebuild.corpus.test.tsx` must stay **141/141 with zero skips** at every commit.
- Fixed points (spec §9): tokenizer/losslessness core, `canonicalAttributeText`, exclusion-gating *semantics*, Tier-2 preserve-or-refuse machinery, corpus/property tests (extend, never weaken).
- Prefix every `pnpm`/`nx` invocation with `env -u _VOLTA_TOOL_RECURSION` and judge success by exit code, not output tail.
- Test commands: per-package `cd <pkg> && env -u _VOLTA_TOOL_RECURSION pnpm vitest run <file-substring>`; repo-wide gate `env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test` plus root `env -u _VOLTA_TOOL_RECURSION npx eslint .` — both must be clean before a wave is declared done.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Code comments stand on their own — no plan/task/spec-section breadcrumbs in code.
- Subagents run tests in the FOREGROUND only (no background test runs).
- `docs/superpowers/` is gitignored — `git add -f` any spec/plan file; lint-staged's `[FAILED] …ignored by .gitignore` lines on such commits are benign (the commit still lands; verify with `git log -1 --stat`).

---

## Wave 0 — slipped approvals

### Task 1: `scripts/mcp-launcher.js` lint

**Files:**
- Modify: `scripts/mcp-launcher.js:6`

**Interfaces:** none (lint-only).

- [ ] **Step 1: Add the justified disable**

Line 6 is `const { spawn } = require("child_process");`. Immediately above it add:

```js
// Plain-Node launcher script (no build step, runs under `node scripts/…`), so CommonJS require is
// the correct import form here rather than ESM.
// eslint-disable-next-line @typescript-eslint/no-require-imports
```

If the repo's eslint reports the rule id as bare `no-require-imports`, use that id instead — run the lint first to see the exact id.

- [ ] **Step 2: Verify root lint is clean**

Run from repo root: `env -u _VOLTA_TOOL_RECURSION npx eslint scripts/mcp-launcher.js`
Expected: exit 0, no errors. Then `env -u _VOLTA_TOOL_RECURSION npx eslint .` — expected: the previously-last root-context error is gone; zero errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/mcp-launcher.js
git commit -m "style: justified no-require-imports disable in mcp-launcher

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 2: Editable-para `\p`-prefix delta leak

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts:280` (produce-side glyph gate) and the marker-trailing-space text handling in the same `$handleTextNodes`
- Modify: `libs/shared-react/src/plugins/usj/collab/delta-common.utils.ts` (`$getOTPositionOfNode` counting — align the same exclusion)
- Test: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx`

**Interfaces:**
- Consumes: `$isParaMarkerPrefix(node)` from `libs/shared/src/nodes/usj/node.utils.ts:600` (exported from `shared`); `textTypeState` (`"marker-trailing-space"`).
- Produces: produce-side ops for an editable-mode paragraph contain ONLY content text — no `\p` glyph text, no NBSP separator. Later collab work relies on this invariant.

- [ ] **Step 1: Read the verse OT unification as the model**

Read `editor-delta.adaptor.ts` in full plus the `OTCoordinateSystem` doc at `delta-common.utils.ts:94`. The existing exclusion shape to mirror: `$isBareAttributeGlyph` (line ~215) excludes bare attribute-triplet glyphs from ops; the apply side re-synthesizes the para prefix, so the produce side leaking `\p ` + NBSP is the last unexcluded glyph class.

- [ ] **Step 2: Write the failing test**

In `editor-delta.adaptor.test.tsx`, find how existing tests build an editable-mode editor state and collect produced ops (mirror the nearest `$isBareAttributeGlyph`/attribute-exclusion test's setup verbatim). Add:

```tsx
it("excludes the paragraph's own marker-prefix glyph and separator from content ops", () => {
  // Build (via the file's existing editable-mode setup helper) one paragraph:
  //   [MarkerNode "\p"][NBSP marker-trailing-space token][TextNode "hello"]
  // Produce the full-document ops the same way the sibling tests do.
  // Assert: joining every string insert op yields exactly "hello\n" — the paragraph's
  // content and its para-close LF, with no "\\p" bytes and no " ".
});
```

- [ ] **Step 3: Run it to verify it fails**

`cd libs/shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run editor-delta.adaptor`
Expected: FAIL — the joined inserts contain `\p` and/or ` `.

- [ ] **Step 4: Implement the exclusion**

At `editor-delta.adaptor.ts:280` extend the glyph gate:

```ts
if (
  $isMarkerNode(currentNode) &&
  (isInNote || $isBareAttributeGlyph(currentNode) || $isParaMarkerPrefix(currentNode))
)
  return;
```

In the same function, before the text op is built, skip the separator:

```ts
// The para prefix's NBSP separator is presentation scaffolding (markerEditDeletion.utils.ts's
// $createMarkerPrefix); the apply side re-synthesizes the whole prefix, so its text must never
// enter content ops.
if ($getState(currentNode, textTypeState) === "marker-trailing-space") return;
```

Then align `$getOTPositionOfNode` in `delta-common.utils.ts`: find where it accumulates text-node lengths and apply the SAME two exclusions (para-prefix glyphs and marker-trailing-space nodes contribute zero length), so positions computed for `$getReplaceEmbedOps` agree with the ops the adaptor now produces. Read the function fully first; if it already delegates to a shared "does this node contribute" predicate, put the exclusion there once.

- [ ] **Step 5: Run the collab suites**

`cd libs/shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run collab`
Expected: new test PASSES; every existing delta test (produce, apply, replace-embed, length invariance) stays green. A failure in apply-side tests means the exclusion is asymmetric — stop and re-read how `$applyUpdate` re-synthesizes the prefix before touching anything else.

- [ ] **Step 6: Commit**

```bash
git add libs/shared-react/src/plugins/usj/collab/
git commit -m "fix(collab): exclude para marker-prefix glyph and separator from content ops

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

### Task 3: Log-noise `optbreak-undefined` / `figure-fig` (paranext-core)

**Files:**
- Investigate: paranext-core styling pipeline (start: `grep -rn "optbreak" extensions/src lib/platform-bible-react src --include="*.ts" -l` in paranext-core; use the `log-inspector` skill on recent app logs to capture the exact message)
- Modify: whatever single site emits the noise, IF the fix is small (≤ ~20 LOC)

**Interfaces:** none. Bounded investigative task.

- [ ] **Step 1:** Use the `log-inspector` skill (paranext-core) to find the exact recurring log lines containing `optbreak-undefined` and `figure-fig`, and the emitting module.
- [ ] **Step 2:** Diagnose: the suspected shape is a style lookup keyed `${marker}-${something}` missing entries for `optbreak`/`fig`. Confirm by reading the emitting code.
- [ ] **Step 3:** If the fix is a small mapping addition or a justified log-level downgrade, implement it in paranext-core (branch `standard-view`), run `npm run lint` + affected tests there, and commit (paranext-core conventions: `Co-authored-by` per its CLAUDE.md). If NOT small, write the findings as a comment in this plan's commit message and defer — do not scope-creep.
- [ ] **Step 4:** Commit (in paranext-core).

### Task 4: Handoff item-6 verification (mid-sentence typed-marker settle)

**Files:**
- Test (temporary or permanent): `packages/platform/src/editor/markerEdit/markerEditCommit.test.tsx` (extend — it already covers typed-literal settle flows)

**Interfaces:** none.

- [ ] **Step 1:** Write a headless per-keystroke test: paragraph with existing text `The wicked flee`; place the caret mid-sentence (after `wicked `); simulate typing `\nd hello\nd*` one keystroke at a time (each keystroke = one `editor.update` appending a char at the caret, mirroring how `markerEditCommit.test.tsx` simulates typing); then move the caret to another paragraph.
- [ ] **Step 2:** Assert the literal settled on departure: a `CharNode` with marker `nd` containing `hello` exists; no literal `\nd` text remains.
- [ ] **Step 3:** Run it. If it PASSES: the caret-restoration fix resolved TJ's observation — keep the test as a pin, note "handoff item 6 closed" in the commit message. If it FAILS: STOP, invoke superpowers:systematic-debugging, diagnose, and fix within the wave-1 driver context (most likely a pend-arming gap the destruction-pend work will absorb) — do not band-aid.
- [ ] **Step 4:** Commit.

---

## Wave 1 — the uniform deletion/pend driver

### Task 5: Pend side-channel (`shared`)

**Files:**
- Create: `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts`
- Modify: the barrel that exports `attributeDisplay.utils` (find with `grep -rn "attributeDisplay.utils" libs/shared/src --include="index.ts"`; add the new module beside it)
- Test: `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.test.ts`

**Interfaces:**
- Produces (later tasks import from `shared`):
  - `registerPendedDisplayOwners(editor: LexicalEditor, pendedKeys: ReadonlySet<NodeKey>): () => void`
  - `$isDisplayOwnerPended(node: LexicalNode): boolean` (must be called inside an editor read/update)

- [ ] **Step 1: Write the failing test**

```ts
import { registerPendedDisplayOwners, $isDisplayOwnerPended } from "./pendedDisplayOwners.utils";
// Use the same headless-editor harness attributeDisplay.utils.test.ts uses
// (libs/shared/src/nodes/usj/test.utils's createBasicTestEnvironment).

it("reports pended-ness for the registered editor's live set and stops after unregister", () => {
  const { editor } = createBasicTestEnvironment([...]);   // mirror the sibling test's node list
  const pended = new Set<string>();
  const unregister = registerPendedDisplayOwners(editor, pended);
  editor.update(() => {
    const node = $createTextNode("x");
    $getRoot().append($createParagraphNode().append(node));
    expect($isDisplayOwnerPended(node)).toBe(false);
    pended.add(node.getKey());            // live set: no re-registration needed
    expect($isDisplayOwnerPended(node)).toBe(true);
  });
  unregister();
  editor.update(() => {
    /* any node */ expect($isDisplayOwnerPended($getRoot())).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run pendedDisplayOwners` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
/**
 * Editor-scoped registry of display-run OWNER keys the marker-edit engine currently holds
 * pending. The engine (MarkerEditPlugin, platform) registers its live pending set here so the
 * self-healing display syncs — which live in shared/shared-react and cannot import the engine —
 * can leave a pended owner's run alone instead of resurrecting a deletion the engine has not
 * settled yet. Keyed per editor (main editor and footnote popover each register their own set).
 */
import { $getEditor, LexicalEditor, LexicalNode, NodeKey } from "lexical";

const pendedOwnersByEditor = new WeakMap<LexicalEditor, ReadonlySet<NodeKey>>();

export function registerPendedDisplayOwners(
  editor: LexicalEditor,
  pendedKeys: ReadonlySet<NodeKey>,
): () => void {
  pendedOwnersByEditor.set(editor, pendedKeys);
  return () => {
    if (pendedOwnersByEditor.get(editor) === pendedKeys) pendedOwnersByEditor.delete(editor);
  };
}

/** Whether `node`'s key is pended in the active editor. Call inside a read/update. */
export function $isDisplayOwnerPended(node: LexicalNode): boolean {
  return pendedOwnersByEditor.get($getEditor())?.has(node.getKey()) ?? false;
}
```

Export both from the barrel beside `attributeDisplay.utils`.

- [ ] **Step 4: Run to verify it passes**, then run the whole `shared` suite: `env -u _VOLTA_TOOL_RECURSION pnpm vitest run` in `libs/shared`.
- [ ] **Step 5: Commit** — `feat(shared): editor-scoped pended-display-owner side channel`.

### Task 6: Destroyed-piece → owner classifier (`shared`)

**Files:**
- Create: `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts` (+ barrel export beside Task 5's)
- Test: `libs/shared/src/nodes/usj/displayRunDeletion.utils.test.ts`

**Interfaces:**
- Consumes: `textTypeState`, `$isCharNode`, `$isVerseNode`, `$isMilestoneNode`, `$isMarkerNode`, `$isUnknownNode` (all `shared`).
- Produces: `$ownerOfDestroyedRunPiece(piece: LexicalNode): LexicalNode | undefined` — called inside a **prevEditorState.read()**; returns the CharNode / VerseNode / MilestoneNode / UnknownNode that owned the piece, or `undefined` for non-run nodes.

- [ ] **Step 1: Write the failing tests** (one per arm, using the `createBasicTestEnvironment` harness as in Task 5; build the tree, then read and assert):

```ts
// Arm 1 — char: attribute-tagged TextNode child of a CharNode → the CharNode.
// Arm 2 — verse: an attribute-tagged TextNode (or a va/vp MarkerNode glyph) riding in a verse's
//         sibling run chain → the VerseNode, walking back over run pieces only.
// Arm 3 — milestone: the attribute TextNode or opening/self-closing glyph directly chained
//         after a MilestoneNode → the MilestoneNode.
// Arm 4 — optbreak: any TextNode child of an UnknownNode with tag "optbreak" → the UnknownNode.
// Negative: plain paragraph text, a para-prefix glyph, a note's caller → undefined.
```

Write each as a real test building the exact sibling shapes from `attributeDisplay.utils.ts`'s docs (verse triplet: `[VerseNode][\va glyph][NBSP+value attr text][\va* glyph]`; milestone: `[MilestoneNode][opening glyph][NBSP|… attr text][self-closing glyph]`).

- [ ] **Step 2: Run to verify FAIL** (module not found).

- [ ] **Step 3: Implement**

```ts
import { $getState, $isTextNode, LexicalNode } from "lexical";
// + shared-internal imports per the barrel's local paths (mirror attributeDisplay.utils.ts's).

/** Walk back over run pieces (glyphs / attribute text) to the leaf owner the chain rides on. */
function $runChainOwner(piece: LexicalNode): LexicalNode | undefined {
  for (let prev = piece.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isVerseNode(prev) || $isMilestoneNode(prev)) return prev;
    const isRunPiece =
      $isMarkerNode(prev) ||
      ($isTextNode(prev) && $getState(prev, textTypeState) === "attribute");
    if (!isRunPiece) return undefined;
  }
  return undefined;
}

/**
 * The owner of a destroyed display-run piece — evaluated in the PREVIOUS editor state, where the
 * destroyed node still has its tree position. The deletion driver pends this owner so the
 * deletion settles on caret departure regardless of where the caret landed (deletion intent is
 * detected from the destruction itself, never from caret geometry).
 */
export function $ownerOfDestroyedRunPiece(piece: LexicalNode): LexicalNode | undefined {
  const parent = piece.getParent();
  if ($isUnknownNode(parent))
    return parent.getTag() === "optbreak" && $isTextNode(piece) ? parent : undefined;
  if ($isTextNode(piece) && $getState(piece, textTypeState) === "attribute")
    return $isCharNode(parent) ? parent : $runChainOwner(piece);
  if ($isMarkerNode(piece)) {
    const marker = piece.getMarker();
    if (marker === "va" || marker === "vp") return $runChainOwner(piece);
    if (piece.getMarkerSyntax() === "selfClosing") return $runChainOwner(piece);
    const previous = piece.getPreviousSibling();
    if ($isMilestoneNode(previous) && previous.getMarker() === marker) return previous;
  }
  return undefined;
}
```

- [ ] **Step 4: Run to verify PASS**, then the full `shared` suite.
- [ ] **Step 5: Commit** — `feat(shared): classify destroyed display-run pieces to their owner`.

### Task 7: Bug-1 pins + mutation-listener pend + pend-aware char grace

**Files:**
- Create: `packages/platform/src/editor/markerEdit/charAttributeDeletionSettle.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/markerEdit.test-helpers.tsx` (add `testEnvironmentWithCharSync`)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (mutation listeners + side-channel registration)
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (`$syncCharAttributeDisplay` pended guard)

**Interfaces:**
- Consumes: Task 5's `registerPendedDisplayOwners`/`$isDisplayOwnerPended`; Task 6's `$ownerOfDestroyedRunPiece`; `DELTA_CHANGE_TAG` (from `shared`), `HISTORIC_TAG` (lexical); `ImmutableTypedTextNode` class (from `shared`, `libs/shared/src/nodes/features/ImmutableTypedTextNode.ts`).
- Produces: `MarkerEditPlugin` pends the OWNER key of any locally-destroyed run piece; `$syncCharAttributeDisplay` leaves a pended owner's run alone. Tasks 8–10 rely on both.

- [ ] **Step 1: Add the char-sync harness helper** to `markerEdit.test-helpers.tsx`, mirroring `testEnvironmentWithSpacing` exactly but mounting `CharNodePlugin` (import from `shared-react`) instead of `TextSpacingPlugin`:

```tsx
/** Like `testEnvironment`, but also mounts `CharNodePlugin` — the shared-react home of the
 * self-healing char attribute-run sync — for tests where the sync and the engine's pend/settle
 * must interact, matching the real app's plugin stack. */
export async function testEnvironmentWithCharSync($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <CharNodePlugin />
    </>,
  );
}
```

- [ ] **Step 2: Write the failing bug-1 pins** in `charAttributeDeletionSettle.test.tsx` (copy the `Range.prototype.getBoundingClientRect` stub and the re-query-per-commit pattern from `verseAttributeSettle.test.tsx` verbatim):

```tsx
describe("char attribute-run deletion settles (TJ repro, 2026-08-05)", () => {
  // Shared initial state: settled `\nd test|stuff="thing"\nd*` + a second paragraph to depart to.
  const $initial = () => {
    const char = $createCharNode("nd");
    char.setUnknownAttributes({ stuff: "thing" });
    const run = $createTextNode('|stuff="thing"');
    $setState(run, textTypeState, "attribute");
    char.append(
      $createMarkerNode("nd"),
      $createTextNode(`${NBSP}test`),
      run,
      $createMarkerNode("nd", "closing"),
    );
    $getRoot().append(
      $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), char),
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createTextNode("body"),
      ),
    );
  };

  it("deleting the run alone clears the attributes on departure (element-point caret variant)", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    await act(async () =>
      editor.update(() => {
        const char = $firstChar(); // helper: first CharNode of first para, re-queried
        const run = requireDefined(
          char.getChildren().find(
            (c) => $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
          ),
          "run missing",
        );
        const index = run.getIndexWithinParent();
        run.remove();
        char.select(index, index); // the element-point caret the boundary heuristic misses
      }),
    );
    // The deletion must STICK while pending (no resurrect)…
    editor.getEditorState().read(() => {
      expect(
        $firstChar().getChildren().some(
          (c) => $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
        ),
      ).toBe(false);
    });
    // …and departure settles it: attributes cleared.
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
    editor.getEditorState().read(() => {
      expect($firstChar().getUnknownAttributes()?.stuff).toBeUndefined();
    });
  });

  it("delete-then-retype ends with ONLY the new value (no stale invisible attribute)", async () => {
    const { editor } = await testEnvironmentWithCharSync($initial);
    await act(async () =>
      editor.update(() => {
        const char = $firstChar();
        const run = requireDefined(
          char.getChildren().find(
            (c) => $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
          ),
          "run missing",
        );
        const index = run.getIndexWithinParent();
        run.remove();
        char.select(index, index);
      }),
    );
    await act(async () =>
      editor.update(() => {
        const content = requireDefined(
          $firstChar().getChildren().find(
            (c) => $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) !== "attribute",
          ),
          "content missing",
        );
        content.setTextContent(`${NBSP}test|stuff="thing2"`);
        content.select(content.getTextContentSize(), content.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
    editor.getEditorState().read(() => {
      expect($firstChar().getUnknownAttributes()?.stuff).toBe("thing2");
    });
  });
});
```

- [ ] **Step 3: Run to verify both FAIL** — `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run charAttributeDeletionSettle`. Record WHICH assertion fails and how (resurrect vs stale attrs) — this pins the actual live mechanism.

- [ ] **Step 4: Implement the mutation-listener pend** in `MarkerEditPlugin.tsx`, inside the registration effect (alongside the existing listeners), plus the side-channel registration:

```tsx
// In the effect, after `contextRef.current = context;`:
const unregisterPended = registerPendedDisplayOwners(editor, context.pendingKeys);
// …and call unregisterPended() in the effect cleanup, before unregister().

// Deletion driver, arming half: a locally-destroyed display-run piece pends its OWNER, read from
// the previous state — deletion intent comes from the destruction itself, never from caret
// geometry (the per-kind caret heuristics missed real deletion sites; the owner then kept stale
// state invisibly). Historic commits re-pend via $rependPendShapedNodes; collab applies are not
// local deletions; an owner destroyed in the same commit (whole-construct deletion, Tier-2
// splice) needs no pend.
const $pendOwnersOfDestroyed = (
  mutations: Map<NodeKey, NodeMutation>,
  payload: { updateTags: Set<string>; prevEditorState: EditorState },
) => {
  if (payload.updateTags.has(HISTORIC_TAG) || payload.updateTags.has(DELTA_CHANGE_TAG)) return;
  const ownerKeys: NodeKey[] = [];
  payload.prevEditorState.read(() => {
    for (const [key, mutation] of mutations) {
      if (mutation !== "destroyed") continue;
      const destroyed = $getNodeByKey(key);
      const owner = destroyed ? $ownerOfDestroyedRunPiece(destroyed) : undefined;
      if (owner) ownerKeys.push(owner.getKey());
    }
  });
  if (ownerKeys.length === 0) return;
  editor.getEditorState().read(() => {
    for (const ownerKey of ownerKeys)
      if ($getNodeByKey(ownerKey)?.isAttached()) context.pendingKeys.add(ownerKey);
  });
};
// register for the three node classes run pieces can be:
editor.registerMutationListener(TextNode, $pendOwnersOfDestroyed),
editor.registerMutationListener(MarkerNode, $pendOwnersOfDestroyed),
editor.registerMutationListener(ImmutableTypedTextNode, $pendOwnersOfDestroyed),
```

(Imports: `NodeMutation`, `EditorState` types from `lexical`; `DELTA_CHANGE_TAG`, `ImmutableTypedTextNode`, `registerPendedDisplayOwners`, `$ownerOfDestroyedRunPiece` from `shared`.)

- [ ] **Step 5: Implement the pended guard in the char sync** — `attributeDisplay.utils.ts`, `$syncCharAttributeDisplay`, after the equal-compare early return:

```ts
if ((run?.getTextContent() ?? "") === targetText) return;
// The engine holds this owner pending (a run deletion detected from the destruction itself):
// healing now would resurrect the deletion before caret departure settles it.
if ($isDisplayOwnerPended(char)) return;
if ($isCaretAtAttributeRunBoundary(run, closingGlyph)) return;
```

- [ ] **Step 6: Run the pins to verify PASS**, then the FULL platform suite + corpus:
`cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run` — everything green, corpus 141/141, zero skips. Pay attention to `markerEditUndoResettle` / `markerEditUndoRerenderResettle` (the HISTORIC guard protects them) and `markerEditLoop` (no new transform loops).
- [ ] **Step 7: Commit** — `fix(platform,shared): destruction-driven owner pend + pend-aware char grace fixes stale-attribute deletion`.

### Task 8: Uniform `$settlePendedDisplayOwner` (behavior-preserving) + verse/milestone pended grace

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (`$resolvePendingMarkers` non-marker arms → one function)
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (`$syncVerseAttributeDisplay`, `$syncMilestoneDisplayRun` pended guards)

**Interfaces:**
- Consumes: Tasks 5/7 outputs; all existing caret-held reporters (unchanged).
- Produces: `$settlePendedDisplayOwner(node: LexicalNode, context: MarkerEditContext): { handled: boolean; mutated: boolean }` exported from `markerEditTier1.utils.ts` — `handled: false` means "not a display-owner kind; caller falls through to its own arms". Task 9 adds the optbreak arm to THIS function.

- [ ] **Step 1: Pin current behavior first** — run `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEdit verseAttributeSettle milestoneAttributeSettle` and confirm green (this refactor must not change observable behavior).

- [ ] **Step 2: Extract.** In `markerEditTier1.utils.ts`, move the resolver's five non-marker arms (`$isCharNode` separator-gap re-pend at line ~333, char attribute re-pend ~338, verse re-pend ~353, milestone re-pend ~362, milestone entirely-absent removal ~372) verbatim into:

```ts
/**
 * The uniform deletion/pend settle for display-run OWNERS — the one place every kind's
 * grace-or-settle decision and entirely-absent deletion policy lives. Marker literals and plain
 * pending text are not owners and fall through (handled: false) to the caller's re-tokenize arm.
 */
export function $settlePendedDisplayOwner(
  node: LexicalNode,
  context: MarkerEditContext,
): { handled: boolean; mutated: boolean } {
  // (the five moved arms, byte-identical logic, each returning
  //  { handled: true, mutated: false } for a re-pend and
  //  { handled: true, mutated: true } for the milestone removal)
  return { handled: false, mutated: false };
}
```

`$resolvePendingMarkers`' loop body becomes: MarkerNode arm (unchanged) → `const settled = $settlePendedDisplayOwner(node, context); if (settled.handled) { mutated = settled.mutated || mutated; continue; }` → else-arm `$requestTier2ForNode` (unchanged). Keep every existing code comment with its arm.

- [ ] **Step 3: Add the pended guards to the verse/milestone syncs** (same shape and comment as Task 7 Step 5):

```ts
// $syncVerseAttributeDisplay, after the isAttached check:
if ($isDisplayOwnerPended(verse)) return;
// $syncMilestoneDisplayRun, after the isAttached check:
if ($isDisplayOwnerPended(milestone)) return;
```

- [ ] **Step 4: Run the full platform + shared suites** — behavior-preserving: every test green, corpus 141/141.
- [ ] **Step 5: Commit** — `refactor(platform): one $settlePendedDisplayOwner for all display-owner resolution arms`.

### Task 9: Bug-2 pins + optbreak deletion policy

**Files:**
- Create: `packages/platform/src/editor/markerEdit/optbreakDeletionSettle.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (`$settlePendedDisplayOwner` optbreak arm)

**Interfaces:**
- Consumes: Task 8's `$settlePendedDisplayOwner`; Task 7's mutation-listener pend (already classifies optbreak display children via Task 6 arm 4); `$createUnknownNode`, `$isUnknownNode` from `shared`; `$createImmutableTypedTextNode` from `shared` (check the exact creator signature in `libs/shared/src/nodes/features/ImmutableTypedTextNode.ts` — mirror how `createImmutableTypedText` in `usj-editor.adaptor.ts:601-620` shapes the node, including token mode).
- Produces: an empty optbreak UnknownNode is removed on departure; the undead-husk class is dead.

- [ ] **Step 1: Write the failing pins**:

```tsx
describe("optbreak deletion settles (TJ repro: undead //)", () => {
  it("deleting the // display text removes the UnknownNode on departure, keeping flank bytes", async () => {
    const { editor } = await testEnvironment(() => {
      const optbreak = $createUnknownNode("optbreak");
      optbreak.append($createImmutableTypedTextNode("marker", "//")); // token-mode display child
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("before "),
          optbreak,
          $createTextNode(" after"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const unknown = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isUnknownNode),
          "optbreak missing",
        );
        unknown.getChildren().forEach((child) => child.remove()); // what backspace does to a token
        const before = unknown.getPreviousSibling();
        if ($isTextNode(before)) before.select(before.getTextContentSize(), before.getTextContentSize());
      }),
    );
    await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      expect(para.getChildren().some($isUnknownNode)).toBe(false);          // husk gone
      const text = para.getTextContent();
      expect(text).toContain("before ");                                     // flank bytes intact
      expect(text).toContain(" after");
      expect(text).not.toContain("//");
    });
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — the UnknownNode survives (the undead husk).

- [ ] **Step 3: Implement the policy arm** — first arm inside `$settlePendedDisplayOwner`:

```ts
// Deleting an optbreak's // display text deletes the optbreak: the token IS the construct's
// entire byte representation, and the empty UnknownNode husk it left serialized an optbreak
// with no visible bytes and multiple indistinguishable caret positions. No re-tokenize needed —
// the flanking significant spaces stay exactly as typed (displayed bytes win).
if ($isUnknownNode(node)) {
  if (node.getTag() === "optbreak" && node.getChildrenSize() === 0) {
    node.remove();
    return { handled: true, mutated: true };
  }
  return { handled: true, mutated: false }; // other unknowns: never re-tokenized, nothing to settle
}
```

- [ ] **Step 4: Run pins to PASS + full platform suite + corpus 141/141.**
- [ ] **Step 5: Commit** — `fix(platform): deleting an optbreak's // removes the node (undead-husk class retired)`.

### Task 10: Bug-3 pins + source-site pend

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (add `$verseOfAttributeSourceText`)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts` (`$textNodeTier2Transform` new arm + `$rependPendShapedNodes` mirror)
- Test: extend `packages/platform/src/editor/markerEdit/verseAttributeSettle.test.tsx`
- Test: extend `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts` (predicate unit tests — find the exact file with `ls libs/shared/src/nodes/usj/*.test.*`; if the attribute-display tests live under a different name, extend that file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `$verseOfAttributeSourceText(node: LexicalNode): VerseNode | undefined` (from `shared`) — the verse whose `va`/`vp` SOURCE span `node` is content of. The plan REFINES spec §5d here: the pend key is the edited TEXT node's own key (grace comes free via the resolver's caret-node exception, exactly like the `|`-in-closed-span branch), and departure's paragraph re-tokenize folds the bytes onto the verse — the spec's required outcome. Do not pend the verse's key: an owner-key pend without a matching caret-held arm would settle mid-typing.

- [ ] **Step 1: Write the failing settle pin** in `verseAttributeSettle.test.tsx`:

```tsx
it("typing a value into an empty \\va span re-folds to altnumber on departure (TJ repro)", async () => {
  const { editor } = await testEnvironmentWithSpacing(() => {
    const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, undefined, undefined);
    const span = $createCharNode("va"); // the settled empty form: displayed `\va \va*`
    span.append($createMarkerNode("va"), $createTextNode(NBSP), $createMarkerNode("va", "closing"));
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"), $createTextNode(NBSP), verse, span, $createTextNode("In the beginning"),
      ),
      $createParaNode("p").append(
        $createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("body"),
      ),
    );
  });
  await act(async () =>
    editor.update(() => {
      const span = requireDefined(
        $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
        "va span missing",
      );
      const content = span.getChildAtIndex(1); // the NBSP separator text
      if (!$isTextNode(content)) throw new Error("span content missing");
      content.setTextContent(`${NBSP}3`); // the user types the value
      content.select(2, 2);
    }),
  );
  await act(async () => editor.update(() => $bodyTextNode().select(0, 0)));
  editor.getEditorState().read(() => {
    const verse = requireDefined(
      $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
      "verse missing",
    );
    expect(verse.getAltnumber()).toBe("3");                       // re-folded
    const open = verse.getNextSibling();                          // canonical triplet re-materialized
    expect($isMarkerNode(open) && open.getMarker() === "va").toBe(true);
    // and the source span is gone (folded into the verse)
    expect($getRoot().getChildren().filter($isParaNode)[0].getChildren().some($isCharNode)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** — altnumber stays `undefined` (nothing pends the edit).

- [ ] **Step 3: Implement the predicate** in `attributeDisplay.utils.ts`:

```ts
/**
 * The VerseNode whose `\va`/`\vp` SOURCE span `node` is content of, or `undefined`. A settled
 * empty run leaves a standalone `char va`/`char vp` span in the verse's run position (displayed
 * `\va \va*`); a value typed into it is an ordinary content edit that no textType tag marks, so
 * the pend decision must key on the SITE — content of a va/vp span whose sibling chain reaches
 * back to a verse over run pieces only — for departure's re-tokenize to fold the bytes onto the
 * verse (the tokenizer's attrCapture). A va/vp span NOT in a verse's run position re-tokenizes
 * to itself (fixed point) and settles nothing — pending it is harmless.
 */
export function $verseOfAttributeSourceText(node: LexicalNode): VerseNode | undefined {
  const span = node.getParent();
  if (!$isCharNode(span)) return undefined;
  const marker = span.getMarker();
  if (marker !== "va" && marker !== "vp") return undefined;
  for (let prev = span.getPreviousSibling(); prev; prev = prev.getPreviousSibling()) {
    if ($isVerseNode(prev)) return prev;
    const isRunPiece =
      ($isMarkerNode(prev) && (prev.getMarker() === "va" || prev.getMarker() === "vp")) ||
      ($isTextNode(prev) && $getState(prev, textTypeState) === "attribute") ||
      ($isCharNode(prev) && (prev.getMarker() === "va" || prev.getMarker() === "vp"));
    if (!isRunPiece) return undefined;
  }
  return undefined;
}
```

Unit-test the predicate (positive: span directly after verse; span after a folded `\va` triplet; negative: va span with no verse before it, non-va span, bare paragraph text).

- [ ] **Step 4: Hook the trigger** — in `$textNodeTier2Transform`'s no-backslash branch, add the arm between the `//` arm and the else-delete:

```ts
else if (text.includes("//") && !$inLiteralOnlyBlock(node))
  context.pendingKeys.add(node.getKey());
// A value typed into an empty `\va`/`\vp` SOURCE span is a pending attribute edit for the verse
// the span rides on: no backslash or pipe ever lands, so without pending here the key is
// deleted and departure settles nothing — the value never re-folds to altnumber/pubnumber and
// every save warns (the third live bug). Own-key pend: the caret-node exception graces it
// mid-typing, and departure's paragraph rebuild folds the bytes onto the verse (attrCapture).
else if ($verseOfAttributeSourceText(node)) context.pendingKeys.add(node.getKey());
else context.pendingKeys.delete(node.getKey());
```

Mirror in `$rependPendShapedNodes`' plain-TextNode branch (the parallel switch must stay in lockstep):

```ts
if (
  text.includes("\\") ||
  (text.includes("|") && $isInClosedCharSpan(node)) ||
  text.includes("//") ||
  $verseOfAttributeSourceText(node) !== undefined
)
  context.pendingKeys.add(node.getKey());
```

- [ ] **Step 5: Run pins to PASS + full platform & shared suites + corpus 141/141.**
- [ ] **Step 6: Commit** — `fix(platform,shared): typed values in empty va/vp source spans pend and re-fold on departure`.

### Task 11: Wave-1 guard pins and full verification

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/charAttributeDeletionSettle.test.tsx` (add guard pins)

**Interfaces:** none new — this task proves the wave's invariants.

- [ ] **Step 1: HISTORIC guard pin.** Using the HistoryPlugin-mounting helper in `markerEdit.test-helpers.tsx`: settle a run deletion (Task 7 flow), dispatch `UNDO_COMMAND`, assert the run is restored AND stays restored across a subsequent unrelated commit (mirror `markerEditUndoResettle.test.tsx`'s structure — read it first; the mutation listener must not have pended the restored owner during the historic commit).
- [ ] **Step 2: Collab guard pin.** Destroy a run piece inside `editor.update(() => { $addUpdateTag(DELTA_CHANGE_TAG); … })`; assert NO settle occurs on departure and the sync heals the run back from node state (remote-authority semantics preserved).
- [ ] **Step 3: Splice guard sanity.** Run an edit that triggers a real Tier-2 rebuild inside a paragraph containing a milestone run (extend an existing `milestoneAttributeSettle.test.tsx` flow); assert no stray pended keys drive a second visible mutation afterwards (departure after the settle is a no-op commit).
- [ ] **Step 4: Full gate.** `env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test` AND root `env -u _VOLTA_TOOL_RECURSION npx eslint .` — all clean, corpus 141/141, zero skips anywhere.
- [ ] **Step 5: Commit** — `test(platform): pin wave-1 driver guards (historic, collab, splice)`.

---

## Wave 2a — the `AttributeRunNode` wrapper

### Task 12: `AttributeRunNode` class + registration

**Files:**
- Create: `libs/shared/src/nodes/usj/AttributeRunNode.ts` (+ barrel export)
- Modify: `libs/shared-react/src/nodes/usj/index.ts` (`usjReactNodes` list — add the class)
- Test: `libs/shared/src/nodes/usj/AttributeRunNode.test.ts`

**Interfaces:**
- Produces (all later wave-2a tasks consume):
  - `type AttributeRunKind = "va" | "vp" | "milestone"`
  - `class AttributeRunNode extends ElementNode` with `getRunKind(): AttributeRunKind`, `setRunKind(kind): this`
  - `$createAttributeRunNode(runKind: AttributeRunKind): AttributeRunNode`
  - `$isAttributeRunNode(node: LexicalNode | null | undefined): node is AttributeRunNode`
  - Serialized shape: `{ type: "attribute-run", runKind, version: 1 }`

- [ ] **Step 1: Write failing tests** — create/clone/serialize round-trip; `createDOM` classes (`attribute-run` always; `usfm_va`/`usfm_vp` for verse kinds; none extra for `milestone`); `isInline() === true`; `canBeEmpty() === true`.
- [ ] **Step 2: Implement** — model the class on `UnknownNode.ts` (same file layout: statics, getters/setters via `getWritable`/`getLatest`, `updateDOM` returning `false` with in-place class sync when `runKind` changes, `exportDOM` returning `{ element: null }`, `$create`/`$is` helpers). Doc header: the wrapper is the ONE sibling holding a leaf owner's display run; its children are the run pieces; it contributes no bytes of its own; empty wrappers are transient husks the deletion driver removes.
- [ ] **Step 3: Register** in `usjReactNodes` and run the shared + shared-react suites.
- [ ] **Step 4: Commit** — `feat(shared): AttributeRunNode inline wrapper for verse/milestone display runs`.

### Task 13: Dual-read — every consumer recognizes the wrapper shape (runtime shape unchanged)

Green-throughout migration, step 1 of 3: teach every run consumer to RECOGNIZE a wrapped run
while the adaptor still emits loose siblings, so this commit changes no runtime shape and every
existing test stays green. (The original single-flip sequencing tolerated mid-wave red suites,
which the Global Constraints forbid; spec §10 governs.)

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` — `$verseAttributeRunPieces` and `$milestoneAttributeRunPieces` gain wrapper recognition (returned record gains `wrapper?: AttributeRunNode`); syncs repair pieces INSIDE a wrapper when one is present (no shape conversion in this task)
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` — `$milestoneDisplayRun` (~139) / `$verseAttributeRun` (~162) return `[wrapper]` when the next sibling is a matching wrapper (fragment side flattens `wrapper.getChildren()` through `$appendNodesFragment`; sentinel-absorption arms push `[node, wrapper]`; `index` advances by 1 per wrapper); `$appendSignature` verse/milestone branches recurse into `wrapper.getChildren()` when a wrapper is found
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` + `delta-common.utils.ts` — nodes with an `AttributeRunNode` ancestor contribute nothing to ops or OT positions (added ALONGSIDE the existing loose-piece checks; nothing deleted yet)
- Modify: platform `editor-usj.adaptor.ts` reverse exclusions — skip `AttributeRunNode` subtrees (find the site with `grep -n "recurseNodes\|textType" packages/platform/src/editor/adaptors/editor-usj.adaptor.ts`)
- Modify: `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts` — classifier arm: destroyed `AttributeRunNode` → previous-sibling owner (walk back over preceding run wrappers/pieces to the VerseNode/MilestoneNode); a destroyed piece whose prev-state parent is an `AttributeRunNode` → that wrapper's owner
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` — `$settlePendedDisplayOwner` husk arm: an EMPTY attached `AttributeRunNode` is removed and its owner's policy runs (mirror the optbreak arm)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` — register the mutation listener for `AttributeRunNode`; register an `AttributeRunNode` transform (dirty wrapper → re-drive the owner's sync/pend, i.e. call `$syncAndPendVerse`/`$syncAndPendMilestone` per `runKind`)
- Modify: `libs/shared-react/src/plugins/usj/TextSpacingPlugin.tsx` — trailing-space transform exempts nodes inside an `AttributeRunNode` (alongside the existing attribute-textType exemption)
- Test: extend `libs/shared/src/nodes/usj/displayRunDeletion.utils.test.ts`, the attribute-display unit tests, and `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx` with wrapped-shape cases (hand-built wrappers), while ALL existing loose-shape tests stay untouched and green

**Interfaces:**
- Consumes: Task 12's `AttributeRunNode` API.
- Produces: every scanner/collector/gate/driver handles BOTH shapes; `VerseAttributeRunPieces`/`MilestoneRunPieces` gain `wrapper?: AttributeRunNode`. Task 14 flips the built shape; Task 15 deletes the loose arms.

- [ ] **Step 1:** Write failing wrapped-shape unit tests: pieces scanners on a hand-built wrapper; fragment bytes for a wrapped verse/milestone run identical to the loose equivalent (build both shapes, compare `$buildParaFragment` text); delta ops exclude wrapper subtrees; classifier maps destroyed wrapper → owner; empty-wrapper husk removed on departure.
- [ ] **Step 2:** Run to verify the new tests FAIL, existing suites still green.
- [ ] **Step 3:** Implement per the Files list. Caret-site predicates gain the containment arm (caret's ancestor chain includes the wrapper → caret holds the run's site) ALONGSIDE the existing geometry arms.
- [ ] **Step 4:** Full shared + shared-react + platform suites green, corpus 141/141 (runtime shape unchanged — this is the proof the dual-read is passive).
- [ ] **Step 5: Commit** — `feat(shared,platform): all display-run consumers recognize AttributeRunNode-wrapped runs (dual-read)`.

### Task 14: Flip — adaptor emits wrappers, syncs heal forward, fixtures migrate

Green-throughout migration, step 2 of 3: the built shape flips to wrapped; dual-read consumers
(Task 13) keep every path working; old loose states heal forward.

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` — `addVerseAttributeRun` (line ~773) pushes ONE serialized `attribute-run` node containing the three pieces it previously pushed loose; the milestone editable branch (find with `grep -n "createMilestone\|selfClosing" packages/platform/src/editor/adaptors/usj-editor.adaptor.ts`) moves its opening glyph + `addAttributes` text + self-closing glyph inside one wrapper (`runKind: "milestone"`). Visible/hidden-mode output UNCHANGED. The Tier-2 rebuild materializer flows through `serializeEditorState`, so rebuilt paragraphs get wrappers with no extra work — verify by reading, do not duplicate builders.
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` — syncs now heal FORWARD: loose pieces found without a wrapper are wrapped in place (one migration path for pre-flip editor states, undo stacks, and collab-materialized bare shapes); missing runs are created wrapped
- Modify: `packages/platform/src/editor/markerEdit/markerEdit.test-helpers.tsx` — add `$appendVerseAttributeRun(verse: VerseNode, marker: "va" | "vp", value: string): AttributeRunNode` and `$appendMilestoneRun(milestone: MilestoneNode, attributeText: string): AttributeRunNode` fixture helpers building WRAPPED runs
- Modify: `packages/platform/src/editor/markerEdit/verseAttributeSettle.test.tsx`, `milestoneAttributeSettle.test.tsx`, attribute-display unit tests — migrate hand-built loose fixtures to the helpers; adjust sibling-shape assertions (e.g. a re-materialized `\va` run is now `$isAttributeRunNode(verse.getNextSibling())` with the glyph inside)
- Modify: the stylesheet defining `.attribute` (find: `grep -rn "\.attribute\b" --include="*.css" --include="*.scss" libs packages | grep -v test`) — add `.attribute-run` rules (dim run styling; `usfm_va`/`usfm_vp` green-superscript styling via the wrapper's classes — closes handoff backlog item 8)
- Modify: `libs/test-data/src/data/2sa.lexical.*.ts` — regenerated (`cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm generate:test-data`), never hand-edited
- Test: extend the adaptor tests (find exact name with `ls packages/platform/src/editor/adaptors/*.test.*`): a serialized editable-mode verse with `altnumber` has one `attribute-run` next sibling (`runKind: "va"`, children `[marker va opening, NBSP+value attribute text, marker va closing]`); milestone likewise; visible-mode milestone output pinned unchanged

**Interfaces:**
- Consumes: Tasks 12–13.
- Produces: wrapped runtime shape everywhere; wave-1 bug pins, settle tests, corpus all green at THIS commit (the acceptance that dual-read held).

- [ ] **Step 1:** Write the failing adaptor tests (wrapped serialized shape).
- [ ] **Step 2:** Implement the adaptor flip + heal-forward syncs + fixture helpers + test migrations + CSS.
- [ ] **Step 3:** Regenerate the 2SA lexical fixtures; the freshness pin must pass.
- [ ] **Step 4:** FULL gate at this commit: platform + shared + shared-react suites green, corpus 141/141 zero skips, wave-1 bug pins green under the wrapped shape.
- [ ] **Step 5: Commit** — `feat(platform,shared): editable-mode runs build and heal as AttributeRunNode wrappers`.

### Task 15: Cleanup — delete the loose-sibling geometry

Green-throughout migration, step 3 of 3: with nothing building or healing loose runs, delete the
compensating code.

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` — remove loose-shape recognition arms from the scanners; caret-site predicates lose the per-piece geometry arms (containment + the one just-removed-wrapper flank arm remain)
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` — delete `$isBareAttributeGlyph` and its call sites (the wrapper-ancestor skip from Task 13 is the one remaining gate)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` — delete `$milestoneOfOpeningGlyph` / `$verseOfAttributeGlyph` and their MarkerNode-transform call sites (the Task 13 wrapper transform owns run-edit dirtying now); delete the per-piece verse-value styling arm in the TextNode mutation listener (the wrapper's CSS owns it)
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` — collectors/signature drop the loose-run walks (wrapper-only)
- Test: delete/re-point loose-shape unit tests; every behavior test must already be on wrapped fixtures (Task 14)

**Interfaces:**
- Consumes: Tasks 13–14 (wrapped-only runtime).
- Produces: single-shape codebase; the registry plan (Task 17) builds on this.

- [ ] **Step 1:** Delete per the Files list, running the affected suites after each file.
- [ ] **Step 2:** FULL gate: all suites green, corpus 141/141; wave-1 bug pins green.
- [ ] **Step 3: Commit** — `refactor(platform,shared,shared-react): loose-sibling display-run geometry deleted (wrapper-only)`.

### Task 16: Wave-2a gate — corpus, repo gate, live visual check

- [ ] **Step 1:** `env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test` + root `env -u _VOLTA_TOOL_RECURSION npx eslint .` — all clean; corpus 141/141 zero skips.
- [ ] **Step 2:** Live check in paranext-core (dev loop per the standard-view conventions: yalc build THEN extract-api, DLL rebuild as needed): open a chapter with `\va` in Standard view; verify the whole run renders green-superscript (item 8 closed), editing/deleting a run still settles, optbreak deletion leaves no husk. Screenshot via the `visual-verification` skill.
- [ ] **Step 3:** Commit any residue; append a dated postscript line to the handoff doc marking items 1–3, 6, 8 closed (`git add -f`).

---

## Follow-on planning (own plan docs, against landed code)

### Task 17: Write the wave-3 (registry) plan

- [ ] Invoke superpowers:writing-plans against spec §7 with the wrapper LANDED: descriptor type, the one sync/reporter/pend-settle/deletion driver, `$rependPendShapedNodes` descriptor dispatch, per-kind registration wrappers, test re-pointing. Save as `docs/superpowers/plans/<date>-display-run-registry.md`; get TJ sign-off before executing.

### Task 18: Write the wave-4 (settled `getUsj()`) plan

- [ ] Invoke superpowers:writing-plans against spec §8 (may be written right after wave 1 if sequencing favors it): virtual settle in `Editor.tsx`/`editor.model.ts`, pending-set exposure, sentinel in-place serialization, the real-vs-virtual equivalence property test, paranext-core host changes (`performDebouncedPdpSave` stops committing; sync-hook simplification), and the verse-9 capture/fix. Save as `docs/superpowers/plans/<date>-settled-getusj.md`; get TJ sign-off before executing.
