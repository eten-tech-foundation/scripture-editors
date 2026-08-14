/**
 * Twin pin: the forward adaptor's `createChar` (usj-editor.adaptor.ts) builds the SERIALIZED
 * editable char span; the private note-content char builder in libs/shared-react note.utils.ts
 * (documented as "matching the reverse adaptor's `createChar` output") builds the same span as
 * live nodes. If they drift, a freshly inserted footnote's spans differ from the same note
 * reloaded — historically the drift made the marker-edit engine unwrap fresh spans as "opener
 * deleted", silently emptying new footnotes.
 *
 * The runtime builder is private by design; it is driven here through its public caller
 * `$createNoteChildren`, which produces the `\fr` (reference), `\fq` (quotation, from a
 * non-collapsed selection), and empty `\ft` spans of a footnote.
 */
import {
  buildInsertedSerializedNote,
  NormalizedCharShape,
  normalizeSerializedChar,
  QUOTED_WORD_RANGE,
  serializeLoadedNote,
  usjDocWithNote,
} from "./twin-pin.test-helpers";
import { MarkerContent, MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { isSerializedCharNode, NBSP } from "shared";
import { ViewOptions } from "shared-react";

/** A USJ note-content char, optionally carrying an explicit `closed` attribute. */
function charObject(
  marker: string,
  content: string | undefined,
  closed: string | undefined,
): MarkerObject {
  const char: MarkerObject & { closed?: string } = { type: "char", marker };
  if (content !== undefined) char.content = [content];
  if (closed !== undefined) char.closed = closed;
  return char;
}

/**
 * The logical note content both twins build: what `$createNoteChildren` produces for a footnote
 * at GEN 1:5 with the word "quoted" selected — an `\fr` reference, an `\fq` quotation, and an
 * empty `\ft`.
 */
function noteContent(closed: string | undefined): MarkerContent[] {
  return [
    charObject("fr", "1:5 ", closed),
    charObject("fq", "quoted", closed),
    charObject("ft", undefined, closed),
  ];
}

// Expected spans per markerMode when the source USJ records closed="false" (what ParatextData
// always supplies on a closer-less span). In editable mode a span opens with its MarkerNode glyph
// and real content carries the structural NBSP prefix; an empty span holds the lone-NBSP
// placeholder WITHOUT the prefix. Both twins record closed="false" and emit no closing glyph.
//
// When the source OMITS the flag the twins deliberately DIVERGE, and that divergence is this
// suite's subject rather than a drift to fix: closer display keys on the span's recorded state,
// never on the marker family, so the forward adaptor renders a closer and synthesizes nothing —
// that is what makes an explicitly-closed `\xt text\xt*` round-trip its `\xt*` byte-identically.
// The runtime note-content builder still stamps closed="false" because it is choosing the
// insertion DEFAULT for a content marker, which is a different decision from display.
const EDITABLE_CHARS: NormalizedCharShape[] = [
  {
    kind: "char",
    marker: "fr",
    closed: "false",
    children: [
      { kind: "markerGlyph", marker: "fr", markerSyntax: "opening", nested: false },
      { kind: "text", text: `${NBSP}1:5 `, mode: "normal" },
    ],
  },
  {
    kind: "char",
    marker: "fq",
    closed: "false",
    children: [
      { kind: "markerGlyph", marker: "fq", markerSyntax: "opening", nested: false },
      { kind: "text", text: `${NBSP}quoted`, mode: "normal" },
    ],
  },
  {
    kind: "char",
    marker: "ft",
    closed: "false",
    children: [
      { kind: "markerGlyph", marker: "ft", markerSyntax: "opening", nested: false },
      { kind: "text", text: NBSP, mode: "normal" },
    ],
  },
];

// Visible mode shows a bare opening glyph as typed text (hard-coded display form) and content
// without the NBSP prefix; the empty span still holds the placeholder.
const VISIBLE_CHARS: NormalizedCharShape[] = [
  {
    kind: "char",
    marker: "fr",
    closed: "false",
    children: [
      { kind: "typedText", textType: "marker", text: "\\fr" },
      { kind: "text", text: "1:5 ", mode: "normal" },
    ],
  },
  {
    kind: "char",
    marker: "fq",
    closed: "false",
    children: [
      { kind: "typedText", textType: "marker", text: "\\fq" },
      { kind: "text", text: "quoted", mode: "normal" },
    ],
  },
  {
    kind: "char",
    marker: "ft",
    closed: "false",
    children: [
      { kind: "typedText", textType: "marker", text: "\\ft" },
      { kind: "text", text: NBSP, mode: "normal" },
    ],
  },
];

// Hidden mode has no glyphs at all: content text only, placeholder for the empty span.
const HIDDEN_CHARS: NormalizedCharShape[] = [
  {
    kind: "char",
    marker: "fr",
    closed: "false",
    children: [{ kind: "text", text: "1:5 ", mode: "normal" }],
  },
  {
    kind: "char",
    marker: "fq",
    closed: "false",
    children: [{ kind: "text", text: "quoted", mode: "normal" }],
  },
  {
    kind: "char",
    marker: "ft",
    closed: "false",
    children: [{ kind: "text", text: NBSP, mode: "normal" }],
  },
];

/**
 * The LOADED-side expectation when the source USJ omits `closed`: the span renders its closing
 * glyph in the shape that markerMode dictates, and no `closed` flag is synthesized onto it.
 */
function withRenderedCloser(
  shapes: NormalizedCharShape[],
  markerMode: ViewOptions["markerMode"],
): NormalizedCharShape[] {
  return shapes.map((shape) => {
    if (markerMode === "editable")
      return {
        ...shape,
        closed: undefined,
        children: [
          ...shape.children,
          { kind: "markerGlyph", marker: shape.marker, markerSyntax: "closing", nested: false },
        ],
      };
    if (markerMode === "visible")
      return {
        ...shape,
        closed: undefined,
        children: [
          ...shape.children,
          { kind: "typedText", textType: "marker", text: `\\${shape.marker}*` },
        ],
      };
    // Hidden mode renders no glyphs at all, so only the absent flag distinguishes it.
    return { ...shape, closed: undefined };
  });
}

interface CharTwinCombo {
  name: string;
  markerMode: ViewOptions["markerMode"];
  /** Explicit `closed="false"` on the source USJ chars, or omitted (twins then diverge). */
  explicitClosed: string | undefined;
  expectedLoaded: NormalizedCharShape[];
  expectedInserted: NormalizedCharShape[];
}

const combos: CharTwinCombo[] = [
  {
    name: "editable, closed omitted (twins diverge by design)",
    markerMode: "editable",
    explicitClosed: undefined,
    expectedLoaded: withRenderedCloser(EDITABLE_CHARS, "editable"),
    expectedInserted: EDITABLE_CHARS,
  },
  {
    name: "editable, closed explicit",
    markerMode: "editable",
    explicitClosed: "false",
    expectedLoaded: EDITABLE_CHARS,
    expectedInserted: EDITABLE_CHARS,
  },
  {
    name: "visible, closed omitted (twins diverge by design)",
    markerMode: "visible",
    explicitClosed: undefined,
    expectedLoaded: withRenderedCloser(VISIBLE_CHARS, "visible"),
    expectedInserted: VISIBLE_CHARS,
  },
  {
    name: "hidden, closed omitted (twins diverge by design)",
    markerMode: "hidden",
    explicitClosed: undefined,
    expectedLoaded: withRenderedCloser(HIDDEN_CHARS, "hidden"),
    expectedInserted: HIDDEN_CHARS,
  },
];

describe("char shape twins: createChar (forward adaptor) vs the note-content char builder", () => {
  it.each(combos)(
    "$name: both paths build the same char spans",
    ({ markerMode, explicitClosed, expectedLoaded, expectedInserted }) => {
      const viewOptions: ViewOptions = {
        markerMode,
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
      };

      const loadedChars = serializeLoadedNote(
        usjDocWithNote(noteContent(explicitClosed)),
        viewOptions,
      )
        .children.filter(isSerializedCharNode)
        .map(normalizeSerializedChar);
      const insertedChars = buildInsertedSerializedNote(viewOptions, QUOTED_WORD_RANGE)
        .children.filter(isSerializedCharNode)
        .map(normalizeSerializedChar);

      // Pin the span shapes themselves first, so both twins drifting together still fails loudly.
      expect(loadedChars).toEqual(expectedLoaded);
      expect(insertedChars).toEqual(expectedInserted);
    },
  );
});
