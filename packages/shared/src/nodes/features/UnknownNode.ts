import { UnknownAttributes } from "../usj/node-constants";
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  ElementNode,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export type SerializedUnknownNode = Spread<
  {
    tag: string;
    marker: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

export const UNKNOWN_TAG_NAME = "unknown";
export const UNKNOWN_VERSION = 1;

export class UnknownNode extends ElementNode {
  __tag: string;
  __marker: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(tag: string, marker: string, unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__tag = tag;
    this.__marker = marker;
    this.__unknownAttributes = unknownAttributes;
  }

  static getType(): string {
    return "unknown";
  }

  static clone(node: UnknownNode): UnknownNode {
    const { __tag, __marker, __unknownAttributes, __key } = node;
    return new UnknownNode(__tag, __marker, __unknownAttributes, __key);
  }

  static importJSON(serializedNode: SerializedUnknownNode): UnknownNode {
    const { tag, marker, unknownAttributes } = serializedNode;
    return $createUnknownNode(tag, marker, unknownAttributes).updateFromJSON(serializedNode);
  }

  static importDOM(): DOMConversionMap | null {
    return {
      [UNKNOWN_TAG_NAME]: (node: HTMLElement) => {
        if (!isUnknownElement(node)) return null;

        return {
          conversion: $convertUnknownElement,
          priority: 1,
        };
      },
    };
  }

  setTag(tag: string): this {
    if (this.__tag === tag) return this;

    const self = this.getWritable();
    self.__tag = tag;
    return self;
  }

  getTag(): string {
    const self = this.getLatest();
    return self.__tag;
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): string {
    const self = this.getLatest();
    return self.__marker;
  }

  setUnknownAttributes(unknownAttributes: UnknownAttributes | undefined): this {
    const self = this.getWritable();
    self.__unknownAttributes = unknownAttributes;
    return self;
  }

  getUnknownAttributes(): UnknownAttributes | undefined {
    const self = this.getLatest();
    return self.__unknownAttributes;
  }

  createDOM(): HTMLElement {
    const dom = document.createElement(UNKNOWN_TAG_NAME);
    dom.style.display = "none";
    return dom;
  }

  updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its DOM element replacing with a
    // new copy from createDOM.
    return false;
  }

  exportDOM(): DOMExportOutput {
    return { element: null };
  }

  exportJSON(): SerializedUnknownNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      tag: this.getTag(),
      marker: this.getMarker(),
      unknownAttributes: this.getUnknownAttributes(),
      version: UNKNOWN_VERSION,
    };
  }

  // Mutation

  canBeEmpty(): true {
    return true;
  }

  isInline(): true {
    return true;
  }

  extractWithChild(): false {
    return false;
  }

  excludeFromCopy(destination: "clone" | "html"): boolean {
    return destination !== "clone";
  }
}

function $convertUnknownElement(element: HTMLElement): DOMConversionOutput {
  const tag = element.getAttribute("data-tag") ?? "";
  const marker = element.getAttribute("data-marker") ?? "";
  const node = $createUnknownNode(tag, marker);
  return { node };
}

export function $createUnknownNode(
  tag: string,
  marker: string,
  unknownAttributes?: UnknownAttributes,
): UnknownNode {
  return $applyNodeReplacement(new UnknownNode(tag, marker, unknownAttributes));
}

function isUnknownElement(node: HTMLElement | null | undefined): boolean {
  return node?.tagName === UNKNOWN_TAG_NAME;
}

export function $isUnknownNode(node: LexicalNode | null | undefined): node is UnknownNode {
  return node instanceof UnknownNode;
}

export function isSerializedUnknownNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedUnknownNode {
  return node?.type === UnknownNode.getType();
}
