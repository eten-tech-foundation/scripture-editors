import { ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import { ImmutableVerseNode } from "./ImmutableVerseNode";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import { usjBaseNodes } from "shared";

export * from "./ImmutableNoteCallerNode";
export * from "./ImmutableVerseNode";
export * from "./node-react.utils";
export * from "./usj-node-options.model";

// AttributeRunNode rides in via usjBaseNodes (shared) — every USJ-shaped editor needs it, not only
// a react host, since the shared self-healing syncs construct one directly.
export const usjReactNodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  ...usjBaseNodes,
];
