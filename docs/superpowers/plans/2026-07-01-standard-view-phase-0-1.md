# Standard View — Phases 0+1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish round-trip integrity for Standard view (Phase 0) and make the `standard` view mode render end-to-end in the editor library and demo (Phase 1).

**Architecture:** Standard view = `{ markerMode: "editable", noteMode: "collapsed", hasSpacing: true, isFormattedFont: true }`. This plan adds the view mode, fixes the known verse-number corruption, builds a USX-sourced corpus round-trip harness that discovers/records adaptor gaps, decouples note-caller rendering from marker mode, and ships the PT9 marker look. Spec: `docs/superpowers/specs/2026-07-01-standard-view-design.md` (§3, §5.1 verse bullet, §7, §10, §12 Phases 0–1).

**Tech Stack:** TypeScript, Lexical 0.43, Vitest, Nx + pnpm. Repo: `/home/lyonsm/scripture-editors`, branch `standard-view`.

## Global Constraints

- All work on branch `standard-view` in `/home/lyonsm/scripture-editors`. Never commit to `platform-yalc` or `main`. Never push.
- Run tasks through Nx with pnpm: `pnpm nx test <project>`, `pnpm nx run-many -t lint`, `pnpm nx run-many -t extract-api`. A PreToolUse hook fixes Volta paths automatically.
- Projects: `shared` = libs/shared, `shared-react` = libs/shared-react, `platform` = packages/platform, `utilities` = packages/utilities.
- To pass a file filter to Vitest through Nx: `pnpm nx test <project> -- <file-substring>`.
- `docs/superpowers/` is gitignored — use `git add -f` for files under it.
- A lint-staged hook runs prettier on commit; expect files to be reformatted. If the hook prints a FAILED line about ignored `docs/superpowers` paths, the commit itself still succeeds — verify with `git log -1 --stat`.
- Code style: prefer `undefined` over `null`; construct Lexical nodes via `$create<X>Node` helpers; never call `editor.update()` from inside a listener; in Lexical tests chain `.append(...)` inside `$getRoot().append(...)`.
- After changing any package's public API (exports, exported types), run `pnpm nx extract-api <project>` and commit the updated API report with the change.
- Commit messages end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca`
- The Phase 0 findings document is `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`. Corpus failures that are not fixed in-task MUST be recorded there (template in Task 4). It feeds the Phase 2+ plans.

---

### Task 1: Add the `standard` view mode

**Files:**
- Modify: `libs/shared-react/src/views/view-mode.model.ts`
- Modify: `libs/shared-react/src/views/view-options.utils.ts`
- Create: `libs/shared-react/src/views/view-options.utils.test.ts`
- Modify: `packages/platform/src/index.ts` (re-export)
- Modify: `packages/platform/src/editor/editor.model.ts` (stale TSDoc)

**Interfaces:**
- Consumes: existing `ViewMode`, `ViewOptions`, `getViewOptions`, `getViewMode` in `view-options.utils.ts`.
- Produces: `STANDARD_VIEW_MODE = "standard"` (exported from `shared-react` and from `@eten-tech-foundation/platform-editor`); `getViewOptions("standard")` returns `{ markerMode: "editable", noteMode: "collapsed", hasSpacing: true, isFormattedFont: true }`; `getViewMode` returns `"standard"` for exactly that combination. Later tasks call `getViewOptions(STANDARD_VIEW_MODE)`.

- [ ] **Step 1: Write the failing test**

Create `libs/shared-react/src/views/view-options.utils.test.ts`:

```ts
import { getViewOptions, getViewMode, getVerseNodeClass, ViewOptions } from "./view-options.utils";
import {
  FORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  viewModeToViewNames,
} from "./view-mode.model";
import { VerseNode } from "shared";

