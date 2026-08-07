# Display-Run Registry (Wave 3 / Phase 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every per-kind copy of the display-run duties (construct, self-heal-with-grace, pend-on-edit/delete, settle-on-departure) with ONE descriptor per kind plus ONE shared sync transform, caret-held reporter, pend/settle driver, and deletion function — so a missing quadrant becomes a type error instead of a runtime bug (spec `docs/superpowers/specs/2026-08-06-display-run-consolidation-design.md` §7).

**Architecture:** A `DisplayRunDescriptor` names the eight duties for one kind (`ownerPredicate`, `ownerOf`, `expectedPieces`, `scanPieces`, `graceSite`, `settleScope`, `deletionPolicy`, `byteFormat`). The descriptor TYPE and the descriptor-parameterized drivers live in `libs/shared/src/nodes/usj/` (no converter imports). The descriptor INSTANCES are assembled one layer up in a new `libs/shared/src/displayRun/` module, which may legally import `converters/usfm` (`defaultMarkerAttribute`, `milestoneDefaultAttribute`) — the same escape hatch `libs/shared/src/plugins/PerfOperations/` already uses. Registration homes (`CharNodePlugin`, `TextSpacingPlugin`, `MarkerEditPlugin`) keep their current mode-gating and become thin wrappers over the shared driver. The tokenizer and the whole Tier-2 fragment/signature machinery stay OUT.

**Tech Stack:** TypeScript, Lexical, React, vitest (per-package via pnpm), nx monorepo (`@eten-tech-foundation/platform-editor`, `shared`, `shared-react`).

## Global Constraints

- Repo: `~/source/repos/workspaces/standard-view/scripture-editors`, branch `standard-view-pt-4187`. All paths below are relative to that repo.
- PT9 reference at `~/source/repos/Paratext` is read-only. NEVER edit it.
- The corpus test `packages/platform/src/editor/markerEdit/tier2Rebuild.corpus.test.tsx` must stay **141/141 with zero skips** at every commit.
- Fixed points (spec §9, must not change): tokenizer/losslessness core (`usfmFragmentToUsjContent`, `extractAttributes`, `scanMilestone`, NBSP↔space flattening); `canonicalAttributeText`; the editor→USJ and delta exclusion gating SEMANTICS (display bytes never in ops or saved USJ); Tier-2's preserve-or-refuse machinery (fixed-point signature, sentinel symmetry, guard rails, termination); the corpus losslessness + round-trip property tests — extended, never weakened.
- Prefix every `pnpm`/`nx` invocation with `env -u _VOLTA_TOOL_RECURSION` and judge success by EXIT CODE, not output tail.
- Test commands: per-package `cd <pkg> && env -u _VOLTA_TOOL_RECURSION pnpm vitest run <file-substring>`; repo-wide gate `env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test` plus root `env -u _VOLTA_TOOL_RECURSION npx eslint .` — both must be clean before the wave is declared done.
- Subagents run tests in the **FOREGROUND only**. No background test runs.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Code comments stand on their own: no plan/task/spec-section/JIRA breadcrumbs in code comments.
- Behavior-preserving refactor steps are pinned green BEFORE and AFTER: run the named suite before touching the file, confirm green, refactor, run it again.
- `docs/superpowers/` is gitignored — `git add -f` any spec/plan file; lint-staged's `[FAILED] …ignored by .gitignore` lines on such commits are benign (the commit still lands; verify with `git log -1 --stat`).

---

## File Structure

| File | Responsibility | Status |
|---|---|---|
| `libs/shared/src/nodes/usj/displayRunDescriptor.ts` | The descriptor TYPE and its value types. No logic, no converter imports. | Create (Task 1) |
| `libs/shared/src/displayRun/displayRunRegistry.ts` | The descriptor INSTANCES, assembled where converter imports are legal. | Create (Task 1) |
| `libs/shared/src/displayRun/displayRunOwner.utils.ts` | `$ownerOfRunPiece` — the ONE owner walk, registry-consulting. | Create (Task 2), replaces `displayRunDeletion.utils.ts` |
| `libs/shared/src/displayRun/index.ts` | Barrel for the above. | Create (Task 1) |
| `libs/shared/src/nodes/usj/displayRunSync.utils.ts` | `$syncDisplayRun`, `$caretHoldsRunSite`, `$runDiverges`, `$runEntirelyAbsent` — descriptor-parameterized drivers. | Create (Task 4) |
| `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` | Byte derivation + tolerant piece scanners only; the three syncs and three caret-held reporters are deleted. | Shrinks (Tasks 4–8) |
| `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts` | — | Deleted (Task 2) |
| `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` | `$settlePendedDisplayOwner` becomes registry dispatch. | Modified (Task 9) |
| `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts` | `$rependPendShapedNodes` becomes registry dispatch. | Modified (Task 10) |
| `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` | Owner walks and per-kind sync/pend wrappers collapse to `registerDisplayRunSync`. | Shrinks (Tasks 3, 6, 7, 13) |
| `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx` / `TextSpacingPlugin.tsx` | Registration homes keep their mode-gating via `registerDisplayRunSync`. | Modified (Tasks 4, 5, 13) |
| `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` / `delta-common.utils.ts` | One shared exclusion predicate; kind-keyed ops gate. | Modified (Task 12) |

---

## Task 1: The descriptor type and the four attribute-run descriptors

**Files:**
- Create: `libs/shared/src/nodes/usj/displayRunDescriptor.ts`
- Create: `libs/shared/src/displayRun/displayRunRegistry.ts`
- Create: `libs/shared/src/displayRun/index.ts`
- Modify: `libs/shared/src/nodes/usj/index.ts` (add the descriptor export next to line 17 `export * from "./attributeDisplay.utils.js";`)
- Modify: `libs/shared/src/index.ts` (7 lines; insert `export * from "./displayRun/index.js";` after line 3 `export * from "./converters/index.js";`)
- Test: `libs/shared/src/displayRun/displayRunRegistry.test.ts`

**Interfaces:**
- Consumes: `canonicalAttributeText(attributes, defaultAttributeName?): string` and `milestoneAttributes(sid, eid, unknownAttributes): UnknownAttributes` from `libs/shared/src/nodes/usj/attributeDisplay.utils.ts:92` and `:112`; `$charClosingGlyph(char): MarkerNode | undefined` (`:129`); `$charAttributeDisplayNode(char): TextNode | undefined` (`:167`); `$verseAttributeRunPieces(after, marker): VerseAttributeRunPieces` (`:330`); `$milestoneAttributeRunPieces(milestone): MilestoneRunPieces` (`:651`); `defaultMarkerAttribute(marker): string | undefined` and `milestoneDefaultAttribute(name): string` from `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts:356` and `:396`.
- Produces:
  - `type DisplayRunKind = "char" | "va" | "vp" | "milestone" | "optbreak" | "opaqueUnknown" | "separator" | "nestedGlyph"`
  - `interface ExpectedRun { readonly wantsRun: boolean; readonly valueText: string | undefined }`
  - `interface ScannedRun { readonly opener?: MarkerNode; readonly value?: LexicalNode; readonly closer?: MarkerNode; readonly wrapper?: AttributeRunNode }`
  - `type SettleScope = "owner" | "none"`
  - `type DeletionPolicy = "remove-owner" | "retokenize" | "none"`
  - `interface RunByteFormat { readonly writer: "wrapper" | "owner-children" | "kind-owned" | "read-only"; readonly runKind?: AttributeRunKind; readonly glyphs: "none" | "with-value" | "unconditional"; readonly glyphMarker?: (owner: LexicalNode) => string; readonly closerSyntax?: "closing" | "selfClosing"; readonly insertRunBefore?: (owner: LexicalNode) => LexicalNode | undefined; readonly insertRunAfter?: (owner: LexicalNode) => LexicalNode | undefined }`
  - `interface DisplayRunDescriptor { readonly kind: DisplayRunKind; readonly ownerPredicate: (node: LexicalNode) => boolean; readonly ownerOf: (node: LexicalNode) => LexicalNode | undefined; readonly expectedPieces: (owner: LexicalNode) => ExpectedRun; readonly scanPieces: (owner: LexicalNode) => ScannedRun; readonly graceSite: (owner: LexicalNode, pieces: ScannedRun) => boolean; readonly settleScope: SettleScope; readonly deletionPolicy: DeletionPolicy; readonly byteFormat: RunByteFormat }`
  - `interface DisplayRunOwnerRef { readonly owner: LexicalNode; readonly kind: DisplayRunKind }`
  - `const displayRunDescriptors: readonly DisplayRunDescriptor[]` and `function displayRunDescriptor(kind: DisplayRunKind): DisplayRunDescriptor`

- [ ] **Step 1: Write the descriptor type**

Create `libs/shared/src/nodes/usj/displayRunDescriptor.ts`:

```ts
/**
 * The display-run registry's descriptor type: one record per engine-owned display kind, naming
 * every duty that kind owes. Each kind (a char span's `|…` attribute run, a verse's `\va`/`\vp`
 * value runs, a milestone's attribute run, an optbreak's `//` token, an opening char glyph's
 * separator, a nested glyph's `+`) supplies the SAME eight fields, and the shared drivers
 * (displayRunSync.utils.ts, and the marker-edit engine's pend/settle path) read only those
 * fields. Because every field is required, adding a kind without deciding one of its duties is a
 * type error rather than a quadrant that silently does nothing at runtime.
 *
 * Every callback here reads or writes the Lexical tree and must be invoked inside an
 * `editor.read()` / `editor.update()`. The callbacks take a bare `LexicalNode` and narrow with
 * their own type guard: a heterogeneous registry array cannot be generic over its owner type and
 * still be iterable by a driver that only has a dirtied node in hand.
 */

import { AttributeRunKind, AttributeRunNode } from "./AttributeRunNode.js";
import { MarkerNode } from "../features/MarkerNode.js";
import { LexicalNode } from "lexical";

/** Which display kind a descriptor governs. Also the key the deletion classifier reports and the
 * collab exclusion gate is indexed by, so a run piece's kind is never re-derived by shape. */
export type DisplayRunKind =
  | "char"
  | "va"
  | "vp"
  | "milestone"
  | "optbreak"
  | "opaqueUnknown"
  | "separator"
  | "nestedGlyph";

/**
 * What an owner's run SHOULD be right now, derived from owner state alone.
 *
 * `wantsRun` and `valueText` are deliberately independent. A milestone's opening/self-closing
 * glyph pair is UNCONDITIONAL — it always wants a run — while the attribute text between the
 * glyphs comes and goes, so an attribute-less milestone is `{ wantsRun: true, valueText:
 * undefined }`. A char span or a verse wants no run at all once its attribute state is empty:
 * `{ wantsRun: false, valueText: undefined }`. Collapsing the two into "is there text" is what
 * makes an attribute-less milestone's deletion look like an ordinary heal-removal.
 */
export interface ExpectedRun {
  readonly wantsRun: boolean;
  readonly valueText: string | undefined;
}

/**
 * The run pieces currently in the tree, scanned tolerantly: a mid-edit tree can be missing any
 * subset, so every field is individually optional. `value` is a bare `LexicalNode` because an
 * optbreak's display token is an `ImmutableTypedTextNode` (a DecoratorNode), not a `TextNode`;
 * writers narrow with `$isTextNode` before calling `setTextContent`.
 */
export interface ScannedRun {
  readonly opener?: MarkerNode;
  readonly value?: LexicalNode;
  readonly closer?: MarkerNode;
  readonly wrapper?: AttributeRunNode;
}

/** Whose key the pend/settle machinery holds for this kind. `"none"` means the kind has no edit
 * surface at all (nested glyphs: nothing about a `+` can be pending). */
export type SettleScope = "owner" | "none";

/**
 * What a settle does when the run is ENTIRELY absent:
 * - `"remove-owner"` — the run was the owner's whole byte representation, so deleting all of it
 *   deletes the owner (a milestone, an optbreak `UnknownNode`);
 * - `"retokenize"` — the absent run's missing bytes re-tokenize into cleared owner state (a char
 *   span's attributes, a verse's altnumber/pubnumber);
 * - `"none"` — the settle has nothing to do but must still report the owner as handled, so the
 *   caller's re-tokenize fallback never routes it anywhere (an opaque `UnknownNode` block).
 */
export type DeletionPolicy = "remove-owner" | "retokenize" | "none";

/** How a kind's run is materialized in the tree. */
export interface RunByteFormat {
  /**
   * Who writes this kind's pieces:
   * - `"wrapper"` — the shared sync driver writes them as children of an `AttributeRunNode`;
   * - `"owner-children"` — the shared sync driver writes them among the owner's own children;
   * - `"kind-owned"` — the kind keeps its own writer (the separator's prefix/spacer sync, the
   *   nested-glyph `+` sync) and the shared sync driver never writes for it;
   * - `"read-only"` — nothing ever heals this run back; it is built once and only deleted (an
   *   optbreak's `//` token). A `"read-only"` run that is absent is therefore statically known to
   *   mean "settle removes this owner", which a healable run's absence never means.
   */
  readonly writer: "wrapper" | "owner-children" | "kind-owned" | "read-only";
  /** The wrapper's `runKind`, required when `writer` is `"wrapper"`. */
  readonly runKind?: AttributeRunKind;
  /** Whether the run carries its own glyph pair, and whether that pair survives an empty value. */
  readonly glyphs: "none" | "with-value" | "unconditional";
  /** The glyph pair's marker name for `owner`, required when `glyphs` is not `"none"`. */
  readonly glyphMarker?: (owner: LexicalNode) => string;
  /** The trailing glyph's syntax, required when `glyphs` is not `"none"`. */
  readonly closerSyntax?: "closing" | "selfClosing";
  /** The owner's own child the run is inserted BEFORE, for `"owner-children"` writers. */
  readonly insertRunBefore?: (owner: LexicalNode) => LexicalNode | undefined;
  /** The sibling the run's wrapper is inserted AFTER, for `"wrapper"` writers. Also the scan
   * anchor, so the scanner and the writer can never disagree about where a run belongs. */
  readonly insertRunAfter?: (owner: LexicalNode) => LexicalNode | undefined;
}

/** An owner plus the kind whose run a piece belonged to — what the one owner walk reports. */
export interface DisplayRunOwnerRef {
  readonly owner: LexicalNode;
  readonly kind: DisplayRunKind;
}

/** One display kind's complete set of duties. See the module comment for the invocation rules. */
export interface DisplayRunDescriptor {
  readonly kind: DisplayRunKind;
  /** Whether `node` is an owner this descriptor governs. */
  readonly ownerPredicate: (node: LexicalNode) => boolean;
  /** The owner whose run `node` is (or was) a piece of, or `undefined`. Safe to call against a
   * node read from a previous editor state, where a destroyed piece still has its tree position. */
  readonly ownerOf: (node: LexicalNode) => LexicalNode | undefined;
  /** What `owner`'s run should be, from owner state alone. */
  readonly expectedPieces: (owner: LexicalNode) => ExpectedRun;
  /** What `owner`'s run currently is in the tree. */
  readonly scanPieces: (owner: LexicalNode) => ScannedRun;
  /** Caret anchors this kind graces BEYOND the shared ones (inside the wrapper's subtree, or on
   * the value node), which `$caretHoldsRunSite` already covers for every kind. */
  readonly graceSite: (owner: LexicalNode, pieces: ScannedRun) => boolean;
  readonly settleScope: SettleScope;
  readonly deletionPolicy: DeletionPolicy;
  readonly byteFormat: RunByteFormat;
}
```

Add to `libs/shared/src/nodes/usj/index.ts`, immediately after line 17 (`export * from "./attributeDisplay.utils.js";`):

```ts
export * from "./displayRunDescriptor.js";
```

- [ ] **Step 2: Write the failing registry test**

Create `libs/shared/src/displayRun/displayRunRegistry.test.ts`:

```ts
import { displayRunDescriptor } from "./displayRunRegistry.js";
import { $createCharNode } from "../nodes/usj/CharNode.js";
import { $createMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { $createVerseNode } from "../nodes/usj/VerseNode.js";
import { getVisibleOpenMarkerText } from "../nodes/usj/node.utils.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { createBasicTestEnvironment } from "../nodes/usj/test.utils.js";
import { $getRoot } from "lexical";
import { describe, expect, it } from "vitest";

describe("displayRunRegistry expectedPieces", () => {
  it("derives a char span's canonical `|…` bytes and wants no run when it has no attributes", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const withAttributes = $createCharNode("w", { lemma: "grace" });
        const without = $createCharNode("nd");
        $getRoot().append(withAttributes, without);
        const descriptor = displayRunDescriptor("char");
        expect(descriptor.expectedPieces(withAttributes)).toEqual({
          wantsRun: true,
          valueText: "|grace",
        });
        expect(descriptor.expectedPieces(without)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
      },
      { discrete: true },
    );
  });

  it("derives a verse's NBSP-prefixed \\va and \\vp values independently", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          undefined,
        );
        $getRoot().append(verse);
        expect(displayRunDescriptor("va").expectedPieces(verse)).toEqual({
          wantsRun: true,
          valueText: `${NBSP}2`,
        });
        expect(displayRunDescriptor("vp").expectedPieces(verse)).toEqual({
          wantsRun: false,
          valueText: undefined,
        });
      },
      { discrete: true },
    );
  });

  it("keeps a milestone's glyph pair wanted even with no attribute text at all", () => {
    // The unconditional-glyphs rule: an attribute-less milestone still displays `\ts-s\*`, so its
    // run is WANTED while its value is absent. Anything that reads "no value" as "no run wanted"
    // mistakes a real deletion of those glyphs for the sync's own heal-removal.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const bare = $createMilestoneNode("ts-s");
        const withSid = $createMilestoneNode("qt-s", "q1");
        $getRoot().append(bare, withSid);
        const descriptor = displayRunDescriptor("milestone");
        expect(descriptor.expectedPieces(bare)).toEqual({ wantsRun: true, valueText: undefined });
        expect(descriptor.expectedPieces(withSid)).toEqual({
          wantsRun: true,
          valueText: `${NBSP}|q1`,
        });
      },
      { discrete: true },
    );
  });
});
```

Signatures used above, verified: `$createCharNode(marker?, unknownAttributes?)` (`libs/shared/src/nodes/usj/CharNode.ts:289`), `$createMilestoneNode(marker?, sid?, eid?, unknownAttributes?)` (`libs/shared/src/nodes/usj/MilestoneNode.ts:206`), `$createVerseNode(verseNumber?, text?, sid?, altnumber?, pubnumber?, unknownAttributes?)` (`libs/shared/src/nodes/usj/VerseNode.ts:208`). `qt-s`'s default attribute is `sid`, which is why `|q1` is the collapsed bare form — confirm against `milestoneDefaultAttribute` (`libs/shared/src/converters/usfm/usfmFragmentToUsj.ts:396`) and adjust the expected string, not the shape of the assertion, if it differs.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunRegistry`
Expected: FAIL — `Failed to resolve import "./displayRunRegistry.js"`.

