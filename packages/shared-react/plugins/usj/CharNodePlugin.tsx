import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { deepEqual } from "fast-equals";
import { LexicalEditor } from "lexical";
import { useEffect } from "react";
import { $isCharNode, CharNode } from "shared/nodes/usj/CharNode";

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

    return editor.registerNodeTransform(CharNode, $charNodeTransform);
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

  const nextNode = node.getNextSibling();
  if (
    $isCharNode(nextNode) &&
    node.getMarker() === nextNode.getMarker() &&
    deepEqual(node.getUnknownAttributes(), nextNode.getUnknownAttributes())
  ) {
    // Combine with next CharNode if it has the same attributes.
    node.append(...nextNode.getChildren());
    nextNode.remove();
  }

  const prevNode = node.getPreviousSibling();
  if (
    $isCharNode(prevNode) &&
    node.getMarker() === prevNode.getMarker() &&
    deepEqual(node.getUnknownAttributes(), prevNode.getUnknownAttributes())
  ) {
    // Combine with previous CharNode if it has the same attributes.
    prevNode.append(...node.getChildren());
    node.remove();
  }
}