describe("standard view mode", () => {
  it("maps 'standard' to editable markers with collapsed notes and formatting", () => {
    expect(getViewOptions(STANDARD_VIEW_MODE)).toEqual({
      markerMode: "editable",
      noteMode: "collapsed",
      hasSpacing: true,
      isFormattedFont: true,
    });
  });

  it("inverts standard view options back to the 'standard' mode", () => {
    const viewOptions = getViewOptions(STANDARD_VIEW_MODE);
    expect(getViewMode(viewOptions)).toBe(STANDARD_VIEW_MODE);
  });

  it("keeps getViewMode invertible for all named modes", () => {
    for (const mode of [
      FORMATTED_VIEW_MODE,
      UNFORMATTED_VIEW_MODE,
      PARAGRAPH_STRUCTURE_VIEW_MODE,
      STANDARD_VIEW_MODE,
    ] as const) {
      expect(getViewMode(getViewOptions(mode))).toBe(mode);
    }
  });

  it("has a display name", () => {
    expect(viewModeToViewNames[STANDARD_VIEW_MODE]).toBe("Standard");
  });

  it("uses the editable VerseNode class in standard view", () => {
    expect(getVerseNodeClass(getViewOptions(STANDARD_VIEW_MODE))).toBe(VerseNode);
  });

  it("does not misclassify unformatted as standard", () => {
    const unformatted: ViewOptions | undefined = getViewOptions(UNFORMATTED_VIEW_MODE);
    expect(getViewMode(unformatted)).toBe(UNFORMATTED_VIEW_MODE);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm nx test shared-react -- view-options.utils`
Expected: FAIL — `STANDARD_VIEW_MODE` is not exported (compile error).

- [ ] **Step 3: Implement the view mode**

In `libs/shared-react/src/views/view-mode.model.ts`, after the `PARAGRAPH_STRUCTURE_VIEW_MODE` block, add:

```ts
/**
 * Constant representing the standard view mode (PT9 "Standard" equivalent).
 * Displays formatted text with USFM markers visible inline as editable text and
 * notes collapsed to callers.
 *
 * @public
 */
export const STANDARD_VIEW_MODE = "standard";
```

and add to the map:

```ts
export const viewModeToViewNames = {
  [FORMATTED_VIEW_MODE]: "Formatted",
  [UNFORMATTED_VIEW_MODE]: "Unformatted",
  [PARAGRAPH_STRUCTURE_VIEW_MODE]: "Paragraph Structure",
  [STANDARD_VIEW_MODE]: "Standard",
};
```

In `libs/shared-react/src/views/view-options.utils.ts`:

1. Add `STANDARD_VIEW_MODE` to the import from `./view-mode.model`.
2. Add a case in `getViewOptions` (after the `PARAGRAPH_STRUCTURE_VIEW_MODE` case):

```ts
    case STANDARD_VIEW_MODE:
      viewOptions = {
        markerMode: "editable",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
      };
      break;
```

3. Add a branch in `getViewMode` before the `UNFORMATTED_VIEW_MODE` check. Note the existing function does NOT destructure `noteMode` — add it:

```ts
  const {
    markerMode,
    noteMode,
    hasSpacing,
    isFormattedFont,
    hasGutterParaMarkers,
    hasActiveTextFocusBox,
  } = viewOptions;
```

and the new branch:

```ts
  if (
    markerMode === "editable" &&
    noteMode === "collapsed" &&
    hasSpacing &&
    isFormattedFont &&
    !hasGutterParaMarkers &&
    !hasActiveTextFocusBox
  )
    return STANDARD_VIEW_MODE;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm nx test shared-react -- view-options.utils`
Expected: PASS (all 6 tests). Then run the full project to catch regressions: `pnpm nx test shared-react`
Expected: PASS.

- [ ] **Step 5: Re-export from the platform package and fix the stale TSDoc**

In `packages/platform/src/index.ts`, find the view exports block (it re-exports `PARAGRAPH_STRUCTURE_VIEW_MODE`, `getViewOptions`, `viewModeToViewNames`, etc. around lines 40–49) and add `STANDARD_VIEW_MODE` to the same export list.

In `packages/platform/src/editor/editor.model.ts`, find the `view?: ViewOptions` TSDoc on `EditorOptions` (~lines 204–210) that says the formatted view is "currently the only functional option" / EXPERIMENTAL. Replace that sentence so it reads:

```ts
  /**
   * View options of the editor. Defaults to the formatted view mode. Named modes:
   * "formatted", "unformatted", "paragraph-structure", "standard".
   */
```

(Keep the property and surrounding structure unchanged.)

- [ ] **Step 6: Update API reports**

Run: `pnpm nx extract-api shared-react && pnpm nx extract-api platform`
Expected: both succeed; `*.api.md` report files updated to include `STANDARD_VIEW_MODE`.

- [ ] **Step 7: Typecheck, lint, commit**

Run: `pnpm nx run-many -t typecheck -p shared-react platform && pnpm nx run-many -t lint -p shared-react platform`
Expected: PASS.

```bash
git add libs/shared-react/src/views/ packages/platform/src/index.ts packages/platform/src/editor/editor.model.ts
git add -A '*.api.md'
git commit -m "feat: add standard view mode (formatted + editable markers + collapsed notes)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 2: Fix verse-number parsing for bridges and segments

**Files:**
- Modify: `libs/shared/src/nodes/usj/node.utils.ts` (function `parseNumberFromMarkerText`, ~line 397)
- Modify: `libs/shared/src/nodes/usj/node-utils.test.ts`

**Interfaces:**
- Consumes: `openingMarkerText(marker)` (same file); `NBSP` constant (exported from `shared`, value `" "`).
- Produces: `parseNumberFromMarkerText(marker: string, text: string | undefined, number: string): string` — same signature, now returns the full verse-number token (`"1-2"`, `"5a"`, `"1a-2b"`, `"1,3"`) instead of `parseInt`'s truncation. Callers in `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` (`createChapterMarker`, `createVerseMarker`) need no change.

**Background:** the current implementation is

```ts
const numberText = parseInt(text.slice(openMarkerText.length), 10);
if (!isNaN(numberText)) number = numberText.toString();
```

so `\v 1-2` → `"1"` and `\v 5a` → `"5"` — silent data corruption in editable mode (spec §5.1). The editable verse text is built by `getVisibleOpenMarkerText` as `\v` + NBSP + number + space, so the parser must skip NBSP and regular spaces after the marker.

- [ ] **Step 1: Write the failing tests**

In `libs/shared/src/nodes/usj/node-utils.test.ts`, find the existing `parseNumberFromMarkerText` tests (~lines 182–190) and add in the same `describe`:

```ts
  it("preserves verse bridges", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}1-2 `, "9")).toBe("1-2");
  });

  it("preserves verse segments", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}5a `, "9")).toBe("5a");
  });

  it("preserves segmented bridges", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}1a-2b `, "9")).toBe("1a-2b");
  });

  it("preserves comma-separated verse lists", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}1,3 `, "9")).toBe("1,3");
  });

  it("still parses plain integers with a regular space separator", () => {
    expect(parseNumberFromMarkerText("v", "\\v 12 ", "9")).toBe("12");
  });

  it("falls back to the default when no number is present", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}`, "9")).toBe("9");
  });