- [ ] **Step 4: Write the registry**

Create `libs/shared/src/displayRun/displayRunRegistry.ts`:

```ts
/**
 * The display-run registry: one {@link DisplayRunDescriptor} per engine-owned display kind.
 *
 * Assembled HERE rather than in `nodes/usj` because a descriptor's byte derivation needs the
 * converters (`defaultMarkerAttribute`, `milestoneDefaultAttribute`) and `nodes/usj` must not
 * import from `converters/usfm`, which already imports FROM `nodes/usj`. This module sits above
 * both, so it can hold the assembly without a cycle — the same layering `plugins/PerfOperations`
 * uses. The drivers that CONSUME descriptors take one as a parameter and stay in `nodes/usj`.
 */

import {
  $charAttributeDisplayNode,
  $charClosingGlyph,
  $milestoneAttributeRunPieces,
  $verseAttributeRunPieces,
  canonicalAttributeText,
  milestoneAttributes,
  VerseAttributeMarker,
} from "../nodes/usj/attributeDisplay.utils.js";
import { $isCharNode } from "../nodes/usj/CharNode.js";
import {
  DisplayRunDescriptor,
  DisplayRunKind,
  ExpectedRun,
  ScannedRun,
} from "../nodes/usj/displayRunDescriptor.js";
import { $isMilestoneNode } from "../nodes/usj/MilestoneNode.js";
import { NBSP } from "../nodes/usj/node-constants.js";
import { $isVerseNode } from "../nodes/usj/VerseNode.js";
import {
  defaultMarkerAttribute,
  milestoneDefaultAttribute,
} from "../converters/usfm/usfmFragmentToUsj.js";
import { $getSelection, $isRangeSelection, LexicalNode } from "lexical";

/** No run wanted and no value — the answer for an owner whose state carries nothing to display,
 * and the safe answer when a descriptor is handed a node of the wrong type. */
const NO_RUN: ExpectedRun = { wantsRun: false, valueText: undefined };

/** No pieces found — the answer when a descriptor is handed a node of the wrong type. */
const NO_PIECES: ScannedRun = {};

/** The sibling a verse's run for `marker` is anchored after: the verse itself for `\va`, and
 * `\va`'s wrapper (or, while caret-grace defers the wrap, its loose closer) for `\vp`. Shared by
 * the scanner and the writer so the two can never disagree about where a run belongs. */
function $verseRunAnchor(verse: LexicalNode, marker: VerseAttributeMarker): LexicalNode {
  if (marker === "va") return verse;
  const va = $verseAttributeRunPieces(verse, "va");
  return va.wrapper ?? va.closer ?? verse;
}

/** The caret arm a verse run graces when NO piece survives: the run's insertion point is the end
 * of its anchor or the very start of the anchor's next sibling, where a range deletion collapses
 * the caret. The shared reporter already graces the wrapper's subtree and the live value node. */
function $verseFlankGrace(anchor: LexicalNode): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  if (anchorNode.is(anchor) && selection.anchor.offset === anchor.getTextContentSize()) return true;
  const next = anchor.getNextSibling();
  return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
}

/** The caret arm shared by verse and milestone runs when only the VALUE was deleted beside a
 * surviving opening glyph: the end of the opening glyph's own text, or the trailing glyph. */
function $glyphDebrisGrace(pieces: ScannedRun): boolean {
  const { opener, closer } = pieces;
  if (!opener) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  const atOpenerEnd =
    anchorNode.is(opener) && selection.anchor.offset === opener.getTextContentSize();
  if (closer) return atOpenerEnd || anchorNode.is(closer);
  return atOpenerEnd;
}

function verseDescriptor(marker: VerseAttributeMarker): DisplayRunDescriptor {
  return {
    kind: marker,
    ownerPredicate: (node) => $isVerseNode(node),
    // Filled in by the owner-walk task; a piece's owner is not derivable from the piece alone
    // until the tightened sibling walk lands.
    ownerOf: () => undefined,
    expectedPieces: (owner) => {
      if (!$isVerseNode(owner)) return NO_RUN;
      const value = marker === "va" ? owner.getAltnumber() : owner.getPubnumber();
      if (value === undefined) return NO_RUN;
      return { wantsRun: true, valueText: NBSP + value };
    },
    scanPieces: (owner) =>
      $isVerseNode(owner) ? $verseAttributeRunPieces($verseRunAnchor(owner, marker), marker) : NO_PIECES,
    graceSite: (owner, pieces) => {
      if (!$isVerseNode(owner)) return false;
      if (!pieces.opener && !pieces.closer) return $verseFlankGrace($verseRunAnchor(owner, marker));
      return $glyphDebrisGrace(pieces);
    },
    settleScope: "owner",
    deletionPolicy: "retokenize",
    byteFormat: {
      writer: "wrapper",
      runKind: marker,
      glyphs: "with-value",
      glyphMarker: () => marker,
      closerSyntax: "closing",
      insertRunAfter: (owner) => ($isVerseNode(owner) ? $verseRunAnchor(owner, marker) : undefined),
    },
  };
}

const charDescriptor: DisplayRunDescriptor = {
  kind: "char",
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: (owner) => {
    if (!$isCharNode(owner)) return NO_RUN;
    // A span with no closing glyph never carries a run regardless of its attributes: the adaptor
    // never builds one there, so the sync must not fabricate one either.
    if ($charClosingGlyph(owner) === undefined) return NO_RUN;
    const text = canonicalAttributeText(
      owner.getUnknownAttributes() ?? {},
      defaultMarkerAttribute(owner.getMarker()),
    );
    return text === "" ? NO_RUN : { wantsRun: true, valueText: text };
  },
  scanPieces: (owner) => ($isCharNode(owner) ? { value: $charAttributeDisplayNode(owner) } : NO_PIECES),
  graceSite: (owner, pieces) => {
    // The insertion-point arms for a run that is missing: the closing glyph the run would be
    // inserted before, or the text-end of the content immediately preceding that glyph.
    if (!$isCharNode(owner) || pieces.value) return false;
    const closingGlyph = $charClosingGlyph(owner);
    if (!closingGlyph) return false;
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
    const anchorNode = selection.anchor.getNode();
    if (anchorNode.is(closingGlyph)) return true;
    const lastContent = closingGlyph.getPreviousSibling();
    return (
      lastContent !== null &&
      anchorNode.is(lastContent) &&
      selection.anchor.offset === lastContent.getTextContentSize()
    );
  },
  settleScope: "owner",
  deletionPolicy: "retokenize",
  byteFormat: {
    writer: "owner-children",
    glyphs: "none",
    insertRunBefore: (owner) => ($isCharNode(owner) ? $charClosingGlyph(owner) : undefined),
  },
};

const milestoneDescriptor: DisplayRunDescriptor = {
  kind: "milestone",
  ownerPredicate: (node) => $isMilestoneNode(node),
  ownerOf: () => undefined,
  expectedPieces: (owner) => {
    if (!$isMilestoneNode(owner)) return NO_RUN;
    const attributes = milestoneAttributes(
      owner.getSid(),
      owner.getEid(),
      owner.getUnknownAttributes(),
    );
    const text = canonicalAttributeText(attributes, milestoneDefaultAttribute(owner.getMarker()));
    // The glyph pair is unconditional: a milestone always displays `\qt-s …\*`, so the run is
    // wanted even when no attribute text rides between the glyphs.
    return { wantsRun: true, valueText: text === "" ? undefined : NBSP + text };
  },
  scanPieces: (owner) => ($isMilestoneNode(owner) ? $milestoneAttributeRunPieces(owner) : NO_PIECES),
  graceSite: (owner, pieces) => {
    if (!$isMilestoneNode(owner)) return false;
    if (!pieces.opener && !pieces.closer) {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
      const anchorNode = selection.anchor.getNode();
      const previous = owner.getPreviousSibling();
      if (
        previous !== null &&
        anchorNode.is(previous) &&
        selection.anchor.offset === previous.getTextContentSize()
      )
        return true;
      const next = owner.getNextSibling();
      return next !== null && anchorNode.is(next) && selection.anchor.offset === 0;
    }
    return $glyphDebrisGrace(pieces);
  },
  settleScope: "owner",
  deletionPolicy: "remove-owner",
  byteFormat: {
    writer: "wrapper",
    runKind: "milestone",
    glyphs: "unconditional",
    glyphMarker: (owner) => ($isMilestoneNode(owner) ? owner.getMarker() : ""),
    closerSyntax: "selfClosing",
    insertRunAfter: (owner) => owner,
  },
};

/** Every registered kind, in the order the pend/settle driver consults them. A `CharNode` matches
 * more than one descriptor (its separator gap and its attribute run), and the separator's grace
 * is checked first, preserving the order the per-kind arms ran in. */
export const displayRunDescriptors: readonly DisplayRunDescriptor[] = [
  charDescriptor,
  verseDescriptor("va"),
  verseDescriptor("vp"),
  milestoneDescriptor,
];

const byKind = new Map<DisplayRunKind, DisplayRunDescriptor>(
  displayRunDescriptors.map((descriptor) => [descriptor.kind, descriptor]),
);

/** The descriptor for `kind`. Throws for an unregistered kind — a kind is only nameable once its
 * descriptor exists, so a miss is a wiring bug, never a runtime condition to handle. */
export function displayRunDescriptor(kind: DisplayRunKind): DisplayRunDescriptor {
  const descriptor = byKind.get(kind);
  if (!descriptor) throw new Error(`No display-run descriptor registered for kind "${kind}"`);
  return descriptor;
}
```

Create `libs/shared/src/displayRun/index.ts`:

```ts
export * from "./displayRunRegistry.js";
```

Add to `libs/shared/src/index.ts`, immediately after `export * from "./converters/index.js";`:

```ts
export * from "./displayRun/index.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunRegistry`
Expected: PASS, 3 tests.

