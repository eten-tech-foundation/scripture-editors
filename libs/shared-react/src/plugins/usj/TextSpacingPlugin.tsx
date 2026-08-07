import { ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import {
  $addTrailingSpace,
  $isSomeVerseNode,
  SomeVerseNode,
  wasNodeCreated,
} from "../../nodes/usj/node-react.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $createTextNode,
  $getState,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  $isAttributeRunNode,
  $isCharNode,
  $isNoteNode,
  $isParaLikeNode,
  $isParaMarkerPrefix,
  $isTypedMarkNode,
  $isUnknownNode,
  $syncVerseAttributeDisplay,
  CharNode,
  NoteNode,
  textTypeState,
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
      // Self-healing \va/\vp display triplets: re-derive them from altnumber/pubnumber whenever
      // a verse is dirtied — heals remote collab updates (delta-apply only calls setAltnumber/
      // setPubnumber) and structure surgery. Registered here (not a dedicated VerseNodePlugin,
      // which doesn't exist) because this is already the shared-react home that registers
      // VerseNode transforms (the spacing transform above) — same one-node-type-owns-its-syncs
      // shape CharNodePlugin uses for chars. See attributeDisplay.utils.ts (`shared`).
      editor.registerNodeTransform(VerseNode, $syncVerseAttributeDisplayNode),
    );
  }, [editor]);
}

/**
 * Wraps {@link $syncVerseAttributeDisplay} with the verse's own current values — unlike the char
 * sync, no import-cycle concern forces these to be computed at the call site; kept as a thin
 * wrapper anyway to mirror `CharNodePlugin`'s established shape.
 * @param node - VerseNode whose \va/\vp display triplets need updating.
 */
function $syncVerseAttributeDisplayNode(node: VerseNode): void {
  $syncVerseAttributeDisplay(node, node.getAltnumber(), node.getPubnumber());
}

/**
 * Ensures a TextNode has trailing spacing when needed for inline scripture content.
 *
 * The transform does nothing when the node is not editable, already has meaningful trailing
 * whitespace, precedes a note, or is inside or adjacent to CharNode or TypedMarkNode content. It
 * also does nothing for a node that is inside any UnknownNode (block or inline), or that
 * immediately precedes an INLINE UnknownNode (e.g. an optbreak `//` or a `ref`) — a block-level
 * UnknownNode's PRECEDING text (figures, sidebars, etc.) still gets the ordinary trailing-space
 * treatment.
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
    $isUnknownNode(parent) ||
    // An optbreak (`//`) — like a ref — is an inline UnknownNode carrying SIGNIFICANT surrounding
    // whitespace (Paratext 9 preserves the spaces around `//` byte-for-byte). Forcing a trailing
    // space onto the text before one — or removing a lone space there — corrupts the authored form
    // and makes the space impossible to delete (the transform re-adds it every keystroke). Text
    // adjacent to an inline unknown is left exactly as authored, the same next-sibling exemption
    // already applied to notes, chars, and typed marks. Block-level unknowns (figures, sidebars)
    // keep the existing spacing behavior.
    ($isUnknownNode(nextSibling) && nextSibling.isInlineTag()) ||
    // An attribute display run (char/milestone/verse — attributeDisplay.utils.ts) is engine-owned
    // presentation, not paragraph prose: it must never gain a trailing space of its own, even
    // when it sits directly in a paragraph (a verse's \va/\vp value has no CharNode parent to
    // exempt it the way a char span's own run is already protected).
    $getState(node, textTypeState) === "attribute" ||
    // When a verse's/milestone's run rides inside an AttributeRunNode wrapper (AttributeRunNode.ts),
    // its glyph children (MarkerNode, never textType "attribute") need the same exemption the
    // state-tagged value already gets above — a glyph is a plain TextNode here, invisible to the
    // state check, but is exactly as much engine-owned presentation. The adaptor does not build
    // this shape yet; the transform exempts whichever shape — loose attribute text or a wrapper's
    // children — is actually in the tree.
    $isAttributeRunNode(parent)
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
    !$isParaMarkerPrefix(previousSibling) &&
    // Bare text before a verse gets its structural space from $textNodeTrailingSpaceTransform;
    // text inside an annotation wrapper can't (that transform skips TypedMarkNode parents), so
    // the space is inserted here instead and coalesces onto the same USJ text run.
    (!$isTextNode(previousSibling) || $isTypedMarkNode(previousSibling.getParent()))
  )
    node.insertBefore($createTextNode(" "));
}
