# Standard View — Phase 2 Implementation Plan (Marker-Editing Engine)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make marker-text edits in Standard view change the document, not just pixels: Tier 1 in-place renames, a USFM fragment tokenizer, Tier 2 paragraph re-tokenization, PT9 deletion semantics incl. Ctrl+Space, and the §4 whitespace rules.

**Architecture:** A new `MarkerEditPlugin` (in `packages/platform/src/editor/markerEdit/`, beside the `ParaMarkerPrefixGuardPlugin` precedent) registers node transforms and command listeners, active when `markerMode === "editable"`. Tier 1 syncs structural node state (`ParaNode.marker`, `CharNode.marker`, verse/chapter numbers) with edited marker text. Everything Tier 1 cannot express routes to Tier 2: build the paragraph's display text as a USFM fragment (atomic nodes ride through as U+FFFC sentinels), tokenize it with a new StyleInfo-shaped fragment tokenizer in `libs/shared`, rebuild nodes via the existing `serializeEditorState` + `$parseSerializedNode` path, splice, and restore selection. The reverse adaptor stays the single source of truth for serialization. Spec: `docs/superpowers/specs/2026-07-01-standard-view-design.md` §4, §5.1–5.3, §5.5–5.6, §12 "Phase 2". Findings: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`.

**Tech Stack:** TypeScript, Lexical 0.33 (`registerNodeTransform`, `registerCommand`, `$parseSerializedNode`), Vitest + @testing-library/react, Nx + pnpm. Repo `/home/lyonsm/scripture-editors`, branch `standard-view`.

## Global Constraints

- All work on branch `standard-view`. Never commit to `platform-yalc` or `main`. **Never push.**
- Run tasks through Nx with pnpm: `pnpm nx test <project>`. Projects: `shared` = libs/shared, `shared-react` = libs/shared-react, `@eten-tech-foundation/platform-editor` = packages/platform (plain `platform` is the demo app), `utilities` = packages/utilities. File filter: `pnpm nx test <project> -- <file-substring>`.
- Only `@eten-tech-foundation/platform-editor` and `utilities` have `extract-api` targets. Run extract-api only when a package's *public* exports change (nothing in this plan should).
- `docs/superpowers/` is gitignored — `git add -f` for files under it. The lint-staged prettier hook may print FAILED lines for those paths; the commit still succeeds — verify with `git log -1 --stat`.
- Code style: prefer `undefined` over `null`; construct Lexical nodes via `$create<X>Node` helpers; never call `editor.update()` from inside a listener (commands/transforms run inside the update and are fine); in Lexical tests chain `.append(...)` inside `$getRoot().append(...)` per repo CLAUDE.md.
- `<*Plugin />` children in `packages/platform/src/editor/Editor.tsx` are ordered alphabetically within the block that starts at `ActiveTextPlugin`.
- Commit messages end with: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Test environments: headless transforms/utils use `createBasicTestEnvironment` from `libs/shared/src/nodes/usj/test.utils.ts`; command/behavior tests use `baseTestEnvironment` from `libs/shared-react/src/plugins/usj/react-test.utils.tsx` (dispatch inside `act`, assert via `editor.getEditorState().read(...)`). jsdom cannot drive real typing; simulate edits with `editor.update` mutations (`node.setTextContent(...)` fires the same transforms).
- Key node-shape facts (verified in Phase 0/exploration — do not rediscover):
  - Editable para children: `[MarkerNode(marker, "opening"), TextNode(NBSP, state textType="marker-trailing-space"), ...content]`. `MarkerNode.__text` is derived (`\marker`, `\marker*`, `\*`); no trailing space inside the node.
  - Editable verse: `VerseNode` **is a TextNode** with text `"\v" + NBSP + number + " "` (`getVisibleOpenMarkerText`). No child MarkerNode.
  - Editable chapter: `ChapterNode` (ElementNode) with one child TextNode `"\c" + NBSP + number + " "`.
  - Editable char children: `[MarkerNode(opening), NBSP-prefixed text..., MarkerNode(closing)]`; closers are suppressed for footnote/cross-ref char markers (`CharNode.isValidFootnoteMarker`/`isValidCrossReferenceMarker`).
  - Standard-view note children: `[MarkerNode(opening), ImmutableNoteCallerNode, TextNode(NBSP), ...content interleaved with NBSP, MarkerNode(closing)]`.
  - Milestone run: `MilestoneNode` (invisible decorator) followed by sibling display nodes `MarkerNode(opening)`, optional `TextNode(NBSP + "|" + attrs, state textType="attribute")`, `MarkerNode("", "selfClosing")`.
  - The reverse adaptor (`editor-usj.adaptor.ts`) ignores MarkerNode text entirely; the ONLY literal text it reads is verse/chapter number via `parseNumberFromMarkerText`. `initialize(logger)` takes no viewOptions today.
  - Marker-kind data exists: `getMarker(marker)` (`libs/shared/src/utils/usfm/getMarker.ts`) over the usfm.sty-generated `usfmMarkers` map — `{ type: MarkerType.Paragraph|Character|Note|Unknown, hasEndMarker, children }`. Note the overwrites file forces `c` to `Paragraph`, so special-case `v`/`c` before consulting it.
  - `NBSP = " "`, `NODE_ATTRIBUTE_PREFIX = NBSP + "|"`, `PARA_MARKER_DEFAULT = "p"` (node-constants.ts). `textTypeState` is exported from `shared` (`nodes/collab/delta.state.ts`).

## Decisions locked for this plan (refinements within the approved design — flag disagreement at plan review, not mid-task)

