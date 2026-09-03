import { unknownDisplayParts } from "./unknownUsfm.utils.js";
import { describe, expect, it } from "vitest";

interface Case {
  name: string;
  tag: string;
  marker: string | undefined;
  unknownAttributes: { [name: string]: string | undefined } | undefined;
  expected: { opening: string; attributes: string; closingAttributes: string; closing: string };
}

// Table-driven over exactly the per-kind rules in the design (opening/attributes/closingAttributes/
// closing bytes unknownDisplayParts computes to render around an UnknownNode's
// existing content children), plus attribute-less variants of the kinds that carry real attribute
// bytes.
const cases: Case[] = [
  // USFM pipe attributes come AFTER a span's content, directly before the closer
  // (`\zzz content|foo="bar"\zzz*` — the char-span shape, matching addCharAttributes'
  // placement). The attribute bytes therefore populate `closingAttributes`, kept separate from
  // the bare `closing` glyph so a consumer can style the two runs differently; the middle
  // `attributes` part is reserved for bytes that belong BETWEEN the opening and the content
  // (sidebar's `\cat` run, periph's pipe pairs on the marker line).
  {
    name: "generic unknown kind renders named-pair attributes as closingAttributes (no default-attribute collapse)",
    tag: "unknown-para",
    marker: "zzz",
    unknownAttributes: { foo: "bar", baz: "qux" },
    expected: {
      opening: "\\zzz ",
      attributes: "",
      closingAttributes: '|foo="bar" baz="qux"',
      closing: "\\zzz*",
    },
  },
  {
    name: "generic unknown kind with no attributes",
    tag: "unknown-para",
    marker: "zzz",
    unknownAttributes: undefined,
    expected: { opening: "\\zzz ", attributes: "", closingAttributes: "", closing: "\\zzz*" },
  },
  {
    name: "optbreak renders as the literal '//' token, no marker glyphs",
    tag: "optbreak",
    marker: undefined,
    unknownAttributes: undefined,
    expected: { opening: "//", attributes: "", closingAttributes: "", closing: "" },
  },
  // A figure's caption comes FIRST in USFM 3.0 (`\fig caption|src="…"\fig*`), so its attribute
  // bytes populate closingAttributes, ahead of the closing glyph — rendering them in the middle
  // would strand the caption after the attribute list, which is invalid USFM.
  {
    name: "figure renders attributes as closingAttributes, renaming the USJ 'file' attribute back to USFM 'src'",
    tag: "figure",
    marker: "fig",
    unknownAttributes: { file: "image.jpg", size: "span", ref: "1.18" },
    expected: {
      opening: "\\fig ",
      attributes: "",
      closingAttributes: '|src="image.jpg" size="span" ref="1.18"',
      closing: "\\fig*",
    },
  },
  {
    name: "figure with no attributes",
    tag: "figure",
    marker: "fig",
    unknownAttributes: undefined,
    expected: { opening: "\\fig ", attributes: "", closingAttributes: "", closing: "\\fig*" },
  },
  {
    name: "table container contributes no bytes of its own",
    tag: "table",
    marker: undefined,
    unknownAttributes: undefined,
    expected: { opening: "", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "table:row opens with \\tr and never closes",
    tag: "table:row",
    marker: "tr",
    unknownAttributes: undefined,
    expected: { opening: "\\tr ", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "table:cell opens with its own marker (\\tc1) and never closes; align is not rendered as a pipe attribute",
    tag: "table:cell",
    marker: "tc1",
    unknownAttributes: { align: "start" },
    expected: { opening: "\\tc1 ", attributes: "", closingAttributes: "", closing: "" },
  },
  // Spanning cells: the tokenizer trims the span suffix off the marker and stores the span COUNT
  // as colspan (`\thc3-4` -> marker "thc3", colspan "2"; usfmFragmentToUsj.ts's table-cell
  // assembly), so the renderer must re-encode end = start + count - 1 back into the opening or
  // the cell's span is silently lost (`\thc3 ` is a different, single-column cell).
  {
    name: "table:cell re-encodes colspan as the span suffix (marker tc1 + colspan 2 -> \\tc1-2)",
    tag: "table:cell",
    marker: "tc1",
    unknownAttributes: { align: "start", colspan: "2" },
    expected: { opening: "\\tc1-2 ", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "table:cell span re-encoding round-trips the tokenizer's own example (thc3 + colspan 2 -> \\thc3-4)",
    tag: "table:cell",
    marker: "thc3",
    unknownAttributes: { align: "center", colspan: "2" },
    expected: { opening: "\\thc3-4 ", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "table:cell with a colspan but no trailing start column stays bare rather than emitting a garbage suffix",
    tag: "table:cell",
    marker: "tc",
    unknownAttributes: { colspan: "2" },
    expected: { opening: "\\tc ", attributes: "", closingAttributes: "", closing: "" },
  },
  // Degenerate-marker pins for the trailing-digit scan: an ALL-digit marker's start column is the
  // whole marker, and a long digit run that ends in a non-digit has no trailing digits at all —
  // the adversarial shape the scan must both answer correctly and answer in linear time.
  {
    name: "table:cell span re-encoding treats an all-digit marker's whole name as the start column",
    tag: "table:cell",
    marker: "123",
    unknownAttributes: { colspan: "2" },
    expected: { opening: "\\123-124 ", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "table:cell with a long digit run ending in a non-digit has no trailing start column and stays bare",
    tag: "table:cell",
    marker: `${"0".repeat(500)}X`,
    unknownAttributes: { colspan: "2" },
    expected: {
      opening: `\\${"0".repeat(500)}X `,
      attributes: "",
      closingAttributes: "",
      closing: "",
    },
  },
  {
    name: "sidebar with a category renders \\cat as its own char-shaped marker after \\esb",
    tag: "sidebar",
    marker: "esb",
    unknownAttributes: { category: "Cultural" },
    expected: {
      opening: "\\esb",
      attributes: " \\cat Cultural\\cat*",
      closingAttributes: "",
      closing: "\\esbe",
    },
  },
  {
    name: "sidebar with no category",
    tag: "sidebar",
    marker: "esb",
    unknownAttributes: undefined,
    expected: { opening: "\\esb", attributes: "", closingAttributes: "", closing: "\\esbe" },
  },
  // An UNTERMINATED construct has no closing bytes in the file, so it must display none: the
  // rule char spans already follow (`$charClosingGlyph`, attributeDisplay.utils.ts — a
  // `closed="false"` span never renders a closer, and the sync must not fabricate one). A
  // displayed `\esbe` the document does not contain is a byte the user can neither delete nor
  // save, which is precisely what a displayed byte may never be.
  {
    name: "an unterminated sidebar renders no closing glyph",
    tag: "sidebar",
    marker: "esb",
    unknownAttributes: { category: "History", closed: "false" },
    expected: {
      opening: "\\esb",
      attributes: " \\cat History\\cat*",
      closingAttributes: "",
      closing: "",
    },
  },
  {
    name: "an unterminated generic unknown span renders its attributes but no closing glyph",
    tag: "unknown-para",
    marker: "zzz",
    unknownAttributes: { foo: "bar", closed: "false" },
    expected: {
      opening: "\\zzz ",
      attributes: "",
      closingAttributes: '|foo="bar"',
      closing: "",
    },
  },
  {
    name: "an unterminated figure renders its attributes but no closing glyph",
    tag: "figure",
    marker: "fig",
    unknownAttributes: { file: "image.jpg", closed: "false" },
    expected: {
      opening: "\\fig ",
      attributes: "",
      closingAttributes: '|src="image.jpg"',
      closing: "",
    },
  },
  {
    name: "periph renders 'alt' as text content after the marker, 'id' as a named pair",
    tag: "periph",
    marker: undefined,
    unknownAttributes: { alt: "Title Page", id: "titlepage" },
    expected: {
      opening: "\\periph Title Page",
      attributes: '|id="titlepage"',
      closingAttributes: "",
      closing: "",
    },
  },
  // Deliberate pin: with no `alt` the opening keeps its marker-separator space (`\periph `) —
  // the same shape every other marker opening uses, and harmless before the node's content.
  {
    name: "periph with no attributes keeps the bare opening with its separator space",
    tag: "periph",
    marker: undefined,
    unknownAttributes: undefined,
    expected: { opening: "\\periph ", attributes: "", closingAttributes: "", closing: "" },
  },
  {
    name: "ref is a generated wrapper with no USFM bytes of its own",
    tag: "ref",
    marker: undefined,
    unknownAttributes: { loc: "MRK 9:50", gen: "true" },
    expected: { opening: "", attributes: "", closingAttributes: "", closing: "" },
  },
];

describe("unknownDisplayParts", () => {
  it.each(cases)("$name", ({ tag, marker, unknownAttributes, expected }) => {
    expect(unknownDisplayParts(tag, marker, unknownAttributes)).toEqual(expected);
  });
});
