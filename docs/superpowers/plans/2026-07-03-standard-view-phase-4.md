# Standard View Phase 4 — Project StyleInfo Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static marker table with the project's own StyleInfo (usfm.sty + custom.sty merged by ParatextData) so marker classification, Tier-1 kind routing, validation highlighting, and per-marker CSS reflect the actual project — with PT9 UX/visual parity.

**Architecture:** A `StyleInfo` data object flows host → `EditorOptions.styleInfo` → a memoized `MarkerLookup` threaded through `MarkerEditContext`/tokenizer options (no module singleton). A new `MarkerValidationPlugin` runs a PT9-`ValidateUsxStyles`-shaped full-document pass and decorates marker glyph DOM elements with `status_unknown`/`status_invalid` classes (plugin-held derived state, nothing in the document). A `generateUsjCss` function ports PT9 `CSSCreator.CreateUsfmCss`. On the paranext side, a new C# `getStyleInfo(bookNum)` PDP function serializes the merged `ScrStylesheet`.

**Tech Stack:** TypeScript, Lexical 0.33, Nx/Vitest (scripture-editors); C# ParatextData + papi d.ts + React web view (paranext-core worktree).

**Spec:** `docs/superpowers/specs/2026-07-03-standard-view-phase4-styleinfo-design.md` (commit `d0c52f3`). PT9 reference source (READ-ONLY): `/home/lyonsm/Paratext`.

## Global Constraints

- Library repo: `/home/lyonsm/scripture-editors`, branch `standard-view`. Extension repo: worktree `/home/lyonsm/paranext-core-standard-view`, branch `standard-view`. NEVER edit `/home/lyonsm/paranext-core` (main checkout); NEVER commit to any `main`; NEVER push or open PRs without explicit user approval.
- ALL Nx gates run with `--skip-nx-cache`. Prefix nx with `volta run pnpm` (e.g. `volta run pnpm nx test shared --skip-nx-cache`).
- Prefer `undefined` over `null`. Lint bans non-null assertions (`!`) and raw NBSP characters in regex (write ` `).
- Every commit message ends EXACTLY with these two lines:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KCoAtgDet1c24JGSekhmVn
  ```
- `docs/superpowers/` and `.superpowers/` are gitignored — stage files there with `git add -f` (`.superpowers/sdd/progress.md` is already tracked).
- `packages/platform/src/editor/Editor.tsx` plugin children are ordered alphabetically by component name within the alphabetical block (see CLAUDE.md).
- Run `nx extract-api` for a package after changing its public API; commit the updated api report.
- Runtime propagation to Platform.Bible follows `docs/superpowers/2026-07-03-paranext-propagation-blocker.md`: build platform → `devpub` → in the worktree `npm stop` → `npm run build:extensions` (fresh build; `--watch` won't pick up a yalc swap) → `refresh.sh`. Verify by editor STATE (`root.__lexicalEditor.getEditorState().toJSON()`), NOT the collapsed main-editor DOM.
- Test-building Lexical trees: chain `.append(...)` inside `$getRoot().append(...)`; construct nodes via `$create<X>Node` helpers (see CLAUDE.md Code Style).

## File Structure (what changes where)

**Part A — scripture-editors:**

| File | Role |
| --- | --- |
| `libs/shared/src/utils/usfm/styleInfo.ts` (new) | `StyleInfo`/`MarkerStyleInfo`/`StyleType`/`MarkerLookup` types + `createMarkerLookup` |
| `libs/shared/src/utils/usfm/usfmTypes.ts` (edit) | `MarkerType` gains `Milestone` |
| `libs/shared/src/utils/usfm/defaultStyleInfo.ts` (generated) | Rich bundled default StyleInfo from vendored usfm.sty |
| `tools/usfm-markers/src/generators/markers-data/*` (edit) | Parser keeps validation/style fields; emits `defaultStyleInfo.ts`; reads vendored sty |
| `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts` (edit) | Stylesheet-first classification; PT9 unknown handling; unmatched-closer nodes |
| `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts` (edit) | `Tier2Context` (adds `getMarker`); lookup threading; relaxed unknown-para guard |
| `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (edit) | `MarkerEditContext extends Tier2Context`; stylesheet-first kind guards |
| `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (edit) | `getMarker` prop → context |
| `packages/platform/src/editor/markerEdit/markerValidation.utils.ts` (new) | `$validateDocument` (TagValidator port + char/verse occursUnder checks) |
| `packages/platform/src/editor/markerEdit/MarkerValidationPlugin.tsx` (new) | Decoration pass: update listener + `getElementByKey` class toggling |
| `packages/platform/src/editor/generateUsjCss.ts` (new) | PT9 CSSCreator port |
| `packages/platform/src/editor/editor.model.ts` + `Editor.tsx` + `src/index.ts` (edit) | `EditorOptions.styleInfo`; lookup memo; plugin mount; exports |
| `packages/platform/src/usj-nodes.css` (edit) | `.status_unknown`/`.status_invalid` rules |

**Part B — paranext-core-standard-view:**

| File | Role |
| --- | --- |
| `c-sharp/JsonUtils/PlatformStyleInfo.cs` (new) | DTO wrappers (`PlatformStyleInfo`, `PlatformMarkerStyleInfo`) |
| `c-sharp/Projects/ParatextProjectDataProvider.cs` (edit) | `GetStyleInfo(bookNum)` + registration |
| `c-sharp/Projects/ProjectInterfaces.cs` + `LocalParatextProjects.cs` (edit) | `platformScripture.StyleInfo` interface |
| `c-sharp-tests/Projects/ParatextProjectDataProviderStyleInfoTests.cs` (new) | C# tests |
| `extensions/src/platform-scripture/src/types/platform-scripture.d.ts` (edit) | `StyleInfo` types + PDP interface + papi registration |
| `extensions/src/platform-scripture-editor/src/use-project-stylesheet.hook.ts` (new) | `generateUsjCss` → `useStylesheet` |
| `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx` (edit) | StyleInfo subscription → `options.styleInfo` + CSS hook |

---

### Task 1: StyleInfo types, `MarkerType.Milestone`, and `createMarkerLookup` (shared)

**Files:**
- Create: `libs/shared/src/utils/usfm/styleInfo.ts`
- Modify: `libs/shared/src/utils/usfm/usfmTypes.ts` (add enum member)
- Modify: `tools/usfm-markers/src/generators/markers-data/files/src/usfmTypes.ts.template` (keep template in sync)
- Modify: `libs/shared/src/utils/usfm/index.ts` (exports)
- Test: `libs/shared/src/utils/usfm/styleInfo.test.ts`

**Interfaces:**
- Consumes: existing `getMarker` (default export of `./getMarker.js`), `usfmMarkers`, `CategoryType`/`Marker`/`MarkerType` from `./usfmTypes.js`.
- Produces (used by every later task):
  - `type StyleType = "paragraph" | "character" | "note" | "milestone"`
  - `interface MarkerStyleInfo { marker: string; styleType: StyleType; endMarker?: string; occursUnder?: string[]; rank?: number; textType?: string; textProperties?: string[]; notRepeatable?: boolean; description?: string; fontName?: string; fontSize?: number; bold?: boolean; italic?: boolean; underline?: boolean; smallCaps?: boolean; subscript?: boolean; superscript?: boolean; color?: string; justification?: "left" | "center" | "right" | "both"; firstLineIndent?: number; leftMargin?: number; rightMargin?: number; spaceBefore?: number; spaceAfter?: number; lineSpacing?: number }`
  - `interface StyleInfo { defaultFont?: string; defaultFontSize?: number; markers: { [marker: string]: MarkerStyleInfo } }`
  - `type MarkerLookup = (marker: string) => Marker | undefined`
  - `function createMarkerLookup(styleInfo?: StyleInfo): MarkerLookup`
  - `MarkerType.Milestone` enum member.

- [ ] **Step 1: Write the failing test**

`libs/shared/src/utils/usfm/styleInfo.test.ts`:

```ts
import getMarker from "./getMarker";
import { createMarkerLookup, StyleInfo } from "./styleInfo";
import { CategoryType, MarkerType } from "./usfmTypes";
import { describe, expect, it } from "vitest";

const projectStyleInfo: StyleInfo = {
  defaultFont: "Charis SIL",
  defaultFontSize: 12,
  markers: {
    p: { marker: "p", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    zln: {
      marker: "zln",
      styleType: "character",
      endMarker: "zln*",
      description: "Custom link",
    },
    "qt1-s": { marker: "qt1-s", styleType: "milestone", endMarker: "qt1-e" },
    f: { marker: "f", styleType: "note", endMarker: "f*" },
  },
};

describe("createMarkerLookup", () => {
  it("returns the bundled getMarker when no styleInfo is given", () => {
    expect(createMarkerLookup(undefined)).toBe(getMarker);
  });

  it("classifies by project styleType, not the bundled table", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.type).toBe(MarkerType.Paragraph);
    expect(lookup("zln")?.type).toBe(MarkerType.Character);
    expect(lookup("zln")?.hasEndMarker).toBe(true);
    expect(lookup("qt1-s")?.type).toBe(MarkerType.Milestone);
    expect(lookup("f")?.type).toBe(MarkerType.Note);
  });

  it("returns undefined for markers absent from the project sheet (sheet is authoritative)", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    // `s1` exists in the bundled table but not in this project sheet.
    expect(lookup("s1")).toBeUndefined();
  });

  it("takes category from the bundled table when known, else Uncategorized", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.category).toBe(CategoryType.Paragraphs);
    expect(lookup("zln")?.category).toBe(CategoryType.Uncategorized);
  });

  it("defaults description to empty string", () => {
    const lookup = createMarkerLookup(projectStyleInfo);
    expect(lookup("p")?.description).toBe("");
    expect(lookup("zln")?.description).toBe("Custom link");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/utils/usfm/styleInfo.test.ts`
Expected: FAIL — cannot resolve `./styleInfo`.

- [ ] **Step 3: Add `Milestone` to `MarkerType` (generated file + template, kept in sync)**

In `libs/shared/src/utils/usfm/usfmTypes.ts` AND `tools/usfm-markers/src/generators/markers-data/files/src/usfmTypes.ts.template`, change:

```ts
export enum MarkerType {
  Paragraph = "Paragraph",
  Character = "Character",
  Note = "Note",
  Milestone = "Milestone",
  Unknown = "Unknown",
}
```

- [ ] **Step 4: Write `styleInfo.ts`**

`libs/shared/src/utils/usfm/styleInfo.ts`:

```ts
/**
 * Project StyleInfo — the host-agnostic shape of a Paratext project's merged
 * stylesheet (usfm.sty + custom.sty), per design spec
 * docs/superpowers/specs/2026-07-03-standard-view-phase4-styleinfo-design.md.
 *
 * Unit conventions (match usfm.sty as parsed, not PT9's internal ints):
 * - fontSize, spaceBefore, spaceAfter: points
 * - firstLineIndent, leftMargin, rightMargin: inches (PT9 ScrTag stores
 *   thousandths of an inch; hosts divide by 1000 when serializing)
 * - color: "#RRGGBB", omitted when black (PT9 CSSCreator skips black)
 * - lineSpacing: PT9 quirk — 1 renders as line-height 1.5, 2 as 2, else nothing
 */
import getMarker from "./getMarker.js";
import { usfmMarkers } from "./usfmMarkers.js";
import { CategoryType, Marker, MarkerType } from "./usfmTypes.js";

export type StyleType = "paragraph" | "character" | "note" | "milestone";

export interface MarkerStyleInfo {
  marker: string;
  styleType: StyleType;
  endMarker?: string;
  /** Allowed parent markers; absent/empty = valid anywhere (PT9 semantics). */
  occursUnder?: string[];
  rank?: number;
  textType?: string;
  textProperties?: string[];
  notRepeatable?: boolean;
  description?: string;
  fontName?: string;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  smallCaps?: boolean;
  subscript?: boolean;
  superscript?: boolean;
  color?: string;
  justification?: "left" | "center" | "right" | "both";
  firstLineIndent?: number;
  leftMargin?: number;
  rightMargin?: number;
  spaceBefore?: number;
  spaceAfter?: number;
  lineSpacing?: number;
}

export interface StyleInfo {
  /** Project default font/size (ScrText settings) — drives the base CSS rule like PT9. */
  defaultFont?: string;
  defaultFontSize?: number;
  markers: { [marker: string]: MarkerStyleInfo };
}

/** The `getMarker` seam shape (design spec: signature preserved). */
export type MarkerLookup = (marker: string) => Marker | undefined;

const STYLE_TYPE_TO_MARKER_TYPE: { [K in StyleType]: MarkerType } = {
  paragraph: MarkerType.Paragraph,
  character: MarkerType.Character,
  note: MarkerType.Note,
  milestone: MarkerType.Milestone,
};

/**
 * StyleInfo-backed replacement for the bundled `getMarker`. With `styleInfo`,
 * the project sheet is authoritative: markers absent from it return
 * `undefined` (PT9: unknown to the stylesheet), and `usfmMarkersOverwrites`
 * never applies. Without `styleInfo`, the bundled `getMarker` (table +
 * overwrites) is returned unchanged so non-project consumers keep today's
 * behavior exactly.
 */
