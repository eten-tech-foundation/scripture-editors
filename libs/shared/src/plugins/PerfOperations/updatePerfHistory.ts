import { transformLexicalStateToPerf } from "../../converters/perf/lexicalToPerf/index.js";
import { SerializedUsfmElementNode } from "../../nodes/UsfmElementNode.js";
import { HistoryMergeListener } from "../History/index.js";
import { $getOperations } from "../History/operations/index.js";
import { getOperationBuilder } from "./operationBuilder.js";
import { getPathBuilder } from "./pathBuilder.js";
import { getLexicalState } from "../../contentManager/index.js";
import { applyPatch } from "open-patcher";

import {
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $parseSerializedNode,
  $setSelection,
  BaseSelection,
  EditorState,
  ElementNode,
  LexicalNode,
  SerializedElementNode,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import { Operation } from "open-patcher/dist/types.js";
import { HistoryStateEntry } from "../History/HistoryManager.js";

import { deepEqual, getPerfKindFromNode } from "./utils.js";
import { getNodePath } from "../History/operations/defaults.js";
import { exportNodeToJSON } from "../../localLexical/exportNodeToJSON.js";
import { getDiff } from "json-difference";
import { PerfKind } from "./types.js";
import { OperationType } from "../History/operations/index.js";
import { FlatDocument as PerfDocument } from "./Types/Document.js";
import { transformPerfNodeToSerializedLexicalNode } from "../../converters/perf/perfToLexical/index.js";

const DEFAULT_ROUNDTRIP_EXCEPTIONS = ["direction"];

/**
 * Returns a history merge listener function that updates the perf history.
 * @param perfSource - The initial perf document.
 * @returns A history merge listener function.
 */
export const getPerfHistoryUpdater: (
  perfSource: PerfDocument,
  roundtripExcludedKeys?: string[],
  perfAlignment?: { [key: string]: string },
) => HistoryMergeListener =
  (perfSource, roundtripExcludedKeys = DEFAULT_ROUNDTRIP_EXCEPTIONS) =>
  /**
   * Updates the perf history based on editor changes.
   * @param editorChanged - Indicates whether the editor has changed.
   * @param dirtyElements - The dirty elements in the editor.
   * @param editorState - The current editor state.
   * @param prevEditorState - The previous editor state.
   * @param history - The history object.
   */
  ({ editorChanged, dirtyElements, editorState, prevEditorState, history, tags }) => {
    const { canUndo, mergeHistory, currentEntry = {} } = history;
    const { perfDocument: prevPerfDocument, editor: currentEditor } =
      (currentEntry as HistoryStateEntry<{
        perfDocument: PerfDocument;
      }>) || {};
    // History initialization
    if (!canUndo && !prevPerfDocument) {
      mergeHistory({ perfDocument: perfSource });
      return;
    }
    // If the editor has not changed, return
    if (!editorChanged) return;

    try {
      if (!tags.has("history-merge")) {
        const extendedOperations: {
          lexicalNode: LexicalNode;
          operationType: OperationType;
          perfPath: string[];
          perfKind: PerfKind;
        }[] = [];
        const sideSequences = {};
        const extraData = { sequences: sideSequences, extendedOperations };

        // Get the operations (add, remove, replace) for the dirty elements
        const perfElementOperations = $getOperations({
          dirtyNodes: dirtyElements,
          editorState,
          prevEditorState,
          pathBuilder: getPathBuilder(prevPerfDocument["main_sequence_id"] ?? "main_sequence"),
          operationBuilder: getOperationBuilder(extraData),
        }) as Operation[];

        // Apply the operations to the previous perf document sequences
        const patchedSequences = applyPatch({
          source: { ...extraData.sequences, ...prevPerfDocument.sequences },
          operations: [...perfElementOperations],
        });

        // Patch the sequences in the previous perf document
        const patchedPerfDocument = { ...prevPerfDocument, sequences: patchedSequences };

        // Merge the history with the patched perf document
        mergeHistory({
          perfDocument: patchedPerfDocument,
        });

        // Patch editor state with the patched perf document if the editor state is not in sync with the perf document
        const start = performance.now();
        editorState.read(() => {
          extraData.extendedOperations.forEach((operation, index) => {
            // Skip remove operations
            if (operation.operationType === "remove") return undefined;

            // Convert the current lexical node to a Serialized Element Node
            const editorLexicalNode = exportNodeToJSON<SerializedUsfmElementNode>(
              operation.lexicalNode,
            );

            // Convert the patched perf node to a Serialized Element Node
            const patchedLexicalNode = transformPerfNodeToSerializedLexicalNode({
              source: {
                node: perfElementOperations[index].value,
                kind: getPerfKindFromNode(operation.lexicalNode),
              },
              perfSequences: patchedPerfDocument.sequences,
            });

            // Check both nodes have the same type and structure
            if (
              editorLexicalNode.type !== patchedLexicalNode.type ||
              editorLexicalNode?.children?.length !==
                (patchedLexicalNode as SerializedElementNode).children?.length
            ) {
              console.error({ currentNode: editorLexicalNode, convertedNode: patchedLexicalNode });
              throw new Error(
                "Current node and converted node have different types, or different structure. Unable to merge.",
              );
            }

            if (!deepEqual(editorLexicalNode, patchedLexicalNode, roundtripExcludedKeys)) {
              console.error(
                "Roundtrip failure. Perf node does not match the editor node. Editor node will be replaced with perf node to maintain synchronization",
                "Incompatible nodes:",
                {
                  diff: getDiff(editorLexicalNode, patchedLexicalNode),
                  nodes: { editorLexicalNode, patchedLexicalNode },
                },
              );
              currentEditor.update(
                () => {
                  const newNode = $parseSerializedNode(patchedLexicalNode);
                  $restoreSelection(operation.lexicalNode, newNode);
                  operation.lexicalNode.replace(newNode);
                },
                { tag: "history-merge" },
              );
            } else {
              console.info(
                "%cNode roundtrip successful",
                "color: white;background-color:#46b46b;padding:4px;",
              );
              return true;
            }

            return undefined;
          });
        });
        // Check the roundtrip of the patched document (should remove this in production)
        const roundtripped = checkRoundtrip({
          editorState,
          patchedPerfState: patchedPerfDocument,
          roundtripExcludedKeys,
          show: true,
        });
        const end = performance.now();
        const duration = end - start;
        console.info(`Function Execution Time: ${duration / 1000} seconds`);
        if (!roundtripped) throw new Error("File roundtrip failed.");
      }
    } catch (e) {
      console.error(e);
      currentEditor.dispatchCommand(UNDO_COMMAND, undefined);
      console.error("An error occurred. Changes have been reverted.");
    }
  };

const $restoreSelection = (prevRootNode: LexicalNode, newRootNode: LexicalNode) => {
  const currentSelection = $getSelection() as BaseSelection;
  const selectedNodes = currentSelection.getStartEndPoints();
  if (!selectedNodes) throw new Error("Selected nodes not found.");
  const selectedNode = selectedNodes[selectedNodes.length - 1];
  const focusedNode = $getNodeByKey(selectedNode.key);
  if (!focusedNode) throw new Error("Focused node not found.");
  const focusedNodePath = getNodePath(focusedNode, prevRootNode);
  if (!focusedNodePath) throw new Error("Focused node path not found.");
  const newFocusedNode = $getNodeByPath(focusedNodePath, newRootNode);
  if (!newFocusedNode) throw new Error("New focused node not found.");
  if (!(newFocusedNode instanceof TextNode))
    throw new Error("New focused node is not an TextNode.");
  const newSelection = $createRangeSelection();
  newSelection.setTextNodeRange(
    newFocusedNode,
    selectedNode.offset,
    newFocusedNode,
    selectedNode.offset,
  );
  $setSelection(newSelection);
};

function $getNodeByPath(
  path: (string | number)[],
  _rootNode: LexicalNode,
): TextNode | LexicalNode | null {
  const [rootKey, ...relativePath] = path;
  const rootNode = _rootNode ?? $getNodeByKey(rootKey + "");
  let currentNode: LexicalNode | null = rootNode;
  for (const key of relativePath) {
    if (currentNode instanceof ElementNode) {
      const child: LexicalNode | null = currentNode.getChildAtIndex(parseInt(key + ""));
      if (child) {
        currentNode = child;
      } else {
        return null;
      }
    }
  }
  return currentNode;
}

/**
 * Checks the roundtrip of the patched perf document and logs any differences.
 * @param editorState - The current editor state.
 * @param patchedPerfDocument - The patched perf document.
 * @param show - Indicates whether to show the roundtrip check results.
 */
const checkRoundtrip = ({
  editorState,
  patchedPerfState,
  roundtripExcludedKeys,
  show = true,
}: {
  editorState: EditorState;
  patchedPerfState: PerfDocument;
  roundtripExcludedKeys: string[];
  show: boolean;
}) => {
  if (!show) return;
  const editorLexicalState = editorState.toJSON();
  const _editorPerfState = transformLexicalStateToPerf(
    editorLexicalState.root as SerializedUsfmElementNode,
    PerfKind.Sequence,
  );
  const editorPerfState = {
    ...patchedPerfState,
    sequences: {
      [patchedPerfState["main_sequence_id"] ?? "main_sequence"]: _editorPerfState.result,
      ..._editorPerfState.sequences,
    },
  };
  console.log("Checking roundtrip...");
  // Check if the patched document is equal to the lexicalState converted to Perf
  const isPerfEqual = deepEqual(editorPerfState, patchedPerfState);

  // If they are not equal, log the source and target for comparison
  if (!isPerfEqual) {
    console.log("Is perf deep equal:", isPerfEqual);
    console.log({ editorPerfState, patchedPerfState });
    console.log(getDiff(editorPerfState, patchedPerfState));
  }

  // Get a lexical state from the patched perf document
  const patchedLexicalState = getLexicalState(patchedPerfState);

  // Check if the patched lexical state is equal to the editor's lexical state
  const isLexicalEqual = deepEqual(editorLexicalState, patchedLexicalState, roundtripExcludedKeys);

  // If they are not equal, log the source and target for comparison
  if (!isLexicalEqual) {
    console.log("Is lexical deep equal:", isLexicalEqual);
    console.log({ editorLexicalState, patchedLexicalState });
    console.log(getDiff(editorLexicalState, patchedLexicalState));
  }

  if (!isLexicalEqual && !isPerfEqual) {
    console.warn("Roundtrip failed");
    return false;
  } else {
    console.log(
      "%cFile roundtrip successful",
      "color: white;background-color:#46b46b;padding:4px;",
    );
    return true;
  }
};