Then confirm nothing else moved: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run` — all green.

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/nodes/usj/displayRunDescriptor.ts libs/shared/src/nodes/usj/index.ts libs/shared/src/displayRun libs/shared/src/index.ts
git commit -m "feat(shared): display-run descriptor type and the four attribute-run descriptors

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: One owner walk, tightened on marker identity

`$runChainOwner` (`libs/shared/src/nodes/usj/displayRunDeletion.utils.ts:27`) accepts ANY `MarkerNode` as a
run piece while walking back to an owner, so a foreign glyph between a verse and a destroyed piece
does not stop the walk and the verse is wrongly reported as the owner. The registry's per-kind
piece classification replaces it.

**Files:**
- Create: `libs/shared/src/displayRun/displayRunOwner.utils.ts`
- Create: `libs/shared/src/displayRun/displayRunOwner.utils.test.ts` (move the cases from `libs/shared/src/nodes/usj/displayRunDeletion.utils.test.ts`, adjusting the import path)
- Delete: `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts`, `libs/shared/src/nodes/usj/displayRunDeletion.utils.test.ts`
- Modify: `libs/shared/src/nodes/usj/index.ts:18` (remove `export * from "./displayRunDeletion.utils.js";`)
- Modify: `libs/shared/src/displayRun/displayRunRegistry.ts` (fill in each descriptor's `ownerOf`)
- Modify: `libs/shared/src/displayRun/index.ts` (export the new module)

**Interfaces:**
- Consumes: Task 1's `DisplayRunDescriptor`, `DisplayRunOwnerRef`, `displayRunDescriptors`.
- Produces: `function $ownerOfRunPiece(piece: LexicalNode): DisplayRunOwnerRef | undefined` — the single classifier. `$ownerOfDestroyedRunPiece` is RETIRED; every call site moves to `$ownerOfRunPiece` and reads `.owner` (plus `.kind` where the kind matters). Callers today: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:395` and `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts:307`.

- [ ] **Step 1: Pin the current behavior green, then write the failing test**

Run first, and confirm green: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunDeletion`

Create `libs/shared/src/displayRun/displayRunOwner.utils.test.ts` by copying
`libs/shared/src/nodes/usj/displayRunDeletion.utils.test.ts` verbatim, then:
1. change its import of `$ownerOfDestroyedRunPiece` to `import { $ownerOfRunPiece } from "./displayRunOwner.utils.js";`
   and every call `$ownerOfDestroyedRunPiece(x)` to `$ownerOfRunPiece(x)?.owner`;
2. fix the relative import paths for everything it pulls from `../nodes/usj/…`;
3. append this new case:

```ts
describe("$ownerOfRunPiece marker identity", () => {
  it("refuses a verse whose chain to the destroyed piece crosses a foreign glyph", () => {
    // A run piece's owner is only the owner when EVERY sibling between them is a piece of that
    // same kind's run. A `\nd` opener is not a `\va`/`\vp` run piece, so a value behind one is
    // not the verse's run — claiming it would pend a verse for a deletion in unrelated content.
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          undefined,
        );
        const foreign = $createMarkerNode("nd", "opening");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append($createParaNode("p").append(verse, foreign, value));
        expect($ownerOfRunPiece(value)).toBeUndefined();
      },
      { discrete: true },
    );
  });

  it("still crosses a preceding \\va wrapper to reach the verse owning a \\vp piece", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          "2",
          "3",
        );
        const vaWrapper = $createAttributeRunNode("va");
        const vaValue = $createTextNode(`${NBSP}2`);
        $setState(vaValue, textTypeState, "attribute");
        vaWrapper.append(
          $createMarkerNode("va", "opening"),
          vaValue,
          $createMarkerNode("va", "closing"),
        );
        const vpWrapper = $createAttributeRunNode("vp");
        const vpValue = $createTextNode(`${NBSP}3`);
        $setState(vpValue, textTypeState, "attribute");
        vpWrapper.append(
          $createMarkerNode("vp", "opening"),
          vpValue,
          $createMarkerNode("vp", "closing"),
        );
        $getRoot().append($createParaNode("p").append(verse, vaWrapper, vpWrapper));
        expect($ownerOfRunPiece(vpValue)).toEqual({ owner: verse, kind: "vp" });
      },
      { discrete: true },
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunOwner`
Expected: FAIL — `Failed to resolve import "./displayRunOwner.utils.js"`.

- [ ] **Step 3: Write the owner walk and fill in `ownerOf`**

Create `libs/shared/src/displayRun/displayRunOwner.utils.ts`:

```ts
/**
 * The ONE walk from a display-run piece back to its owner, for every kind.
 *
 * A piece can be a live node (an edit inside a run dirties the piece or its wrapper, never the
 * leaf owner, whose own transform would then not fire) or a node read from the PREVIOUS editor
 * state (a destroyed piece, which still has its tree position there). The walk is identical in
 * both cases — it reads only tree position — so one function serves the live re-sync path and the
 * destruction-pend path alike.
 *
 * The chain classification is keyed on MARKER IDENTITY, not on "is this a glyph": only pieces of
 * the same kind's run may sit between a piece and its owner. Anything else — a char span's own
 * opener riding beside a verse, a note glyph — ends the walk with no owner, so a deletion in
 * unrelated content can never pend a nearby verse or milestone.
 */

import { displayRunDescriptors } from "./displayRunRegistry.js";
import { DisplayRunOwnerRef } from "../nodes/usj/displayRunDescriptor.js";
import { LexicalNode } from "lexical";

/**
 * The owner whose run `piece` belongs to, and that run's kind — or `undefined` when `piece` is not
 * part of any registered display run. Descriptors are consulted in registry order and the first
 * match wins; each kind's `ownerOf` recognizes only its own pieces, so at most one can match.
 */
export function $ownerOfRunPiece(piece: LexicalNode): DisplayRunOwnerRef | undefined {
  for (const descriptor of displayRunDescriptors) {
    const owner = descriptor.ownerOf(piece);
    if (owner) return { owner, kind: descriptor.kind };
  }
  return undefined;
}
```

Add to `libs/shared/src/displayRun/index.ts`:

```ts
export * from "./displayRunOwner.utils.js";
```

In `libs/shared/src/displayRun/displayRunRegistry.ts`, add these helpers above `verseDescriptor`:

```ts
/** Whether `node` is a piece of a verse's `\va`/`\vp` run — a whole wrapper (crossed in one step,
 * so a `\vp` piece's walk passes its own `\va` wrapper), a `va`/`vp` glyph riding loose, or a
 * loose attribute-tagged value. Loose shapes are transient (an undo stack, a collab-materialized
 * bare verse, a mid-edit tree with one marker wrapped and the other not) but real for a commit. */
function $isVerseRunPiece(node: LexicalNode): boolean {
  if ($isAttributeRunNode(node)) return node.getRunKind() === "va" || node.getRunKind() === "vp";
  if ($isMarkerNode(node)) return node.getMarker() === "va" || node.getMarker() === "vp";
  return $isTextNode(node) && $getState(node, textTypeState) === "attribute";
}

/** The `va`/`vp` marker a loose value belongs to, read from the glyph immediately before it — the
 * run pieces' fixed order puts a value's own opener exactly one step back, even in the previous
 * state where that opener is also being destroyed. */
function loosePieceMarker(node: LexicalNode): VerseAttributeMarker | undefined {
  if ($isMarkerNode(node)) {
    const marker = node.getMarker();
    return marker === "va" || marker === "vp" ? marker : undefined;
  }
  const previous = node.getPreviousSibling();
  if (!$isMarkerNode(previous)) return undefined;
  const marker = previous.getMarker();
  return marker === "va" || marker === "vp" ? marker : undefined;
}

/** Walk back from `start` over `marker`'s own run pieces to the VerseNode the run rides on. */
function $verseOfRunChain(start: LexicalNode): LexicalNode | undefined {
  for (let previous = start.getPreviousSibling(); previous; previous = previous.getPreviousSibling()) {
    if ($isVerseNode(previous)) return previous;
    if (!$isVerseRunPiece(previous)) return undefined;
  }
  return undefined;
}
```

Replace `verseDescriptor`'s `ownerOf: () => undefined` with:

```ts
    ownerOf: (node) => {
      // A wrapper of this marker is its own walk start; a piece INSIDE one is only positioned
      // relative to its siblings within the wrapper, so the walk starts from the wrapper instead.
      if ($isAttributeRunNode(node))
        return node.getRunKind() === marker ? $verseOfRunChain(node) : undefined;
      const parent = node.getParent();
      if ($isAttributeRunNode(parent))
        return parent.getRunKind() === marker ? $verseOfRunChain(parent) : undefined;
      return loosePieceMarker(node) === marker ? $verseOfRunChain(node) : undefined;
    },
```

Replace `charDescriptor`'s `ownerOf: () => undefined` with:

```ts
  ownerOf: (node) => {
    // A char span's run is a direct TextNode child, never wrapped and never a glyph.
    if (!$isTextNode(node) || $getState(node, textTypeState) !== "attribute") return undefined;
    const parent = node.getParent();
    return $isCharNode(parent) ? parent : undefined;
  },
```

Replace `milestoneDescriptor`'s `ownerOf: () => undefined` with:

```ts
  ownerOf: (node) => {
    const start = $isAttributeRunNode(node)
      ? node.getRunKind() === "milestone"
        ? node
        : undefined
      : $isAttributeRunNode(node.getParent())
        ? node.getParent()
        : $isMilestoneRunPiece(node)
          ? node
          : undefined;
    if (!start) return undefined;
    if ($isAttributeRunNode(start) && start.getRunKind() !== "milestone") return undefined;
    const previous = start.getPreviousSibling();
    // A milestone's run is a SINGLE wrapper (or one contiguous loose group) directly following its
    // milestone — there is no second marker to cross, unlike a verse's `\va`/`\vp` pair.
    if ($isMilestoneNode(previous)) return previous;
    if (!previous || !$isMilestoneRunPiece(previous)) return undefined;
    return $isAttributeRunNode(start) ? undefined : $milestoneOfLooseChain(start);
  },
```

with these two helpers above `milestoneDescriptor`:

```ts
/** Whether `node` is a loose piece of a milestone's run — an opening glyph, a self-closing glyph,
 * or an attribute-tagged value. A milestone's opening glyph carries the milestone's OWN marker,
 * which the chain walk re-checks against the candidate owner. */
function $isMilestoneRunPiece(node: LexicalNode): boolean {
  if ($isMarkerNode(node)) {
    const syntax = node.getMarkerSyntax();
    return syntax === "selfClosing" || syntax === "opening";
  }
  return $isTextNode(node) && $getState(node, textTypeState) === "attribute";
}

/** Walk back from a LOOSE milestone run piece over the run's other loose pieces to the milestone,
 * requiring a matching marker on any opening glyph crossed. */
function $milestoneOfLooseChain(start: LexicalNode): LexicalNode | undefined {
  for (let previous = start.getPreviousSibling(); previous; previous = previous.getPreviousSibling()) {
    if ($isMilestoneNode(previous)) {
      const opening = $isMarkerNode(start) && start.getMarkerSyntax() === "opening" ? start : undefined;
      return !opening || opening.getMarker() === previous.getMarker() ? previous : undefined;
    }
    if (!$isMilestoneRunPiece(previous)) return undefined;
  }
  return undefined;
}
```

Add the optbreak owner arm as its own descriptor entry so the registry keeps covering the shape
`$ownerOfDestroyedRunPiece` handled at `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts:80-84`:

```ts
const optbreakDescriptor: DisplayRunDescriptor = {
  kind: "optbreak",
  ownerPredicate: (node) => $isUnknownNode(node) && node.getTag() === "optbreak",
  ownerOf: (node) => {
    // The adaptor renders the `//` token as an ImmutableTypedTextNode (a read-only DecoratorNode),
    // but an edited optbreak can hold a plain TextNode instead, so both are recognized.
    const parent = node.getParent();
    if (!$isUnknownNode(parent) || parent.getTag() !== "optbreak") return undefined;
    return $isTextNode(node) || $isImmutableTypedTextNode(node) ? parent : undefined;
  },
  expectedPieces: () => ({ wantsRun: true, valueText: undefined }),
  scanPieces: (owner) =>
    $isUnknownNode(owner) ? { value: owner.getFirstChild() ?? undefined } : NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "remove-owner",
  byteFormat: { writer: "read-only", glyphs: "none" },
};
```

and add it to `displayRunDescriptors` after `milestoneDescriptor`. Import `$isUnknownNode` from
`../nodes/usj/../features/UnknownNode.js`, `$isImmutableTypedTextNode` from
`../nodes/usj/../features/ImmutableTypedTextNode.js`, `$isMarkerNode` from
`../nodes/usj/../features/MarkerNode.js`, `$isAttributeRunNode` from
`../nodes/usj/AttributeRunNode.js`, `textTypeState` from `../nodes/collab/delta.state.js`, and
`$getState`/`$isTextNode` from `lexical` — verify each path against the imports at the top of
`libs/shared/src/nodes/usj/displayRunDeletion.utils.ts:7-15` before writing them.

Then delete `libs/shared/src/nodes/usj/displayRunDeletion.utils.ts` and its test, remove line 18 of
`libs/shared/src/nodes/usj/index.ts`, and re-point the two platform call sites:

- `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:395` — `const owner = $ownerOfDestroyedRunPiece(destroyed);` becomes `const ref = $ownerOfRunPiece(destroyed);` and the code below reads `ref.owner` / `ref.kind` (keep the existing `$verseAttributeFieldOfDestroyedPiece` bookkeeping for now; Task 7 removes it).
- `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts:307` — `const owner = $ownerOfDestroyedRunPiece(node);` becomes `const owner = $ownerOfRunPiece(node)?.owner;`.

Update both files' `shared` imports accordingly.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunOwner
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEdit
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild.corpus
```
Expected: all PASS; corpus 141/141, zero skips.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/displayRun libs/shared/src/nodes/usj/index.ts packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts
git add -u libs/shared/src/nodes/usj
git commit -m "refactor(shared,platform): one marker-identity-tightened display-run owner walk

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: The plugin's two live owner walks delegate

