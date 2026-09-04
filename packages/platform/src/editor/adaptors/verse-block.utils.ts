/**
 * Regroups a chapter's flat verse runs into one block-level element per verse, for the block verse
 * view (`ViewOptions.verseLayout`).
 *
 * USJ nests verses inside paragraphs; a layout that puts each verse on its own row needs the
 * opposite nesting. Running as a post-pass over the serialized children leaves every `create*`
 * function in `usj-editor.adaptor.ts` untouched, so the inline layouts cannot be affected.
 *
 * Where a verse starts and ends follows paranext-core's `sliceUsjToVerse`
 * (`extensions/src/platform-scripture-editor/src/scripture-text-grid/verse-display.utils.ts`),
 * generalized from slicing out one verse to grouping every verse in one pass. Core's other half -
 * `hasRenderableText`, the emptiness verdict its grid consults to suppress a row - is deliberately
 * not ported: this is the model layer, so a verse opener always gets its block, and whether a block
 * with nothing renderable in it is shown, collapsed, or hidden stays a view-layer decision.
 */

import {
  CategoryType,
  isSerializedBookNode,
  isSerializedParaNode,
  isSerializedTypedMarkNode,
  isSomeSerializedChapterNode,
  isSomeSerializedParaNode,
  MarkerType,
  LoggerBasic,
  SerializedTypedMarkNode,
  SerializedVerseBlockNode,
  SomeSerializedParaNode,
  VERSE_BLOCK_TYPE,
  usfmMarkers,
  VERSE_BLOCK_VERSION,
} from "shared";
import { isSomeSerializedVerseNode, SomeSerializedVerseNode } from "shared-react";
import { SerializedLexicalNode } from "lexical";

const SEMANTIC_DIVISION_MARKER = /^sd\d*$/;

/**
 * Paragraph markers that begin a heading rather than verse content. Grouping stops at these so a
 * following section header does not become part of the preceding verse.
 *
 * Derived from the generated marker data rather than hand-listed, so a heading marker added
 * upstream cannot be silently swallowed into the preceding verse's block. `qa` is added because it
 * is a poetry-acrostic heading that the data files file under Poetry. The book titles this picks up
 * (`mt*`) precede every verse, so treating them as boundaries costs nothing, and `mte*` closing an
 * open verse at the end of a book is correct.
 *
 * `sd*` is excluded even though the data files file it with the headings: a semantic division is
 * contentless vertical space, not a heading. Ending the open verse there would leave the rest of
 * that verse outside every block - the paragraph after it carries no verse marker of its own - and
 * so off every layout row, the same content loss that keeps a non-paragraph container with the open
 * verse below. Core's `sliceUsjToVerse` hand-lists its boundary markers and does not include `sd*`
 * either, so both paths end a verse in the same place.
 */
const STRUCTURAL_MARKERS = new Set([
  ...Object.entries(usfmMarkers)
    .filter(
      ([name, marker]) =>
        marker.category === CategoryType.TitlesHeadings &&
        marker.type === MarkerType.Paragraph &&
        !SEMANTIC_DIVISION_MARKER.test(name),
    )
    .map(([marker]) => marker),
  "qa",
]);

/**
 * A run of a paragraph's content. The first run of a paragraph has no verse of its own - it either
 * continues the verse left open by an earlier paragraph, or is content before any verse.
 */
interface VerseRun {
  verse?: SomeSerializedVerseNode;
  nodes: SerializedLexicalNode[];
}

/**
 * Groups each verse into a `VerseBlockNode` holding that verse's paragraphs.
 *
 * @param children - Children of the editor root, after implied paragraphs have been inserted so
 *   that every paragraph container is already in place.
 * @param logger - Logger instance.
 * @returns the children with verses grouped into blocks.
 */