1. **Plugin location:** `packages/platform/src/editor/markerEdit/`, not `libs/shared-react` — it needs `usjEditorAdaptor` for Tier 2 rebuilds (dependency direction: platform → shared-react, so shared-react cannot host it), and `ParaMarkerPrefixGuardPlugin` already sets the platform-package precedent. Spec §5 called the name/location "working".
2. **Tokenizer location:** `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts` — shared already depends on `@eten-tech-foundation/scripture-utilities` (USJ types) and hosts the `usfmMarkers` kind data. `packages/utilities` stays a leaf.
3. **Tier 2 atomic nodes use sentinels (U+FFFC), not "stored USFM from structure":** there is no TS USJ→USFM serializer; sentinels preserve node identity (note callers, unknownAttributes) losslessly and satisfy the §6 intent ("the engine treats the note as one opaque token"). The governing principle is **preserve-or-refuse — never guess**: the engine either fully understands content and restructures it, or carries/leaves it untouched. Sentinel set = nodes whose USJ state is not fully recoverable from visible text: NoteNode, UnknownNode, MilestoneNode runs (the sentinel carries the WHOLE run — decorator plus its display glyph siblings — so the visible `\ts-s |sid=…\*` survives rebuilds), CharNode with unknownAttributes OR a marker unknown to the marker-kind data (a custom.sty span must not degrade to literal text), VerseNode with sid/altnumber/pubnumber/unknownAttributes. Excluded from Tier 2 wholesale: paragraphs with unknownAttributes, paragraphs whose own marker the kind data doesn't know as a paragraph marker (rebuilding one would invent a `\p`), and paragraphs inside an UnknownNode ancestor (§7 opaque-block interiors). Safety invariant: if the tokenized output's sentinel count mismatches the preserved-node count, the rebuild aborts and the paragraph is left untouched. These guards key off the same `getMarker()` lookup the tokenizer uses, so Phase 4's project StyleInfo (usfm.sty + custom.sty) loosens them automatically.
4. **Tier 2 trigger surface:** the plain-`TextNode` transform is the paste/drop/controlled-insertion catch-all (any insertion mechanism mutates text nodes and fires it inside the same update). The spec's PASTE/DROP/CONTROLLED_TEXT_INSERTION listener trio is therefore not registered separately; KEY_ENTER/INSERT_PARAGRAPH/BLUR plus SELECTION_CHANGE (caret leaves a pending node — the deterministic stand-in for PT9's 1s debounce) are registered as completion triggers. Outcomes (paste single/multi-para USFM, one undo step) are tested per spec §10.
5. **MarkerNode `marker` DOM class (finding #1): standardize on syntax classes** (`.opening/.closing/.selfClosing`). Restoring the `marker` class would re-create the cross-mode styling bleed #359 fixed. Recorded in the findings doc in Task 16.
6. **Enter (pre-Phase-5-menu):** splitting a paragraph clones its marker (Lexical `insertNewAfter` already does) and the engine injects the visible marker prefix into the new paragraph. Enter with the caret inside marker text completes the marker instead of splitting. The Phase 5 Enter-menu replaces this default.
7. **§4 scope notes:** display mapping is standard-view-gated (`getViewMode(viewOptions) === STANDARD_VIEW_MODE`). Space-run→NBSP display applies to runs (≥2) and paragraph-content-leading spaces; a lone single-space text node stays a plain space (PT9 nuance, and it avoids colliding with the adaptor's structural NBSP separators). Literal `~` in USJ text is treated as NBSP on serialization (PT9-consistent; USFM cannot express a literal tilde).
8. **Delta-ops marker-glyph design question (findings #2/#3/#4): deferred, pinned behavior kept.** Tier 2 rebuilds flow through `DeltaOnChangePlugin`'s full-doc diff untagged (they are local user edits). No ops-contract redesign in Phase 2; re-recorded as an open question for the collab adaptor owner in Task 16.
9. **Verse badge (finding #6):** the light-grey `.formatted-font .verse` background is suppressed in standard view only (PT9 has none); formatted view keeps it. One-line CSS, easy to revert if the PO prefers the badge.
10. **Notes are not a Tier 2 scope in Phase 2** — text typed inside expanded/unclosed note content does not trigger re-tokenization (the note is its own scope, threaded in Phase 3). Tier 1 opener renames on notes (e.g. `\f`→`\x`) DO work (same mirror pattern as char).

---

### Task 1: Whitespace display/data mapping utilities (§4)

**Files:**
- Create: `libs/shared/src/utils/usj/whitespace-display.utils.ts`
- Create: `libs/shared/src/utils/usj/whitespace-display.utils.test.ts`
- Modify: `libs/shared/src/utils/usj/index.ts` (add export)

**Interfaces:**
- Consumes: `NBSP` from `../../nodes/usj/node-constants.js`.
- Produces (used by Tasks 5, 6, 12):
  - `usjTextToDisplay(text: string, isAtParaStart?: boolean): string` — data→display: every NBSP → `~`; every space that is part of a run of ≥2 spaces → NBSP; leading spaces → NBSP when `isAtParaStart`.
  - `displayTextToUsj(text: string): string` — display→data: `~` → NBSP, NBSP → space. (No collapsing — that is `normalizeSpaceRuns`.)
  - `normalizeSpaceRuns(text: string): string` — collapse runs of ≥2 spaces to one (PT9 `RegularizeSpaces` behavior for plain spaces; a string that is exactly one space is untouched by construction).

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/src/utils/usj/whitespace-display.utils.test.ts`:

```ts
import {
  displayTextToUsj,
  normalizeSpaceRuns,
  usjTextToDisplay,
} from "./whitespace-display.utils";
import { NBSP } from "../../nodes/usj/node-constants";

describe("usjTextToDisplay", () => {
  it("shows a stored NBSP as a tilde", () => {
    expect(usjTextToDisplay(`3${NBSP}000 men`)).toBe("3~000 men");
  });

  it("shows every space of a multi-space run as NBSP", () => {
    expect(usjTextToDisplay("a  b   c")).toBe(`a${NBSP}${NBSP}b${NBSP}${NBSP}${NBSP}c`);
  });

  it("leaves single spaces alone", () => {
    expect(usjTextToDisplay("a b c")).toBe("a b c");
  });

  it("shows paragraph-leading spaces as NBSP", () => {
    expect(usjTextToDisplay(" lead", true)).toBe(`${NBSP}lead`);
    expect(usjTextToDisplay(" lead", false)).toBe(" lead");
  });

  it("handles NBSP and runs together", () => {
    expect(usjTextToDisplay(`a${NBSP}  b`)).toBe(`a~${NBSP}${NBSP}b`);
  });
});

describe("displayTextToUsj", () => {
  it("maps tilde back to NBSP and display-NBSP back to space", () => {
    expect(displayTextToUsj(`3~000${NBSP}${NBSP}men`)).toBe(`3${NBSP}000  men`);
  });

  it("round-trips with usjTextToDisplay for normalized text", () => {
    const data = `In the days${NBSP}of the judges`;
    expect(displayTextToUsj(usjTextToDisplay(data))).toBe(data);
  });
});

describe("normalizeSpaceRuns", () => {
  it("collapses space runs to a single space", () => {
    expect(normalizeSpaceRuns("a  b   c")).toBe("a b c");
  });

  it("leaves a lone single-space string untouched", () => {
    expect(normalizeSpaceRuns(" ")).toBe(" ");
  });

  it("does not collapse NBSP", () => {
    expect(normalizeSpaceRuns(`a${NBSP}${NBSP}b`)).toBe(`a${NBSP}${NBSP}b`);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test shared -- whitespace-display`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `libs/shared/src/utils/usj/whitespace-display.utils.ts`:

```ts
/**
 * Standard-view whitespace display/data mapping (design spec §4, PT9
 * `AllowInvisibleChars=false` semantics). In Standard view the editor model holds
 * DISPLAY text: a stored NBSP renders as `~` and spaces in runs render as NBSP so
 * they are visible while typing. Serialization inverts the mapping and collapses
 * space runs (PT9 `UsfmToken.NormalizeUsfm`). These functions are pure; the
 * adaptors and MarkerEditPlugin gate them to Standard view.
 */

import { NBSP } from "../../nodes/usj/node-constants.js";

/** Data → display: NBSP → `~`; spaces in runs of 2+ (and paragraph-leading spaces) → NBSP. */
export function usjTextToDisplay(text: string, isAtParaStart = false): string {
  let result = text.replaceAll(NBSP, "~");
  result = result.replace(/ {2,}/g, (run) => NBSP.repeat(run.length));
  if (isAtParaStart) result = result.replace(/^ +/, (lead) => NBSP.repeat(lead.length));
  return result;
}

/** Display → data: `~` → NBSP; display-NBSP → plain space. Does not collapse runs. */
export function displayTextToUsj(text: string): string {
  return text.replaceAll(NBSP, " ").replaceAll("~", NBSP);
}

/** Collapse runs of 2+ plain spaces to one (normalization; NBSP is never collapsed). */
export function normalizeSpaceRuns(text: string): string {
  return text.replace(/ {2,}/g, " ");
}
```

Note the order inside `displayTextToUsj`: NBSP→space runs FIRST, then `~`→NBSP, so a display `~` cannot be double-converted.

Add to `libs/shared/src/utils/usj/index.ts`:

```ts
export * from "./whitespace-display.utils.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared -- whitespace-display`
Expected: PASS (10 tests). Then `pnpm nx test shared` — PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/utils/usj/
git commit -m "feat: whitespace display/data mapping utils for standard view (spec §4)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 2: USFM fragment tokenizer — core (§5.3)

**Files:**
- Create: `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`
- Create: `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts`
- Modify: `libs/shared/src/converters/usfm/index.ts` (add export)

**Interfaces:**
- Consumes: `getMarker` (`libs/shared/src/utils/usfm/getMarker.ts`), `MarkerType` (`.../usfmTypes.ts`), `NoteNode`, `MilestoneNode` (static `isValidMarker`), `NBSP`, `PARA_MARKER_DEFAULT` from node-constants, `MarkerContent`/`MarkerObject` types from `@eten-tech-foundation/scripture-utilities`.
- Produces: `usfmFragmentToUsjContent(fragment: string): MarkerContent[]` — an array of paragraph-level `MarkerObject`s (`{type:"para", marker, content}`; chapters, if present, as siblings). Reference semantics: ParatextData `UsfmToken.Tokenize` (see §5.3; PT9 code quoted in the findings-gathering session: marker scan stops at `\`, `|`, whitespace; a trailing `*` is part of the marker; a bare `\*` self-closes a milestone; unknown markers are kept as typed). U+FFFC (Tier 2 sentinel) passes through as ordinary text. `~` in input becomes NBSP in output text. Task 3 extends this same file with verse/chapter/note/milestone/attribute handling — Task 2 covers text, paragraph markers, character markers (incl. `\+nested`), explicit `\x*` closers, auto-close rules, and unknown-marker literal passthrough.

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts`:

```ts
import { usfmFragmentToUsjContent } from "./usfmFragmentToUsj";
import { NBSP } from "../../nodes/usj/node-constants";

describe("usfmFragmentToUsjContent — core", () => {
  it("tokenizes a plain paragraph", () => {
    expect(usfmFragmentToUsjContent("\\p In the days of the judges")).toEqual([
      { type: "para", marker: "p", content: ["In the days of the judges"] },
    ]);
  });

  it("splits multiple paragraph markers into paragraphs", () => {
    expect(usfmFragmentToUsjContent("\\p one \\q1 two")).toEqual([
      { type: "para", marker: "p", content: ["one "] },
      { type: "para", marker: "q1", content: ["two"] },
    ]);
  });

  it("wraps leading bare content in a default paragraph", () => {
    expect(usfmFragmentToUsjContent("bare text \\p more")).toEqual([
      { type: "para", marker: "p", content: ["bare text "] },
      { type: "para", marker: "p", content: ["more"] },
    ]);
  });

  it("builds an explicitly closed char span", () => {
    expect(usfmFragmentToUsjContent("\\p before \\nd Lord\\nd* after")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "before ",
          { type: "char", marker: "nd", content: ["Lord"] },
          " after",
        ],
      },
    ]);
  });

  it("auto-closes an unclosed char span at the end of the paragraph", () => {
    expect(usfmFragmentToUsjContent("\\p before \\nd Lord")).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["before ", { type: "char", marker: "nd", content: ["Lord"] }],
      },
    ]);
  });

  it("auto-closes an open char span when a new non-nested char marker starts", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\wj said")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "nd", content: ["Lord "] },
          { type: "char", marker: "wj", content: ["said"] },
        ],
      },
    ]);
  });

  it("nests a \\+ prefixed char marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\add added \\+nd Lord\\+nd* text\\add*")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "add",
            content: ["added ", { type: "char", marker: "nd", content: ["Lord"] }, " text"],
          },
        ],
      },
    ]);
  });

  it("auto-closes char spans at a paragraph marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\q1 line")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "nd", content: ["Lord "] }],
      },
      { type: "para", marker: "q1", content: ["line"] },
    ]);
  });

  it("keeps an unknown marker as literal text (degradation property)", () => {
    expect(usfmFragmentToUsjContent("\\p a \\zzz b")).toEqual([
      { type: "para", marker: "p", content: ["a \\zzz b"] },
    ]);
  });

  it("keeps an unmatched closer as literal text", () => {
    expect(usfmFragmentToUsjContent("\\p a \\nd* b")).toEqual([
      { type: "para", marker: "p", content: ["a \\nd* b"] },
    ]);
  });

  it("maps ~ to NBSP in text content", () => {
    expect(usfmFragmentToUsjContent("\\p 3~000 men")).toEqual([
      { type: "para", marker: "p", content: [`3${NBSP}000 men`] },
    ]);
  });

  it("regularizes whitespace runs in text", () => {
    expect(usfmFragmentToUsjContent("\\p a  b\tc\nd")).toEqual([
      { type: "para", marker: "p", content: ["a b c d"] },
    ]);
  });

  it("passes the U+FFFC sentinel through as text", () => {
    expect(usfmFragmentToUsjContent("\\p before ￼ after")).toEqual([
      { type: "para", marker: "p", content: ["before ￼ after"] },
    ]);
  });

  it("accepts an empty paragraph", () => {
    expect(usfmFragmentToUsjContent("\\b")).toEqual([{ type: "para", marker: "b" }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test shared -- usfmFragmentToUsj`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the scanner and builder**

Create `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`:

```ts
/**
 * StyleInfo-driven USFM fragment tokenizer for Tier 2 paragraph re-tokenization
 * (design spec §5.3). Reference semantics: ParatextData `UsfmToken.Tokenize` —
 * fragment-level tokenization only; document-level validation stays out. Marker
 * kinds come from the bundled usfm.sty-derived `usfmMarkers` map via `getMarker`
 * (Phase 4 swaps in project `StyleInfo`). Fragments the tokenizer cannot
 * confidently parse degrade to literal text (spec §5.2 degradation property).
 *
 * Input is USFM text: `~` means NBSP; U+FFFC sentinels (atomic-node placeholders
 * from the Tier 2 fragment builder) ride through as ordinary text characters.
 */

import { NBSP, PARA_MARKER_DEFAULT } from "../../nodes/usj/node-constants.js";
import { MilestoneNode } from "../../nodes/usj/MilestoneNode.js";
import { NoteNode } from "../../nodes/usj/NoteNode.js";
import { getMarker } from "../../utils/usfm/getMarker.js";
import { MarkerType } from "../../utils/usfm/usfmTypes.js";
import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";

const VERSE_MARKER = "v";
const CHAPTER_MARKER = "c";

type Token =
  | { kind: "text"; text: string }
  | { kind: "para"; marker: string }
  | { kind: "charOpen"; marker: string; isNested: boolean }
  | { kind: "end"; marker: string } // `\nd*` -> marker "nd"; bare `\*` -> marker ""
  | { kind: "verse"; number: string }
  | { kind: "chapter"; number: string }
  | { kind: "note"; marker: string; caller: string }
  | { kind: "milestone"; marker: string; attributes?: Record<string, string> };

/** PT9 `IsNonSemanticWhiteSpace` approximation for fragments. */
const WHITESPACE_RUN = /[\s​]+/g;

/** Collapse whitespace runs to single spaces (PT9 `RegularizeSpaces`); keep U+FFFC. */
function regularizeSpaces(text: string): string {
  return text.replace(WHITESPACE_RUN, " ");
}

/** Marker name chars per PT9 scan: stop at `\`, `|`, whitespace; `*` ends and is included. */
function scanMarkerName(fragment: string, start: number): { name: string; next: number } {
  let index = start;
  while (index < fragment.length) {
    const ch = fragment[index];
    if (ch === "\\" || ch === "|") break;
    if (ch === "*") {
      index++;
      break;
    }
    if (/[\s​]/.test(ch)) break;
    index++;
  }
  return { name: fragment.slice(start, index), next: index };
}

/** PT9 `GetNextWord`: skip leading whitespace, take up to whitespace or `\`. */
function getNextWord(fragment: string, start: number): { word: string; next: number } {
  let index = start;
  while (index < fragment.length && /[\s ​]/.test(fragment[index])) index++;
  const wordStart = index;
  while (index < fragment.length && !/[\s ​\\]/.test(fragment[index])) index++;
  const word = fragment.slice(wordStart, index);
  while (index < fragment.length && /[\s ​]/.test(fragment[index])) index++;
  return { word, next: index };
}

function tokenize(fragment: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev?.kind === "text") prev.text += text;
    else tokens.push({ kind: "text", text });
  };

  while (index < fragment.length) {
    if (fragment[index] !== "\\") {
      const nextMarker = fragment.indexOf("\\", index);
      const end = nextMarker === -1 ? fragment.length : nextMarker;
      pushText(regularizeSpaces(fragment.slice(index, end)));
      index = end;
      continue;
    }

    const rawStart = index;
    const { name, next } = scanMarkerName(fragment, index + 1);
    index = next;

    if (name === "" || name === "*") {
      // Bare `\` or stray `\*` (milestone closes are consumed by scanMilestone) — literal.
      pushText(fragment.slice(rawStart, index));
      continue;
    }

    if (name.endsWith("*")) {
      tokens.push({ kind: "end", marker: name.slice(0, -1) });
      continue;
    }

    // Consume the single separator space after an opening marker (PT9 skips it).
    const consumeSeparator = () => {
      while (index < fragment.length && /[\s ​]/.test(fragment[index])) index++;
    };

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
    if (NoteNode.isValidMarker(name)) {
      const { word, next: afterWord } = getNextWord(fragment, index);
      index = afterWord;
      tokens.push({ kind: "note", marker: name, caller: word || "+" });
      continue;
    }
    if (MilestoneNode.isValidMarker(name)) {
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

    const isNested = name.startsWith("+");
    const markerData = getMarker(isNested ? name.slice(1) : name);
    if (markerData?.type === MarkerType.Paragraph) {
      consumeSeparator();
      tokens.push({ kind: "para", marker: name });
    } else if (markerData?.type === MarkerType.Character) {
      consumeSeparator();
      tokens.push({ kind: "charOpen", marker: isNested ? name.slice(1) : name, isNested });
    } else {
      // Unknown marker: kept as typed (literal text), including its separator space.
      let end = index;
      if (end < fragment.length && /[\s ]/.test(fragment[end])) end++;
      pushText(fragment.slice(rawStart, end));
      index = end;
    }
  }
  return tokens;
}

// `scanMilestone` and attribute parsing are added in the next task; until then
// milestones fall back to literal text.
function scanMilestone(
  _fragment: string,
  _rawStart: number,
  _name: string,
  _index: number,
): { token: Token; next: number } | undefined {
  return undefined;
}

/** Convert `~` to NBSP for USJ text content (PT9 read-side `UsfmParser` behavior). */
function toUsjText(text: string): string {
  return text.replaceAll("~", NBSP);
}

interface CharFrame {
  object: MarkerObject;
  container: MarkerContent[];
}

export function usfmFragmentToUsjContent(fragment: string): MarkerContent[] {
  const result: MarkerContent[] = [];
  let para: MarkerObject | undefined;
  let note: MarkerObject | undefined;
  const charStack: CharFrame[] = [];

  const container = (): MarkerContent[] => {
    if (charStack.length > 0) return charStack[charStack.length - 1].object.content!;
    if (note) return note.content!;
    if (!para) {
      para = { type: "para", marker: PARA_MARKER_DEFAULT, content: [] };
      result.push(para);
    }
    return para.content!;
  };

  const pushContent = (item: MarkerContent) => {
    const target = container();
    if (typeof item === "string" && typeof target[target.length - 1] === "string") {
      target[target.length - 1] = (target[target.length - 1] as string) + item;
    } else {
      target.push(item);
    }
  };

  const closeCharStack = () => {
    charStack.length = 0;
  };
  const closeNote = (terminated: boolean) => {
    if (!note) return;
    if (!terminated) note.closed = "false";
    note = undefined;
  };

  for (const token of tokenize(fragment)) {
    switch (token.kind) {
      case "text":
        pushContent(toUsjText(token.text));
        break;
      case "para": {
        closeCharStack();
        closeNote(false);
        para = { type: "para", marker: token.marker, content: [] };
        result.push(para);
        break;
      }
      case "verse":
        closeCharStack();
        closeNote(false);
        pushContent({ type: "verse", marker: VERSE_MARKER, number: token.number });
        break;
      case "chapter":
        closeCharStack();
        closeNote(false);
        para = undefined;
        result.push({ type: "chapter", marker: CHAPTER_MARKER, number: token.number });
        break;
      case "note": {
        closeCharStack();
        closeNote(false);
        const target = container();
        note = { type: "note", marker: token.marker, caller: token.caller, content: [] };
        target.push(note);
        break;
      }
      case "charOpen": {
        // A new non-nested char marker auto-closes open char styles (PT9).
        if (!token.isNested) closeCharStack();
        const target = container();
        const object: MarkerObject = { type: "char", marker: token.marker, content: [] };
        target.push(object);
        charStack.push({ object, container: target });
        break;
      }
      case "end": {
        const marker = token.marker.replace(/^\+/, "");
        const frameIndex = charStack.findLastIndex((frame) => frame.object.marker === marker);
        if (frameIndex >= 0) {
          extractAttributes(charStack[frameIndex].object);
          charStack.length = frameIndex;
        } else if (note && note.marker === marker) {
          closeNote(true);
        } else {
          // Unmatched closer: literal text (degradation property).
          pushContent(`\\${token.marker}*`);
        }
        break;
      }
      case "milestone":
        pushContent({ type: "ms", marker: token.marker, ...token.attributes });
        break;
    }
  }
  closeCharStack();
  closeNote(false);

  // Drop empty content arrays (USJ omits `content` for empty paras).
  const dropEmpty = (items: MarkerContent[]) => {
    for (const item of items) {
      if (typeof item === "string") continue;
      if (item.content) {
        dropEmpty(item.content);
        if (item.content.length === 0) delete item.content;
      }
    }
  };
  dropEmpty(result);
  return result;
}

// Attribute extraction from a closed char span is added in the next task.
function extractAttributes(_object: MarkerObject): void {}
```

Note: `findLastIndex` on arrays requires ES2023 lib; if `shared`'s tsconfig rejects it, replace with a reverse `for` loop — do not change tsconfig.

Add to `libs/shared/src/converters/usfm/index.ts`:

```ts
export * from "./usfmFragmentToUsj.js";
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared -- usfmFragmentToUsj`
Expected: PASS (13 tests). Then `pnpm nx test shared` — PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/converters/usfm/
git commit -m "feat: USFM fragment tokenizer core for Tier 2 re-tokenization (spec §5.3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Fragment tokenizer — verse/chapter/note/milestone details and attributes

**Files:**
- Modify: `libs/shared/src/converters/usfm/usfmFragmentToUsj.ts`
- Modify: `libs/shared/src/converters/usfm/usfmFragmentToUsj.test.ts`

**Interfaces:**
- Consumes/Produces: same module as Task 2. Completes: milestone `\*` termination with `|` attributes (`scanMilestone`), char-span attribute extraction on explicit close (`extractAttributes`), verse/chapter/note content tests. Attribute grammar per PT9 `attributeRegex`: `name="value"` pairs; a bare value maps through `DEFAULT_MARKER_ATTRIBUTES` (`w`→`lemma`, `rb`→`gloss`, `xt`→`href`, `jmp`→`href`); an unmappable bare value stays literal text.

- [ ] **Step 1: Write the failing tests**

Append to the test file:

```ts
describe("usfmFragmentToUsjContent — verse, chapter, note, milestone, attributes", () => {
  it("tokenizes verses with numbers, segments, and bridges", () => {
    expect(usfmFragmentToUsjContent("\\p \\v 1 one \\v 2a two \\v 3-4 three")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "verse", marker: "v", number: "1" },
          "one ",
          { type: "verse", marker: "v", number: "2a" },
          "two ",
          { type: "verse", marker: "v", number: "3-4" },
          "three",
        ],
      },
    ]);
  });

  it("closes an open char span at a verse marker", () => {
    expect(usfmFragmentToUsjContent("\\p \\nd Lord \\v 2 next")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          { type: "char", marker: "nd", content: ["Lord "] },
          { type: "verse", marker: "v", number: "2" },
          "next",
        ],
      },
    ]);
  });

  it("tokenizes a chapter marker", () => {
    expect(usfmFragmentToUsjContent("\\c 2 \\p text")).toEqual([
      { type: "chapter", marker: "c", number: "2" },
      { type: "para", marker: "p", content: ["text"] },
    ]);
  });

  it("builds a closed footnote with caller and char content", () => {
    expect(
      usfmFragmentToUsjContent("\\p text\\f + \\fr 1.1 \\ft A note.\\f* after"),
    ).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [
              { type: "char", marker: "fr", content: ["1.1 "] },
              { type: "char", marker: "ft", content: ["A note."] },
            ],
          },
          " after",
        ],
      },
    ]);
  });

  it("marks an unterminated note closed=false", () => {
    expect(usfmFragmentToUsjContent("\\p text\\f + \\ft open note")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [{ type: "char", marker: "ft", content: ["open note"] }],
          },
        ],
        // note: `closed` lives on the note object below, not the para
      },
    ].map((p) => ({
      ...p,
      content: p.content.map((c) =>
        typeof c === "object" && c.type === "note" ? { ...c, closed: "false" } : c,
      ),
    })));
  });

  it("tokenizes a terminated milestone with attributes", () => {
    expect(usfmFragmentToUsjContent('\\p one \\ts-s |sid="ts.GEN.1"\\* two')).toEqual([
      {
        type: "para",
        marker: "p",
        content: ["one ", { type: "ms", marker: "ts-s", sid: "ts.GEN.1" }, " two"],
      },
    ]);
  });

  it("keeps an unterminated milestone as literal text", () => {
    expect(usfmFragmentToUsjContent("\\p one \\ts-s two")).toEqual([
      { type: "para", marker: "p", content: ["one \\ts-s two"] },
    ]);
  });

  it("extracts named attributes from a closed char span", () => {
    expect(usfmFragmentToUsjContent('\\p \\w gracious|lemma="grace" strong="G5485"\\w*')).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "char",
            marker: "w",
            lemma: "grace",
            strong: "G5485",
            content: ["gracious"],
          },
        ],
      },
    ]);
  });

  it("maps a bare default attribute through the default-attribute table", () => {
    expect(usfmFragmentToUsjContent("\\p \\w gracious|grace\\w*")).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "w", lemma: "grace", content: ["gracious"] }],
      },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `pnpm nx test shared -- usfmFragmentToUsj`
Expected: the new describe block FAILS (milestone falls back to literal text; attributes not extracted); Task 2 tests still PASS.

- [ ] **Step 3: Implement `scanMilestone` and `extractAttributes`**

Replace the two stubs in `usfmFragmentToUsj.ts`:

```ts
const ATTRIBUTE_PAIR_REGEX = /([-\w]+)\s*=\s*"(.*?)"/g;

/** USFM 3 default attribute per marker (subset; unmapped bare values stay literal). */
const DEFAULT_MARKER_ATTRIBUTES: Record<string, string> = {
  w: "lemma",
  rb: "gloss",
  xt: "href",
  jmp: "href",
};

function parseAttributeText(
  attributeText: string,
  marker: string,
): Record<string, string> | undefined {
  const attributes: Record<string, string> = {};
  const pairs = [...attributeText.matchAll(ATTRIBUTE_PAIR_REGEX)];
  if (pairs.length > 0) {
    for (const [, name, value] of pairs) attributes[name] = value;
    return attributes;
  }
  const bare = attributeText.trim();
  const defaultName = DEFAULT_MARKER_ATTRIBUTES[marker];
  if (bare && defaultName) return { [defaultName]: bare };
  return undefined;
}

/**
 * A milestone must be terminated by `\*` (PT9 `MilestoneEnded`); attributes may
 * follow a `|` between the marker and the `\*`.
 */
function scanMilestone(
  fragment: string,
  _rawStart: number,
  name: string,
  index: number,
): { token: Token; next: number } | undefined {
  const closeIndex = fragment.indexOf("\\", index);
  if (closeIndex === -1 || fragment.slice(closeIndex, closeIndex + 2) !== "\\*") return undefined;
  const between = fragment.slice(index, closeIndex);
  if (between.includes("\\")) return undefined;
  const pipeIndex = between.indexOf("|");
  let attributes: Record<string, string> | undefined;
  if (pipeIndex >= 0) attributes = parseAttributeText(between.slice(pipeIndex + 1), name);
  else if (between.trim() !== "") return undefined; // non-attribute content before \* — literal
  return { token: { kind: "milestone", marker: name, attributes }, next: closeIndex + 2 };
}

/** On explicit close, split a trailing `|attributes` chunk off the span's last text. */
function extractAttributes(object: MarkerObject): void {
  const content = object.content;
  if (!content || content.length === 0) return;
  const last = content[content.length - 1];
  if (typeof last !== "string") return;
  const pipeIndex = last.indexOf("|");
  if (pipeIndex < 0) return;
  const attributes = parseAttributeText(last.slice(pipeIndex + 1), object.marker ?? "");
  if (!attributes) return;
  const text = last.slice(0, pipeIndex);
  if (text) content[content.length - 1] = text;
  else content.pop();
  Object.assign(object, attributes);
}
```

Also move the `Token` union's `milestone` member if TypeScript complains about use-before-declaration (declarations hoist; only reorder if the compiler objects).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared -- usfmFragmentToUsj`
Expected: PASS (all). Then `pnpm nx test shared` — PASS.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/converters/usfm/
git commit -m "feat: fragment tokenizer verse/note/milestone/attribute handling (spec §5.3)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 4: DOM reconciliation for marker/number changes (CharNode, NoteNode, ChapterNode, VerseNode)

**Files:**
- Modify: `libs/shared/src/nodes/usj/CharNode.ts` (`updateDOM`, ~line 222)
- Modify: `libs/shared/src/nodes/usj/NoteNode.ts` (`updateDOM`, ~line 206)
- Modify: `libs/shared/src/nodes/usj/ChapterNode.ts` (`updateDOM`, ~line 176)
- Modify: `libs/shared/src/nodes/usj/VerseNode.ts` (add `updateDOM` override)
- Create: `libs/shared/src/nodes/usj/node-update-dom.test.ts`

**Interfaces:**
- Consumes: existing node classes; `ParaNode.updateDOM` (ParaNode.ts:248-256) is the in-repo pattern to mirror.
- Produces: after `setMarker`/`setNumber` inside `editor.update`, the live DOM reflects the new `usfm_<marker>` class, `data-marker`, and `data-number`. Spec §5.1 names this required work: "CharNode.updateDOM() returns false unconditionally … Extending updateDOM (or replacing the node) is required work". Without it Tier 1 renames restyle nothing.

- [ ] **Step 1: Write the failing tests**

Create `libs/shared/src/nodes/usj/node-update-dom.test.ts`:

```ts
import { $createCharNode } from "./CharNode";
import { $createChapterNode } from "./ChapterNode";
import { $createNoteNode } from "./NoteNode";
import { $createParaNode } from "./ParaNode";
import { $createVerseNode } from "./VerseNode";
import { createBasicTestEnvironment } from "./test.utils";
import { $createTextNode, $getRoot } from "lexical";
import type { CharNode, ChapterNode, NoteNode, VerseNode } from "shared";

describe("updateDOM reconciliation for marker/number changes", () => {
  it("swaps the usfm_ class and data-marker on CharNode.setMarker", () => {
    let char: CharNode;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      char = $createCharNode("nd");
      $getRoot().append($createParaNode("p").append(char.append($createTextNode("Lord"))));
    });
    editor.update(() => char.setMarker("wj"), { discrete: true });
    const dom = editor.getElementByKey(char!.getKey())!;
    expect(dom.classList.contains("usfm_wj")).toBe(true);
    expect(dom.classList.contains("usfm_nd")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("wj");
  });

  it("swaps the usfm_ class and data-marker on NoteNode.setMarker", () => {
    let note: NoteNode;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      note = $createNoteNode("f", "+");
      $getRoot().append($createParaNode("p").append(note.append($createTextNode("content"))));
    });
    editor.update(() => note.setMarker("x"), { discrete: true });
    const dom = editor.getElementByKey(note!.getKey())!;
    expect(dom.classList.contains("usfm_x")).toBe(true);
    expect(dom.classList.contains("usfm_f")).toBe(false);
    expect(dom.getAttribute("data-marker")).toBe("x");
  });

  it("refreshes data-number on ChapterNode.setNumber", () => {
    let chapter: ChapterNode;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      chapter = $createChapterNode("1");
      $getRoot().append(chapter.append($createTextNode("\\c 1 ")));
    });
    editor.update(() => chapter.setNumber("2"), { discrete: true });
    expect(editor.getElementByKey(chapter!.getKey())!.getAttribute("data-number")).toBe("2");
  });

  it("refreshes data-number on VerseNode.setNumber", () => {
    let verse: VerseNode;
    const { editor } = createBasicTestEnvironment(undefined, () => {
      verse = $createVerseNode("1", "\\v 1 ");
      $getRoot().append($createParaNode("p").append(verse));
    });
    editor.update(() => verse.setNumber("2"), { discrete: true });
    expect(editor.getElementByKey(verse!.getKey())!.getAttribute("data-number")).toBe("2");
  });
});
```

Adjust `$createChapterNode`/`$createVerseNode` argument lists to the real signatures when writing the test (check the constructors: `VerseNode(verseNumber, text?, sid?, ...)`; `ChapterNode(number, ...)`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm nx test shared -- node-update-dom`
Expected: FAIL — classes/attributes are stale (updateDOM returns false without reconciling).

- [ ] **Step 3: Implement the four overrides**

`CharNode.updateDOM` (replace the existing unconditional-false override; note it must accept the Lexical args):

```ts
  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    if (prevNode.__marker !== this.__marker) {
      dom.setAttribute("data-marker", this.__marker);
      if (config.theme?.showCharMarkerTitles !== false) dom.setAttribute("title", this.__marker);
      dom.classList.remove(`usfm_${prevNode.__marker}`);
      dom.classList.add(`usfm_${this.__marker}`);
    }
    // Returning false keeps the existing DOM element (children reconcile independently).
    return false;
  }
```

`NoteNode.updateDOM` (keep the collapse-change re-render):

```ts
  override updateDOM(prevNode: NoteNode, dom: HTMLElement): boolean {
    if (prevNode.__isCollapsed !== this.__isCollapsed) return true;
    if (prevNode.__marker !== this.__marker) {
      dom.setAttribute("data-marker", this.__marker);
      dom.classList.remove(`usfm_${prevNode.__marker}`);
      dom.classList.add(`usfm_${this.__marker}`);
    }
    if (prevNode.__caller !== this.__caller) dom.setAttribute("data-caller", this.__caller);
    return false;
  }
```

`ChapterNode.updateDOM`:

```ts
  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    if (prevNode.__number !== this.__number) dom.setAttribute("data-number", this.__number);
    return false;
  }
```

`VerseNode` — add an override (TextNode's own updateDOM handles text; this reconciles the attribute):

```ts
  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    const recreate = super.updateDOM(prevNode, dom, config);
    if (!recreate && prevNode.__number !== this.__number)
      dom.setAttribute("data-number", this.__number);
    return recreate;
  }
```

Import `EditorConfig` from `lexical` where missing. Match each file's existing comment style; delete the now-wrong "does not need its DOM element replacing" comments where behavior changed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test shared -- node-update-dom`
Expected: PASS. Then `pnpm nx test shared && pnpm nx test shared-react && pnpm nx test @eten-tech-foundation/platform-editor` — PASS (these overrides are additive; no existing test asserts staleness).

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/nodes/usj/
git commit -m "fix: reconcile usfm_ class and data attributes on marker/number changes

CharNode/NoteNode/ChapterNode returned false from updateDOM unconditionally,
so Tier 1 setMarker/setNumber changed state without restyling (spec §5.1
required work).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Standard-view whitespace mapping in the adaptors (§4)

**Files:**
- Modify: `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` (text branch of `recurseNodes` ~line 710, `createPara` ~line 375)
- Modify: `packages/platform/src/editor/adaptors/editor-usj.adaptor.ts` (`initialize` ~line 72, TextNode branch ~line 417)
- Modify: `packages/platform/src/editor/Editor.tsx` (line 181: `editorUsjAdaptor.initialize(logger)`)
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-round-trip.test.ts` (pass viewOptions to reverse initialize)
- Modify: `packages/platform/src/editor/adaptors/corpus/corpus-data.ts` (new NBSP fixture)
- Modify: `packages/platform/src/editor/adaptors/usj-editor-adaptor.test.ts`, `editor-usj-adaptor.test.ts` (targeted tests)

**Interfaces:**
- Consumes: `usjTextToDisplay`, `displayTextToUsj`, `normalizeSpaceRuns` (Task 1, from `shared`); `getViewMode`, `STANDARD_VIEW_MODE`, `ViewOptions` from `shared-react`.
- Produces: in Standard view the editor model holds display text (NBSP as `~`, space runs as NBSP). Reverse adaptor signature becomes `initialize(logger: LoggerBasic | undefined, viewOptions?: ViewOptions)` — the ONLY signature change; all existing single-arg callers stay valid. Round-trip invariant: normalized USJ → display → USJ is identity; non-normalized space runs collapse on serialization (asserted in adaptor unit tests, NOT in the corpus, which asserts identity).

- [ ] **Step 1: Write the failing tests**

In `usj-editor-adaptor.test.ts` (forward), next to the existing editable-mode tests:

```ts
  it("maps NBSP to tilde in standard-view text content", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${" "}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe("3~000 men");
  });

  it("does not map NBSP in formatted view", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(FORMATTED_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe(`3${NBSP}000 men`);
  });
```

(Fix child indexes against the actual serialized shape when running.)

In `editor-usj-adaptor.test.ts` (reverse): build a serialized standard-view state via `serializeEditorState`, hand-patch a text node to display forms, and assert inversion:

```ts
  function buildPatchedStandardState(displayText: string) {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />in the days</para></usx>`,
    );
    initializeSerialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));
    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("in the days"),
    ) as SerializedTextNode;
    text.text = displayText;
    return state;
  }

  it("inverts display whitespace when deserializing standard view", () => {
    // display tilde (= data NBSP) + display-NBSP run (= space run, collapses to one)
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined, getViewOptions(STANDARD_VIEW_MODE));
    const roundTripped = deserializeSerializedEditorState(state);
    expect(JSON.stringify(roundTripped)).toContain(`in${NBSP}the days`);
  });

  it("leaves whitespace untouched when deserializing without standard viewOptions", () => {
    const state = buildPatchedStandardState(`in~the${NBSP}${NBSP}days`);
    initializeDeserialize(undefined);
    const roundTripped = deserializeSerializedEditorState(state);
    expect(JSON.stringify(roundTripped)).toContain(`in~the${NBSP}${NBSP}days`);
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- usj-editor-adaptor && pnpm nx test @eten-tech-foundation/platform-editor -- editor-usj-adaptor`
Expected: new tests FAIL.

- [ ] **Step 3: Implement the forward mapping**

In `usj-editor.adaptor.ts`:

1. Imports: add `usjTextToDisplay` to the `shared` import; add `getViewMode`, `STANDARD_VIEW_MODE` to the `shared-react` import.
2. Module helper next to the other private helpers:

```ts
/** §4 whitespace display rules are Standard-view-only (spec: must not leak into other modes). */
function isStandardView(): boolean {
  return _viewOptions !== undefined && getViewMode(_viewOptions) === STANDARD_VIEW_MODE;
}
```

3. In `recurseNodes` (~line 710), change the text branch:

```ts
    if (typeof markerContent === "string") {
      if (markerContent)
        nodes.push(
          createText(isStandardView() ? usjTextToDisplay(markerContent) : markerContent),
        );
    }
```

4. In `createPara`, after `children.push(...childNodes);`, apply the paragraph-leading rule:

```ts
  if (isStandardView()) {
    // §4: paragraph-leading spaces display as NBSP. First content text node only.
    const firstText = children.find(
      (node) => isSerializedTextNode(node) && node.text !== NBSP && !isSerializedMarkerNode(node),
    );
    if (firstText && isSerializedTextNode(firstText))
      firstText.text = firstText.text.replace(/^ +/, (lead) => NBSP.repeat(lead.length));
  }
```

(`isSerializedMarkerNode` is already imported in this file; MarkerNode serialized text is `""` so the `!== NBSP` check is what skips the trailing-space separator.)

- [ ] **Step 4: Implement the reverse mapping**

In `editor-usj.adaptor.ts`:

1. Imports: add `displayTextToUsj`, `normalizeSpaceRuns` to the `shared` import; add `getViewMode`, `STANDARD_VIEW_MODE`, `ViewOptions` to (or create) the `shared-react` import.
2. Extend module state + initialize:

```ts
let _viewOptions: ViewOptions | undefined;

export function initialize(logger: LoggerBasic | undefined, viewOptions?: ViewOptions) {
  _logger = logger;
  _viewOptions = viewOptions;
}

function isStandardView(): boolean {
  return _viewOptions !== undefined && getViewMode(_viewOptions) === STANDARD_VIEW_MODE;
}
```

(Keep whatever else `initialize` already sets. The default-export object keeps the same `initialize` reference.)

3. TextNode branch (~line 417) — convert AFTER the raw-shape guards (the `!== NBSP` separator drop and `NODE_ATTRIBUTE_PREFIX` drop must see raw text):

```ts
      case TextNode.getType():
        if (
          serializedTextNode.text &&
          serializedTextNode.text !== NBSP &&
          !serializedTextNode.text.startsWith(NODE_ATTRIBUTE_PREFIX) &&
          (!noteCaller || serializedTextNode.text !== getEditableCallerText(noteCaller))
        ) {
          let text = createTextMarker(serializedTextNode);
          // §4: Standard view stores display text; invert and normalize on serialization.
          if (isStandardView()) text = normalizeSpaceRuns(displayTextToUsj(text));
          combineTextContentOrAdd(markers, text);
        }
        break;
```

4. `Editor.tsx` line 181: `editorUsjAdaptor.initialize(logger);` → `editorUsjAdaptor.initialize(logger, viewOptions);` (move the call below the `viewOptions` useMemo if it currently sits above it).

- [ ] **Step 5: Corpus wiring + fixture**

In `corpus-round-trip.test.ts`, move the reverse initialize into the per-test body so it gets the mode's viewOptions:

```ts
        reset();
        initializeDeserialize(undefined, getViewOptions(viewMode));
        const editorState = serializeEditorState(usj, getViewOptions(viewMode));
```

(Keep the `beforeEach` for the forward initialize.) Add a fixture to `corpus-data.ts`:

```ts
  {
    name: "NBSP in text content",
    usx: book(`<para style="p"><verse number="1" style="v" />About 3${" "}000 men and women.</para>`),
  },
```

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- corpus-round-trip`
Expected: PASS across all 4 modes (60 tests). A standard-mode failure here means forward/reverse mapping asymmetry — fix before proceeding, per the corpus triage protocol (never loosen `toEqual`).

- [ ] **Step 6: Full suites, watch the pinned delta tests**

Run: `pnpm nx test @eten-tech-foundation/platform-editor && pnpm nx test shared-react && pnpm nx test shared`
Expected: PASS. If `opsGen1v1Standard`/editable delta fixtures fail because gen1v1 text contains NBSP/space runs (unlikely), regenerate the pinned expected-ops fixture to the new display shape and say so explicitly in the commit body — the pin exists to make this change visible, not to forbid it.

- [ ] **Step 7: Commit**

```bash
git add packages/platform/src/editor/
git commit -m "feat: standard-view whitespace display mapping in adaptors (spec §4)

NBSP displays as ~, space runs display as NBSP, serialization inverts and
collapses runs (PT9 NormalizeUsfm). Reverse adaptor initialize gains optional
viewOptions.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 6: Tier 2 rebuild core — fragment builder, sentinels, splice, selection restore (§5.2)

**Files:**
- Create: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`

**Interfaces:**
- Consumes: `usfmFragmentToUsjContent`, `displayTextToUsj`, `textTypeState`, node guards (`$isMarkerNode`, `$isCharNode`, `$isNoteNode`, `$isUnknownNode`, `$isMilestoneNode`, `$isVerseNode`, `$isParaNode`), `NBSP`, `LoggerBasic` from `shared`; `ViewOptions` from `shared-react`; `usjEditorAdaptor` from `../adaptors/usj-editor.adaptor`; `$parseSerializedNode`, `$getState`, `$getSelection`, `$isRangeSelection`, `$isTextNode`, `$isElementNode`, `$isLineBreakNode` from `lexical`; `USJ_TYPE`, `USJ_VERSION` from `@eten-tech-foundation/scripture-utilities`.
- Produces (used by Tasks 8, 10, 11):
  - `ATOMIC_SENTINEL = "￼"`.
  - `$rebuildParas(paras: ParaNode[], viewOptions: ViewOptions, logger?: LoggerBasic): boolean` — must be called inside an `editor.update`/transform/command context. Returns `false` when guard rails skip: paragraph has `unknownAttributes`, its marker is unknown to the kind data as a paragraph marker, it sits inside an `UnknownNode` ancestor, the tokenizer produced no content, or the output's sentinel count mismatches the preserved-node count (symmetry bail-out — a tokenizer bug must fail as "nothing happened", never as a dropped node). Replaces the paragraphs with re-tokenized equivalents; atomic child nodes are MOVED (same node keys) not recreated; restores the caret to the same display-text offset.
  - `$requestTier2ForNode(node: LexicalNode, viewOptions: ViewOptions, logger?: LoggerBasic): void` — walks up to the nearest `ParaNode` and rebuilds it; no-op when the node is not inside a plain paragraph (book/chapter/note content — note content is a Phase 3 scope).

**Sentinel rule (Decision 3, preserve-or-refuse):** a node contributes its visible text when its USJ state is fully recoverable from that text; otherwise it contributes one U+FFFC and its node run is moved verbatim into the rebuilt tree. A sentinel entry is a node RUN (`LexicalNode[]`): for milestones it carries the decorator plus its display siblings (opening MarkerNode + attribute text + `\*` MarkerNode), so the visible glyphs survive the rebuild; for everything else it is a single node. Char spans whose marker is unknown to `getMarker()` are sentinels too — the tokenizer would otherwise degrade a custom.sty span to literal text.

- [ ] **Step 1: Write the failing tests**

Create `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.test.tsx`. Test scaffolding: build real standard-view states by serializing USX through the adaptor (identical to how the corpus harness does it), load into a headless editor, mutate, rebuild, and assert via the reverse adaptor.

```tsx
import usjEditorAdaptor, {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $rebuildParas } from "./tier2Rebuild.utils";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { $getRoot, $isTextNode } from "lexical";
import { $isParaNode, ParaNode, TypedMarkNode } from "shared";
// eslint-disable-next-line no-restricted-imports -- test-only helper shared across packages
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes } from "shared-react";

const viewOptions = getViewOptions(STANDARD_VIEW_MODE);

function usjFromUsx(paraContent: string) {
  return usxStringToUsj(
    `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" /><para style="p">${paraContent}</para></usx>`,
  );
}

/** Load `usj` into a fresh headless editor in standard view; returns the editor. */
function loadEditor(usj: ReturnType<typeof usjFromUsx>) {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined, viewOptions);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

function $lastPara(): ParaNode {
  const paras = $getRoot().getChildren().filter($isParaNode);
  return paras[paras.length - 1];
}

describe("$rebuildParas", () => {
  it("turns literal typed char markers into a CharNode span", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before  after`));
    editor.update(
      () => {
        const para = $lastPara();
        // simulate the user having typed "\nd Lord\nd*" between "before " and " after"
        const text = para
          .getChildren()
          .filter($isTextNode)
          .find((node) => node.getTextContent().includes("before"))!;
        text.setTextContent("before \\nd Lord\\nd* after");
        expect($rebuildParas([para], viewOptions)).toBe(true);
      },
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON());
    const para = usj!.content.find((c) => typeof c !== "string" && c.type === "para")!;
    expect(para).toMatchObject({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "before ",
        { type: "char", marker: "nd", content: ["Lord"] },
        " after",
      ],
    });
  });

  it("splits the paragraph when the text contains a literal \\p", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />one \\p two`));
    editor.update(
      () => expect($rebuildParas([$lastPara()], viewOptions)).toBe(true),
      { discrete: true },
    );
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON())!;
    const paras = usj.content.filter((c) => typeof c !== "string" && c.type === "para");
    expect(paras).toHaveLength(2);
    expect(paras[1]).toMatchObject({ type: "para", marker: "p", content: ["two"] });
  });

  it("creates a verse from literal \\v text", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />one \\v 2 two`));
    editor.update(() => $rebuildParas([$lastPara()], viewOptions), { discrete: true });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON())!;
    const para = usj.content.find((c) => typeof c !== "string" && c.type === "para")!;
    expect(para).toMatchObject({
      content: [
        { type: "verse", number: "1" },
        "one ",
        { type: "verse", number: "2" },
        "two",
      ],
    });
  });

  it("creates a collapsed note from literal typed note markers", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />text \\f + \\ft A note.\\f* end`));
    editor.update(() => $rebuildParas([$lastPara()], viewOptions), { discrete: true });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON())!;
    const para = usj.content.find((c) => typeof c !== "string" && c.type === "para")!;
    expect(para).toMatchObject({
      content: [
        { type: "verse", number: "1" },
        "text ",
        { type: "note", marker: "f", caller: "+", content: [{ type: "char", marker: "ft", content: ["A note."] }] },
        " end",
      ],
    });
  });

  it("moves an existing NoteNode through the rebuild without recreating it (sentinel)", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" />a<note caller="+" style="f"><char style="ft">n</char></note> b \\nd x\\nd* c`,
      ),
    );
    let noteKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        noteKey = para.getChildren().find((n) => n.getType() === "note")!.getKey();
        $rebuildParas([para], viewOptions);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const para = $lastPara();
      const note = para.getChildren().find((n) => n.getType() === "note");
      expect(note?.getKey()).toBe(noteKey); // same instance, not a recreation
    });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON())!;
    const para = usj.content.find((c) => typeof c !== "string" && c.type === "para")!;
    expect(JSON.stringify(para)).toContain('"marker":"nd"'); // the typed span was built
    expect(JSON.stringify(para)).toContain('"type":"note"'); // the note survived
  });

  it("moves an unknown-marker char span through the rebuild as a sentinel", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" />a <char style="zx">custom</char> b \\nd x\\nd* c`,
      ),
    );
    let charKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        charKey = para.getChildren().find((n) => n.getType() === "char")!.getKey();
        expect($rebuildParas([para], viewOptions)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const chars = $lastPara().getChildren().filter((n) => n.getType() === "char");
      expect(chars.some((c) => c.getKey() === charKey)).toBe(true); // same instance
    });
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON())!;
    expect(JSON.stringify(usj)).toContain('"marker":"zx"'); // custom span intact
    expect(JSON.stringify(usj)).toContain('"marker":"nd"'); // typed span built
  });

  it("refuses to rebuild a paragraph whose marker is unknown (guard rail)", () => {
    const editor = loadEditor(
      usxStringToUsj(
        `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" /><para style="zq">custom para \\nd x\\nd*</para></usx>`,
      ),
    );
    editor.update(() => expect($rebuildParas([$lastPara()], viewOptions)).toBe(false), {
      discrete: true,
    });
  });

  it("carries a milestone's display run through the rebuild", () => {
    const editor = loadEditor(
      usjFromUsx(
        `<verse number="1" style="v" /><ms style="ts-s" sid="ts.RUT.1" />text \\nd x\\nd* end`,
      ),
    );
    let msKey = "";
    editor.update(
      () => {
        const para = $lastPara();
        msKey = para.getChildren().find((n) => n.getType() === "ms")!.getKey();
        expect($rebuildParas([para], viewOptions)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const children = $lastPara().getChildren();
      const msIndex = children.findIndex((n) => n.getType() === "ms");
      expect(children[msIndex]?.getKey()).toBe(msKey);
      // display glyphs survived: opening \ts-s, attribute text, self-closing \*
      expect(children[msIndex + 1]?.getTextContent()).toBe("\\ts-s");
      expect(children[msIndex + 2]?.getTextContent()).toContain('sid="ts.RUT.1"');
      expect(children[msIndex + 3]?.getTextContent()).toBe("\\*");
    });
  });

  it("skips paragraphs with unknownAttributes (guard rail)", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />text`));
    editor.update(
      () => {
        const para = $lastPara();
        para.setUnknownAttributes({ custom: "x" });
        expect($rebuildParas([para], viewOptions)).toBe(false);
      },
      { discrete: true },
    );
  });

  it("restores the caret to the same display offset", () => {
    const editor = loadEditor(usjFromUsx(`<verse number="1" style="v" />before \\nd Lord\\nd* after`));
    editor.update(
      () => {
        const para = $lastPara();
        const text = para
          .getChildren()
          .filter($isTextNode)
          .find((node) => node.getTextContent().includes("after"))!;
        // caret between "af" and "ter" of the trailing text
        const offset = text.getTextContent().indexOf("ter");
        text.select(offset, offset);
        $rebuildParas([para], viewOptions);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) {
        const anchorNode = selection.anchor.getNode();
        expect(anchorNode.getTextContent().slice(selection.anchor.offset)).toMatch(/^ter/);
      }
    });
  });
});
```

Add the missing lexical imports the test needs (`$getSelection`, `$isRangeSelection`). If `editor.parseEditorState`/`setEditorState` proves awkward with the serialized root shape, load via the same mechanism `LoadStatePlugin` uses (read its source once and copy the two lines) — do not invent a third loading path.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- tier2Rebuild`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `packages/platform/src/editor/markerEdit/tier2Rebuild.utils.ts`:

```ts
/**
 * Tier 2 paragraph-scoped re-tokenization (design spec §5.2). Runs INSIDE the
 * triggering update (transform or command listener), so the rebuild and the
 * user's edit are one history entry. Blast radius is paragraph-local.
 */

import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { MarkerContent, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import {
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $getState,
  $parseSerializedNode,
  ElementNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  getMarker,
  LoggerBasic,
  MarkerType,
  NBSP,
  ParaNode,
  textTypeState,
  usfmFragmentToUsjContent,
  VerseNode,
} from "shared";
import { ViewOptions } from "shared-react";

export const ATOMIC_SENTINEL = "￼";

interface FragmentSpan {
  key: string;
  start: number;
  end: number;
  isSentinel: boolean;
}

interface FragmentAccumulator {
  text: string;
  spans: FragmentSpan[];
  /** One entry per U+FFFC, in fragment order; each entry is a node RUN to re-insert. */
  sentinels: LexicalNode[][];
}

function pushText(out: FragmentAccumulator, node: LexicalNode, text: string): void {
  out.spans.push({
    key: node.getKey(),
    start: out.text.length,
    end: out.text.length + text.length,
    isSentinel: false,
  });
  out.text += text;
}

function pushSentinel(out: FragmentAccumulator, nodes: LexicalNode[]): void {
  out.spans.push({
    key: nodes[0].getKey(),
    start: out.text.length,
    end: out.text.length + 1,
    isSentinel: true,
  });
  out.sentinels.push(nodes);
  out.text += ATOMIC_SENTINEL;
}

/** Display text → USFM fragment text: structural NBSP separators become plain spaces. */
function toFragmentText(text: string): string {
  return text.replaceAll(NBSP, " ");
}

/**
 * Display siblings after a MilestoneNode that belong to its run: opening
 * MarkerNode, optional attribute TextNode, self-closing MarkerNode. They ride
 * inside the milestone's sentinel so the visible glyphs survive the rebuild.
 */
function milestoneDisplayRun(children: LexicalNode[], index: number): LexicalNode[] {
  const run: LexicalNode[] = [];
  const opening = children[index + 1];
  if (!$isMarkerNode(opening) || opening.getMarkerSyntax() !== "opening") return run;
  run.push(opening);
  let nextIndex = index + 2;
  const maybeAttribute = children[nextIndex];
  if ($isTextNode(maybeAttribute) && $getState(maybeAttribute, textTypeState) === "attribute") {
    run.push(maybeAttribute);
    nextIndex++;
  }
  const closing = children[nextIndex];
  if ($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing") run.push(closing);
  return run;
}

/** A verse whose state is not fully recoverable from its visible text stays atomic. */
function verseNeedsSentinel(node: VerseNode): boolean {
  return Boolean(
    node.getSid() ?? node.getAltnumber() ?? node.getPubnumber() ?? node.getUnknownAttributes(),
  );
}

function $appendChildrenFragment(element: ElementNode, out: FragmentAccumulator): void {
  const children = element.getChildren();
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMarkerNode(node)) {
      pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isMilestoneNode(node)) {
      const run = milestoneDisplayRun(children, index);
      pushSentinel(out, [node, ...run]);
      index += run.length;
    } else if ($isNoteNode(node) || $isUnknownNode(node)) {
      pushSentinel(out, [node]);
    } else if ($isVerseNode(node)) {
      if (verseNeedsSentinel(node)) pushSentinel(out, [node]);
      else pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isCharNode(node)) {
      // Unknown-marker spans (custom.sty) are not text-recoverable: the
      // tokenizer would degrade them to literal text (preserve-or-refuse).
      if (node.getUnknownAttributes() || getMarker(node.getMarker()) === undefined)
        pushSentinel(out, [node]);
      else $appendChildrenFragment(node, out);
    } else if ($isLineBreakNode(node)) {
      pushText(out, node, " ");
    } else if ($isTextNode(node)) {
      const textType = $getState(node, textTypeState);
      if (textType === "marker-trailing-space") pushText(out, node, " ");
      else pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isElementNode(node)) {
      // TypedMarkNode and other transparent wrappers: annotation marks are
      // host-reapplied overlays; their text content is rebuilt as plain content.
      $appendChildrenFragment(node, out);
    } else {
      pushSentinel(out, [node]);
    }
  }
}

function $buildParaFragment(para: ParaNode): FragmentAccumulator | undefined {
  // §5.2 guard rails (preserve-or-refuse): a paragraph the engine cannot fully
  // re-derive from its text is never rebuilt — edits inside it stay literal text.
  if (para.getUnknownAttributes()) return undefined;
  // Unknown/custom.sty para marker: the tokenizer would re-wrap the fragment in
  // a default \p and turn the real marker into literal text (invented bytes).
  if (getMarker(para.getMarker())?.type !== MarkerType.Paragraph) return undefined;
  // Paragraphs inside opaque blocks (§7: sidebars, periph, …) stay untouched.
  for (let parent = para.getParent(); parent !== null; parent = parent.getParent())
    if ($isUnknownNode(parent)) return undefined;
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendChildrenFragment(para, out);
  return out;
}

/** Replace each U+FFFC in the rebuilt tree with the next preserved node run. */
function $replaceSentinels(roots: LexicalNode[], originals: LexicalNode[][]): void {
  let queueIndex = 0;
  const visit = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      let current: TextNode | undefined = node;
      while (current) {
        const text: string = current.getTextContent();
        const at = text.indexOf(ATOMIC_SENTINEL);
        if (at < 0) break;
        let sentinelNode: TextNode = current;
        let after: TextNode | undefined;
        if (at > 0) [, sentinelNode] = current.splitText(at) as [TextNode, TextNode];
        if (sentinelNode.getTextContent().length > 1)
          [sentinelNode, after] = sentinelNode.splitText(1) as [TextNode, TextNode];
        const run = originals[queueIndex++];
        if (run && run.length > 0) {
          let previous: LexicalNode = sentinelNode;
          for (const original of run) {
            previous.insertAfter(original); // moves it out of the old paragraph
            previous = original;
          }
        }
        sentinelNode.remove();
        current = after;
      }
    } else if ($isElementNode(node)) {
      // copy: children may be replaced while visiting
      [...node.getChildren()].forEach(visit);
    }
  };
  roots.forEach(visit);
}

