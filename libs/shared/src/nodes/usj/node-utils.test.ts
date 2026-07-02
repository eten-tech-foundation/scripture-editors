import { $createMarkerNode } from "../features/MarkerNode.js";
import { $createTypedMarkNode, TypedMarkNode } from "../features/TypedMarkNode.js";
import { $createCharNode } from "./CharNode.js";
import { $createImmutableChapterNode } from "./ImmutableChapterNode.js";
import { usjBaseNodes } from "./index.js";
import {
  $getElementOffsetFromLogicalIndex,
  $getLogicalContentItems,
  $getLogicalIndexOfChild,
  $getLogicalParent,
  $getLogicalPointFromElementPoint,
  $getLogicalTextLocation,
  $getTextNodeAtLogicalOffset,
  $isSomeChapterNode,
  getNextVerse,
  getUnknownAttributes,
  isSelectionStartNodeExpectedError,
  isValidNumberedMarker,
  isVerseInRange,
  LogicalContentItem,
  LogicalTextItem,
  parseNumberFromMarkerText,
  removeNodeAndAfter,
  removeNodesBeforeNode,
} from "./node.utils.js";
import { NBSP } from "./node-constants.js";
import { $createParaNode } from "./ParaNode.js";
import { createBasicTestEnvironment } from "./test.utils.js";
import { $createVerseNode, VerseNode } from "./VerseNode.js";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getRoot,
  NodeKey,
  $createTextNode,
  $isElementNode,
  TextNode,
} from "lexical";

const nodes = [TypedMarkNode, ...usjBaseNodes];

