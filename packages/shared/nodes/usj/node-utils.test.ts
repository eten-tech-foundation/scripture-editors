import { $createImmutableChapterNode } from "./ImmutableChapterNode";
import {
  getNextVerse,
  getUnknownAttributes,
  isValidNumberedMarker,
  isVerseInRange,
  parseNumberFromMarkerText,
  removeNodeAndAfter,
  removeNodesBeforeNode,
} from "./node.utils";
import { $createParaNode } from "./ParaNode";
import { createBasicTestEnvironment } from "./test.utils";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { $getRoot, NodeKey, $getNodeByKey } from "lexical";

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
        if (!c2) fail("chapter should be defined");

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
});
