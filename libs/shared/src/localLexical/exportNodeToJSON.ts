import { $isElementNode, LexicalNode, SerializedElementNode, SerializedLexicalNode } from "lexical";

/**
 * Exports a node to JSON.
 * @param node - The node to export.
 * @returns The serialized node.
 */

export function exportNodeToJSON<SerializedNode extends SerializedLexicalNode>(
  node: LexicalNode,
): SerializedNode {
  const serializedNode = node.exportJSON();
  const nodeClass = node.constructor;

  if (serializedNode.type !== nodeClass.getType()) {
    throw new Error(
      `Serialized node type '${serializedNode.type}' does not match node type '${nodeClass.getType()}'`,
    );
  }

  if ($isElementNode(node)) {
    const serializedChildren = (serializedNode as SerializedElementNode).children;
    if (!Array.isArray(serializedChildren)) {
      throw new Error("Children must be an array");
    }

    const children = node.getChildren();

    for (const child of children) {
      const serializedChildNode = exportNodeToJSON(child);
      serializedChildren.push(serializedChildNode);
    }
  }

  // @ts-expect-error - This is a private method
  return serializedNode;
}
