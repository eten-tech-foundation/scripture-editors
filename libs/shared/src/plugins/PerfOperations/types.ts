import Block from "./Types/Block.js";
import ContentElement from "./Types/ContentElement.js";
import PerfDocument from "./Types/Document.js";
import Sequence from "./Types/Sequence.js";

export const enum PerfKind {
  Sequence = "sequence",
  Block = "block",
  ContentElement = "contentElement",
  ContentText = "contentText",
}

export interface PerfKindMap {
  document: PerfDocument;
  sequence: Sequence;
  block: Block;
  contentElement: ContentElement;
}
