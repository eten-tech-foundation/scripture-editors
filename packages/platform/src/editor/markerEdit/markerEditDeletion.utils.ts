/**
 * Deletion semantics. Replaces ParaMarkerPrefixGuardPlugin's reset-to-\p
 * behavior in editable marker mode: deleting a paragraph's marker text merges
 * its content into the previous paragraph (PT9 reformat outcome).
 */

import { $requestTier2ForNode } from "./tier2Rebuild.utils";
import { MarkerEditContext } from "./markerEditTier1.utils";
import { $dfs } from "@lexical/utils";
import { $createTextNode, $getState, $setState, $isTextNode } from "lexical";
import {
  $createMarkerNode,
  $isMarkerNode,
  $isParaMarkerPrefix,
  $isParaNode,
  CharNode,
  getEditableCallerText,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  NoteNode,
  PARA_MARKER_DEFAULT,
  ParaNode,
  textTypeState,
} from "shared";

export function $createMarkerPrefix(marker: string) {
  const markerNode = $createMarkerNode(marker);
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  // Token mode so typing at the separator's boundary can never insert INTO it. Without this, a
  // fresh EMPTY paragraph (whose caret fallback below is the separator's end) absorbed typed text
  // into this node ("<NBSP>asdf"), which the serializer — matching the separator by exact-NBSP
  // text — then leaked into USJ content (`\p ~asdf` in USFM, and a non-convergent PDP echo loop
  // in the host). With token mode, Lexical routes boundary insertions into a new plain sibling
  // TextNode instead. Keep in sync with the forward adaptor's separator (`createText(NBSP,
  // "marker-trailing-space", "token")` in usj-editor.adaptor.ts).
  spaceNode.setMode("token");
  return [markerNode, spaceNode];
}

/**
 * Places the caret at the content side of a paragraph's `[glyph, separator, ...content]` prefix.
 * Text content selects at its own offset 0. Anything else — no content yet (fresh empty
 * paragraph) or element content (e.g. a red-letter `\wj` CharNode first) — gets an element point
 * at child index 2, the content boundary: typing there inserts plain text at content start
 * instead of the caret jumping to the paragraph end (`selectEnd`), which is wrong for element
 * content and, before the separator was token-mode, let typing merge into the separator itself.
 */
export function $selectParaContentStart(para: ParaNode): void {
  const contentChild = para.getChildAtIndex(2);
  if (contentChild && $isTextNode(contentChild)) contentChild.select(0, 0);
  else para.select(2, 2);
}

export function $injectMarkerPrefix(para: ParaNode): void {
  para.splice(0, 0, $createMarkerPrefix(para.getMarker()));
  // Keep the caret on the content side of the injected prefix.
  $selectParaContentStart(para);
}

/**
 * Re-asserts the marker-trailing NBSP separator between an intact paragraph prefix glyph and the
 * content. The separator is presentation scaffolding OWNED by the engine, so any edit that eats
 * it (a forward-delete at the glyph's end, a selection that swallowed it, …) heals on the next
 * transform pass instead of leaving a separator-less prefix — which broke the `[glyph, separator,
 * content]` layout every caret/retag computation assumes (live-observed: retag caret jumping to
 * the paragraph end, "the space after the marker keeps disappearing"). A user-typed plain
 * space/NBSP right after the glyph is intent for the same separator and is canonicalized in
 * place rather than doubled.
 */
function $healMarkerTrailingSeparator(para: ParaNode): void {
  const glyph = para.getFirstChild();
  if (!glyph) return;
  const second = glyph.getNextSibling();
  if (
    $isTextNode(second) &&
    !$isMarkerNode(second) &&
    $getState(second, textTypeState) === "marker-trailing-space"
  )
    return; // canonical separator present
  if (
    $isTextNode(second) &&
    !$isMarkerNode(second) &&
    /^[ \u00A0]$/.test(second.getTextContent())
  ) {
    // Canonicalize the user's typed space into the separator instead of inserting a second one.
    second.setTextContent(NBSP);
    $setState(second, textTypeState, "marker-trailing-space");
    second.setMode("token");
    return;
  }
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  spaceNode.setMode("token");
  glyph.insertAfter(spaceNode);
}

