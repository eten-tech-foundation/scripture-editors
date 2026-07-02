import { testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $setState, TextNode } from "lexical";
import { $createMarkerNode, $createParaNode, NBSP, textTypeState } from "shared";

describe("attribute text styling in editable mode", () => {
  it("adds the .attribute class to attribute text nodes on initial mount", async () => {
    let attrText: TextNode;
    const { editor } = await testEnvironment(() => {
      attrText = $createTextNode(`${NBSP}|sid="ts.GEN.1"`);
      $setState(attrText, textTypeState, "attribute");
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), attrText));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(attrText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
    });
  });

  it("adds the .attribute class when a node becomes dirty after mount", async () => {
    let attrText: TextNode;
    const { editor } = await testEnvironment(() => {
      attrText = $createTextNode(`${NBSP}|sid="ts.GEN.1"`);
      $setState(attrText, textTypeState, "attribute");
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(NBSP), attrText));
    });
    await act(async () => editor.update(() => $setState(attrText, textTypeState, "attribute")));
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(attrText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(true);
    });
  });

  it("leaves non-attribute text nodes undecorated", async () => {
    let plainText: TextNode;
    const { editor } = await testEnvironment(() => {
      // The trailing-space node needs its own textType, or Lexical's adjacent simple-TextNode
      // normalization silently merges it into plainText on the first commit (see
      // whitespaceDisplay.plugin.utils.test.tsx's $appendMarkerAndText), invalidating the
      // `plainText` reference captured below.
      const spaceNode = $createTextNode(NBSP);
      $setState(spaceNode, textTypeState, "marker-trailing-space");
      plainText = $createTextNode("In the beginning");
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), spaceNode, plainText));
    });
    editor.getEditorState().read(() => {
      const dom = editor.getElementByKey(plainText.getKey());
      expect(dom?.classList.contains("attribute")).toBe(false);
    });
  });
});
