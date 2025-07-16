import { NodeBuildSource, convertBlock, convertContentElement, convertSequence } from "../perfToX";
import { FlatDocument as PerfDocument } from "../../../plugins/PerfOperations/Types/Document";
import { PerfKind } from "../../../plugins/PerfOperations/types";
import Sequence from "../../../plugins/PerfOperations/Types/Sequence";
import Block from "../../../plugins/PerfOperations/Types/Block";
import ContentElement from "../../../plugins/PerfOperations/Types/ContentElement";
import { PerfMap, mapPerf } from "../perfMapper";
import { PerfLexicalNode, createPerfToLexicalMap } from "./perfToLexicalMap";

export const transformPerfDocumentToSerializedLexicalState = (
  perfDocument: PerfDocument,
  sequenceId: string,
  perfMap: PerfMap<PerfLexicalNode>,
) => {
  if (!perfDocument.sequences) throw new Error("No sequences found in the PERF document");
  const nodeAdapter = (buildSource: NodeBuildSource<PerfKind, PerfLexicalNode>) => {
    const map = mapPerf({
      buildSource: buildSource,
      perfMap: perfMap ?? createPerfToLexicalMap(perfDocument.sequences),
    });
    return map;
  };

  return {
    root: convertSequence<PerfLexicalNode>({
      sequence: perfDocument.sequences[sequenceId],
      sequenceId,
      nodeBuilder: nodeAdapter,
    }),
  };
};
export default transformPerfDocumentToSerializedLexicalState;

type NodeSource =
  | { node: Sequence; kind: PerfKind.Sequence; sequenceId?: string }
  | { node: Block; kind: PerfKind.Block }
  | { node: ContentElement; kind: PerfKind.ContentElement };

export function transformPerfNodeToSerializedLexicalNode({
  source,
  perfSequences,
  perfMap,
}: {
  source: NodeSource;
  perfSequences: PerfDocument["sequences"];
  perfMap?: PerfMap<PerfLexicalNode>;
}) {
  const { node, kind } = source;

  const _perfMap = perfMap ?? createPerfToLexicalMap(perfSequences);
  const nodeBuilder = (props: NodeBuildSource<PerfKind, PerfLexicalNode>) => {
    return mapPerf({
      buildSource: props,
      perfMap: _perfMap,
    });
  };
  if (kind === PerfKind.Sequence) {
    return convertSequence<PerfLexicalNode>({
      sequence: node,
      sequenceId: source.sequenceId ?? "",
      nodeBuilder,
    });
  }
  if (kind === PerfKind.Block) {
    return convertBlock<PerfLexicalNode>({
      block: node,
      nodeBuilder,
    });
  }
  if (kind === "contentElement") {
    return convertContentElement<PerfLexicalNode>({
      element: node,
      nodeBuilder,
    });
  }
  throw new Error(`Unsupported kind: ${kind}`);
}
