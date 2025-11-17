import { $createParaNode, ParaNode } from "../usj/ParaNode.js";
import { createBasicTestEnvironment } from "../usj/test.utils.js";
import { $createTypedMarkNode, $isTypedMarkNode, TypedMarkNode } from "./TypedMarkNode.js";
import { $createTextNode, $getRoot, EditorConfig, TextNode } from "lexical";
import { vi } from "vitest";

const testType1 = "testType1";
const testType2 = "testType2";
const testID1 = "testID1";
const testID2 = "testID2";

describe("TypedMarkNode", () => {
  describe("hasID()", () => {
    it("should work the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        expect(node.hasID(testType1, testID1)).toBe(true);
        expect(node.hasID(testType1, testID2)).toBe(true);
        expect(node.hasID(testType2, testID2)).toBe(true);
        expect(node.hasID(testType1, "unknownID")).toBe(false);
        expect(node.hasID(testType1, undefined as unknown as string)).toBe(false);
        expect(node.hasID(testType1, null as unknown as string)).toBe(false);
        expect(node.hasID("noType", testID1)).toBe(false);
        expect(node.hasID(undefined as unknown as string, testID1)).toBe(false);
        expect(node.hasID(null as unknown as string, testID1)).toBe(false);
      });
    });
  });

  describe("addID()", () => {
    it("should add IDs to the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({});
        expect(node).toBeDefined();

        node.addID(testType1, testID1);

        expect(node.getTypedIDs()).toEqual({ [testType1]: [testID1] });

        node.addID(testType2, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID1],
          [testType2]: [testID2],
        });

        node.addID(testType1, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
      });
    });
  });

  describe("deleteID()", () => {
    it("should delete IDs from the specified type", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [testID1, testID2],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        node.deleteID(testType1, testID1);

        expect(node.getTypedIDs()).toEqual({ [testType1]: [testID2], [testType2]: [testID2] });

        node.deleteID(testType2, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [testID2],
          [testType2]: [],
        });

        node.deleteID(testType1, testID2);

        expect(node.getTypedIDs()).toEqual({
          [testType1]: [],
          [testType2]: [],
        });
      });
    });

    it("should unwrap the node when the final ID is removed", () => {
      let paraNode: ParaNode;
      let markNode: TypedMarkNode | null = null;
      let textNode: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        paraNode = $createParaNode();
        markNode = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        textNode = $createTextNode("example");
        $getRoot().append(paraNode.append(markNode.append(textNode)));
      });

      editor.update(() => {
        if (!markNode) throw new Error("Expected mark node to exist");
        markNode.deleteID(testType1, testID1);

        expect(markNode.getParent()).toBeNull();
        expect(paraNode.getChildrenSize()).toBe(1);
        expect(paraNode.getFirstChild()?.getKey()).toBe(textNode.getKey());
      });
    });

    it("should merge adjacent marks after removing an overlapping ID", () => {
      const grammarType = testType1;
      const grammarId = testID1;
      const spellingType = testType2;
      const spellingId = testID2;
      const onClickLeft = vi.fn();
      const onClickRight = vi.fn();
      const onRemoveSpelling = vi.fn();
      const onRemoveRight = vi.fn();
      let paraNode: ParaNode;
      let leftMark: TypedMarkNode | null = null;
      let rightMark: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        paraNode = $createParaNode();
        leftMark = $createTypedMarkNode({
          [grammarType]: [grammarId],
          [spellingType]: [spellingId],
        });
        rightMark = $createTypedMarkNode({
          [grammarType]: [grammarId],
        });
        leftMark.addID(grammarType, grammarId, onClickLeft);
        leftMark.addID(spellingType, spellingId, undefined, onRemoveSpelling);
        rightMark.addID(grammarType, grammarId, onClickRight, onRemoveRight);
        $getRoot().append(
          paraNode.append(
            leftMark.append($createTextNode("man")),
            rightMark.append($createTextNode(" who")),
          ),
        );
      });

      editor.update(() => {
        if (!leftMark || !rightMark) throw new Error("Expected mark nodes to exist");

        leftMark.deleteID(spellingType, spellingId);

        expect(rightMark.getParent()).toBeNull();
        expect(paraNode.getChildrenSize()).toBe(1);

        const merged = paraNode.getFirstChild();
        if (!$isTypedMarkNode(merged)) throw new Error("Expected a TypedMarkNode");
        expect(merged.getKey()).toBe(leftMark.getKey());
        expect(merged.getTextContent()).toBe("man who");
        const typedIDs = merged.getTypedIDs();
        expect(typedIDs[grammarType]).toEqual([grammarId]);
        expect(typedIDs[spellingType]).toEqual([]);
        expect(paraNode.getTextContent()).toBe("man who");

        const callbacks = merged.getTypedOnClicks();
        expect(callbacks[grammarType]?.[grammarId]).toBe(onClickLeft);
        expect(onRemoveSpelling).toHaveBeenCalledTimes(1);
        expect(onRemoveSpelling).toHaveBeenCalledWith(spellingType, spellingId, "removed", "man");
        expect(onRemoveRight).not.toHaveBeenCalled();
      });
    });
  });

  describe("setTypedIDs()", () => {
    it("should unwrap the node when updated with no IDs", () => {
      let paraNode: ParaNode;
      let markNode: TypedMarkNode | null = null;
      let textNode: TextNode;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        paraNode = $createParaNode();
        markNode = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        textNode = $createTextNode("example");
        $getRoot().append(paraNode.append(markNode.append(textNode)));
      });

      editor.update(() => {
        if (!markNode) throw new Error("Expected mark node to exist");
        markNode.setTypedIDs({});

        expect(markNode.getParent()).toBeNull();
        expect(paraNode.getChildrenSize()).toBe(1);
        expect(paraNode.getFirstChild()?.getKey()).toBe(textNode.getKey());
      });
    });
  });

  describe("hasNoIDsForEveryType()", () => {
    it("should work if has no types", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({});
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(true);
      });
    });

    it("should work if has types but no IDs", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [],
          [testType2]: undefined as unknown as string[],
        });
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(true);
      });
    });

    it("should work if has types and IDs", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const node = $createTypedMarkNode({
          [testType1]: [],
          [testType2]: [testID2],
        });
        expect(node).toBeDefined();

        expect(node.hasNoIDsForEveryType()).toBe(false);
      });
    });
  });

  describe("onClick callbacks", () => {
    it("should invoke callbacks for each type/id pair on click", () => {
      const onClickA = vi.fn();
      const onClickB = vi.fn();
      const onClickC = vi.fn();
      let markNode: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({});
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });
      const getMarkNode = (): TypedMarkNode => {
        if (!markNode) throw new Error("Expected mark node to exist");
        return markNode;
      };

      editor.update(() => {
        const node = getMarkNode();
        node.addID(testType1, testID1, onClickA);
        node.addID(testType1, testID2, onClickB);
        node.addID(testType2, testID2, onClickC);
      });

      editor.getEditorState().read(() => {
        const node = getMarkNode();
        const typedOnClicks = node.getTypedOnClicks();
        expect(Object.keys(typedOnClicks)).toEqual(expect.arrayContaining([testType1, testType2]));
        expect(typedOnClicks[testType1]?.[testID1]).toBe(onClickA);
        expect(typedOnClicks[testType1]?.[testID2]).toBe(onClickB);
        expect(typedOnClicks[testType2]?.[testID2]).toBe(onClickC);

        const element = editor.getElementByKey(node.getKey());
        expect(element).toBeInstanceOf(HTMLElement);
        if (!(element instanceof HTMLElement)) {
          throw new Error("Expected DOM element for mark node");
        }
        element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(onClickA).toHaveBeenCalledTimes(1);
        expect(onClickA).toHaveBeenCalledWith(expect.anything(), testType1, testID1);
        expect(onClickB).toHaveBeenCalledTimes(1);
        expect(onClickB).toHaveBeenCalledWith(expect.anything(), testType1, testID2);
        expect(onClickC).toHaveBeenCalledTimes(1);
        expect(onClickC).toHaveBeenCalledWith(expect.anything(), testType2, testID2);
      });
    });

    it("should drop callbacks for IDs that are removed", () => {
      const onClickA = vi.fn();
      const onClickB = vi.fn();
      let markNode: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({});
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });
      const getMarkNode = (): TypedMarkNode => {
        if (!markNode) throw new Error("Expected mark node to exist");
        return markNode;
      };

      editor.update(() => {
        const node = getMarkNode();
        node.addID(testType1, testID1, onClickA);
        node.addID(testType1, testID2, onClickB);
        node.deleteID(testType1, testID1);
      });

      let element: HTMLElement | null = null;
      editor.getEditorState().read(() => {
        const node = getMarkNode();
        const typedOnClicks = node.getTypedOnClicks();
        expect(typedOnClicks[testType1]?.[testID1]).toBeUndefined();
        expect(typedOnClicks[testType1]?.[testID2]).toBe(onClickB);

        element = editor.getElementByKey(node.getKey());
        expect(element).toBeInstanceOf(HTMLElement);
        if (!(element instanceof HTMLElement)) {
          throw new Error("Expected DOM element for mark node");
        }
        element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

        expect(onClickA).not.toHaveBeenCalled();
        expect(onClickB).toHaveBeenCalledTimes(1);
      });
    });

    it("should ignore callbacks that do not match current IDs", () => {
      let markNode: TypedMarkNode | null = null;
      const onClick = vi.fn();
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });
      const getMarkNode = (): TypedMarkNode => {
        if (!markNode) throw new Error("Expected mark node to exist");
        return markNode;
      };

      editor.update(() => {
        const node = getMarkNode();
        // Inject a callback for an ID that is not present so pruning can drop it immediately.
        node.setTypedOnClicks({
          [testType1]: { [testID2]: onClick },
        });
      });

      editor.getEditorState().read(() => {
        const node = getMarkNode();
        expect(node.getTypedOnClicks()[testType1]).toBeUndefined();
      });
    });
  });

  describe("onRemove callbacks", () => {
    it("should invoke callbacks when IDs are explicitly removed", () => {
      const onRemove = vi.fn();
      let markNode: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({});
        markNode.addID(testType1, testID1, undefined, onRemove);
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });
      const getMarkNode = (): TypedMarkNode => {
        if (!markNode) throw new Error("Expected mark node to exist");
        return markNode;
      };

      editor.update(() => {
        const node = getMarkNode();
        node.deleteID(testType1, testID1);
      });

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith(testType1, testID1, "removed", "example");
    });

    it("should invoke callbacks when IDs change via setTypedIDs", () => {
      const onRemove = vi.fn();
      let markNode: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        markNode.addID(testType1, testID1, undefined, onRemove);
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });

      editor.update(() => {
        if (!markNode) throw new Error("Expected mark node to exist");
        markNode.setTypedIDs({ [testType1]: [] });
      });

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith(testType1, testID1, "removed", "example");
    });

    it("should invoke callbacks when the mark is destroyed", () => {
      const onRemove = vi.fn();
      let markNode: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        markNode = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        markNode.addID(testType1, testID1, undefined, onRemove);
        $getRoot().append($createParaNode().append(markNode.append($createTextNode("example"))));
      });

      editor.update(() => {
        if (!markNode) throw new Error("Expected mark node to exist");
        markNode.remove();
      });

      expect(onRemove).toHaveBeenCalledTimes(1);
      expect(onRemove).toHaveBeenCalledWith(testType1, testID1, "destroyed", "example");
    });

    it("should not invoke callbacks for IDs preserved during merges", () => {
      const grammarType = testType1;
      const grammarId = testID1;
      const spellingType = testType2;
      const spellingId = testID2;
      const onRemoveRight = vi.fn();
      let leftMark: TypedMarkNode | null = null;
      let rightMark: TypedMarkNode | null = null;
      const { editor } = createBasicTestEnvironment([ParaNode, TypedMarkNode], () => {
        const paraNode = $createParaNode();
        leftMark = $createTypedMarkNode({
          [grammarType]: [grammarId],
          [spellingType]: [spellingId],
        });
        rightMark = $createTypedMarkNode({
          [grammarType]: [grammarId],
        });
        leftMark.addID(spellingType, spellingId, undefined, vi.fn());
        rightMark.addID(grammarType, grammarId, undefined, onRemoveRight);
        $getRoot().append(
          paraNode.append(
            leftMark.append($createTextNode("left")),
            rightMark.append($createTextNode("right")),
          ),
        );
      });

      editor.update(() => {
        if (!leftMark || !rightMark) throw new Error("Expected mark nodes to exist");
        leftMark.deleteID(spellingType, spellingId);
      });

      expect(onRemoveRight).not.toHaveBeenCalled();
    });
  });

  describe("updateDOM()", () => {
    const mockEditorConfig: EditorConfig = {
      namespace: "TestEditor",
      theme: {
        typedMark: "typed-mark",
        typedMarkOverlap: "typed-mark-overlap",
      },
    };

    it("removes annotationId class names when IDs are removed", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const previous = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        const next = $createTypedMarkNode({
          [testType1]: [],
        });
        const element = previous.createDOM(mockEditorConfig);
        expect(element.classList.contains(`annotationId-${testID1}`)).toBe(true);

        next.updateDOM(previous, element, mockEditorConfig);

        expect(element.classList.contains(`annotationId-${testID1}`)).toBe(false);
      });
    });

    it("adds annotationId class names for new IDs", () => {
      const { editor } = createBasicTestEnvironment([TypedMarkNode]);
      editor.update(() => {
        const previous = $createTypedMarkNode({
          [testType1]: [],
        });
        const next = $createTypedMarkNode({
          [testType1]: [testID1],
        });
        const element = previous.createDOM(mockEditorConfig);
        expect(element.classList.contains(`annotationId-${testID1}`)).toBe(false);

        next.updateDOM(previous, element, mockEditorConfig);

        expect(element.classList.contains(`annotationId-${testID1}`)).toBe(true);
      });
    });
  });
});
