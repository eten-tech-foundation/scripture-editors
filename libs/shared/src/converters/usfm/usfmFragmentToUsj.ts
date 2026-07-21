/**
 * StyleInfo-driven USFM fragment tokenizer for Tier 2 paragraph re-tokenization.
 * Reference semantics: ParatextData `UsfmToken.Tokenize` —
 * fragment-level tokenization only; document-level validation stays out. Marker
 * kinds come from the bundled usfm.sty-derived `usfmMarkers` map via `getMarker`
 * by default, or from `options.getMarker` (a project `StyleInfo`-backed
 * `MarkerLookup`) when supplied — classification is stylesheet-first:
 * a marker the lookup KNOWS is classified by its declared type, full stop.
 *
 * Markers the effective stylesheet does NOT know (`kind === undefined`) fall
 * back to name-pattern heuristics — `NoteNode.isValidMarker`, and for
 * milestones only names following the `-s`/`-e` suffix convention (bare `ts`
 * or the `zmsc-*` comment markers; NOT the bare `z`-prefix wildcard) — and
 * failing those, resolve by context exactly like PT9's
 * `UsfmParser.DetermineUnknownTokenType`: PARAGRAPH in body text, CHARACTER
 * inside a note (`options.isNoteContext`), except `esb`/`esbe`, which PT9
 * always treats as paragraphs (`UsfmToken.cs:405-421`). An unmatched closer
 * (known or unknown marker, no open frame to close) becomes a
 * `{ type: "unmatched", marker: "<name>*" }` USJ object (PT9 `sink.Unmatched`,
 * `UsxUsfmParserSink.cs:262-266`), not literal text.
 *
 * Literal-text degradation remains only for fragments the
 * tokenizer cannot confidently parse at all: a bare `\`, a stray `\*`,
 * non-attribute content before a milestone's `\*`, or an unterminated
 * milestone (stylesheet-declared, or matching the suffix convention above).
 *
 * Figures, tables, and sidebars assemble to their faithful USJ shapes at the
 * assembly level, marker-name driven (they are parser-level structures in
 * ParatextData, independent of stylesheet classification): `\fig …\fig*` folds
 * to an inline `figure` object (USFM's `src` attribute renamed to USX/USJ's
 * `file`), `\tr` plus `t[hc][rc]#(-#)` cell markers build `table` →
 * `table:row` → `table:cell` with name-derived `align`/`colspan`, and
 * `\esb`…`\esbe` wraps the following blocks in a `sidebar` (`\cat` directly
 * after `\esb` folds to its `category`). Anything off the clean shapes —
 * nested markup or positional (USFM 2.0) attributes in a figure, a missing
 * `\fig*`, a cell marker with no open row — degrades to the plain char/para
 * output the marker classification produces on its own.
 *
 * Input is USFM text: `~` means NBSP; U+FFFC sentinels (atomic-node placeholders
 * from the Tier 2 fragment builder) ride through as ordinary text characters.
 */

import { NBSP, PARA_MARKER_DEFAULT } from "../../nodes/usj/node-constants.js";
import { isMilestoneCommentMarker } from "../../nodes/usj/MilestoneNode.js";
import { NoteNode } from "../../nodes/usj/NoteNode.js";
import getMarker from "../../utils/usfm/getMarker.js";
import { MarkerLookup } from "../../utils/usfm/styleInfo.js";
import { MarkerType } from "../../utils/usfm/usfmTypes.js";
import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";

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

const VERSE_MARKER = "v";
const CHAPTER_MARKER = "c";
const FIGURE_MARKER = "fig";
const TABLE_ROW_MARKER = "tr";
const SIDEBAR_MARKER = "esb";
const SIDEBAR_END_MARKER = "esbe";

/**
 * Table cell marker names: `t` + header/cell (`h`/`c`) + optional alignment infix (`r`/`c`) +
 * starting column + optional span end column (`th1`, `tc13`, `thr5`, `thc3-4`, `tcr1-4`).
 * ParatextData derives the whole cell shape from the name alone — no stylesheet entry needed.
 */
const TABLE_CELL_MARKER_REGEX = /^t[hc]([rc]?)(\d+)(?:-(\d+))?$/;

/** Cell alignment from the marker-name infix after `t[hc]`: `th1`/`tc1` → start,
 * `thc1`/`tcc1` → center, `thr1`/`tcr1` → end (ParatextData's name-derived alignment). */
const TABLE_CELL_ALIGN_BY_INFIX: { [infix: string]: string } = {
  "": "start",
  c: "center",
  r: "end",
};

