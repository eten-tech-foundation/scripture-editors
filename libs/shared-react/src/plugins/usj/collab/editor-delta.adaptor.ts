import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import {
  $isElementNodeClosing,
  $isParaLikeNode,
  DeltaOp,
  LF,
  ParaLikeNode,
} from "./delta-common.utils";
import {
  DeltaOpInsertNoteEmbed,
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
  OTNoteEmbed,
  OTParaAttribute,
  OTUnmatchedEmbed,
  OTUnknownEmbed,
  OTVerseEmbed,
} from "./rich-text-ot.model";
import { $dfs, DFSNode } from "@lexical/utils";
import { $getRoot, $getState, $isTextNode, EditorState, LexicalNode, TextNode } from "lexical";
import Delta from "quill-delta";
import {
  $isBookNode,
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isImpliedParaNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  $isUnknownNode,
  BOOK_MARKER,
  BookNode,
  CHAPTER_MARKER,
  charIdState,
  CharNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  ImmutableUnmatchedNode,
  MilestoneNode,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  NoteNode,
  ParaNode,
  segmentState,
  SomeChapterNode,
  UnknownAttributes,
  UnknownNode,
  VERSE_MARKER,
} from "shared";

interface OpenEmbedContext {
  node: NoteNode | UnknownNode;
  children: LexicalNode[];
  contentsOps?: DeltaOp[];
}

export function $getTextOp(node: TextNode, openCharNodes?: CharNode[]): DeltaOp {
  const op: DeltaOp = { insert: node.__text };
  const segment = $getState(node, segmentState);
  if (segment) op.attributes = { segment };
  if (openCharNodes && openCharNodes.length > 0) {
    const char = $buildCharAttribute(openCharNodes);
    if (char) {
      op.attributes = {
        ...op.attributes,
        char,
      };
    }
  }
  return op;
}

export function getEditorDelta(editorState: EditorState): Delta {
  const update = new Delta();
  if (editorState.isEmpty()) return update;

  editorState.read(() => {
    const root = $getRoot();
    if (!root || root.isEmpty()) return;

    // check for default empty implied-para node
    const rootChildren = root.getChildren();
    if (
      rootChildren.length === 1 &&
      $isImpliedParaNode(rootChildren[0]) &&
      (!rootChildren[0].getChildren() || rootChildren[0].getChildrenSize() === 0)
    ) {
      return;
    }

    const ops = $getAllNodeOps();
    for (const op of ops) update.push(op);
  });
  return update;
}

/**
 * Get the operational transform (OT) delta operations for a specific node or range of nodes.
 * Pass nothing to get all nodes.
 *
 * @param startNode - The node to start the search, if omitted, it will start at the root node.
 * @param endNode - The node to end the search, if omitted, it will find all descendants of the
 *   startingNode.
 * @returns An array of DeltaOp objects representing the OT operations for the specified nodes.
 */
export function $getParticularNodeOps(startNode?: LexicalNode, endNode?: LexicalNode) {
  const ops: DeltaOp[] = [];
  const dfsNodes = $dfs(startNode, endNode);
  const openParaLikeNodes: ParaLikeNode[] = [];
  const openCharNodes: CharNode[] = [];
  const openEmbeds: OpenEmbedContext[] = [];
  const charContentProduced = new Set<CharNode>();
  for (let i = 0; i < dfsNodes.length; i++) {
    const currentNode = dfsNodes[i].node;
    ops.push(
      ...$getNodeOps(
        currentNode,
        i,
        dfsNodes,
        openParaLikeNodes,
        openCharNodes,
        openEmbeds,
        charContentProduced,
      ),
    );
  }
  // Close any remaining open nodes
  for (const openNode of openParaLikeNodes) {
    ops.push(
      ...$getNodeOps(
        openNode,
        dfsNodes.length,
        dfsNodes,
        openParaLikeNodes,
        openCharNodes,
        openEmbeds,
        charContentProduced,
      ),
    );
  }
  return ops;
}

function $getAllNodeOps() {
  return $getParticularNodeOps();
}

function $getNodeOps(
  currentNode: LexicalNode | undefined,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openParaLikeNodes: ParaLikeNode[],
  openCharNodes: CharNode[],
  openEmbeds: OpenEmbedContext[],
  charContentProduced: Set<CharNode>,
): DeltaOp[] {
  if (!currentNode) return [];

  const ops: DeltaOp[] = [];
  const nextDfsNode = dfsNodes[currentIndex + 1];
  $handleBlockNodes(currentNode, ops, openParaLikeNodes);

  $handleTextNodes(currentNode, ops, openCharNodes, openEmbeds, charContentProduced);

  $handleCharNodes(
    currentNode,
    currentIndex,
    dfsNodes,
    openCharNodes,
    charContentProduced,
    openEmbeds,
    ops,
  );

  // is an EmbedNode
  if ($isSomeChapterNode(currentNode)) ops.push($getChapterOp(currentNode));
  if ($isSomeVerseNode(currentNode)) ops.push($getVerseOp(currentNode));
  if ($isMilestoneNode(currentNode)) ops.push($getMilestoneOp(currentNode));
  if ($isImmutableUnmatchedNode(currentNode)) ops.push($getImmutableUnmatchedOp(currentNode));
  $handleUnknownNodes(currentNode, ops, openEmbeds);
  $handleNoteNodes(currentNode, ops, openEmbeds);

  $closeCompletedEmbeds(nextDfsNode, openEmbeds);

  return ops;
}

