import { unknownDisplayParts } from "./unknownUsfm.utils.js";
import { describe, expect, it } from "vitest";

interface Case {
  name: string;
  tag: string;
  marker: string | undefined;
  unknownAttributes: { [name: string]: string | undefined } | undefined;
  expected: { opening: string; attributes: string; closing: string };
}

// Table-driven over exactly the per-kind rules in the design (opening/attributes/closing bytes
// unknownDisplayParts computes for Task 13 to render around an UnknownNode's existing content
// children), plus attribute-less variants of the kinds that carry real attribute bytes.
const cases: Case[] = [
  {
    name: "generic unknown kind with named-pair attributes (no default-attribute collapse)",
    tag: "unknown-para",
    marker: "zzz",
    unknownAttributes: { foo: "bar", baz: "qux" },
    expected: { opening: "\\zzz ", attributes: '|foo="bar" baz="qux"', closing: "\\zzz*" },
  },
  {
    name: "generic unknown kind with no attributes",
    tag: "unknown-para",
    marker: "zzz",
    unknownAttributes: undefined,
    expected: { opening: "\\zzz ", attributes: "", closing: "\\zzz*" },
  },
  {
    name: "optbreak renders as the literal '//' token, no marker glyphs",
    tag: "optbreak",
    marker: undefined,
    unknownAttributes: undefined,
    expected: { opening: "//", attributes: "", closing: "" },
  },
  {
    name: "figure renames the USJ 'file' attribute back to USFM 'src'",
    tag: "figure",
    marker: "fig",
    unknownAttributes: { file: "image.jpg", size: "span", ref: "1.18" },
    expected: {
      opening: "\\fig ",
      attributes: '|src="image.jpg" size="span" ref="1.18"',
      closing: "\\fig*",
    },
  },
  {
    name: "figure with no attributes",
    tag: "figure",
    marker: "fig",
    unknownAttributes: undefined,
    expected: { opening: "\\fig ", attributes: "", closing: "\\fig*" },
  },
  {
    name: "table container contributes no bytes of its own",
    tag: "table",
    marker: undefined,
    unknownAttributes: undefined,
    expected: { opening: "", attributes: "", closing: "" },
  },
  {
    name: "table:row opens with \\tr and never closes",
    tag: "table:row",
    marker: "tr",
    unknownAttributes: undefined,
    expected: { opening: "\\tr ", attributes: "", closing: "" },
  },
  {
    name: "table:cell opens with its own marker (\\tc1) and never closes; align/colspan are not rendered as pipe attributes",
    tag: "table:cell",
    marker: "tc1",
    unknownAttributes: { align: "start" },
    expected: { opening: "\\tc1 ", attributes: "", closing: "" },
  },
  {
    name: "table:cell opens with its own marker (\\th2) and never closes",
    tag: "table:cell",
    marker: "th2",
    unknownAttributes: { align: "center", colspan: "2" },
    expected: { opening: "\\th2 ", attributes: "", closing: "" },
  },
  {
    name: "sidebar with a category renders \\cat as its own char-shaped marker after \\esb",
    tag: "sidebar",
    marker: "esb",
    unknownAttributes: { category: "Cultural" },
    expected: { opening: "\\esb", attributes: " \\cat Cultural\\cat*", closing: "\\esbe" },
  },
  {
    name: "sidebar with no category",
    tag: "sidebar",
    marker: "esb",
    unknownAttributes: undefined,
    expected: { opening: "\\esb", attributes: "", closing: "\\esbe" },
  },
  {
    name: "periph renders 'alt' as text content after the marker, 'id' as a named pair",
    tag: "periph",
    marker: undefined,
    unknownAttributes: { alt: "Title Page", id: "titlepage" },
    expected: { opening: "\\periph Title Page", attributes: '|id="titlepage"', closing: "" },
  },
  {
    name: "ref is a generated wrapper with no USFM bytes of its own",
    tag: "ref",
    marker: undefined,
    unknownAttributes: { loc: "MRK 9:50", gen: "true" },
    expected: { opening: "", attributes: "", closing: "" },
  },
];

describe("unknownDisplayParts", () => {
  it.each(cases)("$name", ({ tag, marker, unknownAttributes, expected }) => {
    expect(unknownDisplayParts(tag, marker, unknownAttributes)).toEqual(expected);
  });
});
