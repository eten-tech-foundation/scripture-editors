/**
 * Shared helpers for the "twin pin" suites (note-shape-twin, char-shape-twin,
 * logical-content-agreement): the forward adaptor builds SERIALIZED editable structures
 * (`createNote`/`createChar` in usj-editor.adaptor.ts) while the runtime builders construct the
 * same shapes as live nodes (`$createWholeNote` and its private note-content char builder in
 * libs/shared-react note.utils.ts). These helpers normalize both serialized forms to one
 * comparable shape and build each side from the same logical inputs.
 */
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { initialize, reset, serializeEditorState } from "./usj-editor.adaptor";
import {
  EMPTY_USJ,
  MarkerContent,
  MarkerObject,
  Usj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  SerializedEditorState,
  SerializedLexicalNode,
} from "lexical";
import {
  $createParaNode,
  isSerializedCharNode,
  isSerializedImmutableTypedTextNode,
  isSerializedMarkerNode,
  isSerializedNoteNode,
  isSerializedParaNode,
  isSerializedTextNode,
  MarkerSyntax,
  SerializedCharNode,
  SerializedNoteNode,
  TypedMarkNode,
  usjBaseNodes,
} from "shared";
import {
  $createNoteChildren,
  $createWholeNote,
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  isSerializedImmutableNoteCallerNode,
  ViewOptions,
} from "shared-react";

/** All node classes the twin-pin suites need registered in a headless editor. */
export const twinPinNodes = [
  TypedMarkNode,
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  ...usjBaseNodes,
];

/**
 * The structural essence of one serialized node, as far as the serialized/runtime twins must
 * agree. Volatile or derived fields are stripped: node versions, text detail/format/style, a
 * MarkerNode's serialized `text` (node-computed from its marker — the forward adaptor writes ""
 * where a live node's exportJSON writes the computed glyph), and the note caller's `onClick`.
 * Deliberately NOT stripped, because the twins must agree on them: child order and kinds, marker
 * names, glyph syntax and nesting, visible (typed-text) glyph text, text content and mode,
 * `closed` attributes, and the caller's text/type and preview text.
 */
export type NormalizedNodeShape =
  | { kind: "markerGlyph"; marker: string; markerSyntax: MarkerSyntax | undefined; nested: boolean }
  | { kind: "typedText"; textType: string; text: string }
  | { kind: "noteCaller"; caller: string; previewText: string }
  | NormalizedCharShape
  | { kind: "text"; text: string; mode: string }
  | { kind: "unexpected"; type: string };

export interface NormalizedCharShape {
  kind: "char";
  marker: string;
  closed: string | undefined;
  children: NormalizedNodeShape[];
}

/** The structural essence of a serialized note, from either twin. */
export interface NormalizedNoteShape {
  marker: string;
  caller: string | undefined;
  isCollapsed: boolean | undefined;
  category: string | undefined;
  closed: string | undefined;
  children: NormalizedNodeShape[];
}

export function normalizeSerializedNode(node: SerializedLexicalNode): NormalizedNodeShape {
  if (isSerializedMarkerNode(node))
    return {
      kind: "markerGlyph",
      marker: node.marker,
      markerSyntax: node.markerSyntax,
      nested: node.nested === true,
    };
  if (isSerializedImmutableTypedTextNode(node))
    return { kind: "typedText", textType: node.textType, text: node.text };
  if (isSerializedImmutableNoteCallerNode(node))
    return { kind: "noteCaller", caller: node.caller, previewText: node.previewText };
  if (isSerializedCharNode(node)) return normalizeSerializedChar(node);
  if (isSerializedTextNode(node)) return { kind: "text", text: node.text, mode: node.mode };
  return { kind: "unexpected", type: node.type };
}

export function normalizeSerializedChar(char: SerializedCharNode): NormalizedCharShape {
  return {
    kind: "char",
    marker: char.marker,
    closed: char.unknownAttributes?.closed,
    children: char.children.map(normalizeSerializedNode),
  };
}