```

If `NBSP` is not already imported in the test file, add it to the existing `shared`-internal import (it is exported from `libs/shared/src/nodes/usj/node-constants.ts`; match the import style already used in this test file).

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm nx test shared -- node-utils`
Expected: the four bridge/segment/list tests FAIL (`"1"` !== `"1-2"` etc.); integer tests PASS.

- [ ] **Step 3: Implement the fix**

Replace the body of `parseNumberFromMarkerText` in `libs/shared/src/nodes/usj/node.utils.ts`:

```ts
export function parseNumberFromMarkerText(
  marker: string,
  text: string | undefined,
  number: string,
): string {
  const openMarkerText = openingMarkerText(marker);
  if (text?.startsWith(openMarkerText)) {
    // Skip the NBSP/space separator inserted by `getVisibleOpenMarkerText`.
    const rest = text.slice(openMarkerText.length).replace(/^[\s ]+/, "");
    // Full verse-number token: digits + optional segment letter, optionally
    // bridged (-) or listed (,) with more of the same. E.g. 12, 5a, 1-2, 1a-2b, 1,3.
    const match = /^(\d+[a-zA-Z]?(?:[-,]\d+[a-zA-Z]?)*)/.exec(rest);
    if (match) number = match[1];
  }
  return number;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared -- node-utils`
Expected: PASS. Then guard against regressions in the adaptors that call this function:
Run: `pnpm nx test shared && pnpm nx test platform`
Expected: PASS. If an existing platform adaptor test asserted the truncating behavior, the truncation was the bug — update that test's expectation to the full token and note it in the commit message.

- [ ] **Step 5: Update API report and commit**

Run: `pnpm nx extract-api shared`
Expected: report may be unchanged (signature identical); commit whatever changed.

```bash
git add libs/shared/src/nodes/usj/node.utils.ts libs/shared/src/nodes/usj/node-utils.test.ts
git add -A '*.api.md'
git commit -m "fix: preserve verse bridges/segments in parseNumberFromMarkerText

parseInt truncated '1-2' to '1' and '5a' to '5', corrupting verse numbers
on every editable-mode serialization even without an edit to that verse.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 3: Corpus round-trip harness with baseline fixtures

**Files:**
- Create: `packages/platform/src/editor/adaptors/corpus/corpus-data.ts`
- Create: `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts`
- Create: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`

**Interfaces:**
- Consumes: `usxStringToUsj(usxString: string): Usj` from `@eten-tech-foundation/scripture-utilities`; `serializeEditorState(usj, viewOptions)`, `initialize(nodeOptions, logger)`, `reset(callerCount?)` from `../usj-editor.adaptor`; `deserializeSerializedEditorState(state): Usj | undefined`, `initialize(logger)` from `../editor-usj.adaptor`; `getViewOptions`, `STANDARD_VIEW_MODE`, `FORMATTED_VIEW_MODE`, `UNFORMATTED_VIEW_MODE`, `PARAGRAPH_STRUCTURE_VIEW_MODE` from `shared-react`; `HANDBOOK_VALID_MARKERS` from `../handbook-markers`.
- Produces: `corpusFixtures: CorpusFixture[]` where `interface CorpusFixture { name: string; usx: string; skipModes?: string[] }`. Tasks 4–5 append fixtures to this array. The test file is data-driven; adding a fixture requires no test changes.

- [ ] **Step 1: Create the fixture module with baseline fixtures**

Create `packages/platform/src/editor/adaptors/corpus/corpus-data.ts`:

```ts
/**
 * Round-trip corpus for Standard view (spec §7/§10, Phase 0).
 * Fixtures are authored as USX and converted to USJ at test time via
 * `usxStringToUsj`, guaranteeing shape-valid USJ.
 */

export interface CorpusFixture {
  /** Unique fixture name, used as the test name. */
  name: string;
  /** USX 3.0 document string. */
  usx: string;
  /**
   * View modes to skip with a reason, e.g. while a failure is recorded in the
   * findings doc. Format: "<mode>: <reason>". Empty/absent = run all modes.
   */
  skipModes?: string[];
}

const USX_HEADER = `<usx version="3.0">
  <book code="RUT" style="id">Corpus fixture</book>
  <para style="mt1">Ruth</para>`;
const USX_FOOTER = `</usx>`;

/** Wrap chapter-level USX content in a minimal valid book. */
function book(content: string): string {
  return `${USX_HEADER}\n  <chapter number="1" style="c" />\n${content}\n${USX_FOOTER}`;
}

export const corpusFixtures: CorpusFixture[] = [
  {
    name: "baseline: paragraphs, verses, char markers",
    usx: book(`<para style="s1">Naomi Loses Her Husband and Sons</para>
  <para style="p"><verse number="1" style="v" />In the days when the judges ruled there was a famine in the land. <char style="nd">Lord</char> <verse number="2" style="v" />The name of the man was Elimelek.</para>
  <para style="q1"><verse number="3" style="v" />Poetry line one</para>
  <para style="q2">poetry line two</para>`),
  },
  {
    name: "baseline: footnote and cross-reference",
    usx: book(`<para style="p"><verse number="1" style="v" />Text before<note caller="+" style="f"><char style="fr">1.1 </char><char style="ft">A footnote text.</char></note> and after.
  <verse number="2" style="v" />More<note caller="-" style="x"><char style="xo">1.2 </char><char style="xt">Gen 1.1</char></note> text.</para>`),
  },
  {
    name: "baseline: nested char markers",
    usx: book(`<para style="p"><verse number="1" style="v" /><char style="add">added <char style="nd">Lord</char> text</char> plain.</para>`),
  },
];
```

- [ ] **Step 2: Create the data-driven round-trip test**

Create `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts`:

```ts
import { corpusFixtures } from "./corpus-data";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../editor-usj.adaptor";
import { HANDBOOK_VALID_MARKERS } from "../handbook-markers";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
} from "shared-react";

const VIEW_MODES = [
  STANDARD_VIEW_MODE,
  FORMATTED_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
] as const;

describe("corpus round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize({ extraValidMarkers: HANDBOOK_VALID_MARKERS }, undefined);
    initializeDeserialize(undefined);
  });

  for (const fixture of corpusFixtures) {
    for (const viewMode of VIEW_MODES) {
      const skip = fixture.skipModes?.find((entry) => entry.startsWith(`${viewMode}:`));
      const run = skip ? it.skip : it;
      run(`${fixture.name} [${viewMode}]${skip ? ` (${skip})` : ""}`, () => {
        const usj = usxStringToUsj(fixture.usx);
        reset();
        const editorState = serializeEditorState(usj, getViewOptions(viewMode));
        const roundTripped = deserializeSerializedEditorState(editorState);
        expect(roundTripped).toEqual(usj);
      });
    }
  }
});
```

- [ ] **Step 3: Run the harness**

Run: `pnpm nx test platform -- corpus-round-trip`
Expected: 12 tests (3 fixtures × 4 modes). Baseline fixtures are exercising code paths the existing adaptor tests already cover, so expect PASS. If any baseline test FAILS, that is a real Phase 0 finding: apply the triage protocol from Task 4 Step 3 before proceeding (do not weaken the assertion).

Note: this harness asserts USJ deep-equality. Normalized-USFM *byte* equality (spec §10) requires the C#-side converter and is recorded as out of TS-repo scope in the findings doc header (Step 4) — it lands with host-side testing in a later phase.

- [ ] **Step 4: Create the findings document**

Create `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`:

```markdown
# Standard View Phase 0 — Round-Trip Findings

Corpus: `packages/platform/src/editor/adaptors/corpus/`. Each entry below is a
round-trip failure discovered by the harness and NOT fixed in its discovery
task, with enough detail to plan the fix. Format per finding:

## <fixture name> [<view mode>]

- **Symptom:** (assertion diff summary — what property/content changed or was lost)
- **Suspected site:** (adaptor function, file:line)
- **Severity:** data-loss | data-change | cosmetic
- **Disposition:** fix-in-phase-0 | phase-2-engine | needs-node-type (spec §7 opaque blocks)

---

Known scope limitation: normalized-USFM byte equality (spec §10) is not
assertable in this repo (no TS USFM serializer); USJ deep-equality is the
Phase 0 proxy. Byte-level verification happens host-side in a later phase.
```

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/adaptors/corpus/
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "test: add USX-sourced corpus round-trip harness for standard view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 4: Corpus fixtures — verse/chapter numbering and inline constructs

**Files:**
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-data.ts`
- Modify (only if a fix is made): adaptor/node files identified by triage
- Modify (only if failures recorded): `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`

**Interfaces:**
- Consumes: `CorpusFixture`, `corpusFixtures`, `book()` from Task 3.
- Produces: six more fixtures in `corpusFixtures`; findings entries for any unfixed failure.

- [ ] **Step 1: Add the fixtures**

Append to `corpusFixtures` in `corpus-data.ts`:

```ts
  {
    name: "verse bridges and segments",
    usx: book(`<para style="p"><verse number="1-2" style="v" />Bridged verse text. <verse number="3a" style="v" />Segment a. <verse number="3b" style="v" />Segment b. <verse number="4a-5b" style="v" />Segmented bridge.</para>`),
  },
  {
    name: "alternate and publishing chapter/verse numbers (ca/cp/va/vp)",
    usx: `${USX_HEADER}
  <chapter number="1" style="c" altnumber="2" pubnumber="A" />
  <para style="p"><verse number="1" style="v" altnumber="2" pubnumber="1b" />Text with alternate numbering.</para>
${USX_FOOTER}`,
  },
  {
    name: "cross-reference ref target",
    usx: book(`<para style="p"><verse number="1" style="v" />See <ref loc="GEN 1:1">Genesis 1:1</ref> for details.</para>`),
  },
  {
    name: "optional line break (optbreak)",
    usx: book(`<para style="p"><verse number="1" style="v" />First part<optbreak />second part.</para>`),
  },
  {
    name: "milestones (ts)",
    usx: book(`<para style="p"><ms style="ts-s" /><verse number="1" style="v" />Translator section text.<ms style="ts-e" /></para>`),
  },
  {
    name: "RTL text (Hebrew)",
    usx: book(`<para style="p"><verse number="1" style="v" />וַיְהִ֗י בִּימֵי֙ שְׁפֹ֣ט הַשֹּׁפְטִ֔ים <char style="nd">יהוה</char> וַיְהִ֥י רָעָ֖ב׃</para>`),
  },