export function createMarkerLookup(styleInfo?: StyleInfo): MarkerLookup {
  if (!styleInfo) return getMarker;
  const cache = new Map<string, Marker | undefined>();
  return (marker: string): Marker | undefined => {
    if (cache.has(marker)) return cache.get(marker);
    const entry = styleInfo.markers[marker];
    const result: Marker | undefined = entry
      ? {
          category: usfmMarkers[marker]?.category ?? CategoryType.Uncategorized,
          type: STYLE_TYPE_TO_MARKER_TYPE[entry.styleType] ?? MarkerType.Unknown,
          description: entry.description ?? "",
          hasEndMarker: Boolean(entry.endMarker),
        }
      : undefined;
    cache.set(marker, result);
    return result;
  };
}
```

Add to `libs/shared/src/utils/usfm/index.ts` (after the `getMarker` line):

```ts
export * from "./styleInfo.js";
```

- [ ] **Step 5: Run test to verify it passes**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/utils/usfm/styleInfo.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Gates for the touched project**

Run: `volta run pnpm nx test shared --skip-nx-cache && volta run pnpm nx typecheck shared --skip-nx-cache && volta run pnpm nx lint shared --skip-nx-cache`
Expected: all green (the `MarkerType.Milestone` addition is additive; no existing switch is exhaustive over it — if typecheck flags one, add the `Milestone` case mirroring the `Unknown` case).

- [ ] **Step 7: Commit**

```bash
git add libs/shared/src/utils/usfm/styleInfo.ts libs/shared/src/utils/usfm/styleInfo.test.ts libs/shared/src/utils/usfm/usfmTypes.ts libs/shared/src/utils/usfm/index.ts tools/usfm-markers/src/generators/markers-data/files/src/usfmTypes.ts.template
git commit -m "feat(shared): StyleInfo types, MarkerType.Milestone, createMarkerLookup seam"
```
(Append the standard trailer from Global Constraints.)

---

### Task 2: Vendored usfm.sty + rich `defaultStyleInfo` generation

**Files:**
- Create: `tools/usfm-markers/src/generators/markers-data/data/usfm.sty` (vendored snapshot)
- Create: `tools/usfm-markers/src/generators/markers-data/files/src/defaultStyleInfo.ts.template`
- Modify: `tools/usfm-markers/src/generators/markers-data/utils/generateMarkersDictionary.ts` (parse Fontname/LineSpacing/Subscript/NotRepeatable; `StyleType.Milestone`)
- Modify: `tools/usfm-markers/src/generators/markers-data/generator.ts` (local-file input; styleInfo emission)
- Generated: `libs/shared/src/utils/usfm/defaultStyleInfo.ts`
- Modify: `libs/shared/src/utils/usfm/index.ts` (export)
- Test: `libs/shared/src/utils/usfm/defaultStyleInfo.test.ts`

**Interfaces:**
- Consumes: `StyleInfo` type from Task 1.
- Produces: `defaultStyleInfo: StyleInfo` exported from `shared` — the validation/CSS fallback for hosts without a project StyleInfo. Includes ALL stylesheet markers (no category exclusion — the simplified `usfmMarkers` table's exclusions were a PERF-menu decision, not a classification one).

- [ ] **Step 1: Vendor the stylesheet**

```bash
curl -fsSL https://raw.githubusercontent.com/ubsicap/usfm/refs/heads/master/sty/usfm.sty -o tools/usfm-markers/src/generators/markers-data/data/usfm.sty
grep -c "\\\\Marker " tools/usfm-markers/src/generators/markers-data/data/usfm.sty
```
Expected: file created; marker count > 200.

- [ ] **Step 2: Write the failing test**

`libs/shared/src/utils/usfm/defaultStyleInfo.test.ts`:

```ts
import { defaultStyleInfo } from "./defaultStyleInfo";
import { describe, expect, it } from "vitest";

