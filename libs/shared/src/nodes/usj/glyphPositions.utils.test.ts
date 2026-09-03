import { $createCharNode } from "./CharNode.js";
import { $isGlyphTextNode, $normalizeSelectionOutOfGlyphText } from "./glyphPositions.utils.js";
import { $createMarkerNode } from "../features/MarkerNode.js";
import { NBSP } from "./node-constants.js";
import { $createMarkerTrailingSeparator, getVisibleOpenMarkerText } from "./node.utils.js";
import { $createParaNode } from "./ParaNode.js";
import { $createVerseNode } from "./VerseNode.js";
import { textTypeState } from "../collab/delta.state.js";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $setState,
  LexicalEditor,
  RangeSelection,
  TextNode,
} from "lexical";
import { describe, expect, it } from "vitest";
import { createBasicTestEnvironment } from "./test.utils.js";

/**
 * The point spelling `$normalizeSelectionOutOfGlyphText` committed, captured as plain values
 * inside the update — node methods are only legal there, and a key identifies the node exactly.
 */
interface PointReport {
  key: string;
  offset: number;
  text: string;
  isGlyph: boolean;
}

/**
 * Run the normalizer over a selection built by `$select`, and report both points by NODE — not by
 * offset alone, so a point that silently fell somewhere else cannot read as a pass.
 */
function normalize(
  editor: LexicalEditor,
  $select: () => void,
): { moved: boolean; anchor: PointReport; focus: PointReport } {
  let moved = false;
  let anchor!: PointReport;
  let focus!: PointReport;
  editor.update(
    () => {
      $select();
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection");
      moved = $normalizeSelectionOutOfGlyphText(selection);
      anchor = $reportPoint(selection.anchor.getNode() as TextNode, selection.anchor.offset);
      focus = $reportPoint(selection.focus.getNode() as TextNode, selection.focus.offset);
    },
    { discrete: true },
  );
  return { moved, anchor, focus };
}

function $reportPoint(node: TextNode, offset: number): PointReport {
  return {
    key: node.getKey(),
    offset,
    text: node.getTextContent(),
    isGlyph: $isGlyphTextNode(node),
  };
}

function $selectRange(
  anchorNode: TextNode,
  anchorOffset: number,
  focusNode: TextNode,
  focusOffset: number,
): RangeSelection {
  const selection = $createRangeSelection();
  selection.anchor.set(anchorNode.getKey(), anchorOffset, "text");
  selection.focus.set(focusNode.getKey(), focusOffset, "text");
  $setSelection(selection);
  return selection;
}

describe("$isGlyphTextNode", () => {
  it("holds for every text node whose bytes are a picture of its own state", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const glyph = $createMarkerNode("p");
        const separator = $createMarkerTrailingSeparator();
        const verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
        const content = $createTextNode("In the beginning");
        const attributeRun = $createTextNode('|gloss="x"');
        $setState(attributeRun, textTypeState, "attribute");
        const para = $createParaNode("p");
        $getRoot().append(para.append(glyph, separator, verse, content, attributeRun));

        expect($isGlyphTextNode(glyph)).toBe(true);
        expect($isGlyphTextNode(separator)).toBe(true);
        expect($isGlyphTextNode(verse)).toBe(true);
        expect($isGlyphTextNode(attributeRun)).toBe(true);
        // Document content, and the element holding all of it, are not.
        expect($isGlyphTextNode(content)).toBe(false);
        expect($isGlyphTextNode(para)).toBe(false);
      },
      { discrete: true },
    );
  });
});

describe("$normalizeSelectionOutOfGlyphText at a collapsed caret", () => {
  /** `\p ` + `\v 5 ` + "In the beginning". */
  function buildVersePara() {
    const { editor } = createBasicTestEnvironment();
    let verse!: TextNode;
    let content!: TextNode;
    editor.update(
      () => {
        verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
        content = $createTextNode("In the beginning");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p"),
            $createMarkerTrailingSeparator(),
            verse,
            content,
          ),
        );
      },
      { discrete: true },
    );
    let verseText = "";
    editor.getEditorState().read(() => (verseText = verse.getTextContent()));
    return { editor, verse, content, verseText };
  }

  it.each([1, 2, 3, 4])("resolves interior offset %i to the glyph's trailing end", (offset) => {
    const { editor, verse, verseText } = buildVersePara();

    const { moved, anchor, focus } = normalize(editor, () => verse.select(offset, offset));

    expect(moved).toBe(true);
    expect(anchor.key).toBe(verse.getKey());
    expect(anchor.offset).toBe(verseText.length);
    expect(focus.offset).toBe(anchor.offset);
  });

  it.each([0, 5])("leaves the glyph's own end at offset %i alone", (offset) => {
    const { editor, verse } = buildVersePara();

    const { moved, anchor } = normalize(editor, () => verse.select(offset, offset));

    expect(moved).toBe(false);
    expect(anchor.key).toBe(verse.getKey());
    expect(anchor.offset).toBe(offset);
  });

  it("leaves a caret in ordinary content alone", () => {
    const { editor, content } = buildVersePara();

    const { moved, anchor } = normalize(editor, () => content.select(3, 3));

    expect(moved).toBe(false);
    expect(anchor.key).toBe(content.getKey());
    expect(anchor.offset).toBe(3);
  });

  it("resolves a caret inside a closing glyph to its trailing end", () => {
    const { editor } = createBasicTestEnvironment();
    let closer!: TextNode;
    editor.update(
      () => {
        closer = $createMarkerNode("add", "closing");
        $getRoot().append(
          $createParaNode("p").append(
            $createCharNode("add").append(
              $createMarkerNode("add"),
              $createTextNode(`${NBSP}word`),
              closer,
            ),
          ),
        );
      },
      { discrete: true },
    );

    const { moved, anchor } = normalize(editor, () => closer.select(2, 2));

    expect(moved).toBe(true);
    expect(anchor.key).toBe(closer.getKey());
    expect(anchor.offset).toBe("\\add*".length);
  });
});

