import { $removeLeadingSpace, wasNodeCreated } from "../../nodes/usj/node-react.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getNodeByKey, LexicalEditor } from "lexical";
import { useEffect } from "react";
import { $isParaNode, ParaNode } from "shared/nodes/usj/ParaNode";

export function ParaNodePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useParaNode(editor);
  return null;
}

function useParaNode(editor: LexicalEditor) {
  useEffect(() => {
    if (!editor.hasNodes([ParaNode])) {
      throw new Error("ParaNodePlugin: ParaNode not registered on editor!");
    }

    // Update ParaNode to remove leading space and to not contain text if it is a 'b' marker.
    return editor.registerNodeTransform(ParaNode, (node: ParaNode) =>
      $paraNodeTransform(node, editor),
    );
  }, [editor]);
}

/**
 * Remove any leading space if the node was just created, e.g. by hitting the enter key in the
 * middle of a paragraph. Update ParaNode to not contain text if it is a 'b' marker (blank line).
 * However, if the 'b' ParaNode already contained text, it can be modified (backwards compatible
 * with PT9 & USFM v3.0).
 * @param node - ParaNode thats needs updating.
 */
function $paraNodeTransform(node: ParaNode, editor: LexicalEditor): void {
  if (wasNodeCreated(editor, node.getKey())) $removeLeadingSpace(node.getFirstChild());

  if (!$isParaNode(node) || node.getMarker() !== "b" || node.isEmpty()) return;

  const prevEditorState = editor.getEditorState();
  const wasEmpty = prevEditorState.read(() => {
    const prevNode = $getNodeByKey(node.getKey());
    return $isParaNode(prevNode) && (prevNode?.isEmpty() ?? false);
  });
  if (!wasEmpty) return;

  node.clear();
}
