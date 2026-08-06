import { ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import {
  $addTrailingSpace,
  $isSomeVerseNode,
  SomeVerseNode,
  wasNodeCreated,
} from "../../nodes/usj/node-react.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $createTextNode, $isTextNode, LexicalEditor, LexicalNode, TextNode } from "lexical";
import { useEffect } from "react";
import {
  $isCharNode,
  $isNoteNode,
  $isParaLikeNode,
  $isSynthesizedMarkerNode,
  $isTypedMarkNode,
  $isUnknownNode,
  CharNode,
  NoteNode,
  VerseNode,
} from "shared";

/** This plugin ensures that there is a space following a text node including before verse nodes. */
export function TextSpacingPlugin() {
  const [editor] = useLexicalComposerContext();
  useTextSpacing(editor);
  return null;
}

/**
 * This hook is responsible for handling a trailing space on a TextNode, and moving text nodes
 * that are created inside an UnknownNode. It also ensures verses are properly spaced.
 * @param editor - The LexicalEditor instance used to access the DOM.
 */
function useTextSpacing(editor: LexicalEditor) {
  useEffect(() => {
    if (!editor.hasNodes([CharNode, ImmutableVerseNode, NoteNode, TextNode, VerseNode])) {
      throw new Error(
        "TextSpacingPlugin: CharNode, ImmutableVerseNode, NoteNode, TextNode or VerseNode not registered on editor!",
      );
    }

    return mergeRegister(
      editor.registerNodeTransform(TextNode, $textNodeTrailingSpaceTransform),
      editor.registerNodeTransform(TextNode, (node) => $textNodeInUnknownTransform(node, editor)),
      editor.registerNodeTransform(VerseNode, $verseNodeTransform),
      editor.registerNodeTransform(ImmutableVerseNode, $verseNodeTransform),
    );
  }, [editor]);
}

/**
 * Ensures a TextNode has trailing spacing when needed for inline scripture content.
 *
 * The transform does nothing when the node is not editable, already has meaningful trailing
 * whitespace, precedes a note, or is inside or adjacent to CharNode, TypedMarkNode, or UnknownNode
 * content.
 *
 * If the node contains only a single space and is not followed by a verse node, that placeholder
 * space is removed instead of preserved. It is also removed when the node is an empty verse's
 * entire content (a verse marker immediately precedes it), because core's round trip to disk drops
 * that space and the editor's output must match.
 *
 * Trailing space is not added if the node is the last child of a para-like node.
 *
 * @param node - TextNode that might need updating.
 */
function $textNodeTrailingSpaceTransform(node: TextNode): void {
  if (!node.isAttached()) return;

  const text = node.getTextContent();
  const nextSibling = node.getNextSibling();
  const parent = node.getParent();
  if (
    node.getMode() !== "normal" ||
    (text.endsWith(" ") && text.length > 1) ||
    $isNoteNode(nextSibling) ||
    $isCharNode(parent) ||
    $isCharNode(nextSibling) ||
    $isTypedMarkNode(parent) ||
    $isTypedMarkNode(nextSibling) ||
    $isUnknownNode(parent) ||
    // An adjacent TextNode is the same logical text run (IME composition and annotation-wrap
    // splits leave runs as multiple nodes, e.g. a segmented composition node that Lexical
    // won't merge). No structural space belongs inside a run — inserting one corrupts the
    // word itself (#513, complex scripts worst). This also protects a space-only node from
    // the placeholder cleanup below: between two text nodes it is real content.
    $isTextNode(nextSibling)
  )
    return;

  // A text node whose previous sibling is a verse marker holds that verse's entire content, so a
  // space-only (or already-emptied) one means the verse is empty. Core's round trip to disk
  // (ParatextData) drops that space, so keeping it makes the editor's USJ disagree with what core
  // reads back — and core resolves that disagreement by reloading the whole editor, destroying the
  // caret. Note this is narrower than the CharNode case below it in the file: a space
  // between a char node and a following verse IS canonical USJ that Paratext re-inserts, and only
  // a space owned by an *empty verse* round-trips away.
  const isEmptyVerseContent =
    $isSomeVerseNode(node.getPreviousSibling()) && (text === "" || text === " ");

  // Remove space-only placeholders that don't precede a verse, or that are an empty verse's
  // entire content.
  if ((text === " " && !$isSomeVerseNode(nextSibling)) || isEmptyVerseContent) {
    // Only write when there is something to clear: re-setting the same text marks the node dirty
    // and re-runs this transform, which would loop against `$addTrailingSpace` below.
    if (text !== "") node.setTextContent("");
    return;
  }

  // Don't add trailing space if it's the last node in a paragraph-like node.
  if ($isParaLikeNode(parent) && node.is(parent.getLastChild())) return;

  $addTrailingSpace(node);
}

/**
 * Moves a TextNode after its parent if the parent is an UnknownNode.
 * @param node - The TextNode to check.
 * @param editor - The LexicalEditor instance.
 */
function $textNodeInUnknownTransform(node: TextNode, editor: LexicalEditor): void {
  const unknownNode = node.getParent();
  if (!$isUnknownNode(unknownNode) || !node.isAttached()) return;

  // If a text node is created inside an UnknownNode (e.g., by typing), move it after the
  // UnknownNode.
  if (wasNodeCreated(editor, node.getKey())) unknownNode.insertAfter(node);
}

/** Transform for a verse node (handles non-TextNode predecessors) */
function $verseNodeTransform(node: SomeVerseNode): void {
  if (!node.isAttached()) return;

  // Annotation wrappers (TypedMarkNode) are presentation-only, so the spacing decision depends
  // on the content INSIDE them: resolve to the wrapper's last content child (nested wrappers
  // are transient but resolved for safety). An empty wrapper resolves to null and inserts
  // nothing.
  let previousSibling: LexicalNode | null = node.getPreviousSibling();
  while ($isTypedMarkNode(previousSibling)) previousSibling = previousSibling.getLastChild();

  if (
    previousSibling &&
    !$isSomeVerseNode(previousSibling) &&
    !$isUnknownNode(previousSibling) &&
    // Para marker prefixes are presentation scaffolding, not USJ content, so no structural
    // space belongs after them — and an inserted plain " " would be exporter-visible USJ
    // content that shifts every content index in the paragraph (see PT-3835). Their visual
    // separation comes from the prefix nodes' own text.
    !$isSynthesizedMarkerNode(previousSibling) &&
    // Bare text before a verse gets its structural space from $textNodeTrailingSpaceTransform;
    // text inside an annotation wrapper can't (that transform skips TypedMarkNode parents), so
    // the space is inserted here instead and coalesces onto the same USJ text run.
    (!$isTextNode(previousSibling) || $isTypedMarkNode(previousSibling.getParent()))
  )
    node.insertBefore($createTextNode(" "));
}