type Token =
  | { kind: "text"; text: string }
  | { kind: "para"; marker: string }
  | { kind: "charOpen"; marker: string; isNested: boolean }
  | { kind: "end"; marker: string } // `\nd*` -> marker "nd"; bare `\*` -> marker ""
  | { kind: "verse"; number: string }
  | { kind: "chapter"; number: string }
  | { kind: "note"; marker: string; caller: string }
  | { kind: "milestone"; marker: string; attributes?: { [attributeName: string]: string } }
  | { kind: "optbreak" }; // USFM discretionary line break `//`

/** PT9 `IsNonSemanticWhiteSpace` approximation for fragments. */
const WHITESPACE_RUN = /[\s\u200B]+/g;

/**
 * Collapse whitespace runs (PT9 `RegularizeSpaces`); keep U+FFFC. A run containing a line
 * break collapses to `"\n"` instead of `" "` so the attribute-marker fold logic can tell
 * STRUCTURAL whitespace (line-end, folds across: `\ca 1 ca\ca*` ⏎ `\cp 1 cp`) from same-line
 * spaces (content per Paratext, blocking the fold: `\va 12 va\va* \vp` keeps vp standalone).
 * Content text normalizes the `"\n"` back to `" "` in `toUsjText`.
 */
function regularizeSpaces(text: string): string {
  return text.replace(WHITESPACE_RUN, (run) => (run.includes("\n") ? "\n" : " "));
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
    if (/[\s\u200B]/.test(ch)) break;
    index++;
  }
  return { name: fragment.slice(start, index), next: index };
}

/** Milestone names the Paratext stylesheet family declares: `\qt-s/-e`, `\qt1-s`…`\qt5-e`,
 * `\ts-s/-e`. */
const STYLESHEET_MILESTONE_NAME_REGEX = /^(?:qt[1-5]?|ts)-[se]$/;

/**
 * Milestone-name heuristic for markers ABSENT from the effective stylesheet: only names the
 * Paratext stylesheet family actually declares as milestones, plus the editor's own annotation
 * comment markers — so the heuristic predicts what ParatextData's stylesheet-driven parse
 * produces for the same bytes. Deliberately EXCLUDED: bare `ts`, `t-s`, `t-e` — syntactically
 * valid milestones, but no stylesheet declares them, so ParatextData parses them as unknown
 * markers (paragraph in body text) and any milestone produced here would flip to that shape on
 * the next chapter read. Also excluded: `MilestoneNode.isValidMarker`'s generic `z`-prefix
 * wildcard, which would classify any custom.sty-style marker (e.g. `\zfoo`) as a milestone and
 * keep unknown-marker resolution (`DetermineUnknownTokenType`) from ever seeing it. A project
 * that declares any of these in custom.sty gets them classified stylesheet-first with no code
 * change.
 */
export function isMilestoneHeuristicName(name: string): boolean {
  return STYLESHEET_MILESTONE_NAME_REGEX.test(name) || isMilestoneCommentMarker(name);
}

/** PT9 `GetNextWord`: skip leading whitespace, take up to whitespace or `\`. */
function getNextWord(fragment: string, start: number): { word: string; next: number } {
  let index = start;
  while (index < fragment.length && /[\s\u00A0\u200B]/.test(fragment[index])) index++;
  const wordStart = index;
  while (index < fragment.length && !/[\s\u00A0\u200B\\]/.test(fragment[index])) index++;
  const word = fragment.slice(wordStart, index);
  while (index < fragment.length && /[\s\u00A0\u200B]/.test(fragment[index])) index++;
  return { word, next: index };
}

