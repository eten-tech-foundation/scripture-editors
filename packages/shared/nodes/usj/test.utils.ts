import { usjBaseNodes } from ".";
import { act } from "@testing-library/react";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getSelection,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  CreateEditorArgs,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  Klass,
  LexicalEditor,
  LexicalNode,
  LexicalNodeReplacement,
  createEditor,
} from "lexical";

export type TestEnv = {
  editor: LexicalEditor;
  container?: HTMLElement;
};

/**
 * Create basic Lexical test environment.
 *
 * @param nodes - Array of nodes for the test environment.
 * @param $initialEditorState - Optional function to set the initial editor state.
 * @returns a test environment.
 */
export function createBasicTestEnvironment(
  nodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement> = usjBaseNodes,
  $initialEditorState?: () => void,
): TestEnv {
  const container = document.createElement("div");
  document.body.appendChild(container);

  const config: CreateEditorArgs = {
    namespace: "TestEditor",
    onError(error) {
      throw error;
    },
    nodes,
  };
  const editor = createEditor(config);
  editor.setRootElement(container);
  if ($initialEditorState) editor.update($initialEditorState, { discrete: true });

  const testEnv: TestEnv = {
    container,
    editor,
  };

  return testEnv;
}

/**
 * Sets the selection range in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param $createNoteNodeToInsert - A callback function to create the NoteNode to insert at the
 *   selection.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the selection ends. Defaults to the
 *   startOffset.
 * @param tag - Optional tag for the update.
 */
export function updateSelection(
  editor: LexicalEditor,
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
  tag?: string | string[],
) {
  editor.update(
    () => {
      startOffset ??= startNode.getTextContentSize();
      endOffset ??= startOffset;
      endNode ??= startNode;
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      rangeSelection.focus = $createPoint(
        endNode.getKey(),
        endOffset,
        $isElementNode(endNode) ? "element" : "text",
      );
      $setSelection(rangeSelection);
    },
    { discrete: true, tag },
  );
}

/**
 * Checks the selection range in the LexicalEditor is at the specified location.
 *
 * @param startNode - The starting LexicalNode of the expected selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the expected selection. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the selection ends. Defaults to the
 *   end of the endNode's text content.
 */
export function $expectSelectionToBe(
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
) {
  startOffset ??= startNode.getTextContentSize();
  endOffset ??= endNode ? endNode.getTextContentSize() : startOffset;
  endNode ??= startNode;

  const selection = $getSelection();
  if (!$isRangeSelection(selection)) fail("Selection is not a range selection");
  const selectionStart = selection.isBackward() ? selection.focus : selection.anchor;
  const selectionEnd = selection.isBackward() ? selection.anchor : selection.focus;
  expect(selectionStart).toEqual({
    key: startNode.getKey(),
    offset: startOffset,
    type: $isElementNode(startNode) ? "element" : "text",
  });
  expect(selectionEnd).toEqual({
    key: endNode.getKey(),
    offset: endOffset,
    type: $isElementNode(endNode) ? "element" : "text",
  });
}

/**
 * Press the enter key at the selection range in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the selection ends. Defaults to the
 *   end of the endNode's text content.
 */
export async function pressEnterAtSelection(
  editor: LexicalEditor,
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
) {
  await act(async () => {
    editor.update(() => {
      startOffset ??= startNode.getTextContentSize();
      endOffset ??= endNode ? endNode.getTextContentSize() : startOffset;
      endNode ??= startNode;
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      rangeSelection.focus = $createPoint(
        endNode.getKey(),
        endOffset,
        $isElementNode(endNode) ? "element" : "text",
      );
      $setSelection(rangeSelection);
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
  });
}

/**
 * Simulates pressing a key by dispatching the KEY_DOWN_COMMAND.
 *
 * @param editor - The Lexical editor instance.
 * @param key - The key name (e.g., "ArrowRight", "ArrowLeft").
 */
export async function pressKey(editor: LexicalEditor, key: string): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(
      KEY_DOWN_COMMAND,
      new KeyboardEvent("keydown", { key: key, bubbles: true, cancelable: true }),
    );
  });
}

/**
 * Type text after the selection point in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param node - The LexicalNode after which the selection will start.
 * @param startOffset - The offset within the startNode (after `node`) where the selection begins.
 *   Defaults to the end of the startNode's text content.
 */
export async function typeTextAfterNode(
  editor: LexicalEditor,
  text: string,
  node: LexicalNode,
  startOffset?: number,
) {
  await act(async () => {
    editor.update(() => {
      const startNode = node.getNextSibling() ?? node;
      startOffset ??= startNode.getTextContentSize();
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      rangeSelection.focus = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      $setSelection(rangeSelection);
      $insertNodes([$createTextNode(text)]);
    });
  });
}

/**
 * Type text at the selection point in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection to delete. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the deletion ends. Defaults to the
 *   end of the endNode's text content.
 */
export async function typeTextAtSelection(
  editor: LexicalEditor,
  text: string,
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
) {
  await act(async () => {
    editor.update(() => {
      startOffset ??= startNode.getTextContentSize();
      endOffset ??= endNode ? endNode.getTextContentSize() : startOffset;
      endNode ??= startNode;
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      rangeSelection.focus = $createPoint(
        endNode.getKey(),
        endOffset,
        $isElementNode(endNode) ? "element" : "text",
      );
      $setSelection(rangeSelection);
      rangeSelection.insertText(text);
    });
  });
}

/**
 * Creates text at the selection point in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 */
export async function createTextAtSelection(
  editor: LexicalEditor,
  text: string,
  startNode: LexicalNode,
  startOffset?: number,
) {
  await act(async () => {
    editor.update(() => {
      startOffset ??= startNode.getTextContentSize();
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      rangeSelection.focus = $createPoint(
        startNode.getKey(),
        startOffset,
        $isElementNode(startNode) ? "element" : "text",
      );
      $setSelection(rangeSelection);
      $insertNodes([$createTextNode(text)]);
    });
  });
}

/**
 * Deletes text within the specified selection range in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the deletion will occur.
 * @param startNode - The starting LexicalNode of the selection to delete.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection to delete. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the deletion ends. Defaults to the
 *   end of the endNode's text content.
 */
export async function deleteTextAtSelection(
  editor: LexicalEditor,
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
) {
  await act(async () => {
    editor.update(() => {
      startOffset ??= startNode.getTextContentSize();
      endOffset ??= endNode ? endNode.getTextContentSize() : startOffset;
      endNode ??= startNode;
      const rangeSelection = $createRangeSelection();
      rangeSelection.anchor = $createPoint(startNode.getKey(), startOffset, "text"); // Assume text for deletion
      rangeSelection.focus = $createPoint(endNode.getKey(), endOffset, "text"); // Assume text for deletion
      $setSelection(rangeSelection);
      rangeSelection.removeText();
    });
  });
}
