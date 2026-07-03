/**
 * Tier 2 paragraph-scoped re-tokenization (design spec §5.2). Runs INSIDE the
 * triggering update (transform or command listener), so the rebuild and the
 * user's edit are one history entry. Blast radius is paragraph-local.
 */

import usjEditorAdaptor from "../adaptors/usj-editor.adaptor";
import { MarkerContent, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import {
  $getNodeByKey,
  $getSelection,
  $getState,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $parseSerializedNode,
  ElementNode,
  LexicalNode,
  SerializedLexicalNode,
  TextNode,
} from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  getEditableCallerText,
  getMarker,
  LoggerBasic,
  MarkerType,
  NBSP,
  NoteNode,
  ParaNode,
  textTypeState,
  usfmFragmentToUsjContent,
  VerseNode,
} from "shared";
import { $isImmutableNoteCallerNode, ViewOptions } from "shared-react";

export const ATOMIC_SENTINEL = "￼";

interface FragmentSpan {
  key: string;
  start: number;
  end: number;
  isSentinel: boolean;
}

interface FragmentAccumulator {
  text: string;
  spans: FragmentSpan[];
  /** One entry per U+FFFC, in fragment order; each entry is a node RUN to re-insert. */
  sentinels: LexicalNode[][];
}

function pushText(out: FragmentAccumulator, node: LexicalNode, text: string): void {
  out.spans.push({
    key: node.getKey(),
    start: out.text.length,
    end: out.text.length + text.length,
    isSentinel: false,
  });
  out.text += text;
}

function pushSentinel(out: FragmentAccumulator, nodes: LexicalNode[]): void {
  out.spans.push({
    key: nodes[0].getKey(),
    start: out.text.length,
    end: out.text.length + 1,
    isSentinel: true,
  });
  out.sentinels.push(nodes);
  out.text += ATOMIC_SENTINEL;
}

/** Display text → USFM fragment text: structural NBSP separators become plain spaces. */
function toFragmentText(text: string): string {
  return text.replaceAll(NBSP, " ");
}

/**
 * Display siblings after a MilestoneNode that belong to its run: opening
 * MarkerNode, optional attribute TextNode, self-closing MarkerNode. They ride
 * inside the milestone's sentinel so the visible glyphs survive the rebuild.
 */
function $milestoneDisplayRun(children: LexicalNode[], index: number): LexicalNode[] {
  const run: LexicalNode[] = [];
  const opening = children[index + 1];
  if (!$isMarkerNode(opening) || opening.getMarkerSyntax() !== "opening") return run;
  run.push(opening);
  let nextIndex = index + 2;
  const maybeAttribute = children[nextIndex];
  if ($isTextNode(maybeAttribute) && $getState(maybeAttribute, textTypeState) === "attribute") {
    run.push(maybeAttribute);
    nextIndex++;
  }
  const closing = children[nextIndex];
  if ($isMarkerNode(closing) && closing.getMarkerSyntax() === "selfClosing") run.push(closing);
  return run;
}

/** A verse whose state is not fully recoverable from its visible text stays atomic. */
function verseNeedsSentinel(node: VerseNode): boolean {
  return Boolean(
    node.getSid() ?? node.getAltnumber() ?? node.getPubnumber() ?? node.getUnknownAttributes(),
  );
}

/** Mirrors `$appendChildrenFragment`'s "preserve this node atomically" classification. */
function isRebuildSentinel(node: LexicalNode): boolean {
  if ($isMilestoneNode(node) || $isNoteNode(node) || $isUnknownNode(node)) return true;
  if ($isVerseNode(node)) return verseNeedsSentinel(node);
  if ($isCharNode(node))
    return Boolean(node.getUnknownAttributes()) || getMarker(node.getMarker()) === undefined;
  return false;
}

// Delimiters (never present in scripture text) that wrap a structural element's
// signature span so a structural change is always visible in the signature string.
const SIGNATURE_OPEN = String.fromCharCode(1);
const SIGNATURE_CLOSE = String.fromCharCode(2);