function tokenize(fragment: string, getMarkerFn: MarkerLookup, isNoteContext: boolean): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const prev = tokens[tokens.length - 1];
    if (prev?.kind === "text") prev.text += text;
    else tokens.push({ kind: "text", text });
  };
  // `//` mid-text is USFM's discretionary line break (PT9 tokenizes it wherever it appears,
  // spec-blind — even inside a URL); the surrounding text is kept byte-exact.
  const pushTextWithOptbreaks = (text: string) => {
    const parts = text.split("//");
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) tokens.push({ kind: "optbreak" });
      pushText(part);
    });
  };

  while (index < fragment.length) {
    if (fragment[index] !== "\\") {
      const nextMarker = fragment.indexOf("\\", index);
      const end = nextMarker === -1 ? fragment.length : nextMarker;
      pushTextWithOptbreaks(regularizeSpaces(fragment.slice(index, end)));
      index = end;
      continue;
    }

    const rawStart = index;
    const { name, next } = scanMarkerName(fragment, index + 1);
    index = next;

    if (name === "") {
      // Bare `\` — literal (degradation property).
      pushText(fragment.slice(rawStart, index));
      continue;
    }
    if (name === "*") {
      // Stray `\*` with no milestone to close (milestone closes are consumed by
      // scanMilestone): PT9 sink.Unmatched — route through the end-token path so it becomes
      // an `{ type: "unmatched", marker: "*" }` object, which serializes back to `\*`.
      tokens.push({ kind: "end", marker: "" });
      continue;
    }

    if (name.endsWith("*")) {
      tokens.push({ kind: "end", marker: name.slice(0, -1) });
      continue;
    }

    // Consume the separator whitespace after an opening marker (PT9 skips it) — all leading
    // whitespace, not just a single space.
    const consumeSeparator = () => {
      while (index < fragment.length && /[\s\u00A0\u200B]/.test(fragment[index])) index++;
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
    if (kind === MarkerType.Milestone || (kind === undefined && isMilestoneHeuristicName(name))) {
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
    } else if (ATTRIBUTE_MARKERS[clean]) {
      // Attribute markers (ca/cp/va/vp/cat) are parser-level in ParatextData, not stylesheet
      // entries — classify them by their fixed shape when the sheet doesn't know them, so
      // the assembly loop can fold them onto their target (or keep them standalone).
      consumeSeparator();
      if (ATTRIBUTE_MARKERS[clean].shape === "para") tokens.push({ kind: "para", marker: name });
      else tokens.push({ kind: "charOpen", marker: clean, isNested });
    } else {
      // Unknown to the effective stylesheet: PT9 resolves by context
      // (DetermineUnknownTokenType): PARAGRAPH in body text, CHARACTER inside
      // a note; `esb`/`esbe` are explicitly paragraphs (UsfmToken.cs:405-421).
      // A non-`+` char run closes any open char style unconditionally, same as
      // a known Character token (UsfmParser.cs:247).
      consumeSeparator();
      if (!isNoteContext || name === SIDEBAR_MARKER || name === SIDEBAR_END_MARKER)
        tokens.push({ kind: "para", marker: name });
      else tokens.push({ kind: "charOpen", marker: clean, isNested });
    }
  }
  return tokens;
}

/**
 * USFM attribute markers: markers that describe the PREVIOUS marker and become an attribute on
 * it in USX/USJ when they directly follow it (whitespace only between, plain-text content) —
 * `\c 1 \ca 2\ca*` → `chapter{altnumber:"2"}`. Standalone occurrences (not adjacent to a
 * supporting target, or carrying markup in their content) stay ordinary markers, exactly as
 * ParatextData emits them. The relation data is parser-level in ParatextData (not in any
 * stylesheet), so it is hardcoded here; `cat` supports two target types — an open note
 * (`f`/`fe`/`x`/`ef`/`efe`/`ex`) and an `esb` sidebar — so `targetTypes` is a list.
 */
const ATTRIBUTE_MARKERS: {
  [marker: string]: { attrName: string; targetTypes: readonly string[]; shape: "char" | "para" };
} = {
  ca: { attrName: "altnumber", targetTypes: ["chapter"], shape: "char" },
  cp: { attrName: "pubnumber", targetTypes: ["chapter"], shape: "para" },
  va: { attrName: "altnumber", targetTypes: ["verse"], shape: "char" },
  vp: { attrName: "pubnumber", targetTypes: ["verse"], shape: "char" },
  cat: { attrName: "category", targetTypes: ["note", "sidebar"], shape: "char" },
};

const ATTRIBUTE_PAIR_REGEX = /([-\w]+)\s*=\s*"(.*?)"/g;

/**
 * USFM 3 default attribute per marker (subset; unmapped bare values stay literal).
 *
 * `xt`/`jmp` use the USFM/USX/USJ **3.0** name `link-href`: this pipeline pins USJ 3.0 (chapter
 * data round-trips through ParatextData, and the host downgrades 3.1), and every 3.0 consumer —
 * ParatextData serialization, checks, link handling — reads `link-href`. USFM 3.1 renamed it to
 * `href`; switch these when the pipeline moves to 3.1.
 */
const DEFAULT_MARKER_ATTRIBUTES: { [marker: string]: string } = {
  w: "lemma",
  rb: "gloss",
  xt: "link-href",
  jmp: "link-href",
};

/**
 * USJ structural keys that a parsed attribute may never overwrite: the callers merge parsed
 * attributes straight onto the node object (`Object.assign` / spread), so an attribute literally
 * named `type`, `marker`, or `content` would clobber the node's own identity or replace its
 * content array with a string. Such attributes are dropped.
 */
const RESERVED_NODE_KEYS = new Set(["type", "marker", "content"]);

function parseAttributeText(
  attributeText: string,
  marker: string,
  defaultAttributeName = DEFAULT_MARKER_ATTRIBUTES[marker],
): { [attributeName: string]: string } | undefined {
  const attributes: { [attributeName: string]: string } = {};
  const pairs = [...attributeText.matchAll(ATTRIBUTE_PAIR_REGEX)];
  if (pairs.length > 0) {
    for (const [, name, value] of pairs) {
      if (!RESERVED_NODE_KEYS.has(name)) attributes[name] = value;
    }
    return Object.keys(attributes).length > 0 ? attributes : undefined;
  }
  // Bare (default-attribute) value: keep it byte-exact, whitespace included — ParatextData
  // treats the space before the closing marker as part of the value (`\w marker|stuff \w*` →
  // lemma="stuff "; `\qt-s |TJ \*` → who="TJ "). The USFM 3 spec calls that space structural,
  // but Paratext keeps it as content, and this pipeline round-trips through ParatextData.
  if (attributeText.trim() && defaultAttributeName)
    return { [defaultAttributeName]: attributeText };
  return undefined;
}

