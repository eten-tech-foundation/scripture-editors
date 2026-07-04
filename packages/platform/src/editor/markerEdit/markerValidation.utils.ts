/**
 * §5.1 marker validation — a port of PT9's ValidateUsxStyles pass
 * (ViewUsfmXhtmlConverter.cs:288-345) + TagValidator.IsParagraphTagValid
 * (TagValidator.cs:18-57), run over the Lexical tree instead of USX.
 *
 * Two states, PT9 semantics:
 * - "unknown": marker absent from the effective stylesheet (bold red glyph).
 * - "invalid": known marker whose occursUnder/rank forbids this context
 *   (red underlined glyph). Unknown wins over invalid.
 *
 * Map keys are DOM-decoration targets: the flagged node's MarkerNode glyph
 * keys (opener AND closer — PT9 stamps both marker spans), or the VerseNode's
 * own key (its text IS the glyph). Note elements are NOT context-validated
 * (PT9's node set excludes //note); chars inside a note validate against the
 * note's marker; nested chars validate against the PARAGRAPH marker (PT9
 * ancestor::para[1]); chars under an `xq` ancestor are exempt.
 */
import { $getRoot, $isElementNode, ElementNode, LexicalNode, NodeKey } from "lexical";
import {
  $isBookNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  $isUnknownNode,
  MarkerStyleInfo,
  StyleInfo,
} from "shared";
import { $isSomeVerseNode } from "shared-react";

export type MarkerValidity = "unknown" | "invalid";

interface ParaStackEntry {
  marker: string;
  rank: number;
  occursUnder: readonly string[];
}

function getEntry(styleInfo: StyleInfo, marker: string): MarkerStyleInfo | undefined {
  return styleInfo.markers[marker.replace(/^\+/, "")];
}

/** Port of PT9 TagValidator.IsParagraphTagValid (TagValidator.cs:18-57). */
function isParagraphTagValid(stack: ParaStackEntry[], tag: ParaStackEntry): boolean {
  if (stack.length === 0 || tag.occursUnder.length === 0) {
    stack.push(tag);
    return true;
  }
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!tag.occursUnder.includes(stack[i].marker)) continue;
    if (i === stack.length - 1 || tag.rank === 0 || stack[i + 1].rank <= tag.rank) {
      stack.length = i + 1;
      stack.push(tag);
      return true;
    }
    // Matched ancestor but rank forbids — keep scanning lower entries (PT9 continues).
  }
  return false;
}

/** Flag a node's visible marker glyphs (opener and closer MarkerNodes). Decorator
 * variants (ImmutableChapterNode) have no MarkerNode children — flag the node itself. */
function flagGlyphs(
  node: LexicalNode,
  validity: MarkerValidity,
  out: Map<NodeKey, MarkerValidity>,
): void {
  const glyphs = $isElementNode(node) ? node.getChildren().filter($isMarkerNode) : [];
  if (glyphs.length === 0) {
    out.set(node.getKey(), validity);
    return;
  }
  for (const glyph of glyphs) out.set(glyph.getKey(), validity);
}

function checkChar(
  node: ElementNode,
  marker: string,
  contextMarker: string,
  styleInfo: StyleInfo,
  out: Map<NodeKey, MarkerValidity>,
): void {
  const entry = getEntry(styleInfo, marker);
  if (!entry) {
    flagGlyphs(node, "unknown", out);
    return;
  }
  const occursUnder = entry.occursUnder ?? [];
  if (occursUnder.length > 0 && !occursUnder.includes(contextMarker))
    flagGlyphs(node, "invalid", out);
}

function $validateInline(
  element: ElementNode,
  contextMarker: string,
  styleInfo: StyleInfo,
  out: Map<NodeKey, MarkerValidity>,
  insideXq: boolean,
): void {
  for (const child of element.getChildren()) {
    if ($isCharNode(child)) {
      const marker = child.getMarker();
      if (!insideXq) checkChar(child, marker, contextMarker, styleInfo, out);
      // Nested chars keep validating against the PARA/NOTE marker (PT9 ancestor::para[1]).
      $validateInline(child, contextMarker, styleInfo, out, insideXq || marker === "xq");
    } else if ($isSomeVerseNode(child)) {
      if (insideXq) continue;
      const entry = getEntry(styleInfo, "v");
      if (!entry) out.set(child.getKey(), "unknown");
      else if (
        (entry.occursUnder ?? []).length > 0 &&
        !(entry.occursUnder ?? []).includes(contextMarker)
      )
        out.set(child.getKey(), "invalid");
    } else if ($isNoteNode(child)) {
      // The note element itself is not context-validated (PT9 excludes //note);
      // its content validates against the NOTE's marker.
      $validateInline(child, child.getMarker(), styleInfo, out, insideXq);
    } else if ($isUnknownNode(child)) {
      // Opaque blocks (§7): never descend.
    } else if ($isElementNode(child)) {
      $validateInline(child, contextMarker, styleInfo, out, insideXq);
    }
  }
}

/**
 * Full-document validation pass. Call inside editor.read(). Returns the
 * decoration map keyed by glyph/verse node keys.
 */
export function $validateDocument(styleInfo: StyleInfo): Map<NodeKey, MarkerValidity> {
  const out = new Map<NodeKey, MarkerValidity>();
  const stack: ParaStackEntry[] = [];

  const validateParaLevel = (node: LexicalNode, marker: string): void => {
    const entry = getEntry(styleInfo, marker);
    if (!entry) {
      flagGlyphs(node, "unknown", out);
      // PT9 auto-creates unknown tags with empty occursUnder — valid anywhere,
      // and they join the stack (ScrStylesheet.GetTagIndex:182-201).
      isParagraphTagValid(stack, { marker, rank: 0, occursUnder: [] });
      return;
    }
    const tag: ParaStackEntry = {
      marker,
      rank: entry.rank ?? 0,
      occursUnder: entry.occursUnder ?? [],
    };
    if (!isParagraphTagValid(stack, tag)) flagGlyphs(node, "invalid", out);
  };

  for (const child of $getRoot().getChildren()) {
    if ($isUnknownNode(child)) continue; // opaque blocks: skip entirely
    if ($isBookNode(child) || $isSomeChapterNode(child)) {
      validateParaLevel(child, child.getMarker());
    } else if ($isParaNode(child)) {
      validateParaLevel(child, child.getMarker());
      $validateInline(child, child.getMarker(), styleInfo, out, false);
    } else if ($isElementNode(child)) {
      // ImpliedParaNode and other unmarked wrappers: no para-level flag; PT9's
      // implied paragraph context is the default \p.
      $validateInline(child, "p", styleInfo, out, false);
    }
  }
  return out;
}
