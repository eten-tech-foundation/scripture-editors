// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { StructureProtectionPlugin } from "./StructureProtectionPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $createTextNode,
  TextNode,
  COMMAND_PRIORITY_LOW,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
} from "lexical";
import { $createParaNode, $createImpliedParaNode } from "shared";

describe("baseline (unprotected) structural behavior", () => {
  it("Backspace at start of a ParaNode merges it into the previous paragraph", async () => {
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createParaNode("q").append(t2),
      );
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      // Document the real result: the two paragraphs become one.
      expect($getRoot().getChildrenSize()).toBe(1);
    });
  });

  it("Enter in the middle of a ParaNode splits it into two paragraphs", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);

    await pressKey(editor, "Enter", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(2);
    });
  });

  it("Backspace at start of an ImpliedParaNode merges into the previous paragraph", async () => {
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createImpliedParaNode().append(t2),
      );
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
    });
  });
});

// With the plugin present but disabled (isStructureProtected={false}) the editor must behave exactly
// like the unprotected baseline above: structural edits go through and the plugin's high-priority
// handlers stay inert, letting commands propagate.
describe("StructureProtectionPlugin disabled — behaves like baseline", () => {
  it("allows Backspace-at-start merge", async () => {
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createParaNode("q").append(t2),
      );
    });
    updateSelection(editor, t2!, 0);

    await pressKey(editor, "Backspace", 0);

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // merged
    });
  });

  it("allows controlled text insertion spanning a boundary", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1); // replaced/merged
    });
  });

  it("does NOT consume CUT (low-priority spy reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => true); // claim handled so RichText's own cut does nothing
    const unregister = editor.registerCommand(CUT_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(CUT_COMMAND, null);
    });
    unregister();

    expect(spy).toHaveBeenCalled(); // plugin inert; propagation continued
  });

  it("does NOT consume DRAGSTART (low-priority spy reached)", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await testEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);

    const spy = vi.fn(() => true);
    const unregister = editor.registerCommand(DRAGSTART_COMMAND, spy, COMMAND_PRIORITY_LOW);
    await act(async () => {
      editor.dispatchCommand(DRAGSTART_COMMAND, null as unknown as DragEvent);
    });
    unregister();

    expect(spy).toHaveBeenCalled(); // plugin inert; propagation continued
  });
});

async function testEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <StructureProtectionPlugin isStructureProtected={false} />,
  );
}