/** U+FFFC occurrences across tokenized content — must equal the preserved-run count. */
function countSentinels(content: MarkerContent[]): number {
  let count = 0;
  for (const item of content) {
    if (typeof item === "string") {
      for (const ch of item) if (ch === ATOMIC_SENTINEL) count++;
    } else if (item.content) {
      count += countSentinels(item.content);
    }
  }
  return count;
}

function $spansForNodes(nodes: LexicalNode[]): FragmentSpan[] {
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const node of nodes) {
    if (out.text.length > 0) out.text += " ";
    if ($isElementNode(node)) $appendChildrenFragment(node, out);
  }
  return out.spans;
}

function $restoreSelectionAtOffset(newNodes: LexicalNode[], offset: number | undefined): void {
  const firstElement = newNodes.find($isElementNode);
  if (offset === undefined) {
    firstElement?.selectStart();
    return;
  }
  const spans = $spansForNodes(newNodes);
  let best: { key: string; offset: number } | undefined;
  for (const span of spans) {
    if (span.isSentinel) continue;
    if (offset >= span.start && offset <= span.end) {
      best = { key: span.key, offset: offset - span.start };
      break;
    }
    if (span.start > offset) {
      best = { key: span.key, offset: 0 };
      break;
    }
  }
  if (!best) {
    const last = [...spans].reverse().find((span) => !span.isSentinel);
    if (last) best = { key: last.key, offset: last.end - last.start };
  }
  const node = best ? $getNodeByKey<TextNode>(best.key) : undefined;
  if (node && $isTextNode(node)) node.select(best!.offset, best!.offset);
  else firstElement?.selectStart();
}

