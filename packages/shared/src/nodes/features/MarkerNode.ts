/** Marker node used when displaying USFM */

import { closingMarkerText, openingMarkerText } from "../usj/node.utils";
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  SerializedTextNode,
  Spread,
  TextNode,
} from "lexical";

export const MARKER_VERSION = 1;

export type SerializedMarkerNode = Spread<
  {
    marker: string;
    isOpening?: boolean;
  },
  SerializedTextNode
>;

export class MarkerNode extends TextNode {
  __marker: string;
  __isOpening: boolean;

  constructor(marker: string, isOpening = true, key?: NodeKey) {
    const text = isOpening ? openingMarkerText(marker) : closingMarkerText(marker);
    super(text, key);
    this.__marker = marker;
    this.__isOpening = isOpening;
  }

  static getType(): string {
    return "marker";
  }

  static clone(node: MarkerNode): MarkerNode {
    return new MarkerNode(node.__marker, node.__isOpening, node.__key);
  }

  static importJSON(serializedNode: SerializedMarkerNode): MarkerNode {
    const { marker, isOpening } = serializedNode;
    return $createMarkerNode(marker, isOpening).updateFromJSON(serializedNode);
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

  setIsOpening(isOpening: boolean): this {
    if (this.__isOpening === isOpening) return this;

    const self = this.getWritable();
    self.__isOpening = isOpening;
    return self;
  }

  getIsOpening(): boolean {
    const self = this.getLatest();
    return self.__isOpening;
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(this.__type, this.__isOpening ? "opening" : "closing");
    return dom;
  }

  exportJSON(): SerializedMarkerNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      text: this.getTextContent(),
      marker: this.getMarker(),
      isOpening: this.getIsOpening(),
      version: MARKER_VERSION,
    };
  }
}

export function $createMarkerNode(marker: string, isOpening?: boolean): MarkerNode {
  return $applyNodeReplacement(new MarkerNode(marker, isOpening));
}

export function $isMarkerNode(node: LexicalNode | null | undefined): node is MarkerNode {
  return node instanceof MarkerNode;
}

export function isSerializedMarkerNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMarkerNode {
  return node?.type === MarkerNode.getType();
}
