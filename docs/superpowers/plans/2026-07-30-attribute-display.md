# Attribute Display (Full USFM-Equivalent Display) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standard view displays USFM attributes as written, PT9-style — char spans and milestones become editable + re-tokenizable (sentinels removed), verses display `\va`/`\vp` and stop being sentinels, UnknownNodes display their full USFM read-only — per the approved spec `docs/superpowers/specs/2026-07-30-attribute-display-design.md`.

**Architecture:** Node state stays the single source of truth; a new owning module `attributeDisplay.utils.ts` (sibling of `nestedGlyphs.utils.ts`/`markerSeparators.utils.ts`) derives canonical display runs via one shared serializer `canonicalAttributeText`; Tier-2's sentinel test changes from "has attributes" to "state not recoverable from displayed bytes". Key fact: Tier-2 rebuilds materialize through `usjEditorAdaptor.serializeEditorState` (tier2Rebuild.utils.ts:543), so display builders added to `usj-editor.adaptor.ts` automatically serve both initial load and rebuilds.

**Tech Stack:** TypeScript, Lexical, Vitest (`npx nx test shared` / `shared-react` / `platform` from the scripture-editors repo root; append `-- <filename-substring>` to filter).

## Global Constraints

- Repo: `~/source/repos/workspaces/standard-view/scripture-editors`, branch `standard-view-pt-4187`. Never edit `~/source/repos/Paratext` (PT9 reference only).
- USFM ≤ 3.0 semantics; default-attribute names per the tokenizer's `DEFAULT_MARKER_ATTRIBUTES` (`w→lemma`, `rb→gloss`, `xt→link-href`, `jmp→link-href`) and `milestoneDefaultAttribute` (`qt*→who`, `*-e→eid`, else `sid`). `fig` has NO default attribute.
- Canonical attribute form (PT9-verified): lone default attribute → bare `|value`; otherwise `|name="value" name2="value2"` — double quotes, single space separators, insertion order. `closed` never displays.
- New display only in `markerMode === "editable"` (Standard view). Visible/hidden modes and Simple view must be behaviorally unchanged (existing milestone visible-mode display stays as-is).
- Attribute display text must never enter OT content ops or saved USJ (textType `"attribute"` state is the signal; the `NODE_ATTRIBUTE_PREFIX` prefix checks stay for compatibility).
- Char-span attribute runs have NO leading NBSP (bare `|…`). Milestone runs KEEP the `NODE_ATTRIBUTE_PREFIX` (NBSP+`|`) — the NBSP flattens to the space genuinely in the file (`\qt-s |sid="…"\*`).
- Every commit: run the affected project's tests + `npx nx run-many -t lint typecheck --projects=<changed projects>` (or repo-standard equivalents) green before committing. Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Comments must stand on their own — no spec-section/task-number breadcrumbs in code comments.

---

## Phase 1 — char spans + milestones

### Task 1: `canonicalAttributeText` + the owning module skeleton

**Files:**
- Create: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts`
- Create: `libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts`
- Modify: `libs/shared/src/nodes/usj/index.ts` (export the new module; follow how `nestedGlyphs.utils.js` is exported)

**Interfaces:**
- Produces: `canonicalAttributeText(attributes: { [name: string]: string | undefined }, defaultAttributeName?: string): string` — returns `""` when no displayable attributes; else `|value` (lone default) or `|name="value" …`. Skips `closed` and `undefined` values. Insertion order preserved.
- Produces: `CHAR_ATTRIBUTE_EXCLUDED_KEYS: ReadonlySet<string>` — `new Set(["closed"])`.

- [ ] **Step 1: Write the failing tests**

```ts
// libs/shared/src/nodes/usj/attributeDisplay.utils.test.ts
import { canonicalAttributeText } from "./attributeDisplay.utils";
import { describe, expect, it } from "vitest";

