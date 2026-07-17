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
import { isMilestoneCommentMarker, MilestoneNode } from "../../nodes/usj/MilestoneNode.js";
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
  | { kind: "milestone"; marker: string; attributes?: { [attributeName: string]: string } };

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

/**
 * True for milestone NAMES per USFM's `-s`/`-e` start/end suffix convention (bare `ts` is the
 * sole exception) — mirrors `isKnownMilestoneMarker` in the platform marker-edit utils.
 * `MilestoneNode.isValidMarker` alone is too loose here: its generic `z`-prefix wildcard would
 * classify any custom.sty-style marker (e.g. `\zfoo`) as a milestone, which would keep
 * unknown-marker resolution (`DetermineUnknownTokenType`) from ever seeing it.
 */
function isMilestoneHeuristicName(name: string): boolean {
  return (
    MilestoneNode.isValidMarker(name) &&
    (name === "ts" || name.endsWith("-s") || name.endsWith("-e") || isMilestoneCommentMarker(name))
  );
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

const ATTRIBUTE_PAIR_REGEX = /([-\w]+)\s*=\s*"(.*?)"/g;

/** USFM 3 default attribute per marker (subset; unmapped bare values stay literal). */
const DEFAULT_MARKER_ATTRIBUTES: { [marker: string]: string } = {
  w: "lemma",
  rb: "gloss",
  xt: "href",
  jmp: "href",
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
): { [attributeName: string]: string } | undefined {
  const attributes: { [attributeName: string]: string } = {};
  const pairs = [...attributeText.matchAll(ATTRIBUTE_PAIR_REGEX)];
  if (pairs.length > 0) {
    for (const [, name, value] of pairs) {
      if (!RESERVED_NODE_KEYS.has(name)) attributes[name] = value;
    }
    return Object.keys(attributes).length > 0 ? attributes : undefined;
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
  let attributes: { [attributeName: string]: string } | undefined;
  if (pipeIndex >= 0) attributes = parseAttributeText(between.slice(pipeIndex + 1), name);
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
 * `closed` is nonstandard derived USX/USJ metadata for an implicitly-closed note
 * (see `usx-to-usj.ts`'s "Not dropping attribs.closed for backwards compatibility");
 * it is not part of the published `MarkerObject` shape, so it is typed locally.
 */
type NoteMarkerObject = MarkerObject & { closed?: string };

export function usfmFragmentToUsjContent(
  fragment: string,
  options?: UsfmFragmentOptions,
): MarkerContent[] {
  const result: MarkerContent[] = [];
  let para: MarkerObject | undefined;
  let note: NoteMarkerObject | undefined;
  const charStack: CharFrame[] = [];

  const container = (): MarkerContent[] => {
    if (charStack.length > 0) return getContent(charStack[charStack.length - 1].object);
    if (note) return getContent(note);
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

  const closeCharStack = () => {
    charStack.length = 0;
  };
  const closeNote = (terminated: boolean) => {
    if (!note) return;
    if (!terminated) note.closed = "false";
    note = undefined;
  };

  for (const token of tokenize(
    fragment,
    options?.getMarker ?? getMarker,
    options?.isNoteContext ?? false,
  )) {
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
        charStack.push({ object });
        break;
      }
      case "end": {
        const marker = token.marker.replace(/^\+/, "");
        const frameIndex = charStack.findLastIndex((frame) => frame.object.marker === marker);
        if (frameIndex >= 0) {
          extractAttributes(charStack[frameIndex].object);
          charStack.length = frameIndex;
        } else if (note && note.marker === marker) {
          // Explicit note close auto-closes any still-open char span within it
          // (PT9: closing a note terminates its content, same as para/verse/chapter).
          closeCharStack();
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