/**
 * Default attribute for stylesheet-family milestone names (USFM 3.0): quotation starts take
 * `who`, every `-e` end takes `eid`, and other starts (`\ts-s`, comment markers) take `sid`.
 */
function milestoneDefaultAttribute(name: string): string {
  if (name.endsWith("-e")) return "eid";
  return name.startsWith("qt") ? "who" : "sid";
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
  let attributes: { [attributeName: string]: string } | undefined;
  if (pipeIndex >= 0)
    attributes = parseAttributeText(
      between.slice(pipeIndex + 1),
      name,
      milestoneDefaultAttribute(name),
    );
  else if (between.trim() !== "") return undefined; // non-attribute content before \* — literal
  return { token: { kind: "milestone", marker: name, attributes }, next: closeIndex + 2 };
}

/** Convert `~` to NBSP for USJ text content (PT9 read-side `UsfmParser` behavior), and
 * normalize the line-break marker `regularizeSpaces` preserved back to a plain space. */
function toUsjText(text: string): string {
  return text.replaceAll("\n", " ").replaceAll("~", NBSP);
}

/** Get (and lazily initialize) a marker object's content array without a non-null assertion. */
function getContent(object: MarkerObject): MarkerContent[] {
  if (!object.content) object.content = [];
  return object.content;
}

interface CharFrame {
  object: MarkerObject;
}

/**
 * `closed` is nonstandard derived USX/USJ metadata for an implicitly-closed marker
 * (see `usx-to-usj.ts`'s "Not dropping attribs.closed for backwards compatibility");
 * it is not part of the published `MarkerObject` shape, so it is typed locally.
 * ParatextData emits `closed="false"` on BOTH notes and char spans that have no explicit
 * closing marker — near universal on footnote-content chars like `\fr`/`\ft`/`\xo` — so this
 * tokenizer mirrors that for char spans too (real-life reference: paranext-core's
 * `footnote-util-test.usj.data.ts`).
 */
type ClosableMarkerObject = MarkerObject & { closed?: string };

/**
 * `colspan` is USX/USJ's spanned-cell width (`\thc3-4` → colspan "2"); it is not part of the
 * published `MarkerObject` shape, so it is typed locally like `closed` above.
 */
type TableCellObject = MarkerObject & { colspan?: string };