`MarkerEditPlugin.tsx` carries two more copies of the same walk: `$verseOfAttributeGlyph`
(`:183`, from a loose `va`/`vp` opening glyph) and `$ownerOfAttributeRunWrapper` (`:247`, from a
live wrapper). Both become `$ownerOfRunPiece`.

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:183-201` (delete `$verseOfAttributeGlyph`), `:247-264` (delete `$ownerOfAttributeRunWrapper`), `:462-463` (MarkerNode transform's re-drive), `:536-545` (AttributeRunNode transform)
- Test: `packages/platform/src/editor/markerEdit/verseAttributeSettle.test.tsx`, `packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx`

**Interfaces:**
- Consumes: `$ownerOfRunPiece(piece): DisplayRunOwnerRef | undefined` (Task 2).
- Produces: no new exports. `MarkerEditPlugin` keeps `$syncAndPendMilestone(node, context)` and `$syncAndPendVerse(node, context)` unchanged in this task (Task 13 collapses them).

- [ ] **Step 1: Pin the existing behavior green**

Run and confirm green (this is a behavior-preserving refactor, so a red before means a bad baseline):

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run verseAttributeSettle
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run milestoneAttributeSettle
```
Expected: both PASS. Note especially `verseAttributeSettle.test.tsx`'s case "crosses a WRAPPED \va to find the owning verse when re-driving a LOOSE \vp's caret-held pend (mixed shape)" — it is the pin that fails if the walk is lost.

- [ ] **Step 2: Delete both walks and delegate**

Delete `$verseOfAttributeGlyph` (lines 183–201) and `$ownerOfAttributeRunWrapper` (lines 247–264)
in their entirety.

Replace the MarkerNode transform's re-drive (currently lines 455–463) with:

```tsx
      editor.registerNodeTransform(MarkerNode, (node) => {
        if (editor.isComposing()) return;
        $markerNodeTransform(node, context);
        // A run can ride loose for one transient commit — heal-forward wraps `\va` and `\vp`
        // independently, so mid-edit caret-grace on one marker can leave the other unwrapped. A
        // dirtied loose glyph is the only signal its owner's run changed: the verse itself stays
        // clean, and there is no wrapper to dirty.
        const ref = $ownerOfRunPiece(node);
        if (ref && $isVerseNode(ref.owner)) $syncAndPendVerse(ref.owner, context);
      }),
```

Replace the AttributeRunNode transform (currently lines 536–545) with:

```tsx
      editor.registerNodeTransform(AttributeRunNode, (node) => {
        if (editor.isComposing()) return;
        // A piece INSIDE the wrapper being edited or removed dirties the WRAPPER, not the leaf
        // owner: a DecoratorNode-based MilestoneNode and a following-sibling-shaped verse run
        // would otherwise never notice. Re-drive the owner's own sync/pend off the wrapper.
        const ref = $ownerOfRunPiece(node);
        if (!ref) return;
        if ($isMilestoneNode(ref.owner)) $syncAndPendMilestone(ref.owner, context);
        else if ($isVerseNode(ref.owner)) $syncAndPendVerse(ref.owner, context);
      }),
```

Drop now-unused imports from the `shared` import block (`$isAttributeRunNode`, `textTypeState`,
`$getState` may become unused — let `env -u _VOLTA_TOOL_RECURSION npx eslint` tell you which).

- [ ] **Step 3: Run the tests to verify they still pass**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run verseAttributeSettle
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run milestoneAttributeSettle
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild.corpus
```
Expected: all PASS; corpus 141/141, zero skips.

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx
git commit -m "refactor(platform): plugin owner walks delegate to \$ownerOfRunPiece

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: The shared sync driver and caret-held reporter (char re-pointed)

**Files:**
- Create: `libs/shared/src/nodes/usj/displayRunSync.utils.ts`
- Create: `libs/shared/src/nodes/usj/displayRunSync.utils.test.ts`
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts:183-282` (delete `$isCaretAtAttributeRunBoundary`, `$syncCharAttributeDisplay`, `$hasCaretHeldAttributeRun`)
- Modify: `libs/shared/src/nodes/usj/index.ts` (export the new module)
- Modify: `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx:44,50-64`

**Interfaces:**
- Consumes: Task 1's descriptor type and registry; `$isDisplayOwnerPended(node): boolean` and `$reportDestroyedDisplayOwner(node): void` from `libs/shared/src/nodes/usj/pendedDisplayOwners.utils.ts:23` and `:39`; `$isDescendantOf(node, ancestorKey): boolean` from `libs/shared/src/nodes/usj/node.utils.ts:301`; `DELTA_CHANGE_TAG` from `libs/shared/src/nodes/usj/node-constants.ts`.
- Produces:
  - `function $syncDisplayRun(descriptor: DisplayRunDescriptor, owner: LexicalNode): void`
  - `function $caretHoldsRunSite(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean`
  - `function $runDiverges(descriptor: DisplayRunDescriptor, pieces: ScannedRun, expected: ExpectedRun): boolean`
  - `function $runEntirelyAbsent(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean`
  - `$syncCharAttributeDisplay` and `$hasCaretHeldAttributeRun` are RETIRED.

- [ ] **Step 1: Write the failing test**

Create `libs/shared/src/nodes/usj/displayRunSync.utils.test.ts`:

```ts
import { $createAttributeRunNode } from "./AttributeRunNode.js";
import { $createCharNode } from "./CharNode.js";
import { $caretHoldsRunSite, $syncDisplayRun } from "./displayRunSync.utils.js";
import { NBSP } from "./node-constants.js";
import { registerPendedDisplayOwners } from "./pendedDisplayOwners.utils.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import { displayRunDescriptor } from "../../displayRun/displayRunRegistry.js";
import { $createParaNode } from "./ParaNode.js";
import { $createTextNode, $getRoot, $getState, $setState } from "lexical";
import { describe, expect, it } from "vitest";

describe("$syncDisplayRun (char)", () => {
  /** `<p>\p ␣<char nd>\nd ␣Lord\nd*</char></p>` with `lemma="grace"` on the span. */
  function buildCharWithAttributes() {
    const { editor } = createBasicTestEnvironment();
    let char!: ReturnType<typeof $createCharNode>;
    editor.update(
      () => {
        char = $createCharNode("nd", undefined, { lemma: "grace" });
        char.append(
          $createMarkerNode("nd", "opening"),
          $createTextNode(`${NBSP}Lord`),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(char));
        $syncDisplayRun(displayRunDescriptor("char"), char);
      },
      { discrete: true },
    );
    return { editor, char };
  }

  it("inserts the canonical `|…` run immediately before the closing glyph", () => {
    const { editor, char } = buildCharWithAttributes();
    editor.getEditorState().read(() => {
      const children = char.getChildren();
      const run = children.at(-2);
      expect(run?.getTextContent()).toBe('|lemma="grace"');
      expect(run && $getState(run, textTypeState)).toBe("attribute");
    });
  });

  it("leaves a wanted-but-destroyed run alone and reports the owner instead of resurrecting it", () => {
    const { editor, char } = buildCharWithAttributes();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        const run = char.getChildren().at(-2);
        run?.remove();
        // Park the caret nowhere the char descriptor's graceSite recognizes.
        $getRoot().selectStart();
        $syncDisplayRun(displayRunDescriptor("char"), char);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect(char.getChildren().at(-2)?.getTextContent()).toBe(`${NBSP}Lord`);
      expect(pended.has(char.getKey())).toBe(true);
    });
    unregister();
  });
});

describe("$caretHoldsRunSite (char)", () => {
  it("graces a deleted run while the caret sits at the end of the content before the closer", () => {
    const { editor } = createBasicTestEnvironment();
    let char!: ReturnType<typeof $createCharNode>;
    editor.update(
      () => {
        char = $createCharNode("nd", undefined, { lemma: "grace" });
        const content = $createTextNode(`${NBSP}Lord`);
        char.append(
          $createMarkerNode("nd", "opening"),
          content,
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode("p").append(char));
        content.select(content.getTextContentSize(), content.getTextContentSize());
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($caretHoldsRunSite(displayRunDescriptor("char"), char)).toBe(true);
    });
  });
});

describe("$caretHoldsRunSite (wrapper containment)", () => {
  it("graces any caret position inside a run wrapper's subtree", () => {
    const { editor } = createBasicTestEnvironment();
    let wrapper!: ReturnType<typeof $createAttributeRunNode>;
    editor.update(
      () => {
        wrapper = $createAttributeRunNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        wrapper.append($createMarkerNode("va", "opening"), value);
        $getRoot().append($createParaNode("p").append(wrapper));
      },
      { discrete: true },
    );
    // The wrapper is missing its closer, so the run diverges; the caret inside it graces that.
    expect(wrapper.getChildrenSize()).toBe(2);
  });
});
```

Delete the third `describe` block if it proves redundant with the verse coverage landing in Task 5 —
it exists only to force `$caretHoldsRunSite` to expose the wrapper-containment arm from the start.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunSync`
Expected: FAIL — `Failed to resolve import "./displayRunSync.utils.js"`.

- [ ] **Step 3: Write the driver**

Create `libs/shared/src/nodes/usj/displayRunSync.utils.ts`:

```ts
/**
 * The shared display-run drivers: ONE self-healing sync transform and ONE caret-held reporter,
 * both parameterized by a {@link DisplayRunDescriptor}. Every engine-owned display kind runs
 * through these, so the four duties (construct, self-heal-with-grace, pend-on-edit/delete,
 * settle-on-departure) cannot diverge per kind.
 *
 * Descriptor INSTANCES live one layer up (displayRun/displayRunRegistry.ts) because they need the
 * converters; taking a descriptor as a parameter keeps these drivers importable from anywhere in
 * `nodes/usj`.
 */

import { $createAttributeRunNode, AttributeRunNode } from "./AttributeRunNode.js";
import {
  DisplayRunDescriptor,
  ExpectedRun,
  ScannedRun,
} from "./displayRunDescriptor.js";
import { DELTA_CHANGE_TAG } from "./node-constants.js";
import { $isDescendantOf } from "./node.utils.js";
import {
  $isDisplayOwnerPended,
  $reportDestroyedDisplayOwner,
} from "./pendedDisplayOwners.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { textTypeState } from "../collab/delta.state.js";
import {
  $createTextNode,
  $getEditor,
  $getNodeByKey,
  $getSelection,
  $hasUpdateTag,
  $isRangeSelection,
  $isTextNode,
  $setState,
  LexicalNode,
} from "lexical";

/** Whether any piece of the run is currently in the tree. */
function runHasPieces(pieces: ScannedRun): boolean {
  return Boolean(pieces.opener || pieces.value || pieces.closer || pieces.wrapper);
}

/**
 * Whether `pieces` diverge from `expected`.
 *
 * A run that should not exist diverges the moment any piece survives. A run that should exist
 * diverges when its value's bytes differ, when either glyph of a glyph-bearing kind is missing,
 * or — for a wrapper-written kind — when the pieces are still riding LOOSE: the wrap migration is
 * itself a divergence to heal, and treating it as one here is what lets the caret grace it and the
 * settle finish it, instead of the migration being deferred forever with nothing pending it.
 */
export function $runDiverges(
  descriptor: DisplayRunDescriptor,
  pieces: ScannedRun,
  expected: ExpectedRun,
): boolean {
  if (!expected.wantsRun) return runHasPieces(pieces);
  if (pieces.value?.getTextContent() !== expected.valueText) return true;
  if (descriptor.byteFormat.glyphs !== "none" && (!pieces.opener || !pieces.closer)) return true;
  return descriptor.byteFormat.writer === "wrapper" && pieces.wrapper === undefined;
}

/** True when NO piece of `owner`'s run remains — the run was deleted outright, as opposed to a
 * partial mangle that still leaves debris to repair around. */
export function $runEntirelyAbsent(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
): boolean {
  const pieces = descriptor.scanPieces(owner);
  return !pieces.opener && !pieces.value && !pieces.closer;
}

/**
 * True when `owner`'s run diverges from what its state calls for but the collapsed caret holds the
 * run's SITE, so the sync must leave it alone and the marker-edit engine settle it on departure.
 *
 * Two arms are shared by every kind: the caret anywhere inside the run's wrapper subtree (an
 * element point can land on the wrapper itself, which no piece-specific arm recognizes), and the
 * caret inside a live value node. Everything else is the descriptor's own `graceSite` — the
 * insertion-point and glyph-debris anchors that differ by tree shape.
 */
export function $caretHoldsRunSite(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
): boolean {
  if (!owner.isAttached()) return false;
  const expected = descriptor.expectedPieces(owner);
  const pieces = descriptor.scanPieces(owner);
  if (!$runDiverges(descriptor, pieces, expected)) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;
  const anchorNode = selection.anchor.getNode();
  const { wrapper, value } = pieces;
  if (wrapper && (anchorNode.is(wrapper) || $isDescendantOf(anchorNode, wrapper.getKey())))
    return true;
  // A live value node is the mid-edit case: the caret is IN the bytes, so nothing else matters.
  if (value) return anchorNode.is(value);
  return descriptor.graceSite(owner, pieces);
}

/**
 * Whether `owner`'s run was destroyed by something other than this sync since the last committed
 * state. Gated on `wantsRun` so a call can never react to its own heal-removal: the writer below
 * only removes pieces when the run is NOT wanted, the opposite of this condition.
 *
 * Detecting the destruction from the last-committed state, inside the sync's own decision path,
 * keeps the result independent of which plugin's transforms happen to run first on a shared dirty
 * node — mount order varies across hosts. A remote collab apply is excluded: it clears owner state
 * directly, so the run is already unwanted before this sync next runs.
 */
function $runDestroyedSinceLastCommit(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  expected: ExpectedRun,
  pieces: ScannedRun,
): boolean {
  if (!expected.wantsRun) return false;
  if (runHasPieces(pieces)) return false;
  if ($hasUpdateTag(DELTA_CHANGE_TAG)) return false;
  return $getEditor()
    .getEditorState()
    .read(() => {
      const previous = $getNodeByKey(owner.getKey());
      if (!previous || !descriptor.ownerPredicate(previous)) return false;
      return runHasPieces(descriptor.scanPieces(previous));
    });
}

/** Remove every surviving piece — the "no run wanted" path. An emptied wrapper is left in place:
 * it is a transient husk the marker-edit engine's settle removes, so the removal and the owner's
 * own deletion policy stay in one place. */
function $clearRun(pieces: ScannedRun): void {
  pieces.opener?.remove();
  pieces.value?.remove();
  pieces.closer?.remove();
}

function $createValueNode(text: string) {
  const value = $createTextNode(text);
  $setState(value, textTypeState, "attribute");
  return value;
}

/** Ensure the run's wrapper exists, healing any loose survivors forward into a freshly created one
 * inserted where the run belongs. This is the one migration path from loose to wrapped. */