describe("$normalizeSelectionOutOfGlyphText over a range", () => {
  /** `\p ` + `\add one two\add*`, with every piece handed back. */
  function buildSpanPara() {
    const { editor } = createBasicTestEnvironment();
    let prefix!: TextNode;
    let opener!: TextNode;
    let content!: TextNode;
    let closer!: TextNode;
    editor.update(
      () => {
        prefix = $createMarkerNode("p");
        opener = $createMarkerNode("add");
        content = $createTextNode(`${NBSP}one two`);
        closer = $createMarkerNode("add", "closing");
        $getRoot().append(
          $createParaNode("p").append(
            prefix,
            $createMarkerTrailingSeparator(),
            $createCharNode("add").append(opener, content, closer),
          ),
        );
      },
      { discrete: true },
    );
    let contentText = "";
    let openerText = "";
    let closerText = "";
    editor.getEditorState().read(() => {
      contentText = content.getTextContent();
      openerText = opener.getTextContent();
      closerText = closer.getTextContent();
    });
    return { editor, prefix, opener, content, closer, contentText, openerText, closerText };
  }

  it.each([0, 4])(
    "steps a range START off the opening glyph named at offset %i",
    (anchorOffset) => {
      const { editor, opener, content } = buildSpanPara();

      const { moved, anchor, focus } = normalize(editor, () =>
        $selectRange(opener, anchorOffset, content, 4),
      );

      expect(moved).toBe(true);
      expect(anchor.key).toBe(content.getKey());
      expect(anchor.offset).toBe(0);
      expect(focus.key).toBe(content.getKey());
      expect(focus.offset).toBe(4);
    },
  );

  it("leaves a range START that sits between two of the glyph's bytes alone", () => {
    const { editor, opener, content } = buildSpanPara();

    const { moved, anchor } = normalize(editor, () => $selectRange(opener, 2, content, 4));

    expect(moved).toBe(false);
    expect(anchor.key).toBe(opener.getKey());
    expect(anchor.offset).toBe(2);
  });

  it("steps a range END back off the closing glyph", () => {
    const { editor, content, closer, contentText, closerText } = buildSpanPara();

    const { moved, focus } = normalize(editor, () =>
      $selectRange(content, 1, closer, closerText.length),
    );

    expect(moved).toBe(true);
    expect(focus.key).toBe(content.getKey());
    expect(focus.offset).toBe(contentText.length);
  });

  it("declines when the walk cannot reach a position that is not a glyph", () => {
    // The paragraph prefix is a glyph followed by its separator, and past the separator is the
    // char span — an element. There is no sibling text position left that is not display bytes, so
    // the range stays exactly as the user made it rather than trading one glyph for another.
    const { editor, prefix, content } = buildSpanPara();

    const { moved, anchor } = normalize(editor, () => $selectRange(prefix, 0, content, 4));

    expect(moved).toBe(false);
    expect(anchor.key).toBe(prefix.getKey());
    expect(anchor.offset).toBe(0);
  });

  it("steps over a RUN of adjacent glyphs, not just the first", () => {
    // Same prefix, but with plain content after it: the walk has to cross BOTH the `\p` glyph and
    // its separator to reach a position that is not display bytes.
    const { editor } = createBasicTestEnvironment();
    let prefix!: TextNode;
    let body!: TextNode;
    editor.update(
      () => {
        prefix = $createMarkerNode("p");
        body = $createTextNode("In the beginning");
        $getRoot().append(
          $createParaNode("p").append(prefix, $createMarkerTrailingSeparator(), body),
        );
      },
      { discrete: true },
    );

    const { moved, anchor } = normalize(editor, () => $selectRange(prefix, 0, body, 3));

    expect(moved).toBe(true);
    expect(anchor.key).toBe(body.getKey());
    expect(anchor.offset).toBe(0);
    expect(anchor.isGlyph).toBe(false);
  });

  it("keeps the START and END roles of a BACKWARD range straight", () => {
    const { editor, opener, content } = buildSpanPara();

    const { moved, anchor, focus } = normalize(editor, () =>
      // Anchor after the focus: the range's START is the FOCUS, and it is the point on the glyph.
      $selectRange(content, 4, opener, 4),
    );

    expect(moved).toBe(true);
    expect(focus.key).toBe(content.getKey());
    expect(focus.offset).toBe(0);
    expect(anchor.key).toBe(content.getKey());
    expect(anchor.offset).toBe(4);
  });

  it("abandons the trim whole when both ends name the same glyph", () => {
    // A selection of exactly one glyph has no inward position left to step to; inverting the range
    // would be worse than leaving it, so nothing moves.
    const { editor, opener, openerText } = buildSpanPara();

    const { moved, anchor, focus } = normalize(editor, () =>
      $selectRange(opener, 0, opener, openerText.length),
    );

    expect(moved).toBe(false);
    expect(anchor.key).toBe(opener.getKey());
    expect(anchor.offset).toBe(0);
    expect(focus.key).toBe(opener.getKey());
    expect(focus.offset).toBe(openerText.length);
  });
});