export function groupVersesIntoBlocks(
  children: SerializedLexicalNode[],
  logger?: LoggerBasic,
): SerializedLexicalNode[] {
  const grouped: SerializedLexicalNode[] = [];
  /** The block still collecting content; persists across paragraphs so a verse spanning poetry
   * lines is collected whole. */
  let activeBlock: SerializedVerseBlockNode | undefined;

  for (const child of children) {
    // Chrome is a boundary - an open verse never crosses a chapter marker.
    if (isSerializedBookNode(child) || isSomeSerializedChapterNode(child)) {
      activeBlock = undefined;
      grouped.push(child);
      continue;
    }

    if (!isSomeSerializedParaNode(child)) {
      // Anything else at root - a table, an `\esb` sidebar - holds its content in a structure that
      // cannot be split into one row per verse. Keeping it with the open verse is what preserves
      // the rest of that verse: the paragraph after it carries no verse marker of its own, so
      // closing the block here would leave that text outside every block and off every row.
      if (logger && containsVerse(child))
        logger.warn(
          `Verses inside a '${child.type}' are not grouped into blocks; the whole node stays with ` +
            `the surrounding verse.`,
        );
      if (activeBlock) activeBlock.children.push(child);
      else grouped.push(child);
      continue;
    }

    // Headings stay in the model as ordinary paragraphs between blocks. Whether an aligned view
    // shows, hides, or spans them is a view-layer decision, so nothing is destroyed here.
    // A heading marker that carries a verse is not a heading boundary: Hebrew psalm versification
    // puts verse 1 inside the `\d` descriptor, and treating that as chrome would leave verse 1
    // with no block at all. Such a paragraph falls through and is split like any other.
    if (
      isSerializedParaNode(child) &&
      STRUCTURAL_MARKERS.has(child.marker) &&
      !containsVerse(child)
    ) {
      activeBlock = undefined;
      grouped.push(child);
      continue;
    }

    // A paragraph with no content is vertical space, not verse content - `` is a stanza break.
    // It has no run to split, and dropping it would delete it from the document. Keep it where it
    // was: inside the open verse if there is one, so document order is preserved.
    if (child.children.length === 0) {
      if (activeBlock) activeBlock.children.push(child);
      else grouped.push(child);
      continue;
    }

    splitIntoRuns(child.children, logger).forEach((run) => {
      const fragment = createFragment(child, run.nodes);

      if (!run.verse) {
        // Content before this paragraph's first verse: either the open verse continuing onto a new
        // line, or - with no verse open - content that precedes any verse, such as a psalm
        // descriptor. Neither invents a block.
        if (!fragment) return;
        if (activeBlock) activeBlock.children.push(fragment);
        else grouped.push(fragment);
        return;
      }

      activeBlock = createVerseBlock(run.verse);
      grouped.push(activeBlock);
      if (fragment) activeBlock.children.push(fragment);
    });
  }

  return grouped;
}

/**
 * Splits a paragraph's children at each verse marker.
 *
 * A comment mark can wrap a run that crosses a verse marker, so the mark is split too and cloned
 * onto each side with its IDs intact, keeping the comment rendered across the boundary. Sharing an
 * ID across the clones is what the annotation registry already expects - it maps one ID to a set of
 * mark node keys (`AnnotationPlugin`'s `Map<string, Set<NodeKey>>`), because a mark can be split
 * for other reasons too. Nothing round-trips from here to corrupt: block verse refuses USJ export.
 */
function splitIntoRuns(nodes: SerializedLexicalNode[], logger?: LoggerBasic): VerseRun[] {
  const runs: VerseRun[] = [{ nodes: [] }];
  const addToCurrentRun = (node: SerializedLexicalNode) => runs[runs.length - 1].nodes.push(node);

  nodes.forEach((node) => {
    if (isVerseOpener(node)) {
      runs.push({ verse: node, nodes: [node] });
      return;
    }

    if (isSerializedTypedMarkNode(node)) {
      const innerRuns = splitIntoRuns(node.children, logger);
      const [continuingRun, ...verseRuns] = innerRuns;
      if (continuingRun.nodes.length > 0) addToCurrentRun(cloneMark(node, continuingRun.nodes));
      verseRuns.forEach((innerRun) => {
        runs.push({ verse: innerRun.verse, nodes: [cloneMark(node, innerRun.nodes)] });
      });
      return;
    }

    if (logger && containsVerse(node)) {
      // USJ does not nest verses inside character or note content, so this is malformed input. It
      // stays with the surrounding run rather than being silently dropped.
      logger?.warn(
        `Verse marker nested inside a '${node.type}' node was not grouped into a block.`,
      );
    }
    addToCurrentRun(node);
  });

  return runs;
}

function cloneMark(
  markNode: SerializedTypedMarkNode,
  children: SerializedLexicalNode[],
): SerializedTypedMarkNode {
  return { ...markNode, children };
}

/**
 * Whether a serialized verse node opens a verse rather than closing one.
 *
 * A verse milestone can be an `eid`-only closer carrying no number, and `createVerse` coerces a
 * missing number to `""`, so the node type alone cannot tell the two apart. Treating a closer as an
 * opener would start a numberless block and truncate the real verse's. Core's slicer guards on the
 * number for the same reason.
 */
function isVerseOpener(node: SerializedLexicalNode): node is SomeSerializedVerseNode {
  return isSomeSerializedVerseNode(node) && node.number !== "";
}

/** Whether a verse opener is somewhere below this node. Used only to report malformed input. */
function containsVerse(node: SerializedLexicalNode): boolean {
  const children = (node as { children?: SerializedLexicalNode[] }).children;
  if (!Array.isArray(children)) return false;

  return children.some((child) => isVerseOpener(child) || containsVerse(child));
}

/**
 * A copy of the paragraph holding only the given run. Spreads the source rather than listing
 * fields, so an implied paragraph stays implied - it has no `marker`, and rebuilding it as a real
 * paragraph would put a `\p` in the document that the source USJ never had.
 */
function createFragment(
  para: SomeSerializedParaNode,
  nodes: SerializedLexicalNode[],
): SomeSerializedParaNode | undefined {
  if (nodes.length === 0) return undefined;

  return { ...para, children: nodes };
}

/** An empty block carrying the verse's number; the range it covers is derived from that number. */
function createVerseBlock(verse: SomeSerializedVerseNode): SerializedVerseBlockNode {
  return {
    type: VERSE_BLOCK_TYPE,
    number: verse.number,
    children: [],
    direction: null,
    format: "",
    indent: 0,
    version: VERSE_BLOCK_VERSION,
  };
}
