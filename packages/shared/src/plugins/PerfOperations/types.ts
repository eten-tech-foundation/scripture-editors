import Block from "./Types/Block";
import ContentElement from "./Types/ContentElement";
import PerfDocument from "./Types/Document";
import Sequence from "./Types/Sequence";

export const enum PerfKind {
  Sequence = "sequence",
  Block = "block",
  ContentElement = "contentElement",
  ContentText = "contentText",
}

export type PerfKindMap = {
  document: PerfDocument;
  sequence: Sequence;
  block: Block;
  contentElement: ContentElement;
};
