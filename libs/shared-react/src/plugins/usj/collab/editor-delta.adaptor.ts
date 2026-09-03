import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import {
  $hasAttributeRunAncestor,
  $isElementNodeClosing,
  $isOwnParaPrefixGlyph,
  DeltaOp,
  LF,
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
  $findFirstAncestorNoteNode,
  $isBookNode,
  $isCharNode,
  $isDisplayRunPiece,
  $isImmutableUnmatchedNode,
  $isImpliedParaNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaLikeNode,
  $isParaNode,
  $isSomeChapterNode,
  $isUnknownNode,
  $isVerseNode,
  BOOK_MARKER,
  BookNode,
  CHAPTER_MARKER,
  charIdState,
  CharNode,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getEditableCallerText,
  isCursorPlaceholderOnly,
  ImmutableUnmatchedNode,
  MilestoneNode,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  NoteNode,
  ParaLikeNode,
  ParaNode,
  segmentState,
  SomeChapterNode,
  textTypeState,
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
  // An editable VerseNode's own `__text` is its marker glyph (`\v 1 `) — VerseNode extends
  // TextNode so the glyph can sit inline for caret placement, but the glyph is engine-owned
  // display, not content. The verse is already conveyed by its own embed op ($getVerseOp,
  // pushed by the caller once $isSomeVerseNode matches). Skip the glyph here so it never ALSO
  // surfaces as a content text op, which would double-count the verse's length in the OT
  // content stream (once as the embed's implicit 1 unit, once as the leaked glyph bytes) and
  // shift every offset that follows it.
  if ($isVerseNode(currentNode)) return;
  // An ImmutableUnmatchedNode's bytes are its embed's presentation, the same shape as the
  // editable VerseNode glyph above: the node extends TextNode so the flagged `\nd*` bytes stay
  // caret-addressable and editable, but the construct is conveyed by its own embed op
  // ($getImmutableUnmatchedOp, pushed by the caller once $isImmutableUnmatchedNode matches).
  // Letting the bytes ALSO flow as a content text op would double-count the embed's OT length
  // (once as the embed's 1 unit, once as the leaked bytes) and shift every offset after it.
  if ($isImmutableUnmatchedNode(currentNode)) return;
  // Skip a note's first text child: in editable modes this is the note's opening marker glyph
  // (MarkerNode extends TextNode), which shouldn't flow into ops. Caller text, when present as a
  // plain text child (expanded editable mode), is never the first child and is not skipped here.
  const parent = currentNode.getParent();
  if ($isNoteNode(parent) && parent.getFirstChild() === currentNode) return;

  // Canonical, glyph-free note ops in editable marker mode: note contents ops carry CONTENT
  // only, the same shape non-editable marker modes produce. Presentation-only nodes that
  // `$applyUpdate` re-synthesizes when materializing the note (`$createWholeNote` /
  // `$createNestedChars`) must not flow into ops, otherwise a round-trip doubles them:
  // - MarkerNode glyphs (char-span openers/closers and the note's own closing glyph);
  // - the expanded editable caller text (presentation of the note's `caller` attribute).
  // A char span's OWN opener/closer glyphs OUTSIDE a note legitimately flow through as literal
  // editable-mode text (the `char` attribute wrapper is layered on top, not a substitute) — only
  // a milestone's or a verse's \va/\vp display-run glyphs (presentation that duplicates state the
  // embed op already carries) must never leak, in or out of a note. TWO checks are needed together
  // here, neither a superset of the other:
  // - $hasAttributeRunAncestor walks EVERY ancestor, so it catches a wrapped glyph regardless of
  //   how deep it rides or whether the wrapper sits directly after its owner — an intervening
  //   node between the owner and its wrapper (a remote insert landing at that boundary, an undo
  //   stack, a mid-edit tree) still leaves the wrapper's own contents ancestor-reachable, but the
  //   registry's per-kind `ownerOf` walks require exactly that adjacency and give up on the first
  //   non-run-piece sibling, so it would miss this shape. (A few lines below, `isNodeAttributeText`
  //   applies this same ancestor walk unconditionally to every surviving TextNode, wrapped glyph
  //   or not — that independently backstops a wrapped piece even if this arm were removed, but
  //   keeping it here too means this gate's OWN stated exclusion holds on its own, rather than by
  //   incidental coupling to a check several lines away that could itself change independently.)
  // - $isDisplayRunPiece is keyed on the glyph's KIND (the display-run registry's owner walk), so
  //   it catches a run's glyphs riding LOOSE — caret-grace, an undo stack, and a
  //   collab-materialized bare owner each leave a run's glyphs loose for at least one commit, and
  //   a loose glyph is exactly as much engine-owned display as a wrapped one — a shape
  //   $hasAttributeRunAncestor (ancestry into a wrapper) cannot see at all.
  // Being kind-keyed rather than shape-keyed, $isDisplayRunPiece also needs no per-piece exemption
  // for a char span's own opener/closer or its own nested `|…` run: neither is a registered piece
  // of any OTHER owner's run.
  //
  // This union widens only the ops-stream exclusion, restoring the historical contract: the
  // delta-doc length side (`$getNodeOTContribution` in delta-common.utils.ts) deliberately keeps
  // counting a LOOSE run's glyphs (via $hasAttributeRunAncestor alone, unchanged) even though the
  // ops stream now excludes them — that is not a drift to fix by widening the length side to
  // match, it is the same asymmetry the ops stream honored before the earlier loose-glyph
  // exclusion was removed.
  const isInNote = $findFirstAncestorNoteNode(currentNode) !== undefined;
  if (
    $isMarkerNode(currentNode) &&
    (isInNote ||
      $isOwnParaPrefixGlyph(currentNode) ||
      $hasAttributeRunAncestor(currentNode) ||
      $isDisplayRunPiece(currentNode))
  )
    return;
  // The para prefix's NBSP separator is presentation scaffolding ($createMarkerPrefix,
  // markerEditDeletion.utils.ts); the apply side re-synthesizes the whole prefix, so its text
  // must never enter content ops.
  if ($getState(currentNode, textTypeState) === "marker-trailing-space") return;
  let text = currentNode.getTextContent();
  // A bare cursor host (EmptyVerseCaretGuardPlugin) is collab-invisible: its insertion is never
  // emitted, so it must never appear in a delta op either.
  if (isCursorPlaceholderOnly(text)) return;
  // A glyph-fronted note (first child is a MarkerNode) is the editable-mode shape; only
  // there does the caller render as a plain text child, and always in CALLER POSITION —
  // immediately after the opening glyph. The positional guard keeps a pathological content
  // text node that merely EQUALS the caller text (elsewhere in the note) flowing into ops.
  const previousSibling = currentNode.getPreviousSibling();
  if (
    $isNoteNode(parent) &&
    $isMarkerNode(previousSibling) &&
    previousSibling === parent.getFirstChild() &&
    text === getEditableCallerText(parent.getCaller())
  ) {
    return;
  }

  const parentCharNode = $isCharNode(parent) ? parent : undefined;
  // Strip the structural NBSP separator that editable-mode char spans glue onto their
  // content text after the opening glyph (added by the USJ adaptor's `createChar` and
  // re-added by `$applyUpdate`'s `$createNote`); it is display-only, not content. POSITIONAL,
  // like the reverse adaptor's `content[0]` strip: the separator is prepended solely to the text
  // directly after the span's opening glyph, so only THAT node's leading NBSP is structural — a
  // leading NBSP on any later child (after a nested closer in `\ft A\+nd x\+nd*~B`) is the
  // author's own `~` and must flow into the op on every emit.
  const parentCharFirstChild = parentCharNode?.getFirstChild();
  if (
    isInNote &&
    !!parentCharNode &&
    $isMarkerNode(parentCharFirstChild) &&
    previousSibling === parentCharFirstChild &&
    text.startsWith(NBSP)
  ) {
    text = text.slice(1);
  }

  // Char-span attribute display runs (bare `|…`, no NBSP prefix — see usj-editor.adaptor's
  // `addCharAttributes`) carry no NBSP prefix to strip against, so the prefix check alone can't
  // catch them; the textType state tag is the other signal, kept alongside the prefix check for
  // the legacy NBSP-prefixed (milestone) attribute text. The legacy byte arm is LOAD-BEARING for
  // compatibility, not a leftover: deployed peers and persisted OT documents (ScriptureForge
  // shares these collab documents) predate the state-tagged format, and their stored deltas
  // replay through here — without the byte check, that replayed attribute text would leak display
  // bytes into content. Do not retire it while any pre-tag document or peer can reach this
  // editor. Text inside an AttributeRunNode wrapper
  // is excluded regardless of its own textType tag: the wrapper is an engine-owned presentation
  // region (see AttributeRunNode.ts), so anything riding inside it is presentation, not content,
  // whether or not it happens to also carry the "attribute" state tag.
  const isNodeAttributeText =
    text.startsWith(NODE_ATTRIBUTE_PREFIX) ||
    $getState(currentNode, textTypeState) === "attribute" ||
    $hasAttributeRunAncestor(currentNode);
  const isPlaceholderText =
    !!parentCharNode &&
    text === EMPTY_CHAR_PLACEHOLDER_TEXT &&
    parentCharNode.getChildrenSize() === 1;

  const activeEmbed = $getActiveEmbedContext(currentNode, openEmbeds);
  // An embed's `contents` ops are a SELF-CONTAINED SUB-DOCUMENT: they are materialized on the
  // receive side into a freshly built note/unknown, with no surrounding document to inherit from,
  // and read back out by `$getParticularNodeOps(embedNode)`, whose DFS starts AT the embed and so
  // has no ambient char stack at all. `openCharNodes` is the whole walk's stack, so inside an
  // embed it still holds char spans opened OUTSIDE it — spans that are not part of the embed's
  // content and have no representation in the sub-document. Scoping the stack to spans within the
  // embed is what makes this producer agree with `$getParticularNodeOps`; without it a note
  // inserted mid-span (`\nd as<note>df\nd*`) shipped `char: [{nd}, {fr}]` on its own first
  // content op, and the apply side built the enclosing `\nd` INSIDE the note with a nested
  // `\+fr` under it. `children` is the embed's entire subtree (`$dfs` from the embed node), not
  // just its direct children, so a span opened at any depth inside the embed is kept.
  const embedScopedCharNodes = activeEmbed
    ? openCharNodes.filter((charNode) => activeEmbed.children.includes(charNode))
    : openCharNodes;

  const textOp = $getTextOp(currentNode, embedScopedCharNodes);
  textOp.insert = text;
  if (activeEmbed) {
    if (!text || text === NBSP || isNodeAttributeText) return;
    activeEmbed.contentsOps?.push(textOp);
  } else {
    // Attribute display text is presentation-only regardless of WHERE it rides — inside a char
    // span (the original, narrower rule) or, like a milestone's or a verse's \va/\vp value, as a
    // plain sibling with no CharNode parent at all.
    const shouldSkipTextOp = isPlaceholderText || isNodeAttributeText;
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

/**
 * The node kinds whose OT payload carries unknown attributes flat beside its known props. The list
 * is the emit-side mirror of the `getUnknownAttributes(…, OT_*_PROPS)` calls in
 * `delta-apply-update.utils.ts` — the receive side reads every key its kind's props list does not
 * name, so every kind it reads must be a kind this side writes.
 */
type UnknownAttributeCarrier =
  | BookNode
  | CharNode
  | MilestoneNode
  | NoteNode
  | ParaNode
  | SomeChapterNode
  | SomeVerseNode
  | UnknownNode;

/**
 * Copies `node`'s unknown attributes onto `payload` — the embed or attribute object it is emitted
 * in — so they reach the peer. The node holds them either way; dropping them here is invisible to
 * every USJ round-trip and loses them only on the wire.
 *
 * Reads node state: call inside `editorState.read()`, as every op builder in this module is.
 */
function $assignUnknownAttributes(payload: object, node: UnknownAttributeCarrier): void {
  const unknownAttributes = node.getUnknownAttributes();
  if (unknownAttributes) Object.assign(payload, unknownAttributes);
}

function $getBookOp(currentNode: BookNode): DeltaOp & { attributes: { book: OTBookAttribute } } {
  const book: OTBookAttribute = { style: BOOK_MARKER, code: currentNode.__code };
  $assignUnknownAttributes(book, currentNode);
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
  $assignUnknownAttributes(chapter, currentNode);
  return { insert: { chapter } };
}

export function $getParaOp(node: ParaNode): DeltaOp & { attributes: { para: OTParaAttribute } } {
  const para: OTParaAttribute = { style: node.__marker };
  $assignUnknownAttributes(para, node);
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
  $assignUnknownAttributes(verse, currentNode);
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
  if (currentNode.__attributeOrder) {
    milestone.attributeOrder = currentNode.__attributeOrder;
  }
  $assignUnknownAttributes(milestone, currentNode);
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
  // Carry unknown attributes (e.g. the unclosed-note `closed="false"`) so the round-trip is
  // lossless — `$applyUpdate`'s `$createNote` already reads them back via
  // `getUnknownAttributes(…, OT_NOTE_PROPS)`, matching how unknown-embed ops behave.
  $assignUnknownAttributes(note, currentNode);
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

  $assignUnknownAttributes(unknown, currentNode);

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

  $assignUnknownAttributes(charItem, charNode);

  return charItem;
}