```

Note: the `ca/cp/va/vp` fixture requires exporting `USX_HEADER`/`USX_FOOTER` from `corpus-data.ts` if you kept them module-private — export them (they are consumed again in Task 5).

- [ ] **Step 2: Run the harness**

Run: `pnpm nx test platform -- corpus-round-trip`
Expected: 36 tests. The `verse bridges and segments` fixture MUST pass in all modes (Task 2 fixed the parser — if it fails here, the Task 2 fix is incomplete for this path; fix it now, this is in-scope, not a finding). Others may fail — apply Step 3.

- [ ] **Step 3: Triage protocol (applies to every corpus task)**

For each failing `fixture × mode`:

1. Read the assertion diff. Classify:
   - **Property-preservation gap** (an attribute like `altnumber`, `pubnumber`, `loc`, `sid`, `category`, `closed` is dropped or an element's content is restructured): attempt an in-task fix following the existing pattern — the adaptors preserve attributes by listing them in the create functions (`createVerseMarker`, `createCharMarker`, etc. in `editor-usj.adaptor.ts`) and their forward counterparts in `usj-editor.adaptor.ts`; unknown attributes flow through `getUnknownAttributes`/`unknownAttributes`. Use the `superpowers:systematic-debugging` skill; keep the diff minimal; every fix gets its own targeted unit test in the adaptor test file (`usj-editor-adaptor.test.ts` or `editor-usj-adaptor.test.ts`) in addition to the now-green corpus test.
   - **Missing node type / structural** (content falls into unknown handling and loses structure — expected for Task 5 constructs): do NOT build a node type (spec §7 defers that). If content is *lossless but restructured*, record severity `data-change`; if content is *dropped*, severity `data-loss`. Add `skipModes: ["<mode>: recorded in findings"]` for exactly the failing modes and write a findings entry (template in the findings doc).
2. Never delete a fixture, never loosen `toEqual`, never add a `skipModes` entry without a findings entry.
3. Re-run `pnpm nx test platform -- corpus-round-trip` until every test is green or skipped-with-finding.

- [ ] **Step 4: Full-suite check and commit**

Run: `pnpm nx test platform && pnpm nx test shared && pnpm nx test shared-react`
Expected: PASS.

```bash
git add packages/platform/src/editor/adaptors/
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "test: corpus fixtures for verse numbering, ref, optbreak, milestones, RTL

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

(If adaptor fixes were made, name them in the commit body.)

---

### Task 5: Corpus fixtures — opaque-block constructs (tables, figures, sidebars, periph, unclosed notes)

**Files:**
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-data.ts`
- Modify (only if a fix is made): adaptor/node files identified by triage
- Modify: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`

**Interfaces:**
- Consumes: `CorpusFixture`, `corpusFixtures`, `book()`, `USX_HEADER`/`USX_FOOTER`, triage protocol from Task 4 Step 3.
- Produces: five more fixtures; a findings entry per unfixed failure. This task is the spec's acceptance-criterion probe: *"loading and saving a book containing a table, figure, or sidebar is lossless."*

- [ ] **Step 1: Add the fixtures**

```ts
  {
    name: "table with header and cells",
    usx: book(`<para style="p"><verse number="1" style="v" />Before the table.</para>
  <table><row style="tr"><cell style="th1" align="start">Day</cell><cell style="th2" align="start">Tribe</cell></row>
  <row style="tr"><cell style="tc1" align="start">First</cell><cell style="tc2" align="start">Judah</cell></row></table>
  <para style="p">After the table.</para>`),
  },
  {
    name: "figure (USFM 3 attributes)",
    usx: book(`<para style="p"><verse number="1" style="v" />Text with figure.<figure style="fig" file="cn01617.jpg" size="span" ref="1:31">At once they left their nets.</figure>More text.</para>`),
  },
  {
    name: "sidebar (esb)",
    usx: book(`<para style="p"><verse number="1" style="v" />Main text.</para>
  <sidebar style="esb" category="History"><para style="p">Sidebar paragraph content.</para></sidebar>
  <para style="p">Continues after sidebar.</para>`),
  },
  {
    name: "periph",
    usx: `<usx version="3.0">
  <book code="FRT" style="id">Front matter</book>
  <periph id="title" alt="Title Page"><para style="mt1">The Title</para></periph>
