/**
 * Modified from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-playground/src/plugins/TreeViewPlugin/index.tsx
 */

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { TreeView } from "@lexical/react/LexicalTreeView";
import { $isTextNode, LexicalNode, NODE_STATE_KEY } from "lexical";
import { ReactElement } from "react";
import { $isImmutableNoteCallerNode, $isImmutableVerseNode } from "shared-react";
import {
  $isBookNode,
  $isChapterNode,
  $isCharNode,
  $isImmutableChapterNode,
  $isNoteNode,
  $isParaNode,
  $isTypedMarkNode,
  $isVerseNode,
} from "shared";

function $customPrintNode(node: LexicalNode) {
  if ($isBookNode(node)) return `${node.__code}`;
  if ($isChapterNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isCharNode(node)) return `${node.__marker}`;
  if ($isImmutableChapterNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isImmutableNoteCallerNode(node)) return `${node.__caller}`;
  if ($isImmutableVerseNode(node)) return `${node.__marker} "${node.__number}"`;
  if ($isNoteNode(node))
    return (
      `${node.__marker} "${node.__caller}"` + (node.__isCollapsed ? " (collapsed)" : " (expanded)")
    );
  if ($isParaNode(node)) return `${node.__marker}`;
  if ($isTextNode(node)) return `"${node.__text}"${formatNodeState(node)}`;
  if ($isTypedMarkNode(node)) return `ids: [ ${JSON.stringify(node.getTypedIDs())} ]`;
  if ($isVerseNode(node)) return `${node.__marker} "${node.__number}"`;
  return "";
}

function formatNodeState(node: LexicalNode): string {
  return node.__state ? " " + JSON.stringify(node.__state.toJSON()[NODE_STATE_KEY]) : "";
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
