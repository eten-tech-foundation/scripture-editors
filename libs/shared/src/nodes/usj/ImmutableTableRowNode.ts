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

export type SerializedImmutableTableRowNode = Spread<
  { marker: string; unknownAttributes?: UnknownAttributes },
  SerializedElementNode
>;

/** USJ marker type this node renders; the forward adaptor matches USJ input against it. */
export const TABLE_ROW_TYPE = "table:row";
export const IMMUTABLE_TABLE_ROW_TYPE = "immutable-table-row";
export const IMMUTABLE_TABLE_ROW_VERSION = 1;
export const TABLE_ROW_DEFAULT_MARKER = "tr";

/** List of known properties of `MarkerObject` */
export const TABLE_ROW_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export class ImmutableTableRowNode extends ElementNode {
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
    return IMMUTABLE_TABLE_ROW_TYPE;
  }

  static override clone(node: ImmutableTableRowNode): ImmutableTableRowNode {
    return new ImmutableTableRowNode(node.__marker, node.__unknownAttributes, node.__key);
  }

  static override importJSON(
    serializedNode: SerializedImmutableTableRowNode,
  ): ImmutableTableRowNode {
    return $createImmutableTableRowNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedImmutableTableRowNode>,
  ): this {
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

  override exportJSON(): SerializedImmutableTableRowNode {
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: IMMUTABLE_TABLE_ROW_TYPE,
      marker: this.getMarker(),
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: IMMUTABLE_TABLE_ROW_VERSION,
    };
  }

  // Shadow root: isolate cell selection so content doesn't merge across rows.
  override isShadowRoot(): boolean {
    return true;
  }
}

export function $createImmutableTableRowNode(
  marker?: string,
  unknownAttributes?: UnknownAttributes,
): ImmutableTableRowNode {
  return $applyNodeReplacement(new ImmutableTableRowNode(marker, unknownAttributes));
}

export function $isImmutableTableRowNode(
  node: LexicalNode | null | undefined,
): node is ImmutableTableRowNode {
  return node instanceof ImmutableTableRowNode;
}

export function isSerializedImmutableTableRowNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableTableRowNode {
  return node?.type === IMMUTABLE_TABLE_ROW_TYPE;
}