describe("canonicalAttributeText", () => {
  it("collapses a lone default attribute to the bare form", () => {
    expect(canonicalAttributeText({ lemma: "gloss" }, "lemma")).toBe("|gloss");
  });
  it("names a lone non-default attribute", () => {
    expect(canonicalAttributeText({ strong: "G5485" }, "lemma")).toBe('|strong="G5485"');
  });
  it("names everything when more than one attribute, insertion order, single spaces", () => {
    expect(canonicalAttributeText({ lemma: "grace", strong: "G5485" }, "lemma")).toBe(
      '|lemma="grace" strong="G5485"',
    );
  });
  it("names a lone default when the marker has no default attribute", () => {
    expect(canonicalAttributeText({ lemma: "x" }, undefined)).toBe('|lemma="x"');
  });
  it("never displays closed and returns empty for closed-only", () => {
    expect(canonicalAttributeText({ closed: "false" })).toBe("");
    expect(canonicalAttributeText({ closed: "false", lemma: "x" }, "lemma")).toBe("|x");
  });
  it("returns empty for no attributes", () => {
    expect(canonicalAttributeText({})).toBe("");
    expect(canonicalAttributeText({ lemma: undefined }, "lemma")).toBe("");
  });
  it("keeps byte-exact values including trailing whitespace (ParatextData keeps it)", () => {
    expect(canonicalAttributeText({ lemma: "stuff " }, "lemma")).toBe("|stuff ");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx nx test shared -- attributeDisplay` — FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// libs/shared/src/nodes/usj/attributeDisplay.utils.ts
/**
 * Attribute display runs: the single place that owns HOW a node's USFM attribute bytes
 * (`|lemma="grace" strong="G5485"`, `|gloss`) are rendered as engine-owned display text and kept
 * in sync. Sibling of nestedGlyphs.utils.ts (glyph `+`) and markerSeparators.utils.ts (opener
 * separators), following the same owning-module shape.
 *
 * ## The representations (who owns what)
 *
 * - **Node state is the truth.** Char-span attributes live in `CharNode.__unknownAttributes`;
 *   milestone attributes in `MilestoneNode` props + `__unknownAttributes`. The display run is a
 *   derived cache, never a second store.
 * - **The display run** is a TextNode tagged textType "attribute" holding the canonical PT9 byte
 *   form produced by {@link canonicalAttributeText}: a lone default attribute collapses to
 *   `|value`; anything else is `|name="value" …` (double quotes, single spaces, insertion
 *   order). `closed` is derived metadata, never displayed. Char runs are bare `|…` directly
 *   before the closing glyph (PT9's shape; an NBSP prefix would flatten to a space and leak
 *   into span content on a Tier-2 rebuild). Milestone runs keep the NBSP+`|` prefix — that NBSP
 *   flattens to the space genuinely in the file (`\qt-s |sid="…"\*`).
 * - **Excluded from data paths**: textType "attribute" text never enters OT content ops or the
 *   editor→USJ conversion; the Tier-2 fragment is the one place it DOES flow, so edited bytes
 *   re-tokenize back into node state (extractAttributes / scanMilestone).
 *
 * ## Keeping the cache honest
 *
 * Builders construct the run (usj-editor.adaptor's `createChar`/`addAttributes`; transforms do
 * not run on `setEditorState`), and {@link $syncCharAttributeDisplay} — registered as a CharNode
 * transform in CharNodePlugin — re-derives it whenever a span is dirtied, healing remote collab
 * updates and structure surgery. While the collapsed caret sits inside the run the sync leaves
 * it alone (mid-edit grace); the marker-edit engine settles it on caret departure by pending
 * the edited run into its Tier-2 completion path.
 */

/** USJ artifacts that are not USFM attribute bytes and must never display. */
export const CHAR_ATTRIBUTE_EXCLUDED_KEYS: ReadonlySet<string> = new Set(["closed"]);

/**
 * The canonical PT9 byte form of an attribute set, including the leading `|` — or `""` when
 * nothing displays. A lone attribute that IS the marker's default collapses to the bare value
 * (`|gloss`); everything else is explicit `name="value"` pairs, double-quoted, single-spaced,
 * insertion order. Values are kept byte-exact (ParatextData treats trailing space as value).
 */
export function canonicalAttributeText(
  attributes: { [name: string]: string | undefined },
  defaultAttributeName?: string,
): string {
  const entries = Object.entries(attributes).filter(
    ([name, value]) => value !== undefined && !CHAR_ATTRIBUTE_EXCLUDED_KEYS.has(name),
  );
  if (entries.length === 0) return "";
  if (entries.length === 1 && entries[0][0] === defaultAttributeName) return `|${entries[0][1]}`;
  return `|${entries.map(([name, value]) => `${name}="${value}"`).join(" ")}`;
}
```

- [ ] **Step 4: Run to verify pass** — `npx nx test shared -- attributeDisplay` — PASS.
- [ ] **Step 5: Export from `libs/shared/src/nodes/usj/index.ts`, run `npx nx run-many -t lint typecheck --projects=shared`, commit** — `feat(shared): canonicalAttributeText — the one PT9 attribute serializer`.

### Task 2: default-attribute lookup exported from the tokenizer

**Files:**
- Modify: `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts` (~:344 `DEFAULT_MARKER_ATTRIBUTES`, ~:387 `milestoneDefaultAttribute`)
- Test: `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts`

**Interfaces:**
- Produces: `export function defaultMarkerAttribute(marker: string): string | undefined` — char-marker default (`w→lemma`, `rb→gloss`, `xt/jmp→link-href`, else undefined).
- Produces: `export function milestoneDefaultAttribute(name: string): string` — already exists privately (~:387); export it unchanged.

The display builders (Tasks 3, 7) and the tokenizer must share one map so display and re-parse can never disagree.

- [ ] **Step 1: Failing test** — in `usfmFragmentToUsj.test.ts` add:

```ts
import { defaultMarkerAttribute, milestoneDefaultAttribute } from "./usfmFragmentToUsj";

describe("default-attribute lookups (shared with attribute display)", () => {
  it("char defaults match PT9 ≤3.0", () => {
    expect(defaultMarkerAttribute("w")).toBe("lemma");
    expect(defaultMarkerAttribute("rb")).toBe("gloss");
    expect(defaultMarkerAttribute("xt")).toBe("link-href");
    expect(defaultMarkerAttribute("jmp")).toBe("link-href");
    expect(defaultMarkerAttribute("fig")).toBeUndefined();
    expect(defaultMarkerAttribute("nd")).toBeUndefined();
  });
  it("milestone defaults match PT9 ≤3.0", () => {
    expect(milestoneDefaultAttribute("qt1-s")).toBe("who");
    expect(milestoneDefaultAttribute("qt1-e")).toBe("eid");
    expect(milestoneDefaultAttribute("ts-s")).toBe("sid");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx nx test shared -- usfmFragmentToUsj.test` — FAIL (not exported).
- [ ] **Step 3: Implement** — add `export function defaultMarkerAttribute(marker: string): string | undefined { return DEFAULT_MARKER_ATTRIBUTES[marker]; }` next to the map; add `export` to `milestoneDefaultAttribute`. No behavior change.
- [ ] **Step 4: Run full shared suite** — `npx nx test shared` — PASS (no regressions).
- [ ] **Step 5: Commit** — `feat(shared): export default-attribute lookups for the display builders`.

### Task 3: char-span display run built by the adaptor

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` — `createChar` (:346-398), `addAttributes` (:706-720)
- Test: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`

**Interfaces:**
- Consumes: `canonicalAttributeText`, `CHAR_ATTRIBUTE_EXCLUDED_KEYS` (Task 1), `defaultMarkerAttribute` (Task 2).
- Produces: in editable mode, a char span with displayable attributes serializes children as `[opening MarkerNode, …content…, TextNode(text: canonical "|…", state textType "attribute"), closing MarkerNode]`. New helper `addCharAttributes(markerObject: MarkerObject, nodes: SerializedLexicalNode[])` in the adaptor.

Placement facts: the run goes AFTER `children.push(...childNodes)` (:374) and BEFORE the `addClosingMarker` call (:381); build it only when the closing glyph is NOT skipped (`!isClosingGlyphSkipped`, computed :379-380 — hoist the computation above the insertion point) and only in editable mode. Derive from `getUnknownAttributes(markerObject, CHAR_MARKER_OBJECT_PROPS)` — call it once, reuse for both the run and the existing :382 assignment.

- [ ] **Step 1: Failing tests** — in `usj-editor-adaptor.test.ts` (follow the file's existing serializeEditorState-based test idiom, editable viewOptions):

```ts
describe("char-span attribute display (editable mode)", () => {
  it("renders a lone default attribute collapsed, between content and closer", () => {
    // USJ: { type: "char", marker: "w", lemma: "grace", content: ["word"] } inside a para
    // Expect serialized char children: [MarkerNode \w, TextNode "⍽word", TextNode "|grace"
    // with state textType "attribute", MarkerNode \w*]
  });
  it("renders multiple attributes named, insertion order", () => {
    // { type: "char", marker: "w", lemma: "grace", strong: "G5485", content: ["word"] }
    // attribute TextNode text: '|lemma="grace" strong="G5485"'
  });
  it("renders named form for a non-default lone attribute", () => {
    // { type: "char", marker: "nd", "x-custom": "y", content: ["Lord"] } → '|x-custom="y"'
  });
  it("builds no run for closed-only unknownAttributes (footnote content chars)", () => {
    // { type: "char", marker: "ft", closed: "false", content: ["note"] } → children have NO
    // textType "attribute" node and NO closing glyph (unchanged behavior)
  });
  it("builds no run on an unclosed span", () => {
    // { type: "char", marker: "nd", closed: "false", lemma: "x", content: ["a"] } → no run
  });
  it("builds no run in visible/hidden marker modes", () => {});
});
```

Write these as real assertions against `usjEditorAdaptor.serializeEditorState` output (the existing tests in this file show how to construct USJ input and walk serialized children — mirror that idiom exactly).

- [ ] **Step 2: Run to verify failure** — `npx nx test platform -- usj-editor-adaptor` — FAIL.
- [ ] **Step 3: Implement** — in `createChar`:

```ts
const unknownAttributes = getUnknownAttributes(markerObject, CHAR_MARKER_OBJECT_PROPS);
// … existing isUnclosedChar/isClosingGlyphSkipped computation, hoisted above the children build …
addOpeningMarker(markerObject.marker ?? "", children, isNested);
children.push(...childNodes);
if (!isClosingGlyphSkipped) addCharAttributes(marker, unknownAttributes, children);
if (!isUnclosedChar) addClosingMarker(markerObject.marker ?? "", children, false, isNested);
```

```ts
/** Char-span attribute display: bare canonical `|…` directly before the closing glyph — PT9's
 * shape, and NBSP-free so Tier-2's NBSP→space flattening cannot leak a space into content. */
function addCharAttributes(
  marker: string,
  unknownAttributes: UnknownAttributes | undefined,
  nodes: SerializedLexicalNode[],
) {
  if (_viewOptions?.markerMode !== "editable" || !unknownAttributes) return;
  const text = canonicalAttributeText(unknownAttributes, defaultMarkerAttribute(marker));
  if (text) nodes.push(createText(text, "attribute"));
}
```

- [ ] **Step 4: Run to verify pass** — `npx nx test platform -- usj-editor-adaptor` — PASS.
- [ ] **Step 5: Run the whole platform suite** — `npx nx test platform` — expect corpus/lexical-state snapshot tests that pin char children to need updating: adjust ONLY expectations that now legitimately include the attribute TextNode. Investigate any other failure before touching it.
- [ ] **Step 6: Commit** — `feat(platform): char spans display their attributes in Standard view`.

### Task 4: exclusion gates keyed on textType state

**Files:**
- Modify: `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` (TextNode case, guard at :462)
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` (`isNodeAttributeText` computation ~:264)
- Test: `packages/platform/src/editor/adaptors/editor-usj-adaptor.test.ts`, `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx`

**Interfaces:**
- Consumes: char attribute runs from Task 3 (bare `|…`, no NBSP prefix — the existing `startsWith(NODE_ATTRIBUTE_PREFIX)` checks do NOT catch them).
- Produces: attribute display text (both prefixes) excluded from editor→USJ output and from OT content ops, keyed on textType `"attribute"`.

- [ ] **Step 1: Failing tests**
  - `editor-usj-adaptor.test.ts`: a char span with a displayed attribute run round-trips editor→USJ with the attributes ONLY as USJ props (from `unknownAttributes`) and the `|…` text absent from `content`.
  - `editor-delta.adaptor.test.tsx`: content ops for `\w word|gloss\w*` cover exactly `word` (plus the char item attributes) — the `|gloss` text produces no op and shifts no length (mirror the existing "canonical glyph-free contents ops" test at ~:363-376).
- [ ] **Step 2: Run to verify failure** — `npx nx test platform -- editor-usj-adaptor` and `npx nx test shared-react -- editor-delta.adaptor` — FAIL (the `|…` text leaks).
- [ ] **Step 3: Implement**
  - editor-usj.adaptor TextNode case: extend the :462 guard with a serialized-state check — skip when `serializedTextNode[NODE_STATE_KEY]?.textType === "attribute"` (import `NODE_STATE_KEY`; keep the existing prefix check).
  - editor-delta.adaptor: where `isNodeAttributeText` is computed from `text.startsWith(NODE_ATTRIBUTE_PREFIX)`, OR it with `$getState(currentNode, textTypeState) === "attribute"`.
- [ ] **Step 4: Run to verify pass**, then both full suites (`npx nx test platform`, `npx nx test shared-react`).
- [ ] **Step 5: Commit** — `feat: attribute display text excluded from save + OT by textType state`.

### Task 5: self-healing char attribute sync with mid-edit grace

**Files:**
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` (add the live-node functions)
- Modify: `libs/shared-react/src/plugins/usj/CharNodePlugin.tsx` (register the transform beside `$syncNestedGlyphs`/`$syncOpenerSeparators`)
- Test: `libs/shared-react/src/plugins/usj/CharNodePlugin.test.tsx`

**Interfaces:**
- Consumes: `canonicalAttributeText`, `defaultMarkerAttribute` (via a parameter — `shared` must not import from the converters' barrel if that creates a cycle; if it does, accept the expected text as an argument computed by callers).
- Produces:
  - `$charAttributeDisplayNode(char: CharNode): TextNode | undefined` — the direct child TextNode with textType `"attribute"`, if any.
  - `$syncCharAttributeDisplay(char: CharNode, expectedText: string): void` — heal the run to `expectedText` (insert before the closing glyph when missing; remove when `expectedText === ""`), EXCEPT while the collapsed caret sits inside the run.
  - `$hasCaretHeldAttributeRun(char: CharNode, expectedText: string): boolean` — true when the run diverges from canonical but the caret holds it (the pend signal).
  - In CharNodePlugin, a small wrapper computes `expectedText` from `char.getUnknownAttributes()` + `defaultMarkerAttribute(char.getMarker())` and calls the sync.

Grace rule (mirror `$isCaretAtOpenerBoundary`, markerSeparators.utils.ts:91-98): collapsed range selection whose anchor node is the run TextNode — or, when the run is missing entirely, whose anchor sits at the run's insertion point (the closing glyph or the last content node with the anchor at its text end). Sync must be idempotent (write only on change) so the registering transform converges.

- [ ] **Step 1: Failing tests** — in `CharNodePlugin.test.tsx` (follow its existing headless-editor idiom used for the separator sync tests):

```ts
describe("$syncCharAttributeDisplay", () => {
  it("heals a missing run from unknownAttributes", () => {});
  it("heals stale run text after unknownAttributes change (remote update)", () => {});
  it("removes the run when attributes are cleared", () => {});
  it("leaves an edited run alone while the collapsed caret is inside it", () => {});
  it("is idempotent on a canonical span", () => {});
});
```

- [ ] **Step 2: Run to verify failure** — `npx nx test shared-react -- CharNodePlugin` — FAIL.
- [ ] **Step 3: Implement** the three functions in attributeDisplay.utils.ts + the CharNodePlugin registration.
- [ ] **Step 4: Run to verify pass**, then `npx nx test shared-react` and `npx nx test shared` full.
- [ ] **Step 5: Commit** — `feat: self-healing char attribute display with mid-edit grace`.

### Task 6: pend/settle — edited attribute runs resolve through Tier-2

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts` (the :34 exemption)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (CharNode transform :165-174 — pend caret-held attribute runs beside the separator-gap pend)
- Test: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.test.tsx`, `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`

**Interfaces:**
- Consumes: `$hasCaretHeldAttributeRun` (Task 5); the existing `context.pendingKeys` + `$resolvePendingMarkers` completion path (settles pended keys on Enter/blur/caret departure).
- Produces: editing attribute-run text pends the run's TextNode key instead of being ignored; deleting/diverging a run pends the CharNode key.

- [ ] **Step 1: Failing tests**
  - Trigger test: a TextNode with textType `"attribute"` containing a `\` no longer returns untouched — it lands in `context.pendingKeys` (and is NOT immediately re-tokenized even when "terminated"-looking: attribute text legitimately contains arbitrary characters; ALL attribute-run edits wait for departure).
  - Trigger test: an attribute-run edit with no `\` also pends (the early `!text.includes("\\")` return must not skip attribute runs — divergence from canonical is what matters, not backslashes).
- [ ] **Step 2: Run to verify failure** — `npx nx test platform -- markerEditTier2Trigger` — FAIL.
- [ ] **Step 3: Implement**
  - In `$textNodeTier2Transform`: move the textType read above the `!text.includes("\\")` early-return; replace `if (textType === "attribute") return;` with `if (textType === "attribute") { context.pendingKeys.add(node.getKey()); return; }`.
  - In MarkerEditPlugin's CharNode transform, beside the separator pend: compute `expectedText` (same wrapper as Task 5) and `if (node.isAttached() && $hasCaretHeldAttributeRun(node, expectedText)) context.pendingKeys.add(node.getKey());`.
- [ ] **Step 4: Run to verify pass**, then `npx nx test platform` full (expect no other changes — sentinel gates still in place mean settles refuse for attribute spans until Task 7; the pend itself must be harmless).
- [ ] **Step 5: Commit** — `feat(platform): attribute-run edits pend into the Tier-2 completion path`.

### Task 7: de-sentinel char spans — the lossless loop closes

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` — delete `hasByteAttributes` (:161-165), its use in `isRebuildSentinel` (:172) and in `$appendNodesFragment` (:263)
- Test: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`

**Interfaces:**
- Consumes: char display runs (Task 3 — rebuild materialization goes through the same adaptor, so rebuilt spans get runs automatically), tokenizer `extractAttributes` (existing), exclusion gates (Task 4), pend/settle (Task 6).
- Produces: attribute-bearing char spans re-tokenize; `isRebuildSentinel`'s char branch keeps ONLY the unknown-marker guard (`getMarkerFn(node.getMarker()) === undefined`).

- [ ] **Step 1: Failing tests** — in `tier2Rebuild.utils.test.tsx` (follow its existing rebuild-harness idiom):

```ts
describe("attribute-bearing char spans re-tokenize", () => {
  it("no-edit rebuild of `\\w x|lemma=\"y\"\\w*` is a fixed point", () => {});
  it("no-edit rebuild of the nested zzz6 shape `\\wj \\+w dsa|stuff\\+w*` is a fixed point", () => {});
  it("editing a nested closer glyph inside an attribute span settles (deferred finding 2)", () => {});
  it("`|lemma=\"gloss\"` settles to `|gloss` on rebuild (PT9 settle-time simplification)", () => {});
  it("deleting the whole run settles to a span with no attributes", () => {});
  it("malformed attribute text settles to literal span content (no default: `\\nd a|x=\\nd*`)", () => {});
  it("`|gloss` typed before `\\nd*` stays literal content; before `\\w*` becomes lemma", () => {});
});
```

- [ ] **Step 2: Run to verify failure** — `npx nx test platform -- tier2Rebuild` — the fixed-point tests FAIL while the sentinel gates still preserve spans (rebuild refuses / structure kept atomic).
- [ ] **Step 3: Implement** — delete `hasByteAttributes` and both gates; char branch of `$appendNodesFragment` becomes: unknown-marker → `pushSentinel`, else `$appendChildrenFragment`. Update the doc comments that describe the deleted classification.
- [ ] **Step 4: Run to verify pass** — all new tests PASS; run `npx nx test platform` full. The signature helpers need no change (both sides of the fixed-point comparison walk real node trees containing the run), but if `$appendSignature` special-cases surface, fix them here.
- [ ] **Step 5: Commit** — `feat(platform): attribute char spans re-tokenize — sentinel classification removed`.

### Task 8: milestone display completes; milestones de-sentinel; edit-loss bug dies

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` — `addAttributes` (:706-720)
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` — milestone branch of `isRebuildSentinel` (:169) and `$appendNodesFragment` (:251-254)
- Test: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`, `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`

**Interfaces:**
- Consumes: `canonicalAttributeText`, `milestoneDefaultAttribute` (Task 2). Milestone USJ props: `sid`, `eid` explicit; everything else (chiefly `who`) in `unknownAttributes`.
- Produces: `addAttributes` emits the FULL milestone set: `canonicalAttributeText({ ...sid&&{sid}, ...eid&&{eid}, ...unknownAttributes }, milestoneDefaultAttribute(marker))`, prefixed with NBSP (replace `NODE_ATTRIBUTE_PREFIX + attributes.join(" ")` with `NBSP + canonical`). Both editable and visible branches keep working (visible shows the same completed text — completing incomplete display is a fix, not a mode change). De-sentinel rule: a milestone re-tokenizes iff `getMarkerFn(marker)` classifies it as a milestone type; otherwise (heuristic-gap names like bare `ts`) it stays a sentinel.

- [ ] **Step 1: Failing tests**
  - Adaptor: `\qt-s` with `who` in unknownAttributes displays `⍽|who="Jesus"` (collapse: `who` alone on a `qt*-s` is the default → `⍽|Jesus`); with `sid`+`who` displays `⍽|sid="x" who="Jesus"` (named, insertion order `sid` first).
  - tier2Rebuild: no-edit rebuild of a paragraph containing `\qt-s |sid="x"\*` is a fixed point; editing the run's `sid` value settles into the MilestoneNode's serialized USJ (THE edit-loss regression: assert the post-settle editor→USJ output carries the new sid); a milestone whose marker `getMarkerFn` cannot classify stays atomic.
- [ ] **Step 2: Run to verify failure** — both test files FAIL.
- [ ] **Step 3: Implement** — rewrite `addAttributes`; change the milestone branches: `isRebuildSentinel` milestone case → `return getMarkerFn(node.getMarker() ?? "")?.type !== MarkerType.Milestone;` (match the tokenizer's classification; check the exact `MarkerType` import the file already uses for chars); `$appendNodesFragment` milestone case → when re-tokenizable, `pushText` each display-run node's fragment text (opening glyph, attribute TextNode, `\*` closer — reuse `$milestoneDisplayRun` to collect them and keep the existing sibling-skip bookkeeping), else `pushSentinel` as today.
- [ ] **Step 4: Run to verify pass**; full `npx nx test platform` + `npx nx test shared-react` (milestone display text changes may touch collab/corpus expectations — update only legitimately-changed pins).
- [ ] **Step 5: Commit** — `feat(platform): milestones display full attributes and re-tokenize; attribute edits persist`.

### Task 9: corpus losslessness property test

**Files:**
- Create: `packages/platform/src/editor/markerEdit/tier2Rebuild.corpus.test.tsx`

**Interfaces:**
- Consumes: the 2SA corpus (`libs/test-data/src/data/2sa.usj.ts` — see how `generate-2sa-lexical-states.test.ts` and `usfmFragmentToUsj.corpus.test.ts` load it), `$buildParaFragment`/`$rebuildParas` internals via the same harness `tier2Rebuild.utils.test.tsx` uses.

- [ ] **Step 1: Write the property test** — for every paragraph in the corpus USJ loaded in editable mode: run the Tier-2 rebuild request on it unedited and assert it refuses as a fixed point (no structural change, no content change in the editor→USJ round-trip). This is the cross-cutting pin: display bytes re-tokenize to identical USJ for every real-data paragraph, attribute-bearing or not.
- [ ] **Step 2: Run** — `npx nx test platform -- tier2Rebuild.corpus` — investigate EVERY failing paragraph: each is either a legitimate bug in Tasks 3-8 (fix it there) or a pre-existing non-fixed-point documented by the nesting arc (skip-list it with a comment naming why). No blind skips.
- [ ] **Step 3: Commit** — `test(platform): corpus losslessness property pin for Tier-2 display bytes`.

**Phase 1 exit criteria:** all Phase-1 commits green on `npx nx run-many -t test,lint,typecheck --projects=shared,shared-react,platform`; the zzz6 scenario test passes; milestone edit-loss regression test passes.

---

## Phase 2 — verses

### Task 10: verse `\va`/`\vp` display runs

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` — `createVerse` (:314-344) and the `recurseNodes` verse case (assembly point)
- Modify: `libs/shared/src/nodes/usj/attributeDisplay.utils.ts` — `$syncVerseAttributeDisplay(verse: VerseNode, altnumber: string | undefined, pubnumber: string | undefined): void` + a caret-held reporter, same shape as Task 5
- Modify: the plugin that registers VerseNode transforms (follow where `$verseNodeTransform` is registered — MarkerEditPlugin.tsx:153-156 — and register the sync in the same style as CharNodePlugin does for chars; if a dedicated VerseNode plugin exists in shared-react, use it)
- Test: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`, `libs/shared-react` or platform transform tests per registration site

**Interfaces:**
- Produces: in editable mode a verse with `altnumber`/`pubnumber` is followed by sibling runs, PT9's shape and order: `MarkerNode("\va ", opening)` + `TextNode(value, textType "attribute")` + `MarkerNode("\va*", closing)`, then the `\vp` triplet. Exact glyph text must match what the tokenizer's `attrCapture` fold parses back (`ATTRIBUTE_MARKERS` :311-319, fold :732-763) — write the test FROM the tokenizer's accepted byte form (`\va 1\va*`), not from guessed spacing.
- Consumes: exclusion gates (Task 4 — value nodes are textType `"attribute"`; MarkerNodes already excluded), pend/settle (Task 6 — value-node edits pend via the same textType branch).

- [ ] **Step 1: Failing adaptor tests** — verse `{ number: "1", altnumber: "2", pubnumber: "1b" }` serializes with the two runs after the verse node; plain verses serialize unchanged; visible/hidden modes unchanged.
- [ ] **Step 2: Run to verify failure**, **Step 3: Implement** (adaptor assembly + sync + registration), **Step 4: Run to verify pass + full suites**, **Step 5: Commit** — `feat(platform): verses display \va/\vp in Standard view`.

### Task 11: verses stop being sentinels; sid carry-over

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` — `verseNeedsSentinel` (:147-151), `$appendNodesFragment` verse handling, and a sid carry-over step in `$rebuildParas` (after :578 `insertBefore` splice, before selection restore)
- Test: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`

**Interfaces:**
- Produces: `verseNeedsSentinel` returns `Boolean(node.getUnknownAttributes())` only. `$appendNodesFragment` pushes the verse's own glyph text plus its display-run siblings' bytes into the fragment (mirror the milestone run handling from Task 8; `\va`/`\vp` bytes flow so `attrCapture` re-folds them). Sid carry-over in `$rebuildParas`: walk old-paragraph VerseNodes and new-tree VerseNodes in document order; where numbers match pairwise, `newVerse.setSid(oldVerse.getSid())`; a number the user changed gets no sid.

- [ ] **Step 1: Failing tests**

```ts
describe("verses re-tokenize", () => {
  it("no-edit rebuild of a paragraph with `\\v 1 \\va 2\\va*` is a fixed point", () => {});
  it("sid-bearing verses rebuild (no longer sentinels) and keep their sid when number unchanged", () => {});
  it("an edited verse number drops the stale sid", () => {});
  it("editing a \\va value settles into the verse's altnumber", () => {});
  it("a verse with arbitrary unknownAttributes stays atomic", () => {});
});
```

- [ ] **Step 2: Run to verify failure**, **Step 3: Implement**, **Step 4: Run to verify pass + full platform suite + re-run Task 9's corpus property test** (sid-bearing corpus verses now rebuild — the corpus pin is the safety net for this exact change), **Step 5: Commit** — `feat(platform): verses re-tokenize with sid carry-over; sentinel reduced to unknownAttributes`.

---

## Phase 3 — UnknownNode read-only full-USFM display

### Task 12: generic unknown-USJ→USFM byte renderer

**Files:**
- Create: `libs/shared/src/nodes/features/unknownUsfm.utils.ts`
- Create: `libs/shared/src/nodes/features/unknownUsfm.utils.test.ts`

**Interfaces:**
- Consumes: `canonicalAttributeText` (Task 1). USJ shapes arrive as the UnknownNode's stored `tag` (USJ `type`), `marker`, `unknownAttributes`.
- Produces: `unknownDisplayParts(tag: string, marker: string | undefined, unknownAttributes: { [name: string]: string | undefined } | undefined): { opening: string; attributes: string; closing: string }` — pure function returning the byte strings to render around the node's existing content children. Rules:
  - Generic: opening `\{marker} `, attributes via `canonicalAttributeText` (no default-attribute collapse for unknown kinds — always named), closing `\{marker}*`.
  - `optbreak` → `{ opening: "", attributes: "", closing: "" }` is WRONG — it renders as the literal text `//` with no marker glyphs: `{ opening: "//", attributes: "", closing: "" }`.
  - `figure` → attribute name `file` renders as `src` (USX→USFM name reversal); closing `\fig*`.
  - `table:row` → opening `\tr `, no closer. `table:cell` → opening from the cell's marker (`\tc1 `, `\th2 ` — the marker prop carries it), no closer. `table` (the container) → no bytes of its own.
  - `sidebar` → opening `\esb`, closing `\esbe`; a `category` attribute renders as `\cat value\cat*` after the opening, not as `|category="…"`.
  - `periph` → `textContentAttribute` semantics: the `alt` value renders as text content after the marker (`\periph Title`), remaining attributes (`id`) as `|id="…"`.
  - `ref` → all-empty parts (generated wrapper; no USFM bytes — content text renders as-is).

- [ ] **Step 1: Failing tests** — table-driven over exactly the cases above, each asserting the three parts.
- [ ] **Step 2: Run to verify failure** — `npx nx test shared -- unknownUsfm` — FAIL. **Step 3: Implement.** **Step 4: Run to verify pass.** **Step 5: Commit** — `feat(shared): generic unknown-node USFM byte renderer`.

### Task 13: UnknownNode renders and copies its USFM

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` — `createUnknown` (:585-607)
- Modify: `libs/shared/src/nodes/features/UnknownNode.ts` (only if the display children need node-level accommodation — prefer none)
- Modify: `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` — `createUnknownMarker` path must ignore the display children (the ImmutableTypedTextNode case at :431-436 already does if display children are ImmutableTypedTextNodes — verify)
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.ts` — `$handleUnknownNodes` (:342-359): display children must not enter the unknown embed's `contents.ops`
- Test: `packages/platform/src/editor/adaptors/editor-usj-adaptor.test.ts`, `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx`, plus a clipboard test in the suite that exercises `$handleCopyForStandardView` (see MarkerEditPlugin.tsx:216-219 for where copy is handled and its existing tests for the idiom)

**Interfaces:**
- Consumes: `unknownDisplayParts` (Task 12).
- Produces: `createUnknown` builds, in editable mode: `ImmutableTypedTextNode("marker", opening)` + `ImmutableTypedTextNode("attribute", attributes)` (when non-empty) + existing content children + `ImmutableTypedTextNode("marker", closing)` (when non-empty). ImmutableTypedTextNode is chosen because it is already excluded from editor→USJ (:431-436), already styled via `.marker`/`.attribute`, and read-only — matching "selectable/copyable but not editable".

- [ ] **Step 1: Failing tests** — figure/table-row/sidebar/periph USJ → serialized UnknownNode children start with the marker ImmutableTypedTextNode and include the attribute text; editor→USJ round-trip is unchanged (display children ignored); delta contents ops for an unknown embed contain only content text; Standard-view copy of a range spanning a figure yields `\fig …|src="…" …\fig*` exactly.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** (`createUnknown` + the delta-adaptor skip — extend `$handleTextNodes`/embed-contents filtering to skip ImmutableTypedTextNodes inside unknown embeds if not already generic). **Step 4: Run to verify pass + full platform/shared-react suites.** Also verify the optbreak CSS `//` pseudo-element rule (UnknownNode.ts:32-47) is removed in favor of the real `//` text so it doesn't double-render. **Step 5: Commit** — `feat: UnknownNodes display their full USFM read-only, selectable and copyable`.

### Task 14: end-to-end verification sweep

**Files:**
- Modify (if needed): `e2e-tests/` in paranext-core — follow the existing isolated-runner suites (`npm run test:e2e:isolated <subset>` in paranext-core; see memory: dev loop needs the yalc+DLL rebuild to pick up scripture-editors changes)
- No scripture-editors source changes in this task.

- [ ] **Step 1:** Build/link the updated editor into paranext-core per the standard-view dev loop (yalc push + DLL rebuild).
- [ ] **Step 2:** E2E assertions (add to the closest existing standard-view suite): (a) zzz6 GEN 1 `\wj \+w dsa|stuff\+w*` — the `|stuff` run is visible; editing the nested closer settles on caret departure; (b) typing `|lemma="gloss"` before `\w*` settles to `|gloss` on departure; (c) Simple view of the same chapter shows no attribute bytes.
- [ ] **Step 3:** Run the subset; fix regressions found (root-cause first — no test-side patches for product bugs).
- [ ] **Step 4:** Full repo gates in scripture-editors: `npx nx run-many -t test,lint,typecheck --projects=shared,shared-react,platform`. Commit — `test(e2e): attribute display + settle scenarios in Standard view`.

---

## Self-review notes (already applied)

- Spec §4.2 char-run placement, §4.5 pend/settle, §4.6 sentinel rules, §5 milestone completion, §6 verse design incl. sid carry-over, §7 UnknownNode generic renderer + copy requirement, §9 test strategy items 1-8 → covered by Tasks 1-14 (spec §9 item 8's Simple-view pin lives in Task 14).
- Type consistency: `canonicalAttributeText(attributes, defaultAttributeName?)` used identically in Tasks 1, 3, 8, 12; `$hasCaretHeldAttributeRun(char, expectedText)` in Tasks 5, 6; `unknownDisplayParts(tag, marker, unknownAttributes)` in Tasks 12, 13.
- Known judgment points left to the implementer WITH their acceptance tests: the exact grace-boundary predicate (Task 5, mirror markerSeparators), the delta-adaptor skip mechanics (Task 13), corpus skip-list justifications (Task 9).
