/**
 * Twin pin: the forward adaptor's `createNote` (usj-editor.adaptor.ts) builds the SERIALIZED
 * editable note shape; `$createWholeNote` (libs/shared-react note.utils.ts) builds the same shape
 * as live nodes at insert/delta time. Marker glyphs and note layout are presentation-only (never
 * serialized to USJ), so after any save/reload every note shows the LOAD path's shape — a note
 * built by the runtime path must be structurally identical or it visibly changes on reload.
 * This suite makes the two functions' mutual "keep updated with" comments an enforced invariant
 * across the full markerMode × noteMode × closed matrix.
 *
 * Every cell of the matrix is representable on both sides, so none are skipped. The one shape
 * deliberately OUT of the matrix is `caller: ""`: `$createWholeNote` then renders no caller node
 * at all — a layout that exists only for the delta-driven embedded note editor, while the forward
 * adaptor always renders a caller. The two paths never meet on that input.
 */
import {
  buildInsertedSerializedNote,
  normalizeSerializedNote,
  NormalizedNodeShape,
  NormalizedNoteShape,
  serializeLoadedNote,
  usjDocWithNote,
} from "./twin-pin.test-helpers";
import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { NBSP } from "shared";
import { MarkerMode, NoteMode, ViewOptions } from "shared-react";

/**
 * The logical note both twins build: `\f +` with an `\fr` reference and an empty `\ft` — exactly
 * what `$insertNote("f", "+", …, GEN 1:5)` produces at a collapsed selection.
 */
/**
 * A note-content char carrying the `closed="false"` ParatextData records on every genuinely
 * closer-less span. `MarkerObject` does not declare `closed`, so it is set through a widened local
 * (the same shape `usfmFragmentToUsj.ts` uses) rather than a type assertion.
 */
function closedFalseChar(marker: string, content?: string): MarkerObject {
  const char: MarkerObject & { closed?: string } = { type: "char", marker, closed: "false" };
  if (content !== undefined) char.content = [content];
  return char;
}

// The content chars carry closed="false" because that is the shape real project data delivers. It
// also keeps this test on its own subject — note LAYOUT across the mode matrix — rather than the
// separate question of what the forward adaptor does when the source USJ OMITS the flag, which
// char-shape-twin pins.
const NOTE_CONTENT: MarkerContent[] = [closedFalseChar("fr", "1:5 "), closedFalseChar("ft")];

// Building blocks for the expected shapes. Glyph texts are hard-coded display forms (not the
// helpers the implementations call) so a drift in those contracts fails this test.
const NOTE_OPEN_GLYPH: NormalizedNodeShape = {
  kind: "markerGlyph",
  marker: "f",
  markerSyntax: "opening",
  nested: false,
};
const NOTE_CLOSE_GLYPH: NormalizedNodeShape = {
  kind: "markerGlyph",
  marker: "f",
  markerSyntax: "closing",
  nested: false,
};
const NOTE_OPEN_TYPED: NormalizedNodeShape = {
  kind: "typedText",
  textType: "marker",
  text: "\\f ",
};
const NOTE_CLOSE_TYPED: NormalizedNodeShape = {
  kind: "typedText",
  textType: "marker",
  text: "\\f*",
};
/** Editable caller text: space + caller + NBSP separator. */
const CALLER_TEXT: NormalizedNodeShape = { kind: "text", text: ` +${NBSP}`, mode: "normal" };
/** Collapsed-layout caller node; both twins derive the same "1:5" preview from the content. */
const CALLER_NODE: NormalizedNodeShape = { kind: "noteCaller", caller: "+", previewText: "1:5" };
/** Collapsed-layout NBSP spacer (after the caller and after each content child). */
const SPACER: NormalizedNodeShape = { kind: "text", text: NBSP, mode: "normal" };

// The note-content char spans per markerMode (their internals are pinned exhaustively in
// char-shape-twin.test.tsx; here they anchor child order within the note).
const FR_EDITABLE: NormalizedNodeShape = {
  kind: "char",
  marker: "fr",
  closed: "false",
  children: [
    { kind: "markerGlyph", marker: "fr", markerSyntax: "opening", nested: false },
    { kind: "text", text: `${NBSP}1:5 `, mode: "normal" },
  ],
};
const FT_EDITABLE: NormalizedNodeShape = {
  kind: "char",
  marker: "ft",
  closed: "false",
  children: [
    { kind: "markerGlyph", marker: "ft", markerSyntax: "opening", nested: false },
    { kind: "text", text: NBSP, mode: "normal" },
  ],
};
const FR_VISIBLE: NormalizedNodeShape = {
  kind: "char",
  marker: "fr",
  closed: "false",
  children: [
    { kind: "typedText", textType: "marker", text: "\\fr" },
    { kind: "text", text: "1:5 ", mode: "normal" },
  ],
};
const FT_VISIBLE: NormalizedNodeShape = {
  kind: "char",
  marker: "ft",
  closed: "false",
  children: [
    { kind: "typedText", textType: "marker", text: "\\ft" },
    { kind: "text", text: NBSP, mode: "normal" },
  ],
};
const FR_HIDDEN: NormalizedNodeShape = {
  kind: "char",
  marker: "fr",
  closed: "false",
  children: [{ kind: "text", text: "1:5 ", mode: "normal" }],
};
const FT_HIDDEN: NormalizedNodeShape = {
  kind: "char",
  marker: "ft",
  closed: "false",
  children: [{ kind: "text", text: NBSP, mode: "normal" }],
};

