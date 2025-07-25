import { usjReactNodes } from "../../nodes/usj";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $insertNodes,
  $isElementNode,
  $setSelection,
  $setState,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  LexicalNode,
} from "lexical";
import { ReactNode } from "react";
import { segmentState } from "shared/nodes/collab/delta.state";

export async function baseTestEnvironment(
  $initialEditorState?: () => void,
  children?: ReactNode | undefined,
): Promise<{ editor: LexicalEditor }> {
  let editor: LexicalEditor;

  function GrabEditor() {
    [editor] = useLexicalComposerContext();
    return null;
  }

  function App() {
    return (
      <LexicalComposer
        initialConfig={{
          editorState: $initialEditorState,
          namespace: "TestEditor",
          nodes: usjReactNodes,
          onError: (error) => {
            throw error;
          },
          theme: {},
        }}
      >
        <GrabEditor />
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        {children}
      </LexicalComposer>
    );
  }

  await act(async () => {
    render(<App />);
  });

  // `editor` is defined on React render.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor: editor! };
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
 * Type text after the node in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param text - The text to type after the selection.
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
 * @param text - The text to type at the selection.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection to delete. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the deletion ends. Defaults to the
 *   end of the endNode's text content.
 * @param segment - Optional segment attribute to set on the inserted text.
 */
export async function typeTextAtSelection(
  editor: LexicalEditor,
  text: string,
  startNode: LexicalNode,
  startOffset?: number,
  endNode?: LexicalNode,
  endOffset?: number,
  segment?: string,
) {
  await act(async () => {
    editor.update(() => {
      $typeTextAtSelection(text, startNode, startOffset, endNode, endOffset, segment);
    });
  });
}

/**
 * Type text at the selection point in the LexicalEditor.
 *
 * @param text - The text to type at the selection.
 * @param startNode - The starting LexicalNode of the selection.
 * @param startOffset - The offset within the startNode where the selection begins. Defaults to the
 *   end of the startNode's text content.
 * @param endNode - The ending LexicalNode of the selection to delete. Defaults to the startNode.
 * @param endOffset - The offset within the endNode where the deletion ends. Defaults to the
 *   end of the endNode's text content.
 * @param segment - Optional segment attribute to set on the inserted text.
 */
export function $typeTextAtSelection(
  text: string,
  startNode: LexicalNode,
  startOffset?: number | undefined,
  endNode?: LexicalNode | undefined,
  endOffset?: number | undefined,
  segment?: string | undefined,
) {
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
  if (segment !== undefined) {
    rangeSelection.getNodes().forEach((node) => {
      $setState(node, segmentState, segment);
    });
  }
}

/**
 * Creates text at the selection point in the LexicalEditor.
 *
 * @param editor - The LexicalEditor instance where the selection will be set.
 * @param text - The text to create at the selection.
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

/**
 * Run generic test update logic in the LexicalEditor for the SUT (Software Under Test).
 * @param editor - The LexicalEditor instance where the update will occur.
 * @param $updateFn - The function containing the update logic.
 */
export async function sutUpdate(editor: LexicalEditor, $updateFn: () => void) {
  await act(async () => {
    editor.update(() => {
      $updateFn();
    });
  });
}