export function normalizeSerializedNote(note: SerializedNoteNode): NormalizedNoteShape {
  return {
    marker: note.marker,
    caller: note.caller,
    isCollapsed: note.isCollapsed,
    category: note.category,
    closed: note.unknownAttributes?.closed,
    children: note.children.map(normalizeSerializedNode),
  };
}

/** The paragraph text both twins build their note into. */
export const NOTE_PARA_TEXT = "some quoted text.";

/** Selection range over the word "quoted" in {@link NOTE_PARA_TEXT} (for `\fq` quotations). */
export const QUOTED_WORD_RANGE = { selectionStart: 5, selectionEnd: 11 } as const;

/**
 * Builds a USJ document holding one `\f +` note (with the given content) inside a plain
 * paragraph — the forward-adaptor twin of {@link buildInsertedSerializedNote}'s inputs.
 */
export function usjDocWithNote(noteContent: MarkerContent[], closed?: string): Usj {
  const note: MarkerObject & { closed?: string } = {
    type: "note",
    marker: "f",
    caller: "+",
    content: noteContent,
  };
  if (closed !== undefined) note.closed = closed;
  return {
    ...EMPTY_USJ,
    content: [{ type: "para", marker: "p", content: [NOTE_PARA_TEXT, note] }],
  };
}

/** Serializes `usj` through the forward adaptor and returns the one note inside it. */
export function serializeLoadedNote(usj: Usj, viewOptions: ViewOptions): SerializedNoteNode {
  initialize(undefined, undefined);
  reset();
  return findSerializedNote(serializeEditorState(usj, viewOptions));
}

/** Finds the single serialized note nested in a para of the serialized editor state. */
export function findSerializedNote(state: SerializedEditorState): SerializedNoteNode {
  for (const child of state.root.children) {
    if (!isSerializedParaNode(child)) continue;
    const note = child.children.find((node) => isSerializedNoteNode(node));
    if (isSerializedNoteNode(note)) return note;
  }
  throw new Error("No serialized note found in any para");
}

export interface InsertedNoteOptions {
  /**
   * Source `closed` attribute. `$createWholeNote` derives LAYOUT from it; RECORDING it on the
   * node is by design its caller's job (the delta materializer sets `unknownAttributes` after
   * construction), so this helper mirrors that caller contract.
   */
  closed?: string;
  /** Selection range in {@link NOTE_PARA_TEXT}; collapsed by default (no `\fq` quotation). */
  selectionStart?: number;
  selectionEnd?: number;
}

/**
 * Builds a `\f +` footnote for GEN 1:5 through the runtime insert path ($createNoteChildren →
 * $createWholeNote) in a headless editor and returns its serialized form — the runtime twin of
 * loading {@link usjDocWithNote} through the forward adaptor.
 */
export function buildInsertedSerializedNote(
  viewOptions: ViewOptions,
  options: InsertedNoteOptions = {},
): SerializedNoteNode {
  const { closed, selectionStart = 4, selectionEnd = selectionStart } = options;
  const { editor } = createBasicTestEnvironment(twinPinNodes);
  editor.update(
    () => {
      const text = $createTextNode(NOTE_PARA_TEXT);
      const para = $createParaNode("p");
      $getRoot().append(para.append(text));
      text.select(selectionStart, selectionEnd);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("Expected a range selection");
      const contentNodes = $createNoteChildren(
        selection,
        "f",
        { book: "GEN", chapterNum: 1, verseNum: 5 },
        viewOptions,
        {},
        undefined,
      );
      if (!contentNodes) throw new Error("Expected note children to be created");
      const note = $createWholeNote("f", "+", contentNodes, viewOptions, {}, undefined, closed);
      if (closed !== undefined) note.setUnknownAttributes({ closed });
      para.append(note);
    },
    { discrete: true },
  );
  return findSerializedNote(editor.getEditorState().toJSON());
}
