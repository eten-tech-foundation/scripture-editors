import { SerializedLexicalNode } from "lexical";
import { isTruthy } from "./utils.js";

interface BaseMetadata {
  relativePath: (string | number)[];
}
interface OptionalMetadata {
  [key: string]: unknown;
}

export interface NodeBuilderArgs<
  SourceNode extends SerializedLexicalNode,
  ChildrenNodeType,
  Metadata = OptionalMetadata,
> {
  node: SourceNode;
  metadata: BaseMetadata & Metadata;
  children?: ChildrenNodeType[];
}

export type NodeBuilder<
  LexicalNodeType extends SerializedLexicalNode,
  NewNodeType,
  ChildrenNodeType,
  Metadata = OptionalMetadata,
> = (args: NodeBuilderArgs<LexicalNodeType, ChildrenNodeType, Metadata>) => NewNodeType;

export type MetadataBuilder<Metadata = OptionalMetadata> = <
  LexicalNodeType extends SerializedLexicalNode,
>(args: {
  node: LexicalNodeType;
  metadata: BaseMetadata & Metadata;
}) => BaseMetadata & Metadata;

interface NodeData<
  LexicalNodeType extends SerializedLexicalNode,
  NewNodeType,
  ChildrenNodeType,
  Metadata = OptionalMetadata,
> {
  node: LexicalNodeType;
  nodeBuilder?: NodeBuilder<LexicalNodeType, NewNodeType, ChildrenNodeType, Metadata>;
  metadataBuilder?: MetadataBuilder<Metadata>;
}

export const convertLexicalStateNode = <
  LexicalNodeType extends SerializedLexicalNode,
  NewNodeType,
  ChildrenNodeType,
>({
  node: nodeData,
  nodeBuilder: buildNode,
  metadataBuilder: buildMetadata = ({ metadata }) => metadata,
}: NodeData<LexicalNodeType, NewNodeType, ChildrenNodeType>): NewNodeType | undefined => {
  const _recursiveConvertLexicalStateNode = <NewNodeType>({
    node: nodeData,
    metadata = { relativePath: [] },
    nodeBuilder: buildNode,
  }: NodeData<LexicalNodeType, NewNodeType, ChildrenNodeType> & {
    metadata: { relativePath: (string | number)[] };
  }): NewNodeType | undefined => {
    if (!buildNode) {
      throw new Error("No node builder provided");
    }
    const _metadata = buildMetadata({ node: nodeData, metadata });
    if (!("children" in nodeData)) {
      return buildNode({
        node: nodeData,
        metadata: _metadata,
      });
    }

    const convertedChildren = (nodeData.children as LexicalNodeType[])
      .map((childNode, index) => {
        return _recursiveConvertLexicalStateNode({
          node: childNode,
          metadata: { ..._metadata, relativePath: [..._metadata.relativePath, index] },
          nodeBuilder: buildNode,
        });
      })
      .filter(isTruthy);

    return buildNode({
      node: nodeData,
      metadata: _metadata,
      children: convertedChildren as unknown as ChildrenNodeType[],
    });
  };
  return _recursiveConvertLexicalStateNode({
    node: nodeData,
    metadata: { relativePath: [] },
    nodeBuilder: buildNode,
  });
};