export function $rebuildParas(
  paras: ParaNode[],
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  if (paras.length === 0) return false;

  const combined: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const para of paras) {
    const fragment = $buildParaFragment(para);
    if (!fragment) {
      logger?.debug("[MarkerEdit] Tier 2 skipped: paragraph excluded by guard rails");
      return false;
    }
    if (combined.text.length > 0) combined.text += " ";
    const base = combined.text.length;
    fragment.spans.forEach((span) =>
      combined.spans.push({ ...span, start: span.start + base, end: span.end + base }),
    );
    combined.sentinels.push(...fragment.sentinels);
    combined.text += fragment.text;
  }

  // Capture the caret as a fragment offset before mutating anything.
  let caretOffset: number | undefined;
  const selection = $getSelection();
  if ($isRangeSelection(selection) && selection.isCollapsed()) {
    const span = combined.spans.find((candidate) => candidate.key === selection.anchor.key);
    if (span)
      caretOffset = Math.min(
        span.start + (span.isSentinel ? 1 : selection.anchor.offset),
        span.end,
      );
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(combined.text);
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  // Symmetry bail-out: every preserved node run must have exactly one placeholder
  // in the output, or the rebuild aborts with the paragraph untouched. A tokenizer
  // bug must fail as "nothing happened", never as a silently dropped node.
  if (countSentinels(content) !== combined.sentinels.length) {
    logger?.warn("[MarkerEdit] Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  );
  const newNodes = serialized.root.children.map((child) => $parseSerializedNode(child));

  const firstPara = paras[0];
  newNodes.forEach((node) => firstPara.insertBefore(node));
  // Move originals BEFORE removing the old paragraphs (removal destroys leftovers).
  $replaceSentinels(newNodes, combined.sentinels);
  paras.forEach((para) => para.remove());
  $restoreSelectionAtOffset(newNodes, caretOffset);
  return true;
}

/** Route a Tier 1-unexpressible edit to Tier 2 via the node's paragraph. */
export function $requestTier2ForNode(
  node: LexicalNode,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): void {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isNoteNode(current)) return; // note content is its own scope (Phase 3)
    if ($isUnknownNode(current)) return; // opaque-block interior (§7): stay literal
    if ($isParaNode(current)) {
      $rebuildParas([current], viewOptions, logger);
      return;
    }
    current = current.getParent();
  }
}
```

Import `$getNodeByKey` from `lexical` (used in `$restoreSelectionAtOffset`).

`serializeEditorState` must NOT be preceded by `reset()` here — the caller-count state belongs to the document load, not the rebuild.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- tier2Rebuild`
Expected: PASS (10 tests). Debug notes for likely first failures:
- Note-child NBSP interleaving means exact `content` arrays around notes can carry extra spaces; assert with `toMatchObject`/`toContain` as written, not `toEqual`, where the test already does.
- If `$parseSerializedNode` throws on the node-state `textType` field, parse via `editor.parseEditorState` of a root wrapper instead and lift its children — keep whichever works and note it in the task summary.