${USX_FOOTER}`,
  },
  {
    name: "unclosed note (closed=false)",
    usx: book(`<para style="p"><verse number="1" style="v" />Text<note caller="+" style="f" closed="false"><char style="fr">1.1 </char><char style="ft">Unterminated note</char></note></para>`),
  },
```

- [ ] **Step 2: Run and triage**

Run: `pnpm nx test platform -- corpus-round-trip`
Expected: 56 tests. Failures here are the spec's predicted unknown-node territory. Apply the Task 4 Step 3 triage protocol strictly. Expected outcome mix:
- Attribute drops (e.g. `align`, `category`, `closed`) → fix in-task if the fix is attribute plumb-through in the two adaptors; each fix gets a targeted adaptor unit test.
- Structural losses (e.g. table flattened, periph discarded by `usxStringToUsj` itself) → findings entries with `Disposition: needs-node-type` or `fix-in-phase-0`. If `usxStringToUsj` itself cannot represent a construct (compare `usxStringToUsj(fixture.usx)` output against the USX by eye first), record that as its own finding — it is upstream of the editor adaptors and decides whether the opaque-block work (spec §7) needs converter changes too.

- [ ] **Step 3: Verify the acceptance-criterion status is explicit**

At the bottom of the findings doc, add a status line (edit to match reality):

```markdown
## Acceptance criterion status (spec §7)

Table / figure / sidebar / periph / unclosed-note round-trip in `standard` mode:
<N> of 5 lossless as of this task. Failing constructs and dispositions listed above.
```

- [ ] **Step 4: Full-suite check and commit**

Run: `pnpm nx test platform && pnpm nx test shared && pnpm nx test shared-react`
Expected: PASS (with documented skips only).