/**
 * Structure-aware, sentinel-normalized signature of a node list, used ONLY to detect
 * a `$rebuildParas` no-op (fixed point). Marker glyphs and text contribute their
 * fragment text; every structural element (paragraph, CharNode span, verse-as-text,
 * transparent wrapper) contributes a delimited, type-tagged span — so any structural
 * change a real rebuild makes (e.g. flat `\nd x\nd*` literal text becoming a CharNode)
 * yields a different signature and is never mistaken for a no-op. Preserved (sentinel)
 * nodes and the U+FFFC placeholders that stand in for them until `$replaceSentinels`
 * both collapse to `ATOMIC_SENTINEL`, so a pre-splice rebuild output and the paragraphs
 * it was derived from compare equal IFF the rebuild changed nothing that matters.
 */
function $appendSignature(children: LexicalNode[], out: string[]): void {
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMilestoneNode(node)) {
      // Mirror `$appendChildrenFragment`: the milestone's display run (opening
      // MarkerNode, optional attribute text, self-closing MarkerNode) is absorbed
      // into the SAME single sentinel the fragment builder produces for it — the
      // post-splice NEW side's sentinel already stands in for the whole run, so the
      // pre-splice OLD side must collapse the run the same way or the signatures
      // never compare equal and the fixed-point refusal never fires.
      const run = $milestoneDisplayRun(children, index);
      out.push(ATOMIC_SENTINEL);
      index += run.length;
    } else if ($isMarkerNode(node)) {
      // Delimited and tagged (not bare glyph text) so text moving across the
      // glyph/content boundary — e.g. glyph "\q extra" vs. glyph "\q" + content
      // "extra" — changes the signature instead of silently canceling out.
      out.push(SIGNATURE_OPEN, "marker", toFragmentText(node.getTextContent()), SIGNATURE_CLOSE);
    } else if (isRebuildSentinel(node)) {
      out.push(ATOMIC_SENTINEL);
    } else if ($isVerseNode(node)) {
      out.push(SIGNATURE_OPEN, "verse", toFragmentText(node.getTextContent()), SIGNATURE_CLOSE);
    } else if ($isLineBreakNode(node)) {
      out.push(" ");
    } else if ($isTextNode(node)) {
      const textType = $getState(node, textTypeState);
      out.push(textType === "marker-trailing-space" ? " " : toFragmentText(node.getTextContent()));
    } else if ($isElementNode(node)) {
      out.push(SIGNATURE_OPEN, node.getType());
      $appendSignature(node.getChildren(), out);
      out.push(SIGNATURE_CLOSE);
    } else {
      out.push(ATOMIC_SENTINEL);
    }
  }
}

function $signatureOf(nodes: LexicalNode[]): string {
  const out: string[] = [];
  $appendSignature(nodes, out);
  return out.join("");
}

function $appendChildrenFragment(element: ElementNode, out: FragmentAccumulator): void {
  $appendNodesFragment(element.getChildren(), out);
}

function $appendNodesFragment(children: LexicalNode[], out: FragmentAccumulator): void {
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if ($isMarkerNode(node)) {
      pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isMilestoneNode(node)) {
      const run = $milestoneDisplayRun(children, index);
      pushSentinel(out, [node, ...run]);
      index += run.length;
    } else if ($isNoteNode(node) || $isUnknownNode(node)) {
      pushSentinel(out, [node]);
    } else if ($isVerseNode(node)) {
      if (verseNeedsSentinel(node)) pushSentinel(out, [node]);
      else pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isCharNode(node)) {
      // Unknown-marker spans (custom.sty) are not text-recoverable: the
      // tokenizer would degrade them to literal text (preserve-or-refuse).
      if (node.getUnknownAttributes() || getMarker(node.getMarker()) === undefined)
        pushSentinel(out, [node]);
      else $appendChildrenFragment(node, out);
    } else if ($isLineBreakNode(node)) {
      pushText(out, node, " ");
    } else if ($isTextNode(node)) {
      const textType = $getState(node, textTypeState);
      if (textType === "marker-trailing-space") pushText(out, node, " ");
      else pushText(out, node, toFragmentText(node.getTextContent()));
    } else if ($isElementNode(node)) {
      // TypedMarkNode and other transparent wrappers: annotation marks are
      // host-reapplied overlays; their text content is rebuilt as plain content.
      $appendChildrenFragment(node, out);
    } else {
      pushSentinel(out, [node]);
    }
  }
}

