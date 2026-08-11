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
  $isSynthesizedMarkerNode,
  $isTypedMarkNode,
  $isUnknownNode,
  $syncDisplayRun,
  CharNode,
  displayRunDescriptor,
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
      // Self-healing \va/\vp display runs: re-derive them from altnumber/pubnumber whenever
      // a verse is dirtied — heals remote collab updates (delta-apply only calls setAltnumber/
      // setPubnumber) and structure surgery. Registered here (not a dedicated VerseNodePlugin,
      // which doesn't exist) because this is already the shared-react home that registers
      // VerseNode transforms (the spacing transform above) — same one-node-type-owns-its-syncs
      // shape CharNodePlugin uses for chars. See displayRunSync.utils.ts (`shared`).
      editor.registerNodeTransform(VerseNode, $syncVerseAttributeDisplayNode),
    );
  }, [editor]);
}

/**
 * Wraps {@link $syncDisplayRun} with the verse's two independent run descriptors — `\va` first, so
 * `\vp`'s scan and insertion anchor find the healed `\va` wrapper already in place.
 * @param node - VerseNode whose \va/\vp display runs need updating.
 */
function $syncVerseAttributeDisplayNode(node: VerseNode): void {
  $syncDisplayRun(displayRunDescriptor("va"), node);
  $syncDisplayRun(displayRunDescriptor("vp"), node);
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
 * space is removed instead of preserved. It is also removed when the node is an empty verse's
 * entire content (a verse marker immediately precedes it) — see the comment on
 * `isEmptyVerseContent` for why, and for the limits of that check.
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
    $isTextNode(nextSibling) ||
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
    // When a verse's/milestone's run rides inside an AttributeRunNode wrapper (AttributeRunNode.ts,
    // the shape the adaptor always builds now), its glyph children (MarkerNode, never textType
    // "attribute") need the same exemption the state-tagged value already gets above — a glyph is
    // a plain TextNode here, invisible to the state check, but is exactly as much engine-owned
    // presentation. The transform still exempts whichever shape — loose attribute text or a
    // wrapper's children — is actually in the tree, so a pre-flip loose editor state stays exempt
    // too.
    $isAttributeRunNode(parent)
  )
    return;

  // A text node whose previous sibling is a verse marker holds that verse's entire content, so a
  // space-only (or already-emptied) one means the verse is empty. Core's round trip to disk
  // (ParatextData) drops that space, so keeping it makes the editor's USJ disagree with what core
  // reads back — and core resolves that disagreement by reloading the whole editor, destroying the
  // caret. This is narrower than the CharNode case below: a space between a char node and a
  // following verse IS canonical USJ that Paratext re-inserts; only a space owned by an *empty
  // verse* round-trips away.
  //
  // Scope, deliberately limited: NBSP is excluded because it is meaningful content
  // (`$addTrailingSpace` likewise treats it as already-spaced), and multi-space text never reaches
  // here at all (the `text.endsWith(" ") && text.length > 1` guard above returns first) — hence
  // matching only "" and " ". The previous sibling is read directly, so an empty verse whose
  // preceding content sits inside an annotation wrapper is NOT detected; `$verseNodeTransform`
  // resolves through wrappers for its own decision, and doing the same here is a possible
  // follow-up.
  const isEmptyVerseContent =
    $isSomeVerseNode(node.getPreviousSibling()) && (text === "" || text === " ");

  // Remove space-only placeholders that don't precede a verse, or that are an empty verse's
  // entire content.
  if ((text === " " && !$isSomeVerseNode(nextSibling)) || isEmptyVerseContent) {
    // Two separate loop protections, BOTH load-bearing — dropping either reintroduces an infinite
    // transform cycle, which Lexical escalates into a crash:
    //   - this `text !== ""` guard stops a self-loop, because `setTextContent` goes through
    //     `getWritable()`, which marks the node dirty even when the value is unchanged and so
    //     re-runs this transform;
    //   - the `text === ""` clause in `isEmptyVerseContent` above stops the re-add loop, because
    //     without it an already-emptied node falls through to `$addTrailingSpace` below, becomes
    //     " ", and is cleared again on the next pass.
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
