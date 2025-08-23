import { ElementNode, LexicalNode } from "lexical";
import { Path } from "./index.js";
import { OperationType, Operation } from "./types.js";

export interface MapperArgs {
  node: LexicalNode;
  path: Path;
  from?: Path;
  operationType: OperationType;
}

export type Mapper = (args: MapperArgs) => Operation | undefined;

export const buildOperation: Mapper = ({ node, path, operationType }) => {
  const baseOperation = { value: node, path };

  switch (operationType) {
    case OperationType.Add:
      return {
        ...baseOperation,
        type: OperationType.Add,
      };
    case OperationType.Remove:
      return {
        ...baseOperation,
        type: OperationType.Remove,
      };
    case OperationType.Replace:
      return {
        ...baseOperation,
        type: OperationType.Replace,
      };
    default:
      throw new Error("Invalid action type");
  }
};
/**
 * The `PathBuilder` type is a function type that takes a `LexicalNode` as an argument and returns an array of strings.
 * It serves two purposes: path building and filtering. If the function returns `false`, the operation
 * associated with the `LexicalNode` is not added.
 *
 * @typedef {Function} PathBuilder
 * @param {LexicalNode} node - The lexical node for which to build paths.
 * @returns {string[]} An array of paths built from the lexical node. If the array is empty or `false`, the operation is not added.
 */
export type PathBuilder = <T extends LexicalNode>(
  node: T,
  rootNode?: T | null,
) => (string | number)[] | false;

export const getNodePath: PathBuilder = (node, rootNode = null) => {
  const pathArray: (string | number)[] = [];
  let currentNode: ElementNode | LexicalNode | null = node;

  while (currentNode) {
    // Check if the current node is the root node

    const parent: ElementNode | null = currentNode.getParent();
    const nodeKey = currentNode.getKey();
    if (currentNode === rootNode) {
      pathArray.unshift(nodeKey);
      break; // Exit the loop if it is the root node
    }
    const index = parent ? parent.getChildrenKeys().findIndex((key) => nodeKey === key) : "root";
    pathArray.unshift(index); // Add the index to the path array
    currentNode = parent; // Move up to the parent node
  }

  return pathArray;
};
