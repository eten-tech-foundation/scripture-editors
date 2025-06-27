import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { deepEqual } from "fast-equals";
import { $getState, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { charIdState } from "shared/nodes/collab/delta.state";
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

  const nodeCid = $getState(node, charIdState);
  const nextNode = node.getNextSibling();
  if ($isCharNode(nextNode)) {
    const nextNodeCid = $getState(nextNode, charIdState);
    const bothHaveCid = !!(nodeCid && nextNodeCid);
    const bothHaveNoCid = !nodeCid && !nextNodeCid;
    if (
      node.getMarker() === nextNode.getMarker() &&
      deepEqual(node.getUnknownAttributes(), nextNode.getUnknownAttributes()) &&
      (bothHaveNoCid || (bothHaveCid && nodeCid === nextNodeCid))
    ) {
      // Combine with next CharNode if it has the same attributes.
      node.append(...nextNode.getChildren());
      nextNode.remove();
    }
  }

  const prevNode = node.getPreviousSibling();
  if ($isCharNode(prevNode)) {
    const prevNodeCid = $getState(prevNode, charIdState);
    const bothHaveCid = !!(nodeCid && prevNodeCid);
    const bothHaveNoCid = !nodeCid && !prevNodeCid;
    if (
      node.getMarker() === prevNode.getMarker() &&
      deepEqual(node.getUnknownAttributes(), prevNode.getUnknownAttributes()) &&
      (bothHaveNoCid || (bothHaveCid && nodeCid === prevNodeCid))
    ) {
      // Combine with previous CharNode if it has the same attributes.
      prevNode.append(...node.getChildren());
      node.remove();
    }
  }
}
