import { ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import { ImmutableVerseNode } from "./ImmutableVerseNode";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import { usjBaseNodes } from "shared/nodes/usj";

export const usjReactNodes: ReadonlyArray<Klass<LexicalNode> | LexicalNodeReplacement> = [
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  ...usjBaseNodes,
];
