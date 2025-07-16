/**
 * Modified from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-playground/src/plugins/TreeViewPlugin/index.tsx
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import { LexicalNode } from "lexical";
import { ReactElement } from "react";
import { $isImmutableNoteCallerNode } from "shared-react/nodes/usj/ImmutableNoteCallerNode";
import { $isImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { $isTypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { $isBookNode } from "shared/nodes/usj/BookNode";
import { $isChapterNode } from "shared/nodes/usj/ChapterNode";
import { $isCharNode } from "shared/nodes/usj/CharNode";
import { $isImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $isNoteNode } from "shared/nodes/usj/NoteNode";
import { $isParaNode } from "shared/nodes/usj/ParaNode";
import { $isVerseNode } from "shared/nodes/usj/VerseNode";

function $customPrintNode(node: LexicalNode) {
  if ($isBookNode(node)) return `${node.__code}`;
  if ($isChapterNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isCharNode(node)) return `${node.__marker}`;
  if ($isImmutableChapterNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isImmutableNoteCallerNode(node)) return `${node.__caller}`;
  if ($isImmutableVerseNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isNoteNode(node)) return `${node.__marker}`;
  if ($isParaNode(node)) return `${node.__marker}`;
  if ($isTypedMarkNode(node)) return `ids: [ ${JSON.stringify(node.getTypedIDs())} ]`;
  if ($isVerseNode(node)) return `${node.__marker} "${node.__number}"`;
  return "";
}

export default function TreeViewPlugin(): ReactElement {
  const [editor] = useLexicalComposerContext();
  return (
    <TreeView
      viewClassName="tree-view-output"
      treeTypeButtonClassName="debug-treetype-button"
      timeTravelPanelClassName="debug-timetravel-panel"
      timeTravelButtonClassName="debug-timetravel-button"
      timeTravelPanelSliderClassName="debug-timetravel-panel-slider"
      timeTravelPanelButtonClassName="debug-timetravel-panel-button"
      customPrintNode={$customPrintNode}
      editor={editor}
    />
  );
}