export function usfmFragmentToUsjContent(
  fragment: string,
  options?: UsfmFragmentOptions,
): MarkerContent[] {
  const result: MarkerContent[] = [];
  const isNoteContext = options?.isNoteContext ?? false;
  let para: MarkerObject | undefined;
  let note: ClosableMarkerObject | undefined;
  const charStack: CharFrame[] = [];
  // Char-stack depth at the moment the open note started: frames BELOW it enclose the note
  // (USX nests the note inside them and the span continues after it — `\wj a \f …\f* b\wj*`
  // puts both the note and " b" inside the wj span); frames AT/ABOVE it were opened inside
  // the note's content and close with it. Only meaningful while `note` is set.
  let noteBaseDepth = 0;
  // ---- opaque-structure state (tables, sidebars) ----
  // Current open table and its open row. `\tr` creates both (consecutive rows share one
  // table); a cell marker then points `para` at the cell object, so ALL ordinary content
  // handling (text, char spans, notes, verses) lands inside the cell unchanged. While the
  // table is open, `para` is always its open row or a cell of that row.
  let table: MarkerObject | undefined;
  let tableRow: MarkerObject | undefined;
  // Current open sidebar: `\esb`…`\esbe` wraps subsequent top-level blocks (paragraphs and
  // tables). Implicit close (fragment end or a chapter token) marks it closed="false" —
  // ParatextData auto-closes sidebars at the chapter boundary.
  let sidebar: ClosableMarkerObject | undefined;

  /** Where top-level blocks (paragraphs, tables) land: an open sidebar's content, else the
   * fragment result. */
  const blockTarget = (): MarkerContent[] => (sidebar ? getContent(sidebar) : result);

  const container = (): MarkerContent[] => {
    if (note) {
      // Inside the note, only frames opened WITHIN it receive content; the enclosing
      // frames are suspended until the note closes.
      if (charStack.length > noteBaseDepth)
        return getContent(charStack[charStack.length - 1].object);
      return getContent(note);
    }
    if (charStack.length > 0) return getContent(charStack[charStack.length - 1].object);
    if (!para) {
      para = { type: "para", marker: PARA_MARKER_DEFAULT, content: [] };
      blockTarget().push(para);
    }
    return getContent(para);
  };

  const pushContent = (item: MarkerContent) => {
    const target = container();
    if (typeof item === "string" && typeof target[target.length - 1] === "string") {
      target[target.length - 1] = (target[target.length - 1] as string) + item;
    } else {
      target.push(item);
    }
  };

  // Implicit close: every still-open char span gets closed="false", mirroring ParatextData
  // (a span only stays unmarked when the user's own `\marker*` terminated it).
  const markImplicitlyClosed = (fromIndex: number) => {
    for (let i = fromIndex; i < charStack.length; i += 1) {
      const object: ClosableMarkerObject = charStack[i].object;
      object.closed = "false";
    }
  };
  const closeCharStack = () => {
    markImplicitlyClosed(0);
    charStack.length = 0;
  };
  const closeNote = (terminated: boolean) => {
    if (!note) return;
    // Chars opened INSIDE the note close with it (implicitly); frames below the note
    // boundary survive — the enclosing span continues after the note.
    if (charStack.length > noteBaseDepth) {
      markImplicitlyClosed(noteBaseDepth);
      charStack.length = noteBaseDepth;
    }
    noteBaseDepth = 0;
    if (!terminated) note.closed = "false";
    note = undefined;
  };
  // Tables have no closing marker and no `closed` metadata: the table object is already in
  // place, so ending one just drops the open-row state — rows/cells never resume.
  const endTable = () => {
    table = undefined;
    tableRow = undefined;
  };
  const closeSidebar = (terminated: boolean) => {
    if (!sidebar) return;
    // Only `\esbe` terminates a sidebar explicitly; an implicit close (fragment end or a
    // chapter boundary) gets closed="false", mirroring ParatextData's auto-close.
    if (!terminated) sidebar.closed = "false";
    sidebar = undefined;
  };

  // ---- attribute-marker folding state (see ATTRIBUTE_MARKERS) ----
  // The most recent chapter/verse/note object, still "receptive": an adjacent attribute
  // marker folds onto it as an attribute. Any real content clears it.
  let attrTarget: MarkerObject | undefined;
  // Whitespace-only text held while attrTarget is receptive: structural (dropped) if an
  // attribute marker follows; ordinary content (flushed) otherwise.
  let heldWhitespace = "";
  // An attribute-marker span currently being captured for folding. Aborts to a standalone
  // marker the moment its content turns out to be markup, exactly as ParatextData keeps a
  // `\cat` with markup or a `\cp` with markers as its own marker.
  let attrCapture:
    | {
        target: MarkerObject;
        attrName: string;
        marker: string;
        shape: "char" | "para";
        value: string;
      }
    | undefined;

  const flushHeldWhitespace = () => {
    if (heldWhitespace) pushContent(toUsjText(heldWhitespace));
    heldWhitespace = "";
  };
  const clearAttrTarget = () => {
    // Line-end whitespace held while a SIDEBAR was receptive is structural: sidebar content
    // is block-level (paragraphs and tables), so the line break between `\esb`/`\cat` and
    // the first block never becomes text — ParatextData emits none there. Held whitespace
    // for the other targets (chapter/verse/note) keeps its existing flush-as-content path.
    if (attrTarget?.type === "sidebar") heldWhitespace = "";
    attrTarget = undefined;
    flushHeldWhitespace();
  };
  /** Abort a char-shaped capture: materialize the standalone open span (frame stays open —
   * nested markup and the eventual closer process normally). */
  const materializeCaptureAsChar = () => {
    if (!attrCapture) return;
    const object: MarkerObject = { type: "char", marker: attrCapture.marker, content: [] };
    if (attrCapture.value) object.content = [toUsjText(attrCapture.value)];
    container().push(object);
    charStack.push({ object });
    attrCapture = undefined;
  };
  /** Start an ordinary paragraph block. Any non-row/cell paragraph-kind marker also ends an
   * open table — ParatextData never resumes a table across another block. */
  const startParagraph = (marker: string, initialText?: string) => {
    endTable();
    closeCharStack();
    closeNote(false);
    para = { type: "para", marker, content: [] };
    if (initialText) para.content = [toUsjText(initialText)];
    blockTarget().push(para);
  };
  /** Abort a para-shaped capture (`\cp` with markup): materialize the standalone paragraph. */
  const materializeCaptureAsPara = () => {
    if (!attrCapture) return;
    startParagraph(attrCapture.marker, attrCapture.value);
    attrCapture = undefined;
  };

  // ---- figure capture state ----
  // A `\fig …\fig*` span being collected for faithful `figure` emission (ParatextData turns
  // the span into `{ type: "figure", … }`). Only a clean span folds: plain-text content with
  // `name="value"` attributes and an explicit `\fig*`. Anything else — nested markup, USFM
  // 2.0 positional attributes, no closer — degrades to exactly what the marker's own
  // classification produced before figure support (a char span or an unknown paragraph).
  let figCapture: { shape: "char" | "para"; value: string } | undefined;
  /** Degrade an unfoldable figure span: a char frame (stays open — the eventual closer or
   * auto-close processes normally) or an unknown paragraph, matching pre-figure output. */
  const materializeFigCapture = () => {
    if (!figCapture) return;
    if (figCapture.shape === "para") {
      startParagraph(FIGURE_MARKER, figCapture.value);
    } else {
      const object: MarkerObject = { type: "char", marker: FIGURE_MARKER, content: [] };
      if (figCapture.value) object.content = [toUsjText(figCapture.value)];
      container().push(object);
      charStack.push({ object });
    }
    figCapture = undefined;
  };

  const tokens = tokenize(fragment, options?.getMarker ?? getMarker, isNoteContext);
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];

    if (attrCapture) {
      if (token.kind === "text") {
        attrCapture.value += token.text;
        continue;
      }
      if (
        attrCapture.shape === "char" &&
        token.kind === "end" &&
        token.marker.replace(/^\+/, "") === attrCapture.marker
      ) {
        // Explicit close with plain-text content: fold as the target's attribute. Any space
        // AFTER the closer is content, not structural — Paratext keeps it in the text
        // (`\vp 11 vp\vp* This…` → text starts with the space), per its
        // treat-space-after-attribute-markers-as-content behavior.
        Object.assign(attrCapture.target, { [attrCapture.attrName]: toUsjText(attrCapture.value) });
        attrCapture = undefined;
        continue;
      }
      if (attrCapture.shape === "para" && (token.kind === "para" || token.kind === "chapter")) {
        // The cp "paragraph" ended with plain-text content only: fold (trailing line
        // whitespace is structural).
        Object.assign(attrCapture.target, {
          [attrCapture.attrName]: toUsjText(attrCapture.value.replace(/[\s\u200B]+$/, "")),
        });
        attrCapture = undefined;
        // fall through to process the boundary token normally
      } else {
        // Markup inside the span (or a mismatched closer): not foldable — materialize the
        // standalone marker, then reprocess this token normally.
        attrTarget = undefined;
        if (attrCapture.shape === "para") materializeCaptureAsPara();
        else materializeCaptureAsChar();
        tokenIndex--;
        continue;
      }
    }

    if (figCapture) {
      if (token.kind === "text") {
        figCapture.value += token.text;
        continue;
      }
      if (token.kind === "end" && token.marker.replace(/^\+/, "") === FIGURE_MARKER) {
        const pipeIndex = figCapture.value.indexOf("|");
        const attributes =
          pipeIndex >= 0
            ? parseAttributeText(figCapture.value.slice(pipeIndex + 1), FIGURE_MARKER)
            : undefined;
        if (attributes) {
          // Clean span: emit the faithful figure. USFM's `src` attribute is `file` in
          // USX/USJ (renamed in place to keep the author's attribute order); the pre-`|`
          // description is the figure's content, omitted when empty (as ParatextData does).
          const figureAttributes: { [attributeName: string]: string } = {};
          for (const [name, value] of Object.entries(attributes))
            figureAttributes[name === "src" ? "file" : name] = value;
          const figure: MarkerObject = {
            type: "figure",
            marker: FIGURE_MARKER,
            ...figureAttributes,
          };
          const description = figCapture.value.slice(0, pipeIndex);
          if (description) figure.content = [toUsjText(description)];
          pushContent(figure);
          figCapture = undefined;
          continue;
        }
        // No `name="value"` attributes (USFM 2.0 positional syntax, or no `|` at all): fall
        // through to degrade — the reprocessed closer then closes the materialized char
        // frame (or lands unmatched in the materialized paragraph), exactly as before.
      }
      // Markup inside the span, a foreign closer, or unfoldable attributes: degrade, then
      // reprocess this token against the materialized span.
      materializeFigCapture();
      tokenIndex--;
      continue;
    }

    if (attrTarget) {
      if (token.kind === "text") {
        // Only LINE-BREAK whitespace between the target and its attribute marker is
        // structural (`\ca 1 ca\ca*` \u23CE `\cp 1 cp` still folds cp). A same-line space is
        // content per Paratext and BLOCKS the fold \u2014 `\va 12 va\va* \vp 12 vp\vp*` keeps
        // altnumber but leaves vp a standalone marker with the space in the text.
        if (token.text.includes("\n") && /^[\s\u200B]*$/.test(token.text)) {
          heldWhitespace += token.text;
          continue;
        }
        clearAttrTarget();
      } else if (token.kind === "charOpen" || token.kind === "para") {
        const foldable =
          token.kind === "para" || !token.isNested ? ATTRIBUTE_MARKERS[token.marker] : undefined;
        if (foldable && foldable.targetTypes.includes(attrTarget.type)) {
          // Whitespace between the target and its attribute marker is structural — dropped.
          heldWhitespace = "";
          attrCapture = {
            target: attrTarget,
            attrName: foldable.attrName,
            marker: token.marker,
            shape: foldable.shape,
            value: "",
          };
          // attrTarget stays receptive: a chapter takes BOTH \ca and \cp.
          continue;
        }
        clearAttrTarget();
      } else {
        clearAttrTarget();
      }
    }

    // ---- `\fig` interception (marker-name driven, like ParatextData's parser figures) ----
    // `\fig` reaches assembly as charOpen (a sheet that knows it as Character) or para
    // (unknown marker); BOTH fold to a `figure` when the span is clean. Note content keeps
    // the plain char behavior — this tokenizer does not build figures inside notes. Opening
    // a figure auto-closes open char spans exactly as its Character classification would
    // (UsfmParser.cs:247), so the success and degrade paths continue from the same stack.
    if (
      !note &&
      !isNoteContext &&
      ((token.kind === "charOpen" && !token.isNested && token.marker === FIGURE_MARKER) ||
        (token.kind === "para" && token.marker === FIGURE_MARKER))
    ) {
      closeCharStack();
      figCapture = { shape: token.kind === "charOpen" ? "char" : "para", value: "" };
      continue;
    }

    switch (token.kind) {
      case "text": {
        let text = token.text;
        // Inside table and sidebar assembly, a text run's trailing line break before a block
        // boundary (a paragraph-kind or chapter token, or fragment end) is structural — the
        // line ends where the next block marker begins, and ParatextData emits no content
        // there. Elsewhere the pre-existing boundary behavior stands (a trailing line break
        // becomes a space): engine fragments carry no line breaks, so only synthetic and
        // corpus input reaches either path. `regularizeSpaces` collapsed the run to `"\n"`.
        if ((tableRow || sidebar) && !note && text.endsWith("\n")) {
          const next = tokens[tokenIndex + 1];
          if (next === undefined || next.kind === "para" || next.kind === "chapter")
            text = text.slice(0, -1);
        }
        if (text) pushContent(toUsjText(text));
        break;
      }
      case "para": {
        // ---- table assembly ----
        // Row/cell markers reach assembly as para tokens (paragraph styles, or unknown to
        // the sheet). Table shapes never engage inside note content — a row/cell marker
        // there keeps its plain resolution, and ParatextData builds no tables there either.
        const tableEligible = !note && !isNoteContext;
        if (tableEligible && token.marker === TABLE_ROW_MARKER) {
          closeCharStack();
          // Consecutive `\tr`s share one table; the first creates it.
          if (!table) {
            table = { type: "table", content: [] };
            blockTarget().push(table);
          }
          tableRow = { type: "table:row", marker: TABLE_ROW_MARKER, content: [] };
          getContent(table).push(tableRow);
          // Content before the first cell marker (degenerate) lands in the row itself.
          para = tableRow;
          break;
        }
        if (tableEligible && tableRow) {
          const cellMatch = TABLE_CELL_MARKER_REGEX.exec(token.marker);
          // Only columns 1–12 are cells: usfm.sty declares exactly th1–th12/tc1–tc12 (and
          // their r/c variants), and ParatextData follows its stylesheet — `\tc13` is an
          // unknown marker that ENDS the table (and the next `\tr` starts a fresh one).
          if (cellMatch && Number(cellMatch[2]) >= 1 && Number(cellMatch[2]) <= 12) {
            closeCharStack();
            const [, alignInfix, spanStart, spanEnd] = cellMatch;
            // The cell keeps only the starting column in its marker (`thc3-4` → `thc3`);
            // the span width becomes `colspan`, a string of columns spanned (`thc3-4` → "2").
            const cell: TableCellObject = {
              type: "table:cell",
              marker: spanEnd ? token.marker.slice(0, token.marker.indexOf("-")) : token.marker,
              align: TABLE_CELL_ALIGN_BY_INFIX[alignInfix],
              content: [],
            };
            if (spanEnd) cell.colspan = String(Number(spanEnd) + 1 - Number(spanStart));
            getContent(tableRow).push(cell);
            // The cell becomes the current content container: text, char spans, notes, and
            // verses flow into it through the ordinary `para`-based container logic.
            para = cell;
            break;
          }
        }
        // Any other paragraph-kind token (esb/esbe included) ends an open table; the token
        // itself then processes normally. A cell marker with NO open row is not table
        // content — it stays an unknown paragraph, exactly as ParatextData splits it out.
        endTable();
        // ---- sidebar assembly ----
        if (!isNoteContext && token.marker === SIDEBAR_MARKER) {
          closeCharStack();
          closeNote(false);
          // Sidebars never nest: an unterminated previous sidebar closes implicitly.
          closeSidebar(false);
          sidebar = { type: "sidebar", marker: SIDEBAR_MARKER, content: [] };
          result.push(sidebar);
          para = undefined;
          attrTarget = sidebar; // receptive to \cat (directly after \esb only)
          break;
        }
        if (token.marker === SIDEBAR_END_MARKER && sidebar) {
          closeCharStack();
          closeNote(false);
          // `\esbe` terminates the sidebar and is consumed — it emits nothing itself. With
          // no open sidebar it falls through to today's unknown-paragraph behavior.
          closeSidebar(true);
          para = undefined;
          break;
        }
        startParagraph(token.marker);
        break;
      }
      case "verse": {
        closeCharStack();
        closeNote(false);
        const verse: MarkerObject = { type: "verse", marker: VERSE_MARKER, number: token.number };
        pushContent(verse);
        attrTarget = verse; // receptive to \va/\vp
        break;
      }
      case "chapter": {
        closeCharStack();
        closeNote(false);
        // A chapter boundary ends any open table and implicitly closes an open sidebar
        // (ParatextData auto-closes sidebars at the end of the chapter).
        endTable();
        closeSidebar(false);
        para = undefined;
        const chapter: MarkerObject = {
          type: "chapter",
          marker: CHAPTER_MARKER,
          number: token.number,
        };
        result.push(chapter);
        attrTarget = chapter; // receptive to \ca/\cp
        break;
      }
      case "note": {
        // A note does NOT close open char spans: USX nests the note inside them and the
        // enclosing span continues after it (`\wj a \f …\f* b\wj*` → wj contains [text,
        // note, text]). Notes themselves never nest, so a previous open note closes first.
        closeNote(false);
        const target = container();
        note = { type: "note", marker: token.marker, caller: token.caller, content: [] };
        noteBaseDepth = charStack.length;
        target.push(note);
        attrTarget = note; // receptive to \cat (right after the caller only)
        break;
      }
      case "charOpen": {
        // A new non-nested char marker auto-closes open char styles (PT9) — but never
        // across an open note's boundary: the frames enclosing the note stay open.
        if (!token.isNested) {
          const base = note ? noteBaseDepth : 0;
          markImplicitlyClosed(base);
          charStack.length = base;
        }
        const target = container();
        const object: MarkerObject = { type: "char", marker: token.marker, content: [] };
        target.push(object);
        charStack.push({ object });
        break;
      }
      case "end": {
        const marker = token.marker.replace(/^\+/, "");
        // While a note is open, a closer only matches frames opened INSIDE it — it must not
        // reach across the note boundary and close an enclosing span from within the note.
        const searchBase = note ? noteBaseDepth : 0;
        const frameIndex = charStack.findLastIndex(
          (frame, index) => index >= searchBase && frame.object.marker === marker,
        );
        if (frameIndex >= 0) {
          extractAttributes(charStack[frameIndex].object);
          // Nested spans above the explicitly-closed frame are closed IMPLICITLY by it.
          markImplicitlyClosed(frameIndex + 1);
          charStack.length = frameIndex;
        } else if (note && note.marker === marker) {
          // Explicit note close: chars opened inside the note close implicitly with it;
          // frames enclosing the note survive (closeNote truncates to the note boundary).
          closeNote(true);
        } else {
          // Unmatched closer: PT9 sink.Unmatched (UsxUsfmParserSink.cs:262-266)
          // — an unmatched element, rendered as ImmutableUnmatchedNode with the
          // existing `.invalid` styling; serializes back to the same text.
          pushContent({ type: "unmatched", marker: `${token.marker}*` });
        }
        break;
      }
      case "milestone":
        pushContent({ type: "ms", marker: token.marker, ...token.attributes });
        break;
      case "optbreak":
        pushContent({ type: "optbreak" });
        break;
    }
  }
  // Fragment ended mid-figure: no `\fig*` closer — degrade to the plain char/para span.
  if (figCapture) materializeFigCapture();
  if (attrCapture) {
    // Fragment ended mid-capture. A para-shaped capture (`\cp 1 cp` at fragment end) folds —
    // the paragraph ended with plain-text content. A char-shaped capture never saw its
    // closer, so it stays a standalone (implicitly closed) span.
    if (attrCapture.shape === "para") {
      Object.assign(attrCapture.target, {
        [attrCapture.attrName]: toUsjText(attrCapture.value.replace(/[\s\u200B]+$/, "")),
      });
      attrCapture = undefined;
    } else {
      materializeCaptureAsChar();
    }
  }
  closeCharStack();
  closeNote(false);
  // Fragment ended without `\esbe`: the sidebar closes implicitly (closed="false").
  closeSidebar(false);

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
