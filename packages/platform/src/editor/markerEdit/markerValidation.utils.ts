/**
 * Marker validation — a port of PT9's ValidateUsxStyles pass
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

export interface ParaStackEntry {
  marker: string;
  rank: number;
  occursUnder: readonly string[];
}

function getEntry(styleInfo: StyleInfo, marker: string): MarkerStyleInfo | undefined {
  return styleInfo.markers[marker.replace(/^\+/, "")];
}

/** What opening `tag` would do to a validity stack, when it is valid there at all. */
interface ParaTagPlacement {
  /** How many of the stack's entries survive the tag; everything above them is popped. */
  keep: number;
  /**
   * Whether the tag itself then joins the stack. An empty-occursUnder tag is valid anywhere and
   * deliberately does NOT join (PT9 TagValidator.cs:28-30 returns without Add).
   */
  joins: boolean;
}

/**
 * The decision half of PT9 TagValidator.IsParagraphTagValid (TagValidator.cs:18-57), with no
 * mutation: `undefined` when `tag` cannot open at the context `stack` describes, otherwise how
 * the stack would change if it did. Both public entry points below read this, so the predicate
 * and the mutator can never disagree about validity.
 */
function placeParaTag(
  stack: readonly ParaStackEntry[],
  tag: ParaStackEntry,
): ParaTagPlacement | undefined {
  if (stack.length === 0) return { keep: 0, joins: true };
  if (tag.occursUnder.length === 0) return { keep: stack.length, joins: false };
  for (let i = stack.length - 1; i >= 0; i--) {
    if (!tag.occursUnder.includes(stack[i].marker)) continue;
    if (i === stack.length - 1 || tag.rank === 0 || stack[i + 1].rank <= tag.rank)
      return { keep: i + 1, joins: true };
    // Matched ancestor but rank forbids — keep scanning lower entries (PT9 continues).
  }
  return undefined;
}

/**
 * Whether `tag` may open at the context `stack` describes — PT9
 * TagValidator.IsParagraphTagValid's `addTag: false` call (TagValidator.cs:18-57).
 *
 * Pure: `stack` is not modified. Use this to PROBE a candidate; use
 * {@link pushParaTagIfValid} to advance the stack over a tag that is actually there.
 */
export function isParagraphTagValid(
  stack: readonly ParaStackEntry[],
  tag: ParaStackEntry,
): boolean {
  return placeParaTag(stack, tag) !== undefined;
}

/**
 * Advance `stack` over `tag` — PT9 TagValidator.IsParagraphTagValid's `addTag: true` call
 * (TagValidator.cs:18-57), the replay used to walk the paragraphs before a point.
 *
 * MUTATES `stack` when the tag is valid: entries the tag closes are popped, and the tag itself is
 * pushed unless its occursUnder is empty (valid anywhere, never joins). An invalid tag leaves the
 * stack untouched. Returns the same verdict as {@link isParagraphTagValid}, so a caller that also
 * wants to flag the invalid case can read it.
 */
export function pushParaTagIfValid(stack: ParaStackEntry[], tag: ParaStackEntry): boolean {
  const placement = placeParaTag(stack, tag);
  if (!placement) return false;
  if (placement.joins) {
    stack.length = placement.keep;
    stack.push(tag);
  }
  return true;
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
      // Opaque blocks (sidebars, periph, …): never descend.
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
      // PT9 auto-creates unknown tags with empty occursUnder (ScrStylesheet
      // .GetTagIndex:182-201) — valid anywhere, and like every empty-occursUnder
      // tag they do NOT join a non-empty stack (TagValidator.cs:28-30).
      pushParaTagIfValid(stack, { marker, rank: 0, occursUnder: [] });
      return;
    }
    const tag: ParaStackEntry = {
      marker,
      rank: entry.rank ?? 0,
      occursUnder: entry.occursUnder ?? [],
    };
    if (!pushParaTagIfValid(stack, tag)) flagGlyphs(node, "invalid", out);
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
