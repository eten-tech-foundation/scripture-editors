import { SerializedElementNode, SerializedTextNode } from "lexical";
import { SerializedUsfmElementNode } from "../../../nodes/UsfmElementNode";
import { FlatDocument as PerfDocument } from "../../../plugins/PerfOperations/Types/Document";
import { PerfKind } from "../../../plugins/PerfOperations/types";
import { PerfMap } from "../perfMapper";
import { DATA_PREFIX, getAttributesFromPerfElementProps, getPerfProps } from "../utils";
import { transformPerfNodeToSerializedLexicalNode } from ".";
import { getTagFromPerfSubtype } from "../utils";

export type PerfLexicalNode =
  | SerializedTextNode
  | SerializedElementNode
  | SerializedUsfmElementNode;

/**
 * builds an object (perfMap) which maps perf elements by their type and subtype
 * this is needed for mapPerf() to assign a transformation
 * to a type/subtype combination.
 */
type PerfToLexicalMapCreator = (
  perfSequences: PerfDocument["sequences"],
) => PerfMap<PerfLexicalNode>;

// const lexicalSections = {
//   unhandled: [],
//   sections: [],
// };

export const createPerfToLexicalMap: PerfToLexicalMapCreator = (perfSequences) => ({
  "*": {
    "*": ({ metadata, node, children }): SerializedUsfmElementNode => {
      const { type } = node;
      const subtype = "subtype" in node ? node.subtype : undefined;
      console.error(
        `No transformation found for type: ${type}, subtype: ${subtype}`,
        node,
        metadata,
      );
      return {
        children: children ?? [],
        format: "",
        direction: metadata.kind === PerfKind.Sequence ? null : metadata.direction.value,
        type: "inline",
        version: 1,
        indent: 0,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          class: "unsupported",
        },
      };
    },
    sequence: function ({ metadata, node, children = [] }): SerializedUsfmElementNode {
      // if (metadata.kind === PerfKind.Block) {
      //   lexicalSections.sections.push(node);
      // }
      return {
        children,
        format: "",
        direction: metadata.kind === PerfKind.Sequence ? null : metadata.direction.value,
        type: "inline",
        version: 1,
        indent: 0,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          class: "unsupported",
        },
      };
    },
  },
  main: {
    sequence: function ({ children = [] }): SerializedElementNode {
      return {
        children,
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      };
    },
  },
  text: {
    "*": ({ node }): SerializedTextNode => {
      return {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text: node.text || "",
        type: "text",
        version: 1,
      };
    },
  },
  graft: {
    "*": ({ node, metadata }): SerializedUsfmElementNode => {
      const lexicalNode =
        perfSequences !== undefined &&
        node.target !== undefined &&
        perfSequences[node.target] !== undefined
          ? transformPerfNodeToSerializedLexicalNode({
              source: {
                kind: PerfKind.Sequence,
                node: perfSequences[node.target],
              },
              perfSequences,
            })
          : undefined;
      return {
        children: lexicalNode && "children" in lexicalNode ? lexicalNode.children : [],
        direction: null,
        format: "",
        indent: 0,
        type: "graft",
        version: 1,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          class: "graft",
        },
        props: {
          isInline: metadata.kind !== PerfKind.Block,
        },
        ...getTagFromPerfSubtype({
          subtype: node.subtype,
          replacementMap: {
            title: "h1",
            introduction: "section",
            heading: "div",
            default: "span",
          },
        }),
      };
    },
  },
  paragraph: {
    "*": ({ node, children = [], metadata }): SerializedUsfmElementNode => {
      return {
        children: children,
        direction: metadata.direction.value,
        format: "",
        indent: 0,
        type: "usfmparagraph",
        version: 1,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          class: "paragraph",
        },
        ...getTagFromPerfSubtype({
          subtype: node.subtype,
          replacementMap: {
            "usfm:\\w?mt(\\d*)$": "span",
            "usfm:s": "h3",
            "usfm:r": "strong",
            "usfm:f": "span",
            "usfm:is": "h3",
            "usfm:is2": "h4",
            "usfm:is3": "h5",
            "usfm:iot": "h3",
            default: "p",
          },
        }),
      };
    },
    "usfm:x": ({ node, children, metadata: { direction } }): SerializedUsfmElementNode => {
      const caller =
        children?.length === 1 && children[0].type === "text"
          ? (children[0] as unknown as SerializedTextNode).text
          : undefined;
      return {
        children: children ?? [],
        direction: direction.value,
        format: "",
        indent: 0,
        type: "inline",
        version: 1,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          ...(caller && { "data-caller": caller }),
          class: "x",
        },
        tag: "span",
      };
    },
    "usfm:f": ({ node, children, metadata: { direction } }): SerializedUsfmElementNode => {
      const caller =
        children?.length === 1 && children[0].type === "text"
          ? (children[0] as unknown as SerializedTextNode).text
          : undefined;
      return {
        children: children ?? [],
        direction: direction.value,
        format: "",
        indent: 0,
        type: "inline",
        version: 1,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          ...(caller && { "data-caller": caller }),
          class: "f",
        },
        tag: "span",
      };
    },
  },
  wrapper: {
    "*": ({ children, node, metadata: { direction } }): SerializedUsfmElementNode => {
      return {
        children: children ?? [],
        direction: direction.value,
        format: "",
        indent: 0,
        type: "inline",
        version: 1,
        attributes: {
          ...getAttributesFromPerfElementProps(getPerfProps(node)),
          class: "wrapper",
        },
        tag: "span",
      };
    },
  },
  mark: {
    "usfm:ts": ({ node }): SerializedUsfmElementNode => ({
      indent: 0,
      direction: null,
      children: [],
      format: "",
      type: "divisionmark",
      attributes: {
        [`${DATA_PREFIX}-type`]: node.type,
        [`${DATA_PREFIX}-subtype`]: node.subtype ?? "",
        class: `${node.subtype}`,
      },
      version: 1,
      tag: "span",
    }),
    chapter: ({ node }): SerializedUsfmElementNode => {
      if (!node.atts) throw new Error("No attributes found for chapter mark");
      const textNode: SerializedTextNode = {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text: node.atts.number.toString(),
        type: "text",
        version: 1,
      };
      return {
        children: [textNode],
        direction: null,
        format: "",
        indent: 0,
        type: "divisionmark",
        version: 1,
        attributes: {
          [`${DATA_PREFIX}-atts-number`]: String(node.atts.number),
          [`${DATA_PREFIX}-type`]: node.type,
          [`${DATA_PREFIX}-subtype`]: node.subtype ?? "",
          "data-marker": "c",
          "data-number": String(node.atts.number),
          class: `${node.subtype}`,
        },
        tag: "span",
      };
    },
    verses: ({ node }): SerializedUsfmElementNode => {
      if (!node.atts) throw new Error("No attributes found for chapter mark");
      const textNode: SerializedTextNode = {
        detail: 0,
        format: 0,
        mode: "normal",
        style: "",
        text: node.atts.number.toString(),
        type: "text",
        version: 1,
      };
      return {
        children: [textNode],
        direction: null,
        format: "",
        indent: 0,
        type: "divisionmark",
        version: 1,
        attributes: {
          [`${DATA_PREFIX}-atts-number`]: String(node.atts.number),
          [`${DATA_PREFIX}-type`]: node.type,
          [`${DATA_PREFIX}-subtype`]: node.subtype ?? "",
          "data-marker": "v",
          "data-number": String(node.atts.number),
          class: `${node.subtype}`,
        },
        tag: "span",
      };
    },
  },
});
