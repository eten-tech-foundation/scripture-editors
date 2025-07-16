import { ImmutableUnmatchedNode } from "../features/ImmutableUnmatchedNode";
import { MarkerNode } from "../features/MarkerNode";
import { UnknownNode } from "../features/UnknownNode";
import { BookNode } from "./BookNode";
import { ChapterNode } from "./ChapterNode";
import { CharNode } from "./CharNode";
import { ImmutableChapterNode } from "./ImmutableChapterNode";
import { $createImpliedParaNode, ImpliedParaNode } from "./ImpliedParaNode";
import { MilestoneNode } from "./MilestoneNode";
import { NoteNode } from "./NoteNode";
import { ParaNode } from "./ParaNode";
import { VerseNode } from "./VerseNode";
import { Klass, LexicalNode, LexicalNodeReplacement, ParagraphNode } from "lexical";

export const usjBaseNodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement> = [
  BookNode,
  ImmutableChapterNode,
  ChapterNode,
  VerseNode,
  CharNode,
  NoteNode,
  MilestoneNode,
  MarkerNode,
  UnknownNode,
  ImmutableUnmatchedNode,
  ParaNode,
  ImpliedParaNode,
  {
    replace: ParagraphNode,
    with: () => $createImpliedParaNode(),
    withKlass: ImpliedParaNode,
  },
];