function $buildParaFragment(para: ParaNode): FragmentAccumulator | undefined {
  // §5.2 guard rails (preserve-or-refuse): a paragraph the engine cannot fully
  // re-derive from its text is never rebuilt — edits inside it stay literal text.
  if (para.getUnknownAttributes()) return undefined;
  // Unknown/custom.sty para marker: the tokenizer would re-wrap the fragment in
  // a default \p and turn the real marker into literal text (invented bytes).
  if (getMarker(para.getMarker())?.type !== MarkerType.Paragraph) return undefined;
  // Paragraphs inside opaque blocks (§7: sidebars, periph, …) stay untouched.
  for (let parent = para.getParent(); parent !== null; parent = parent.getParent())
    if ($isUnknownNode(parent)) return undefined;
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendChildrenFragment(para, out);
  return out;
}

/** Replace each U+FFFC in the rebuilt tree with the next preserved node run. */
function $replaceSentinels(roots: LexicalNode[], originals: LexicalNode[][]): void {
  let queueIndex = 0;
  const visit = (node: LexicalNode): void => {
    if ($isTextNode(node)) {
      let current: TextNode | undefined = node;
      while (current) {
        const text: string = current.getTextContent();
        const at = text.indexOf(ATOMIC_SENTINEL);
        if (at < 0) break;
        let sentinelNode: TextNode = current;
        let after: TextNode | undefined;
        if (at > 0) [, sentinelNode] = current.splitText(at) as [TextNode, TextNode];
        if (sentinelNode.getTextContent().length > 1)
          [sentinelNode, after] = sentinelNode.splitText(1) as [TextNode, TextNode];
        const run = originals[queueIndex++];
        if (run && run.length > 0) {
          let previous: LexicalNode = sentinelNode;
          for (const original of run) {
            previous.insertAfter(original); // moves it out of the old paragraph
            previous = original;
          }
        }
        sentinelNode.remove();
        current = after;
      }
    } else if ($isElementNode(node)) {
      // copy: children may be replaced while visiting
      [...node.getChildren()].forEach(visit);
    }
  };
  roots.forEach(visit);
}

/** U+FFFC occurrences across tokenized content — must equal the preserved-run count. */
function countSentinels(content: MarkerContent[]): number {
  let count = 0;
  for (const item of content) {
    if (typeof item === "string") {
      for (const ch of item) if (ch === ATOMIC_SENTINEL) count++;
    } else if (item.content) {
      count += countSentinels(item.content);
    }
  }
  return count;
}

function $spansForNodes(nodes: LexicalNode[]): FragmentSpan[] {
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const node of nodes) {
    if (out.text.length > 0) out.text += " ";
    if ($isElementNode(node)) $appendChildrenFragment(node, out);
  }
  return out.spans;
}

/** Place the collapsed caret at `offset` within `spans`, falling back to the first element. */
function $selectAtFragmentOffset(
  spans: FragmentSpan[],
  offset: number,
  newNodes: LexicalNode[],
): void {
  let best: { key: string; offset: number } | undefined;
  for (const span of spans) {
    if (span.isSentinel) continue;
    if (offset >= span.start && offset <= span.end) {
      best = { key: span.key, offset: offset - span.start };
      break;
    }
    if (span.start > offset) {
      best = { key: span.key, offset: 0 };
      break;
    }
  }
  if (!best) {
    const last = [...spans].reverse().find((span) => !span.isSentinel);
    if (last) best = { key: last.key, offset: last.end - last.start };
  }
  if (best) {
    const node = $getNodeByKey<TextNode>(best.key);
    if (node && $isTextNode(node)) {
      node.select(best.offset, best.offset);
      return;
    }
  }
  newNodes.find($isElementNode)?.selectStart();
}