```bash
git add packages/platform/src/editor/adaptors/
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "test: corpus fixtures for tables, figures, sidebars, periph, unclosed notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 6: Un-skip the editable-mode delta round-trip test

**Files:**
- Modify: `libs/shared-react/src/plugins/usj/collab/editor-delta.adaptor.test.tsx` (the `it.skip("should roundtrip the editor state in editable mode", ...)` — search by name, currently ~line 761)
- Modify (as diagnosed): `libs/shared-react/src/plugins/usj/collab/` delta adaptor sources
- Modify (only if failure recorded instead): `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`

**Interfaces:**
- Consumes: existing test fixtures `editorStateGen1v1Editable`, `opsGen1v1Editable` from `packages/utilities/src/converters/usj/converter-test.data.ts`; `getEditorDelta` and `testEnvironment` from the test file itself.
- Produces: the editable-mode round-trip test running green (or a precise findings entry if the fix exceeds this task's boundary — see Step 3). This is the spec's chief-unverified-risk probe (§10, §11 risk 1).

- [ ] **Step 1: Un-skip and run**

Change `it.skip("should roundtrip the editor state in editable mode"` to `it(`. Leave the two sibling skipped tests (`with unknown items`, `with nonstandard features`) skipped — they are separate scopes.

Run: `pnpm nx test shared-react -- editor-delta`
Expected: capture the exact failure output. If it PASSES outright, the skip was stale: proceed directly to Step 4.

- [ ] **Step 2: Diagnose**

Use the `superpowers:systematic-debugging` skill. Constraints on any fix:
- The fix must live in the delta adaptor or its fixtures — determine first whether the *expected ops fixture* (`opsGen1v1Editable`) is wrong (fixtures were regenerated at some point; check `git log --oneline -- packages/utilities/src/converters/usj/converter-test.data.ts` for regeneration commits) or the *adaptor* mishandles editable-mode nodes (MarkerNode text, editable VerseNode).
- If the fixture is wrong: correct the fixture by deriving expected ops from the current (verified-by-Task-3-harness) serialization, and say so in the commit message.
- If the adaptor is wrong: minimal fix + a focused regression test for the specific node type it mishandled.
- Do not modify non-collab code paths to make a collab test pass.

- [ ] **Step 3: Boundary rule**

If diagnosis shows the fix requires redesigning the delta adaptor (multi-file, >~100-line change), STOP: record a findings entry (`Disposition: phase-2-engine`, with the diagnosis), restore the `it.skip`, and let the plan's reviewer decide. Do not half-land a redesign inside this task.

- [ ] **Step 4: Verify and commit**

Run: `pnpm nx test shared-react`
Expected: PASS, editable round-trip test included and green (or Step 3 taken).

```bash
git add libs/shared-react/src/plugins/usj/collab/ packages/utilities/src/converters/usj/converter-test.data.ts
git commit -m "test: enable editable-mode delta round-trip test

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 7: Decouple note-caller rendering from marker mode

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` (function `createNote`, ~line 424)
- Modify: `libs/shared-react/src/nodes/usj/node-react.utils.ts` (function `$createWholeNote`, ~line 234 — the comment on `createNote` says to keep them in sync)
- Modify: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`

**Interfaces:**
- Consumes: `getViewOptions(STANDARD_VIEW_MODE)` (Task 1); existing `createNoteCaller`, `createMarker`, `createText`, `getEditableCallerText`, `NBSP`.
- Produces: in standard view (markerMode `"editable"` + noteMode `"collapsed"`), notes render with an atomic `ImmutableNoteCallerNode` (collapsed-caller UX) instead of plain editable caller text. Rule: **editable caller text only when `markerMode === "editable"` AND `noteMode === "expanded"`** (preserves Unformatted view); every other combination gets the caller node. Reverse adaptor must round-trip both shapes (verified by the corpus harness which runs all four modes).

- [ ] **Step 1: Write the failing test**

In `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`, next to the existing editable-mode tests (`it("should render editable caller text and markers in editable mode", ...)` ~line 250), add:

```ts
  it("renders an atomic note caller with editable markers in standard view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions("standard"));

    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX] as SerializedParaNode;
    const note = notePara.children[NOTE_INDEX] as SerializedNoteNode;
    // Children: opening MarkerNode, ImmutableNoteCallerNode, NBSP text, content..., closing MarkerNode
    expect(isSerializedMarkerNode(note.children[0])).toBe(true);
    expect(isSerializedImmutableNoteCallerNode(note.children[1])).toBe(true);
    expect(isSerializedMarkerNode(note.children[note.children.length - 1])).toBe(true);
    expect(note.isCollapsed).toBe(true);
  });

  it("still renders editable caller text in unformatted view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX] as SerializedParaNode;
    const note = notePara.children[NOTE_INDEX] as SerializedNoteNode;
    expect(note.children.some((child) => isSerializedImmutableNoteCallerNode(child))).toBe(false);
  });
```

Adjust the exact child-index assertions after inspecting the current `createNote` output shape (the fixture indexes like `NOTE_PARA_INDEX`/`NOTE_INDEX` are already imported at the top of this file; verify `note.isCollapsed` is the serialized property name by checking `SerializedNoteNode` in `libs/shared/src/nodes/usj/NoteNode.ts` — if the serialized field differs, assert the actual field).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test platform -- usj-editor-adaptor`
Expected: first new test FAILS (editable mode currently always uses plain caller text); second PASSES.

- [ ] **Step 3: Implement in `createNote`**

In `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts`, `createNote` currently branches the caller on marker mode:

```ts
  let callerNode: SerializedImmutableNoteCallerNode | SerializedTextNode;
  if (openingMarkerNode) children.push(openingMarkerNode);
  if (_viewOptions?.markerMode === "editable") {
    callerNode = createText(getEditableCallerText(caller));
    children.push(callerNode, ...childNodes);
  } else {
    ...
```

Change the condition so plain editable caller text is used only when notes are expanded:

```ts
  let callerNode: SerializedImmutableNoteCallerNode | SerializedTextNode;
  if (openingMarkerNode) children.push(openingMarkerNode);
  if (_viewOptions?.markerMode === "editable" && _viewOptions?.noteMode === "expanded") {
    callerNode = createText(getEditableCallerText(caller));
    children.push(callerNode, ...childNodes);
  } else {
    const spaceNode = createText(NBSP);
    callerNode = createNoteCaller(caller, childNodes);
    children.push(callerNode, spaceNode, ...childNodes.flatMap(addSpaceNodes(spaceNode)));
  }
```

(The `else` branch is unchanged — shown for placement.)

- [ ] **Step 4: Mirror in `$createWholeNote`**

In `libs/shared-react/src/nodes/usj/node-react.utils.ts` (~line 248 and ~258) apply the same condition change to both `viewOptions?.markerMode === "editable"` branches that select caller representation. Read the function first — mirror the adaptor rule exactly: editable caller text only when `markerMode === "editable" && noteMode === "expanded"`. (The opening/closing marker-node branches keyed on `markerMode` alone stay as they are — markers remain editable in standard view; only the *caller* choice changes.)

- [ ] **Step 5: Run tests**

Run: `pnpm nx test platform -- usj-editor-adaptor && pnpm nx test platform -- corpus-round-trip`
Expected: PASS — including the corpus `standard` mode, which now exercises reverse-adaptor round-trip of caller-node-with-editable-markers notes. If the corpus standard-mode note fixture fails after this change, the reverse adaptor's `createNoteMarker` mishandles the new child shape: fix it there (it must derive the caller from the `ImmutableNoteCallerNode` child exactly as it already does for non-editable modes) with a targeted test in `editor-usj-adaptor.test.ts`.

Then full suites: `pnpm nx test platform && pnpm nx test shared-react`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/adaptors/ libs/shared-react/src/nodes/usj/node-react.utils.ts
git commit -m "feat: key note-caller rendering off noteMode, not markerMode

Standard view (editable markers + collapsed notes) now gets atomic
collapsed callers; unformatted view (expanded notes) keeps editable
caller text.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 8: PT9 marker look — CSS polish for editable markers in formatted context

**Files:**
- Modify: `packages/platform/src/usj-nodes.css` (marker-mode section, ~lines 2048–2065)

**Interfaces:**
- Consumes: existing classes: `.marker` (on `MarkerNode` DOM), `.marker-editable` + `.formatted-font` (mode classes on the contenteditable, from `getViewClassList`), `.verse`, `.chapter`.
- Produces: CSS-only change. In standard view (both `formatted-font` and `marker-editable` present) markers render PT9-style: small (0.7em), grey, bidi-isolated; verse spans don't wrap. Unformatted view (`marker-editable` without `formatted-font`) is unchanged.

- [ ] **Step 1: Inspect the current rules**

Read `packages/platform/src/usj-nodes.css` around lines 2048–2065. Current state: `.marker { unicode-bidi: isolate; }` applies everywhere; grey color applies to `.marker-visible .marker`, `.marker-hidden .marker`, and only `.marker-editable .book .marker`; the 0.7em size applies to visible/hidden modes only.

- [ ] **Step 2: Add the scoped rules**

Immediately after the existing `.marker-visible .marker:not(.chapter), .marker-hidden .marker:not(.chapter)` rule, add:

```css
/* Standard view: editable markers within formatted text get the PT9 marker look.
   Scoped to .formatted-font so the Unformatted view keeps full-size plain markers. */
.formatted-font.marker-editable .marker {
  color: rgba(140, 140, 140, 1);
}

.formatted-font.marker-editable .marker:not(.chapter) {
  font-size: 0.7em;
}

.formatted-font.marker-editable .verse {
  white-space: nowrap;
  unicode-bidi: embed;
}
```

Note: `getViewClassList` puts both classes on the same element, so the compound selector `.formatted-font.marker-editable` (no space) is correct.

- [ ] **Step 3: Verify visually in the demo**

Run: `pnpm nx dev platform` (the demo dev server; the demo app is `demos/platform`, dev target name `platform` per repo docs — if `pnpm nx dev platform` starts the packaged editor instead of the demo, run `pnpm nx show projects | grep -i demo` and use the demo project's name).

In the browser: select the "Standard" view mode from the view dropdown (present automatically since Task 1 — `ViewModeDropDown` spreads `viewModeToViewNames`). Verify:
- Text is formatted (fonts/indents) with spacing.
- `\p`, `\s1`, `\v n`, char markers visible inline, small and grey, editable (cursor enters them).
- Notes appear as collapsed callers, not expanded text.
- Switching to "Unformatted" still shows full-size plain markers (no regression).

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/usj-nodes.css
git commit -m "feat: PT9 marker styling for standard view (small grey editable markers)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

### Task 9: Wrap-up — full verification and findings summary

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`

**Interfaces:**
- Consumes: everything above.
- Produces: green build across the repo; a findings doc that Phase 2 planning can consume; a summary suitable for reporting to the user.

- [ ] **Step 1: Run everything**

Run: `pnpm nx run-many -t test && pnpm nx run-many -t lint && pnpm nx run-many -t typecheck && pnpm nx format:check`
Expected: all PASS (corpus skips only where findings entries exist). Fix formatting with `pnpm nx format:write` if `format:check` fails.

- [ ] **Step 2: Verify no stray API drift**

Run: `pnpm nx run-many -t extract-api`
Expected: no uncommitted report changes (`git status --short` clean except findings doc). If reports changed, a public API changed without its report — commit the report with a note.

- [ ] **Step 3: Verify Unicode normalization in the PT10 save path (spec §4/§10)**

This is a read-only investigation in `/home/lyonsm/paranext-core` (no code changes):

Run: `grep -rn "Normalize" /home/lyonsm/paranext-core/c-sharp/Projects/ParatextProjectDataProvider.cs`
and inspect the `SetChapterUsfm`/USX→USFM conversion path (~lines 1821, 2081–2158) for a call
equivalent to PT9's `scrText.Normalize(...)` (which applies the project's NFC/NFD
`NormalizationForm` — see `/home/lyonsm/Paratext/ParatextData/ScrText.cs:1573-1576` for the
reference behavior).

Record the answer in the findings doc under a heading `## Unicode normalization (spec §4)`:
either "applied at <file:line> via <call>" or "NOT applied — host-side work item for the
Phase 5 plan". Also note whether `ScrText.FixNBSP`-equivalent NBSP↔`~` handling appears in
that path (feeds the §4 whitespace rules in Phase 2).

- [ ] **Step 4: Write the findings summary**

At the top of the findings doc, add:

```markdown
## Phase 0+1 completion summary (fill in actual values)

- Corpus: <N> fixtures × 4 view modes; <N> passing, <N> skipped-with-finding.
- Acceptance criterion (§7): <status per construct>.
- Editable delta round-trip test: <enabled-and-green | finding recorded>.
- Adaptor fixes landed: <list commits>.
- Recommended Phase 2 plan inputs: <top findings by severity>.
```

- [ ] **Step 5: Final commit**

```bash
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "docs: phase 0+1 findings summary for standard view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gh3vf4oHGkSpn7vQRk5pca"
```

---

## Out of scope for this plan (later phase plans)

- Phase 2: marker-editing engine (Tier 1 transforms, fragment tokenizer, Tier 2 re-tokenization, deletion semantics, whitespace rules, Ctrl+Space) — plan written after Phase 0 findings are in.
- Phase 3: footnote UX (snippets, popover threading in platform-bible-react, pane auto-show/hide).
- Phase 4: stylesheet pipeline (C# StyleInfo PDP, CSS generator, validation, context-aware menu).
- Phase 5: paranext-core extension wiring (view type, power default, menu, consecutive-verse line breaks, opaque-block rendering polish).