function $handleBlockNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openParaLikeNodes: ParaLikeNode[],
) {
  if (!currentNode.isInline()) {
    // Handle block nodes
    const openNode = openParaLikeNodes.pop();
    if ($isBookNode(openNode)) ops.push($getBookOp(openNode));
    else if ($isParaNode(openNode)) ops.push($getParaOp(openNode));
    else if ($isImpliedParaNode(openNode)) ops.push({ insert: LF });
  }

  if ($isParaLikeNode(currentNode)) {
    // Track when we open para-like nodes
    if (!openParaLikeNodes.includes(currentNode)) {
      openParaLikeNodes.push(currentNode);
    }
  }
}

function $handleTextNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openCharNodes: CharNode[],
  openEmbeds: OpenEmbedContext[],
  charContentProduced: Set<CharNode>,
) {
  if (!$isTextNode(currentNode)) return;
  // Remove (skip) editable caller text from note nodes.
  const parent = currentNode.getParent();
  if ($isNoteNode(parent) && parent.getFirstChild() === currentNode) return;

  const text = currentNode.getTextContent();
  const isNodeAttributeText = text.startsWith(NODE_ATTRIBUTE_PREFIX);
  const parentCharNode = $isCharNode(parent) ? parent : undefined;
  const isPlaceholderText =
    !!parentCharNode &&
    text === EMPTY_CHAR_PLACEHOLDER_TEXT &&
    parentCharNode.getChildrenSize() === 1;

  const textOp = $getTextOp(currentNode, openCharNodes);
  const activeEmbed = $getActiveEmbedContext(currentNode, openEmbeds);
  if (activeEmbed) {
    if (!text || text === NBSP || isNodeAttributeText) return;
    activeEmbed.contentsOps?.push(textOp);
  } else {
    const shouldSkipTextOp = isPlaceholderText || (isNodeAttributeText && !!parentCharNode);
    if (!shouldSkipTextOp) {
      ops.push(textOp);
    }
  }

  const hasMeaningfulText =
    text !== "" && !isPlaceholderText && !(isNodeAttributeText && !!parentCharNode);
  if (openCharNodes.length > 0 && hasMeaningfulText) {
    for (const charNode of openCharNodes) {
      charContentProduced.add(charNode);
    }
  }
}

function $handleCharNodes(
  currentNode: LexicalNode,
  currentIndex: number,
  dfsNodes: DFSNode[],
  openCharNodes: CharNode[],
  charContentProduced: Set<CharNode>,
  openEmbeds: OpenEmbedContext[],
  ops: DeltaOp[],
): void {
  if ($isCharNode(currentNode) && !openCharNodes.includes(currentNode)) {
    openCharNodes.push(currentNode);
  }

  const nextDfsNode = dfsNodes[currentIndex + 1];
  for (const openCharNode of openCharNodes.toReversed()) {
    if ($isElementNodeClosing(openCharNode, nextDfsNode)) {
      openCharNodes.pop();
      if (!charContentProduced.has(openCharNode)) {
        const emptyCharOp = $getEmptyCharOp(openCharNode);
        const activeEmbed = $getActiveEmbedContext(openCharNode, openEmbeds);
        if (activeEmbed) {
          activeEmbed.contentsOps?.push(emptyCharOp);
        } else {
          ops.push(emptyCharOp);
        }
      }
      charContentProduced.delete(openCharNode);
    }
  }
}

function $handleNoteNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openEmbeds: OpenEmbedContext[],
) {
  if (!$isNoteNode(currentNode)) return;

  const noteOp = $getNoteOp(currentNode);
  const parentEmbed = $getActiveEmbedContext(currentNode, openEmbeds);
  const embedContext: OpenEmbedContext = {
    node: currentNode,
    children: $dfs(currentNode).map((n) => n.node),
    contentsOps: noteOp.insert.note?.contents?.ops,
  };
  openEmbeds.push(embedContext);
  if (parentEmbed?.contentsOps) parentEmbed.contentsOps.push(noteOp);
  else ops.push(noteOp);
}

function $handleUnknownNodes(
  currentNode: LexicalNode,
  ops: DeltaOp[],
  openEmbeds: OpenEmbedContext[],
) {
  if (!$isUnknownNode(currentNode)) return;

  const unknownOp = $getUnknownOp(currentNode);
  const parentEmbed = $getActiveEmbedContext(currentNode, openEmbeds);
  const embedContext: OpenEmbedContext = {
    node: currentNode,
    children: $dfs(currentNode).map((n) => n.node),
    contentsOps: unknownOp.insert.unknown?.contents?.ops,
  };
  openEmbeds.push(embedContext);
  if (parentEmbed?.contentsOps) parentEmbed.contentsOps.push(unknownOp);
  else ops.push(unknownOp);
}

