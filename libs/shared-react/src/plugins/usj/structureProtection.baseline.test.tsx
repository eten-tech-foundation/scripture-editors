// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { $getRoot, $createTextNode, TextNode } from "lexical";
import { $createParaNode, $createImpliedParaNode, ParaNode, ImpliedParaNode } from "shared";

describe("baseline (unprotected) structural behavior", () => {
  it("Backspace at start of a ParaNode merges it into the previous paragraph", async () => {
    let p1: ParaNode;
    let p2: ParaNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      p1 = $createParaNode("p");
      p2 = $createParaNode("q");
      t2 = $createTextNode("second");
      $getRoot().append(p1.append($createTextNode("first")), p2.append(t2));
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      // Document the real result: the two paragraphs become one.
      expect($getRoot().getChildrenSize()).toBe(1);
    });
  });

  it("Enter in the middle of a ParaNode splits it into two paragraphs", async () => {
    let p1: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      p1 = $createParaNode("p");
      t1 = $createTextNode("abcdef");
      $getRoot().append(p1.append(t1));
    });
    updateSelection(editor, t1!, 3);

    await pressKey(editor, "Enter", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2);
    });
  });

  it("Backspace at start of an ImpliedParaNode merges into the previous paragraph", async () => {
    let p1: ParaNode;
    let p2: ImpliedParaNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      p1 = $createParaNode("p");
      p2 = $createImpliedParaNode();
      t2 = $createTextNode("second");
      $getRoot().append(p1.append($createTextNode("first")), p2.append(t2));
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
    });
  });
});
