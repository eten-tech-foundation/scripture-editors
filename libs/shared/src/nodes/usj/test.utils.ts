import { usjBaseNodes } from "./index.js";
import {
  $createPoint,
  $createRangeSelection,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  CreateEditorArgs,
  Klass,
  LexicalEditor,
  LexicalNode,
  LexicalNodeReplacement,
  createEditor,
} from "lexical";

export interface TestEnv {
  editor: LexicalEditor;
  container?: HTMLElement;
}

/**
 * Create basic Lexical test environment.
 *
 * @param nodes - Array of nodes for the test environment.
 * @param $initialEditorState - Optional function to set the initial editor state.
 * @returns a test environment.
 */
export function createBasicTestEnvironment(
  nodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = usjBaseNodes,
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
  if (!$isRangeSelection(selection)) throw new Error("Selection is not a range selection");
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