function $ensureWrapper(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  pieces: ScannedRun,
): AttributeRunNode | undefined {
  if (pieces.wrapper) return pieces.wrapper;
  const { runKind, insertRunAfter } = descriptor.byteFormat;
  const anchor = insertRunAfter?.(owner);
  if (!runKind || !anchor) return undefined;
  const created = $createAttributeRunNode(runKind);
  anchor.insertAfter(created);
  if (pieces.opener) created.append(pieces.opener);
  if (pieces.value) created.append(pieces.value);
  if (pieces.closer) created.append(pieces.closer);
  return created;
}

/** Build or repair the run AROUND whatever pieces survive, in their fixed order. A found piece
 * already sits in its correct position (the scan reads them in order), so a missing one is
 * inserted into its gap and a leftover is reused in place, never duplicated. */
function $writeRun(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  pieces: ScannedRun,
  expected: ExpectedRun,
): void {
  const { writer, glyphs, glyphMarker, closerSyntax, insertRunBefore } = descriptor.byteFormat;
  if (writer === "owner-children") {
    const anchor = insertRunBefore?.(owner);
    if (!anchor || expected.valueText === undefined) return;
    if ($isTextNode(pieces.value)) pieces.value.setTextContent(expected.valueText);
    else anchor.insertBefore($createValueNode(expected.valueText));
    return;
  }
  const wrapper = $ensureWrapper(descriptor, owner, pieces);
  if (!wrapper || glyphs === "none" || !glyphMarker || !closerSyntax) return;
  const opener =
    pieces.opener ??
    (() => {
      const created = $createMarkerNode(glyphMarker(owner), "opening");
      const first = wrapper.getFirstChild();
      if (first) first.insertBefore(created);
      else wrapper.append(created);
      return created;
    })();
  let value = pieces.value;
  if (expected.valueText === undefined) {
    value?.remove();
    value = undefined;
  } else if ($isTextNode(value)) {
    if (value.getTextContent() !== expected.valueText) value.setTextContent(expected.valueText);
  } else {
    value = $createValueNode(expected.valueText);
    opener.insertAfter(value);
  }
  if (!pieces.closer)
    (value ?? opener).insertAfter(
      $createMarkerNode(closerSyntax === "selfClosing" ? "" : glyphMarker(owner), closerSyntax),
    );
}

/**
 * Heal `owner`'s display run to what its own state calls for: insert a missing run, rewrite a
 * stale one, migrate a loose one into its wrapper, or remove one that is no longer wanted —
 * except while the engine holds the owner pended, while the run was just destroyed by something
 * else (reported so the engine settles it), or while the caret holds the run's site. Idempotent —
 * writes only on change, so the registering transform converges.
 *
 * Kinds whose pieces the driver does not write (`"kind-owned"` and `"read-only"` byte formats)
 * return immediately: they join the registry for their pend/settle duties only.
 *
 * @param descriptor - The kind's descriptor.
 * @param owner - The owner whose run to sync. Must be called inside `editor.update()`.
 */
export function $syncDisplayRun(descriptor: DisplayRunDescriptor, owner: LexicalNode): void {
  const { writer } = descriptor.byteFormat;
  if (writer === "kind-owned" || writer === "read-only") return;
  // An earlier transform in the same pass may have merged or removed the owner; a detached node
  // has no tree position to derive from.
  if (!owner.isAttached()) return;
  const expected = descriptor.expectedPieces(owner);
  const pieces = descriptor.scanPieces(owner);
  if (!$runDiverges(descriptor, pieces, expected)) return;
  if ($isDisplayOwnerPended(owner)) return;
  if ($runDestroyedSinceLastCommit(descriptor, owner, expected, pieces)) {
    $reportDestroyedDisplayOwner(owner);
    return;
  }
  if ($caretHoldsRunSite(descriptor, owner)) return;
  if (!expected.wantsRun) {
    $clearRun(pieces);
    return;
  }
  $writeRun(descriptor, owner, pieces, expected);
}
```

Add `export * from "./displayRunSync.utils.js";` to `libs/shared/src/nodes/usj/index.ts` next to the
descriptor export.

Delete `$isCaretAtAttributeRunBoundary` (attributeDisplay.utils.ts:183–199), `$syncCharAttributeDisplay`
(`:214-267`) and `$hasCaretHeldAttributeRun` (`:275-282`). Trim the module comment's now-stale
sentences about the char sync being registered in CharNodePlugin; the run OWNERSHIP rules it
documents stay.

Rewrite `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx:50-64` as:

```tsx
/**
 * Wraps {@link $syncDisplayRun} with the char descriptor. Kept as a thin per-kind wrapper so this
 * plugin's registration reads the same as its siblings and the transform signature Lexical
 * expects (one node argument) stays satisfied.
 * @param node - CharNode whose display run needs updating.
 */
function $syncCharAttributeDisplayNode(node: CharNode): void {
  $syncDisplayRun(displayRunDescriptor("char"), node);
}
```

and update its `shared` import to bring in `$syncDisplayRun` and `displayRunDescriptor` in place of
`$syncCharAttributeDisplay`, `canonicalAttributeText`, and `defaultMarkerAttribute`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. The existing char pins in
`libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts` and
`packages/platform/src/editor/markerEdit/charAttributeDeletionSettle.test.tsx` must pass unchanged
except for import re-pointing (`$syncCharAttributeDisplay(char, text)` becomes
`$syncDisplayRun(displayRunDescriptor("char"), char)`; `$hasCaretHeldAttributeRun(char, text)`
becomes `$caretHoldsRunSite(displayRunDescriptor("char"), char)`). Any assertion that has to CHANGE
is a real behavior difference — stop and investigate before adjusting it.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/nodes/usj libs/shared-react/src/plugins/usj/CharNodePlugin.tsx
git commit -m "refactor(shared,shared-react): char attribute run runs through the shared display-run driver

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Verse runs re-pointed at the driver

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts:366-581` (delete `$verseAttributeTargetText`, `$verseAttributeDiverges`, `$isCaretAtVerseAttributeSite`, `$syncVerseAttributeRun`, `$syncVerseAttributeDisplay`, `$hasCaretHeldVerseAttributeRun`; keep `VerseAttributeMarker`, `VerseAttributeRunPieces`, `$verseAttributeRunPieces`)
- Modify: `libs/shared-react/src/plugins/usj/TextSpacingPlugin.tsx:65,70-78`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:150-156` (`$syncAndPendVerse`), `:465-478` (VerseNode transform)
- Test: `libs/shared/src/nodes/usj/displayRunSync.utils.test.ts` (add the verse cases), `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts:519-622` and `:948-…` (re-point), `packages/platform/src/editor/markerEdit/verseAttributeSettle.test.tsx` (re-point)

**Interfaces:**
- Consumes: `$syncDisplayRun`, `$caretHoldsRunSite`, `displayRunDescriptor` (Task 4).
- Produces: `$syncVerseAttributeDisplay` and `$hasCaretHeldVerseAttributeRun` are RETIRED. `MarkerEditPlugin`'s `$syncAndPendVerse(node: VerseNode, context: MarkerEditContext): void` keeps its signature and now drives both verse descriptors.

- [ ] **Step 1: Write the failing test**

Append to `libs/shared/src/nodes/usj/displayRunSync.utils.test.ts`:

```ts
describe("$syncDisplayRun (verse)", () => {
  function buildVerseWithVa() {
    const { editor } = createBasicTestEnvironment();
    let verse!: ReturnType<typeof $createVerseNode>;
    editor.update(
      () => {
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", undefined);
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            $createTextNode("In the beginning"),
          ),
        );
        $syncDisplayRun(displayRunDescriptor("va"), verse);
      },
      { discrete: true },
    );
    return { editor, verse };
  }

  it("reports the owner instead of resurrecting a \\va wrapper deleted in the same commit", () => {
    // The destruction check is the driver's, so it now covers verses and milestones too — before
    // it existed only in the char sync, and a verse relied entirely on the cross-commit mutation
    // listener, which cannot see a deletion the same commit that dirties the verse.
    const { editor, verse } = buildVerseWithVa();
    const pended = new Set<string>();
    const unregister = registerPendedDisplayOwners(editor, pended);
    editor.update(
      () => {
        verse.getNextSibling()?.remove();
        // Park the caret on the leading text, well away from any graced site.
        const before = verse.getPreviousSibling();
        if ($isTextNode(before)) before.select(0, 0);
        $syncDisplayRun(displayRunDescriptor("va"), verse);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($isAttributeRunNode(verse.getNextSibling())).toBe(false);
      expect(pended.has(verse.getKey())).toBe(true);
    });
    unregister();
  });

  it("anchors a \\vp run after the \\va wrapper", () => {
    const { editor, verse } = buildVerseWithVa();
    editor.update(
      () => {
        verse.setPubnumber("3");
        $syncDisplayRun(displayRunDescriptor("vp"), verse);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const va = verse.getNextSibling();
      const vp = va?.getNextSibling();
      if (!$isAttributeRunNode(va) || !$isAttributeRunNode(vp)) throw new Error("wrappers missing");
      expect(va.getRunKind()).toBe("va");
      expect(vp.getRunKind()).toBe("vp");
      expect(vp.getChildren().at(1)?.getTextContent()).toBe(`${NBSP}3`);
    });
  });
});
```

Add the imports this block needs (`$createVerseNode`, `getVisibleOpenMarkerText`,
`$isAttributeRunNode`, `$isTextNode`) to the file's import list.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunSync`
Expected: FAIL — the destruction case fails with the `\va` wrapper resurrected and `pended` empty
(the driver has no verse consumer yet, and the old sync is still in play).

- [ ] **Step 3: Delete the verse sync and re-point its homes**

Delete lines 366–581 of `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` EXCEPT
`$verseAttributeRunPieces` (`:330-364`, already above the deleted range) — i.e. remove
`$verseAttributeTargetText`, `$verseAttributeDiverges`, `$isCaretAtVerseAttributeSite`,
`$syncVerseAttributeRun`, `$syncVerseAttributeDisplay`, `$hasCaretHeldVerseAttributeRun`. Keep
`$verseOfAttributeSourceText` (`:600-615`) — it classifies a settled-empty SOURCE SPAN, not a run
piece, and Task 11 leaves it in place.

Rewrite `libs/shared-react/src/plugins/usj/TextSpacingPlugin.tsx:70-78` as:

```tsx
/**
 * Wraps {@link $syncDisplayRun} with the verse's two independent run descriptors — `\va` first, so
 * `\vp`'s scan and insertion anchor find the healed `\va` wrapper already in place.
 * @param node - VerseNode whose \va/\vp display runs need updating.
 */
function $syncVerseAttributeDisplayNode(node: VerseNode): void {
  $syncDisplayRun(displayRunDescriptor("va"), node);
  $syncDisplayRun(displayRunDescriptor("vp"), node);
}
```

and update the `shared` import to bring in `$syncDisplayRun` + `displayRunDescriptor` in place of
`$syncVerseAttributeDisplay`.

Rewrite `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:150-156` as:

```tsx
function $syncAndPendVerse(node: VerseNode, context: MarkerEditContext): void {
  for (const kind of ["va", "vp"] as const) {
    const descriptor = displayRunDescriptor(kind);
    $syncDisplayRun(descriptor, node);
    if (node.isAttached() && $caretHoldsRunSite(descriptor, node))
      context.pendingKeys.add(node.getKey());
  }
}
```

and replace the VerseNode transform's inline caret check (lines 473–477) with
`$syncAndPendVerse(node, context);` so the verse's grace/pend pairing lives in exactly one place.
Keep `$verseNodeTransform(node, context);` ahead of it.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. Re-point the existing verse tests' calls
(`$syncVerseAttributeDisplay(verse, alt, pub)` → the two `$syncDisplayRun` calls;
`$hasCaretHeldVerseAttributeRun(verse, alt, pub)` → `$caretHoldsRunSite(displayRunDescriptor("va"), verse) || $caretHoldsRunSite(displayRunDescriptor("vp"), verse)`).

One assertion class is EXPECTED to change and must be updated deliberately, not silently: a
complete-but-still-LOOSE `\va` triplet now reports caret-held when the caret is at its site,
because `$runDiverges` counts the pending wrap migration as a divergence. The old reporter said
"not caret-held" there while the old sync graced it — so nothing pended the migration and it was
deferred indefinitely. Add a pin naming the new behavior:

```tsx
it("reports a complete but still-loose \\va run as caret-held so its wrap migration settles", () => {
```

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/nodes/usj libs/shared-react/src/plugins/usj/TextSpacingPlugin.tsx packages/platform/src/editor/markerEdit
git commit -m "refactor(shared,shared-react,platform): verse runs run through the shared display-run driver

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Milestone runs re-pointed at the driver

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts:688-863` (delete `$isCaretAtMilestoneRunBoundary`, `$syncMilestoneDisplayRun`, `$hasCaretHeldMilestoneRun`; keep `$milestoneAttributeRunPieces`, `$milestoneRunEntirelyAbsent`, `MilestoneRunPieces`)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:131-136` (`$syncAndPendMilestone`)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts:294-309` (`$milestoneAttributeDisplayText` retires — its converter dependency is now the milestone descriptor's)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts:237` (the milestone branch of `$rependPendShapedNodes`)
- Test: `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts:75-518` and `:818-947` (re-point), `packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx` (re-point)

**Interfaces:**
- Consumes: `$syncDisplayRun`, `$caretHoldsRunSite`, `displayRunDescriptor`.
- Produces: `$syncMilestoneDisplayRun`, `$hasCaretHeldMilestoneRun`, and `$milestoneAttributeDisplayText` are RETIRED. Callers of `$milestoneAttributeDisplayText(node)` read `displayRunDescriptor("milestone").expectedPieces(node)` instead; the returned `valueText` is `undefined` where the old function returned `""`.