Then: `pnpm nx test @eten-tech-foundation/platform-editor` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: Tier 2 paragraph re-tokenization core with atomic-node sentinels (spec §5.2)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 7: MarkerEditPlugin skeleton + Tier 1 paragraph-marker rename (§5.1)

**Files:**
- Create: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx`
- Create: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx`
- Modify: `packages/platform/src/editor/Editor.tsx` (mount plugin; alphabetical block)

**Interfaces:**
- Consumes: `$requestTier2ForNode` (Task 6); `getMarker`/`MarkerType` (shared usfm data); `MarkerNode`, `openingMarkerText`, `closingMarkerText`, `$isParaNode`, `$isMarkerNode`, `NoteNode`, `MilestoneNode`, `NBSP`, `LoggerBasic` from `shared`; `ViewOptions` from `shared-react`.
- Produces:
  - `MarkerEditPlugin({ viewOptions, logger }): null` — registers everything; active only when `viewOptions.markerMode === "editable"` (spec §5).
  - `interface MarkerEditContext { viewOptions: ViewOptions; pendingKeys: Set<NodeKey>; splitExpected: { current: boolean }; logger?: LoggerBasic }` — one instance per mounted plugin, passed into every `$`-function. Tasks 8–11 extend these same files.
  - `$markerNodeTransform(node, context)`, `$resolvePendingMarkers(context)`, `$isSelectionInMarkerNode()`, `$applyOpenerRename(node, newMarker, context)` (exported for tests).
- Tier 1 termination contract (spec §5.1): an opening MarkerNode is "terminated" when its text ends with a typed space/NBSP (`\s2␣`); the terminator is absorbed when the text is reset to canonical `\s2`. Unterminated mid-edit text goes into `pendingKeys`; Enter, blur, and the caret leaving the node resolve pendings (bare `\s2` counts as complete then) — the deterministic equivalent of PT9's 1s debounced reformat. An opener retyped into closer form (`\nd*`), or any terminated closer mismatch, routes to Tier 2.

- [ ] **Step 1: Write the failing tests**

Create `markerEditTier1.utils.test.tsx`:

```tsx
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
} from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, BLUR_COMMAND, KEY_ENTER_COMMAND } from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  MarkerNode,
  NBSP,
  ParaNode,
} from "shared";
// eslint-disable-next-line no-restricted-imports -- test-only helper shared across packages
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

async function testEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />,
  );
}

function $appendHeadingPara(): { para: ParaNode; marker: MarkerNode } {
  const para = $createParaNode("s1");
  const marker = $createMarkerNode("s1");
  $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("Heading")));
  return { para, marker };
}

describe("Tier 1 paragraph-marker rename", () => {
  it("renames the paragraph when marker text is retyped and space-terminated", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2 ")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s2");
      expect(marker.getMarker()).toBe("s2");
      expect(marker.getTextContent()).toBe("\\s2"); // terminator absorbed
    });
  });

  it("accepts a syntactically complete unknown marker as typed (PT9 behavior)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\zed ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zed"));
  });

  it("leaves unterminated mid-edit text alone", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s1"); // untouched mid-edit
      expect(marker.getTextContent()).toBe("\\s2");
    });
  });

  it("completes a pending marker on Enter", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("completes a pending marker on blur", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("completes a pending marker when the caret leaves it (PT9 debounce equivalent)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3); // still editing: stays pending
      }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1"));
    await act(async () =>
      editor.update(() => {
        // caret moves into the heading text -> the pending marker completes
        para.getLastChild()?.selectStart();
      }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("re-tokenizes when a char-kind marker is typed in para position", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\add ")));
    editor.getEditorState().read(() => {
      // Tier 2 wrapped the heading text in a char span inside a default para
      const paras = $getRoot().getChildren();
      expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"add"');
      expect(paras.some((p) => p.getType() === "para")).toBe(true);
    });
  });

  it("blocks Enter while the caret is inside marker text and completes instead", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3);
      }),
    );
    let handled = false;
    await act(async () => {
      handled = editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s2");
      expect($getRoot().getChildren().filter((n) => n.getType() === "para")).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `markerEditTier1.utils.ts`**

```ts
/**
 * Tier 1 of the marker-editing engine (design spec §5.1): in-place renames that
 * keep structural node state and visible marker text in agreement at rest.
 * Everything Tier 1 cannot express routes to Tier 2 ($requestTier2ForNode).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import {
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  NodeKey,
} from "lexical";
import {
  $isMarkerNode,
  $isParaNode,
  closingMarkerText,
  LoggerBasic,
  MarkerNode,
  MilestoneNode,
  NoteNode,
  openingMarkerText,
} from "shared";
import { getMarker } from "shared"; // if not re-exported from the barrel, import from libs path used elsewhere in this package
import { MarkerType } from "shared";
import { ViewOptions } from "shared-react";

export interface MarkerEditContext {
  viewOptions: ViewOptions;
  pendingKeys: Set<NodeKey>;
  splitExpected: { current: boolean };
  logger?: LoggerBasic;
}

const TERMINATED_OPENER_REGEX = /^\\(\+?[\w-]+)[  ]$/;
const BARE_OPENER_REGEX = /^\\(\+?[\w-]+)$/;
const CLOSER_FORM_REGEX = /^\\\+?[\w-]*\*$/;

function $markerCanonicalText(node: MarkerNode): string {
  const syntax = node.getMarkerSyntax();
  if (syntax === "closing") return closingMarkerText(node.getMarker());
  if (syntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(node.getMarker());
}

/** Spec §5.1 same-positional-kind rule for paragraph openers. Unknown markers stay as typed. */
function isParaKindMarker(marker: string): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  if (NoteNode.isValidMarker(clean) || MilestoneNode.isValidMarker(clean)) return false;
  const kind = getMarker(clean)?.type;
  return kind === undefined || kind === MarkerType.Paragraph || kind === MarkerType.Unknown;
}

function $moveCaretPastMarker(node: MarkerNode): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  if (selection.anchor.key !== node.getKey()) return;
  const next = node.getNextSibling();
  // Both para trailing-space and char NBSP-prefixed content put the caret after
  // offset 1 of the following text node.
  if ($isTextNode(next)) next.select(1, 1);
  else node.select(node.getTextContentSize(), node.getTextContentSize());
}

export function $applyOpenerRename(
  node: MarkerNode,
  newMarker: string,
  context: MarkerEditContext,
): void {
  const parent = node.getParent();
  if ($isParaNode(parent)) {
    if (!isParaKindMarker(newMarker)) {
      $requestTier2ForNode(node, context.viewOptions, context.logger);
      return;
    }
    parent.setMarker(newMarker);
    node.setMarker(newMarker); // rewrites __text to canonical, absorbing the typed terminator
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] para marker renamed to "${newMarker}"`);
    return;
  }
  // Char/note openers are handled in-place from Task 8 on; re-tokenizing is the
  // correct (if heavier) behavior in the meantime.
  $requestTier2ForNode(node, context.viewOptions, context.logger);
}

export function $markerNodeTransform(node: MarkerNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (text === $markerCanonicalText(node)) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (node.getMarkerSyntax() === "opening") {
    const terminated = TERMINATED_OPENER_REGEX.exec(text);
    if (terminated) {
      context.pendingKeys.delete(node.getKey());
      $applyOpenerRename(node, terminated[1], context);
      return;
    }
    if (CLOSER_FORM_REGEX.test(text)) {
      // Opener retyped into closer form: positional kind changed -> Tier 2.
      context.pendingKeys.delete(node.getKey());
      $requestTier2ForNode(node, context.viewOptions, context.logger);
      return;
    }
    context.pendingKeys.add(node.getKey());
    return;
  }
  // Closer / selfClosing: one-way authority — closer edits never rename the span.
  if (text.endsWith("*")) {
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context.viewOptions, context.logger);
    return;
  }
  context.pendingKeys.add(node.getKey());
}

/**
 * Completion trigger. PT9 completes mid-edit markers via its 1s debounced
 * reformat; our deterministic equivalents are Enter, blur, and the caret
 * leaving the node (`exceptKey` keeps the node still being edited pending).
 */
export function $resolvePendingMarkers(context: MarkerEditContext, exceptKey?: NodeKey): void {
  if (context.pendingKeys.size === 0) return;
  const keys = [...context.pendingKeys].filter((key) => key !== exceptKey);
  for (const key of keys) {
    context.pendingKeys.delete(key);
    const node: LexicalNode | null = $getNodeByKey(key);
    if (!node?.isAttached()) continue;
    if ($isMarkerNode(node)) {
      const text = node.getTextContent();
      if (text === $markerCanonicalText(node)) continue;
      const bare = BARE_OPENER_REGEX.exec(text);
      if (node.getMarkerSyntax() === "opening" && bare) $applyOpenerRename(node, bare[1], context);
      else $requestTier2ForNode(node, context.viewOptions, context.logger);
    } else {
      // Pending plain-text / verse nodes (registered by later tasks) re-tokenize.
      $requestTier2ForNode(node, context.viewOptions, context.logger);
    }
  }
}

export function $isSelectionInMarkerNode(): boolean {
  const selection = $getSelection();
  return $isRangeSelection(selection) && $isMarkerNode(selection.anchor.getNode());
}
```

If `getMarker`/`MarkerType` are not exported from the `shared` barrel, add them to `libs/shared/src/utils/usfm/index.ts` (they are already public-ish via `useUsfmMarkersForMenu`'s import path — match that path).

- [ ] **Step 4: Implement `MarkerEditPlugin.tsx`**

```tsx
import {
  $isSelectionInMarkerNode,
  $markerNodeTransform,
  $resolvePendingMarkers,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  INSERT_PARAGRAPH_COMMAND,
  KEY_ENTER_COMMAND,
  NodeKey,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { LoggerBasic, MarkerNode } from "shared";
import { ViewOptions } from "shared-react";

/**
 * The Standard-view marker-editing engine (design spec §5). Tier 1 node
 * transforms keep structural state in sync with edited marker text; completion
 * commands (Enter/blur) resolve mid-edit markers; Tier 2 re-tokenization
 * handles everything else. Active only when markers are editable text.
 */
export function MarkerEditPlugin({
  viewOptions,
  logger,
}: {
  viewOptions: ViewOptions | undefined;
  logger?: LoggerBasic;
}): null {
  const [editor] = useLexicalComposerContext();
  const isEnabled = viewOptions?.markerMode === "editable";

  useEffect(() => {
    if (!isEnabled || !viewOptions) return;
    const context: MarkerEditContext = {
      viewOptions,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      logger,
    };
    return mergeRegister(
      editor.registerNodeTransform(MarkerNode, (node) => {
        if (editor.isComposing()) return;
        $markerNodeTransform(node, context);
      }),
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        () => {
          const inMarker = $isSelectionInMarkerNode();
          $resolvePendingMarkers(context);
          return inMarker; // swallow Enter inside marker text (complete, don't split)
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => {
          context.splitExpected.current = true; // consumed by the ParaNode transform (Task 10)
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          $resolvePendingMarkers(context);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          // PT9's debounced reformat completes a marker once the user moves on;
          // our deterministic equivalent: resolve pendings the caret is no longer in.
          if (context.pendingKeys.size === 0) return false;
          const selection = $getSelection();
          const anchorKey = $isRangeSelection(selection) ? selection.anchor.key : undefined;
          $resolvePendingMarkers(context, anchorKey);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerUpdateListener(() => {
        context.splitExpected.current = false;
      }),
    );
  }, [editor, isEnabled, viewOptions, logger]);

  return null;
}
```

In `Editor.tsx`: import `MarkerEditPlugin` from `./markerEdit/MarkerEditPlugin` and mount it in the alphabetical block between `<ContextMenuPlugin …/>` and `<NoteNodePlugin …/>`:

```tsx
          <MarkerEditPlugin viewOptions={viewOptions} logger={logger} />
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1`
Expected: PASS (7 tests). Then full package: `pnpm nx test @eten-tech-foundation/platform-editor` — PASS. The existing `ParaMarkerPrefixGuardPlugin` is still mounted and unchanged in this task; nothing here fires it (marker nodes still exist).

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/
git commit -m "feat: MarkerEditPlugin Tier 1 paragraph-marker rename (spec §5.1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Tier 1 char/note opener rename with closer mirroring

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx`

**Interfaces:**
- Consumes: Task 7's context/module; `$isCharNode`, `$isNoteNode`, `CharNode` from `shared`.
- Produces: `$applyOpenerRename` handles CharNode/NoteNode parents in place — `parent.setMarker`, closing MarkerNode rewritten in the same update (one-way authority: opener edits rewrite closers), selection clamped when the closer shrinks under the caret. Closer edits already route to Tier 2 (Task 7's transform).

- [ ] **Step 1: Write the failing tests**

Append to the test file (build a char span the way the adaptor shapes it):

```tsx
import { $createCharNode, $createNoteNode, CharNode, NoteNode as NoteNodeClass } from "shared";

function $appendCharPara(): { marker: MarkerNode; char: CharNode; closer: MarkerNode } {
  const para = $createParaNode("p");
  const paraMarker = $createMarkerNode("p");
  const char = $createCharNode("nd");
  const marker = $createMarkerNode("nd");
  const closer = $createMarkerNode("nd", "closing");
  $getRoot().append(
    para.append(
      paraMarker,
      $createTextNode(NBSP),
      char.append(marker, $createTextNode(`${NBSP}Lord`), closer),
    ),
  );
  return { marker, char, closer };
}

describe("Tier 1 char/note opener rename", () => {
  it("renames the span and mirrors the closer", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.setTextContent("\\wj ")));
    editor.getEditorState().read(() => {
      expect(parts.char.getMarker()).toBe("wj");
      expect(parts.marker.getTextContent()).toBe("\\wj");
      expect(parts.closer.getTextContent()).toBe("\\wj*");
    });
  });

  it("clamps the selection when the closer shrinks under the caret", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        parts.closer.select(4, 4); // caret at end of `\nd*`
        parts.marker.setTextContent("\\w "); // shorter marker
      }),
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection) && selection.anchor.key === parts.closer.getKey())
        expect(selection.anchor.offset).toBeLessThanOrEqual(parts.closer.getTextContentSize());
    });
  });

  it("routes a closer mismatch edit to Tier 2 (span rebuilt by the tokenizer)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.closer.setTextContent("\\wj*")));
    // Tokenizer sees `\nd ␣Lord\wj*`: unmatched closer stays literal, span auto-closes.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).toContain("\\\\wj*");
  });

  it("renames a note opener and mirrors its closer", async () => {
    let note: NoteNodeClass, opener: MarkerNode, closer: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      note = $createNoteNode("f", "+");
      opener = $createMarkerNode("f");
      closer = $createMarkerNode("f", "closing");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append(opener, $createTextNode(`${NBSP}content`), closer),
        ),
      );
    });
    await act(async () => editor.update(() => opener.setTextContent("\\x ")));
    editor.getEditorState().read(() => {
      expect(note.getMarker()).toBe("x");
      expect(closer.getTextContent()).toBe("\\x*");
    });
  });

  it("routes a para-kind marker typed in char position to Tier 2", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.setTextContent("\\q1 ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"q1"'); // re-tokenized into a q1 paragraph
  });
});
```

(The Tier 2-routing assertions go through the real tokenizer + adaptor — the plugin test environment initializes the serialize adaptor in Task 7's `testEnvironment`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1`
Expected: the new describe FAILS (char openers currently route to Tier 2, so `char.getMarker()` stays `nd` / structure changes instead of renaming in place).

- [ ] **Step 3: Implement**

In `markerEditTier1.utils.ts` add imports (`$isCharNode`, `$isNoteNode` from `shared`) and:

