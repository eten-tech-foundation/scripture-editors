import { initialize, serializeEditorState } from "./usj-editor.adaptor";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedLexicalNode } from "lexical";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isSerializedImpliedParaNode,
  isSerializedParaNode,
  isSerializedVerseBlockNode,
  SerializedParaNode,
  SerializedVerseBlockNode,
} from "shared";
import { BLOCK_VERSE_VIEW_MODE, getViewOptions, isSomeSerializedVerseNode } from "shared-react";

const blockVerseOptions = getViewOptions(BLOCK_VERSE_VIEW_MODE);

/** Builds a chapter of USJ around the given content, so each test reads as just its own case. */
function usjChapter(...content: Usj["content"]): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
      { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
      ...content,
    ],
  };
}

function $groupUsj(usj: Usj): SerializedLexicalNode[] {
  return serializeEditorState(usj, blockVerseOptions).root.children;
}

/** The verse blocks in document order, so assertions ignore the surrounding book/chapter chrome. */
function verseBlocksIn(children: SerializedLexicalNode[]): SerializedVerseBlockNode[] {
  return children.filter(isSerializedVerseBlockNode);
}

/** The para markers of a block's paragraphs, e.g. `["q1", "q2"]`. */
function paraMarkersIn(verseBlock: SerializedVerseBlockNode): string[] {
  return verseBlock.children.map((child) =>
    isSerializedParaNode(child) ? child.marker : child.type,
  );
}

/** All text under a node, joined, so text placement can be asserted without walking the tree. */
function textIn(node: SerializedLexicalNode): string {
  const { text, children } = node as { text?: string; children?: SerializedLexicalNode[] };
  if (typeof text === "string") return text;
  if (!Array.isArray(children)) return "";
  return children.map(textIn).join("");
}