- [ ] **Step 1: Pin the current behavior green**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run attributeDisplay
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run milestoneAttributeSettle
```
Expected: both PASS.

- [ ] **Step 2: Delete the milestone sync and re-point its home**

Delete `$isCaretAtMilestoneRunBoundary` (`:705-741`), `$syncMilestoneDisplayRun` (`:771-839`) and
`$hasCaretHeldMilestoneRun` (`:852-863`) from `attributeDisplay.utils.ts`.

Rewrite `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:131-136` as:

```tsx
function $syncAndPendMilestone(node: MilestoneNode, context: MarkerEditContext): void {
  const descriptor = displayRunDescriptor("milestone");
  $syncDisplayRun(descriptor, node);
  if (node.isAttached() && $caretHoldsRunSite(descriptor, node))
    context.pendingKeys.add(node.getKey());
}
```

Delete `$milestoneAttributeDisplayText` from `markerEditTier1.utils.ts:294-309` and its two
consumers' imports. In `markerEditTier2Trigger.utils.ts:237`, replace
`$hasCaretHeldMilestoneRun(node, $milestoneAttributeDisplayText(node))` with
`$caretHoldsRunSite(displayRunDescriptor("milestone"), node)`.

- [ ] **Step 3: Run the tests to verify they pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. Re-point the milestone tests'
`$syncMilestoneDisplayRun(m, text)` calls to `$syncDisplayRun(displayRunDescriptor("milestone"), m)`
and `$hasCaretHeldMilestoneRun(m, text)` to `$caretHoldsRunSite(displayRunDescriptor("milestone"), m)`.
Tests that construct the expected text by hand (`${NBSP}|q1`) keep asserting on the TREE, not on the
retired function's return.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src/nodes/usj packages/platform/src/editor/markerEdit
git commit -m "refactor(shared,platform): milestone runs run through the shared display-run driver

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: The still-wanted exemption becomes `expectedPieces(...).wantsRun`

`MarkerEditPlugin`'s destruction listener exempts an owner whose run was legitimately heal-removed,
using three hand-written per-kind checks (`:418-448`) plus a verse-field classifier
(`$verseAttributeFieldOfDestroyedPiece`, `:218-232`). The milestone check keys on "no attribute
text", which an attribute-less milestone always satisfies — so deleting the whole `\ts-s\*` run of
a milestone with no `sid`/`eid` is exempted, never pended, and never removed.

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:204-232` (delete `$verseAttributeFieldOfDestroyedPiece`), `:377-452` (`$pendOwnersOfDestroyed`)
- Test: `packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx`

**Interfaces:**
- Consumes: `$ownerOfRunPiece(piece): DisplayRunOwnerRef | undefined` (Task 2); `displayRunDescriptor(kind).expectedPieces(owner): ExpectedRun` (Task 1).
- Produces: no new exports. `$pendOwnersOfDestroyed`'s per-kind exemptions and the verse-field map are gone; the collected owner keys carry their kind.

- [ ] **Step 1: Write the failing test**

