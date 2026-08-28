import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { deepEqual } from "fast-equals";
import { $getState, LexicalEditor, TextNode } from "lexical";
import { useEffect } from "react";
import {
  $hasSameCharAttributes,
  $isCharNode,
  $isMarkerNode,
  $isSeparatorPrefixHostText,
  $syncDisplayRun,
  $syncNestedGlyphs,
  $syncOpenerSeparators,
  charIdState,
  CharNode,
  displayRunDescriptor,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  NBSP,
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
 *
 * The MIXED pairing — a glyph-less span beside a glyph-bearing one — must still merge, because
 * the marker-apply paths rely on it: `$wrapRunInCharNode` (usj-marker-action.utils.ts) wraps the
 * uncovered run in a deliberately glyph-less span and counts on this transform to reunite it with
 * the glyph-bearing neighbor whose identity it copied. But a plain child move would land the
 * content OUTSIDE the neighbor's glyph pair (`[\nd, "Lord", \nd*, " God"]` — bytes that
 * re-tokenize as content after the closed span, inside it), so the mixed branches below splice
 * the glyph-less content inside the pair instead: after the opening glyph when the partner
 * follows, before the closing glyph when it precedes.
 */
function $rendersOwnGlyphs(node: CharNode): boolean {
  return node.getChildren().some($isMarkerNode);
}

/**
 * Merge glyph-less `node` into the same-attribute glyph-bearing `target` that FOLLOWS it. In
 * document order the merged content starts with `node`'s children, so they belong directly after
 * `target`'s opening glyph — and the NBSP display separator moves with the "first content" role:
 * the old first content's presentation NBSP (prefix or standalone spacer) is stripped here, and
 * `$syncOpenerSeparators` re-derives the separator for the new first content when `target` is
 * re-processed as a dirtied span (the sync only ever ADDS a missing separator; it never strips a
 * stale one, so the strip must happen in the same surgery that demotes the old host).
 *
 * @returns `false` (nothing touched) when `target`'s first child is not an opening glyph — a
 *   mid-edit shape (e.g. a just-deleted opener) the marker-edit engine settles itself.
 */
function $mergeIntoFollowingGlyphSpan(node: CharNode, target: CharNode): boolean {
  const opener = target.getFirstChild();
  if (!$isMarkerNode(opener) || opener.getMarkerSyntax() !== "opening") return false;
  const oldFirstContent = opener.getNextSibling();
  if ($isSeparatorPrefixHostText(oldFirstContent)) {
    const text = oldFirstContent.getTextContent();
    if (text.startsWith(NBSP)) {
      if (text === NBSP) oldFirstContent.remove();
      else oldFirstContent.setTextContent(text.slice(NBSP.length));
    }
  }
  target.splice(1, 0, node.getChildren());
  node.remove();
  return true;
}

/**
 * Merge glyph-less `node` into the same-attribute glyph-bearing `target` that PRECEDES it. The
 * merged content ends with `node`'s children, so they go before `target`'s closing glyph when it
 * has one; an unclosed span (opening glyph only) takes them as a plain append. The separator
 * needs no attention in this direction — `target`'s first content keeps its role.
 */
function $mergeIntoPrecedingGlyphSpan(node: CharNode, target: CharNode): void {
  const closer = target.getLastChild();
  const children = node.getChildren();
  if ($isMarkerNode(closer) && closer.getMarkerSyntax() === "closing") {
    children.forEach((child) => closer.insertBefore(child));
  } else {
    target.append(...children);
  }
  node.remove();
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
    // Combine with next CharNode since it has the same attributes. A glyph-bearing partner
    // survives the merge (its glyphs are the displayed bytes) and takes the content inside its
    // glyph pair; `node` is gone after that, so the previous-sibling pass below cannot run — the
    // re-run on the dirtied survivor's siblings picks up any further merge.
    if ($rendersOwnGlyphs(nextNode)) {
      if ($mergeIntoFollowingGlyphSpan(node, nextNode)) return;
    } else {
      node.append(...nextNode.getChildren());
      nextNode.remove();
    }
  }

  const prevNode = node.getPreviousSibling();
  if (
    $isCharNode(prevNode) &&
    $hasSameCharAttributes({ style, cid }, prevNode) &&
    deepEqual(unknownAttributes, prevNode.getUnknownAttributes())
  ) {
    // Combine with previous CharNode since it has the same attributes.
    if ($rendersOwnGlyphs(prevNode)) {
      $mergeIntoPrecedingGlyphSpan(node, prevNode);
    } else {
      prevNode.append(...node.getChildren());
      node.remove();
    }
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