```ts
/** Spec §5.1 same-positional-kind rule for char openers. Unknown markers stay as typed. */
function isCharKindMarker(marker: string): boolean {
  const clean = marker.replace(/^\+/, "");
  if (clean === "v" || clean === "c") return false;
  if (NoteNode.isValidMarker(clean) || MilestoneNode.isValidMarker(clean)) return false;
  const kind = getMarker(clean)?.type;
  return kind === undefined || kind === MarkerType.Character || kind === MarkerType.Unknown;
}

function $clampSelectionToLength(node: MarkerNode, newLength: number): void {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;
  [selection.anchor, selection.focus].forEach((point) => {
    if (point.key === node.getKey() && point.offset > newLength)
      point.set(node.getKey(), newLength, "text");
  });
}
```

Replace the closing `// Char/note openers …` block of `$applyOpenerRename` with:

```ts
  if ($isCharNode(parent) || $isNoteNode(parent)) {
    const clean = newMarker.replace(/^\+/, "");
    const isValidKind = $isCharNode(parent)
      ? isCharKindMarker(newMarker)
      : NoteNode.isValidMarker(clean);
    if (!isValidKind) {
      $requestTier2ForNode(node, context.viewOptions, context.logger);
      return;
    }
    parent.setMarker(clean);
    const closer = parent
      .getChildren()
      .filter($isMarkerNode)
      .find((child) => child.getMarkerSyntax() === "closing");
    if (closer) {
      $clampSelectionToLength(closer, closingMarkerText(clean).length);
      closer.setMarker(clean); // same update: opener authority rewrites the closer
    }
    node.setMarker(clean);
    $moveCaretPastMarker(node);
    context.logger?.debug(`[MarkerEdit] ${parent.getType()} marker renamed to "${clean}"`);
    return;
  }
  $requestTier2ForNode(node, context.viewOptions, context.logger);
```

Convergence note (spec §5.1 invariants): `closer.setMarker` fires the MarkerNode transform for the closer, whose text now equals its canonical form → early return. All `setMarker` implementations early-return on equality — one pass.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1` — PASS.
Then `pnpm nx test @eten-tech-foundation/platform-editor` — PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: Tier 1 char/note opener rename with closer mirroring (spec §5.1)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Tier 1 verse/chapter number sync + segment-regex widening (finding #5)

**Files:**
- Modify: `libs/shared/src/nodes/usj/node.utils.ts` (`parseNumberFromMarkerText` regex, ~line 409)
- Modify: `libs/shared/src/nodes/usj/node-utils.test.ts`
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.ts` (add verse/chapter transforms)
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (register them)
- Modify: `packages/platform/src/editor/markerEdit/markerEditTier1.utils.test.tsx`

**Interfaces:**
- Consumes: `VerseNode`, `ChapterNode`, `getVisibleOpenMarkerText`, `VERSE_MARKER`/`CHAPTER_MARKER` (import from the node files if not barrel-exported) from `shared`.
- Produces: `$verseNodeTransform(node: VerseNode, context)`, `$chapterNodeTransform(node: ChapterNode, context)`. Live invariant: `VerseNode.__number` matches the visible token whenever the text is at rest. PT9 `GetNextWord` semantics: the whole whitespace-delimited word after `\v ` is the number token, valid or not. Trailing non-token text typed inside the verse node is extracted into a following plain TextNode.

- [ ] **Step 1: Widen the segment regex (TDD)**

In `node-utils.test.ts`, next to the existing bridge/segment tests:

```ts
  it("preserves multi-letter segments instead of truncating (finding #5)", () => {
    expect(parseNumberFromMarkerText("v", `\\v${NBSP}5abc `, "9")).toBe("5abc");
  });
```

Run `pnpm nx test shared -- node-utils` → the new test FAILS (`"5a"`). Then in `node.utils.ts` change the regex to:

```ts
    const match = /^(\d+[a-zA-Z]*(?:[-,]\d+[a-zA-Z]*)*)/.exec(rest);
```

Run again → PASS. Full `pnpm nx test shared && pnpm nx test @eten-tech-foundation/platform-editor` → PASS.

- [ ] **Step 2: Write the failing engine tests**

Append to `markerEditTier1.utils.test.tsx`:

```tsx
import { $createVerseNode, VerseNode } from "shared";
import { getVisibleOpenMarkerText } from "shared";

function $appendVersePara(): { verse: VerseNode } {
  const para = $createParaNode("p");
  const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
  $getRoot().append(
    para.append($createMarkerNode("p"), $createTextNode(NBSP), verse, $createTextNode("In the beginning")),
  );
  return { verse };
}

describe("Tier 1 verse/chapter number sync", () => {
  it("syncs the number when the verse token is edited", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(getVisibleOpenMarkerText("v", "2"))),
    );
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("2"));
  });

  it("syncs bridges and segments", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(getVisibleOpenMarkerText("v", "1-2"))),
    );
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("1-2"));
  });

  it("extracts trailing typed text out of the verse node", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(`${getVisibleOpenMarkerText("v", "1")}x`)),
    );
    editor.getEditorState().read(() => {
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
      expect(verse.getNextSibling()?.getTextContent()).toBe("x");
    });
  });

  it("leaves a number-less mid-edit token pending", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent(`\\v${NBSP}`)));
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("1")); // stored number kept
  });

  it("re-tokenizes when the \\v prefix is broken (verse dissolves to text)", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent("v 1 ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).not.toContain('"type":"verse"');
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1` → new tests FAIL.

Add to `markerEditTier1.utils.ts` (imports: `$createTextNode` from lexical; `ChapterNode`, `VerseNode`, `getVisibleOpenMarkerText` from `shared`):

```ts
// `\v`, separator, number token, then either nothing-yet (unterminated), or a
// separator plus optional trailing text the user typed inside the node.
const VERSE_TEXT_REGEX = /^\\v[  ]+([^  \\]+)(?:[  ]([\s\S]*))?$/;

export function $verseNodeTransform(node: VerseNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  const expected = getVisibleOpenMarkerText("v", node.getNumber());
  if (text === expected) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  if (/^\\v[  ]*$/.test(text)) {
    // number mid-edit; keep the stored number as the serialization fallback
    context.pendingKeys.add(node.getKey());
    return;
  }
  const match = VERSE_TEXT_REGEX.exec(text);
  if (!match) {
    // `\v` prefix broken: PT9 re-tokenizes and the token becomes plain text
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context.viewOptions, context.logger);
    return;
  }
  const [, numberToken, rest] = match;
  if (rest === undefined && !/[  ]$/.test(text)) {
    context.pendingKeys.add(node.getKey()); // e.g. `\v 12` while typing the number
    return;
  }
  context.pendingKeys.delete(node.getKey());
  node.setNumber(numberToken); // PT9 GetNextWord: whole word, valid or not
  node.setTextContent(getVisibleOpenMarkerText("v", numberToken));
  if (rest) {
    const restNode = $createTextNode(rest);
    node.insertAfter(restNode);
    restNode.select(rest.length, rest.length);
  }
}

export function $chapterNodeTransform(node: ChapterNode, context: MarkerEditContext): void {
  if (node.getChildrenSize() === 0) {
    node.remove(); // §5.5: deleting the chapter marker deletes it
    return;
  }
  const textNode = node.getFirstChild();
  if (!$isTextNode(textNode)) return;
  const expected = getVisibleOpenMarkerText("c", node.getNumber());
  const text = textNode.getTextContent();
  if (text === expected) return;
  const match = /^\\c[  ]+([^  \\]+)[  ]/.exec(text);
  if (!match) return; // leave literal; serialization falls back to the stored number
  node.setNumber(match[1]);
  textNode.setTextContent(getVisibleOpenMarkerText("c", match[1]));
}
```

In `MarkerEditPlugin.tsx`, add to the `mergeRegister` list:

```tsx
      editor.registerNodeTransform(VerseNode, (node) => {
        if (editor.isComposing()) return;
        $verseNodeTransform(node, context);
      }),
      editor.registerNodeTransform(ChapterNode, (node) => {
        if (editor.isComposing()) return;
        $chapterNodeTransform(node, context);
      }),
```

(`$resolvePendingMarkers` already routes pending non-marker nodes to Tier 2; a pending bare `\v 5` resolves via Tier 2 which recreates the verse — acceptable and covered by the tokenizer tests.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier1` — PASS.
Then `pnpm nx test @eten-tech-foundation/platform-editor && pnpm nx test shared` — PASS. Watch specifically for `TextSpacingPlugin`'s `$verseNodeTransform` (same node, different plugin) in the full-suite run — the two transforms are orthogonal (spacing vs number) but both fire; if a test shows ping-pong, the fix is an early-return equality check, not transform removal.

- [ ] **Step 5: Commit**

```bash
git add libs/shared/src/nodes/usj/ packages/platform/src/editor/markerEdit/
git commit -m "feat: Tier 1 verse/chapter number sync; widen segment regex (finding #5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 10: Deletion semantics (§5.5) — para merge, char unwrap, guard hand-off, Enter prefix injection

**Files:**
- Create: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/markerEditDeletion.utils.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (register ParaNode + CharNode transforms)
- Modify: `packages/platform/src/editor/ParaMarkerPrefixGuardPlugin.tsx` (enablement hand-off)
- Modify: `packages/platform/src/editor/ParaMarkerPrefixGuardPlugin.test.tsx` (updated enablement)

**Interfaces:**
- Consumes: `$isParaMarkerPrefix`, `PARA_MARKER_DEFAULT`, `$isMarkerNode`, `$isCharNode`, `CharNode`, `ParaNode`, `NBSP`, `textTypeState` from `shared`; `$requestTier2ForNode` (Task 6); `MarkerEditContext` (Task 7, `splitExpected` is consumed here); `$setState`/`$getState` from `lexical`.
- Produces:
  - `$paraMarkerDeletionTransform(para: ParaNode, context)` — marker prefix gone: if `splitExpected` (Enter this update) → inject a fresh prefix for the para's (cloned) marker; else merge the para's content into the previous ParaNode (§5.5); no previous ParaNode → reset to `\p` AND inject a prefix (invariant: state and visible text agree).
  - `$charNodeDeletionTransform(char: CharNode, context)` — opener gone → unwrap the span in place; opener present but required closer gone → Tier 2 (tokenizer decides the new span extent).
  - `$unwrapCharNode(char)` — exported; Ctrl+Space (Task 13) reuses it.
  - Guard hand-off: `ParaMarkerPrefixGuardPlugin.isEnabled` drops its `markerMode === "editable"` arm (the engine owns editable mode; spec §5: the two must not fight).

- [ ] **Step 1: Write the failing tests**

Create `markerEditDeletion.utils.test.tsx` reusing Task 7's `testEnvironment` pattern (extract it to a local `test-helpers.tsx` if duplication annoys — keep it simple):

```tsx
describe("§5.5 deletion semantics", () => {
  it("merges a para into the previous para when its marker is deleted", async () => {
    let first: ParaNode, second: ParaNode, secondMarker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      first = $createParaNode("p");
      second = $createParaNode("q1");
      secondMarker = $createMarkerNode("q1");
      $getRoot().append(
        first.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("one")),
        second.append(secondMarker, $createTextNode(NBSP), $createTextNode("two")),
      );
    });
    await act(async () => editor.update(() => secondMarker.remove()));
    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      expect(first.getTextContent()).toContain("one");
      expect(first.getTextContent()).toContain("two");
    });
  });

  it("resets to \\p with a visible prefix when there is no previous para", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("q1");
      marker = $createMarkerNode("q1");
      $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("text")));
    });
    await act(async () => editor.update(() => marker.remove()));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe(PARA_MARKER_DEFAULT);
      expect($isMarkerNode(para.getFirstChild())).toBe(true);
    });
  });

  it("injects a marker prefix into the Enter-split paragraph (cloned marker)", async () => {
    let para: ParaNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("q1");
      const text = $createTextNode("one two");
      $getRoot().append(para.append($createMarkerNode("q1"), $createTextNode(NBSP), text));
      text.select(3, 3);
    });
    await act(async () => {
      editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("q1"); // cloned by insertNewAfter
      expect($isMarkerNode(paras[1].getFirstChild())).toBe(true); // engine injected the prefix
    });
  });

  it("unwraps a char span when its opener is deleted", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.remove()));
    editor.getEditorState().read(() => {
      expect(parts.char.isAttached()).toBe(false);
      // content survived as plain text without the NBSP prefix or closer glyph
      expect($getRoot().getTextContent()).toContain("Lord");
      expect($getRoot().getTextContent()).not.toContain("\\nd*");
    });
  });

  it("routes closer deletion to Tier 2 (span extends per tokenizer rules)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append($createMarkerNode("nd"), $createTextNode(`${NBSP}Lord`), $createMarkerNode("nd", "closing")),
          $createTextNode(" of hosts"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const closer = $getRoot()
          .getAllTextNodes()
          .find((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing");
        closer?.remove();
      }),
    );
    editor.getEditorState().read(() => {
      // tokenizer auto-closes at para end: "of hosts" is now inside the span
      const char = $getRoot()
        .getChildren()
        .filter($isParaNode)[0]
        .getChildren()
        .find($isCharNode);
      expect(char?.getTextContent()).toContain("of hosts");
    });
  });

  it("deletes a verse when its whole token is deleted", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent("")));
    editor.getEditorState().read(() => expect(verse.isAttached()).toBe(false));
  });
});
```

(Reuse `$appendCharPara`/`$appendVersePara` from the Tier 1 test file — move them into a shared `packages/platform/src/editor/markerEdit/markerEdit.test-helpers.tsx` now that two test files need them, and update the Tier 1 test imports. Import `INSERT_PARAGRAPH_COMMAND` from `lexical`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditDeletion`
Expected: FAIL — module does not exist. (The merge test may currently show the OLD guard behavior: marker reset to `\p`.)

- [ ] **Step 3: Implement `markerEditDeletion.utils.ts`**

```ts
/**
 * §5.5 deletion semantics. Replaces ParaMarkerPrefixGuardPlugin's reset-to-\p
 * behavior in editable marker mode: deleting a paragraph's marker text merges
 * its content into the previous paragraph (PT9 reformat outcome).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $createTextNode, $getState, $setState, $isTextNode } from "lexical";
import {
  $createMarkerNode,
  $isCharNode,
  $isMarkerNode,
  $isParaMarkerPrefix,
  $isParaNode,
  CharNode,
  NBSP,
  PARA_MARKER_DEFAULT,
  ParaNode,
  textTypeState,
} from "shared";


function $createMarkerPrefix(marker: string) {
  const markerNode = $createMarkerNode(marker);
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return [markerNode, spaceNode];
}

function $injectMarkerPrefix(para: ParaNode): void {
  para.splice(0, 0, $createMarkerPrefix(para.getMarker()));
  // Keep the caret on the content side of the injected prefix.
  const third = para.getChildAtIndex(2);
  if (third && $isTextNode(third)) third.select(0, 0);
  else para.selectEnd();
}

export function $paraMarkerDeletionTransform(para: ParaNode, context: MarkerEditContext): void {
  if (para.isEmpty()) return; // transient mid-edit state (same rationale as the guard)
  if ($isParaMarkerPrefix(para.getFirstChild())) return;

  if (context.splitExpected.current) {
    // Fresh paragraph from Enter: insertNewAfter cloned the marker; make it visible.
    $injectMarkerPrefix(para);
    context.logger?.debug(`[MarkerEdit] injected prefix for split para "${para.getMarker()}"`);
    return;
  }

  const previous = para.getPreviousSibling();
  if ($isParaNode(previous)) {
    // §5.5: deleting a para's marker text merges its content into the previous para.
    const children = para.getChildren().filter((child) => {
      if ($isTextNode(child) && $getState(child, textTypeState) === "marker-trailing-space")
        return false; // drop the orphaned separator
      return true;
    });
    previous.append(...children); // moved nodes keep their keys; selection follows
    para.remove();
    context.logger?.debug(`[MarkerEdit] merged marker-deleted para into previous`);
    return;
  }

  // No previous paragraph to merge into: fall back to the default marker, visibly.
  para.setMarker(PARA_MARKER_DEFAULT);
  $injectMarkerPrefix(para);
}

/** Move a char span's content out and drop the span (opener deleted / Ctrl+Space). */
export function $unwrapCharNode(char: CharNode): void {
  const children = char.getChildren().filter((child) => !$isMarkerNode(child));
  const first = children[0];
  if (first && $isTextNode(first) && first.getTextContent().startsWith(NBSP))
    first.setTextContent(first.getTextContent().slice(1)); // structural NBSP prefix
  children.forEach((child) => char.insertBefore(child));
  char.remove();
}

export function $charNodeDeletionTransform(char: CharNode, context: MarkerEditContext): void {
  if (char.isEmpty()) return; // CharNodePlugin removes empty spans
  const first = char.getFirstChild();
  const hasOpener = $isMarkerNode(first) && first.getMarkerSyntax() === "opening";
  if (!hasOpener) {
    $unwrapCharNode(char); // §5.5: opener deleted -> unwrap the span
    context.logger?.debug(`[MarkerEdit] unwrapped char span "${char.getMarker()}"`);
    return;
  }
  const needsCloser =
    !CharNode.isValidFootnoteMarker(char.getMarker()) &&
    !CharNode.isValidCrossReferenceMarker(char.getMarker());
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  if (needsCloser && !hasCloser) {
    // §5.5: closer deletion goes through Tier 2 (tokenizer decides the span extent).
    $requestTier2ForNode(char, context.viewOptions, context.logger);
  }
}
```

Register both in `MarkerEditPlugin.tsx`'s `mergeRegister`:

```tsx
      editor.registerNodeTransform(ParaNode, (node) => {
        if (editor.isComposing()) return;
        $paraMarkerDeletionTransform(node, context);
      }),
      editor.registerNodeTransform(CharNode, (node) => {
        if (editor.isComposing()) return;
        $charNodeDeletionTransform(node, context);
      }),
```

- [ ] **Step 4: Hand the guard off**

In `ParaMarkerPrefixGuardPlugin.tsx` change the enablement and doc comment:

```tsx
  const isEnabled =
    viewOptions?.markerMode === "visible" || (viewOptions?.hasGutterParaMarkers ?? false);
```

Add one sentence to the plugin TSDoc: `In editable marker mode the MarkerEditPlugin owns marker-deletion semantics (merge into the previous paragraph, spec §5.5), so this guard stands down there.` Update `ParaMarkerPrefixGuardPlugin.test.tsx` accordingly: any test that asserted the guard fires under `markerMode: "editable"` now asserts it does NOT (keep the `$resetMarkerIfPrefixDeleted` unit tests — the function itself is unchanged).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditDeletion && pnpm nx test @eten-tech-foundation/platform-editor -- ParaMarkerPrefixGuard`
Expected: PASS. Then the full package suite — PASS. Known interaction to watch: `ParaNodePlugin`'s `$paraNodeTransform` (leading-space removal) and `CharNodePlugin`'s transforms run alongside; they touch different conditions, but if a loop appears Lexical's dev invariant will throw in tests — resolve by tightening OUR condition (never loosen theirs).

- [ ] **Step 6: Commit**

```bash
git add packages/platform/src/editor/
git commit -m "feat: §5.5 deletion semantics — para merge, char unwrap, guard hand-off

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Tier 2 triggers — literal backslash text, paste outcomes, single-undo (§5.2)

**Files:**
- Create: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/markerEditTier2Trigger.utils.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (register the TextNode transform)

**Interfaces:**
- Consumes: `$requestTier2ForNode` (Task 6), `MarkerEditContext`, `textTypeState`; guards from `shared`.
- Produces: `$textNodeTier2Transform(node: TextNode, context)` — fires for plain TextNodes only (Lexical dispatches transforms by exact node type, so MarkerNode/VerseNode subclasses never hit it). A backslash sequence that is *terminated* (followed by space/NBSP, or a `*` closer) triggers `$requestTier2ForNode` in the same update; an unterminated one goes into `pendingKeys` for Enter/blur resolution. Skips: attribute/trailing-space textTypes, nodes inside NoteNode (Phase 3 scope), BookNode, ChapterNode, UnknownNode.

- [ ] **Step 1: Write the failing tests**

```tsx
describe("Tier 2 literal-text triggers", () => {
  it("re-tokenizes a terminated typed char marker", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("hello world")),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot().getAllTextNodes().find((n) => n.getTextContent() === "hello world")!;
        text.setTextContent("hello \\nd Lord\\nd* world");
      }),
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).not.toContain("\\\\nd ");
  });

  it("leaves an unterminated backslash sequence alone until Enter", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("hello")),
      );
    });
    await act(async () =>
      editor.update(() => {
        $getRoot().getAllTextNodes().find((n) => n.getTextContent() === "hello")!
          .setTextContent("hello \\nd");
      }),
    );
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\nd");
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"nd"');
  });

  it("splits paragraphs on pasted multi-para USFM (simulated as one insertion)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("start end")),
      );
    });
    await act(async () =>
      editor.update(() => {
        $getRoot().getAllTextNodes().find((n) => n.getTextContent() === "start end")!
          .setTextContent("start \\q1 poetry \\v 2 verse two end");
      }),
    );
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("q1");
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"number":"2"');
  });

  it("coalesces the rebuild with the triggering edit into one undo step", async () => {
    // Mount HistoryPlugin next to MarkerEditPlugin in a local environment.
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("hello world")),
      );
    });
    await act(async () =>
      editor.update(() => {
        $getRoot().getAllTextNodes().find((n) => n.getTextContent() === "hello world")!
          .setTextContent("hello \\nd Lord\\nd* world");
      }),
    );
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("hello world");
      expect($getRoot().getTextContent()).not.toContain("Lord");
    });
  });

  it("does not fire inside note content (Phase 3 scope)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append($createMarkerNode("f"), $createTextNode(`${NBSP}note text`), $createMarkerNode("f", "closing")),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        $getRoot().getAllTextNodes().find((n) => n.getTextContent().includes("note text"))!
          .setTextContent(`${NBSP}note \\bd bold\\bd* text`);
      }),
    );
    // literal text preserved — no CharNode created inside the note
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\bd");
  });
});
```

`historyTestEnvironment` wraps `baseTestEnvironment` passing `<><MarkerEditPlugin viewOptions={...} /><HistoryPlugin /></>` (import `HistoryPlugin` from `@lexical/react/LexicalHistoryPlugin`, `UNDO_COMMAND` from `lexical`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier2Trigger`
Expected: FAIL — no transform yet, literal text stays.

