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

export type SerializedImmutableTableNode = Spread<
  { unknownAttributes?: UnknownAttributes },
  SerializedElementNode
>;

/** USJ marker type this node renders; the forward adaptor matches USJ input against it. */
export const TABLE_TYPE = "table";
export const IMMUTABLE_TABLE_TYPE = "immutable-table";
export const IMMUTABLE_TABLE_VERSION = 1;

/** List of known properties of `MarkerObject` */
export const TABLE_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export class ImmutableTableNode extends ElementNode {
  __unknownAttributes?: UnknownAttributes;

  constructor(unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return IMMUTABLE_TABLE_TYPE;
  }

  static override clone(node: ImmutableTableNode): ImmutableTableNode {
    return new ImmutableTableNode(node.__unknownAttributes, node.__key);
  }

  static override importJSON(serializedNode: SerializedImmutableTableNode): ImmutableTableNode {
    return $createImmutableTableNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedImmutableTableNode>): this {
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

  override exportJSON(): SerializedImmutableTableNode {
    const unknownAttributes = this.getUnknownAttributes();
    return {
      ...super.exportJSON(),
      type: IMMUTABLE_TABLE_TYPE,
      ...(unknownAttributes !== undefined && { unknownAttributes }),
      version: IMMUTABLE_TABLE_VERSION,
    };
  }

  // Shadow root: isolate selection so content doesn't merge across the table boundary.
  override isShadowRoot(): boolean {
    return true;
  }
}

export function $createImmutableTableNode(
  unknownAttributes?: UnknownAttributes,
): ImmutableTableNode {
  return $applyNodeReplacement(new ImmutableTableNode(unknownAttributes));
}

export function $isImmutableTableNode(
  node: LexicalNode | null | undefined,
): node is ImmutableTableNode {
  return node instanceof ImmutableTableNode;
}

export function isSerializedImmutableTableNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableTableNode {
  return node?.type === IMMUTABLE_TABLE_TYPE;
}
