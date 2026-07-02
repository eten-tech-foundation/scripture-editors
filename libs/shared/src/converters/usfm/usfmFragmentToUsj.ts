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
import getMarker from "../../utils/usfm/getMarker.js";
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
      if (end < fragment.length && /[\s\u00A0]/.test(fragment[end])) end++;
      pushText(fragment.slice(rawStart, end));
      index = end;
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

function parseAttributeText(
  attributeText: string,
  marker: string,
): { [attributeName: string]: string } | undefined {
  const attributes: { [attributeName: string]: string } = {};
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
  container: MarkerContent[];
}

/**
 * `closed` is nonstandard derived USX/USJ metadata for an implicitly-closed note
 * (see `usx-to-usj.ts`'s "Not dropping attribs.closed for backwards compatibility");
 * it is not part of the published `MarkerObject` shape, so it is typed locally.
 */
type NoteMarkerObject = MarkerObject & { closed?: string };

export function usfmFragmentToUsjContent(fragment: string): MarkerContent[] {
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
          // Explicit note close auto-closes any still-open char span within it
          // (PT9: closing a note terminates its content, same as para/verse/chapter).
          closeCharStack();
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