- [ ] **Step 3: Implement**

Create `markerEditTier2Trigger.utils.ts`:

```ts
import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $getState, TextNode } from "lexical";
import {
  $isBookNode,
  $isChapterNode,
  $isNoteNode,
  $isUnknownNode,
  textTypeState,
} from "shared";

/** A backslash sequence completed by a space/NBSP separator or a `*` closer. */
const TERMINATED_MARKER_IN_TEXT_REGEX = /\\\+?[\w-]+(?:\*|[  ])/;

export function $textNodeTier2Transform(node: TextNode, context: MarkerEditContext): void {
  const text = node.getTextContent();
  if (!text.includes("\\")) {
    context.pendingKeys.delete(node.getKey());
    return;
  }
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === "marker-trailing-space") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    // Note content is its own re-tokenization scope (Phase 3); books/chapters/
    // unknowns keep literal text (degradation property).
    if ($isNoteNode(parent) || $isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent))
      return;
  }
  if (TERMINATED_MARKER_IN_TEXT_REGEX.test(text)) {
    context.pendingKeys.delete(node.getKey());
    $requestTier2ForNode(node, context.viewOptions, context.logger);
  } else {
    context.pendingKeys.add(node.getKey()); // Enter/blur completes it
  }
}
```

Register in `MarkerEditPlugin.tsx`:

```tsx
      editor.registerNodeTransform(TextNode, (node) => {
        if (editor.isComposing()) return;
        $textNodeTier2Transform(node, context);
      }),
```

(`TextNode` from `lexical`. Registering on `TextNode` does not catch MarkerNode/VerseNode — Lexical dispatches by exact type; `TextSpacingPlugin` relies on the same fact.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- markerEditTier2Trigger` — PASS.
Full package + shared-react suites — PASS. If the history test fails on coalescing: the rebuild MUST happen inside the same `editor.update` as the text change (it does, via transform); if a genuinely separate update appears in some path, add `$addUpdateTag(HISTORY_MERGE_TAG)` there (spec §5.2 names this fallback) rather than restructuring.

- [ ] **Step 5: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: Tier 2 triggers for literal typed/pasted USFM with single-undo coalescing

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: §4 typing invariant + §5.6 clipboard normalization

**Files:**
- Create: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/whitespaceDisplay.plugin.utils.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (register; standard-view-gated)

**Interfaces:**
- Consumes: `usjTextToDisplay` pieces (Task 1) — the run rule only; `getViewMode`, `STANDARD_VIEW_MODE` from `shared-react`; `$getHtmlContent`, `$getLexicalContent` from `@lexical/clipboard`; `COPY_COMMAND`, `CUT_COMMAND` from `lexical`.
- Produces:
  - `$displayWhitespaceTransform(node: TextNode)` — maintains the display invariant while typing: any plain space adjacent to another space/NBSP becomes display-NBSP (length-preserving, so the caret needs no adjustment). Same skip-list as Task 11's transform. Registered only when `getViewMode(viewOptions) === STANDARD_VIEW_MODE` (§4: must not leak into other modes).
  - `$handleCopyForStandardView(event, editor, isCut)` — COPY_COMMAND/CUT_COMMAND at HIGH: writes text/plain with display-NBSP normalized back to plain spaces (§5.6), text/html and lexical payloads as Lexical would; cut additionally `selection.removeText()`. Returns `false` (defers to stock handling) when the payload is not a ClipboardEvent with `clipboardData` (e.g. the imperative `EditorRef.copy()` path — noted as a known gap for browser QA).

- [ ] **Step 1: Write the failing tests**

```tsx
describe("§4 typing invariant", () => {
  it("converts a typed double space to display-NBSP", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("a b");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), text));
    });
    await act(async () => editor.update(() => text.setTextContent("a  b")));
    editor.getEditorState().read(() =>
      expect(text.getTextContent()).toBe(`a${NBSP}${NBSP}b`),
    );
  });

  it("leaves single spaces alone", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("a b c");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), text));
    });
    await act(async () => editor.update(() => text.setTextContent("a b c d")));
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("a b c d"));
  });
});

describe("§5.6 clipboard normalization", () => {
  it("copies display-NBSP as plain spaces in text/plain", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode(`a${NBSP}${NBSP}b and 3~000`);
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), text));
      text.select(0, text.getTextContentSize());
    });
    const clipboardData = new DataTransfer();
    const event = new ClipboardEvent("copy", { clipboardData });
    await act(async () => {
      editor.dispatchCommand(COPY_COMMAND, event);
    });
    expect(clipboardData.getData("text/plain")).toBe("a  b and 3~000"); // NBSP→space; ~ stays (PT9 shows/copies ~)
  });
});
```

(jsdom `DataTransfer`/`ClipboardEvent` support: if jsdom lacks `DataTransfer`, stub a minimal `{ getData, setData }` object on a plain `Event` — the handler only touches `clipboardData.setData`. Follow whatever `StructureProtectionPlugin.test.tsx`'s `htmlPasteEvent` helper does.)

- [ ] **Step 2: Run to verify failure, then implement**

Create `whitespaceDisplay.plugin.utils.ts`:

```ts
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $getHtmlContent, $getLexicalContent } from "@lexical/clipboard";
import { $getSelection, $getState, $isRangeSelection, LexicalEditor, TextNode } from "lexical";
import { $isBookNode, $isChapterNode, $isNoteNode, $isUnknownNode, NBSP, textTypeState } from "shared";

/** §4: spaces in runs display as NBSP so they are visible while typing. */
export function $displayWhitespaceTransform(node: TextNode): void {
  const text = node.getTextContent();
  if (!text.includes(" ")) return;
  const textType = $getState(node, textTypeState);
  if (textType === "attribute" || textType === "marker-trailing-space") return;
  for (let parent = node.getParent(); parent; parent = parent.getParent()) {
    if ($isNoteNode(parent) || $isBookNode(parent) || $isChapterNode(parent) || $isUnknownNode(parent))
      return;
  }
  const mapped = text
    .replace(/ (?=[  ])/g, NBSP) // space followed by space/NBSP
    .replace(/(?<= ) /g, NBSP); // space preceded by NBSP
  if (mapped !== text) node.setTextContent(mapped); // length-preserving: caret stays valid
}

/** §5.6: clipboard text carries plain spaces where the display shows NBSP. */
export function $handleCopyForStandardView(
  event: ClipboardEvent | null | undefined,
  editor: LexicalEditor,
  isCut: boolean,
): boolean {
  if (!event || !("clipboardData" in event) || event.clipboardData == null) return false;
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || selection.isCollapsed()) return false;
  const plain = selection.getTextContent().replaceAll(NBSP, " ");
  const html = $getHtmlContent(editor);
  const lexical = $getLexicalContent(editor);
  event.preventDefault();
  event.clipboardData.setData("text/plain", plain);
  if (html) event.clipboardData.setData("text/html", html);
  if (lexical) event.clipboardData.setData("application/x-lexical-editor", lexical);
  if (isCut) selection.removeText();
  return true;
}
```

Register in `MarkerEditPlugin.tsx` — compute once in the effect:

```tsx
    const isStandardView = getViewMode(viewOptions) === STANDARD_VIEW_MODE;
```

and add to `mergeRegister` (conditionally — build the registration array and spread):

```tsx
      ...(isStandardView
        ? [
            editor.registerNodeTransform(TextNode, (node) => {
              if (editor.isComposing()) return;
              $displayWhitespaceTransform(node);
            }),
            editor.registerCommand(
              COPY_COMMAND,
              (event) => $handleCopyForStandardView(event as ClipboardEvent, editor, false),
              COMMAND_PRIORITY_HIGH,
            ),
            editor.registerCommand(
              CUT_COMMAND,
              (event) => $handleCopyForStandardView(event as ClipboardEvent, editor, true),
              COMMAND_PRIORITY_HIGH,
            ),
          ]
        : []),
```

Ordering note: this TextNode transform and Task 11's both run; Lexical loops transforms to a fixed point, and both are idempotent (`mapped !== text` / early returns), so no ping-pong. The lookbehind regex (`(?<= ) `) is fine on the repo's Node/browser floor (ES2018+); if lint objects, rewrite with a two-pass scan.

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- whitespaceDisplay` — PASS. Full package suite — PASS (specifically: `TextSpacingPlugin` tests must stay green; its trailing-space transform adds single spaces, which this transform never touches).

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: standard-view typing whitespace invariant and clipboard normalization (§4, §5.6)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Ctrl+Space — strip character formatting (§5.5)

**Files:**
- Create: `packages/platform/src/editor/markerEdit/charFormatting.utils.ts`
- Create: `packages/platform/src/editor/markerEdit/charFormatting.utils.test.tsx`
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (KEY_DOWN registration)

**Interfaces:**
- Consumes: `$unwrapCharNode` (Task 10), `$isCharNode`, `$isMarkerNode`, `CharNode`, `NBSP`, `closingMarkerText` helpers from `shared`; `KEY_DOWN_COMMAND` from `lexical` (repo precedent: `StructureProtectionPlugin`'s key classification).
- Produces: `$removeCharFormattingFromSelection(): boolean` (returns whether it acted). PT9 reference behavior (`KeyPressEditHandler.HandleCtrlSpace` + `StyleApplicator.ApplyCharacterStyle` with the blank tag):
  - Caret inside a char span: split the span at the caret, insert one plain space between the halves, caret after the space (PT9 "inserts and clears a space"). Caret at the span's content end: plain space after the span. Empty halves are dropped.
  - Range selection: char spans fully inside unwrap; spans partially covered split at the selection boundary and the covered part unwraps.
  - Caret in plain text: insert a plain space (PT9 parity — it always clears exactly one space).

- [ ] **Step 1: Write the failing tests**

```tsx
describe("Ctrl+Space (§5.5)", () => {
  it("breaks out of a char style at the caret (split + plain space)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        // caret between "Lo" and "rd" (content text is NBSP + "Lord")
        parts.char.getChildren().filter($isTextNode).find((n) => !$isMarkerNode(n))!.select(3, 3);
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2);
      expect(chars[0].getTextContent()).toContain("Lo");
      expect(chars[1].getTextContent()).toContain("rd");
      // a plain space sits between the two spans
      const between = chars[0].getNextSibling();
      expect($isTextNode(between) && between.getTextContent()).toBe(" ");
    });
  });

  it("unwraps a fully selected char span", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        const content = parts.char.getChildren().find((n) => $isTextNode(n) && !$isMarkerNode(n))!;
        content.select(0, content.getTextContentSize());
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      expect(parts.char.isAttached()).toBe(false);
      expect($getRoot().getTextContent()).toContain("Lord");
    });
  });

  it("reuses an existing next space instead of inserting a second one (PT9 parity)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord of hosts`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
      // caret right before the space between "Lord" and "of"
      char.getChildren().find((n) => $isTextNode(n) && !$isMarkerNode(n))!.select(5, 5);
    });
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      // exactly one space between the two spans, no double space anywhere
      expect($getRoot().getTextContent()).not.toContain("  ");
      expect($getRoot().getTextContent()).toContain("Lord of hosts");
    });
  });

  it("inserts a plain space when the caret is in plain text (PT9 parity)", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("ab");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), text));
      text.select(1, 1);
    });
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("a b"));
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement**

Create `charFormatting.utils.ts`:

