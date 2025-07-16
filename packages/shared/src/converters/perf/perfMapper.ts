import { NodeBuildSource, SubtypeKey, TypeKey } from "./perfToX";
import { PerfKind } from "../../plugins/PerfOperations/types";
import Sequence from "../../plugins/PerfOperations/Types/Sequence";
import Block from "../../plugins/PerfOperations/Types/Block";
import ContentElement from "../../plugins/PerfOperations/Types/ContentElement";

type TypeKeyMap<K> = K extends Sequence["type"]
  ? PerfKind.Sequence
  : K extends Block["type"]
    ? PerfKind.Block
    : K extends ContentElement["type"]
      ? PerfKind.ContentElement
      : K extends "text"
        ? PerfKind.ContentText
        : K extends "*"
          ? PerfKind.Block | PerfKind.Sequence | PerfKind.ContentElement
          : never;

type MappedNodeBuilder<
  SourceType extends PerfKind,
  TargetType,
  PerfNodeType extends string = string,
  PerfNodeSubType extends string = string,
> = (props: NodeBuildSource<SourceType, TargetType, PerfNodeType, PerfNodeSubType>) => TargetType;
type PerfSubtypeMap<TargetType, PerfNodeType extends string = TypeKey> = {
  [key in SubtypeKey | "*"]?:
    | MappedNodeBuilder<TypeKeyMap<PerfNodeType>, TargetType, PerfNodeType, key>
    | TargetType;
};
export type PerfMap<TargetNode> = {
  "*": PerfSubtypeMap<TargetNode, "*"> & {
    "*": MappedNodeBuilder<TypeKeyMap<"*">, TargetNode> | TargetNode;
  };
  text: PerfSubtypeMap<TargetNode, "text">;
} & {
  [key in TypeKey]?: PerfSubtypeMap<TargetNode, key>;
};
/** Maps types and subtypes of a PERF element (sequence,block, contentElement)
 * given map object (perfMap) and returns a transformation of that element.
 */

export const mapPerf = <ResultType, SourceType extends PerfKind = PerfKind>({
  buildSource,
  perfMap,
}: {
  buildSource: NodeBuildSource<SourceType, ResultType>;
  perfMap: PerfMap<ResultType>;
}) => {
  // Ensure that a default transformation is provided
  if (!perfMap["*"]["*"])
    throw new Error(
      'No default transformation found, a property for `perfMap["*"]["*"]` is required.',
    );

  const { node } = buildSource;

  const { type = "*", subtype = "*" } = "subtype" in node ? node : { ...node, subtype: "*" };

  const maps = [
    perfMap[type]?.[subtype],
    perfMap["*"]?.[subtype],
    perfMap[type]?.["*"],
    perfMap["*"]["*"], //this will never be undefined,
  ];

  return ((map) =>
    typeof map === "function"
      ? (map as MappedNodeBuilder<SourceType, ResultType>)(buildSource)
      : (map as ResultType))(maps.find((map) => map !== undefined));
};
