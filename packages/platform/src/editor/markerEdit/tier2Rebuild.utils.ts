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
  getMarker,
  LoggerBasic,
  MarkerType,
  NBSP,
  ParaNode,
  textTypeState,
  usfmFragmentToUsjContent,
  VerseNode,
} from "shared";
import { ViewOptions } from "shared-react";

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
  for (const node of children) {
    if ($isMarkerNode(node)) {
      out.push(toFragmentText(node.getTextContent()));
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
  const children = element.getChildren();
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
  const firstElement = newNodes.find($isElementNode);
  if (offset === undefined) {
    firstElement?.selectStart();
    return;
  }
  const spans = $spansForNodes(newNodes);
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
  firstElement?.selectStart();
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

/** Route a Tier 1-unexpressible edit to Tier 2 via the node's paragraph. */
export function $requestTier2ForNode(
  node: LexicalNode,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): void {
  let current: LexicalNode | null = node;
  while (current) {
    if ($isNoteNode(current)) return; // note content is its own scope (Phase 3)
    if ($isUnknownNode(current)) return; // opaque-block interior (§7): stay literal
    if ($isParaNode(current)) {
      $rebuildParas([current], viewOptions, logger);
      return;
    }
    current = current.getParent();
  }
}
