import { ImmutableTypedTextNode } from "../features/ImmutableTypedTextNode.js";
import { ImmutableUnmatchedNode } from "../features/ImmutableUnmatchedNode.js";
import { MarkerNode } from "../features/MarkerNode.js";
import { UnknownNode } from "../features/UnknownNode.js";
import { BookNode } from "./BookNode.js";
import { ChapterNode } from "./ChapterNode.js";
import { CharNode } from "./CharNode.js";
import { ImmutableChapterNode } from "./ImmutableChapterNode.js";
import { $createImpliedParaNode, ImpliedParaNode } from "./ImpliedParaNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { NoteNode } from "./NoteNode.js";
import { ParaNode } from "./ParaNode.js";
import { VerseNode } from "./VerseNode.js";
import { Klass, LexicalNode, LexicalNodeReplacement, ParagraphNode } from "lexical";

export * from "./BookNode.js";
export * from "./ChapterNode.js";
export * from "./CharNode.js";
export * from "./ImmutableChapterNode.js";
export * from "./ImpliedParaNode.js";
export * from "./MilestoneNode.js";
export * from "./node-constants.js";
export * from "./node.utils.js";
export * from "./NoteNode.js";
export * from "./ParaNode.js";
export * from "./VerseNode.js";

export const usjBaseNodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  BookNode,
  ImmutableChapterNode,
  ChapterNode,
  VerseNode,
  CharNode,
  NoteNode,
  MilestoneNode,
  MarkerNode,
  UnknownNode,
  ImmutableTypedTextNode,
  ImmutableUnmatchedNode,
  ParaNode,
  ImpliedParaNode,
  {
    replace: ParagraphNode,
    with: () => $createImpliedParaNode(),
    withKlass: ImpliedParaNode,
  },
];