function $restoreSelectionAtOffset(
  newNodes: LexicalNode[],
  offset: number | undefined,
  anchorInParas: boolean,
): void {
  // The caret was somewhere else entirely (the primary completion flow: the user
  // typed a mid-edit marker, then clicked/arrowed into another paragraph, which is
  // what triggered this rebuild). The rebuilt paragraphs are not where the caret
  // lives, so leave the selection strictly untouched rather than yanking it back in.
  if (!anchorInParas) return;
  if (offset === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  $selectAtFragmentOffset($spansForNodes(newNodes), offset, newNodes);
}

/**
 * Restore the caret inside rebuilt NOTE content. Unlike `$restoreSelectionAtOffset`, the
 * content nodes form one contiguous region, so spans are computed with `$appendNodesFragment`
 * (no inter-node separators) to match the offset captured over `$buildNoteFragment`'s text.
 */
function $restoreSelectionInNoteContent(
  newNodes: LexicalNode[],
  offset: number | undefined,
  anchorInNote: boolean,
): void {
  if (!anchorInNote) return;
  if (offset === undefined) {
    newNodes.find($isElementNode)?.selectStart();
    return;
  }
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(newNodes, out);
  $selectAtFragmentOffset(out.spans, offset, newNodes);
}

export function $rebuildParas(
  paras: ParaNode[],
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  if (paras.length === 0) return false;

  const combined: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  for (const para of paras) {
    const fragment = $buildParaFragment(para);
    if (!fragment) {
      logger?.debug("[MarkerEdit] Tier 2 skipped: paragraph excluded by guard rails");
      return false;
    }
    if (combined.text.length > 0) combined.text += " ";
    const base = combined.text.length;
    fragment.spans.forEach((span) =>
      combined.spans.push({ ...span, start: span.start + base, end: span.end + base }),
    );
    combined.sentinels.push(...fragment.sentinels);
    combined.text += fragment.text;
  }

  // Capture the caret as a fragment offset before mutating anything, and note whether
  // the anchor was actually inside the paragraphs being rebuilt (vs. parked elsewhere).
  let caretOffset: number | undefined;
  let anchorInParas = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (paras.some((para) => para.is(node))) {
        anchorInParas = true;
        break;
      }
    if (selection.isCollapsed()) {
      const span = combined.spans.find((candidate) => candidate.key === selection.anchor.key);
      if (span)
        caretOffset = Math.min(
          span.start + (span.isSentinel ? 1 : selection.anchor.offset),
          span.end,
        );
    }
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(combined.text);
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  // Symmetry bail-out: every preserved node run must have exactly one placeholder
  // in the output, or the rebuild aborts with the paragraph untouched. A tokenizer
  // bug must fail as "nothing happened", never as a silently dropped node.
  if (countSentinels(content) !== combined.sentinels.length) {
    logger?.warn("[MarkerEdit] Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    viewOptions,
  );
  const newNodes = serialized.root.children.map((child) => $parseSerializedNode(child));

  // Fixed-point refusal (preserve-or-refuse). If the freshly-tokenized output is
  // structurally identical to the paragraphs it was derived from, this rebuild is a
  // no-op: splicing it in would reproduce the same unresolved literal text (an
  // unterminated `\zzz`, a path-like `C:\temp`, a typo'd `\qq1`), re-arm the TextNode
  // catch-all transform, and — via the caret-departure/Enter completion path — drive an
  // endless resolve→rebuild→resolve cascade that hangs the main thread. Compare BEFORE
  // any mutation and bail. The signature normalizes preserved nodes and their U+FFFC
  // placeholders to the same token, so this is a structure+text comparison, not node
  // identity; a rebuild that actually restructures anything (literal `\nd x\nd*` → a
  // CharNode span) has a different signature and is never mistaken for a no-op.
  if ($signatureOf(newNodes) === $signatureOf(paras)) {
    logger?.debug("[MarkerEdit] Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  const firstPara = paras[0];
  newNodes.forEach((node) => firstPara.insertBefore(node));
  // Move originals BEFORE removing the old paragraphs (removal destroys leftovers).
  $replaceSentinels(newNodes, combined.sentinels);
  paras.forEach((para) => para.remove());
  $restoreSelectionAtOffset(newNodes, caretOffset, anchorInParas);
  return true;
}

/**
 * Build the re-tokenizable fragment for a note's CONTENT children — everything strictly
 * between the note's opening MarkerNode(s) + caller prefix and its trailing closing
 * MarkerNode(s). Preserve-or-refuse (returns undefined) when the note is collapsed, has
 * unknown attributes, an unrecoverable marker, or an unexpected caller/prefix shape: a
 * note the engine cannot cleanly re-derive is never rebuilt.
 */
function $buildNoteFragment(
  note: NoteNode,
): { out: FragmentAccumulator; contentNodes: LexicalNode[] } | undefined {
  // Only inline-expanded notes are re-tokenizable: a collapsed note's content is not
  // inline-editable and its display layout (interspersed spacing) is not text-recoverable.
  if (note.getIsCollapsed() !== false) return undefined;
  // The note node itself (marker, caller, and any unknown attributes such as the
  // unclosed-note `closed="false"`) is PRESERVED across the rebuild, so its own
  // attributes never disqualify a content re-tokenization; only a marker the engine
  // cannot recognize is refused as a sanity guard.
  if (!NoteNode.isValidMarker(note.getMarker())) return undefined;

  const children = note.getChildren();
  // Skip the leading opening-marker(s) prefix.
  let start = 0;
  while (start < children.length) {
    const node = children[start];
    if (!$isMarkerNode(node) || node.getMarkerSyntax() !== "opening") break;
    start++;
  }
  // Skip the caller node (an ImmutableNoteCallerNode, or the expanded editable caller
  // TextNode); anything else in this slot is an unexpected shape, so refuse.
  const callerNode = children[start];
  if (!callerNode) return undefined;
  const isCaller =
    $isImmutableNoteCallerNode(callerNode) ||
    ($isTextNode(callerNode) &&
      callerNode.getTextContent() === getEditableCallerText(note.getCaller()));
  if (!isCaller) return undefined;
  start++;
  // Skip the trailing closing-marker(s).
  let end = children.length;
  while (end > start) {
    const node = children[end - 1];
    if (!$isMarkerNode(node) || node.getMarkerSyntax() !== "closing") break;
    end--;
  }

  const contentNodes = children.slice(start, end);
  const out: FragmentAccumulator = { text: "", spans: [], sentinels: [] };
  $appendNodesFragment(contentNodes, out);
  return { out, contentNodes };
}

/**
 * Note-scoped Tier 2 re-tokenization (design spec §5.2/§6). Mirrors `$rebuildParas` but
 * operates on a single note's CONTENT children. The note node identity, its opening
 * marker(s), its caller, and its closing marker(s) are PRESERVED; only the content is
 * re-tokenized. Preserve-or-refuse: any guard-rail failure returns false with the note
 * untouched (never a partial mutation, never an infinite loop). A NoteNode inside a
 * PARAGRAPH rebuild stays an atomic sentinel; only this path descends into its content.
 */
export function $rebuildNoteContent(
  note: NoteNode,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  const built = $buildNoteFragment(note);
  if (!built) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: note excluded by guard rails");
    return false;
  }
  const { out, contentNodes } = built;

  // Capture the caret as a fragment offset before mutating, noting whether the anchor
  // was actually inside this note (vs. parked elsewhere) — mirror `$rebuildParas`.
  let caretOffset: number | undefined;
  let anchorInNote = false;
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    for (let node: LexicalNode | null = selection.anchor.getNode(); node; node = node.getParent())
      if (note.is(node)) {
        anchorInNote = true;
        break;
      }
    if (selection.isCollapsed()) {
      const span = out.spans.find((candidate) => candidate.key === selection.anchor.key);
      if (span)
        caretOffset = Math.min(
          span.start + (span.isSentinel ? 1 : selection.anchor.offset),
          span.end,
        );
    }
  }

  const content: MarkerContent[] = usfmFragmentToUsjContent(out.text);
  if (content.length === 0) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: tokenizer produced no content");
    return false;
  }
  // Symmetry bail-out (see `$rebuildParas`): a preserved-run/placeholder mismatch aborts
  // the rebuild with the note untouched rather than silently dropping a node.
  if (countSentinels(content) !== out.sentinels.length) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: sentinel/preserved-node count mismatch");
    return false;
  }

  // Serialize note content with noteMode:"expanded" so char spans render editable inline,
  // then UNWRAP the tokenizer's default \p wrapper (root -> para -> content).
  const noteViewOptions: ViewOptions = { ...viewOptions, noteMode: "expanded" };
  const serialized = usjEditorAdaptor.serializeEditorState(
    { type: USJ_TYPE, version: USJ_VERSION, content },
    noteViewOptions,
  );
  const topLevel = serialized.root.children;
  const wrapper = topLevel[0] as { children?: SerializedLexicalNode[] } | undefined;
  const wrapperChildren = wrapper?.children;
  if (topLevel.length !== 1 || !wrapperChildren) {
    logger?.warn("[MarkerEdit] Note Tier 2 aborted: unexpected serialized shape");
    return false;
  }
  // The editable \p wrapper prepends a visible para MarkerNode + marker-trailing-space
  // that must NOT enter the note content; drop that prefix on unwrap.
  const newNodes = wrapperChildren
    .map((child) => $parseSerializedNode(child))
    .filter(
      (node) => !$isMarkerNode(node) && $getState(node, textTypeState) !== "marker-trailing-space",
    );
  if (newNodes.length === 0) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: no content nodes after unwrap");
    return false;
  }

  // Fixed-point refusal (preserve-or-refuse) on the CONTENT nodes only: if the freshly
  // tokenized content is structurally identical to what it was derived from, splicing it
  // would re-arm the trigger and loop. Compare BEFORE any mutation and bail.
  if ($signatureOf(newNodes) === $signatureOf(contentNodes)) {
    logger?.debug("[MarkerEdit] Note Tier 2 skipped: rebuild is a no-op (fixed point)");
    return false;
  }

  // Splice: insert the new content before the first old content node (or before the
  // closing marker / at the note end when the note had no prior content), move preserved
  // sentinel runs into place, then remove the originals.
  const firstContent = contentNodes[0];
  if (firstContent) {
    newNodes.forEach((node) => firstContent.insertBefore(node));
  } else {
    const closing = note
      .getChildren()
      .find((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing");
    newNodes.forEach((node) => (closing ? closing.insertBefore(node) : note.append(node)));
  }
  $replaceSentinels(newNodes, out.sentinels);
  contentNodes.forEach((node) => node.remove());
  $restoreSelectionInNoteContent(newNodes, caretOffset, anchorInNote);
  return true;
}

/** Route a Tier 1-unexpressible edit to Tier 2 via the node's paragraph or note. */
export function $requestTier2ForNode(
  node: LexicalNode,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): void {
  let current: LexicalNode | null = node;
  while (current) {
    // Note content is its own re-tokenization scope (§5.2/§6): route to the note-scoped
    // rebuild, which preserves the note node, its marker(s), and its caller.
    if ($isNoteNode(current)) return void $rebuildNoteContent(current, viewOptions, logger);
    if ($isUnknownNode(current)) return; // opaque-block interior (§7): stay literal
    if ($isParaNode(current)) {
      $rebuildParas([current], viewOptions, logger);
      return;
    }
    current = current.getParent();
  }
}