export function $paraMarkerDeletionTransform(para: ParaNode, context: MarkerEditContext): void {
  if (para.isEmpty()) return; // transient mid-edit state (same rationale as the guard)
  if ($isParaMarkerPrefix(para.getFirstChild())) {
    $healMarkerTrailingSeparator(para);
    return;
  }

  if (context.splitExpected.current) {
    // Fresh paragraph from Enter: insertNewAfter cloned the marker; make it visible.
    $injectMarkerPrefix(para);
    context.logger?.debug(`[MarkerEdit] injected prefix for split para "${para.getMarker()}"`);
    return;
  }

  const previous = para.getPreviousSibling();
  if ($isParaNode(previous)) {
    // Deleting a para's marker text merges its content into the previous para.
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
 * as bytes when the span is unwrapped), or `undefined` when there are none. `closed` is
 * excluded: it is derived USJ metadata (ParatextData emits `closed="false"` on char spans with
 * no explicit closing marker — extremely common on footnote-content chars like `\fr`/`\ft`),
 * not user bytes, and paranext-core's USFM writer likewise never emits it as an attribute
 * (usj-reader-writer's attribute filter). Writing it as literal `|closed="false"` text on
 * unwrap would corrupt the document. */
function unknownAttributesText(char: CharNode): string | undefined {
  const attributes = char.getUnknownAttributes();
  if (!attributes) return undefined;
  const pairs = Object.entries(attributes)
    .filter(([name, value]) => value !== undefined && name !== "closed")
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

/**
 * A note is an atomic object in the text —
 * PT9 deletes the whole footnote when any part of it is deleted. In editable marker mode a
 * collapsed note carries its `\f`/`\f*` glyphs as its first/last children; Backspace right
 * after the note deletes the closing glyph (and forward-Delete before it deletes the opener).
 * Without this transform the damaged note then spilled its internals into the paragraph as
 * literal glyph text (`\fr 8.4 \ft \f*` — live-verified data corruption), which the
 * re-tokenizer would settle into phantom markers. A glyph pair that is damaged on one side
 * only means the user deleted "half the pair": remove the whole note, PT9-style. Notes with
 * NO glyphs at all (shapes built by non-editable creation paths) are left alone.
 *
 * EXPANDED notes (inline-editable zone) get the same PT9 outcome for their only deletable
 * marker handle: deleting the opening glyph removes the whole note. Damage is detected by the
 * missing OPENER only — an UNCLOSED note (its normal shape after typing a bare `\f `)
 * legitimately has no closing glyph, so a collapsed-style opener-XOR-closer rule would wrongly
 * delete every intact unclosed note. The editable-built shape is recognized by its caller text
 * (`getEditableCallerText`); without that anchor (caller-less or non-editable-built shapes)
 * the note is left alone. Without this, the glyph-deleted NoteNode survived and serialization
 * regenerated `\f caller` forever while the orphaned caller spilled into the paragraph
 * (live-observed `tell,~tell,~…` accumulation).
 */
export function $noteDeletionTransform(note: NoteNode, context: MarkerEditContext): void {
  // Detect glyphs by PRESENCE among the direct children, not by first/last POSITION: a
  // stray leading TextNode (the user typed at the note's start — the transient NoteNodePlugin's
  // `$noteNodeTransform` salvages by moving that text out) leaves the opener glyph intact but no
  // longer first. A first/last check would read that as "opener deleted" and remove the whole
  // note before the salvage runs (MarkerEditPlugin's NoteNode transform is registered first, and
  // Lexical breaks the transform loop once `note.remove()` detaches the node) — destroying the
  // footnote's `\fr`/`\ft` content on a single keystroke.
  const children = note.getChildren();
  const hasOpener = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "opening");

  if (note.getIsCollapsed() !== true) {
    if (hasOpener) return; // intact — unclosed expanded notes have no closer by construction
    // Recognize an editable-built note by ANY marker-glyph evidence: the editable caller text,
    // a closing glyph, or a MarkerNode anywhere in the subtree (content char spans carry their
    // own glyphs). A single evidence anchor (caller only) is not enough: a RANGE deletion
    // across `\f caller` removes the opener AND the caller in one edit. Notes with no glyph
    // evidence at all (shapes built by non-editable creation paths) are left alone, as for
    // collapsed.
    const caller = note.getCaller();
    const hasEditableCaller =
      caller !== "" &&
      children.some(
        (c) =>
          $isTextNode(c) &&
          !$isMarkerNode(c) &&
          c.getTextContent() === getEditableCallerText(caller),
      );
    const hasAnyMarkerGlyph = $dfs(note).some(({ node: n }) => $isMarkerNode(n));
    if (!hasEditableCaller && !hasAnyMarkerGlyph) return; // glyph-less shape — not ours
    // UNWRAP, don't delete: an expanded note's content is visible inline (an unclosed note may
    // have absorbed the rest of the verse), so deleting the `\f` marker deletes ONLY the marker.
    // The note node dissolves: the editable caller returns to plain text (its structural NBSP
    // becomes a plain space so it can't leak into USJ as `~`), remaining glyphs go with the
    // note, and the content stays in the paragraph. Contrast: a COLLAPSED note is an atomic
    // object — glyph damage removes the whole note (below).
    children.forEach((child) => {
      if ($isMarkerNode(child)) return; // closing glyph (if any) dissolves with the note
      if ($isTextNode(child) && child.getTextContent() === getEditableCallerText(caller))
        child.setTextContent(` ${caller} `);
      note.insertBefore(child);
    });
    note.remove();
    context.logger?.debug(
      `[MarkerEdit] unwrapped expanded note whose opening glyph was deleted (content preserved)`,
    );
    return;
  }

  const hasCloser = children.some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing");
  if (hasOpener === hasCloser) return; // intact pair, both-gone, or a glyph-less shape — not ours
  note.remove();
  context.logger?.debug(`[MarkerEdit] removed collapsed note with damaged glyph pair`);
}

export function $charNodeDeletionTransform(char: CharNode, context: MarkerEditContext): void {
  if (char.isEmpty()) return; // CharNodePlugin removes empty spans
  const first = char.getFirstChild();
  const hasOpener = $isMarkerNode(first) && first.getMarkerSyntax() === "opening";
  if (!hasOpener) {
    $unwrapCharNode(char); // opener deleted -> unwrap the span
    context.logger?.debug(`[MarkerEdit] unwrapped char span "${char.getMarker()}"`);
    return;
  }
  const needsCloser =
    // A closed="false" span has no explicit closer BY DESIGN (ParatextData emits the flag on
    // every implicitly-closed char span; the adaptor renders no closing glyph for it) — its
    // missing closer is its normal shape, not deletion damage.
    char.getUnknownAttributes()?.closed !== "false" &&
    !CharNode.isValidFootnoteMarker(char.getMarker()) &&
    !CharNode.isValidCrossReferenceMarker(char.getMarker());
  const hasCloser = char
    .getChildren()
    .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
  if (needsCloser && !hasCloser) {
    // Closer deletion goes through Tier 2 (tokenizer decides the span extent).
    $requestTier2ForNode(char, context);
  }
}
