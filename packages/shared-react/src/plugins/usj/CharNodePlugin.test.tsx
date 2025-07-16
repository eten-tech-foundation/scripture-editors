import { CharNodePlugin } from "./CharNodePlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import { $getRoot, $createTextNode, $isTextNode, $setState } from "lexical";
import { charIdState } from "shared/nodes/collab/delta.state";
import { $createCharNode, $isCharNode, CharNode } from "shared/nodes/usj/CharNode";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";

describe("CharNodePlugin", () => {
  it("should load an initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append($createCharNode("add").append($createTextNode("add text "))),
      );
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getTextContent()).toBe("add text ");
      expect(root.getChildrenSize()).toBe(1);

      const p = root.getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text1 ")),
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with different markers", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text ")),
          $createCharNode("nd").append($createTextNode("nd text ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and attributes", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add", { customAttr: "value" }).append($createTextNode("add text1 ")),
          $createCharNode("add", { customAttr: "value" }).append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but different attributes", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add", { customAttr: "value1" }).append($createTextNode("add text1 ")),
          $createCharNode("add", { customAttr: "value2" }).append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and empty cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but different cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id1");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "char-id2");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker, attributes and cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value" });
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add", { customAttr: "value" });
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker and cids but different attributes", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value1" });
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add", { customAttr: "value2" });
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker and attributes but different cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value" });
      $setState(char1, charIdState, "char-id1");
      const char2 = $createCharNode("add", { customAttr: "value" });
      $setState(char2, charIdState, "char-id2");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but only one cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id1");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine nested adjacent CharNodes with same marker", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append(
            $createTextNode("add text before "),
            $createCharNode("nd").append($createTextNode("nd text1 ")),
            $createCharNode("nd").append($createTextNode("nd text2 ")),
            $createTextNode("add text after "),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getChildrenSize()).toBe(3);

      const textBefore = add.getChildAtIndex(0);
      if (!$isTextNode(textBefore)) throw new Error("Expected a TextNode");
      expect(textBefore.getTextContent()).toBe("add text before ");

      const nd = add.getChildAtIndex(1);
      if (!$isCharNode(nd)) throw new Error("Expected a CharNode");
      expect(nd.getMarker()).toBe("nd");
      expect(nd.getChildrenSize()).toBe(1);
      expect(nd.getTextContent()).toBe("nd text1 nd text2 ");
    });
  });

  it("should not combine nested adjacent CharNodes with different markers", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append(
            $createTextNode("add text before "),
            $createCharNode("nd").append($createTextNode("nd text ")),
            $createCharNode("w").append($createTextNode("w text ")),
            $createTextNode("add text after "),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getChildrenSize()).toBe(4);
    });
  });

  it("should combine 3 adjacent CharNodes with same marker on update", async () => {
    let ndCharNode: CharNode;
    const { editor } = await testEnvironment(() => {
      ndCharNode = $createCharNode("nd").append($createTextNode("nd text "));
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text1 ")),
          ndCharNode,
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(3);
    });

    await act(async () => {
      editor.update(() => {
        ndCharNode.setMarker("add");
      });
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
      expect(add.getTextContent()).toBe("add text1 nd text add text2 ");
    });
  });
});

async function testEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment($initialEditorState, <CharNodePlugin />);
}
