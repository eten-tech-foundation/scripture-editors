import { ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import {
  $addTrailingSpace,
  $isSomeVerseNode,
  SomeVerseNode,
  wasNodeCreated,
} from "../../nodes/usj/node-react.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $createTextNode, $isTextNode, LexicalEditor, TextNode } from "lexical";
import { useEffect } from "react";
import {
  $isCharNode,
  $isNoteNode,
  $isParaLikeNode,
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
 * space is removed instead of preserved.
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
    $isUnknownNode(parent)
  )
    return;

  // Remove space-only placeholders that don't precede a verse.
  if (text === " " && !$isSomeVerseNode(nextSibling)) {
    node.setTextContent("");
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

  const previousSibling = node.getPreviousSibling();
  if (
    previousSibling &&
    !$isSomeVerseNode(previousSibling) &&
    !$isTextNode(previousSibling) &&
    !$isUnknownNode(previousSibling)
  )
    node.insertBefore($createTextNode(" "));
}
