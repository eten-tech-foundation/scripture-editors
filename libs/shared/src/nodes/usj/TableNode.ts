/** Conforms with USJ v3.1 tables @see https://docs.usfm.bible/usfm/3.1/para/table.html */

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

export type SerializedTableNode = Spread<
  { unknownAttributes?: UnknownAttributes },
  SerializedElementNode
>;

export const TABLE_TYPE = "table";
export const TABLE_VERSION = 1;

/** List of known properties of `MarkerObject` */
export const TABLE_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export class TableNode extends ElementNode {
  __unknownAttributes?: UnknownAttributes;

  constructor(unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return TABLE_TYPE;
  }

  static override clone(node: TableNode): TableNode {
    return new TableNode(node.__unknownAttributes, node.__key);
  }

  static override importJSON(serializedNode: SerializedTableNode): TableNode {
    return $createTableNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedTableNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setUnknownAttributes(serializedNode.unknownAttributes);
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
    const dom = document.createElement("table");
    dom.classList.add("table");
    return dom;
  }

  override updateDOM(): boolean {
    return false;
  }

  override exportJSON(): SerializedTableNode {
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: TABLE_TYPE,
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: TABLE_VERSION,
    };
  }

  // Shadow root: isolate selection so content doesn't merge across the table boundary.
  override isShadowRoot(): boolean {
    return true;
  }
}

export function $createTableNode(unknownAttributes?: UnknownAttributes): TableNode {
  return $applyNodeReplacement(new TableNode(unknownAttributes));
}

export function $isTableNode(node: LexicalNode | null | undefined): node is TableNode {
  return node instanceof TableNode;
}

export function isSerializedTableNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTableNode {
  return node?.type === TABLE_TYPE;
}
