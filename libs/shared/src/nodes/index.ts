import { WrapperNode } from "./WrapperNode.js";
import { DivisionMarkNode } from "./DivisionMarkNode.js";
import { GraftNode } from "./GraftNode.js";
import { InlineNode } from "./InlineNode.js";
import { UsfmParagraphNode } from "./UsfmParagraphNode.js";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";

export * from "./collab/index.js";
export * from "./features/index.js";
export * from "./usj/index.js";

export * from "./DivisionMarkNode.js";
export * from "./GraftNode.js";
export * from "./InlineNode.js";
export * from "./UsfmElementNode.js";
export * from "./UsfmParagraphNode.js";
export * from "./WrapperNode.js";

export const scriptureNodes = [
  WrapperNode,
  DivisionMarkNode,
  GraftNode,
  InlineNode,
  UsfmParagraphNode,
];

export const scripturePerfNodes = [...scriptureNodes] as (
  | Klass<LexicalNode>
  | LexicalNodeReplacement
)[];