Append to `packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx` (mirror the
nearest existing case's setup for building a milestone with a wrapped run and driving a departure):

```tsx
it("removes an attribute-LESS milestone whose whole run the user deleted", async () => {
  // An attribute-less milestone still displays `\ts-s\*`, so its run is wanted even with no
  // attribute text. Reading "no attribute text" as "no run wanted" exempts this deletion from
  // pending, and the sync then resurrects the glyph pair on the next unrelated dirtying.
  const { editor } = await testEnvironment(() => {
    const para = $createParaNode("p");
    const milestone = $createMilestoneNode("ts-s");
    $getRoot().append(
      para.append($createMarkerNode("p"), $createTextNode(NBSP), milestone, $createTextNode("x")),
    );
    $appendMilestoneRun(milestone, "");
  });

  await act(async () => {
    editor.update(() => {
      const milestone = $getRoot().getFirstChild()?.getChildren().at(2);
      if (!$isMilestoneNode(milestone)) throw new Error("milestone missing");
      milestone.getNextSibling()?.remove();
      const trailing = milestone.getNextSibling();
      if ($isTextNode(trailing)) trailing.select(1, 1);
    });
  });
  await act(async () => {
    editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
  });

  editor.getEditorState().read(() => {
    const children = $getRoot().getFirstChild()?.getChildren() ?? [];
    expect(children.some((child) => $isMilestoneNode(child))).toBe(false);
  });
});
```

Match the file's existing helper imports and `act`/`testEnvironment` usage exactly rather than the
sketch above where they differ.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run milestoneAttributeSettle`
Expected: FAIL — the milestone is still in the paragraph (the deletion was exempted from pending).

- [ ] **Step 3: Replace the exemptions with `wantsRun`**

Delete `$verseAttributeFieldOfDestroyedPiece` (lines 204–232) entirely. Rewrite
`$pendOwnersOfDestroyed` (lines 377–452) as:

```tsx
    const $pendOwnersOfDestroyed = (
      mutations: Map<NodeKey, NodeMutation>,
      payload: { updateTags: Set<string>; prevEditorState: EditorState },
    ) => {
      if (payload.updateTags.has(HISTORIC_TAG) || payload.updateTags.has(DELTA_CHANGE_TAG)) return;
      const destroyedRuns: DisplayRunOwnerRef[] = [];
      payload.prevEditorState.read(() => {
        for (const [key, mutation] of mutations) {
          if (mutation !== "destroyed") continue;
          const destroyed = $getNodeByKey(key);
          if (!destroyed) continue;
          const ref = $ownerOfRunPiece(destroyed);
          if (ref) destroyedRuns.push({ owner: ref.owner, kind: ref.kind });
        }
      });
      if (destroyedRuns.length === 0) return;
      editor.getEditorState().read(() => {
        for (const { owner: previousOwner, kind } of destroyedRuns) {
          const owner = $getNodeByKey(previousOwner.getKey());
          if (!owner?.isAttached()) continue;
          // A sync's OWN legitimate heal-removal (the owner's state no longer calls for a run) is
          // also a "destroyed" mutation here. Only pend when the owner's CURRENT state still wants
          // the run: a genuine clear must settle quietly rather than sit pended — and so exempted
          // from healing — until an unrelated caret departure. Keyed on the DESTROYED run's own
          // kind, so clearing a verse's `\va` never blocks its still-set `\vp` from healing, and a
          // milestone (whose glyph pair is unconditional) is never exempted at all.
          if (!displayRunDescriptor(kind).expectedPieces(owner).wantsRun) continue;
          context.pendingKeys.add(owner.getKey());
        }
      });
    };
```

Import `DisplayRunOwnerRef` and `displayRunDescriptor` from `shared`; drop the now-unused
`canonicalAttributeText`, `defaultMarkerAttribute`, and `$isVerseNode`/`$isCharNode` imports if
nothing else in the file uses them.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. `charAttributeDeletionSettle.test.tsx`'s
"a genuine attribute clear settles quietly" case and `verseAttributeSettle.test.tsx`'s per-field
exemption cases are the two pins that prove the replacement is faithful.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx packages/platform/src/editor/markerEdit/milestoneAttributeSettle.test.tsx
git commit -m "fix(platform): key the still-wanted deletion exemption on the descriptor's wantsRun

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Retire the last per-kind caret-held callers

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts:376-422` (the four grace arms of `$settlePendedDisplayOwner`), import block `:17-49`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts:214-314` (the VerseNode/MilestoneNode/CharNode branches of `$rependPendShapedNodes`), import block `:43-63`
- Test: `packages/platform/src/editor/markerEdit/markerEditUndoResettle.test.tsx`, `markerEditUndoRerenderResettle.test.tsx`

**Interfaces:**
- Consumes: `$caretHoldsRunSite(descriptor, owner): boolean`, `displayRunDescriptor(kind)`.
- Produces: no new exports. After this task `$hasCaretHeldAttributeRun`, `$hasCaretHeldVerseAttributeRun` and `$hasCaretHeldMilestoneRun` have zero references anywhere; `$hasCaretHeldSeparatorGap` (markerSeparators.utils.ts:130) is the only per-kind reporter left, and Task 11 folds it in.

- [ ] **Step 1: Pin the current behavior green**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEditUndo
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEditTier1
```
Expected: both PASS.

- [ ] **Step 2: Re-point the callers**

In `markerEditTier1.utils.ts`, replace the char/verse/milestone grace arms (lines 383–422) with:

```ts
  for (const kind of ["char", "va", "vp", "milestone"] as const) {
    const descriptor = displayRunDescriptor(kind);
    if (!descriptor.ownerPredicate(node)) continue;
    if (!$caretHoldsRunSite(descriptor, node)) continue;
    // Mid-edit grace: the caret holds the run's site. The exceptKey protection covers only the
    // node the caret is IN (the run's value, or the flanking text for a just-deleted run), not the
    // owner's own pended key. Settling now would rewrite or re-tokenize the run out from under the
    // caret; it settles once the caret has actually departed.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated: huskRemoved };
  }
```

placed immediately after the existing `$hasCaretHeldSeparatorGap` arm (lines 376–382), which stays.

In `markerEditTier2Trigger.utils.ts`'s `$rependPendShapedNodes`, replace:
- the VerseNode branch's `$hasCaretHeldVerseAttributeRun(node, node.getAltnumber(), node.getPubnumber())` with `$caretHoldsRunSite(displayRunDescriptor("va"), node) || $caretHoldsRunSite(displayRunDescriptor("vp"), node)`;
- the CharNode branch's `$hasCaretHeldAttributeRun(node, expectedText)` (and the `expectedText` computation above it) with `$caretHoldsRunSite(displayRunDescriptor("char"), node)`.

The MilestoneNode branch was already re-pointed in Task 6.

- [ ] **Step 3: Run the tests to verify they still pass**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips.

Then confirm the three reporters are unreferenced:
`env -u _VOLTA_TOOL_RECURSION grep -rn "hasCaretHeldAttributeRun\|hasCaretHeldVerseAttributeRun\|hasCaretHeldMilestoneRun" --include=*.ts --include=*.tsx .`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/markerEdit
git commit -m "refactor(platform): last per-kind caret-held callers move to \$caretHoldsRunSite

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 9: `$settlePendedDisplayOwner` becomes registry dispatch (and folds `huskRemoved` correctly)

`$settlePendedDisplayOwner` returns `{ handled: false, mutated: false }` at
`markerEditTier1.utils.ts:442` even when it removed a wrapper husk, and `$resolvePendingMarkers`
discards `settled.mutated` on that path (`:473-477`). A settle that removed a husk but whose Tier-2
rebuild then REFUSED (a fixed point) therefore reports "mutated nothing", so the caller tags the
commit `HISTORY_MERGE_TAG` and a real mutation is merged into the previous undo entry.

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts:339-443` (`$settlePendedDisplayOwner`), `:473-477` (`$resolvePendingMarkers`)
- Test: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx`

**Interfaces:**
- Consumes: `displayRunDescriptors`, `$caretHoldsRunSite`, `$runEntirelyAbsent`.
- Produces: `$settlePendedDisplayOwner(node, context): { handled: boolean; mutated: boolean }` — same signature, now descriptor-driven, and `mutated` is meaningful on BOTH paths.

- [ ] **Step 1: Write the failing test**

Append to `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx`:

```tsx
it("reports a husk removal as a mutation even when the settle's rebuild refuses", () => {
  // A refused (fixed-point) rebuild returns false, but removing an emptied AttributeRunNode husk
  // IS a visible mutation. Reporting it as "mutated nothing" makes the caller merge the commit
  // into the previous history entry, burying a real change under one dead Ctrl+Z.
  const { editor, context } = buildTier1Context(() => {
    const para = $createParaNode("p");
    const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
    const husk = $createAttributeRunNode("va");
    $getRoot().append(
      para.append($createMarkerNode("p"), $createTextNode(NBSP), verse, husk, $createTextNode("x")),
    );
    context.pendingKeys.add(verse.getKey());
  });

  let mutated = false;
  editor.update(
    () => {
      mutated = $resolvePendingMarkers(context);
    },
    { discrete: true },
  );

  expect(mutated).toBe(true);
  editor.getEditorState().read(() => {
    const children = $getRoot().getFirstChild()?.getChildren() ?? [];
    expect(children.some((child) => $isAttributeRunNode(child))).toBe(false);
  });
});
```

`buildTier1Context` is a placeholder name only if the file has no equivalent — read
`markerEditTier1.utils.test.tsx`'s existing setup helper and use its real name and signature. If
the file drives `$resolvePendingMarkers` through the plugin instead, build the same shape with
`testEnvironment` + `COMMIT_PENDING_MARKERS_COMMAND` and assert on the undo stack depth instead of
the boolean.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEditTier1`
Expected: FAIL — `expect(mutated).toBe(true)` receives `false`.

- [ ] **Step 3: Rewrite the settle as dispatch**

Replace `$settlePendedDisplayOwner` (lines 339–443) with:

```ts
/**
 * The uniform deletion/pend settle for display-run OWNERS — the one place every kind's
 * grace-or-settle decision and entirely-absent deletion policy lives, driven entirely by the
 * registry. Marker literals and plain pending text own no run and fall through (`handled: false`)
 * to the caller's re-tokenize arm.
 *
 * `mutated` is meaningful on BOTH result paths: an emptied `AttributeRunNode` husk removed here is
 * a visible change even when the caller's own re-tokenize then refuses at a fixed point, and a
 * settle pass that reports mutating nothing has its commit merged into the previous history entry.
 */
export function $settlePendedDisplayOwner(
  node: LexicalNode,
  context: MarkerEditContext,
): { handled: boolean; mutated: boolean } {
  // An emptied wrapper left attached to a verse or milestone is undead scaffolding with nothing
  // left to display. Removed as a side effect, not an early return, so the OWNER's own policy
  // below still runs against the cleaned-up tree in the SAME pass: ownership is position-derived,
  // so a wrapper orphaned by its owner's removal could never be cleaned up by anything else.
  let mutated = false;
  for (const wrapper of $emptyAttributeRunWrappers(node)) {
    wrapper.remove();
    mutated = true;
  }
  if ($isCharNode(node) && $hasCaretHeldSeparatorGap(node)) {
    // A deleted opener separator stays pending while the caret still sits at the gap: the
    // exceptKey protection covers only the anchor node itself, not its parent span.
    context.pendingKeys.add(node.getKey());
    return { handled: true, mutated };
  }
  let handled = false;
  for (const descriptor of displayRunDescriptors) {
    if (descriptor.settleScope === "none") continue;
    if (!descriptor.ownerPredicate(node)) continue;
    if ($caretHoldsRunSite(descriptor, node)) {
      // Mid-edit grace: settling now would rewrite or re-tokenize the run out from under the
      // caret. It settles once the caret has actually departed.
      context.pendingKeys.add(node.getKey());
      return { handled: true, mutated };
    }
    if (descriptor.deletionPolicy === "none") {
      // Nothing to settle, but the owner must still be reported as handled so the caller's
      // re-tokenize fallback never routes it anywhere.
      handled = true;
      continue;
    }
    if (descriptor.deletionPolicy === "remove-owner" && $runEntirelyAbsent(descriptor, node)) {
      // The display run is this owner's ENTIRE visible byte representation, so deleting all of it
      // deletes the owner — displayed bytes win. Guarded to the fully-absent shape: a partial
      // mangle falls through and re-tokenizes instead.
      node.remove();
      return { handled: true, mutated: true };
    }
  }
  return { handled, mutated };
}
```

Add `opaqueUnknown` to the registry so the non-optbreak `UnknownNode` arm the old code carried
(lines 355–360) keeps its behavior. In `libs/shared/src/displayRun/displayRunRegistry.ts`:

```ts
const opaqueUnknownDescriptor: DisplayRunDescriptor = {
  kind: "opaqueUnknown",
  // Every UnknownNode kind other than an optbreak is a permanent Tier-2 sentinel whose bytes are
  // read-only rendering, never re-tokenized. It owns no display run, but is recognized so the
  // settle reports it handled and the caller never routes one through a rebuild that would bail.
  ownerPredicate: (node) => $isUnknownNode(node) && node.getTag() !== "optbreak",
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: () => false,
  settleScope: "owner",
  deletionPolicy: "none",
  byteFormat: { writer: "read-only", glyphs: "none" },
};
```

added to `displayRunDescriptors` after `optbreakDescriptor`.

Then fix the caller at `markerEditTier1.utils.ts:473-477`:

```ts
    const settled = $settlePendedDisplayOwner(node, context);
    mutated = settled.mutated || mutated;
    if (settled.handled) continue;
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. `optbreakDeletionSettle.test.tsx` is the pin that
the optbreak's `remove-owner` policy still fires through the new dispatch.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit libs/shared/src/displayRun
git commit -m "refactor(platform,shared): settle pended display owners by descriptor dispatch

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 10: `$rependPendShapedNodes` becomes registry dispatch

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts:214-314`
- Test: `packages/platform/src/editor/markerEdit/markerEditUndoResettle.test.tsx`

**Interfaces:**
- Consumes: `displayRunDescriptors`, `$caretHoldsRunSite`, `$runEntirelyAbsent`, `$ownerOfRunPiece`.
- Produces: `$rependPendShapedNodes(context: MarkerEditContext): void` — unchanged signature, now one dispatch loop instead of a per-kind switch.

- [ ] **Step 1: Pin the current behavior green**

Run: `cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run markerEditUndo`
Expected: PASS.

- [ ] **Step 2: Replace the per-kind branches with dispatch**

Insert this helper above `$rependPendShapedNodes`:

```ts
/**
 * Whether a settle would act on `owner` for `descriptor`'s kind purely from tree shape, with no
 * caret involved. Only a run nothing can ever heal back qualifies: a `"read-only"` run that is
 * absent always means "settle removes this owner", while a HEALABLE run's absence can equally mean
 * "not built yet" (a collab-materialized bare milestone legitimately has no run at rest, and
 * pending it would DELETE it on the next departure).
 */
function $isStaticSettleShape(descriptor: DisplayRunDescriptor, owner: LexicalNode): boolean {
  if (descriptor.deletionPolicy !== "remove-owner") return false;
  if (descriptor.byteFormat.writer !== "read-only") return false;
  return $runEntirelyAbsent(descriptor, owner);
}
```

Replace the `$isVerseNode`, `$isMilestoneNode`, `$isCharNode` and `$isUnknownNode` branches of
`visit` with one shared call, placed so it runs before the branch that decides whether to recurse:

```ts
    // Every registered display kind's owner re-pends by the SAME rule: a caret-held divergence, or
    // a statically-settling shape. A restored state ran no transforms, so nothing else re-derives
    // these pends and caret departure would settle nothing.
    for (const descriptor of displayRunDescriptors) {
      if (descriptor.settleScope === "none") continue;
      if (!descriptor.ownerPredicate(node)) continue;
      if ($caretHoldsRunSite(descriptor, node) || $isStaticSettleShape(descriptor, node))
        context.pendingKeys.add(node.getKey());
    }
```

Keep, unchanged, everything that is not a display-run owner: the `MarkerNode` glyph-divergence
branch, the `VerseNode` glyph-text branch (`node.getTextContent() !== getVisibleOpenMarkerText("v", node.getNumber())`),
the plain-`TextNode` literal branch, the `$isBookNode`/`$isChapterNode` stop, the
`AttributeRunNode`-husk branch (which pends the OWNER via `$ownerOfRunPiece`), the CharNode
recursion into children, and the `$isElementNode` recursion. The `UnknownNode` branch keeps its
`return` (the scan must not descend into an opaque block) but its pend decision now comes from the
shared loop above.

- [ ] **Step 3: Run the tests to verify they still pass**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. The two undo-resettle suites are the pins.

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts
git commit -m "refactor(platform): historic re-pend scan dispatches on the display-run registry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 11: Separators and nested glyphs join the registry

**Files:**
- Modify: `libs/shared/src/displayRun/displayRunRegistry.ts` (add `separatorDescriptor`, `nestedGlyphDescriptor`)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (the standalone separator arm folds into the dispatch loop)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts` (the CharNode branch's standalone separator check folds in)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:487-505` (the CharNode transform's separator pend folds in)
- Test: `libs/shared/src/displayRun/displayRunRegistry.test.ts`

**Interfaces:**
- Consumes: `$hasCaretHeldSeparatorGap(char): boolean` (`libs/shared/src/nodes/usj/markerSeparators.utils.ts:130`); `$syncOpenerSeparators(char): void` (`:108`); `$syncNestedGlyphs(char): void` (`libs/shared/src/nodes/usj/nestedGlyphs.utils.ts:77`).
- Produces: `displayRunDescriptor("separator")` and `displayRunDescriptor("nestedGlyph")`. `$hasCaretHeldSeparatorGap` keeps its export (the separator descriptor's `graceSite` delegates to it) but has no direct callers left outside the registry.

- [ ] **Step 1: Write the failing test**

Append to `libs/shared/src/displayRun/displayRunRegistry.test.ts`:

```ts
describe("every registered kind declares every duty", () => {
  it("covers separators and nested glyphs, and gives nested glyphs no edit surface", () => {
    // A kind joins the registry by declaring all eight duties. Nested glyphs declare theirs as
    // "no pend, no deletion, kind-owned writer" — an explicit decision, not an absent quadrant.
    const separator = displayRunDescriptor("separator");
    expect(separator.settleScope).toBe("owner");
    expect(separator.deletionPolicy).toBe("retokenize");
    expect(separator.byteFormat.writer).toBe("kind-owned");

    const nestedGlyph = displayRunDescriptor("nestedGlyph");
    expect(nestedGlyph.settleScope).toBe("none");
    expect(nestedGlyph.deletionPolicy).toBe("none");
    expect(nestedGlyph.byteFormat.writer).toBe("kind-owned");
  });

  it("registers every DisplayRunKind exactly once", () => {
    const kinds = displayRunDescriptors.map((descriptor) => descriptor.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "char",
        "va",
        "vp",
        "milestone",
        "optbreak",
        "opaqueUnknown",
        "separator",
        "nestedGlyph",
      ]),
    );
  });
});
```

Add `displayRunDescriptors` to the file's import from `./displayRunRegistry.js`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run displayRunRegistry`
Expected: FAIL — `No display-run descriptor registered for kind "separator"`.

- [ ] **Step 3: Add the two descriptors**

In `libs/shared/src/displayRun/displayRunRegistry.ts`:

```ts
const separatorDescriptor: DisplayRunDescriptor = {
  kind: "separator",
  // The NBSP a char span shows after its opening glyph. Its "deletion" is a TEXT mutation (an NBSP
  // prefix edit), not node destruction, so it has no owner walk and no destruction pend — its
  // caret-grace path is what settles it, exactly as before joining the registry.
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: (owner) => $isCharNode(owner) && $hasCaretHeldSeparatorGap(owner),
  settleScope: "owner",
  deletionPolicy: "retokenize",
  byteFormat: { writer: "kind-owned", glyphs: "none" },
};

const nestedGlyphDescriptor: DisplayRunDescriptor = {
  kind: "nestedGlyph",
  // The `+` on a nested span's glyphs. Purely tree-derived and rewritten in place by its own sync;
  // there is no state a user edit can leave half-finished, so it owes no pend or deletion duty.
  ownerPredicate: (node) => $isCharNode(node),
  ownerOf: () => undefined,
  expectedPieces: () => NO_RUN,
  scanPieces: () => NO_PIECES,
  graceSite: () => false,
  settleScope: "none",
  deletionPolicy: "none",
  byteFormat: { writer: "kind-owned", glyphs: "none" },
};
```

Add them to `displayRunDescriptors` — `separatorDescriptor` FIRST in the array, ahead of
`charDescriptor`, preserving the order the settle's arms ran in (separator grace before attribute
grace); `nestedGlyphDescriptor` last.

Then fold the standalone separator arms into the dispatch:
- `markerEditTier1.utils.ts` — delete the `$isCharNode(node) && $hasCaretHeldSeparatorGap(node)` arm added in Task 9; the registry loop's `graceSite` now covers it. Drop the `$hasCaretHeldSeparatorGap` import.
- `markerEditTier2Trigger.utils.ts` — delete the CharNode branch's `if ($hasCaretHeldSeparatorGap(node)) …` line; Task 10's loop covers it. Drop the import.
- `MarkerEditPlugin.tsx:493-495` — delete the separator pend from the CharNode transform and replace the whole attribute/separator pend block with:

```tsx
      editor.registerNodeTransform(CharNode, (node) => {
        if (editor.isComposing()) return;
        $charNodeDeletionTransform(node, context);
        // Whatever the char span owns and the syncs left alone under caret-grace — its opener
        // separator, its attribute display run — pends here for the caret-departure settle.
        for (const kind of ["separator", "char"] as const) {
          if (node.isAttached() && $caretHoldsRunSite(displayRunDescriptor(kind), node))
            context.pendingKeys.add(node.getKey());
        }
      }),
```

Note that `$caretHoldsRunSite` returns `descriptor.graceSite(...)` for the separator only after
`$runDiverges` returns true; the separator's `expectedPieces`/`scanPieces` are both empty, so
`$runDiverges` returns `runHasPieces({})` = `false` and the graceSite arm would never run. Fix this
by giving `$caretHoldsRunSite` an early delegation for kind-owned writers, added in the same commit:

```ts
  // A kind-owned writer keeps its own divergence rule (a separator's missing NBSP is not a run
  // piece at all), so its graceSite is authoritative on its own.
  if (descriptor.byteFormat.writer === "kind-owned") return descriptor.graceSite(owner, {});
```

placed immediately after the `owner.isAttached()` guard in `$caretHoldsRunSite`.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. The separator pins live in
`packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx` and
`libs/shared/src/nodes/usj/` separator tests — both must be green without edits.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src packages/platform/src/editor/markerEdit
git commit -m "refactor(shared,platform): separators and nested glyphs join the display-run registry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 12: One shared exclusion predicate for the collab coordinate files

`$isOwnParaPrefixGlyph` is duplicated verbatim in `editor-delta.adaptor.ts:228-231` and
`delta-common.utils.ts:491-494`. Separately, wave 2a deleted `$isBareAttributeGlyph`, so the ops
side no longer excludes a run glyph riding LOOSE — a transient shape (an undo stack, a
collab-materialized bare owner, a mid-edit tree with one of a verse's markers wrapped and the other
not) that is real for a commit. Keying the exclusion on KIND restores that safety net by
construction.

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts:228-231` (delete the duplicate), `:273-277` (kind-keyed gate)
- Modify: `libs/shared-react/src/plugins/usj/collab/delta-common.utils.ts:482-494` (keep as the ONE definition, already exported? — export it if not)
- Modify: `libs/shared/src/displayRun/displayRunOwner.utils.ts` (add `$isDisplayRunPiece`)
- Test: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx`

**Interfaces:**
- Consumes: `$ownerOfRunPiece` (Task 2); `$hasAttributeRunAncestor(node): boolean` (`delta-common.utils.ts:506`).
- Produces: `function $isDisplayRunPiece(node: LexicalNode): boolean` — true when `node` is a piece of ANY registered display run, wrapped or loose. `$isOwnParaPrefixGlyph` is exported from `delta-common.utils.ts` and imported by `editor-delta.adaptor.ts`.

- [ ] **Step 1: Write the failing test**

Append to `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx` (mirror the
nearest existing ops-exclusion test's editor-state builder and ops collection verbatim):

```tsx
it("excludes a LOOSE \\va run glyph from content ops", () => {
  // A run's pieces ride wrapped at rest, but caret-grace, an undo stack, and a collab-materialized
  // bare verse all leave them loose for at least one commit. A loose glyph is exactly as much
  // engine-owned display as a wrapped one, so its bytes must never reach the ops stream.
  const ops = collectOps(() => {
    const para = $createParaNode("p");
    const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
    const value = $createTextNode(`${NBSP}2`);
    $setState(value, textTypeState, "attribute");
    $getRoot().append(
      para.append(
        verse,
        $createMarkerNode("va", "opening"),
        value,
        $createMarkerNode("va", "closing"),
        $createTextNode("In the beginning"),
      ),
    );
  });

  const inserted = ops
    .map((op) => (typeof op.insert === "string" ? op.insert : ""))
    .join("");
  expect(inserted).not.toContain("\\va");
});
```

`collectOps` is a placeholder name: read the existing test file and use its real ops-collection
helper and `$createVerseNode` signature.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd libs/shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run editor-delta`
Expected: FAIL — the produced ops contain `\va ` and `\va*`.

- [ ] **Step 3: Add the shared predicate and re-point both files**

Append to `libs/shared/src/displayRun/displayRunOwner.utils.ts`:

```ts
/**
 * True when `node` is a piece of ANY registered display run — a run glyph, an attribute value, or
 * anything riding inside a run wrapper. Engine-owned presentation, never content: it must not
 * enter OT content ops or the editor→USJ conversion.
 *
 * Keyed on the piece's KIND (via {@link $ownerOfRunPiece}) rather than on tree shape, so both the
 * wrapped shape the adaptor builds and the loose shape a mid-edit commit, an undo stack, or a
 * collab-materialized bare owner can leave behind are excluded by the same rule. A shape-only
 * check has to be re-broadened by hand each time a new shape becomes reachable.
 */
export function $isDisplayRunPiece(node: LexicalNode): boolean {
  return $ownerOfRunPiece(node) !== undefined;
}
```

In `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts`, delete the duplicate
`$isOwnParaPrefixGlyph` (lines 228–231) and import the one from `./delta-common.utils.js` (add
`export` to it there if it is not exported). Then replace the glyph gate at lines 273–277 with:

```ts
  const isInNote = $findFirstAncestorNoteNode(currentNode) !== undefined;
  if (
    $isMarkerNode(currentNode) &&
    (isInNote || $isOwnParaPrefixGlyph(currentNode) || $isDisplayRunPiece(currentNode))
  )
    return;
```

and update the comment above it so it names the kind-keyed rule rather than the ancestry one.

Leave `delta-common.utils.ts`'s `$getNodeOTContribution` UNCHANGED — including its
`$hasAttributeRunAncestor` arm. Extending the delta-doc length exclusion to loose pieces is a
change to OT coordinate semantics, not to the ops stream, and it is deliberately out of scope for
this wave: before wave 2a the ops side excluded loose glyphs while the length side did not, so
restoring only the ops exclusion restores exactly the prior contract. Record the asymmetry in the
comment on `$isDisplayRunPiece`'s call site so a future reader does not "fix" one side alone.

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd libs/shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. The delta round-trip and OT length-invariance pins
in `libs/shared-react/src/plugins/usj/collab/` are the ones that catch a coordinate shift.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/displayRun libs/shared-react/src/plugins/usj/collab
git commit -m "fix(shared,collab): one kind-keyed display-run exclusion; dedupe the para-prefix predicate

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 13: One registration helper for all three homes

**Files:**
- Create: `libs/shared/src/nodes/usj/displayRunSync.utils.ts` addition (`$syncAndPendDisplayRun`)
- Modify: `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx:44,50-64`
- Modify: `libs/shared-react/src/plugins/usj/TextSpacingPlugin.tsx:65,70-78`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx:121-156` (`$syncAndPendMilestone`, `$syncAndPendVerse`), `:487-545` (the three transforms)
- Test: existing suites only (behavior-preserving)

**Interfaces:**
- Consumes: `$syncDisplayRun`, `$caretHoldsRunSite`.
- Produces: `function $syncAndPendDisplayRun(descriptor: DisplayRunDescriptor, owner: LexicalNode, pendingKeys: Set<NodeKey>): void` — syncs the run, then pends the owner's key when the caret holds the run's site. Takes the raw `Set<NodeKey>` rather than `MarkerEditContext` so it can live in `shared`, which does not know the engine's context type.

- [ ] **Step 1: Pin the current behavior green**

```bash
cd libs/shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS.

- [ ] **Step 2: Add the helper and collapse the three wrappers**

Append to `libs/shared/src/nodes/usj/displayRunSync.utils.ts`:

```ts
/**
 * Sync `owner`'s run for `descriptor`, then pend `owner` while the caret holds the run's site so
 * caret departure settles it. The pairing every registration home needs: the sync leaves a
 * caret-held divergence alone, and without the matching pend nothing would ever settle it — the
 * run would silently resurrect from the owner's still-set state on the next unrelated dirtying.
 *
 * @param descriptor - The kind's descriptor.
 * @param owner - The owner whose run to sync. Must be called inside `editor.update()`.
 * @param pendingKeys - The marker-edit engine's live pending set.
 */
export function $syncAndPendDisplayRun(
  descriptor: DisplayRunDescriptor,
  owner: LexicalNode,
  pendingKeys: Set<NodeKey>,
): void {
  $syncDisplayRun(descriptor, owner);
  if (owner.isAttached() && $caretHoldsRunSite(descriptor, owner)) pendingKeys.add(owner.getKey());
}
```

adding `NodeKey` to the `lexical` import.

In `MarkerEditPlugin.tsx`, replace `$syncAndPendMilestone` and `$syncAndPendVerse` (lines 121–156)
with:

```tsx
/**
 * Sync and pend every run `node` owns. A verse owns two independent runs (`\va`, `\vp`) that must
 * be driven in that order — `\vp`'s scan and insertion anchor both depend on `\va`'s wrapper
 * already being in place — and a milestone owns one.
 */
function $syncAndPendOwner(node: VerseNode | MilestoneNode, context: MarkerEditContext): void {
  const kinds = $isVerseNode(node) ? (["va", "vp"] as const) : (["milestone"] as const);
  for (const kind of kinds)
    $syncAndPendDisplayRun(displayRunDescriptor(kind), node, context.pendingKeys);
}
```

and update its three call sites (the VerseNode transform, the MilestoneNode transform, and the
MarkerNode/AttributeRunNode re-drives from Task 3) to call `$syncAndPendOwner`.

Replace the CharNode transform's registry loop (Task 11's version) with the same helper:

```tsx
      editor.registerNodeTransform(CharNode, (node) => {
        if (editor.isComposing()) return;
        $charNodeDeletionTransform(node, context);
        for (const kind of ["separator", "char"] as const)
          $syncAndPendDisplayRun(displayRunDescriptor(kind), node, context.pendingKeys);
      }),
```

Note this now also runs the char sync inside `MarkerEditPlugin`, which `CharNodePlugin` already
does — `$syncDisplayRun` is idempotent (it writes only on change), so the double registration
converges exactly as the two plugins' CharNode transforms already do today. If any test proves
otherwise, keep `MarkerEditPlugin`'s loop on `$caretHoldsRunSite` alone and leave the sync to
`CharNodePlugin`.

Rewrite `CharNodePlugin.tsx:44` and its wrapper as:

```tsx
      editor.registerNodeTransform(CharNode, (node) =>
        $syncDisplayRun(displayRunDescriptor("char"), node),
      ),
```

deleting `$syncCharAttributeDisplayNode` entirely, and `TextSpacingPlugin.tsx:65` and its wrapper as:

```tsx
      editor.registerNodeTransform(VerseNode, (node) => {
        $syncDisplayRun(displayRunDescriptor("va"), node);
        $syncDisplayRun(displayRunDescriptor("vp"), node);
      }),
```

deleting `$syncVerseAttributeDisplayNode` entirely. Both plugins keep their existing comments about
WHY the registration lives there (the mode-gating rationale) — reword them to name
`$syncDisplayRun` instead of the retired per-kind functions.

- [ ] **Step 3: Run the tests to verify they still pass**

```bash
cd libs/shared && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../shared-react && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
cd ../../packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run
```
Expected: all PASS; corpus 141/141, zero skips. `testEnvironmentWithCharSync`'s `"engine-first"`
plugin order is the pin that the double CharNode registration is order-independent.

- [ ] **Step 4: Commit**

```bash
git add libs/shared/src libs/shared-react/src/plugins/usj packages/platform/src/editor/markerEdit
git commit -m "refactor(shared,shared-react,platform): one sync-and-pend registration helper per kind

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 14: Wave-3 gate

**Files:** none (verification only, plus any residue the gate turns up).

**Interfaces:**
- Consumes: Tasks 1–13.
- Produces: a green wave boundary the wave-4 plan builds on.

- [ ] **Step 1: Repo-wide gate**

```bash
cd /home/tj_co/source/repos/workspaces/standard-view/scripture-editors
env -u _VOLTA_TOOL_RECURSION npx nx run-many -t lint,typecheck,test
env -u _VOLTA_TOOL_RECURSION npx eslint .
```
Expected: exit 0 from both. Judge by exit code, not output tail.

- [ ] **Step 2: Corpus and bug-pin confirmation**

```bash
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run tier2Rebuild.corpus
cd packages/platform && env -u _VOLTA_TOOL_RECURSION pnpm vitest run charAttributeDeletionSettle optbreakDeletionSettle verseAttributeSettle milestoneAttributeSettle
```
Expected: corpus 141/141, ZERO skips; all four wave-1 bug-pin suites green.

- [ ] **Step 3: Confirm the retired surface is gone**

```bash
cd /home/tj_co/source/repos/workspaces/standard-view/scripture-editors
grep -rn "syncCharAttributeDisplay\|syncVerseAttributeDisplay\|syncMilestoneDisplayRun\|hasCaretHeldAttributeRun\|hasCaretHeldVerseAttributeRun\|hasCaretHeldMilestoneRun\|milestoneAttributeDisplayText\|ownerOfDestroyedRunPiece\|runChainOwner\|verseOfAttributeGlyph\|ownerOfAttributeRunWrapper\|verseAttributeFieldOfDestroyedPiece" --include=*.ts --include=*.tsx .
```
Expected: no output. Any hit is a call site the refactor missed.

- [ ] **Step 4: Live visual check in paranext-core**

Follow the standard-view dev loop (yalc build THEN extract-api; DLL rebuild as needed). In Standard
view: open a chapter containing `\va`, a milestone, and an optbreak. Verify the `\va` run still
renders as one green superscript run; edit and delete a run and confirm it settles on caret
departure; delete an optbreak's `//` and confirm no husk survives; delete an attribute-less
milestone's run and confirm the milestone disappears (Task 7's fix, live). Capture screenshots via
the `visual-verification` skill.

- [ ] **Step 5: Commit any residue and append the handoff postscript**

```bash
git add -A
git commit -m "chore(shared,shared-react,platform): wave-3 gate residue

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git add -f docs/superpowers/specs/2026-08-05-display-run-consolidation-handoff.md
git commit -m "docs: wave-3 gate postscript — display-run registry landed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(If nothing is left to commit at step 5's first command, skip it and commit only the postscript.)

---

## Self-review

**Spec §7 coverage**

| Spec §7 requirement | Task |
|---|---|
| Descriptor `{ ownerPredicate, ownerOf, expectedPieces, scanPieces, graceSite, settleScope, deletionPolicy, byteFormat }` | 1 |
| Byte formats stay per-kind callbacks with their exact logic | 1 (`expectedPieces` + `byteFormat`) |
| Tokenizer and Tier-2 fragment/signature machinery stay OUT | untouched by every task; `tier2Rebuild.utils.ts` is not in any Files list |
| ONE shared sync transform | 4 (driver), 5–6 (verse, milestone re-pointed) |
| ONE caret-held reporter `$caretHoldsRunSite(descriptor, owner)` | 4 (introduced), 8 (last callers) |
| ONE pend/settle driver — `$resolvePendingMarkers`' switch AND `$rependPendShapedNodes`' parallel switch both become dispatch | 9, 10 |
| Phase-1 deletion-semantics function now descriptor-driven | 9 |
| Descriptors needing converter imports assembled one layer up | 1 (`libs/shared/src/displayRun/`) |
| Registration homes keep mode-gating via thin wrappers | 4, 5, 13 |
| Separators and nested glyphs join as descriptors | 11 |
| Adding a kind = one descriptor + one registration line; missing quadrant = type error | 1 (all fields required), 11 (pinned) |
| Existing per-kind tests re-point at the driver with descriptor fixtures | 4, 5, 6 (re-pointing steps) |
| Corpus property tests carry over unchanged | 2–14 (`tier2Rebuild.corpus.test.tsx` is never edited) |
| Suppression-window state machine only if it falls out naturally | it does not — `appPlacedCaret` is untouched by every task, as spec §2 permits |

**Feed-forward coverage**

| Finding | Task |
|---|---|
| (a) destruction detection exists only in the char sync | 4 (`$runDestroyedSinceLastCommit` in the driver), pinned for verse in 5 |
| (b) `deletionPolicy` must distinguish "no attribute text" from "no run wanted" | 1 (`ExpectedRun.wantsRun`), 7 (the fix + pin) |
| (c) one shared exclusion predicate for the collab coordinate files | 12 |
| (d) per-kind exclusion keyed on KIND, restoring the loose-shape ops safety net | 12 |
| (e) `huskRemoved` dropped on `handled:false` | 9 |
| (f) `$runChainOwner` accepts ANY MarkerNode | 2 |

**Placeholder scan**

Three step bodies name a helper whose exact identifier must be read from the existing test file
before use (`buildTier1Context` in Task 9, `collectOps` in Task 12, the `testEnvironment` shape in
Task 7). Each says so explicitly and states what to substitute; they are instructions to match an
existing convention, not undefined work. Every other code block is complete. No "TBD", no "similar
to Task N", no "add appropriate error handling".

**Type consistency**

- `ExpectedRun` is `{ wantsRun, valueText }` everywhere: produced by `expectedPieces` (Task 1), consumed by `$runDiverges`/`$writeRun`/`$runDestroyedSinceLastCommit` (Task 4) and by the still-wanted exemption (Task 7).
- `ScannedRun` is `{ opener?, value?, closer?, wrapper? }` with `value?: LexicalNode` — narrowed with `$isTextNode` before `setTextContent` in `$writeRun`, and satisfied by `VerseAttributeRunPieces` and `MilestoneRunPieces` structurally (both declare `value`/`attribute` — Task 1's milestone `scanPieces` returns `$milestoneAttributeRunPieces`, whose field is named `attribute`, NOT `value`; the milestone descriptor's `scanPieces` must therefore map it: `const { opening, attribute, closing, wrapper } = $milestoneAttributeRunPieces(owner); return { opener: opening, value: attribute, closer: closing, wrapper };`). Apply that mapping when writing Task 1's milestone descriptor.
- `DisplayRunOwnerRef` is `{ owner, kind }` in Task 2's producer and Tasks 3, 7, 10, 12's consumers.
- `$syncDisplayRun(descriptor, owner)`, `$caretHoldsRunSite(descriptor, owner)`, `$runEntirelyAbsent(descriptor, owner)` and `$syncAndPendDisplayRun(descriptor, owner, pendingKeys)` keep the descriptor-first argument order in every call site.
- `displayRunDescriptor(kind)` (singular, lookup) and `displayRunDescriptors` (plural, array) are distinct names used consistently.

---

## Execution gate

**This plan is NOT approved for execution.** Wave 3 begins only after TJ signs off on this plan.
Two decisions in particular need explicit confirmation before any code lands:

1. **Task 5's deliberate behavior change** — a complete-but-still-loose run now reports caret-held, because the pending wrap migration counts as a divergence. This makes the reporter agree with the sync (which already graces the migration) and gives the migration something to settle it, but it is a real change, not a pure refactor.
2. **Task 12's asymmetry** — the ops-side exclusion is broadened to loose run pieces while `$getNodeOTContribution`'s delta-doc arm is deliberately left alone. That restores the exact pre-wave-2a contract, but it leaves the two coordinate systems disagreeing about a loose piece's length, which is worth a conscious "yes, later" rather than a silent one.
