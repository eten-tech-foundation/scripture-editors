/**
 * A block-level container for one verse, used by the block verse view (`ViewOptions.verseLayout`).
 *
 * A verse is normally an inline milestone marker with no element around its text, so there is no
 * per-verse box for a layout to position. This node is that box: it holds the verse's paragraphs -
 * plural, so poetry keeps its `q1`/`q2` line structure - while still occupying a single row.
 *
 * Read-only. It is produced by the USJ-to-editor adaptor and has no editing surface; it is not
 * round-trippable back to USJ, because a source paragraph spanning several verses is split across
 * their blocks.
 */

import {
  $applyNodeReplacement,
  ElementNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { parseVerseRange } from "./node.utils.js";

export const VERSE_BLOCK_TYPE = "verse-block";
export const VERSE_BLOCK_VERSION = 1;
export const VERSE_BLOCK_CLASS_NAME = "verse-block";

export type SerializedVerseBlockNode = Spread<
  {
    /** The verse marker verbatim, e.g. `"5"` or `"14-15"`. */
    number: string;
    /** First verse number covered. */
    start: number;
    /** Last verse number covered; equal to `start` unless the marker bridges verses. */
    end: number;
  },
  SerializedElementNode
>;

export class VerseBlockNode extends ElementNode {
  __number: string;
  __start: number;
  __end: number;

  constructor(verseNumber = "", key?: NodeKey) {
    super(key);
    this.__number = verseNumber;
    const { start, end } = parseVerseRange(verseNumber);
    this.__start = start;
    this.__end = end;
  }

  static override getType(): string {
    return VERSE_BLOCK_TYPE;
  }

  static override clone(node: VerseBlockNode): VerseBlockNode {
    return new VerseBlockNode(node.__number, node.__key);
  }

  static override importJSON(serializedNode: SerializedVerseBlockNode): VerseBlockNode {
    return $createVerseBlockNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedVerseBlockNode>): this {
    return super.updateFromJSON(serializedNode).setNumber(serializedNode.number);
  }

  /** Sets the verse marker, re-deriving the range bounds from it. */
  setNumber(verseNumber: string): this {
    if (this.__number === verseNumber) return this;
    const self = this.getWritable();
    self.__number = verseNumber;
    const { start, end } = parseVerseRange(verseNumber);
    self.__start = start;
    self.__end = end;
    return self;
  }

  getNumber(): string {
    return this.getLatest().__number;
  }

  /** The first and last verse numbers this block covers. A bridge covers more than one. */
  getRange(): { start: number; end: number } {
    const self = this.getLatest();
    return { start: self.__start, end: self.__end };
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("div");
    dom.classList.add(VERSE_BLOCK_CLASS_NAME);
    setVerseAttributes(dom, this.__number, this.__start, this.__end);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    if (prevNode.__number !== this.__number)
      setVerseAttributes(dom, this.__number, this.__start, this.__end);
    return false;
  }

  // No `exportDOM`/`importDOM` overrides. Lexical's default export already emits `createDOM`'s
  // element, so copying a passage that spans verses carries these wrappers and their attributes.
  // There is deliberately no import counterpart: block verse is a read-only view, so pasting one
  // of these wrappers back in is not a supported flow.

  override exportJSON(): SerializedVerseBlockNode {
    const { start, end } = this.getRange();
    return {
      ...super.exportJSON(),
      type: VERSE_BLOCK_TYPE,
      number: this.getNumber(),
      start,
      end,
      version: VERSE_BLOCK_VERSION,
    };
  }

  override canBeEmpty(): false {
    return false;
  }

  // Deliberately NOT a shadow root, unlike the ImmutableTable* nodes this is otherwise modeled on.
  // A shadow root would isolate selection at every verse boundary, which would stop a reader
  // selecting and copying a continuous passage - the main reason verses are grouped this way -
  // and would stop `getTopLevelElement()` resolving to this node, which verse traversal relies on.
}

/**
 * Attributes a layout consumes to place the block on a row; `data-verse-start`/`-end` let a bridge
 * span rows. Deliberately not `data-number`, which the inner verse marker span already uses.
 */
function setVerseAttributes(dom: HTMLElement, verseNumber: string, start: number, end: number) {
  dom.setAttribute("data-verse-number", verseNumber);
  if (!isNaN(start)) dom.setAttribute("data-verse-start", start.toString());
  if (!isNaN(end)) dom.setAttribute("data-verse-end", end.toString());
}

export function $createVerseBlockNode(verseNumber?: string): VerseBlockNode {
  return $applyNodeReplacement(new VerseBlockNode(verseNumber));
}

export function $isVerseBlockNode(node: LexicalNode | null | undefined): node is VerseBlockNode {
  return node instanceof VerseBlockNode;
}

export function isSerializedVerseBlockNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedVerseBlockNode {
  return node?.type === VERSE_BLOCK_TYPE;
}
