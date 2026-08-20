import { corpusFixtures } from "./corpus-data";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../editor-usj.adaptor";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedEditorState, SerializedLexicalNode } from "lexical";
import {
  isSerializedAttributeRunNode,
  isSerializedImmutableTableCellNode,
  isSerializedImmutableTableNode,
  isSerializedImmutableTableRowNode,
  isSerializedImmutableTypedTextNode,
  isSerializedMarkerNode,
  isSerializedMilestoneNode,
  isSerializedParaNode,
  isSerializedTextNode,
  isSerializedUnknownNode,
  NBSP,
  SerializedParaNode,
  SerializedUnknownNode,
} from "shared";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  isSomeSerializedVerseNode,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  ViewOptions,
} from "shared-react";

const standardViewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!standardViewOptions) throw new Error("standard view options not found");

// The named view modes, plus standard view with expanded notes — the combination that made
// getViewMode return undefined and silently disabled the standard-view whitespace machinery. The
// label doubles as the `skipModes` key prefix (`<label>: <reason>`).
const VIEW_CONFIGS: { label: string; viewOptions: ViewOptions | undefined }[] = [
  { label: STANDARD_VIEW_MODE, viewOptions: standardViewOptions },
  { label: FORMATTED_VIEW_MODE, viewOptions: getViewOptions(FORMATTED_VIEW_MODE) },
  { label: UNFORMATTED_VIEW_MODE, viewOptions: getViewOptions(UNFORMATTED_VIEW_MODE) },
  {
    label: PARAGRAPH_STRUCTURE_VIEW_MODE,
    viewOptions: getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
  },
  { label: "standard-expanded", viewOptions: { ...standardViewOptions, noteMode: "expanded" } },
];

// This file carries the two halves of the corpus guarantee:
// 1. IDENTITY (the round-trip suite below): serialize -> deserialize returns the input USJ.
// 2. FORWARD ANCHORS (the anchor suite at the bottom): the serialized editor state itself has
//    the hand-verified shape. Identity alone is blind to COMPENSATING bugs — a serializer bug
//    mirrored by a deserializer bug (e.g. both swapping a tag name) still round-trips
//    perfectly — so the anchors pin the intermediate state where such a corruption shows.
describe("corpus round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize(undefined, undefined);
  });

  for (const fixture of corpusFixtures) {
    for (const { label, viewOptions } of VIEW_CONFIGS) {
      const skip = fixture.skipModes?.find((entry) => entry.startsWith(`${label}:`));
      const run = skip ? it.skip : it;
      run(`${fixture.name} [${label}]${skip ? ` (${skip})` : ""}`, () => {
        const usj = usxStringToUsj(fixture.usx);
        reset();
        initializeDeserialize(undefined);
        const editorState = serializeEditorState(usj, viewOptions);
        const roundTripped = deserializeSerializedEditorState(editorState, viewOptions);
        expect(roundTripped).toEqual(usj);
      });
    }
  }
});

