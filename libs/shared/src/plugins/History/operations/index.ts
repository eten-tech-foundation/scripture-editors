import { $getNodeByKey } from "lexical";
import type { EditorState, NodeKey } from "lexical";
import { buildOperation, getNodePath } from "./defaults.js";
import type { Mapper, PathBuilder } from "./defaults.js";
import { Operation, OperationType } from "./types.js";

export * from "./types.js";

export type Path = (string | number)[];

interface StateHistory {
  editorState: EditorState;
  prevEditorState: EditorState;
}

type OperationsSource = {
  dirtyNodes: Set<NodeKey> | Map<NodeKey, boolean>;
} & StateHistory;

interface OperationCallback {
  operationBuilder?: Mapper;
  pathBuilder?: PathBuilder;
}

type GetOperationsParams = OperationsSource & OperationCallback;

/**
 * Retrieves the operations for the dirty nodes.
 * @param dirtyNodes - The dirty nodes.
 * @param editorState - The current editor state.
 * @param prevEditorState - The previous editor state.
 * @param [mapper] - The mapper function to convert the node to an operation.
 * @param [pathBuilder] - The path builder function to generate the path of the node.
 * @returns The array of operations.
 */
export const $getOperations = ({
  dirtyNodes,
  editorState,
  prevEditorState,
  operationBuilder = buildOperation,
  pathBuilder = getNodePath,
}: GetOperationsParams): Operation[] => {
  const operations = [];
  for (const dirtyNode of dirtyNodes) {
    const nodeKey = Array.isArray(dirtyNode) ? dirtyNode[0] : dirtyNode;
    const operation = $getOperation({
      nodeKey,
      prevEditorState,
      editorState,
      pathBuilder,
      operationBuilder,
    });
    if (Array.isArray(operation)) {
      operations.push(...operation.filter((op): op is Operation => op !== undefined));
    } else if (operation) {
      operations.push(operation);
    }
  }
  return operations;
};

type OperationSource = {
  nodeKey: NodeKey;
} & StateHistory;

type GetOperationParams = OperationSource & OperationCallback;

/**
 * Retrieves the Operation object for a given node.
 * @param nodeKey - The key of the node.
 * @param prevEditorState - The previous editor state.
 * @param editorState - The current editor state.
 * @param [mapper] - The mapper function to convert the node to an operation.
 * @param [pathBuilder] - The path builder function to generate the path of the node.
 * @returns The Operation object.
 */
export const $getOperation = ({
  nodeKey,
  editorState,
  prevEditorState,
  operationBuilder = buildOperation,
  pathBuilder = getNodePath,
}: GetOperationParams) => {
  const previousNode = $getNodeByKey(nodeKey, prevEditorState);
  const currentNode = $getNodeByKey(nodeKey, editorState);
  if (!currentNode && !previousNode)
    throw new Error(
      `Failed to generate operation for nodeKey ${nodeKey}: Dirty node not found in current or previous editor state. Please verify the dirty nodes list.`,
    );

  // If the previous node doesn't exist, it's an add operation
  if (!previousNode && currentNode) {
    return editorState.read(() => {
      const currentPath = pathBuilder(currentNode);
      return currentPath === false
        ? undefined
        : operationBuilder({
            node: currentNode,
            path: currentPath,
            operationType: OperationType.Add,
          });
    });
  }

  // If the current node doesn't exist, it's a delete operation
  if (!currentNode && previousNode) {
    return prevEditorState.read(() => {
      const previousPath = pathBuilder(previousNode);
      return previousPath === false
        ? undefined
        : operationBuilder({
            node: previousNode,
            path: previousPath,
            operationType: OperationType.Remove,
          });
    });
  }

  // If both nodes exist, it's a replace or move operation
  if (currentNode && previousNode) {
    const previousPath = prevEditorState.read(() => pathBuilder(previousNode));
    return editorState.read(() => {
      const currentPath = pathBuilder(currentNode);
      if (previousPath === false || currentPath === false) return undefined;

      // If the current path is different from the previous path, it's a move operation
      if (currentPath.join("/") !== previousPath.join("/")) return;
      operationBuilder({
        node: currentNode,
        from: previousPath,
        path: currentPath,
        operationType: OperationType.Move,
      });

      // Otherwise, it's a replace operation
      return operationBuilder({
        node: currentNode,
        path: currentPath,
        operationType: OperationType.Replace,
      });
    });
  }

  return undefined;
};
