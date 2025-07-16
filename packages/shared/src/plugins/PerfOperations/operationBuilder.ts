import { getPerfKindFromNode } from "./utils";
import { exportNodeToJSON } from "../../localLexical/exportNodeToJSON";

import { Mapper } from "../History/operations/defaults";
import { $isUsfmElementNode } from "../../nodes/UsfmElementNode";
import {
  OperationAdd,
  OperationRemove,
  OperationReplace,
  OperationType,
  Path,
} from "../History/operations/index.d";
import { PerfKind } from "./types";

import Epitelete from "./epitelete";
import Sequence from "./Types/Sequence";
import Block from "./Types/Block";
import ContentElement from "./Types/ContentElement";
import { FlatDocument as PerfDocument } from "./Types/Document";
import transformLexicalStateToPerf from "../../converters/perf/lexicalToPerf";
import { SerializedElementNode } from "lexical";

const epi = new Epitelete({ docSetId: "bible" });
const validator = epi.validator;

export const getOperationBuilder =
  (
    extraData: {
      sequences: Record<string, Sequence>;
      extendedOperations: Array<Record<string, unknown>>;
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
          {} as Record<string, Sequence>,
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
