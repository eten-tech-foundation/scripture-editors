import Block, { BlockTypeMap } from "../../plugins/PerfOperations/Types/Block.js";
import ContentElement, {
  Content,
  ContentElementTypeMap,
} from "../../plugins/PerfOperations/Types/ContentElement.js";
import { FlatDocument as PerfDocument } from "../../plugins/PerfOperations/Types/Document.js";
import Sequence from "../../plugins/PerfOperations/Types/Sequence.js";
import { PerfKind } from "../../plugins/PerfOperations/types.js";
import { pushToArray } from "./utils.js";

export type TypeKey = NonNullable<
  Sequence["type"] | Block["type"] | ContentElement["type"] | "text"
>;

export type SubtypeKey = NonNullable<"sequence" | Block["subtype"] | ContentElement["subtype"]>;

export interface SequenceBuildSource<T> {
  metadata: { kind: PerfKind.Sequence; path: string; sequenceId: string };
  node: Sequence & { subtype: "sequence" };
  children?: T[];
}

export interface BlockBuildSource<T, BlockType extends Block = Block> {
  metadata: { kind: PerfKind.Block; path: string; direction: { value: "ltr" | "rtl" | null } };
  node: BlockType;
  metaChildren: T[];
  children?: T[];
}

export interface ContentElementBuildSource<
  T,
  ContentElementType extends ContentElement = ContentElement,
> {
  metadata: {
    kind: PerfKind.ContentElement;
    path: string;
    direction: { value: "ltr" | "rtl" | null };
  };
  node: ContentElementType;
  metaChildren: T[];
  children?: T[];
}

export interface ContentTextBuildSource {
  metadata: {
    kind: PerfKind.ContentText;
    path: string;
    direction: { value: "ltr" | "rtl" | null };
  };
  node: {
    type: "text";
    text: string;
  };
}

export type NodeBuildSource<
  SourceType extends PerfKind,
  TargetType,
  PerfNodeType extends string = string,
  PerfNodeSubType extends string = string,
> = SourceType extends PerfKind.Sequence
  ? SequenceBuildSource<TargetType>
  : SourceType extends PerfKind.Block
    ? BlockBuildSource<TargetType, BlockTypeMap<PerfNodeType>>
    : SourceType extends PerfKind.ContentElement
      ? ContentElementBuildSource<TargetType, ContentElementTypeMap<PerfNodeType, PerfNodeSubType>>
      : ContentTextBuildSource;

export type NodeBuilder<NodeType> = <SourceType extends PerfKind>(
  props: NodeBuildSource<SourceType, NodeType>,
) => NodeType;

export const convertPerf = <TargetType>({
  perfDocument,
  nodeBuilder,
}: {
  perfDocument: PerfDocument;
  nodeBuilder: NodeBuilder<TargetType>;
}) => {
  if (!perfDocument.sequences) throw new Error("No sequences found in the PERF document");
  const sequences = perfDocument.sequences;
  return {
    ...perfDocument,
    sequences: Object.keys(sequences).reduce(
      (convertedSequences: { [key: string]: TargetType }, sequenceId) => {
        convertedSequences[sequenceId] = convertSequence({
          sequence: sequences[sequenceId],
          sequenceId,
          nodeBuilder,
        });
        return convertedSequences;
      },
      {},
    ),
  };
};

export const convertSequence = <TargetType>({
  sequence,
  sequenceId,
  nodeBuilder: buildNode,
}: {
  sequence: Sequence;
  sequenceId: string;
  nodeBuilder: NodeBuilder<TargetType>;
}) => {
  if (!sequence.blocks) throw new Error("Sequence must have blocks??");
  const { blocks } = sequence;
  const path = `$.sequences.${sequenceId}`;
  const convertedBlocks: TargetType[] = [];
  const children = blocks?.reduce(
    (convertedBlocks, block, index) =>
      ((convertedBlock) =>
        convertedBlock ? pushToArray(convertedBlocks, convertedBlock) : convertedBlocks)(
        convertBlock({
          block,
          nodeBuilder: buildNode,
          path: path + `.blocks[${index}]`,
        }),
      ),
    convertedBlocks,
  );
  return buildNode<PerfKind.Sequence>({
    metadata: {
      path,
      kind: PerfKind.Sequence,
      sequenceId,
    },
    node: { ...sequence, subtype: "sequence" },
    children,
  });
};