describe("groupVersesIntoBlocks", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("gives each verse in a paragraph its own block, in document order", () => {
    const children = $groupUsj(
      usjChapter({
        type: "para",
        marker: "p",
        content: [
          { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
          "the first verse ",
          { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
          "the second verse ",
        ],
      }),
    );

    const verseBlocks = verseBlocksIn(children);
    expect(verseBlocks.map((verseBlock) => verseBlock.number)).toEqual(["1", "2"]);
    expect(textIn(verseBlocks[0])).toContain("the first verse");
    expect(textIn(verseBlocks[0])).not.toContain("the second verse");
    expect(textIn(verseBlocks[1])).toContain("the second verse");
  });

  it("keeps a verse's poetry lines as separate paragraphs inside its block", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "q1",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "first line "],
        },
        { type: "para", marker: "q2", content: ["second line "] },
      ),
    );

    const [verseBlock] = verseBlocksIn(children);
    expect(paraMarkersIn(verseBlock)).toEqual(["q1", "q2"]);
    expect(textIn(verseBlock)).toContain("first line");
    expect(textIn(verseBlock)).toContain("second line");
  });

  it("collects a verse that continues into the next paragraph", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "starts here "],
        },
        { type: "para", marker: "p", content: ["and continues "] },
      ),
    );

    const verseBlocks = verseBlocksIn(children);
    expect(verseBlocks).toHaveLength(1);
    expect(verseBlocks[0].children).toHaveLength(2);
    expect(textIn(verseBlocks[0])).toContain("and continues");
  });

  // A bridged verse is one node spanning rows; emitting it once per covered number would duplicate
  // its text down the passage.
  it("emits a bridged verse once, carrying its whole range", () => {
    const children = $groupUsj(
      usjChapter({
        type: "para",
        marker: "p",
        content: [
          { type: "verse", marker: "v", number: "14-15", sid: "MAT 17:14-15" },
          "the bridged verse ",
        ],
      }),
    );

    const verseBlocks = verseBlocksIn(children);
    expect(verseBlocks).toHaveLength(1);
    expect(verseBlocks[0]).toMatchObject({ number: "14-15", start: 14, end: 15 });
    expect(textIn(verseBlocks[0]).match(/the bridged verse/g)).toHaveLength(1);
  });

  // Never destroy information at the model layer: whether an aligned view shows, hides, or spans a
  // heading is a view-layer decision, so the heading has to survive as an ordinary paragraph.
  it("keeps a section heading between blocks rather than inside one", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "before "],
        },
        { type: "para", marker: "s1", content: ["A section heading"] },
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "2", sid: "GEN 1:2" }, "after "],
        },
      ),
    );

    const heading = children.find(
      (child) => isSerializedParaNode(child) && child.marker === "s1",
    ) as SerializedParaNode;
    expect(heading).toBeDefined();
    expect(textIn(heading)).toContain("A section heading");
    verseBlocksIn(children).forEach((verseBlock) => {
      expect(paraMarkersIn(verseBlock)).not.toContain("s1");
    });
  });

  it("closes the open verse at a heading so it does not absorb later content", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "before "],
        },
        { type: "para", marker: "s1", content: ["A section heading"] },
        { type: "para", marker: "p", content: ["orphan text "] },
      ),
    );

    const [verseBlock] = verseBlocksIn(children);
    expect(textIn(verseBlock)).not.toContain("orphan text");
  });

  // Content before any verse - a psalm descriptor, an intro line - is not a verse, so no block is
  // invented for it.
  it("leaves pre-verse content as a paragraph outside any block", () => {
    const children = $groupUsj(
      usjChapter(
        { type: "para", marker: "d", content: ["A psalm of David"] },
        {
          type: "para",
          marker: "p",
          content: [
            { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
            "the first verse ",
          ],
        },
      ),
    );

    const descriptor = children.find(
      (child) => isSerializedParaNode(child) && child.marker === "d",
    ) as SerializedParaNode;
    expect(descriptor).toBeDefined();
    expect(textIn(descriptor)).toContain("A psalm of David");
    expect(verseBlocksIn(children).map((verseBlock) => verseBlock.number)).toEqual(["1"]);
  });

  it("closes the open verse at a chapter marker", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "chapter one "],
        },
        { type: "chapter", marker: "c", number: "2", sid: "GEN 2" },
        { type: "para", marker: "p", content: ["chapter two intro "] },
      ),
    );

    const [verseBlock] = verseBlocksIn(children);
    expect(textIn(verseBlock)).not.toContain("chapter two intro");
  });

  // An implied paragraph has no marker; rebuilding fragments field-by-field would turn it into a
  // real `\p` the source USJ never had.
  it("keeps an implied paragraph implied when it is split", () => {
    const children = $groupUsj(
      usjChapter({ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "loose verse text "),
    );

    const [verseBlock] = verseBlocksIn(children);
    expect(verseBlock.children.every(isSerializedImpliedParaNode)).toBe(true);
    expect(textIn(verseBlock)).toContain("loose verse text");
  });

  // A table is not a boundary. Treating it as one would leave the continuation paragraph - which
  // has no verse marker of its own - outside every block, so its text would never reach a row.
  it("keeps a table and the text after it inside the open verse", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "before table "],
        },
        {
          type: "table",
          content: [
            {
              type: "table:row",
              marker: "tr",
              content: [{ type: "table:cell", marker: "tc1", content: ["cell text"] }],
            },
          ],
        },
        { type: "para", marker: "p", content: ["after table "] },
      ),
    );

    const verseBlocks = verseBlocksIn(children);
    expect(verseBlocks).toHaveLength(1);
    expect(textIn(verseBlocks[0])).toContain("cell text");
    expect(textIn(verseBlocks[0])).toContain("after table");
  });

  // `` is a stanza break with no content. Dropping empty paragraphs would delete it from the
  // document and shift every root index after it.
  it("keeps an empty paragraph rather than dropping it", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "q1",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "first line "],
        },
        { type: "para", marker: "b" },
        {
          type: "para",
          marker: "q1",
          content: [{ type: "verse", marker: "v", number: "2", sid: "GEN 1:2" }, "second line "],
        },
      ),
    );

    const stanzaBreaks = [
      ...children,
      ...verseBlocksIn(children).flatMap((b) => b.children),
    ].filter((node) => isSerializedParaNode(node) && node.marker === "b");
    expect(stanzaBreaks).toHaveLength(1);
  });

  it("closes the open verse at a semantic divider", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "before "],
        },
        { type: "para", marker: "sd2", content: ["  "] },
        { type: "para", marker: "p", content: ["after the divider "] },
      ),
    );

    const [verseBlock] = verseBlocksIn(children);
    expect(textIn(verseBlock)).not.toContain("after the divider");
  });

  // A sidebar is not a paragraph, so an earlier version closed the block on it and left the rest
  // of the verse outside every block. Any container that is not chrome has to stay with the verse.
  it("keeps a sidebar and the text after it inside the open verse", () => {
    const children = $groupUsj(
      usjChapter(
        {
          type: "para",
          marker: "p",
          content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "before sidebar "],
        },
        {
          type: "sidebar",
          marker: "esb",
          content: [{ type: "para", marker: "p", content: ["aside text"] }],
        },
        { type: "para", marker: "p", content: ["after sidebar "] },
      ),
    );

    const verseBlocks = verseBlocksIn(children);
    expect(verseBlocks).toHaveLength(1);
    expect(textIn(verseBlocks[0])).toContain("after sidebar");
  });

  // Verses inside a table or sidebar cannot each own a row, so they are reported rather than
  // silently absorbed.
  it("warns when a container holds verses that cannot be grouped", () => {
    const logger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
    initialize(undefined, logger);

    serializeEditorState(
      usjChapter({
        type: "table",
        content: [
          {
            type: "table:row",
            marker: "tr",
            content: [
              {
                type: "table:cell",
                marker: "tc1",
                content: [{ type: "verse", marker: "v", number: "3", sid: "EZR 2:3" }, "Parosh"],
              },
            ],
          },
        ],
      }),
      blockVerseOptions,
    );

    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("not grouped into blocks"));
    initialize(undefined, undefined);
  });

  it("keeps the verse marker as the first content of its block", () => {
    const children = $groupUsj(
      usjChapter({
        type: "para",
        marker: "p",
        content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "the first verse "],
      }),
    );

    const [verseBlock] = verseBlocksIn(children);
    const firstPara = verseBlock.children[0] as SerializedParaNode;
    expect(isSomeSerializedVerseNode(firstPara.children[0])).toBe(true);
  });

  it("leaves the inline layouts ungrouped", () => {
    const usj = usjChapter({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "1", sid: "GEN 1:1" }, "the first verse "],
    });

    const children = serializeEditorState(usj).root.children;

    expect(verseBlocksIn(children)).toHaveLength(0);
  });
});
