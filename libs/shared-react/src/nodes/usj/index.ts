import { ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import { ImmutableVerseNode } from "./ImmutableVerseNode";
import { Klass, LexicalNode, LexicalNodeReplacement } from "lexical";
import { usjBaseNodes, VerseBlockNode } from "shared";

export * from "./ImmutableNoteCallerNode";
export * from "./ImmutableVerseNode";
export * from "./node-react.utils";
export * from "./usj-node-options.model";

export const usjReactNodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  ImmutableNoteCallerNode,
  ImmutableVerseNode,
  ...usjBaseNodes,
];

/**
 * Nodes for the block verse layout (`ViewOptions.verseLayout`). Register these instead of
 * {@link usjReactNodes} when that layout is active, so every other editor's node registry is
 * unchanged.
 *
 * A Lexical editor's node types are fixed when it is created, so an editor registered with
 * `usjReactNodes` cannot be switched to the block verse layout - it has to be recreated.
 */
export const usjBlockVerseNodes: readonly (Klass<LexicalNode> | LexicalNodeReplacement)[] = [
  VerseBlockNode,
  ...usjReactNodes,
];
