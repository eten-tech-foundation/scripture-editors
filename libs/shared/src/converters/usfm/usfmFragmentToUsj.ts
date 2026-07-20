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
      if (!isNoteContext || name === "esb" || name === "esbe")
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
 * stylesheet), so it is hardcoded here; `cat` also targets `esb` sidebars, which this
 * fragment tokenizer does not model (sidebars are opaque blocks — the open-note target
 * covers `f`/`fe`/`x`/`ef`/`efe`/`ex`).
 */
const ATTRIBUTE_MARKERS: {
  [marker: string]: {
    attrName: string;
    targetType: string;
    shape: "char" | "para";
    /** One space after the closing marker is structural (dropped) — true for the
     * chapter/verse number markers, NOT for `\cat` (Paratext keeps that space as content). */
    structuralSpaceAfterCloser?: boolean;
  };
} = {
  ca: {
    attrName: "altnumber",
    targetType: "chapter",
    shape: "char",
    structuralSpaceAfterCloser: true,
  },
  cp: { attrName: "pubnumber", targetType: "chapter", shape: "para" },
  va: {
    attrName: "altnumber",
    targetType: "verse",
    shape: "char",
    structuralSpaceAfterCloser: true,
  },
  vp: {
    attrName: "pubnumber",
    targetType: "verse",
    shape: "char",
    structuralSpaceAfterCloser: true,
  },
  cat: { attrName: "category", targetType: "note", shape: "char" },
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

/** Convert `~` to NBSP for USJ text content (PT9 read-side `UsfmParser` behavior). */
function toUsjText(text: string): string {
  return text.replaceAll("~", NBSP);
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

export function usfmFragmentToUsjContent(
  fragment: string,
  options?: UsfmFragmentOptions,
): MarkerContent[] {
  const result: MarkerContent[] = [];
  let para: MarkerObject | undefined;
  let note: ClosableMarkerObject | undefined;
  const charStack: CharFrame[] = [];
  // Char-stack depth at the moment the open note started: frames BELOW it enclose the note
  // (USX nests the note inside them and the span continues after it — `\wj a \f …\f* b\wj*`
  // puts both the note and " b" inside the wj span); frames AT/ABOVE it were opened inside
  // the note's content and close with it. Only meaningful while `note` is set.
  let noteBaseDepth = 0;

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
      result.push(para);
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
  /** Abort a para-shaped capture (`\cp` with markup): materialize the standalone paragraph. */
  const materializeCaptureAsPara = () => {
    if (!attrCapture) return;
    para = { type: "para", marker: attrCapture.marker, content: [] };
    if (attrCapture.value) para.content = [toUsjText(attrCapture.value)];
    result.push(para);
    attrCapture = undefined;
  };

  const tokens = tokenize(
    fragment,
    options?.getMarker ?? getMarker,
    options?.isNoteContext ?? false,
  );
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
        // Explicit close with plain-text content: fold as the target's attribute.
        Object.assign(attrCapture.target, { [attrCapture.attrName]: toUsjText(attrCapture.value) });
        if (ATTRIBUTE_MARKERS[attrCapture.marker]?.structuralSpaceAfterCloser) {
          // One space after the closer is structural, not content (`\v 1 \va 1\va* Verse…`).
          const nextToken = tokens[tokenIndex + 1];
          if (nextToken?.kind === "text" && /^[ \u00A0]/.test(nextToken.text))
            nextToken.text = nextToken.text.slice(1);
        }
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

    if (attrTarget) {
      if (token.kind === "text") {
        if (/^[\s\u200B]*$/.test(token.text)) {
          heldWhitespace += token.text;
          continue;
        }
        attrTarget = undefined;
        flushHeldWhitespace();
      } else if (token.kind === "charOpen" || token.kind === "para") {
        const foldable =
          token.kind === "para" || !token.isNested ? ATTRIBUTE_MARKERS[token.marker] : undefined;
        if (foldable && foldable.targetType === attrTarget.type) {
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
        attrTarget = undefined;
        flushHeldWhitespace();
      } else {
        attrTarget = undefined;
        flushHeldWhitespace();
      }
    }

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