describe("Editor Node Utilities", () => {
  describe("isValidNumberedMarker()", () => {
    it("should not throw", async () => {
      expect(() => isValidNumberedMarker(undefined as unknown as string, [""])).not.toThrow();
    });

    it("should identify a valid numbered marker", async () => {
      expect(isValidNumberedMarker("pi1", ["pi"])).toBe(true);
    });

    it("should not identify an invalid numbered marker", async () => {
      expect(isValidNumberedMarker("pi1", ["pa"])).toBe(false);
    });

    it("should not identify a non-numbered marker", async () => {
      expect(isValidNumberedMarker("pi", ["pi"])).toBe(false);
    });
  });

  describe("removeNodeAndAfter()", () => {
    let c1NodeKey: NodeKey;
    let c2NodeKey: NodeKey;
    let p1NodeKey: NodeKey;

    it("should not remove nodes after when no node to prune", () => {
      const { editor } = createBasicTestEnvironment();
      editor.update(
        () => {
          const root = $getRoot();
          const c1 = $createImmutableChapterNode("1");
          const p1 = $createParaNode();
          const c2 = $createImmutableChapterNode("2");
          const p2 = $createParaNode();
          root.append(c1, p1, c2, p2);
        },
        { discrete: true },
      );
      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();

        removeNodeAndAfter(children, undefined);

        expect(children).toBeDefined();
        expect(children.length).toBe(4);
      });
    });

    it("should remove nodes after", () => {
      const { editor } = createBasicTestEnvironment();
      editor.update(
        () => {
          const root = $getRoot();
          const c1 = $createImmutableChapterNode("1");
          const p1 = $createParaNode();
          const c2 = $createImmutableChapterNode("2");
          const p2 = $createParaNode();
          root.append(c1, p1, c2, p2);
          c1NodeKey = c1.getKey();
          c2NodeKey = c2.getKey();
          p1NodeKey = p1.getKey();
        },
        { discrete: true },
      );
      editor.getEditorState().read(() => {
        const children = $getRoot().getChildren();
        const c2 = $getNodeByKey(c2NodeKey) ?? undefined;
        if (!$isSomeChapterNode(c2)) throw new Error("chapter should be defined");

        removeNodeAndAfter(children, c2);

        expect(children).toBeDefined();
        expect(children.length).toBe(2);
        expect(children[0].getKey()).toBe(c1NodeKey);
        expect(children[1].getKey()).toBe(p1NodeKey);
      });
    });
  });

  describe("removeNodesBeforeNode()", () => {
    let c1NodeKey: NodeKey;
    let p1NodeKey: NodeKey;

    it("should not remove nodes before when no node to prune", () => {
      const { editor } = createBasicTestEnvironment();
      editor.update(
        () => {
          const root = $getRoot();
          const c1 = $createImmutableChapterNode("1");
          const p1 = $createParaNode();
          root.append(c1, p1);
          c1NodeKey = c1.getKey();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const updatedChildren = removeNodesBeforeNode($getRoot().getChildren(), undefined);

        expect(updatedChildren).toBeDefined();
        expect(updatedChildren.length).toBe(2);
        expect(updatedChildren[0].getKey()).toBe(c1NodeKey);
      });
    });

    it("should remove the chapter", () => {
      const { editor } = createBasicTestEnvironment();
      editor.update(
        () => {
          const root = $getRoot();
          const c1 = $createImmutableChapterNode("1");
          const p1 = $createParaNode();
          root.append(c1, p1);
          c1NodeKey = c1.getKey();
          p1NodeKey = p1.getKey();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const c1 = $getNodeByKey(c1NodeKey) ?? undefined;

        const updatedChildren = removeNodesBeforeNode($getRoot().getChildren(), c1);

        expect(updatedChildren).toBeDefined();
        expect(updatedChildren.length).toBe(1);
        expect(updatedChildren[0].getKey()).toBe(p1NodeKey);
      });
    });

    it("should remove both chapters", () => {
      const { editor } = createBasicTestEnvironment();
      editor.update(
        () => {
          const root = $getRoot();
          const c0 = $createImmutableChapterNode("0");
          const c1 = $createImmutableChapterNode("1");
          const p1 = $createParaNode();
          root.append(c0, c1, p1);
          c1NodeKey = c1.getKey();
          p1NodeKey = p1.getKey();
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const c1 = $getNodeByKey(c1NodeKey) ?? undefined;

        const updatedChildren = removeNodesBeforeNode($getRoot().getChildren(), c1);

        expect(updatedChildren).toBeDefined();
        expect(updatedChildren.length).toBe(1);
        expect(updatedChildren[0].getKey()).toBe(p1NodeKey);
      });
    });
  });

  describe("parseNumberFromMarkerText()", () => {
    it("should return the default if not found", () => {
      const marker = "";
      const text = "";
      const defaultNumber = "0";

      const number = parseNumberFromMarkerText(marker, text, defaultNumber);

      expect(number).toEqual("0");
    });

    it("should return the number if found", () => {
      const marker = "c";
      const text = "\\c 1 ";
      const defaultNumber = "0";

      const number = parseNumberFromMarkerText(marker, text, defaultNumber);

      expect(number).toEqual("1");
    });

    it("preserves verse bridges", () => {
      expect(parseNumberFromMarkerText("v", `\\v${NBSP}1-2 `, "9")).toBe("1-2");
    });

    it("preserves verse segments", () => {
      expect(parseNumberFromMarkerText("v", `\\v${NBSP}5a `, "9")).toBe("5a");
    });

    it("preserves segmented bridges", () => {
      expect(parseNumberFromMarkerText("v", `\\v${NBSP}1a-2b `, "9")).toBe("1a-2b");
    });

    it("preserves comma-separated verse lists", () => {
      expect(parseNumberFromMarkerText("v", `\\v${NBSP}1,3 `, "9")).toBe("1,3");
    });

    it("still parses plain integers with a regular space separator", () => {
      expect(parseNumberFromMarkerText("v", "\\v 12 ", "9")).toBe("12");
    });

    it("falls back to the default when no number is present", () => {
      expect(parseNumberFromMarkerText("v", `\\v${NBSP}`, "9")).toBe("9");
    });
  });

  describe("getUnknownAttributes()", () => {
    it("should return all unknown properties", () => {
      const unknownAttributes = getUnknownAttributes({
        type: "",
        marker: "",
        unknown: "unknown",
      } as MarkerObject);

      expect(unknownAttributes).toBeDefined();
      expect(unknownAttributes).toEqual({ unknown: "unknown" });
    });

    it("should return undefined when all properties are known", () => {
      const unknownAttributes = getUnknownAttributes({ type: "", marker: "" });

      expect(unknownAttributes).toBeUndefined();
    });

    it("should return properties for other types", () => {
      const unknownAttributes = getUnknownAttributes({ style: "style", unknown: "unknown" }, [
        "style",
      ]);

      expect(unknownAttributes).toEqual({ unknown: "unknown" });
    });

    it("should return unknown properties if the types don't match", () => {
      const unknownAttributes = getUnknownAttributes({
        marker: "marker",
        style: "style",
        unknown: "unknown",
      });

      expect(unknownAttributes).toEqual({ style: "style", unknown: "unknown" });
    });
  });

  describe("getNextVerse()", () => {
    it("should increment the verse", () => {
      const nextVerse = getNextVerse(1, undefined);

      expect(nextVerse).toBe("2");
    });

    it("should increment the verse when empty", () => {
      const nextVerse = getNextVerse(1, "");

      expect(nextVerse).toBe("2");
    });

    it("should increment the verse when zero", () => {
      const nextVerse = getNextVerse(0, "0");

      expect(nextVerse).toBe("1");
    });

    it("should increment the end verse range", () => {
      const nextVerse = getNextVerse(1, "1-2");

      expect(nextVerse).toBe("3");
    });

    it("should increment the end verse range with more than two verses", () => {
      const nextVerse = getNextVerse(1, "1-3");

      expect(nextVerse).toBe("4");
    });

    it("should increment an open verse range", () => {
      const nextVerse = getNextVerse(1, "1-");

      expect(nextVerse).toBe("2");
    });

    it("should increment a verse range with segments", () => {
      const nextVerse = getNextVerse(1, "1a-2b");

      expect(nextVerse).toBe("3");
    });

    it("should increment a verse range with spaces", () => {
      const nextVerse = getNextVerse(1, " 1 - 2 ");

      expect(nextVerse).toBe("3");
    });

    it("should increment a verse segment", () => {
      const nextVerse = getNextVerse(1, "1a");

      expect(nextVerse).toBe("1b");
    });

    it("should increment a verse segment from 'z'", () => {
      const nextVerse = getNextVerse(1, "1z");

      expect(nextVerse).toBe("2");
    });

    it("should increment a verse segment from 'Z'", () => {
      const nextVerse = getNextVerse(1, "1Z");

      expect(nextVerse).toBe("2");
    });
  });

  describe("isVerseInRange()", () => {
    it("should be in range", () => {
      expect(isVerseInRange(1, "1")).toBe(true);
      expect(isVerseInRange(1, "1a")).toBe(true);

      expect(isVerseInRange(1, "1-2")).toBe(true);
      expect(isVerseInRange(2, "1-2")).toBe(true);

      expect(isVerseInRange(1, "1a-2b")).toBe(true);
      expect(isVerseInRange(2, "1a-2b")).toBe(true);

      expect(isVerseInRange(2, "2-4")).toBe(true);
      expect(isVerseInRange(3, "2-4")).toBe(true);
      expect(isVerseInRange(4, "2-4")).toBe(true);

      expect(isVerseInRange(1, "1-")).toBe(true);
      expect(isVerseInRange(3, "1-")).toBe(true);

      expect(isVerseInRange(3, "-3")).toBe(true);
      expect(isVerseInRange(1, "-3")).toBe(true);
      expect(isVerseInRange(0, "-0")).toBe(true);
    });

    it("should not be in range", () => {
      expect(isVerseInRange(0, "1")).toBe(false);
      expect(isVerseInRange(2, "1")).toBe(false);

      expect(isVerseInRange(0, "1-2")).toBe(false);
      expect(isVerseInRange(3, "1-2")).toBe(false);

      expect(isVerseInRange(0, "1a-2b")).toBe(false);
      expect(isVerseInRange(3, "1a-2b")).toBe(false);

      expect(isVerseInRange(1, "2-4")).toBe(false);
      expect(isVerseInRange(5, "2-4")).toBe(false);

      expect(isVerseInRange(0, "3-")).toBe(false);
      expect(isVerseInRange(1, "3-")).toBe(false);
      expect(isVerseInRange(2, "3-")).toBe(false);

      expect(isVerseInRange(4, "-3")).toBe(false);
      expect(isVerseInRange(5, "-3")).toBe(false);
      expect(isVerseInRange(1, "-0")).toBe(false);
    });

    it("should throw", () => {
      expect(() => isVerseInRange(0, "1-2-3")).toThrow();
      expect(() => isVerseInRange(0, "2-1")).toThrow();
    });
  });

  describe("isSelectionStartNodeExpectedError()", () => {
    it("identifies Lexical DecoratorNode errors", () => {
      expect(
        isSelectionStartNodeExpectedError(
          new Error("$caretFromPoint: Node does not inherit from ElementNode"),
        ),
      ).toBe(true);
      expect(
        isSelectionStartNodeExpectedError(
          new Error("$caretFromPoint: Node does not inherit from TextNode"),
        ),
      ).toBe(true);
      expect(isSelectionStartNodeExpectedError(new Error("some other error"))).toBe(false);
    });
  });

  describe("$getLogicalContentItems", () => {
    it("returns one text item for a plain text paragraph", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append($createParaNode().append($createTextNode("Hello world")));
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(1);
        $expectTextItem(items[0], [{ text: "Hello world", start: 0 }]);
      });
    });

    it("coalesces text split by a TypedMarkNode into one item", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("the "),
            $createTypedMarkNode({ spelling: ["s1"] }).append($createTextNode("man")),
            $createTextNode(" who"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(1);
        $expectTextItem(items[0], [
          { text: "the ", start: 0 },
          { text: "man", start: 4 },
          { text: " who", start: 7 },
        ]);
      });
    });

    it("coalesces text across adjacent overlapping-annotation marks (flat structure)", () => {
      // Overlapping annotations never nest: AnnotationPlugin's nested-element resolver flattens
      // them into adjacent sibling marks with merged typed IDs. This mirrors that real structure
      // for "man who" (grammar) overlapping "man" (spelling).
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("the "),
            $createTypedMarkNode({ spelling: ["s1"], grammar: ["g1"] }).append(
              $createTextNode("man"),
            ),
            $createTypedMarkNode({ grammar: ["g1"] }).append($createTextNode(" who")),
            $createTextNode(" stands"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(1);
        $expectTextItem(items[0], [
          { text: "the ", start: 0 },
          { text: "man", start: 4 },
          { text: " who", start: 7 },
          { text: " stands", start: 11 },
        ]);
      });
    });

    it("breaks a text run at a non-text element (CharNode)", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("aaa "),
            $createCharNode("nd").append($createTextNode("LORD")),
            $createTextNode(" bbb"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(3);
        $expectTextItem(items[0], [{ text: "aaa ", start: 0 }]);
        expect(items[1].type).toBe("element");
        $expectTextItem(items[2], [{ text: " bbb", start: 0 }]);
      });
    });

    it("emits editable VerseNodes as standalone items, breaking text runs", () => {
      // VerseNode extends TextNode (editable-marker rendering, e.g. "\v 1 "), but the
      // editor→USJ exporter always emits it as its own verse marker item — never coalesced
      // into the surrounding string content.
      let v1: VerseNode;
      let v2: VerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $createVerseNode("1", "\\v 1 ");
        v2 = $createVerseNode("2", "\\v 2 ");
        $getRoot().append(
          $createParaNode("p").append(
            v1,
            $createTextNode("In the beginning "),
            v2,
            $createTextNode("and the earth"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(4);
        expect(items[0]).toEqual({ type: "element", node: v1 });
        $expectTextItem(items[1], [{ text: "In the beginning ", start: 0 }]);
        expect(items[2]).toEqual({ type: "element", node: v2 });
        $expectTextItem(items[3], [{ text: "and the earth", start: 0 }]);
      });
    });

    it("skips presentation-only MarkerNodes without breaking the run", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode("p").append($createMarkerNode("p"), $createTextNode("verse text")),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(1);
        $expectTextItem(items[0], [{ text: "verse text", start: 0 }]);
      });
    });

    it("skips standalone NBSP spacer text nodes between content items", () => {
      // Visible/hidden modes insert NBSP spacer text nodes between element items (e.g. between
      // char nodes in a note). The editor→USJ conversion drops them, so they are not USJ
      // content. A spacer only survives as its own node next to elements — Lexical merges
      // adjacent plain text nodes, so an NBSP beside other text is not a separate node.
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createCharNode("nd").append($createTextNode("aaa")),
            $createTextNode(NBSP),
            $createCharNode("nd").append($createTextNode("bbb")),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        expect(items).toHaveLength(2);
        expect(items[0].type).toBe("element");
        expect(items[1].type).toBe("element");
      });
    });

    it("emits a non-text element wrapped inside a TypedMarkNode as its own item", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("x"),
            $createTypedMarkNode({ t: ["1"] }).append(
              $createTextNode("y"),
              $createCharNode("nd").append($createTextNode("LORD")),
              $createTextNode("z"),
            ),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const items = $getFirstParaItems();

        // run "xy" | char | run "z"
        expect(items).toHaveLength(3);
        $expectTextItem(items[0], [
          { text: "x", start: 0 },
          { text: "y", start: 1 },
        ]);
        expect(items[1].type).toBe("element");
        $expectTextItem(items[2], [{ text: "z", start: 0 }]);
      });
    });

    it("returns an empty array for an empty paragraph", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append($createParaNode());
      });

      editor.getEditorState().read(() => {
        expect($getFirstParaItems()).toEqual([]);
      });
    });
  });

  describe("$getLogicalParent / $getLogicalIndexOfChild / $getLogicalTextLocation", () => {
    it("resolves through TypedMarkNode wrappers to the real parent and run index", () => {
      let markedText: TextNode;
      let trailingText: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        markedText = $createTextNode("man");
        trailingText = $createTextNode(" who");
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("the "),
            $createTypedMarkNode({ spelling: ["s1"] }).append(markedText),
            trailingText,
          ),
        );
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("Expected an ElementNode");

        // Logical parent of text inside the mark is the para, not the mark.
        expect($getLogicalParent(markedText)?.getKey()).toBe(para.getKey());
        // All three text pieces belong to logical item 0.
        expect($getLogicalIndexOfChild(para, markedText)).toBe(0);
        expect($getLogicalIndexOfChild(para, trailingText)).toBe(0);

        // Cumulative offsets: "the " (4) + "man" (3) + " who".
        expect($getLogicalTextLocation(markedText, 1)).toEqual({
          parent: para,
          index: 0,
          offset: 5,
        });
        expect($getLogicalTextLocation(trailingText, 2)).toEqual({
          parent: para,
          index: 0,
          offset: 9,
        });
      });
    });

    it("gives elements after an annotated run their logical index", () => {
      let charNode: ReturnType<typeof $createCharNode>;
      let tailText: TextNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        charNode = $createCharNode("nd");
        tailText = $createTextNode("dd");
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("aaa "),
            $createTypedMarkNode({ t: ["1"] }).append($createTextNode("bb")),
            $createTextNode(" cc "),
            charNode.append($createTextNode("LORD")),
            tailText,
          ),
        );
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("Expected an ElementNode");

        // USJ content: [0]="aaa bb cc ", [1]=char, [2]="dd" — the mark is invisible.
        expect($getLogicalIndexOfChild(para, charNode)).toBe(1);
        expect($getLogicalIndexOfChild(para, tailText)).toBe(2);
        expect($getLogicalTextLocation(tailText, 1)).toEqual({
          parent: para,
          index: 2,
          offset: 1,
        });
      });
    });

    it("returns -1 / undefined for presentation-only nodes", () => {
      let markerNode: ReturnType<typeof $createMarkerNode>;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        markerNode = $createMarkerNode("p");
        $getRoot().append($createParaNode("p").append(markerNode, $createTextNode("hi")));
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("Expected an ElementNode");
        expect($getLogicalIndexOfChild(para, markerNode)).toBe(-1);
        expect($getLogicalTextLocation(markerNode, 0)).toBeUndefined();
      });
    });
  });

  describe("$getTextNodeAtLogicalOffset", () => {
    it("finds the segment and local offset for cumulative offsets", () => {
      const { editor, t1, t2, t3 } = buildAnnotatedPara();
      editor.getEditorState().read(() => {
        const item = $getFirstParaTextItem();

        expect($getTextNodeAtLogicalOffset(item, 2)).toEqual([t1, 2]); // in "the "
        expect($getTextNodeAtLogicalOffset(item, 5)).toEqual([t2, 1]); // in "man"
        expect($getTextNodeAtLogicalOffset(item, 9)).toEqual([t3, 2]); // in " who"
      });
    });

    it("prefers the next segment's start at internal boundaries", () => {
      const { editor, t2 } = buildAnnotatedPara();
      editor.getEditorState().read(() => {
        const item = $getFirstParaTextItem();

        // Offset 4 is the boundary "the "|"man": the mark's text at local offset 0.
        expect($getTextNodeAtLogicalOffset(item, 4)).toEqual([t2, 0]);
      });
    });

    it("returns the end of the last segment for offset === length, undefined beyond", () => {
      const { editor, t3 } = buildAnnotatedPara();
      editor.getEditorState().read(() => {
        const item = $getFirstParaTextItem();

        expect($getTextNodeAtLogicalOffset(item, 11)).toEqual([t3, 4]); // "the man who".length
        expect($getTextNodeAtLogicalOffset(item, 12)).toBeUndefined();
      });
    });
  });

  describe("$getLogicalPointFromElementPoint / $getElementOffsetFromLogicalIndex", () => {
    it("maps element boundaries around an annotated run", () => {
      const { editor } = createBasicTestEnvironment(nodes, () => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("aaa "),
            $createTypedMarkNode({ t: ["1"] }).append($createTextNode("bb")),
            $createTextNode(" cc "),
            $createCharNode("nd").append($createTextNode("LORD")),
            $createTextNode("dd"),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("Expected an ElementNode");
        // Lexical children:      0="aaa "  1=Mark  2=" cc "  3=Char  4="dd"
        // Logical content items: 0="aaa bb cc "   1=Char     2="dd"

        // Boundary before child 0 = before item 0.
        expect($getLogicalPointFromElementPoint(para, 0)).toEqual({ type: "index", index: 0 });
        // Boundary before the mark falls INSIDE logical item 0 at cumulative offset 4.
        expect($getLogicalPointFromElementPoint(para, 1)).toEqual({
          type: "text",
          index: 0,
          offset: 4,
        });
        // Boundary before " cc " is also inside item 0, at offset 6.
        expect($getLogicalPointFromElementPoint(para, 2)).toEqual({
          type: "text",
          index: 0,
          offset: 6,
        });
        // Boundary before the char is the clean boundary between items 0 and 1.
        expect($getLogicalPointFromElementPoint(para, 3)).toEqual({ type: "index", index: 1 });
        // End boundary.
        expect($getLogicalPointFromElementPoint(para, 5)).toEqual({ type: "index", index: 3 });

        // Inverse: earliest element child offset for each logical boundary.
        expect($getElementOffsetFromLogicalIndex(para, 0)).toBe(0);
        expect($getElementOffsetFromLogicalIndex(para, 1)).toBe(3); // after " cc "
        expect($getElementOffsetFromLogicalIndex(para, 2)).toBe(4); // after Char
        expect($getElementOffsetFromLogicalIndex(para, 3)).toBe(5); // after "dd"
      });
    });

    it("resolves a boundary at a mark wrapping a non-text element child", () => {
      // The mark wraps a CharNode rather than plain text (e.g. from wrapping a partial CharNode
      // selection in an annotation). This pins the $isDescendantOf element-item branch: the
      // "child" passed in is the mark itself, and the matching item's node (the CharNode) is a
      // descendant of it, not equal to it.
      let markNode: TypedMarkNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        markNode = $createTypedMarkNode({ t: ["1"] }).append(
          $createCharNode("nd").append($createTextNode("LORD")),
        );
        $getRoot().append(
          $createParaNode().append($createTextNode("ab"), markNode, $createTextNode("cd")),
        );
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isElementNode(para)) throw new Error("Expected an ElementNode");
        // Lexical children:      0="ab"  1=Mark  2="cd"
        // Logical content items: 0="ab"  1=Char  2="cd"

        // Boundary before the mark (child index 1) falls on the char's logical index, not the
        // mark's own (dropped) index.
        expect($getLogicalPointFromElementPoint(para, 1)).toEqual({ type: "index", index: 1 });
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers (function declarations hoist, so they may live after the tests)
// ---------------------------------------------------------------------------

/**
 * Gets the logical content items of the first (para) child of root. Must be called inside an
 * active editor state read scope, e.g. `editor.getEditorState().read(...)`.
 */
function $getFirstParaItems(): LogicalContentItem[] {
  const para = $getRoot().getFirstChild();
  if (!$isElementNode(para)) throw new Error("Expected an ElementNode");
  return $getLogicalContentItems(para);
}

/**
 * Gets the first logical content item of the first (para) child of root, asserting it is a
 * text item. Must be called inside an active editor state read scope.
 */
function $getFirstParaTextItem(): LogicalTextItem {
  const [item] = $getFirstParaItems();
  if (item?.type !== "text") throw new Error("Expected a text item");
  return item;
}

/**
 * Asserts a text item's segment texts and cumulative starts. Must be called inside an active
 * editor state read scope, e.g. `editor.getEditorState().read(...)`.
 */
function $expectTextItem(
  item: LogicalContentItem,
  expectedSegments: { text: string; start: number }[],
) {
  if (item.type !== "text") throw new Error("Expected a text item");
  expect(
    item.segments.map((segment) => ({
      text: segment.node.getTextContent(),
      start: segment.start,
    })),
  ).toEqual(expectedSegments);
  expect(item.length).toBe(expectedSegments.reduce((sum, segment) => sum + segment.text.length, 0));
}

/** Build "the " |man| " who" where "man" is annotated, returning the three text nodes. */
function buildAnnotatedPara() {
  let t1: TextNode;
  let t2: TextNode;
  let t3: TextNode;
  const { editor } = createBasicTestEnvironment(nodes, () => {
    t1 = $createTextNode("the ");
    t2 = $createTextNode("man");
    t3 = $createTextNode(" who");
    $getRoot().append(
      $createParaNode().append(t1, $createTypedMarkNode({ s: ["1"] }).append(t2), t3),
    );
  });
  // Non-null assertion is safe: the initial state callback ran synchronously.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor, t1: t1!, t2: t2!, t3: t3! };
}
