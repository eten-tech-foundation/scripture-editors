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

export type SerializedTableCellNode = Spread<
  {
    marker: string;
    align?: string;
    colspan?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

export const TABLE_CELL_TYPE = "table:cell";
export const TABLE_CELL_VERSION = 1;
export const TABLE_CELL_DEFAULT_MARKER = "tc1";

/**
 * A `MarkerObject` for a table cell. `colspan` is specific to table cells, so it lives here rather
 * than on the shared `MarkerObject`.
 */
export type TableCellMarker = MarkerObject & { colspan?: string };

/** List of known properties of a table cell `MarkerObject` */
export const TABLE_CELL_MARKER_OBJECT_PROPS: (keyof TableCellMarker)[] = [
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

export class TableCellNode extends ElementNode {
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
    return TABLE_CELL_TYPE;
  }

  static override clone(node: TableCellNode): TableCellNode {
    const { __marker, __align, __colspan, __unknownAttributes, __key } = node;
    return new TableCellNode(__marker, __align, __colspan, __unknownAttributes, __key);
  }

  static override importJSON(serializedNode: SerializedTableCellNode): TableCellNode {
    return $createTableCellNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTableCellNode>): this {
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

  override exportJSON(): SerializedTableCellNode {
    const align = this.getAlign();
    const colspan = this.getColspan();
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: TABLE_CELL_TYPE,
      marker: this.getMarker(),
      ...(align !== undefined && { align }),
      ...(colspan !== undefined && { colspan }),
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: TABLE_CELL_VERSION,
    };
  }

  // Shadow root: keep editing and selection contained within this cell.
  override isShadowRoot(): boolean {
    return true;
  }
}

export function $createTableCellNode(
  marker?: string,
  align?: string,
  colspan?: string,
  unknownAttributes?: UnknownAttributes,
): TableCellNode {
  return $applyNodeReplacement(new TableCellNode(marker, align, colspan, unknownAttributes));
}

export function $isTableCellNode(node: LexicalNode | null | undefined): node is TableCellNode {
  return node instanceof TableCellNode;
}

export function isSerializedTableCellNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTableCellNode {
  return node?.type === TABLE_CELL_TYPE;
}
