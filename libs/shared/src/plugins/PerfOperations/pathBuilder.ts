import { LexicalNode } from "lexical";
import { getPerfKindFromNode } from "./utils.js";
import { PerfKind } from "./types.js";
import { UsfmElementNode } from "../../nodes/UsfmElementNode.js";

export const getPathBuilder = (MainSequenceId: string) => (node: UsfmElementNode | LexicalNode) => {
  const pathArray: (string | number)[] = [];
  let currentNode: typeof node | null = node;

  while (currentNode) {
    const parent: UsfmElementNode | null = currentNode.getParent();
    const nodeKey = currentNode.getKey();
    const kind = getPerfKindFromNode(currentNode);

    if (kind === PerfKind.Sequence && currentNode instanceof UsfmElementNode) {
      pathArray.unshift(MainSequenceId); // Add the target to the path array
      currentNode = null; // Stop the loop
    } else {
      const index = parent
        ? parent.getChildrenKeys?.().findIndex((key) => nodeKey === key)
        : MainSequenceId;

      pathArray.unshift(index); // Add the index to the path array

      if (kind === PerfKind.ContentElement) {
        pathArray.unshift("content"); // Add "content" to the path array
      }

      if (kind === PerfKind.Block) {
        pathArray.unshift("blocks"); // Add "blocks" to the path array
      }
      currentNode = parent; // Move up to the parent node
      if (parent && parent.getType() === "graft") {
        const target = parent.getAttributes?.()?.["perf-target"];
        pathArray.unshift(target); // Add the target to the path array
        currentNode = null; // Stop the loop
      }
    }
  }

  return pathArray;
};