export const convertBlock = <TargetType>({
  block,
  nodeBuilder: buildNode,
  path = "",
}: {
  block: Block;
  nodeBuilder: NodeBuilder<TargetType>;
  path?: string;
}) => {
  const { convertedContentNodes, direction } = getContents<TargetType>({
    content: "content" in block && block.content ? block.content : [],
    nodeBuilder: buildNode,
    path,
  });

  const { convertedContentNodes: metaContent } = getContents<TargetType>({
    content: "meta_content" in block && block.meta_content ? block.meta_content : [],
    nodeBuilder: buildNode,
    path,
  });

  return buildNode<PerfKind.Block>({
    metadata: {
      path: path,
      kind: PerfKind.Block,
      direction,
    },
    metaChildren: metaContent,
    node: block,
    children: convertedContentNodes,
  });
};

const setTextDirection = (dir: { value: "rtl" | "ltr" | null }, contentItem: string) => {
  if (dir.value === undefined) dir.value = getTextDirection(contentItem);
  return dir;
};

function convertContentItem<TargetType>(
  contentItem: string | ContentElement,
  buildNode: NodeBuilder<TargetType>,
  contentPath: string,
  direction: { value: null | "rtl" | "ltr" },
): TargetType | undefined {
  if (typeof contentItem === "string") {
    return buildNode<PerfKind.ContentText>({
      metadata: {
        path: contentPath,
        kind: PerfKind.ContentText,
        direction: setTextDirection(direction, contentItem),
      },
      node: { text: contentItem, type: "text" },
    });
  } else {
    return convertContentElement({
      element: contentItem,
      nodeBuilder: buildNode,
      path: contentPath,
    });
  }
}

export const getContents = <TargetType>({
  content,
  nodeBuilder: buildNode,
  path = "",
}: {
  content: Content;
  nodeBuilder: NodeBuilder<TargetType>;
  path?: string;
}): {
  convertedContentNodes: TargetType[];
  direction: {
    value: null | "rtl" | "ltr";
  };
} => {
  if (!content) {
    return { convertedContentNodes: [], direction: { value: null } };
  }

  const convertedContentNodes: TargetType[] = [];
  const direction = { value: null as null | "rtl" | "ltr" };

  for (let index = 0; index < content.length; index++) {
    const contentItem = content[index];
    const contentPath = `${path}.content[${index}]`;
    const convertedContentNode = convertContentItem<TargetType>(
      contentItem,
      buildNode,
      contentPath,
      direction,
    );

    if (convertedContentNode) {
      convertedContentNodes.push(convertedContentNode);
    }
  }

  return { convertedContentNodes, direction };
};

export const convertContentElement = <TargetType>({
  element,
  nodeBuilder: buildNode,
  path = "",
}: {
  element: ContentElement;
  nodeBuilder: NodeBuilder<TargetType>;
  path?: string;
}) => {
  const { convertedContentNodes, direction } = getContents<TargetType>({
    content: "content" in element && element.content ? element.content : [],
    nodeBuilder: buildNode,
    path,
  });

  const { convertedContentNodes: metaContent } = getContents<TargetType>({
    content: "meta_content" in element && element.meta_content ? element.meta_content : [],
    nodeBuilder: buildNode,
    path,
  });

  return buildNode<PerfKind.ContentElement>({
    metadata: {
      path,
      kind: PerfKind.ContentElement,
      direction,
    },
    node: element,
    metaChildren: metaContent,
    children: convertedContentNodes,
  });
};

const RTL = "\\u0591-\\u07FF\\uFB1D-\\uFDFD\\uFE70-\\uFEFC";
const LTR =
  "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6" +
  "\\u00F8-\\u02B8\\u0300-\\u0590\\u0800-\\u1FFF\\u200E\\u2C00-\\uFB1C" +
  "\\uFE00-\\uFE6F\\uFEFD-\\uFFFF";

// eslint-disable-next-line no-misleading-character-class
export const RTL_REGEX = new RegExp("^[^" + LTR + "]*[" + RTL + "]");
// eslint-disable-next-line no-misleading-character-class
export const LTR_REGEX = new RegExp("^[^" + RTL + "]*[" + LTR + "]");

export function getTextDirection(text: string) {
  if (RTL_REGEX.test(text)) {
    return "rtl";
  }
  if (LTR_REGEX.test(text)) {
    return "ltr";
  }
  return null;
}

export default convertPerf;