describe("defaultStyleInfo (generated from vendored usfm.sty)", () => {
  it("classifies core markers", () => {
    expect(defaultStyleInfo.markers.p?.styleType).toBe("paragraph");
    expect(defaultStyleInfo.markers.nd?.styleType).toBe("character");
    expect(defaultStyleInfo.markers.f?.styleType).toBe("note");
    expect(defaultStyleInfo.markers.f?.endMarker).toBe("f*");
  });

  it("includes previously-excluded categories (Tables, SpecialFeatures)", () => {
    expect(defaultStyleInfo.markers.tr?.styleType).toBe("paragraph");
    expect(defaultStyleInfo.markers.w?.styleType).toBe("character");
  });

  it("includes milestones", () => {
    const milestones = Object.values(defaultStyleInfo.markers).filter(
      (entry) => entry.styleType === "milestone",
    );
    expect(milestones.length).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers["qt1-s"]?.styleType).toBe("milestone");
  });

  it("carries validation fields", () => {
    expect(defaultStyleInfo.markers.p?.occursUnder).toContain("c");
    expect(defaultStyleInfo.markers.ft?.occursUnder).toContain("f");
    expect(defaultStyleInfo.markers.s1?.rank).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers.v?.occursUnder).toContain("p");
  });

  it("carries presentation fields with .sty units", () => {
    // \q1 has a hanging indent: positive left margin, negative-ish or smaller first-line.
    expect(defaultStyleInfo.markers.q1?.leftMargin).toBeGreaterThan(0);
    expect(defaultStyleInfo.markers.s1?.bold).toBe(true);
    // \v is superscript in the default sheet.
    expect(defaultStyleInfo.markers.v?.superscript).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/utils/usfm/defaultStyleInfo.test.ts`
Expected: FAIL — cannot resolve `./defaultStyleInfo`.

- [ ] **Step 4: Extend the .sty parser**

In `tools/usfm-markers/src/generators/markers-data/utils/generateMarkersDictionary.ts`:

1. Add to `StyleType`:
```ts
export enum StyleType {
  Paragraph = "Paragraph",
  Character = "Character",
  Note = "Note",
  Milestone = "Milestone",
}
```
2. Extend the per-marker shape (`MarkersDictionary[string]`): add `notRepeatable?: boolean;` at top level and `fontName?: string; lineSpacing?: number; subscript?: boolean;` inside `styles`.
3. Add switch cases beside the existing ones:
```ts
        case "Fontname":
          currentMarkerData.styles.fontName = value;
          break;
        case "LineSpacing":
          currentMarkerData.styles.lineSpacing = parseInt(value);
          break;
        case "Subscript":
          currentMarkerData.styles.subscript = true;
          break;
        case "NotRepeatable":
          currentMarkerData.notRepeatable = true;
          break;
```

- [ ] **Step 5: Add the styleInfo emission to the generator**

Create `tools/usfm-markers/src/generators/markers-data/files/src/defaultStyleInfo.ts.template`:

```
/** Generated file using `nx generate markers-data` with '<%- usfmStyleUrl %>' */

import { StyleInfo } from "./styleInfo.js";

export const defaultStyleInfo: StyleInfo = <%- styleInfoJson %>;
```

In `generator.ts`, replace the axios fetch with URL-or-file input, and build the styleInfo JSON. Full new body of `markersDataGenerator` (keep imports; add `import { StyleType } from "./utils/generateMarkersDictionary";`):

```ts
export async function markersDataGenerator(tree: Tree, options: MarkersDataGeneratorSchema) {
  const projectRoot = options.outputPath;

  // URL (legacy) or workspace-relative file path (vendored snapshot — deterministic regeneration).
  let usfmStyleContent: string;
  if (options.usfmStyleUrl.startsWith("http")) {
    const response = await axios.get(options.usfmStyleUrl);
    usfmStyleContent = response.data;
  } else {
    const buffer = tree.read(options.usfmStyleUrl);
    if (!buffer) throw new Error(`Cannot read stylesheet file: ${options.usfmStyleUrl}`);
    usfmStyleContent = buffer.toString();
  }

  const markersDictionary = createMarkersDictionaryFromUsfmSty(usfmStyleContent);
  const simplifiedDictionary = simplifyMarkersDictionary(markersDictionary, [
    //Unsupported categories
    CategoryType.Uncategorized,
    CategoryType.CenterTables,
    CategoryType.SpecialFeatures,
    CategoryType.Tables,
    CategoryType.RightTables,
    CategoryType.PeripheralMaterials,
    CategoryType.PeripheralReferences,
  ]);

  /** Function to capitalize the first letter of a string */
  function capitalizeFirstLetter(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const simplifiedDictionaryString = Object.entries(simplifiedDictionary)
    .map(([key, value]) => {
      return `  "${key}": {
    category: CategoryType.${value.category ? capitalizeFirstLetter(value.category) : CategoryType.Uncategorized},
    type: MarkerType.${value.type ? capitalizeFirstLetter(value.type) : "Unknown"},
    description: "${value.description ? value.description.replaceAll(`"`, `'`) : ""}",
    hasEndMarker: ${value.hasEndMarker},
    children: ${JSON.stringify(value.children, null, 4)}
  }`;
    })
    .join(",\n");

  // Rich StyleInfo table: ALL markers (no category exclusion), full validation +
  // presentation fields. Entries without a StyleType are skipped — PT9 treats
  // them as scUnknownStyle, i.e. the same as absent from the sheet.
  /** .sty Color ints are Windows COLORREF (0x00BBGGRR); 0/absent = black = omitted (PT9 skips black). */
  function toHexColor(color: number | undefined): string | undefined {
    if (!color) return undefined;
    const r = color & 0xff;
    const g = (color >> 8) & 0xff;
    const b = (color >> 16) & 0xff;
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  const styleInfoMarkers: { [marker: string]: object } = {};
  for (const [key, value] of Object.entries(markersDictionary)) {
    if (!value.styleType) continue;
    const styles = value.styles ?? {};
    const entry: { [field: string]: unknown } = {
      marker: key,
      styleType: value.styleType.toLowerCase(),
      endMarker: value.endMarker,
      occursUnder: value.occursUnder,
      rank: value.rank,
      textType: value.textType,
      textProperties: value.textProperties,
      notRepeatable: value.notRepeatable,
      description: value.description,
      fontName: styles.fontName,
      fontSize: styles.fontSize,
      bold: styles.bold,
      italic: styles.italic,
      underline: styles.underline,
      smallCaps: styles.smallcaps,
      subscript: styles.subscript,
      superscript: styles.superscript,
      color: toHexColor(styles.color),
      justification: styles.justification ? styles.justification.toLowerCase() : undefined,
      firstLineIndent: styles.firstLineIndent,
      leftMargin: styles.leftMargin,
      rightMargin: styles.rightMargin,
      spaceBefore: styles.spaceBefore,
      spaceAfter: styles.spaceAfter,
      lineSpacing: styles.lineSpacing,
    };
    for (const field of Object.keys(entry)) if (entry[field] === undefined) delete entry[field];
    styleInfoMarkers[key] = entry;
  }
  const styleInfoJson = JSON.stringify({ markers: styleInfoMarkers }, undefined, 2);

  generateFiles(tree, path.join(__dirname, "files"), projectRoot, {
    ...options,
    simplifiedDictionaryString: String.raw`${simplifiedDictionaryString}`,
    styleInfoJson,
  });
}
```

- [ ] **Step 6: Flatten the template layout, regenerate, keep ONLY the new file**

`generateFiles` copies the `files/` tree verbatim under `outputPath`, so templates under `files/src/` land in a nested `src/` folder. Flatten first (deterministic landing spot):

```bash
git mv tools/usfm-markers/src/generators/markers-data/files/src/usfmTypes.ts.template tools/usfm-markers/src/generators/markers-data/files/
git mv tools/usfm-markers/src/generators/markers-data/files/src/usfmMarkers.ts.template tools/usfm-markers/src/generators/markers-data/files/
git mv tools/usfm-markers/src/generators/markers-data/files/src/defaultStyleInfo.ts.template tools/usfm-markers/src/generators/markers-data/files/
rmdir tools/usfm-markers/src/generators/markers-data/files/src
```
(Create `defaultStyleInfo.ts.template` directly in `files/` if Step 5 hasn't already.) Then dry-run to confirm, run for real, and revert the two legacy files — they must not drift: the simplified table + overwrites remain the bundled `getMarker` path (documented divergence per spec):

```bash
volta run pnpm nx g usfm-markers:markers-data tools/usfm-markers/src/generators/markers-data/data/usfm.sty --outputPath=libs/shared/src/utils/usfm --dry-run
# expect CREATE/UPDATE lines for libs/shared/src/utils/usfm/{usfmTypes,usfmMarkers,defaultStyleInfo}.ts
volta run pnpm nx g usfm-markers:markers-data tools/usfm-markers/src/generators/markers-data/data/usfm.sty --outputPath=libs/shared/src/utils/usfm
git checkout -- libs/shared/src/utils/usfm/usfmMarkers.ts libs/shared/src/utils/usfm/usfmTypes.ts
```

Add to `libs/shared/src/utils/usfm/index.ts`:
```ts
export { defaultStyleInfo } from "./defaultStyleInfo.js";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/utils/usfm/defaultStyleInfo.test.ts`
Expected: PASS. If an assertion fails on a specific marker (e.g. `qt1-s` absent from the vendored sty), inspect `grep -n "Marker qt" tools/usfm-markers/src/generators/markers-data/data/usfm.sty` and adjust the test to a marker that IS a milestone in the vendored file — the invariant under test is "milestones exist with styleType milestone", not one specific name.

- [ ] **Step 8: Gates and commit**

Run: `volta run pnpm nx test shared --skip-nx-cache && volta run pnpm nx typecheck shared --skip-nx-cache && volta run pnpm nx lint shared --skip-nx-cache && volta run pnpm nx typecheck usfm-markers --skip-nx-cache && volta run pnpm nx lint usfm-markers --skip-nx-cache`
Expected: green.

```bash
git add tools/usfm-markers libs/shared/src/utils/usfm/defaultStyleInfo.ts libs/shared/src/utils/usfm/defaultStyleInfo.test.ts libs/shared/src/utils/usfm/index.ts
git commit -m "feat(shared): rich bundled defaultStyleInfo generated from vendored usfm.sty"
```
(Standard trailer.)

---

### Task 3: Tokenizer — stylesheet-first classification, PT9 unknown handling, unmatched-closer nodes

**Files:**
- Modify: `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`
- Test: `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts` (extend + update changed expectations)

**Interfaces:**
- Consumes: `MarkerLookup`, `createMarkerLookup` (Task 1); existing `getMarker`, `MarkerType`, `NoteNode.isValidMarker`, `MilestoneNode.isValidMarker`.
- Produces: `usfmFragmentToUsjContent(fragment: string, options?: UsfmFragmentOptions): MarkerContent[]` with `interface UsfmFragmentOptions { getMarker?: MarkerLookup; isNoteContext?: boolean }` (exported). Existing single-argument callers keep today's behavior for markers absent from the sheet EXCEPT: unknown openers become paragraphs (body) / char runs (note context), and unmatched closers become `{ type: "unmatched", marker: "<name>*" }` objects.

**Behavior changes (spec §Classification, PT9 refs):** `UsfmParser.DetermineUnknownTokenType` (UsfmParser.cs:642-649), unknown-token construction (UsfmToken.cs:405-421, incl. `esb`/`esbe` paragraph special case), `sink.Unmatched` (UsxUsfmParserSink.cs:262-266).

- [ ] **Step 1: Write the failing tests**

Append to `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts` (match the file's existing describe/expect idiom):

```ts
import { createMarkerLookup, StyleInfo } from "../../utils/usfm/styleInfo";

const projectSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    zln: { marker: "zln", styleType: "character", endMarker: "zln*" },
    zpb: { marker: "zpb", styleType: "paragraph" },
  },
};

describe("stylesheet-first classification (Phase 4)", () => {
  it("classifies a custom.sty character marker that matches the z-milestone wildcard", () => {
    const content = usfmFragmentToUsjContent("\\p text \\zln word\\zln* after", {
      getMarker: createMarkerLookup(projectSheet),
    });
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "char", marker: "zln", content: ["word"] }, " after"],
      },
    ]);
  });

  it("classifies a custom.sty paragraph marker", () => {
    const content = usfmFragmentToUsjContent("\\p one \\zpb two", {
      getMarker: createMarkerLookup(projectSheet),
    });
    expect(content).toEqual([
      { type: "para", marker: "p", content: ["one "] },
      { type: "para", marker: "zpb", content: ["two"] },
    ]);
  });
});

describe("PT9 unknown-marker handling (Phase 4)", () => {
  it("unknown marker in body context becomes a paragraph (UsfmParser.DetermineUnknownTokenType)", () => {
    const content = usfmFragmentToUsjContent("\\p before \\zfoo after");
    expect(content).toEqual([
      { type: "para", marker: "p", content: ["before "] },
      { type: "para", marker: "zfoo", content: ["after"] },
    ]);
  });

  it("unknown marker in note context becomes a char run and consumes its closer", () => {
    const content = usfmFragmentToUsjContent("\\ft text \\zfoo word\\zfoo* after", {
      isNoteContext: true,
    });
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "ft", content: [
            "text ",
            { type: "char", marker: "zfoo", content: ["word"] },
            " after",
          ] },
        ],
      },
    ]);
  });

  it("bare unknown closer becomes an unmatched element (sink.Unmatched)", () => {
    const content = usfmFragmentToUsjContent("\\p text \\zfoo* after");
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "unmatched", marker: "zfoo*" }, " after"],
      },
    ]);
  });

  it("known closer without an opener becomes an unmatched element", () => {
    const content = usfmFragmentToUsjContent("\\p text \\nd* after");
    expect(content).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["text ", { type: "unmatched", marker: "nd*" }, " after"],
      },
    ]);
  });

  it("esb stays a paragraph even in note context (UsfmToken.cs special case)", () => {
    const content = usfmFragmentToUsjContent("\\ft text \\esb more", { isNoteContext: true });
    expect(content[content.length - 1]).toMatchObject({ type: "para", marker: "esb" });
  });
});
```

Note on the note-context char expectation: mirror the actual shape the existing note-context tests in this file use (the default `\p` wrapper wraps note-content fragments — see `$rebuildNoteContent`'s unwrap). If the existing tests express `\ft`-fragment results differently, match that shape; the assertion that matters is `zfoo` becoming a `char` whose closer was CONSUMED (no `unmatched`, no literal `\zfoo*`).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/converters/usfm/usfmFragmentToUsj.test.ts`
Expected: new tests FAIL (unknown markers currently degrade to literal text; no options parameter). Existing tests still pass.

- [ ] **Step 3: Implement**

In `usfmFragmentToUsj.ts`:

1. Add import and options type:
```ts
import { MarkerLookup } from "../../utils/usfm/styleInfo.js";

export interface UsfmFragmentOptions {
  /** Marker classification lookup; defaults to the bundled usfm.sty-derived `getMarker`. */
  getMarker?: MarkerLookup;
  /**
   * True when the fragment is NOTE content. PT9 resolves unknown markers by
   * context (UsfmParser.DetermineUnknownTokenType, UsfmParser.cs:642-649):
   * CHARACTER inside a note, PARAGRAPH in body text.
   */
  isNoteContext?: boolean;
}
```
2. Change `tokenize` to `function tokenize(fragment: string, getMarkerFn: MarkerLookup, isNoteContext: boolean): Token[]` and replace the classification block (current lines 107-154) with:

```ts
    if (name === VERSE_MARKER) {
      const { word, next: afterWord } = getNextWord(fragment, index);
      index = afterWord;
      tokens.push({ kind: "verse", number: word });
      continue;
    }
    if (name === CHAPTER_MARKER) {
      const { word, next: afterWord } = getNextWord(fragment, index);
      index = afterWord;
      tokens.push({ kind: "chapter", number: word });
      continue;
    }

    // Stylesheet-first (PT9: the stylesheet always classifies; our pattern
    // heuristics only stand in for markers ABSENT from the effective sheet).
    const isNested = name.startsWith("+");
    const clean = isNested ? name.slice(1) : name;
    const kind = getMarkerFn(clean)?.type;

    if (kind === MarkerType.Note || (kind === undefined && NoteNode.isValidMarker(name))) {
      const { word, next: afterWord } = getNextWord(fragment, index);
      index = afterWord;
      tokens.push({ kind: "note", marker: name, caller: word || "+" });
      continue;
    }
    if (
      kind === MarkerType.Milestone ||
      (kind === undefined && MilestoneNode.isValidMarker(name))
    ) {
      const milestone = scanMilestone(fragment, rawStart, name, index);
      if (milestone) {
        tokens.push(milestone.token);
        index = milestone.next;
      } else {
        // Not `\*`-terminated: keep the raw text through the next `\` (PT9 behavior).
        const endOfText = fragment.indexOf("\\", index);
        const end = endOfText === -1 ? fragment.length : endOfText;
        pushText(fragment.slice(rawStart, end));
        index = end;
      }
      continue;
    }
    if (kind === MarkerType.Paragraph) {
      consumeSeparator();
      tokens.push({ kind: "para", marker: name });
    } else if (kind === MarkerType.Character) {
      consumeSeparator();
      tokens.push({ kind: "charOpen", marker: clean, isNested });
    } else {
      // Unknown to the effective stylesheet: PT9 resolves by context
      // (DetermineUnknownTokenType): PARAGRAPH in body text, CHARACTER inside
      // a note; `esb`/`esbe` are explicitly paragraphs (UsfmToken.cs:405-421).
      consumeSeparator();
      if (!isNoteContext || name === "esb" || name === "esbe")
        tokens.push({ kind: "para", marker: name });
      else tokens.push({ kind: "charOpen", marker: clean, isNested });
    }
```
3. Change the public entry:
```ts
export function usfmFragmentToUsjContent(
  fragment: string,
  options?: UsfmFragmentOptions,
): MarkerContent[] {
  ...
  for (const token of tokenize(
    fragment,
    options?.getMarker ?? getMarker,
    options?.isNoteContext ?? false,
  )) {
```
4. In the `"end"` token case, replace the literal-text fallback:
```ts
        } else {
          // Unmatched closer: PT9 sink.Unmatched (UsxUsfmParserSink.cs:262-266)
          // — an unmatched element, rendered as ImmutableUnmatchedNode with the
          // existing `.invalid` styling; serializes back to the same text.
          pushContent({ type: "unmatched", marker: `${token.marker}*` });
        }
```
5. Update the file's header comment (the "Unknown marker: kept as typed" claim is now wrong — describe the PT9 unknown resolution and note the literal-text degradation remains only for bare `\`, stray `\*`, unterminated milestones, and non-attribute milestone content).

- [ ] **Step 4: Run the full file's tests; update changed expectations**

Run: `volta run pnpm nx test shared --skip-nx-cache -- src/converters/usfm/usfmFragmentToUsj.test.ts`
Expected: new tests PASS; any pre-existing test that asserted the OLD unknown/unmatched behavior FAILS. For each failure, update the expectation to the new PT9-aligned shape (unknown opener → `{ type: "para", marker: "<name>" }` split; unmatched closer → `{ type: "unmatched", marker: "<name>*" }`). Do NOT weaken tests covering bare `\`, `\*`, unterminated milestones, attribute parsing, or path-like text (`C:\temp` → `temp` is now an unknown marker → paragraph split; that IS PT9 behavior — if a test asserts the old literal outcome, update it and note the PT9 rationale in the test name).

- [ ] **Step 5: Run shared gates**

Run: `volta run pnpm nx test shared --skip-nx-cache && volta run pnpm nx typecheck shared --skip-nx-cache && volta run pnpm nx lint shared --skip-nx-cache`
Expected: green. (Platform tests will break until Task 4 — that is expected; do NOT run platform gates here.)

- [ ] **Step 6: Commit**

```bash
git add libs/shared/src/converters/usfm/usfmFragmentToUsj.ts libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts
git commit -m "feat(shared): stylesheet-first tokenizer with PT9 unknown-marker and unmatched-closer handling"
```
(Standard trailer.)

---

### Task 4: Tier-2 lookup threading + Tier-1 stylesheet-first guards

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx`
- Tests: the corresponding `.test.tsx` files + `markerEdit.test-helpers.tsx`

**Interfaces:**
- Consumes: `MarkerLookup` (Task 1), `UsfmFragmentOptions` (Task 3).
- Produces:
  - `interface Tier2Context { viewOptions: ViewOptions; getMarker: MarkerLookup; logger?: LoggerBasic }` exported from `tier2Rebuild.utils.ts`.
  - `$requestTier2ForNode(node: LexicalNode, context: Tier2Context): void` (signature CHANGE — was `(node, viewOptions, logger)`).
  - `$rebuildParas(paras: ParaNode[], context: Tier2Context): boolean`, `$rebuildNoteContent(note: NoteNode, context: Tier2Context): boolean` (same change).
  - `MarkerEditContext extends Tier2Context` (drops its own `viewOptions`/`logger` declarations, gains `getMarker`).
  - `MarkerEditPlugin` accepts optional `getMarker?: MarkerLookup` prop (defaults to bundled `getMarker`).

- [ ] **Step 1: Write the failing tests**

First add a lookup-aware environment to `markerEdit.test-helpers.tsx` (beside `testEnvironment`):

```tsx
import { createMarkerLookup, StyleInfo } from "shared"; // extend the existing shared import

/** Like `testEnvironment`, but with a project-StyleInfo-backed MarkerLookup. */
export async function testEnvironmentWithSheet(
  $initialEditorState: () => void,
  styleInfo: StyleInfo,
) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin
      viewOptions={getViewOptions(STANDARD_VIEW_MODE)}
      getMarker={createMarkerLookup(styleInfo)}
    />,
  );
}
```

Add to `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx` (same idiom as the file's existing rename tests — `$appendHeadingPara`/`$appendCharPara`, `act` + `editor.update`, read-back asserts):

```tsx
import { testEnvironmentWithSheet } from "./markerEdit.test-helpers"; // extend existing import
import { StyleInfo } from "shared";

const customSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    s1: { marker: "s1", styleType: "paragraph" },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*" },
    zln: { marker: "zln", styleType: "character", endMarker: "zln*" },
    zpb: { marker: "zpb", styleType: "paragraph" },
  },
};

describe("stylesheet-first kind guards (Phase 4)", () => {
  it("renames a char span to a project-known custom char marker in Tier 1", async () => {
    let char: CharNode, marker: MarkerNode, closer: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ char, marker, closer } = $appendCharPara()),
      customSheet,
    );
    await act(async () => editor.update(() => marker.setTextContent("\\zln ")));
    editor.getEditorState().read(() => {
      expect(char.getMarker()).toBe("zln");
      expect(closer.getTextContent()).toBe("\\zln*");
    });
  });

  it("routes a para rename to a project-known char marker to Tier 2 (not renamed in place)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ para, marker } = $appendHeadingPara()),
      customSheet,
    );
    await act(async () => editor.update(() => marker.setTextContent("\\zln ")));
    editor.getEditorState().read(() => {
      // zln is CHARACTER kind in the sheet: the para must NOT become a "zln" para.
      expect(para.isAttached() ? para.getMarker() : "detached").not.toBe("zln");
    });
  });

  it("keeps an unknown rename in place with the project sheet active (deviation #4)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ para, marker } = $appendHeadingPara()),
      customSheet,
    );
    await act(async () => editor.update(() => marker.setTextContent("\\zzz ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zzz"));
  });
});
```
(`$appendHeadingPara` is the file-local helper that builds an `s1` para; `$appendCharPara` comes from the test helpers and returns `{ marker, char, closer }`.)

Add to `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`:

```tsx
describe("unknown-para rebuild round-trip (Phase 4)", () => {
  it("rebuilds a paragraph whose marker is unknown to the sheet (no more guard refusal)", async () => {
    // Build a ParaNode "zfoo" (opener MarkerNode "\zfoo") containing literal text "x \nd y\nd* z",
    // call $rebuildParas([para], context) with the bundled-lookup context.
    // Expect: returns true; the para is rebuilt with marker "zfoo" preserved and a CharNode "nd".
    // (Previously $buildParaFragment refused: getMarker("zfoo") === undefined.)
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/markerEdit/markerEditTier1.utils.test.tsx`
Expected: FAIL (compile errors — `StyleInfo` import exists but context literals lack `getMarker`; guards don't take a lookup yet). This task is compile-driven: TypeScript errors enumerate every call site.

- [ ] **Step 3: Implement `tier2Rebuild.utils.ts` changes**

1. Imports: add `MarkerLookup` to the `shared` import list.
2. Add above `$rebuildParas`:
```ts
export interface Tier2Context {
  viewOptions: ViewOptions;
  getMarker: MarkerLookup;
  logger?: LoggerBasic;
}
```
3. Thread a `getMarkerFn: MarkerLookup` parameter through the internal helpers (mechanical; each currently calls the imported `getMarker` or a helper that does):
   - `isRebuildSentinel(node, getMarkerFn)` — line 119 condition becomes `getMarkerFn(node.getMarker()) === undefined`.
   - `$appendNodesFragment(children, out, getMarkerFn)` and `$appendChildrenFragment(element, out, getMarkerFn)` — line 203 same replacement; pass through recursion.
   - `$appendSignature(children, out, getMarkerFn)` and `$signatureOf(nodes, getMarkerFn)` (line 157 calls `isRebuildSentinel`).
   - `$buildParaFragment(para, getMarkerFn)`, `$buildNoteFragment(note, getMarkerFn)`, `$spansForNodes(nodes, getMarkerFn)`, `$restoreSelectionAtOffset(newNodes, offset, anchorInParas, getMarkerFn)`, `$restoreSelectionInNoteContent(newNodes, offset, anchorInNote, getMarkerFn)`.
   - Remove the now-unused `getMarker` import if no direct references remain.
4. Relax the para guard in `$buildParaFragment` (current line ~228):
```ts
  // Known non-paragraph kinds can't be re-derived as paragraphs. Unknown markers
  // now round-trip: the tokenizer emits them as paragraphs in body context (PT9
  // DetermineUnknownTokenType), so they no longer refuse.
  const paraKind = getMarkerFn(para.getMarker())?.type;
  if (
    paraKind !== undefined &&
    paraKind !== MarkerType.Unknown &&
    paraKind !== MarkerType.Paragraph
  )
    return undefined;
```
5. Public signatures:
```ts
export function $rebuildParas(paras: ParaNode[], context: Tier2Context): boolean {
```
with internal uses `context.viewOptions` / `context.logger` / `context.getMarker`, and the tokenizer call:
```ts
  const content: MarkerContent[] = usfmFragmentToUsjContent(combined.text, {
    getMarker: context.getMarker,
  });
```
```ts
export function $rebuildNoteContent(note: NoteNode, context: Tier2Context): boolean {
```
with:
```ts
  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text, {
    getMarker: context.getMarker,
    isNoteContext: true,
  });
```
```ts
export function $requestTier2ForNode(node: LexicalNode, context: Tier2Context): void {
```
6. Update the module doc comment: sentinel classification and the para guard are now lookup-driven (project custom.sty markers rebuild like standard ones when a project StyleInfo is active).

- [ ] **Step 4: Implement `markerEditTier1.utils.ts` changes**

1. `MarkerEditContext`:
```ts
import { Tier2Context } from "./tier2Rebuild.utils";

export interface MarkerEditContext extends Tier2Context {
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
  /** ... keep the existing rebuildAttempted doc comment, but REWRITE its example:
   * the unmatched-closer case (`\wj*` with no `\wj`) now resolves to an
   * ImmutableUnmatchedNode instead of reproducing literal text; the guard remains
   * for fragments that still reproduce identically (e.g. an unterminated
   * milestone run). */
  rebuildAttempted: Set<string>;
}
```
(Delete the now-inherited `viewOptions`/`logger` members.)
2. Stylesheet-first guards (replace both current bodies):
```ts
/** Spec §5.1 same-positional-kind rule for paragraph openers. Stylesheet-first:
 * a marker the effective sheet KNOWS classifies by its styleType; heuristics
 * cover only markers absent from the sheet. Unknown markers stay as typed
 * (spec deviation #4: Tier-1 renames to unknown markers stay in place). */
function isParaKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Paragraph;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  return true;
}

/** Spec §5.1 same-positional-kind rule for char openers (see isParaKindMarker). */
function isCharKindMarker(marker: string, getMarkerFn: MarkerLookup): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  const kind = getMarkerFn(clean)?.type;
  if (kind !== undefined && kind !== MarkerType.Unknown) return kind === MarkerType.Character;
  if (NoteNode.isValidMarker(clean) || isKnownMilestoneMarker(clean)) return false;
  return true;
}
```
3. Call sites: `isParaKindMarker(newMarker, context.getMarker)` / `isCharKindMarker(newMarker, context.getMarker)` in `$applyOpenerRename`; every `$requestTier2ForNode(node, context.viewOptions, context.logger)` in this file becomes `$requestTier2ForNode(node, context)`.

- [ ] **Step 5: Update the remaining call sites (compile-driven)**

Run: `volta run pnpm nx typecheck platform-editor --skip-nx-cache`
Fix every error it reports — they are exactly:
- `markerEditTier2Trigger.utils.ts` and `markerEditDeletion.utils.ts`: `$requestTier2ForNode(node, context.viewOptions, context.logger)` → `$requestTier2ForNode(node, context)` (and any direct `$rebuildParas(...)`/`$rebuildNoteContent(...)` calls likewise).
- `MarkerEditPlugin.tsx`: add the prop and context field:
```tsx
import { getMarker as bundledGetMarker, MarkerLookup } from "shared"; // adjust the existing shared import list

export function MarkerEditPlugin({
  viewOptions,
  getMarker,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  /** Project StyleInfo-backed lookup; defaults to the bundled table. */
  getMarker?: MarkerLookup;
  logger?: LoggerBasic;
}): null {
  ...
    const context: MarkerEditContext = {
      viewOptions,
      getMarker: getMarker ?? bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
      logger,
    };
  ...
  }, [editor, isEnabled, viewOptions, getMarker, logger]);
```
- Test files: every inline `MarkerEditContext`/`Tier2Context` literal gains `getMarker: bundledGetMarker` (import `getMarker as bundledGetMarker` from `"shared"`), and every direct `$requestTier2ForNode`/`$rebuildParas`/`$rebuildNoteContent` test call switches to the context signature. Where a test needs the project sheet, pass `getMarker: createMarkerLookup(customSheet)` instead.

- [ ] **Step 6: Run the full platform suite; fix behavior-change fallout**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache`
Expected failures to UPDATE (not weaken): any test asserting the old literal-text outcome for unknown openers (`\zzz ` typed in a para now splits into a `zfoo`-style paragraph — assert the new paragraph + red-glyph-eligible structure) or unmatched closers (now `ImmutableUnmatchedNode` — assert node type, not literal text). The Tier-1 tests from Step 1 must now pass. `markerEditLoop.test.tsx` (resolve/rebuild cascade) deserves special attention: the fixed-point refusal must still hold for fragments that reproduce identically — run it and verify no hang (vitest timeout = failure signal).

- [ ] **Step 7: Gates and commit**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache && volta run pnpm nx typecheck platform-editor --skip-nx-cache && volta run pnpm nx lint platform-editor --skip-nx-cache`
Expected: green.

```bash
git add packages/platform/src/editor/markerEdit
git commit -m "feat(platform): thread MarkerLookup through Tier-1/Tier-2 engine; stylesheet-first kind guards"
```
(Standard trailer.)

---

### Task 5: `EditorOptions.styleInfo` + Editor threading + public exports

**Files:**
- Modify: `packages/platform/src/editor/editor.model.ts`
- Modify: `packages/platform/src/editor/Editor.tsx`
- Modify: `packages/platform/src/index.ts`
- Modify (generated): `packages/platform/api/platform-editor.api.md` via extract-api

**Interfaces:**
- Consumes: `StyleInfo`, `createMarkerLookup` (Task 1); `MarkerEditPlugin.getMarker` prop (Task 4).
- Produces: `EditorOptions.styleInfo?: StyleInfo`; platform package exports `StyleInfo`, `MarkerStyleInfo`, `StyleType`, `MarkerLookup` types. Later tasks rely on `Editor.tsx` having a memoized `markerLookup` and destructured `styleInfo` in scope for the validation plugin (Task 7).

- [ ] **Step 1: `editor.model.ts`**

Add to the imports from `"shared"`: `StyleInfo`. Add to `EditorOptions` (after `view`):

```ts
  /**
   * Project stylesheet data (merged usfm.sty + custom.sty, serialized by the
   * host). Drives marker classification, Tier-1 kind routing, and §5.1
   * validation in editable marker modes. Falls back to the bundled default
   * stylesheet data when absent.
   */
  styleInfo?: StyleInfo;
```

- [ ] **Step 2: `Editor.tsx`**

1. Destructure (line ~154 block): add `styleInfo,` to the `options ?? defaultOptions` destructuring.
2. Beside the existing option memos (line ~160):
```ts
  const markerLookup = useMemo(() => createMarkerLookup(styleInfo), [styleInfo]);
```
(`createMarkerLookup` joins the existing `shared` import.)
3. Pass to the plugin (line ~461):
```tsx
          <MarkerEditPlugin viewOptions={viewOptions} getMarker={markerLookup} logger={logger} />
```

- [ ] **Step 3: Exports**

In `packages/platform/src/index.ts`, extend the `export type { ... } from "shared"` block with `MarkerLookup, MarkerStyleInfo, StyleInfo, StyleType` (check `libs/shared/src/index.ts` re-exports `utils/usfm` — it does via the utils barrel; if typecheck says otherwise, add the re-export there).

- [ ] **Step 4: Gates + extract-api**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache && volta run pnpm nx typecheck platform-editor --skip-nx-cache && volta run pnpm nx lint platform-editor --skip-nx-cache && volta run pnpm nx extract-api platform-editor --skip-nx-cache`
Expected: green; api.md updated with the new option + types.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/editor.model.ts packages/platform/src/editor/Editor.tsx packages/platform/src/index.ts packages/platform/api
git commit -m "feat(platform): EditorOptions.styleInfo threaded to the marker engine"
```
(Standard trailer.)

---

### Task 6: Validation core — `$validateDocument` (TagValidator port)

**Files:**
- Create: `packages/platform/src/editor/markerEdit/markerValidation.utils.ts`
- Test: `packages/platform/src/editor/markerEdit/markerValidation.utils.test.tsx`

**Interfaces:**
- Consumes: `StyleInfo`, `MarkerStyleInfo`, `defaultStyleInfo` (shared); node guards `$isBookNode`, `$isSomeChapterNode`, `$isParaNode`, `$isCharNode`, `$isVerseNode`, `$isNoteNode`, `$isMarkerNode`, `$isUnknownNode` (shared), `$isSomeVerseNode` (shared-react).
- Produces:
  - `type MarkerValidity = "unknown" | "invalid"`
  - `$validateDocument(styleInfo: StyleInfo): Map<NodeKey, MarkerValidity>` — keys are the DOM-decoration targets: `MarkerNode` glyph keys for para/char flags, the `VerseNode`'s own key for verse flags. Must be called inside `editor.read()`/`editor.getEditorState().read()`.

PT9 references implemented here: `TagValidator.IsParagraphTagValid` (ParatextData/Checking/TagValidator.cs:18-57), `ValidateUsxStyles` node sets + parent resolution + `xq` exemption (ViewUsfmXhtmlConverter.cs:288-345), unknown-wins (`InsertStyleStatus` never overwrites).

- [ ] **Step 1: Write the failing tests**

`markerValidation.utils.test.tsx` (use `markerEdit.test-helpers.tsx`'s `testEnvironment`/`baseTestEnvironment` mounting pattern; build trees per the CLAUDE.md chained-append style):

```tsx
import { $validateDocument, MarkerValidity } from "./markerValidation.utils";
import { StyleInfo } from "shared";
// ... $create helpers from "shared", test env from "./markerEdit.test-helpers"

const sheet: StyleInfo = {
  markers: {
    id: { marker: "id", styleType: "paragraph" },
    c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
    p: { marker: "p", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 3 },
    s2: { marker: "s2", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    v: { marker: "v", styleType: "character", occursUnder: ["p", "q1"] },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*", occursUnder: ["p"] },
    ft: { marker: "ft", styleType: "character", endMarker: "ft*", occursUnder: ["f", "fe"] },
    f: { marker: "f", styleType: "note", endMarker: "f*", occursUnder: ["p"] },
    xq: { marker: "xq", styleType: "character", endMarker: "xq*" },
    free: { marker: "free", styleType: "character", endMarker: "free*" },
  },
};
```

Test cases (each: build tree in `editor.update`, then `editor.getEditorState().read(() => $validateDocument(sheet))`, assert map contents against collected glyph keys):

1. **Unknown para marker** — para `zfoo` with opener MarkerNode: map has the opener MarkerNode key → `"unknown"`.
2. **Known para in valid sequence** — `id`/`c`/`p` sequence: empty map.
3. **Para occursUnder violation** — `p` directly at root with no preceding `c` (stack has only `id`): opener flagged `"invalid"`.
4. **Rank sequencing** — after `c`, an `s2` (rank 4) then `s1` (rank 3): building `c → s2 → s1`; validating `s1` against stack `[c, s2]`: ancestor `c` matches but `stack[i+1].rank (4) <= tag.rank (3)` is false and `c` is not top → `s1` invalid. Then `c → s1 → s2` is valid (4 >= 3).
5. **Char in wrong context** — `\ft` char span in a `p` para: both its opener AND closer MarkerNode keys → `"invalid"`.
6. **Char in note validates against note marker** — `\ft` inside an `f` note: empty map.
7. **Nested char validates against the PARA, not the parent char** — `\nd` containing `\+nd`... use `nd` inside `nd` inside `p`: inner char checks occursUnder("nd") against `"p"` → valid (occursUnder includes p). Then `ft` nested inside `nd` inside `p` → invalid (context is `p`, not `nd`).
8. **Empty occursUnder = valid anywhere** — `free` char in any para: empty map.
9. **Unknown char** — `zxx` char span in a para: glyph keys → `"unknown"` (unknown wins; no invalid).
10. **Verse in wrong para** — VerseNode inside an `s1` para: verse's own key → `"invalid"`; VerseNode inside `p` → absent.
11. **xq exemption** — an `ft` char nested inside an `xq` char: empty map (skipped), but the `xq` char itself still validated.
12. **Note element not validated** — an `f` note inside an `s1` para (occursUnder f = [p]): the note itself produces NO flag (PT9 excludes `//note`); its `ft` child validates against `f` → valid.

- [ ] **Step 2: Run to verify failure**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/markerEdit/markerValidation.utils.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `markerValidation.utils.ts`**

```ts
/**
 * §5.1 marker validation — a port of PT9's ValidateUsxStyles pass
 * (ViewUsfmXhtmlConverter.cs:288-345) + TagValidator.IsParagraphTagValid
 * (TagValidator.cs:18-57), run over the Lexical tree instead of USX.
 *
 * Two states, PT9 semantics:
 * - "unknown": marker absent from the effective stylesheet (bold red glyph).
 * - "invalid": known marker whose occursUnder/rank forbids this context
 *   (red underlined glyph). Unknown wins over invalid.
 *
 * Map keys are DOM-decoration targets: the flagged node's MarkerNode glyph
 * keys (opener AND closer — PT9 stamps both marker spans), or the VerseNode's
 * own key (its text IS the glyph). Note elements are NOT context-validated
 * (PT9's node set excludes //note); chars inside a note validate against the
 * note's marker; nested chars validate against the PARAGRAPH marker (PT9
 * ancestor::para[1]); chars under an `xq` ancestor are exempt.
 */
import {
  $getRoot,
  $isElementNode,
  ElementNode,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $isBookNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  $isUnknownNode,
  MarkerStyleInfo,
  StyleInfo,
} from "shared";
import { $isSomeVerseNode } from "shared-react";

export type MarkerValidity = "unknown" | "invalid";

interface ParaStackEntry {
  marker: string;
  rank: number;
  occursUnder: readonly string[];
}

function getEntry(styleInfo: StyleInfo, marker: string): MarkerStyleInfo | undefined {
  return styleInfo.markers[marker.replace(/^\+/, "")];
}

/** Port of PT9 TagValidator.IsParagraphTagValid (TagValidator.cs:18-57). */
function isParagraphTagValid(stack: ParaStackEntry[], tag: ParaStackEntry): boolean {
  if (stack.length === 0 || tag.occursUnder.length === 0) {
    stack.push(tag);
    return true;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!tag.occursUnder.includes(stack[i].marker)) continue;
    if (i === stack.length - 1 || tag.rank === 0 || stack[i + 1].rank <= tag.rank) {
      stack.length = i + 1;
      stack.push(tag);
      return true;
    }
    // Matched ancestor but rank forbids — keep scanning lower entries (PT9 continues).
  }
  return false;
}

/** Flag a node's visible marker glyphs (opener and closer MarkerNodes). Decorator
 * variants (ImmutableChapterNode) have no MarkerNode children — flag the node itself. */
function flagGlyphs(node: LexicalNode, validity: MarkerValidity, out: Map<NodeKey, MarkerValidity>): void {
  const glyphs = $isElementNode(node) ? node.getChildren().filter($isMarkerNode) : [];
  if (glyphs.length === 0) {
    out.set(node.getKey(), validity);
    return;
  }
  for (const glyph of glyphs) out.set(glyph.getKey(), validity);
}

function checkChar(
  node: ElementNode,
  marker: string,
  contextMarker: string,
  styleInfo: StyleInfo,
  out: Map<NodeKey, MarkerValidity>,
): void {
  const entry = getEntry(styleInfo, marker);
  if (!entry) {
    flagGlyphs(node, "unknown", out);
    return;
  }
  const occursUnder = entry.occursUnder ?? [];
  if (occursUnder.length > 0 && !occursUnder.includes(contextMarker))
    flagGlyphs(node, "invalid", out);
}

function $validateInline(
  element: ElementNode,
  contextMarker: string,
  styleInfo: StyleInfo,
  out: Map<NodeKey, MarkerValidity>,
  insideXq: boolean,
): void {
  for (const child of element.getChildren()) {
    if ($isCharNode(child)) {
      const marker = child.getMarker();
      if (!insideXq) checkChar(child, marker, contextMarker, styleInfo, out);
      // Nested chars keep validating against the PARA/NOTE marker (PT9 ancestor::para[1]).
      $validateInline(child, contextMarker, styleInfo, out, insideXq || marker === "xq");
    } else if ($isSomeVerseNode(child)) {
      if (insideXq) continue;
      const entry = getEntry(styleInfo, "v");
      if (!entry) out.set(child.getKey(), "unknown");
      else if ((entry.occursUnder ?? []).length > 0 && !(entry.occursUnder ?? []).includes(contextMarker))
        out.set(child.getKey(), "invalid");
    } else if ($isNoteNode(child)) {
      // The note element itself is not context-validated (PT9 excludes //note);
      // its content validates against the NOTE's marker.
      $validateInline(child, child.getMarker(), styleInfo, out, insideXq);
    } else if ($isUnknownNode(child)) {
      // Opaque blocks (§7): never descend.
    } else if ($isElementNode(child)) {
      $validateInline(child, contextMarker, styleInfo, out, insideXq);
    }
  }
}

/**
 * Full-document validation pass. Call inside editor.read(). Returns the
 * decoration map keyed by glyph/verse node keys.
 */
export function $validateDocument(styleInfo: StyleInfo): Map<NodeKey, MarkerValidity> {
  const out = new Map<NodeKey, MarkerValidity>();
  const stack: ParaStackEntry[] = [];

  const validateParaLevel = (node: LexicalNode, marker: string): void => {
    const entry = getEntry(styleInfo, marker);
    if (!entry) {
      flagGlyphs(node, "unknown", out);
      // PT9 auto-creates unknown tags with empty occursUnder — valid anywhere,
      // and they join the stack (ScrStylesheet.GetTagIndex:182-201).
      isParagraphTagValid(stack, { marker, rank: 0, occursUnder: [] });
      return;
    }
    const tag: ParaStackEntry = {
      marker,
      rank: entry.rank ?? 0,
      occursUnder: entry.occursUnder ?? [],
    };
    if (!isParagraphTagValid(stack, tag)) flagGlyphs(node, "invalid", out);
  };

  for (const child of $getRoot().getChildren()) {
    if ($isUnknownNode(child)) continue; // opaque blocks: skip entirely
    if ($isBookNode(child) || $isSomeChapterNode(child)) {
      validateParaLevel(child, child.getMarker());
    } else if ($isParaNode(child)) {
      validateParaLevel(child, child.getMarker());
      $validateInline(child, child.getMarker(), styleInfo, out, false);
    } else if ($isElementNode(child)) {
      // ImpliedParaNode and other unmarked wrappers: no para-level flag; PT9's
      // implied paragraph context is the default \p.
      $validateInline(child, "p", styleInfo, out, false);
    }
  }
  return out;
}
```

Adjust the `flagGlyphs` element-fallback for `$isSomeChapterNode`/`$isBookNode` decorator variants: `ImmutableChapterNode` has no `MarkerNode` children, so it falls back to its own key — that is the intended behavior (rare case; whole-token coloring).

- [ ] **Step 4: Run tests to verify they pass**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/markerEdit/markerValidation.utils.test.tsx`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/markerValidation.utils.ts packages/platform/src/editor/markerEdit/markerValidation.utils.test.tsx
git commit -m "feat(platform): PT9 ValidateUsxStyles/TagValidator port ($validateDocument)"
```
(Standard trailer.)

---

### Task 7: `MarkerValidationPlugin` — decoration, triggers, CSS, mount

**Files:**
- Create: `packages/platform/src/editor/markerEdit/MarkerValidationPlugin.tsx`
- Modify: `packages/platform/src/editor/Editor.tsx` (mount, alphabetical position after `MarkerEditPlugin`)
- Modify: `packages/platform/src/usj-nodes.css` (status rules)
- Test: `packages/platform/src/editor/markerEdit/MarkerValidationPlugin.test.tsx`

**Interfaces:**
- Consumes: `$validateDocument`, `MarkerValidity` (Task 6); `defaultStyleInfo` (Task 2); `styleInfo` + `viewOptions` from `Editor.tsx` (Task 5).
- Produces: `MarkerValidationPlugin({ viewOptions, styleInfo, logger })` React component; CSS classes `status_unknown`/`status_invalid` in `usj-nodes.css`.

- [ ] **Step 1: Write the failing tests**

`MarkerValidationPlugin.test.tsx` (mount via `baseTestEnvironment` with the plugin, mirroring how `markerEdit.test-helpers.tsx` mounts `MarkerEditPlugin`; standard-view options):

1. **Load coverage:** initial state contains para `zfoo` (opener glyph) → after mount + initial pass, `editor.getElementByKey(openerKey)` has class `status_unknown`. (This is the `setEditorState`-runs-no-transforms case the plugin exists for.)
2. **Edit revalidation:** rename the para marker to `p` (valid context) inside `editor.update`; after the update listener pass, the class is gone.
3. **Invalid decoration:** `ft` char span in a `p` para → opener AND closer glyph elements have `status_invalid`.
4. **styleInfo prop change:** re-render the plugin with a sheet where `zfoo` IS a paragraph → `status_unknown` removed without any editor update.
5. **Gating:** with `viewOptions.markerMode !== "editable"` no classes are ever applied.

Use the validation sheet from Task 6's test. For DOM assertions use `editor.getElementByKey(key)?.classList.contains("status_unknown")`. Flush React + Lexical between steps the same way the existing plugin tests in this directory do (copy their `act`/`await` pattern exactly).

- [ ] **Step 2: Run to verify failure**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/markerEdit/MarkerValidationPlugin.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the plugin**

`MarkerValidationPlugin.tsx`:

```tsx
import { $validateDocument, MarkerValidity } from "./markerValidation.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { NodeKey } from "lexical";
import { useEffect } from "react";
import { defaultStyleInfo, LoggerBasic, StyleInfo } from "shared";
import { ViewOptions } from "shared-react";

const STATUS_CLASSES = ["status_unknown", "status_invalid"] as const;

/**
 * §5.1 marker validation decoration (design spec Phase 4). Runs a
 * PT9-ValidateUsxStyles-shaped full-document pass after every committed update
 * and decorates marker glyph DOM elements with status_unknown/status_invalid.
 * Validity is DERIVED, VIEW-ONLY state: it lives in this plugin and the DOM,
 * never in the editor document (no undo pollution, no serialization, no collab
 * deltas). Classes are (re)applied for every entry each pass, so reconciler
 * DOM re-creation self-heals; removal is diffed against the previous pass.
 *
 * PT9 revalidates the whole visible text on every reformat; this pass is a
 * cheap read-only walk (chapter-sized documents), so it runs unconditionally
 * per commit rather than trying to prove marker-neutrality of an edit.
 */
export function MarkerValidationPlugin({
  viewOptions,
  styleInfo,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  styleInfo?: StyleInfo;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled) return;
    const effectiveStyleInfo = styleInfo ?? defaultStyleInfo;
    let decorated = new Map<NodeKey, MarkerValidity>();

    const applyPass = () => {
      if (editor.isComposing()) return; // next commit after composition covers it
      editor.getEditorState().read(() => {
        const next = $validateDocument(effectiveStyleInfo);
        for (const [key] of decorated) {
          if (next.has(key)) continue;
          const element = editor.getElementByKey(key);
          if (element) element.classList.remove(...STATUS_CLASSES);
        }
        for (const [key, validity] of next) {
          const element = editor.getElementByKey(key);
          if (!element) continue;
          element.classList.toggle("status_unknown", validity === "unknown");
          element.classList.toggle("status_invalid", validity === "invalid");
        }
        decorated = next;
        logger?.debug(`[MarkerValidation] pass: ${next.size} flagged`);
      });
    };

    applyPass(); // initial pass: covers setEditorState loads (no transforms fire there)
    const unregister = editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
      if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
      applyPass();
    });
    return () => {
      unregister();
      // Leave no stale decoration behind when the plugin unmounts or styleInfo changes.
      for (const [key] of decorated) editor.getElementByKey(key)?.classList.remove(...STATUS_CLASSES);
    };
  }, [editor, isEnabled, styleInfo, logger]);

  return null;
}
```

- [ ] **Step 4: CSS**

In `packages/platform/src/usj-nodes.css`, insert AFTER the `.formatted-font.marker-editable .verse` block (line ~2091) — cascade position matters: these must come after the grey marker rules so the error color wins; the selector lists match the grey rules' specificity for the formatted case and cover the unformatted (editable, non-formatted-font) case:

```css
/* §5.1 validation states (PT9 ScriptureBase.css .status_unknown/.status_invalid;
   design spec Phase 4). Applied to marker GLYPH spans only — body text stays
   normal (PT9 Standard.xslt stamps status on the marker span, not the element).
   Same error red as the unmatched-closer `.invalid` rule below. */
.marker-editable .status_unknown,
.formatted-font.marker-editable .status_unknown {
  color: rgba(204, 30, 20, 1);
  font-weight: bold;
}

.marker-editable .status_invalid,
.formatted-font.marker-editable .status_invalid {
  color: rgba(204, 30, 20, 1);
  border-bottom: 1px solid rgba(204, 30, 20, 1);
}
```

- [ ] **Step 5: Mount in `Editor.tsx`**

Import the plugin; add to the alphabetical block directly after `MarkerEditPlugin` (line ~461):

```tsx
          <MarkerValidationPlugin
            styleInfo={styleInfo}
            viewOptions={viewOptions}
            logger={logger}
          />
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/markerEdit/MarkerValidationPlugin.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 7: Gates and commit**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache && volta run pnpm nx typecheck platform-editor --skip-nx-cache && volta run pnpm nx lint platform-editor --skip-nx-cache`
Expected: green.

```bash
git add packages/platform/src/editor/markerEdit/MarkerValidationPlugin.tsx packages/platform/src/editor/markerEdit/MarkerValidationPlugin.test.tsx packages/platform/src/editor/Editor.tsx packages/platform/src/usj-nodes.css
git commit -m "feat(platform): MarkerValidationPlugin — status_unknown/status_invalid glyph decoration"
```
(Standard trailer.)

---

### Task 8: `generateUsjCss` — PT9 CSSCreator port

**Files:**
- Create: `packages/platform/src/editor/generateUsjCss.ts`
- Modify: `packages/platform/src/index.ts` (export) + extract-api
- Test: `packages/platform/src/editor/generateUsjCss.test.ts`

**Interfaces:**
- Consumes: `StyleInfo`, `MarkerStyleInfo` (Task 1).
- Produces: `generateUsjCss(styleInfo: StyleInfo, options?: UsjCssOptions): string` with `interface UsjCssOptions { zoom?: number; rtl?: boolean; containerSelector?: string }` — exported from the platform package (Task 12's web view imports it).

PT9 formulas (CSSCreator.cs; StyleInfo units are .sty units — inches/points — so the ×1000 int scaling becomes ×20 for vw):

| .sty field | emission |
| --- | --- |
| base (defaultFont/Size) | `font-family: "<font>"; font-size: {size*zoom}pt` on the container |
| FontSize | `font-size: {Math.floor(fontSize*100/12)}%` (integer %, of 12pt base; zoom inherited) |
| FirstLineIndent (≠0, incl. negative) | `text-indent: {indent*20*zoom}vw` |
| LeftMargin > 0 | `margin-left` (ltr) / `margin-right` (rtl): `{margin*20*zoom}vw` |
| RightMargin > 0 | mirror of LeftMargin |
| SpaceBefore/After > 0 | `margin-top/bottom: {space*zoom}pt` |
| LineSpacing | `1 → line-height: 1.5`, `2 → line-height: 2`, else nothing |
| Subscript / Superscript | `vertical-align: text-bottom/text-top; font-size: 66%` |
| Color (non-black) | `color: #RRGGBB` (already hex in StyleInfo) |
| Bold/Italic/Underline/SmallCaps | font-weight/font-style/text-decoration/font-variant |
| Justification | `text-align: left/center/right/justify`, left↔right swapped under rtl |
| textProperties contains "verse" | `white-space: nowrap; unicode-bidi: embed` |

Number formatting: vw/pt values `toFixed(3)` then strip trailing zeros and dot (`0.250vw` → `0.25vw`, `12.000pt` → `12pt`).

- [ ] **Step 1: Write the failing snapshot-style tests**

`generateUsjCss.test.ts` — assert exact strings (deterministic single-fixture snapshots inline, not vitest snapshot files, so review sees the CSS):

```ts
import { generateUsjCss } from "./generateUsjCss";
import { StyleInfo } from "shared";
import { describe, expect, it } from "vitest";

const styleInfo: StyleInfo = {
  defaultFont: "Charis SIL",
  defaultFontSize: 12,
  markers: {
    s1: {
      marker: "s1", styleType: "paragraph", bold: true, color: "#003380",
      fontSize: 14, spaceBefore: 8, spaceAfter: 4, justification: "center",
    },
    q1: {
      marker: "q1", styleType: "paragraph",
      firstLineIndent: -0.5, leftMargin: 1.25, lineSpacing: 1,
    },
    v: {
      marker: "v", styleType: "character", superscript: true,
      textProperties: ["verse"],
    },
    nd: { marker: "nd", styleType: "character", smallCaps: true },
  },
};

describe("generateUsjCss (PT9 CSSCreator port)", () => {
  it("emits the base rule and per-marker rules (ltr, zoom 1)", () => {
    expect(generateUsjCss(styleInfo)).toBe(
      [
        '.editor-input { font-family: "Charis SIL"; font-size: 12pt; }',
        ".editor-input .usfm_s1 { font-weight: bold; color: #003380; font-size: 116%; margin-top: 8pt; margin-bottom: 4pt; text-align: center; }",
        ".editor-input .usfm_q1 { text-indent: -10vw; margin-left: 25vw; line-height: 1.5; }",
        ".editor-input .usfm_v { vertical-align: text-top; font-size: 66%; white-space: nowrap; unicode-bidi: embed; }",
        ".editor-input .usfm_nd { font-variant: small-caps; }",
      ].join("\n"),
    );
  });

  it("flips margins and justification under rtl and scales with zoom", () => {
    const css = generateUsjCss(styleInfo, { zoom: 2, rtl: true });
    expect(css).toContain('.editor-input { font-family: "Charis SIL"; font-size: 24pt; }');
    expect(css).toContain("margin-right: 50vw"); // q1 leftMargin flipped + zoomed
    expect(css).toContain("text-indent: -20vw");
    expect(css).toContain("margin-top: 16pt"); // s1 spaceBefore zoomed
    // s1 fontSize stays a percentage — zoom is inherited from the base rule.
    expect(css).toContain("font-size: 116%");
  });

  it("respects a custom containerSelector", () => {
    expect(generateUsjCss({ markers: {} }, { containerSelector: ".x" })).toBe("");
    expect(
      generateUsjCss({ markers: { p: { marker: "p", styleType: "paragraph", bold: true } } }, { containerSelector: ".x" }),
    ).toBe(".x .usfm_p { font-weight: bold; }");
  });
});
```

(Derivations: `14*100/12 = 116` integer; `-0.5*20*1 = -10vw`; `1.25*20 = 25vw`; superscript → text-top + 66% per CSSCreator:218-227.)

- [ ] **Step 2: Run to verify failure**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/generateUsjCss.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
/**
 * TS port of PT9 CSSCreator.CreateUsfmCss's per-tag emissions
 * (ParatextInternalShared/ScriptureEditor/CSSCreator.cs:103-247), design spec
 * Phase 4 §CSS generator. Emits a base rule (project default font/size — the
 * PT9 `.usfm` rule, CSSCreator.cs:127-129) followed by one `.usfm_<marker>`
 * rule per marker with any presentation fields. StyleInfo units are .sty
 * units (inches/points), so PT9's ×1000-int /50 vw scaling becomes ×20.
 * Not ported (spec non-goals): @font-face emission, vertical text mode.
 */
import { MarkerStyleInfo, StyleInfo } from "shared";

export interface UsjCssOptions {
  /** PT9 zoom factor; scales the base font-size (pt) and vw/pt lengths. */
  zoom?: number;
  /** Swap left/right margins and justification (PT9 rtl handling). */
  rtl?: boolean;
  /** Scope prefix; must at least match the static usj-nodes.css rules' specificity. */
  containerSelector?: string;
}

function formatLength(value: number): string {
  return value
    .toFixed(3)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function markerDeclarations(entry: MarkerStyleInfo, zoom: number, rtl: boolean): string[] {
  const decls: string[] = [];
  if (entry.fontName) decls.push(`font-family: "${entry.fontName}"`);
  if (entry.bold) decls.push("font-weight: bold");
  if (entry.italic) decls.push("font-style: italic");
  if (entry.color) decls.push(`color: ${entry.color}`);
  if (entry.fontSize) decls.push(`font-size: ${Math.floor((entry.fontSize * 100) / 12)}%`);
  if (entry.firstLineIndent)
    decls.push(`text-indent: ${formatLength(entry.firstLineIndent * 20 * zoom)}vw`);
  if (entry.leftMargin && entry.leftMargin > 0)
    decls.push(`margin-${rtl ? "right" : "left"}: ${formatLength(entry.leftMargin * 20 * zoom)}vw`);
  if (entry.rightMargin && entry.rightMargin > 0)
    decls.push(`margin-${rtl ? "left" : "right"}: ${formatLength(entry.rightMargin * 20 * zoom)}vw`);
  if (entry.spaceBefore && entry.spaceBefore > 0)
    decls.push(`margin-top: ${formatLength(entry.spaceBefore * zoom)}pt`);
  if (entry.spaceAfter && entry.spaceAfter > 0)
    decls.push(`margin-bottom: ${formatLength(entry.spaceAfter * zoom)}pt`);
  if (entry.lineSpacing === 1) decls.push("line-height: 1.5");
  else if (entry.lineSpacing === 2) decls.push("line-height: 2");
  if (entry.subscript) decls.push("vertical-align: text-bottom", "font-size: 66%");
  else if (entry.superscript) decls.push("vertical-align: text-top", "font-size: 66%");
  if (entry.underline) decls.push("text-decoration: underline");
  if (entry.smallCaps) decls.push("font-variant: small-caps");
  if (entry.justification) {
    const align =
      entry.justification === "both"
        ? "justify"
        : rtl && entry.justification === "left"
          ? "right"
          : rtl && entry.justification === "right"
            ? "left"
            : entry.justification;
    decls.push(`text-align: ${align}`);
  }
  if (entry.textProperties?.includes("verse"))
    decls.push("white-space: nowrap", "unicode-bidi: embed");
  return decls;
}

export function generateUsjCss(styleInfo: StyleInfo, options: UsjCssOptions = {}): string {
  const { zoom = 1, rtl = false, containerSelector = ".editor-input" } = options;
  const rules: string[] = [];
  const baseDecls: string[] = [];
  if (styleInfo.defaultFont) baseDecls.push(`font-family: "${styleInfo.defaultFont}"`);
  if (styleInfo.defaultFontSize)
    baseDecls.push(`font-size: ${formatLength(styleInfo.defaultFontSize * zoom)}pt`);
  if (baseDecls.length > 0) rules.push(`${containerSelector} { ${baseDecls.join("; ")}; }`);
  for (const [marker, entry] of Object.entries(styleInfo.markers)) {
    const decls = markerDeclarations(entry, zoom, rtl);
    if (decls.length > 0)
      rules.push(`${containerSelector} .usfm_${marker} { ${decls.join("; ")}; }`);
  }
  return rules.join("\n");
}
```

Order the `markerDeclarations` pushes to match the test expectations exactly (bold, color, font-size, margins, line-height, vertical-align, decoration, variant, align, verse props — adjust the test or the order so they agree; the ORDER is not PT9-load-bearing, the values are).

- [ ] **Step 4: Run tests, export, extract-api**

Run: `volta run pnpm nx test platform-editor --skip-nx-cache -- src/editor/generateUsjCss.test.ts`
Expected: PASS.

Add to `packages/platform/src/index.ts`:
```ts
export { generateUsjCss } from "./editor/generateUsjCss";
export type { UsjCssOptions } from "./editor/generateUsjCss";
```
Run: `volta run pnpm nx extract-api platform-editor --skip-nx-cache`

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/generateUsjCss.ts packages/platform/src/editor/generateUsjCss.test.ts packages/platform/src/index.ts packages/platform/api
git commit -m "feat(platform): generateUsjCss — PT9 CSSCreator port for project stylesheet CSS"
```
(Standard trailer.)

---

### Task 9: Part A wrap — whole-repo gates + demo browser QA

**Files:** none new (fixes only if gates fail).

- [ ] **Step 1: Whole-repo gates (all cache-bypassed)**

```bash
volta run pnpm nx run-many -t test --skip-nx-cache
volta run pnpm nx run-many -t typecheck --skip-nx-cache
volta run pnpm nx run-many -t lint --skip-nx-cache
volta run pnpm nx format:check
volta run pnpm nx run-many -t extract-api --skip-nx-cache
git status --short   # expect: empty (no api.md drift)
```
Expected: all green. Fix any fallout (scribe/shared-react consumers of changed shared APIs — `usfmFragmentToUsjContent`'s new optional param is backward-compatible; `$requestTier2ForNode` is platform-internal).

- [ ] **Step 2: Demo browser QA smoke (Playwright MCP, real Chrome)**

```bash
volta run pnpm nx dev platform    # background; note the port
```
In the browser (platform demo, Standard view preset — validation falls back to `defaultStyleInfo`, no styleInfo option needed):
1. Type `\zfoo ` mid-paragraph → paragraph splits; the `\zfoo` glyph renders bold red (`status_unknown` class present; computed color ≈ rgb(204, 30, 20)).
2. Type `\ft ` mid-body-paragraph → glyphs render red-underlined (`status_invalid`).
3. Rename a `\s1` opener to `\s2` → no flags (valid), restyles.
4. Console: 0 errors.
Verify via editor STATE + `getComputedStyle`, not visual guesswork.

- [ ] **Step 3: Commit any fixes; update ledger**

Record Part A completion in `.superpowers/sdd/progress.md` (tracked file — normal `git add`).

```bash
git add .superpowers/sdd/progress.md
git commit -m "docs(ledger): Phase 4 Part A complete (library StyleInfo integration)"
```
(Standard trailer.)

---

### Task 10: C# `GetStyleInfo` + DTO + registration + tests (paranext worktree)

**Repo:** `/home/lyonsm/paranext-core-standard-view` (branch `standard-view`). All paths below relative to that root.

**Files:**
- Create: `c-sharp/JsonUtils/PlatformStyleInfo.cs`
- Modify: `c-sharp/Projects/ParatextProjectDataProvider.cs` (method + registration)
- Modify: `c-sharp/Projects/ProjectInterfaces.cs`, `c-sharp/Projects/LocalParatextProjects.cs`
- Create: `c-sharp-tests/Projects/ParatextProjectDataProviderStyleInfoTests.cs`

**Interfaces:**
- Consumes: ParatextData `ScrStylesheet`/`ScrTag` (`Tags`, `Marker`, `StyleType`, `Endmarker`, `OccursUnderList`, `Rank`, `TextType`, `TextProperties`, `Description`, `NotRepeatable`, `Fontname`, `FontSize`, `Bold`, `Italic`, `Underline`, `SmallCaps`, `Subscript`, `Superscript`, `Color`, `JustificationType`, `FirstLineIndent`, `LeftMargin`, `RightMargin`, `SpaceBefore`, `SpaceAfter`, `LineSpacing`).
- Produces: wire function `getStyleInfo(bookNum: number)` returning a JSON object matching the TS `StyleInfo` shape (camelCase fields; `markers` dictionary keys are raw marker names). Task 11's d.ts and Task 12's web view consume it.

- [ ] **Step 1: Verify serializer naming policy**

```bash
grep -rn "CamelCase\|PropertyNamingPolicy" c-sharp/ | head -5
```
Expected: a `JsonSerializerOptions` with `PropertyNamingPolicy = JsonNamingPolicy.CamelCase` (this is how `PlatformCommentThreadWrapper`'s PascalCase getters arrive camelCased in TS). If NOT found, add `[JsonPropertyName("...")]` attributes to every DTO property in Step 2. Also confirm dictionary keys are NOT renamed (default `System.Text.Json` behavior leaves dictionary keys untouched unless `DictionaryKeyPolicy` is set — verify no `DictionaryKeyPolicy` in the same options).

- [ ] **Step 2: Write the DTO**

`c-sharp/JsonUtils/PlatformStyleInfo.cs` (mirror `PlatformCommentThreadWrapper`'s plain-getters style; consult `/home/lyonsm/Paratext/ParatextData/ScrTag.cs` `AsString()` lines 669-738 for the full property surface if any accessor name differs in the installed ParatextData version):

```csharp
using Paratext.Data;
using PtxUtils;

namespace Paranext.DataProvider.JsonUtils;

/// <summary>
/// Serialized form of a project's merged stylesheet (usfm.sty + custom.sty),
/// matching the scripture-editors `StyleInfo` TS shape. Marker dictionary keys
/// are raw marker names (dictionary keys are not camel-cased by the serializer).
/// </summary>
public class PlatformStyleInfo(string? defaultFont, double? defaultFontSize, Dictionary<string, PlatformMarkerStyleInfo> markers)
{
    public string? DefaultFont => defaultFont;
    public double? DefaultFontSize => defaultFontSize;
    public Dictionary<string, PlatformMarkerStyleInfo> Markers => markers;
}

public class PlatformMarkerStyleInfo(ScrTag tag)
{
    public string Marker => tag.Marker;

    /// <summary>"paragraph" | "character" | "note" | "milestone" (end/unknown tags are never serialized)</summary>
    public string StyleType =>
        tag.StyleType switch
        {
            ScrStyleType.scParagraphStyle => "paragraph",
            ScrStyleType.scCharacterStyle => "character",
            ScrStyleType.scNoteStyle => "note",
            ScrStyleType.scMilestone => "milestone",
            _ => "unknown", // filtered out by the caller; never emitted
        };

    public string? EndMarker => string.IsNullOrEmpty(tag.Endmarker) ? null : tag.Endmarker;
    public string[]? OccursUnder =>
        tag.OccursUnderList.Count > 0 ? tag.OccursUnderList.ToArray() : null;
    public int? Rank => tag.Rank != 0 ? tag.Rank : null;
    public string? TextType =>
        tag.TextType != ScrTextType.scNotSpecified ? tag.TextType.ToString().Substring(2) : null;
    public string[]? TextProperties { get; } = TextPropertiesToStrings(tag);
    public bool? NotRepeatable => tag.NotRepeatable ? true : null;
    public string? Description => string.IsNullOrEmpty(tag.Description) ? null : tag.Description;
    public string? FontName => string.IsNullOrEmpty(tag.Fontname) ? null : tag.Fontname;
    public int? FontSize => tag.FontSize != 0 ? tag.FontSize : null;
    public bool? Bold => tag.Bold ? true : null;
    public bool? Italic => tag.Italic ? true : null;
    public bool? Underline => tag.Underline ? true : null;
    public bool? SmallCaps => tag.SmallCaps ? true : null;
    public bool? Subscript => tag.Subscript ? true : null;
    public bool? Superscript => tag.Superscript ? true : null;

    /// <summary>#RRGGBB, omitted for black (PT9 CSSCreator skips black, CSSCreator.cs:149-150)</summary>
    public string? Color =>
        tag.Color.ARGB != RgbColor.Black.ARGB ? $"#{tag.Color.R:X2}{tag.Color.G:X2}{tag.Color.B:X2}" : null;

    public string? Justification { get; } = JustificationToString(tag);

    /// <summary>Inches (ScrTag stores thousandths; TS StyleInfo units are .sty inches)</summary>
    public double? FirstLineIndent => tag.FirstLineIndent != 0 ? tag.FirstLineIndent / 1000.0 : null;
    public double? LeftMargin => tag.LeftMargin != 0 ? tag.LeftMargin / 1000.0 : null;
    public double? RightMargin => tag.RightMargin != 0 ? tag.RightMargin / 1000.0 : null;
    public int? SpaceBefore => tag.SpaceBefore != 0 ? tag.SpaceBefore : null;
    public int? SpaceAfter => tag.SpaceAfter != 0 ? tag.SpaceAfter : null;
    public int? LineSpacing => tag.LineSpacing != 0 ? tag.LineSpacing : null;

    private static readonly (TextProperties flag, string name)[] s_textPropertyNames =
    [
        (TextProperties.scParagraph, "paragraph"),
        (TextProperties.scPublishable, "publishable"),
        (TextProperties.scVernacular, "vernacular"),
        (TextProperties.scPoetic, "poetic"),
        (TextProperties.scLevel_1, "level_1"),
        (TextProperties.scLevel_2, "level_2"),
        (TextProperties.scLevel_3, "level_3"),
        (TextProperties.scLevel_4, "level_4"),
        (TextProperties.scLevel_5, "level_5"),
        (TextProperties.scChapter, "chapter"),
        (TextProperties.scVerse, "verse"),
        (TextProperties.scBook, "book"),
        (TextProperties.scNote, "note"),
        (TextProperties.scCrossReference, "crossreference"),
        (TextProperties.scNonpublishable, "nonpublishable"),
        (TextProperties.scNonvernacular, "nonvernacular"),
    ];

    /// <summary>Lowercase .sty names (ScrTag.ParseTextProperties, ScrTag.cs:964-979); null when none.</summary>
    private static string[]? TextPropertiesToStrings(ScrTag tag)
    {
        var names = s_textPropertyNames
            .Where(pair => (tag.TextProperties & pair.flag) != 0)
            .Select(pair => pair.name)
            .ToArray();
        return names.Length > 0 ? names : null;
    }

    /// <summary>"center"/"right"/"both"; null for the default (left) — with direction set on the
    /// container, omitting text-align:left is visually equivalent incl. the PT9 rtl flip.</summary>
    private static string? JustificationToString(ScrTag tag) =>
        tag.JustificationType switch
        {
            ScrJustificationType.scCenter => "center",
            ScrJustificationType.scRight => "right",
            ScrJustificationType.scBoth => "both",
            _ => null,
        };
}
```

Fill the two private helpers by reading the actual enum member names in the installed ParatextData (decompiled reference or `/home/lyonsm/Paratext/ParatextData/ScrTag.cs:144-218` for `TextProperties` flags and the `JustificationType` enum). `null` property values must be OMITTED from JSON — verify the serializer options set `DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull` (same grep as Step 1); if not, add `[JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]` on the nullable properties.

- [ ] **Step 3: Add the PDP method + registration**

In `c-sharp/Projects/ParatextProjectDataProvider.cs`, directly after `GetMarkerNames` (line ~1852):

```csharp
    /// <summary>
    /// Gets the full style info (merged usfm.sty + custom.sty) for the book's stylesheet.
    /// Resolves the custom-stylesheet @todo on getMarkerNames: ScrStylesheet already merges
    /// custom.sty per-property (ParatextData ScrStylesheet.CreateTag).
    /// </summary>
    public PlatformStyleInfo GetStyleInfo(int bookNum)
    {
        var scrText = LocalParatextProjects.GetParatextProject(ProjectDetails.Metadata.Id);
        ScrStylesheet scrStylesheet =
            scrText.ScrStylesheet(bookNum)
            ?? throw new InvalidDataException($"ScrStylesheet for book number '{bookNum}' is null");
        Dictionary<string, PlatformMarkerStyleInfo> markers = [];
        foreach (var tag in scrStylesheet.Tags)
        {
            if (tag == null)
                continue;
            // Derived end tags and unknown placeholders are not real stylesheet entries:
            // endMarker on the base entry carries closer knowledge (spec: closers are
            // recognized by syntax, not lookup).
            if (
                tag.StyleType == ScrStyleType.scEndStyle
                || tag.StyleType == ScrStyleType.scMilestoneEnd
                || tag.StyleType == ScrStyleType.scUnknownStyle
            )
                continue;
            markers[tag.Marker] = new PlatformMarkerStyleInfo(tag);
        }
        // Default font/size: copy the exact ScrText property reads from PT9
        // CSSCreator.CreateUsfmCss(ScrText, ...) — /home/lyonsm/Paratext/
        // ParatextInternalShared/ScriptureEditor/CSSCreator.cs:96-101.
        return new PlatformStyleInfo(scrText.DefaultFont, scrText.DefaultFontSize, markers);
    }
```
(If `scrText.DefaultFont`/`DefaultFontSize` don't exist under those names in ParatextData, read CSSCreator.cs:96-101 in the PT9 source and use the same accessors it uses — e.g. language/settings-based.)

Registration in `GetFunctions()` — after `retVal.Add(("getMarkerNames", GetMarkerNames));` (line ~149):
```csharp
        retVal.Add(("getStyleInfo", GetStyleInfo));
```

`c-sharp/Projects/ProjectInterfaces.cs` — after `MARKER_NAMES`:
```csharp
    public const string STYLE_INFO = "platformScripture.StyleInfo";
```

`c-sharp/Projects/LocalParatextProjects.cs` — in `s_paratextPublishedProjectInterfaces`, after `ProjectInterfaces.MARKER_NAMES,`:
```csharp
        ProjectInterfaces.STYLE_INFO,
```
(The unpublished list derives from the published one by spread — one edit covers both.)

- [ ] **Step 4: Write the C# tests**

`c-sharp-tests/Projects/ParatextProjectDataProviderStyleInfoTests.cs` — mirror `ParatextProjectDataProviderVersificationTests.cs`'s setup exactly (PapiTestBase, `CreateDummyProject`, `DummyParatextProjectDataProvider`; `DummyScrText` installs a `DummyScrStylesheet` with `AddTag`ed markers — read `c-sharp-tests/DummyScrStylesheet.cs` first and assert against the tags it actually defines):

```csharp
[Test]
public void GetStyleInfo_ReturnsMarkersWithStyleTypes()
{
    var result = _provider.GetStyleInfo(GenesisBookNum);

    Assert.That(result.Markers, Is.Not.Empty);
    Assert.That(result.Markers.ContainsKey("ip"), Is.True);
    Assert.That(result.Markers["ip"].StyleType, Is.EqualTo("paragraph"));
}

[Test]
public void GetStyleInfo_SkipsDerivedEndTags()
{
    var result = _provider.GetStyleInfo(GenesisBookNum);

    Assert.That(result.Markers.Keys.Any(k => k.EndsWith("*")), Is.False);
}
```
Plus a wire-surface assertion in the style of `ParatextProjectDataProviderWireSurfaceTests.cs`:
```csharp
    Assert.That(Client.RegisteredRequestTypes.Any(k => k.EndsWith(".getStyleInfo")), Is.True);
```
(Add it to that existing test file's relevant test rather than duplicating the harness.)

- [ ] **Step 5: Build + run C# tests**

```bash
ls c-sharp/*.csproj c-sharp-tests/*.csproj      # discover exact project names
dotnet build c-sharp/ParanextDataProvider.csproj
dotnet test c-sharp-tests/TestParanextDataProvider.csproj --filter StyleInfo
```
(Adjust csproj names to what `ls` shows.) Expected: build clean; tests PASS.

- [ ] **Step 6: Commit (worktree)**

```bash
git add c-sharp/JsonUtils/PlatformStyleInfo.cs c-sharp/Projects/ParatextProjectDataProvider.cs c-sharp/Projects/ProjectInterfaces.cs c-sharp/Projects/LocalParatextProjects.cs c-sharp-tests/Projects/ParatextProjectDataProviderStyleInfoTests.cs c-sharp-tests/Projects/ParatextProjectDataProviderWireSurfaceTests.cs
git commit -m "feat(platform-scripture): getStyleInfo PDP function serializing merged ScrStylesheet"
```
(Standard trailer.)

---

### Task 11: papi types — `platform-scripture.d.ts` StyleInfo interface

**Repo:** worktree. **Files:**
- Modify: `extensions/src/platform-scripture/src/types/platform-scripture.d.ts`

**Interfaces:**
- Produces: `StyleInfo`/`MarkerStyleInfo` TS types (structurally identical to the library's — duplicated declaration, papi d.ts cannot import the editor package), `StyleInfoProjectInterfaceDataTypes`, `IStyleInfoProjectDataProvider`, registered as `'platformScripture.StyleInfo'` in `ProjectDataProviderInterfaces`.

- [ ] **Step 1: Add the types after the `#region Marker Types` block (line ~959)**

```typescript
  // #region StyleInfo Types

  /** A single marker's stylesheet entry (merged usfm.sty + custom.sty). Units:
   * fontSize/spaceBefore/spaceAfter in points; firstLineIndent/leftMargin/
   * rightMargin in inches; color "#RRGGBB" (omitted when black). Matches the
   * scripture-editors platform-editor `MarkerStyleInfo` shape structurally. */
  export type MarkerStyleInfo = {
    marker: string;
    styleType: 'paragraph' | 'character' | 'note' | 'milestone';
    endMarker?: string;
    occursUnder?: string[];
    rank?: number;
    textType?: string;
    textProperties?: string[];
    notRepeatable?: boolean;
    description?: string;
    fontName?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    smallCaps?: boolean;
    subscript?: boolean;
    superscript?: boolean;
    color?: string;
    justification?: 'left' | 'center' | 'right' | 'both';
    firstLineIndent?: number;
    leftMargin?: number;
    rightMargin?: number;
    spaceBefore?: number;
    spaceAfter?: number;
    lineSpacing?: number;
  };

  /** A project's merged stylesheet plus its default font settings. */
  export type StyleInfo = {
    defaultFont?: string;
    defaultFontSize?: number;
    markers: { [marker: string]: MarkerStyleInfo };
  };

  /** Provides the project's merged stylesheet as StyleInfo */
  export type StyleInfoProjectInterfaceDataTypes = {
    /** The merged stylesheet for the given book number */
    StyleInfo: DataProviderDataType<number, StyleInfo | undefined, never>;
  };

  /** Provides the project's merged stylesheet (usfm.sty + custom.sty) */
  export type IStyleInfoProjectDataProvider =
    IProjectDataProvider<StyleInfoProjectInterfaceDataTypes> & {
      /** Gets the merged stylesheet (usfm.sty + custom.sty) for the book's stylesheet */
      getStyleInfo(bookNum: number): Promise<StyleInfo | undefined>;
      /** Setting is not supported */
      setStyleInfo(
        styleInfo: StyleInfo,
      ): Promise<DataProviderUpdateInstructions<StyleInfoProjectInterfaceDataTypes>>;
      /**
       * Subscribe to run a callback function when the style info changes
       *
       * @param bookNum Tells the provider what changes to listen for
       * @param callback Function to run with the updated style info for this selector
       * @param options Various options to adjust how the subscriber emits updates
       * @returns Unsubscriber function
       */
      subscribeStyleInfo(
        bookNum: number,
        callback: (styleInfo: StyleInfo | undefined | PlatformError) => void,
        options?: DataProviderSubscriberOptions,
      ): Promise<UnsubscriberAsync>;
    };

  // #endregion StyleInfo Types
```

- [ ] **Step 2: Register in the papi augmentation (lines ~2186-2233)**

Add `IStyleInfoProjectDataProvider,` to the `import type { ... } from 'platform-scripture'` list, and to `ProjectDataProviderInterfaces` after the MarkerNames line:
```typescript
    'platformScripture.StyleInfo': IStyleInfoProjectDataProvider;
```

- [ ] **Step 3: Typecheck the extension packages**

```bash
cd extensions && npm run typecheck 2>/dev/null || npx tsc -p src/platform-scripture --noEmit
```
(Discover the exact typecheck script with `grep '"typecheck"' extensions/package.json extensions/src/platform-scripture/package.json`; run what exists.) Expected: clean.

- [ ] **Step 4: Commit (worktree)**

```bash
git add extensions/src/platform-scripture/src/types/platform-scripture.d.ts
git commit -m "feat(platform-scripture): StyleInfo project interface types"
```
(Standard trailer.)

---

### Task 12: Web view wiring — subscription, `options.styleInfo`, CSS injection

**Repo:** worktree, plus one `devpub` from the library repo. **Files:**
- Create: `extensions/src/platform-scripture-editor/src/use-project-stylesheet.hook.ts`
- Modify: `extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx`

**Interfaces:**
- Consumes: `'platformScripture.StyleInfo'` project data (Tasks 10-11); `generateUsjCss`, `EditorOptions.styleInfo` from `@eten-tech-foundation/platform-editor` (Tasks 5, 8 — propagated via yalc).
- Produces: standard view renders with project classification/validation/CSS.

- [ ] **Step 1: Propagate the library (types + runtime) via yalc**

From `/home/lyonsm/scripture-editors`:
```bash
volta run pnpm nx build platform-editor --skip-nx-cache
pnpm -C packages/platform devpub
```
Expected: yalc store updated; `/home/lyonsm/paranext-core-standard-view/node_modules/@eten-tech-foundation/platform-editor/dist/index.d.ts` now exports `generateUsjCss` and `EditorOptions.styleInfo` (verify with `grep -c "styleInfo\|generateUsjCss" .../dist/index.d.ts`). NOTE: `devpub` links into `/home/lyonsm/paranext-core`'s node_modules by default — verify the WORKTREE's node_modules got the update too (worktrees share the repo but not necessarily node_modules); if not, run the repo's link script (`dev-packages.json` `repoLinkScript: "editor"`) or `npx yalc link @eten-tech-foundation/platform-editor` in the worktree root.

- [ ] **Step 2: The stylesheet hook**

`extensions/src/platform-scripture-editor/src/use-project-stylesheet.hook.ts` (mirrors `annotations/use-annotation-stylesheet.hook.ts`):

```typescript
import { generateUsjCss, StyleInfo } from '@eten-tech-foundation/platform-editor';
import { useStylesheet } from 'platform-bible-react';
import { useMemo } from 'react';

/**
 * Injects project-stylesheet-derived CSS (PT9 CSSCreator port) layered after the
 * static usj-nodes.css base, so project styles win where defined (spec §8 stage 4).
 * Standard view only for now (spec non-goal: formatted view keeps current styling).
 */
export function useProjectStylesheet(
  styleInfo: StyleInfo | undefined,
  rtl: boolean,
  enabled: boolean,
): void {
  const css = useMemo(
    () => (enabled && styleInfo ? generateUsjCss(styleInfo, { rtl }) : ''),
    [styleInfo, rtl, enabled],
  );
  useStylesheet(css);
}
```

- [ ] **Step 3: Wire the web view**

In `platform-scripture-editor.web-view.tsx`:

1. Imports: add `StyleInfo` to the `@eten-tech-foundation/platform-editor` import list; `import { useProjectStylesheet } from './use-project-stylesheet.hook';`.
2. After the `currentBookNum` memo (line ~407), add the subscription (mirror the `MarkerNames` consumption pattern from `inventory.web-view.tsx:229`):
```typescript
  const [styleInfoPossiblyError] = useProjectData(
    'platformScripture.StyleInfo',
    projectId ?? undefined,
  ).StyleInfo(currentBookNum, undefined);
  const styleInfo = useMemo(() => {
    if (isPlatformError(styleInfoPossiblyError)) {
      logger.warn(`Error getting style info: ${getErrorMessage(styleInfoPossiblyError)}`);
      return undefined;
    }
    return styleInfoPossiblyError;
  }, [styleInfoPossiblyError]);
```
3. In the `options` useMemo (line ~846): add `styleInfo,` to the object and to the dependency array.
4. Near the `useAnnotationStyleSheet()` call (line ~1278):
```typescript
  useProjectStylesheet(styleInfo, textDirectionEffective === 'rtl', viewType === 'standard');
```

- [ ] **Step 4: FootnoteEditor popover verification**

Read the chain recorded in Phase 3 Task 9: web-view options memo → `editorOptions` → `lib/platform-bible-react/.../footnote-editor.component.tsx:219`. Confirm the popover receives the WHOLE `options` object (only overriding `view.noteMode`) — if so, `styleInfo` flows automatically and nothing changes. If it builds a fresh options object field-by-field, add `styleInfo: options.styleInfo` there and rebuild `lib/platform-bible-react/dist` the same way Phase 3 Task 9 did (the dist is tracked in git).

- [ ] **Step 5: Typecheck + build extensions**

```bash
npm run build:extensions
```
Expected: clean build (this also catches the d.ts/api wiring).

- [ ] **Step 6: Commit (worktree)**

```bash
git add extensions/src/platform-scripture-editor/src/use-project-stylesheet.hook.ts extensions/src/platform-scripture-editor/src/platform-scripture-editor.web-view.tsx
git commit -m "feat(platform-scripture-editor): project StyleInfo -> editor options + generated stylesheet injection"
```
(Standard trailer; include `lib/platform-bible-react` files if Step 4 changed them.)

---

### Task 13: Propagation + Platform.Bible runtime QA + docs wrap

**Repos:** both. No new source files; docs/ledger updates.

- [ ] **Step 1: Full propagation per the runbook**

`docs/superpowers/2026-07-03-paranext-propagation-blocker.md` sequence:
1. Library: `volta run pnpm nx build platform-editor --skip-nx-cache` → `pnpm -C packages/platform devpub` (if any library change landed since Task 12's devpub).
2. Worktree: `npm stop` → `npm run build:extensions` (fresh build — `--watch` won't pick up a yalc swap) → C# rebuild (`dotnet build c-sharp/<csproj>` from Task 10 Step 5) → `refresh.sh` / restart Platform.Bible.

- [ ] **Step 2: Prepare a test custom.sty**

In the SAME test project used for Phase 3 runtime QA (see the runbook/ledger for its name — do NOT use a real translation project), create/edit `custom.sty` in the project folder:

```
\Marker zln
\Name zln - custom link
\StyleType character
\Endmarker zln*
\OccursUnder p q1 q2
\Color 16711680
\Bold

\Marker s1
\Color 255
```
(`\Color 16711680` = COLORREF blue #0000FF; `\Color 255` = red #FF0000 — chosen to be unmistakable. The `s1` entry tests the per-property MERGE: s1 keeps its base properties, gains red.) Restart/reload the project (PT9 parity: stylesheet reload is trigger-driven — reopening the project/editor is the trigger here).

- [ ] **Step 3: Runtime QA checklist (Standard view, editor STATE + computed styles)**

1. `\s1` headings render red (#FF0000) — project CSS injected, custom.sty merge live.
2. Project default font applies inside the editor container (`getComputedStyle` font-family = project font, not Gentium/Charis fallback) — if the project has no explicit font setting, set one first.
3. Type `\zln text\zln* ` in a `\p` paragraph → editor STATE shows a `char` node marker `zln` (stylesheet-first classification beat the z-milestone wildcard); rendered blue.
4. Type `\zfoo ` in body text → paragraph splits; `\zfoo` glyph has `status_unknown` class, bold red.
5. Type `\ft ` in body text → `status_invalid` red underline on the glyphs.
6. Type `\zln ` inside `\s1` (not in its occursUnder) → `status_invalid`.
7. FootnoteEditor popover on a note: marker edits inside the popover classify/validate with the same project sheet.
8. Console: 0 errors; typing latency feels normal (validation pass per commit).
Verify STATE via `root.__lexicalEditor.getEditorState().toJSON()` in the web view console, per the runbook (NOT the collapsed main-editor DOM).

- [ ] **Step 4: Docs + ledger wrap (library repo)**

1. Write `docs/superpowers/specs/2026-07-03-standard-view-phase4-notes.md`: what landed (Parts A/B), QA results, known limitations carried forward, Phase 5 handoff pointers (menu + filtering API consuming `StyleInfo`; formatted-view CSS follow-up; zoom option unused pending host zoom decision).
2. Update `.superpowers/sdd/progress.md` Phase 4 section to complete.

```bash
git add -f docs/superpowers/specs/2026-07-03-standard-view-phase4-notes.md
git add .superpowers/sdd/progress.md
git commit -m "docs: Phase 4 complete — StyleInfo integration notes + ledger"
```
(Standard trailer. Worktree commits stay on its `standard-view` branch; do NOT push either repo without explicit user approval.)

---

## Self-review notes (already applied)

- **Spec coverage:** types+lookup (T1), rich bundled default (T2), stylesheet-first tokenizer + PT9 unknowns + unmatched (T3), Tier-1/Tier-2 threading + relaxed para guard (T4), options threading (T5), validation core + plugin + CSS (T6-7), CSS generator (T8), C# + d.ts + web view + QA (T10-13). Spec's "known unmatched closers" gap is folded into T3 (same PT9 mechanism as unknown closers — extends the approved tokenizer-alignment decision to all unmatched end tokens, which spec §5.1's `.invalid` styling already anticipated).
- **Type consistency:** `MarkerLookup = (marker: string) => Marker | undefined` everywhere; `Tier2Context` is the base of `MarkerEditContext`; `$requestTier2ForNode(node, context)` in all 11 call sites; `StyleInfo` field names identical across shared TS / d.ts / C# DTO (camelCase on the wire, dictionary keys raw).
- **Known risks:** (1) generator `outputPath` landing spot — T2 Step 6 has the dry-run discovery + fallback; (2) `scrText.DefaultFont` accessor name — T10 points at CSSCreator.cs:96-101 as the authoritative source; (3) worktree yalc linkage — T12 Step 1 verifies before wiring; (4) validation pass per commit is O(document) — accepted for chapter-sized docs, noted as a follow-up if book-sized docs land.
