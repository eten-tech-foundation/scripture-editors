import { ImmutableTypedTextNode } from "../features/ImmutableTypedTextNode.js";
import { ImmutableUnmatchedNode } from "../features/ImmutableUnmatchedNode.js";
import { MarkerNode } from "../features/MarkerNode.js";
import { UnknownNode } from "../features/UnknownNode.js";
import { AttributeRunNode } from "./AttributeRunNode.js";
import { BookNode } from "./BookNode.js";
import { ChapterNode } from "./ChapterNode.js";
import { CharNode } from "./CharNode.js";
import { ImmutableChapterNode } from "./ImmutableChapterNode.js";
import { ImmutableTableNode } from "./ImmutableTableNode.js";
import { ImmutableTableRowNode } from "./ImmutableTableRowNode.js";
import { ImmutableTableCellNode } from "./ImmutableTableCellNode.js";
import { $createImpliedParaNode, ImpliedParaNode } from "./ImpliedParaNode.js";
import { MilestoneNode } from "./MilestoneNode.js";
import { NoteNode } from "./NoteNode.js";
import { ParaNode } from "./ParaNode.js";
import { VerseNode } from "./VerseNode.js";
import { Klass, LexicalNode, LexicalNodeReplacement, ParagraphNode } from "lexical";

export * from "./attributeDisplay.utils.js";
export * from "./displayRunDescriptor.js";
export * from "./displayRunSync.utils.js";
export * from "./pendedDisplayOwners.utils.js";
export * from "./AttributeRunNode.js";
export * from "./BookNode.js";
export * from "./ChapterNode.js";
export * from "./CharNode.js";
export * from "./ImmutableChapterNode.js";
export * from "./ImmutableTableNode.js";
export * from "./ImmutableTableRowNode.js";
export * from "./ImmutableTableCellNode.js";
export * from "./ImpliedParaNode.js";
export * from "./MilestoneNode.js";
export * from "./node-constants.js";
export * from "./node.utils.js";
export * from "./markerSeparators.utils.js";
export * from "./nestedGlyphs.utils.js";
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
  ImmutableTableNode,
  ImmutableTableRowNode,
  ImmutableTableCellNode,
  // The forward adaptor (usj-editor.adaptor.ts, platform) serializes editable-mode verse/milestone
  // display runs as AttributeRunNode wrappers, and this package's own self-healing sync
  // (displayRunSync.utils.ts's shared $syncDisplayRun driver, parameterized by each kind's own
  // descriptor) constructs one whenever it heals a run forward from a loose or missing shape —
  // every USJ-shaped editor needs the class registered, not only shared-react's (a non-react host,
  // e.g. packages/scribe's NoteEditor, builds its editor straight from usjBaseNodes with no
  // react-specific node list).
  AttributeRunNode,
  {
    replace: ParagraphNode,
    with: () => $createImpliedParaNode(),
    withKlass: ImpliedParaNode,
  },
];
