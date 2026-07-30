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

// Expected spans per markerMode. In editable mode a span opens with its MarkerNode glyph and
// real content carries the structural NBSP prefix; an empty span holds the lone-NBSP placeholder
// WITHOUT the prefix. Note-content chars are implicitly closed (`\fr`/`\fq`/`\ft` never take a
// USFM closer), so both twins record closed="false" and emit no closing glyph — on the forward
// side even when the source USJ omitted the attribute (the derived-flag honesty rule).
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

interface CharTwinCombo {
  name: string;
  markerMode: ViewOptions["markerMode"];
  /** Explicit `closed="false"` on the source USJ chars, or omitted (forward adaptor derives it). */
  explicitClosed: string | undefined;
  expected: NormalizedCharShape[];
}

const combos: CharTwinCombo[] = [
  {
    name: "editable, closed derived",
    markerMode: "editable",
    explicitClosed: undefined,
    expected: EDITABLE_CHARS,
  },
  {
    name: "editable, closed explicit",
    markerMode: "editable",
    explicitClosed: "false",
    expected: EDITABLE_CHARS,
  },
  {
    name: "visible, closed derived",
    markerMode: "visible",
    explicitClosed: undefined,
    expected: VISIBLE_CHARS,
  },
  {
    name: "hidden, closed derived",
    markerMode: "hidden",
    explicitClosed: undefined,
    expected: HIDDEN_CHARS,
  },
];

describe("char shape twins: createChar (forward adaptor) vs the note-content char builder", () => {
  it.each(combos)(
    "$name: both paths build the same char spans",
    ({ markerMode, explicitClosed, expected }) => {
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
      expect(loadedChars).toEqual(expected);
      expect(insertedChars).toEqual(expected);
    },
  );
});
