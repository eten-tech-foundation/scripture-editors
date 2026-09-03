/** Conforms with USJ v3.1 table cells @see https://docs.usfm.bible/usfm/3.1/para/table.html */

import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
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
import { UnknownAttributes } from "./node-constants.js";

export type SerializedImmutableTableCellNode = Spread<
  {
    marker: string;
    align?: string;
    colspan?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

/** USJ marker type this node renders; the forward adaptor matches USJ input against it. */
export const TABLE_CELL_TYPE = "table:cell";
export const IMMUTABLE_TABLE_CELL_TYPE = "immutable-table-cell";
export const IMMUTABLE_TABLE_CELL_VERSION = 1;
export const TABLE_CELL_DEFAULT_MARKER = "tc1";

/**
 * A `MarkerObject` for a table cell. `colspan` is specific to table cells, so it lives here rather
 * than on the shared `MarkerObject`.
 */
export type ImmutableTableCellMarker = MarkerObject & { colspan?: string };

/** List of known properties of a table cell `MarkerObject` */
export const TABLE_CELL_MARKER_OBJECT_PROPS: (keyof ImmutableTableCellMarker)[] = [
  "type",
  "marker",
  "align",
  "colspan",
  "content",
];

// USJ `align` is logical (start/center/end), which CSS `text-align` supports natively and mirrors
// correctly under `dir` (RTL). Pass it straight through, ignoring unrecognized values, rather than
// mapping to the physical left/right — that would flip alignment in RTL scripts.
function toLogicalTextAlign(align: string | undefined): string | undefined {
  return align === "start" || align === "center" || align === "end" ? align : undefined;
}

export class ImmutableTableCellNode extends ElementNode {
  __marker: string;
  __align?: string;
  __colspan?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    marker = TABLE_CELL_DEFAULT_MARKER,
    align?: string,
    colspan?: string,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = marker;
    this.__align = align;
    this.__colspan = colspan;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return IMMUTABLE_TABLE_CELL_TYPE;
  }

  static override clone(node: ImmutableTableCellNode): ImmutableTableCellNode {
    const { __marker, __align, __colspan, __unknownAttributes, __key } = node;
    return new ImmutableTableCellNode(__marker, __align, __colspan, __unknownAttributes, __key);
  }

  static override importJSON(
    serializedNode: SerializedImmutableTableCellNode,
  ): ImmutableTableCellNode {
    return $createImmutableTableCellNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedImmutableTableCellNode>,
  ): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker ?? TABLE_CELL_DEFAULT_MARKER)
      .setAlign(serializedNode.align)
      .setColspan(serializedNode.colspan)
      .setUnknownAttributes(serializedNode.unknownAttributes);
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;
    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): string {
    return this.getLatest().__marker;
  }

  setAlign(align: string | undefined): this {
    if (this.__align === align) return this;
    const self = this.getWritable();
    self.__align = align;
    return self;
  }

  getAlign(): string | undefined {
    return this.getLatest().__align;
  }

  setColspan(colspan: string | undefined): this {
    if (this.__colspan === colspan) return this;
    const self = this.getWritable();
    self.__colspan = colspan;
    return self;
  }

  getColspan(): string | undefined {
    return this.getLatest().__colspan;
  }

  setUnknownAttributes(unknownAttributes: UnknownAttributes | undefined): this {
    const self = this.getWritable();
    self.__unknownAttributes = unknownAttributes;
    return self;
  }

  getUnknownAttributes(): UnknownAttributes | undefined {
    return this.getLatest().__unknownAttributes;
  }

  override createDOM(): HTMLElement {
    const isHeader = this.__marker.startsWith("th");
    const dom = document.createElement(isHeader ? "th" : "td");
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add("table-cell", `usfm_${this.__marker}`);
    const textAlign = toLogicalTextAlign(this.__align);
    if (textAlign) dom.style.textAlign = textAlign;
    if (this.__colspan) dom.setAttribute("colspan", this.__colspan);
    return dom;
  }

  override updateDOM(prevNode: this): boolean {
    // Recreate the DOM element when marker, align, or colspan changes.
    return (
      prevNode.__marker !== this.__marker ||
      prevNode.__align !== this.__align ||
      prevNode.__colspan !== this.__colspan
    );
  }

  override exportJSON(): SerializedImmutableTableCellNode {
    const align = this.getAlign();
    const colspan = this.getColspan();
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: IMMUTABLE_TABLE_CELL_TYPE,
      marker: this.getMarker(),
      ...(align !== undefined && { align }),
      ...(colspan !== undefined && { colspan }),
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: IMMUTABLE_TABLE_CELL_VERSION,
    };
  }

  // NOT a shadow root, unlike the table and row containers above it. Lexical requires that the
  // children of a root or shadow root be elements or decorators: `getTopLevelElement()` walks up
  // until it finds a node whose parent is a root/shadow root and then asserts the node it stopped
  // on is one of those. A cell's children are the cell's CONTENT — plain `TextNode`s — so marking
  // the cell a shadow root made that walk stop on a TextNode and throw "Children of root nodes
  // must be elements or decorators" for any caret inside a cell. That fired on every click in a
  // table (ScriptureReferencePlugin's selection listener -> `$resolvePosition` -> `$findThisChapter`),
  // and blanked the editor when a chapter navigation ran the same walk inside an `editor.update()`.
  // The table and row ARE shadow roots and still isolate selection at the table boundary; a cell
  // needs no boundary of its own, and containment within a cell is moot now that tables are
  // read-only (see `ImmutableTableNode.createDOM`).
}

export function $createImmutableTableCellNode(
  marker?: string,
  align?: string,
  colspan?: string,
  unknownAttributes?: UnknownAttributes,
): ImmutableTableCellNode {
  return $applyNodeReplacement(
    new ImmutableTableCellNode(marker, align, colspan, unknownAttributes),
  );
}

export function $isImmutableTableCellNode(
  node: LexicalNode | null | undefined,
): node is ImmutableTableCellNode {
  return node instanceof ImmutableTableCellNode;
}

export function isSerializedImmutableTableCellNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableTableCellNode {
  return node?.type === IMMUTABLE_TABLE_CELL_TYPE;
}