describe("corpus forward anchors (standard view)", () => {
  // Every expected value below is hand-verified against the fixture's USX, never computed via
  // the adaptor: these anchors exist precisely to catch the adaptor pair drifting together.

  /** Serialize a corpus fixture (by name) once in standard view. */
  function serializeFixture(name: string): SerializedEditorState {
    const fixture = corpusFixtures.find((entry) => entry.name === name);
    if (!fixture) throw new Error(`Fixture not found: ${name}`);
    initializeSerialize(undefined, undefined);
    reset();
    return serializeEditorState(usxStringToUsj(fixture.usx), standardViewOptions);
  }

  /** The first unknown node among root children or one level down inside a para. */
  function findUnknownNode(state: SerializedEditorState): SerializedUnknownNode {
    for (const child of state.root.children) {
      if (isSerializedUnknownNode(child)) return child;
      if (isSerializedParaNode(child)) {
        const unknown = child.children.find((node) => isSerializedUnknownNode(node));
        if (isSerializedUnknownNode(unknown)) return unknown;
      }
    }
    throw new Error("No unknown node found");
  }

  /** Whether `node` is the NBSP separator an editable marker glyph is followed by. */
  function isMarkerSeparator(node: SerializedLexicalNode): boolean {
    const state = (node as { $?: { textType?: string } }).$;
    return state?.textType === "marker-trailing-space";
  }

  /**
   * The DATA children of a node — what round-trips back to USJ — with the engine-owned display
   * decoration stripped: the opening/closing glyphs, their NBSP separators, attribute runs, and
   * real-USFM token pieces that editable marker modes render for unknown kinds. Those display
   * shapes are pinned byte-exactly in usj-editor-adaptor.test.ts; these anchors are about the DATA
   * surviving the trip, so they read through the decoration rather than restating it.
   */
  function dataChildren(children: SerializedLexicalNode[]): SerializedLexicalNode[] {
    return children.filter(
      (child) =>
        !isSerializedMarkerNode(child) &&
        !isSerializedAttributeRunNode(child) &&
        !isSerializedImmutableTypedTextNode(child) &&
        !isMarkerSeparator(child),
    );
  }

  /** The first body para (marker "p") among root children. */
  function findBodyPara(state: SerializedEditorState): SerializedParaNode {
    const para = state.root.children.find(
      (child) => isSerializedParaNode(child) && child.marker === "p",
    );
    if (!isSerializedParaNode(para)) throw new Error("No body para found");
    return para;
  }

  it("table: rows and cells load as their own immutable table nodes, cell text token-mode", () => {
    const state = serializeFixture("table with header and cells");

    // Tables are NOT unknown nodes: the adaptor builds dedicated ImmutableTable* nodes for
    // table/table:row/table:cell, so none of them reaches the unknown path. The table also rides
    // at root level rather than inside the body paragraph.
    const table = state.root.children.find((child) => isSerializedImmutableTableNode(child));
    if (!isSerializedImmutableTableNode(table)) throw new Error("No immutable table node found");
    const rows = dataChildren(table.children).map((row) => {
      if (!isSerializedImmutableTableRowNode(row))
        throw new Error("Table row is not an immutable table row node");
      return {
        marker: row.marker,
        cells: dataChildren(row.children).map((cell) => {
          if (!isSerializedImmutableTableCellNode(cell))
            throw new Error("Table cell is not an immutable table cell node");
          // The cell's own USFM bytes (its opening glyph and the space after it) are display, so
          // read the cell's CONTENT as the text its data children carry.
          const text = dataChildren(cell.children)
            .map((child) => (isSerializedTextNode(child) ? child.text : ""))
            .join("")
            .trim();
          if (!text) throw new Error("Table cell has no text");
          return { marker: cell.marker, align: cell.align, text };
        }),
      };
    });
    expect(rows).toEqual([
      {
        marker: "tr",
        cells: [
          { marker: "th1", align: "start", text: "Day" },
          { marker: "th2", align: "start", text: "Tribe" },
        ],
      },
      {
        marker: "tr",
        cells: [
          { marker: "tc1", align: "start", text: "First" },
          { marker: "tc2", align: "start", text: "Judah" },
        ],
      },
    ]);
  });

  it("figure: attributes ride along and the caption is token-mode text", () => {
    const state = serializeFixture("figure (USFM 3 attributes)");

    const figure = findUnknownNode(state);
    expect(figure.tag).toBe("figure");
    expect(figure.marker).toBe("fig");
    expect(figure.unknownAttributes).toEqual({ file: "cn01617.jpg", size: "span", ref: "1:31" });
    const figureData = dataChildren(figure.children);
    expect(figureData).toHaveLength(1);
    const [caption] = figureData;
    if (!isSerializedTextNode(caption)) throw new Error("Figure has no caption text");
    expect(caption.text).toBe("At once they left their nets.");
    expect(caption.mode).toBe("token");
  });

  it("sidebar: block content loads as a real para with the editable glyph prefix", () => {
    const state = serializeFixture("sidebar (esb)");

    const sidebar = findUnknownNode(state);
    expect(sidebar.tag).toBe("sidebar");
    expect(sidebar.marker).toBe("esb");
    expect(sidebar.unknownAttributes).toEqual({ category: "History" });
    const sidebarData = dataChildren(sidebar.children);
    expect(sidebarData).toHaveLength(1);
    const [innerPara] = sidebarData;
    if (!isSerializedParaNode(innerPara)) throw new Error("Sidebar content is not a para");
    expect(innerPara.marker).toBe("p");
    // The inner para is a REAL paragraph — [glyph, NBSP separator] prefix plus normal-mode
    // text — not token text like an unknown node's own direct text children.
    expect(innerPara.children).toHaveLength(3);
    const [glyph, separator, text] = innerPara.children;
    if (!isSerializedMarkerNode(glyph)) throw new Error("Sidebar para has no glyph");
    expect(glyph.marker).toBe("p");
    expect(glyph.markerSyntax).toBe("opening");
    if (!isSerializedTextNode(separator)) throw new Error("Sidebar para has no separator");
    expect(separator.text).toBe(NBSP);
    expect(separator.mode).toBe("token");
    if (!isSerializedTextNode(text)) throw new Error("Sidebar para has no text");
    expect(text.text).toBe("Sidebar paragraph content.");
    expect(text.mode).toBe("normal");
  });

  it("milestones: each ms loads in place with an opening glyph and the bare `\\*` terminator", () => {
    const state = serializeFixture("milestones (ts)");

    const para = findBodyPara(state);
    // Editable marker modes group each milestone's display pieces into ONE attribute-run wrapper
    // riding after the milestone node; flatten it so this anchor still reads the glyph sequence
    // in document order.
    const shapes = para.children
      .flatMap((node) => (isSerializedAttributeRunNode(node) ? node.children : [node]))
      .map((node) => {
        if (isSerializedMilestoneNode(node)) return { kind: "ms", marker: node.marker };
        if (isSerializedMarkerNode(node))
          return { kind: "glyph", marker: node.marker, markerSyntax: node.markerSyntax };
        if (isSomeSerializedVerseNode(node)) return { kind: "verse", number: node.number };
        if (isSerializedTextNode(node)) return { kind: "text", text: node.text };
        throw new Error(`Unexpected node type '${node.type}'`);
      });
    expect(shapes).toEqual([
      { kind: "glyph", marker: "p", markerSyntax: "opening" },
      { kind: "text", text: NBSP },
      { kind: "ms", marker: "ts-s" },
      { kind: "glyph", marker: "ts-s", markerSyntax: "opening" },
      { kind: "glyph", marker: "", markerSyntax: "selfClosing" },
      { kind: "verse", number: "1" },
      { kind: "text", text: "Translator section text." },
      { kind: "ms", marker: "ts-e" },
      { kind: "glyph", marker: "ts-e", markerSyntax: "opening" },
      { kind: "glyph", marker: "", markerSyntax: "selfClosing" },
    ]);
  });

  it("optbreak: loads as an empty unknown node between its text halves", () => {
    const state = serializeFixture("optional line break (optbreak)");

    const para = findBodyPara(state);
    const optbreakIndex = para.children.findIndex((node) => isSerializedUnknownNode(node));
    const optbreak = para.children[optbreakIndex];
    if (!isSerializedUnknownNode(optbreak)) throw new Error("No optbreak unknown node found");
    expect(optbreak.tag).toBe("optbreak");
    expect(optbreak.marker).toBeUndefined();
    // No data content of its own — the `//` it renders in editable modes is display, not data.
    expect(dataChildren(optbreak.children)).toEqual([]);
    // Position matters: the break must sit BETWEEN the two text halves, not before or after.
    const before = para.children[optbreakIndex - 1];
    if (!isSerializedTextNode(before)) throw new Error("No text before the optbreak");
    expect(before.text).toBe("First part");
    const after = para.children[optbreakIndex + 1];
    if (!isSerializedTextNode(after)) throw new Error("No text after the optbreak");
    expect(after.text).toBe("second part.");
  });

  it("ref: loads as an unknown node keeping loc and token-mode target text", () => {
    const state = serializeFixture("cross-reference ref target");

    const ref = findUnknownNode(state);
    expect(ref.tag).toBe("ref");
    expect(ref.marker).toBeUndefined();
    expect(ref.unknownAttributes).toEqual({ loc: "GEN 1:1" });
    expect(ref.children).toHaveLength(1);
    const [target] = ref.children;
    if (!isSerializedTextNode(target)) throw new Error("Ref has no target text");
    expect(target.text).toBe("Genesis 1:1");
    expect(target.mode).toBe("token");
  });
});
