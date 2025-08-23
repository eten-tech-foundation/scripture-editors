import { ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import { ImmutableVerseNode } from "./ImmutableVerseNode";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import { usjBaseNodes } from "shared";

export * from "./ImmutableNoteCallerNode";
export * from "./ImmutableVerseNode";
export * from "./node-react.utils";
export * from "./usj-node-options.model";

export const usjReactNodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  ...usjBaseNodes,
];
