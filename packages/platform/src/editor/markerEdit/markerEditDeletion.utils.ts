/**
 * §5.5 deletion semantics. Replaces ParaMarkerPrefixGuardPlugin's reset-to-\p
 * behavior in editable marker mode: deleting a paragraph's marker text merges
 * its content into the previous paragraph (PT9 reformat outcome).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $createTextNode, $getState, $setState, $isTextNode } from "lexical";
import {
  $createMarkerNode,
  $isMarkerNode,
  $isParaMarkerPrefix,
  $isParaNode,
  CharNode,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  PARA_MARKER_DEFAULT,
  ParaNode,
  textTypeState,
} from "shared";

export function $createMarkerPrefix(marker: string) {
  const markerNode = $createMarkerNode(marker);
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return [markerNode, spaceNode];
}

export function $injectMarkerPrefix(para: ParaNode): void {
  para.splice(0, 0, $createMarkerPrefix(para.getMarker()));
  // Keep the caret on the content side of the injected prefix.
  const third = para.getChildAtIndex(2);
  if (third && $isTextNode(third)) third.select(0, 0);
  else para.selectEnd();
}

export function $paraMarkerDeletionTransform(para: ParaNode, context: MarkerEditContext): void {
  if (para.isEmpty()) return; // transient mid-edit state (same rationale as the guard)
  if ($isParaMarkerPrefix(para.getFirstChild())) return;

  if (context.splitExpected.current) {
    // Fresh paragraph from Enter: insertNewAfter cloned the marker; make it visible.
    $injectMarkerPrefix(para);
    context.logger?.debug(`[MarkerEdit] injected prefix for split para "${para.getMarker()}"`);
    return;
  }

  const previous = para.getPreviousSibling();
  if ($isParaNode(previous)) {
    // §5.5: deleting a para's marker text merges its content into the previous para.
    const children = para.getChildren().filter((child) => {
      if ($isTextNode(child) && $getState(child, textTypeState) === "marker-trailing-space")
        return false; // drop the orphaned separator
      return true;
    });
    previous.append(...children); // moved nodes keep their keys; selection follows
    para.remove();
    context.logger?.debug(`[MarkerEdit] merged marker-deleted para into previous`);
    return;
  }

  // No previous paragraph to merge into: fall back to the default marker, visibly.
  para.setMarker(PARA_MARKER_DEFAULT);
  $injectMarkerPrefix(para);
}

/** `|name="value" …` literal suffix for a span's unknown attributes (PT9 keeps these
 * as bytes when the span is unwrapped), or `undefined` when there are none. */
function unknownAttributesText(char: CharNode): string | undefined {
  const attributes = char.getUnknownAttributes();
  if (!attributes) return undefined;
  const pairs = Object.entries(attributes)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}="${value}"`);
  return pairs.length > 0 ? NODE_ATTRIBUTE_PREFIX + pairs.join(" ") : undefined;
}

/** Move a char span's content out and drop the span (opener deleted / Ctrl+Space). */
export function $unwrapCharNode(char: CharNode): void {
  const children = char.getChildren().filter((child) => !$isMarkerNode(child));
  const first = children[0];
  if (first && $isTextNode(first) && first.getTextContent().startsWith(NBSP))
    first.setTextContent(first.getTextContent().slice(1)); // structural NBSP prefix
  // PT9 leaves an unknown-attribute span's attributes as literal bytes on unwrap.
  // The char node is about to be dropped, so reconstruct the `|name="value"` suffix
  // as plain text after the content (where the closer glyph used to be) so the bytes
  // survive serialization.
  const attributesText = unknownAttributesText(char);
  if (attributesText) children.push($createTextNode(attributesText));
  children.forEach((child) => char.insertBefore(child));
  char.remove();
}

export function $charNodeDeletionTransform(char: CharNode, context: MarkerEditContext): void {
  if (char.isEmpty()) return; // CharNodePlugin removes empty spans
  const first = char.getFirstChild();
  const hasOpener = $isMarkerNode(first) && first.getMarkerSyntax() === "opening";
  if (!hasOpener) {
    $unwrapCharNode(char); // §5.5: opener deleted -> unwrap the span
    context.logger?.debug(`[MarkerEdit] unwrapped char span "${char.getMarker()}"`);
    return;
  }
  const needsCloser =
    !CharNode.isValidFootnoteMarker(char.getMarker()) &&
    !CharNode.isValidCrossReferenceMarker(char.getMarker());
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  if (needsCloser && !hasCloser) {
    // §5.5: closer deletion goes through Tier 2 (tokenizer decides the span extent).
    $requestTier2ForNode(char, context);
  }
}
