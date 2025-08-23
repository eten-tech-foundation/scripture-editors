import { getPerfKindFromNode } from "./utils.js";
import { exportNodeToJSON } from "../../localLexical/exportNodeToJSON.js";

import { Mapper } from "../History/operations/defaults.js";
import { $isUsfmElementNode } from "../../nodes/UsfmElementNode.js";
import {
  OperationAdd,
  OperationRemove,
  OperationReplace,
  OperationType,
  Path,
} from "../History/operations/index.js";
import { PerfKind } from "./types.js";

import Epitelete from "epitelete";
import Sequence from "./Types/Sequence.js";
import Block from "./Types/Block.js";
import ContentElement from "./Types/ContentElement.js";
import { FlatDocument as PerfDocument } from "./Types/Document.js";
import transformLexicalStateToPerf from "../../converters/perf/lexicalToPerf/index.js";
import { SerializedElementNode } from "lexical";

const epi = new Epitelete({ docSetId: "bible" });
const validator = epi.validator;

export const getOperationBuilder =
  (
    extraData: {
      sequences: { [key: string]: Sequence };
      extendedOperations: { [key: string]: unknown }[];
    } = { sequences: {}, extendedOperations: [] },
  ): Mapper =>
  ({ node, operationType, path }) => {
    if (operationType === OperationType.Move) {
      return undefined;
    }
    if (!$isUsfmElementNode(node)) return undefined;
    const kind = getPerfKindFromNode(node);
    if (kind === PerfKind.Block) {
      extraData.extendedOperations.push({
        lexicalNode: node,
        operationType,
        perfPath: path,
        perfKind: kind,
      });
      if (operationType === OperationType.Remove) return buildRemoveOperation(path);
      const serializedNode = exportNodeToJSON(node);
      const { result: perfNode, sequences: sideSequences } = transformLexicalStateToPerf(
        serializedNode as SerializedElementNode,
        kind,
      );
      if (!perfNode) throw new Error("Failed to transform lexical node to perf node");
      const sequences: PerfDocument["sequences"] = {
        ...sideSequences,
        main: {
          blocks:
            kind === PerfKind.Block
              ? [perfNode as Block]
              : [{ type: "paragraph", subtype: "usfm:p", content: [perfNode as ContentElement] }],
          type: "main",
        },
      };
      const perfDocument: PerfDocument = {
        schema: {
          structure: "flat",
          structure_version: "0.2.1",
          constraints: [{ name: "perf", version: "0.2.1" }],
        },
        metadata: {},
        sequences,
        main_sequence_id: "main",
      };
      const validation = validator.validate("constraint", "perfDocument", "0.4.0", perfDocument);
      if (validation.errors?.length) {
        console.error(perfDocument, validation.errors);
        throw new Error("Validation failed");
      }
      extraData.sequences = {
        ...Object.keys(extraData.sequences).reduce(
          (sequences, sequenceKey) => {
            const sequence = extraData.sequences[sequenceKey];
            sequences[sequenceKey] = { ...sequence, blocks: [] };
            return sequences;
          },
          {} as { [key: string]: Sequence },
        ),
        ...sideSequences,
      };

      switch (operationType) {
        case OperationType.Add:
          return buildAddOperation(perfNode, path);
        case OperationType.Replace:
          return buildReplaceOperation(perfNode, path);
        default:
          throw new Error("Invalid operation type");
      }
    }
    return undefined;
  };

const buildAddOperation = (node: Sequence | Block | ContentElement, path: Path): OperationAdd => {
  return {
    path,
    value: node,
    type: OperationType.Add,
  };
};

const buildRemoveOperation = (path: Path): OperationRemove => {
  return {
    path,
    type: OperationType.Remove,
  };
};

const buildReplaceOperation = (
  node: Sequence | Block | ContentElement,
  path: Path,
): OperationReplace => {
  return {
    path,
    value: node,
    type: OperationType.Replace,
  };
};