```ts
/**
 * Ctrl+Space strips character formatting (design spec §5.5; PT9
 * KeyPressEditHandler.HandleCtrlSpace applies the blank character style).
 */

import { $unwrapCharNode } from "./markerEditDeletion.utils";
import {
  $createTextNode,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  TextNode,
} from "lexical";
import { $createCharNode, $createMarkerNode, $isCharNode, $isMarkerNode, CharNode, NBSP } from "shared";

/**
 * Split `char` before offset `offset` of its content text node `textNode`;
 * returns the new right-hand span (with fresh opener/closer glyphs).
 */
function $splitCharNodeAt(char: CharNode, textNode: TextNode, offset: number): CharNode {
  const marker = char.getMarker();
  const right = $createCharNode(marker, char.getUnknownAttributes());
  const rightOpener = $createMarkerNode(marker);
  const rightChildren: TextNode[] = [];

  let splitPoint: TextNode | undefined;
  if (offset > 0 && offset < textNode.getTextContentSize()) {
    const [, after] = textNode.splitText(offset) as [TextNode, TextNode];
    splitPoint = after;
  } else if (offset === 0) {
    splitPoint = textNode;
  }
  // move splitPoint and everything after it (except the closer glyph) to the right span
  const children = char.getChildren();
  const startIndex = splitPoint ? children.findIndex((c) => c.is(splitPoint)) : -1;
  const hasCloser = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing");
  if (startIndex >= 0) {
    for (const child of children.slice(startIndex)) {
      if ($isMarkerNode(child) && child.getMarkerSyntax() === "closing") continue;
      if ($isTextNode(child)) rightChildren.push(child);
    }
  }
  if (rightChildren.length > 0) {
    // structural NBSP prefix for the right span's first text
    const first = rightChildren[0];
    if (!first.getTextContent().startsWith(NBSP)) first.setTextContent(NBSP + first.getTextContent());
    right.append(rightOpener, ...rightChildren);
    if (hasCloser) right.append($createMarkerNode(marker, "closing"));
    char.insertAfter(right);
  }
  return right;
}

export function $removeCharFormattingFromSelection(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;

  if (selection.isCollapsed()) {
    const anchorNode = selection.anchor.getNode();
    const char = $isCharNode(anchorNode.getParent()) ? anchorNode.getParent() : undefined;
    if (char && $isCharNode(char) && $isTextNode(anchorNode) && !$isMarkerNode(anchorNode)) {
      const right = $splitCharNodeAt(char, anchorNode, selection.anchor.offset);
      // PT9 (HandleCtrlSpace): if the next char is already a space, reuse it
      // instead of inserting a second one — the split moved it into `right`;
      // strip it there and let the plain space below take its place.
      const rightFirst = right.isAttached()
        ? right.getChildren().find((c) => $isTextNode(c) && !$isMarkerNode(c))
        : undefined;
      if (rightFirst && $isTextNode(rightFirst)) {
        const rightText = rightFirst.getTextContent();
        const prefix = rightText.startsWith(NBSP) ? NBSP : "";
        const body = rightText.slice(prefix.length);
        if (body.startsWith(" ")) rightFirst.setTextContent(prefix + body.slice(1));
      }
      const space = $createTextNode(" ");
      char.insertAfter(space);
      // drop halves emptied by the split (only glyphs left)
      [char, right].forEach((span) => {
        const content = span
          .getChildren()
          .filter((c) => $isTextNode(c) && !$isMarkerNode(c))
          .map((c) => c.getTextContent().replace(NBSP, ""))
          .join("");
        if (content === "") span.remove();
      });
      space.select(1, 1);
      return true;
    }
    // PT9 inserts-and-clears exactly one space — reusing the next char when it
    // is already a space (caret just moves past it, nothing is inserted).
    if (
      $isTextNode(anchorNode) &&
      anchorNode.getTextContent()[selection.anchor.offset] === " "
    ) {
      anchorNode.select(selection.anchor.offset + 1, selection.anchor.offset + 1);
      return true;
    }
    selection.insertText(" ");
    return true;
  }

  // Range: unwrap fully covered spans; split partially covered ones at the boundary.
  const anchorPoint = selection.isBackward() ? selection.focus : selection.anchor;
  const focusPoint = selection.isBackward() ? selection.anchor : selection.focus;
  const selectedNodes = selection.getNodes();
  const chars = new Set<CharNode>();
  for (const node of selectedNodes) {
    const parent = node.getParent();
    if ($isCharNode(node)) chars.add(node);
    else if ($isCharNode(parent)) chars.add(parent);
  }
  for (const char of chars) {
    const startNode = anchorPoint.getNode();
    const endNode = focusPoint.getNode();
    if ($isTextNode(startNode) && startNode.getParent()?.is(char) && anchorPoint.offset > 0) {
      // selection starts mid-span: keep the left part styled, unwrap the right
      const right = $splitCharNodeAt(char, startNode, anchorPoint.offset);
      $unwrapCharNode(right);
      continue;
    }
    if ($isTextNode(endNode) && endNode.getParent()?.is(char) && endNode.getTextContentSize() > focusPoint.offset) {
      // selection ends mid-span: unwrap the left part, keep the right styled
      const right = $splitCharNodeAt(char, endNode, focusPoint.offset);
      void right; // right keeps the style
      $unwrapCharNode(char);
      continue;
    }
    $unwrapCharNode(char);
  }
  return chars.size > 0;
}
```

Register in `MarkerEditPlugin.tsx`:

```tsx
      editor.registerCommand(
        KEY_DOWN_COMMAND,
        (event: KeyboardEvent) => {
          if (!event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) return false;
          if (event.key !== " " && event.code !== "Space") return false;
          event.preventDefault();
          return $removeCharFormattingFromSelection();
        },
        COMMAND_PRIORITY_HIGH,
      ),
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- charFormatting` — PASS. Full package suite — PASS. `CharNodePlugin`'s merge-adjacent-chars transform runs after our splits; two split halves are NOT merged back because a plain-space text node sits between them (caret case) or one half is unwrapped (range case) — if a test shows re-merging, that assumption failed: insert the space BEFORE creating the right span.

- [ ] **Step 4: Commit**

```bash
git add packages/platform/src/editor/markerEdit/
git commit -m "feat: Ctrl+Space strips character formatting with PT9 split semantics (§5.5)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---
### Task 14: Polish — `.attribute` dimming in editable mode, verse badge, decision records (findings #1, #6)

**Files:**
- Modify: `packages/platform/src/editor/markerEdit/MarkerEditPlugin.tsx` (attribute-class mutation listener)
- Create: `packages/platform/src/editor/markerEdit/attributeClass.utils.test.tsx`
- Modify: `packages/platform/src/usj-nodes.css` (verse badge, ~line 2280 block)

**Interfaces:**
- Consumes: `textTypeState`, `$getState`; existing CSS `.attribute { color: rgba(170,170,170,1) }` rules (usj-nodes.css ~2094) which today only reach visible-mode `ImmutableTypedTextNode`s.
- Produces: in editable marker mode, plain TextNodes carrying node-state `textType === "attribute"` (milestone `|sid=…` runs) get the `.attribute` DOM class so PT9's dim-until-hover applies (finding: they currently render near-black). Standard view loses the verse-token background badge PT9 doesn't have (finding #6; formatted view keeps it).

- [ ] **Step 1: Write the failing test**

Create `attributeClass.utils.test.tsx` (react env; the DOM class is applied by a mutation listener, so assert against `editor.getElementByKey`):

```tsx
describe("attribute text styling in editable mode", () => {
  it("adds the .attribute class to attribute text nodes", async () => {
    let attrText: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      attrText = $createTextNode(`${NBSP}|sid="ts.GEN.1"`);
      $setState(attrText, textTypeState, "attribute");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), attrText));
    });
    await act(async () => editor.update(() => attrText.markDirty()));
    const dom = editor.getElementByKey(attrText!.getKey());
    expect(dom?.classList.contains("attribute")).toBe(true);
  });
});
```

(`$setState`, `markDirty` from `lexical`; if `markDirty` is unavailable use `attrText.setTextContent(attrText.getTextContent())` — wait, that's a no-op write; use `getWritable()` via any setter. The initial render itself fires "created" mutations, so the extra update may be unnecessary — assert right after mount first.)

- [ ] **Step 2: Implement the mutation listener**

In `MarkerEditPlugin.tsx`'s `mergeRegister` (enabled block, not standard-gated — attribute dimming applies to editable mode generally):

```tsx
      editor.registerMutationListener(TextNode, (mutations) => {
        // DOM-only decoration from OUTSIDE the update cycle (no editor.update here):
        // plain TextNodes cannot emit classes from node state, so reconcile it post-render.
        editor.getEditorState().read(() => {
          for (const [key, mutation] of mutations) {
            if (mutation === "destroyed") continue;
            const node = $getNodeByKey<TextNode>(key);
            if (!node || $getState(node, textTypeState) !== "attribute") continue;
            editor.getElementByKey(key)?.classList.add("attribute");
          }
        });
      }),
```

(`$getNodeByKey`, `$getState` from `lexical`. If the plugin's lexical version supports it, pass `{ skipInitialization: false }` as the third argument so pre-registration nodes are covered; otherwise the LoadStatePlugin reload after mount covers initial content — verify in the test.)

- [ ] **Step 3: Verse badge CSS**

In `usj-nodes.css`, immediately after the `.formatted-font.marker-editable .verse` rule (~line 2085):

```css
/* PT9 Standard view has no background badge on verse tokens (Phase 0 visual QA,
   finding #6); the formatted (non-editable) view keeps its badge. */
.formatted-font.marker-editable .verse {
  background-color: transparent;
}
```

(Merge into the existing `.formatted-font.marker-editable .verse` rule block rather than duplicating the selector.)

- [ ] **Step 4: Verify and commit**

Run: `pnpm nx test @eten-tech-foundation/platform-editor -- attributeClass` — PASS; full package suite — PASS.

```bash
git add packages/platform/src/editor/markerEdit/ packages/platform/src/usj-nodes.css
git commit -m "feat: dim milestone attribute text in editable mode; drop verse badge in standard view

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Integration — corpus, full suites, browser verification

**Files:**
- Modify (only if fixes needed): any of the above
- Modify: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md` (browser QA record)

**Interfaces:**
- Consumes: everything above; the demo app (`pnpm nx dev platform`, http://localhost:5173, Standard view in its view dropdown); Playwright MCP browser tools.
- Produces: green whole-repo test run; a recorded in-browser verification of the editing contract (the spec's §10 manual-QA requirement — do this BEFORE claiming Phase 2 works).

- [ ] **Step 1: Whole-repo suites**

Run: `pnpm nx run-many -t test && pnpm nx run-many -t lint && pnpm nx run-many -t typecheck && pnpm nx format:check`
Expected: all PASS. Fix formatting with `pnpm nx format:write`. Fix any cross-package fallout here (notably: shared-react tests touching MarkerNode/VerseNode behavior, delta pinned tests). Every fix follows the rule: tighten the new code, never loosen an existing assertion without recording why in the commit body.

- [ ] **Step 2: Browser verification (Playwright MCP)**

Start the demo: `pnpm nx dev platform` (background). Navigate to http://localhost:5173, select the "Standard" view in the view dropdown. Verify each, taking a screenshot at every numbered step:

1. **Tier 1 para rename:** click into a `\q1` marker, select the `1`, type `2` then a space → paragraph restyles to `usfm_q2` instantly; marker text shows `\q2`.
2. **Tier 1 char rename:** in a `\nd …\nd*` span (or type one first), change opener to `\wj ` → both glyphs update, span restyles.
3. **Typed markers (Tier 2):** in verse text type `\nd ` → grey marker appears, following text styles as nd; type `\nd*` later in the text → span closes there.
4. **Typed footnote:** type `\f + \ft test note\f* ` → collapsed caller appears inline.
5. **Paste:** paste `\p New paragraph text \v 99 verse text` mid-paragraph → paragraph splits; verse 99 token renders.
6. **Deletion:** select a paragraph's `\p`-style marker glyph and delete → paragraph merges into the previous one. Delete a `\nd*` closer → span extends to paragraph end.
7. **Ctrl+Space:** caret inside a styled span, Ctrl+Space → typing after it is unstyled.
8. **Undo:** after step 5, Ctrl+Z once → pre-paste state restored in a single step.
9. **Whitespace:** type two spaces → both visible (NBSP display); a `~` shows where the data has NBSP (check a verse with `3~000`-style data, or type `~`).
10. **Atomic-node refusal (§5.6):** place the caret right before a collapsed note caller and paste text — content must land beside the caller, never inside it; the caller stays intact.
11. **Regression:** switch to Unformatted view → markers full-size, editing still works; switch to Formatted → no marker glyphs, no engine interference (type text normally).

Record failures, fix, re-verify. This step is the acceptance gate for the phase.

- [ ] **Step 3: Record the QA result**

Append to the findings doc under a new `## Phase 2 browser verification (2026-07-0X)` heading: environment, the 10 checks with PASS/FAIL and notes, screenshots not committed (describe instead).

```bash
git add -f docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md
git commit -m "docs: record Phase 2 browser verification results

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 16: Wrap-up — findings, decisions, progress ledger, Phase 3+ handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-07-01-standard-view-phase0-findings.md`
- Create: `docs/superpowers/specs/2026-07-02-standard-view-phase2-notes.md`
- Modify: `.superpowers/sdd/progress.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the documents Phase 3–5 planning will read, mirroring how the Phase 0 findings doc fed this plan.

- [ ] **Step 1: Final verification sweep**

Run: `pnpm nx run-many -t test && pnpm nx run-many -t lint && pnpm nx run-many -t typecheck && pnpm nx format:check && pnpm nx run-many -t extract-api`
Expected: all PASS; `git status --short` shows no unexpected API-report drift (this plan adds no public exports to platform/utilities — if a report changed, a public surface leaked: either internalize it or commit the report deliberately with a note).

- [ ] **Step 2: Update the findings doc**

Add a `## Phase 2 completion summary` section at the top mirroring the Phase 0+1 summary style: what landed (Tier 1 / tokenizer / Tier 2 / deletions / Ctrl+Space / whitespace / polish), commit range, test counts. Record the closed and still-open findings explicitly:
- Finding #1 (MarkerNode `marker` class): CLOSED — standardized on syntax classes; rationale (would re-create #359's cross-mode bleed).
- Finding #5 (segment regex): CLOSED — widened in Task 9.
- Attribute dimming + verse badge (finding #6 items): CLOSED — Task 14.
- Findings #2/#3/#4 (marker glyphs / `\id` asymmetry / note shape in delta ops): STILL OPEN — Phase 2 kept the pinned ops contract; needs a decision with the collab adaptor owner before any collab hardening phase.

- [ ] **Step 3: Write the Phase 3+ handoff notes**

Create `docs/superpowers/specs/2026-07-02-standard-view-phase2-notes.md` with these sections (write real content from what was built, not placeholders):

```markdown
# Standard View Phase 2 — Engine Notes for Phases 3–5

## What Phase 3 (footnote UX) needs from the engine
- MarkerEditPlugin props/context shape; how to mount it inside the FootnoteEditor's
  editor instance (paranext-core/lib/platform-bible-react hosts its own <Editor>).
- Note content is currently SKIPPED by Tier 2 triggers ($textNodeTier2Transform and
  $requestTier2ForNode both early-return inside NoteNode) — Phase 3 makes the note its
  own re-tokenization scope: lift those guards behind a "scope" parameter and add a
  $rebuildNoteContent sibling of $rebuildParas.
- Caller data: NoteNode sentinels preserve caller state through rebuilds; typed notes
  get caller from the tokenizer ("+" default) — caller sequences (spec §6) plug in at
  the adaptor's createNoteCaller.

## What Phase 4 (StyleInfo) needs
- Tokenizer kind lookup is getMarker() (bundled usfm.sty data) — swap point for
  project StyleInfo: usfmFragmentToUsjContent's marker classification helpers.
- Tier 1 kind guards (isParaKindMarker/isCharKindMarker in markerEditTier1.utils.ts)
  use the same data — same swap point.
- Validation states (status_unknown / status_invalid, spec §5.1) attach naturally in
  $markerNodeTransform after rename: it already knows the marker and its kind.

## What Phase 5 (extension wiring) needs
- Enter currently completes-or-splits with marker cloning + prefix injection
  ($paraMarkerDeletionTransform's splitExpected branch) — the Enter menu replaces the
  INSERT_PARAGRAPH_COMMAND HIGH handler in MarkerEditPlugin.
- The imperative EditorRef.copy() path bypasses §5.6 clipboard normalization (COPY_COMMAND
  dispatched with null payload) — wire or accept.

## Known limitations / deliberate degradations (with spec cover)
<list what shipped: annotation TypedMarkNodes flattened by Tier 2 rebuilds; milestone
runs revert attribute-text edits (sentinel); verses with alt/pub numbers are atomic in
Tier 2; chapter junk-text edits fall back to stored number; cross-node space runs not
collapsed; literal `~` in USJ becomes NBSP; imperative-copy gap; typed unknown
markers (and `\esb`) stay literal text rather than PT9's Unknown-token spans
(byte-identical serialization, structured on next full parse); PT9's `vp*`
leading-space trim not replicated (va/vp literal editing is a §3.3 follow-up); ... plus anything
discovered during execution>
```

- [ ] **Step 4: Close the progress ledger and commit**

Update `.superpowers/sdd/progress.md` per-task lines as usual; final line marks all Phase 2 tasks complete with the branch head.

```bash
git add -f docs/superpowers/specs/ .superpowers/sdd/progress.md
git commit -m "docs: phase 2 completion summary and phase 3+ handoff notes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Out of scope for this plan (later phase plans)

- Phase 3: footnote UX — snippets (Ctrl+T / Ctrl+Shift+T), caller click/tooltip, pane auto-show/hide, engine threading into `FootnoteEditor` (paranext-core), note-scope Tier 2.
- Phase 4: stylesheet pipeline (C# StyleInfo PDP → types → `generateUsjCss` → injection), context-aware marker menu, `status_unknown`/`status_invalid` marker highlighting.
- Phase 5: extension wiring — view type, power default, menu cycle, Enter paragraph-menu, opaque-block rendering polish, consecutive-verse line breaks.
- Delta-ops marker-glyph contract (findings #2/#3/#4) — needs the collab adaptor owner.
