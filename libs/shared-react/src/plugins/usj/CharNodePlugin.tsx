import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { deepEqual } from "fast-equals";
import { $getState, LexicalEditor, TextNode } from "lexical";
import { useEffect } from "react";
import {
  $hasSameCharAttributes,
  $isCharNode,
  $isMarkerNode,
  $syncDisplayRun,
  $syncNestedGlyphs,
  $syncOpenerSeparators,
  charIdState,
  CharNode,
  displayRunDescriptor,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
} from "shared";

/** Combine adjacent CharNodes with the same attributes. */
export function CharNodePlugin(): null {
  const [editor] = useLexicalComposerContext();
  useCharNode(editor);
  return null;
}

function useCharNode(editor: LexicalEditor) {
  useEffect(() => {
    if (!editor.hasNodes([CharNode])) {
      throw new Error("CharNodePlugin: CharNode not registered on editor!");
    }

    return mergeRegister(
      editor.registerNodeTransform(CharNode, $charNodeTransform),
      // Self-healing nested glyphs: whenever a char span is dirtied (created, moved, merged,
      // unwrapped), re-derive its glyphs' `+` from tree position — see nestedGlyphs.utils.ts
      // (`shared`) for the full representation rules this enforces.
      editor.registerNodeTransform(CharNode, $syncNestedGlyphs),
      // Self-healing display separators: every opening char glyph is followed by its NBSP
      // separator (text prefix or standalone spacer) — see markerSeparators.utils.ts (`shared`).
      editor.registerNodeTransform(CharNode, $syncOpenerSeparators),
      // Self-healing attribute display run: re-derive the `|…` run from unknownAttributes
      // whenever a span is dirtied — heals remote collab updates (delta-apply only calls
      // setUnknownAttributes) and structure surgery. $syncDisplayRun (displayRunSync.utils.ts,
      // `shared`), driven here with the char descriptor from displayRunRegistry.ts (`shared`).
      editor.registerNodeTransform(CharNode, (node) =>
        $syncDisplayRun(displayRunDescriptor("char"), node),
      ),
      editor.registerNodeTransform(TextNode, $charTextNodeTransform),
    );
  }, [editor]);
}

/**
 * Whether `node` renders its own marker glyphs — the editable-marker views build every char span
 * with an opening `MarkerNode` (and, for a closed span, a matching closer), while the visible and
 * hidden views build none at all.
 *
 * Combining two glyph-bearing spans is not a normalization but a byte change: the survivor keeps
 * BOTH spans' glyphs among its children, so a merged pair displays `\nd a\nd*\nd b\nd*` while
 * being ONE span. Re-tokenizing those bytes — what every settle does — yields two spans again,
 * which this transform merges again, and the rebuild's fixed-point refusal never fires because
 * each side genuinely differs from the other. That is a live editor freeze, reachable from any
 * edit that leaves two same-attribute spans adjacent (deleting the `*` from a `\va*` closer
 * re-tokenizes into exactly that shape). Where the glyphs are absent there are no bytes to
 * contradict, so the merge stays: adjacent same-attribute runs really are equivalent there, and
 * that is the case delta-apply and structure surgery rely on.
 */
function $rendersOwnGlyphs(node: CharNode): boolean {
  return node.getChildren().some($isMarkerNode);
}

/**
 * Combine adjacent CharNodes with the same attributes.
 * @param node - CharNode thats needs updating.
 * @param editor - LexicalEditor instance.
 */
function $charNodeTransform(node: CharNode): void {
  if (!$isCharNode(node)) return;

  if (node.isEmpty()) {
    node.remove();
    return;
  }

  // Glyph-bearing spans are the displayed bytes; see `$rendersOwnGlyphs`.
  if ($rendersOwnGlyphs(node)) return;

  const style = node.getMarker();
  // `\fp` (footnote-paragraph) spans are exempt from combining: each span IS a paragraph
  // break inside the note (Enter and a multi-line paste there create consecutive `\fp`
  // spans), so adjacency is content structure — combining collapsed two footnote paragraphs
  // into one in the serialized USJ. Formatting chars keep combining: for them adjacent
  // same-attribute runs really are equivalent.
  if (style === "fp") return;
  const cid = $getState(node, charIdState);
  const unknownAttributes = node.getUnknownAttributes();
  const nextNode = node.getNextSibling();
  if (
    $isCharNode(nextNode) &&
    $hasSameCharAttributes({ style, cid }, nextNode) &&
    deepEqual(unknownAttributes, nextNode.getUnknownAttributes())
  ) {
    // Combine with next CharNode since it has the same attributes.
    node.append(...nextNode.getChildren());
    nextNode.remove();
  }

  const prevNode = node.getPreviousSibling();
  if (
    $isCharNode(prevNode) &&
    $hasSameCharAttributes({ style, cid }, prevNode) &&
    deepEqual(unknownAttributes, prevNode.getUnknownAttributes())
  ) {
    // Combine with previous CharNode since it has the same attributes.
    prevNode.append(...node.getChildren());
    node.remove();
  }
}

/**
 * Remove 'empty' placeholder in CharNode once other text content is added.
 * @param node - TextNode that might be a placeholder.
 */
function $charTextNodeTransform(node: TextNode): void {
  const parent = node.getParent();
  if (!$isCharNode(parent) || parent.getChildrenSize() !== 1) return;

  const text = node.getTextContent();
  if (text.length > 1 && text.startsWith(EMPTY_CHAR_PLACEHOLDER_TEXT)) {
    node.setTextContent(text.slice(1));
    node.selectEnd();
  }
}