function $getBookOp(currentNode: BookNode): DeltaOp & { attributes: { book: OTBookAttribute } } {
  const book: OTBookAttribute = { style: BOOK_MARKER, code: currentNode.__code };
  return { insert: LF, attributes: { book } };
}

function $getChapterOp(
  currentNode: SomeChapterNode,
): DeltaOp & { insert: { chapter: OTChapterEmbed } } {
  const chapter: OTChapterEmbed = { style: CHAPTER_MARKER, number: currentNode.__number };
  if (currentNode.__sid) {
    chapter.sid = currentNode.__sid;
  }
  if (currentNode.__altnumber) {
    chapter.altnumber = currentNode.__altnumber;
  }
  if (currentNode.__pubnumber) {
    chapter.pubnumber = currentNode.__pubnumber;
  }
  return { insert: { chapter } };
}

export function $getParaOp(node: ParaNode): DeltaOp & { attributes: { para: OTParaAttribute } } {
  const para: OTParaAttribute = { style: node.__marker };
  return { insert: LF, attributes: { para } };
}

function $getVerseOp(currentNode: SomeVerseNode): DeltaOp & { insert: { verse: OTVerseEmbed } } {
  const verse: OTVerseEmbed = { style: VERSE_MARKER, number: currentNode.__number };
  if (currentNode.__sid) {
    verse.sid = currentNode.__sid;
  }
  if (currentNode.__altnumber) {
    verse.altnumber = currentNode.__altnumber;
  }
  if (currentNode.__pubnumber) {
    verse.pubnumber = currentNode.__pubnumber;
  }
  return { insert: { verse } };
}

function $getMilestoneOp(
  currentNode: MilestoneNode,
): DeltaOp & { insert: { milestone: OTMilestoneEmbed } } {
  const milestone: OTMilestoneEmbed = { style: currentNode.__marker };
  if (currentNode.__sid) {
    milestone.sid = currentNode.__sid;
  }
  if (currentNode.__eid) {
    milestone.eid = currentNode.__eid;
  }
  return { insert: { milestone } };
}

function $getImmutableUnmatchedOp(
  currentNode: ImmutableUnmatchedNode,
): DeltaOp & { insert: { unmatched: OTUnmatchedEmbed } } {
  return { insert: { unmatched: { marker: currentNode.__marker } } };
}

function $getNoteOp(currentNode: NoteNode): DeltaOpInsertNoteEmbed {
  const note: OTNoteEmbed = {
    style: currentNode.__marker,
    caller: currentNode.__caller,
  };
  if (currentNode.__category) {
    note.category = currentNode.__category;
  }
  if (currentNode.getChildrenSize() > 1) {
    note.contents = { ops: [] };
  }
  const op: DeltaOpInsertNoteEmbed = { insert: { note } };
  const segment = $getState(currentNode, segmentState);
  if (segment) {
    op.attributes = { segment };
  }
  return op;
}

function $getEmptyCharOp(charNode: CharNode): DeltaOp {
  const op: DeltaOp = { insert: "" };
  const char = $buildCharAttribute([charNode]);
  if (char) {
    op.attributes = { char };
  }
  return op;
}

function $getUnknownOp(
  currentNode: UnknownNode,
): DeltaOp & { insert: { unknown: OTUnknownEmbed } } {
  const unknown: OTUnknownEmbed = { tag: currentNode.getTag() };
  const marker = currentNode.getMarker();
  if (marker) unknown.marker = marker;

  const unknownAttributes = currentNode.getUnknownAttributes();
  if (unknownAttributes) Object.assign(unknown as unknown as UnknownAttributes, unknownAttributes);

  if (currentNode.getChildrenSize() > 0) unknown.contents = { ops: [] };

  return { insert: { unknown } };
}

function $getActiveEmbedContext(
  node: LexicalNode,
  openEmbeds: OpenEmbedContext[],
): OpenEmbedContext | undefined {
  for (let i = openEmbeds.length - 1; i >= 0; i--) {
    const embed = openEmbeds[i];
    if (embed.children.includes(node)) return embed;
  }
  return undefined;
}

function $closeCompletedEmbeds(nextDfsNode: DFSNode | undefined, openEmbeds: OpenEmbedContext[]) {
  for (let i = openEmbeds.length - 1; i >= 0; i--) {
    if ($isElementNodeClosing(openEmbeds[i].node, nextDfsNode)) {
      openEmbeds.splice(i, 1);
    }
  }
}

function $buildCharAttribute(charNodes: CharNode[]): OTCharAttribute | undefined {
  if (charNodes.length === 0) return undefined;
  const items = charNodes.map($buildCharItem);
  return items.length === 1 ? items[0] : items;
}

function $buildCharItem(charNode: CharNode): OTCharItem {
  const charItem: OTCharItem = { style: charNode.__marker };
  const cid = $getState(charNode, charIdState);
  if (cid) charItem.cid = cid;

  const unknownAttrs = charNode.getUnknownAttributes();
  if (unknownAttrs && Object.keys(unknownAttrs).length > 0) {
    Object.assign(charItem, unknownAttrs);
  }

  return charItem;
}