interface NoteTwinCombo {
  markerMode: MarkerMode;
  noteMode: NoteMode;
  closed: string | undefined;
  expected: NormalizedNoteShape;
}

const combos: NoteTwinCombo[] = [
  // markerMode "editable": collapsed notes use the caller layout (caller node + NBSP spacer
  // after the caller and after each child); expanded and unclosed notes use the expanded layout
  // (editable caller text, no spacers); an unclosed note never shows a closer.
  {
    markerMode: "editable",
    noteMode: "collapsed",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: true,
      category: undefined,
      closed: undefined,
      children: [
        NOTE_OPEN_GLYPH,
        CALLER_NODE,
        SPACER,
        FR_EDITABLE,
        SPACER,
        FT_EDITABLE,
        SPACER,
        NOTE_CLOSE_GLYPH,
      ],
    },
  },
  {
    // Unclosed notes render expanded inline regardless of noteMode, with no closer.
    markerMode: "editable",
    noteMode: "collapsed",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [NOTE_OPEN_GLYPH, CALLER_TEXT, FR_EDITABLE, FT_EDITABLE],
    },
  },
  {
    markerMode: "editable",
    noteMode: "expanded",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: undefined,
      children: [NOTE_OPEN_GLYPH, CALLER_TEXT, FR_EDITABLE, FT_EDITABLE, NOTE_CLOSE_GLYPH],
    },
  },
  {
    markerMode: "editable",
    noteMode: "expanded",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [NOTE_OPEN_GLYPH, CALLER_TEXT, FR_EDITABLE, FT_EDITABLE],
    },
  },
  // markerMode "visible": the caller layout applies in BOTH note modes (only editable mode has
  // an expanded layout); noteMode and closed still drive the isCollapsed flag, and an unclosed
  // note drops the closing glyph.
  {
    markerMode: "visible",
    noteMode: "collapsed",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: true,
      category: undefined,
      closed: undefined,
      children: [
        NOTE_OPEN_TYPED,
        CALLER_NODE,
        SPACER,
        FR_VISIBLE,
        SPACER,
        FT_VISIBLE,
        SPACER,
        NOTE_CLOSE_TYPED,
      ],
    },
  },
  {
    markerMode: "visible",
    noteMode: "collapsed",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [NOTE_OPEN_TYPED, CALLER_NODE, SPACER, FR_VISIBLE, SPACER, FT_VISIBLE, SPACER],
    },
  },
  {
    markerMode: "visible",
    noteMode: "expanded",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: undefined,
      children: [
        NOTE_OPEN_TYPED,
        CALLER_NODE,
        SPACER,
        FR_VISIBLE,
        SPACER,
        FT_VISIBLE,
        SPACER,
        NOTE_CLOSE_TYPED,
      ],
    },
  },
  {
    markerMode: "visible",
    noteMode: "expanded",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [NOTE_OPEN_TYPED, CALLER_NODE, SPACER, FR_VISIBLE, SPACER, FT_VISIBLE, SPACER],
    },
  },
  // markerMode "hidden": caller layout with no glyphs at all; only the isCollapsed flag and the
  // recorded closed attribute vary across noteMode/closed.
  {
    markerMode: "hidden",
    noteMode: "collapsed",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: true,
      category: undefined,
      closed: undefined,
      children: [CALLER_NODE, SPACER, FR_HIDDEN, SPACER, FT_HIDDEN, SPACER],
    },
  },
  {
    markerMode: "hidden",
    noteMode: "collapsed",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [CALLER_NODE, SPACER, FR_HIDDEN, SPACER, FT_HIDDEN, SPACER],
    },
  },
  {
    markerMode: "hidden",
    noteMode: "expanded",
    closed: undefined,
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: undefined,
      children: [CALLER_NODE, SPACER, FR_HIDDEN, SPACER, FT_HIDDEN, SPACER],
    },
  },
  {
    markerMode: "hidden",
    noteMode: "expanded",
    closed: "false",
    expected: {
      marker: "f",
      caller: "+",
      isCollapsed: false,
      category: undefined,
      closed: "false",
      children: [CALLER_NODE, SPACER, FR_HIDDEN, SPACER, FT_HIDDEN, SPACER],
    },
  },
];

describe("note shape twins: createNote (forward adaptor) vs $createWholeNote (runtime)", () => {
  it.each(combos)(
    "$markerMode markers / $noteMode notes / closed=$closed build the same note shape",
    ({ markerMode, noteMode, closed, expected }) => {
      // The reference text "1:5 " and content are free of NBSP/space runs on purpose: the
      // standard-view display encoding of LOADED text is a forward-adaptor concern pinned by the
      // whitespace-display tests, not part of this shape contract.
      const viewOptions: ViewOptions = {
        markerMode,
        noteMode,
        hasSpacing: true,
        isFormattedFont: true,
      };

      const loaded = normalizeSerializedNote(
        serializeLoadedNote(usjDocWithNote(NOTE_CONTENT, closed), viewOptions),
      );
      const inserted = normalizeSerializedNote(
        buildInsertedSerializedNote(viewOptions, { closed }),
      );

      // Pin the shape itself first, so both twins drifting together still fails loudly.
      expect(loaded).toEqual(expected);
      expect(inserted).toEqual(expected);
    },
  );
});
