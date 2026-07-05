/** Conforms with USJ v3.1 table rows @see https://docs.usfm.bible/usfm/3.1/para/table.html */

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

export type SerializedTableRowNode = Spread<
  { marker: string; unknownAttributes?: UnknownAttributes },
  SerializedElementNode
>;

export const TABLE_ROW_TYPE = "table:row";
export const TABLE_ROW_VERSION = 1;
export const TABLE_ROW_DEFAULT_MARKER = "tr";

/** List of known properties of `MarkerObject` */
export const TABLE_ROW_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export class TableRowNode extends ElementNode {
  __marker: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    marker = TABLE_ROW_DEFAULT_MARKER,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = marker;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return TABLE_ROW_TYPE;
  }

  static override clone(node: TableRowNode): TableRowNode {
    return new TableRowNode(node.__marker, node.__unknownAttributes, node.__key);
  }

  static override importJSON(serializedNode: SerializedTableRowNode): TableRowNode {
    return $createTableRowNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTableRowNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker ?? TABLE_ROW_DEFAULT_MARKER)
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

  setUnknownAttributes(unknownAttributes: UnknownAttributes | undefined): this {
    const self = this.getWritable();
    self.__unknownAttributes = unknownAttributes;
    return self;
  }

  getUnknownAttributes(): UnknownAttributes | undefined {
    return this.getLatest().__unknownAttributes;
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("tr");
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add("table-row", `usfm_${this.__marker}`);
    return dom;
  }

  override updateDOM(prevNode: this): boolean {
    return prevNode.__marker !== this.__marker;
  }

  override exportJSON(): SerializedTableRowNode {
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: TABLE_ROW_TYPE,
      marker: this.getMarker(),
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: TABLE_ROW_VERSION,
    };
  }

  // Shadow root: isolate cell selection so content doesn't merge across rows.
  override isShadowRoot(): boolean {
    return true;
  }
}

export function $createTableRowNode(
  marker?: string,
  unknownAttributes?: UnknownAttributes,
): TableRowNode {
  return $applyNodeReplacement(new TableRowNode(marker, unknownAttributes));
}

export function $isTableRowNode(node: LexicalNode | null | undefined): node is TableRowNode {
  return node instanceof TableRowNode;
}

export function isSerializedTableRowNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTableRowNode {
  return node?.type === TABLE_ROW_TYPE;
}
