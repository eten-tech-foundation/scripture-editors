import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { deepEqual } from "fast-equals";
import { $getState, LexicalEditor, TextNode } from "lexical";
import { useEffect } from "react";
import { $hasSameCharAttributes, $isCharNode, charIdState, CharNode, NBSP } from "shared";

/** Combine adjacent CharNodes with the same attributes. */
export function CharNodePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useCharNode(editor);
  return null;
}

function useCharNode(editor: LexicalEditor) {
  useEffect(() => {
    if (!editor.hasNodes([CharNode])) {
      throw new Error("CharNodePlugin: CharNode not registered on editor!");
    }

    return mergeRegister(
      editor.registerNodeTransform(CharNode, $charNodeTransform),
      editor.registerNodeTransform(TextNode, $charTextNodeTransform),
    );
  }, [editor]);
}

/**
 * Combine adjacent CharNodes with the same attributes.
 * @param node - CharNode thats needs updating.
 * @param editor - LexicalEditor instance.
 */
function $charNodeTransform(node: CharNode): void {
  if (!$isCharNode(node)) return;

  if (node.isEmpty()) {
    node.remove();
    return;
  }

  const style = node.getMarker();
  const cid = $getState(node, charIdState);
  const unknownAttributes = node.getUnknownAttributes();
  const nextNode = node.getNextSibling();
  if (
    $isCharNode(nextNode) &&
    $hasSameCharAttributes({ style, cid }, nextNode) &&
    deepEqual(unknownAttributes, nextNode.getUnknownAttributes())
  ) {
    // Combine with next CharNode since it has the same attributes.
    node.append(...nextNode.getChildren());
    nextNode.remove();
  }

  const prevNode = node.getPreviousSibling();
  if (
    $isCharNode(prevNode) &&
    $hasSameCharAttributes({ style, cid }, prevNode) &&
    deepEqual(unknownAttributes, prevNode.getUnknownAttributes())
  ) {
    // Combine with previous CharNode since it has the same attributes.
    prevNode.append(...node.getChildren());
    node.remove();
  }
}

/**
 * Remove 'empty' placeholder in CharNode once other text content is added.
 * @param node - TextNode that might be a placeholder.
 */
function $charTextNodeTransform(node: TextNode): void {
  const parent = node.getParent();
  if (!$isCharNode(parent) || parent.getChildrenSize() !== 1) return;

  const text = node.getTextContent();
  if (text.length > 1 && text.startsWith(NBSP)) {
    node.setTextContent(text.slice(1));
    node.selectEnd();
  }
}
