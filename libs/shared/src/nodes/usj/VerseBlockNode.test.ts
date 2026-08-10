import { $createParaNode, ParaNode } from "./ParaNode.js";
import { withEditor } from "./test.utils.js";
import {
  $createVerseBlockNode,
  $isVerseBlockNode,
  isSerializedVerseBlockNode,
  VERSE_BLOCK_CLASS_NAME,
  VerseBlockNode,
} from "./VerseBlockNode.js";
import { $createTextNode } from "lexical";
import { describe, expect, it } from "vitest";

const nodes = [VerseBlockNode, ParaNode];

describe("VerseBlockNode", () => {
  it("has type 'verse-block'", () => {
    expect(VerseBlockNode.getType()).toBe("verse-block");
  });

  it("renders a <div> carrying the verse number and its range", () => {
    withEditor(nodes, () => {
      const dom = $createVerseBlockNode("5").createDOM();

      expect(dom.tagName).toBe("DIV");
      expect(dom.classList.contains(VERSE_BLOCK_CLASS_NAME)).toBe(true);
      expect(dom.getAttribute("data-verse-number")).toBe("5");
      expect(dom.getAttribute("data-verse-start")).toBe("5");
      expect(dom.getAttribute("data-verse-end")).toBe("5");
    });
  });

  // A bridged verse is one node spanning rows, never one node per covered number, so a layout
  // needs both bounds to place it.
  it("exposes both bounds of a bridged verse", () => {
    withEditor(nodes, () => {
      const verseBlock = $createVerseBlockNode("14-15");

      expect(verseBlock.getRange()).toEqual({ start: 14, end: 15 });
      expect(verseBlock.createDOM().getAttribute("data-verse-start")).toBe("14");
      expect(verseBlock.createDOM().getAttribute("data-verse-end")).toBe("15");
    });
  });

  it("omits the range attributes for a non-numeric verse number", () => {
    withEditor(nodes, () => {
      const dom = $createVerseBlockNode("abc").createDOM();

      expect(dom.getAttribute("data-verse-number")).toBe("abc");
      expect(dom.getAttribute("data-verse-start")).toBeNull();
      expect(dom.getAttribute("data-verse-end")).toBeNull();
    });
  });

  // The range is derived from the number, so a number that has no range must not leave the
  // previous one behind on the element for a layout to read as this verse's.
  it("clears the range attributes when the verse number stops being numeric", () => {
    withEditor(nodes, () => {
      // Two distinct nodes, which is what Lexical hands `updateDOM`. Mutating one node in place
      // would not work here: a node created in the same update is already writable, so `setNumber`
      // returns that same object and there would be no previous state to compare against.
      const previousBlock = $createVerseBlockNode("14-15");
      const dom = previousBlock.createDOM();
      const verseBlock = $createVerseBlockNode("abc");

      verseBlock.updateDOM(previousBlock, dom);

      expect(dom.getAttribute("data-verse-number")).toBe("abc");
      expect(dom.getAttribute("data-verse-start")).toBeNull();
      expect(dom.getAttribute("data-verse-end")).toBeNull();
    });
  });

  it("re-derives the range when the verse number is set", () => {
    withEditor(nodes, () => {
      const verseBlock = $createVerseBlockNode("5").setNumber("14-15");

      expect(verseBlock.getRange()).toEqual({ start: 14, end: 15 });
    });
  });

  // Poetry lines stay separate paragraphs inside the block, rather than being flattened into
  // line breaks, so their indentation still applies.
  it("holds paragraph children", () => {
    withEditor(nodes, () => {
      const verseBlock = $createVerseBlockNode("1");
      verseBlock.append(
        $createParaNode("q1").append($createTextNode("first line")),
        $createParaNode("q2").append($createTextNode("second line")),
      );

      expect(verseBlock.getChildrenSize()).toBe(2);
      expect(verseBlock.getChildren().map((child) => (child as ParaNode).getMarker())).toEqual([
        "q1",
        "q2",
      ]);
    });
  });

  it("reads as continuous text across its paragraphs", () => {
    withEditor(nodes, () => {
      const verseBlock = $createVerseBlockNode("1");
      verseBlock.append(
        $createParaNode("q1").append($createTextNode("first line")),
        $createParaNode("q2").append($createTextNode("second line")),
      );

      expect(verseBlock.getTextContent()).toContain("first line");
      expect(verseBlock.getTextContent()).toContain("second line");
    });
  });

  it("round-trips through JSON", () => {
    withEditor(nodes, () => {
      const json = $createVerseBlockNode("14-15").exportJSON();

      expect(isSerializedVerseBlockNode(json)).toBe(true);
      expect(json).toMatchObject({
        type: "verse-block",
        number: "14-15",
        start: 14,
        end: 15,
        version: 1,
      });

      const restored = VerseBlockNode.importJSON(json);
      expect($isVerseBlockNode(restored)).toBe(true);
      expect(restored.getNumber()).toBe("14-15");
      expect(restored.getRange()).toEqual({ start: 14, end: 15 });
    });
  });

  // Not a shadow root: a reader must be able to select and copy a passage that runs across
  // several verses, which a shadow root would cut at every block boundary.
  it("is not a shadow root", () => {
    withEditor(nodes, () => {
      expect($createVerseBlockNode("1").isShadowRoot()).toBe(false);
    });
  });
});
