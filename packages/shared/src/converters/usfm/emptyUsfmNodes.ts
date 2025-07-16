import {
  $applyNodeReplacement,
  $createParagraphNode,
  $insertNodes,
  $isRootOrShadowRoot,
  $parseSerializedNode,
  SerializedLexicalNode,
} from "lexical";
import { $wrapNodeInElement } from "@lexical/utils";

export const $createNodeFromSerializedNode = (serializedNode: SerializedLexicalNode) => {
  return $applyNodeReplacement($parseSerializedNode(serializedNode));
};

export const $insertUsfmNode = (serializedNode: SerializedLexicalNode) => {
  const newNode = $createNodeFromSerializedNode(serializedNode);
  $insertNodes([newNode]);

  if ($isRootOrShadowRoot(newNode.getParentOrThrow())) {
    $wrapNodeInElement(newNode, $createParagraphNode).selectEnd();
  }

  return newNode;
};
