/** Marker node used when displaying USFM */

import { closingMarkerText, openingMarkerText } from "../usj/node.utils.js";
import {
  $applyNodeReplacement,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  SerializedTextNode,
  Spread,
  TextNode,
} from "lexical";

export const MARKER_VERSION = 1;

export type MarkerSyntax = "opening" | "closing" | "selfClosing";
export type SerializedMarkerNode = Spread<
  {
    marker: string;
    markerSyntax?: MarkerSyntax;
  },
  SerializedTextNode
>;

export class MarkerNode extends TextNode {
  __marker: string;
  __markerSyntax: MarkerSyntax;

  constructor(marker = "", markerSyntax: MarkerSyntax = "opening", key?: NodeKey) {
    super(getMarkerText(marker, markerSyntax), key);
    this.__marker = marker;
    this.__markerSyntax = markerSyntax;
  }

  static override getType(): string {
    return "marker";
  }

  static override clone(node: MarkerNode): MarkerNode {
    return new MarkerNode(node.__marker, node.__markerSyntax, node.__key);
  }

  static override importJSON(serializedNode: SerializedMarkerNode): MarkerNode {
    return $createMarkerNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMarkerNode>): this {
    const { marker, markerSyntax = "opening" } = serializedNode;
    return super.updateFromJSON(serializedNode).setMarker(marker).setMarkerSyntax(markerSyntax);
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    self.__text = getMarkerText(marker, self.__markerSyntax);
    return self;
  }

  getMarker(): string {
    const self = this.getLatest();
    return self.__marker;
  }

  setMarkerSyntax(markerSyntax: MarkerSyntax): this {
    if (this.__markerSyntax === markerSyntax) return this;

    const self = this.getWritable();
    self.__markerSyntax = markerSyntax;
    self.__text = getMarkerText(self.__marker, markerSyntax);
    return self;
  }

  getMarkerSyntax(): MarkerSyntax {
    const self = this.getLatest();
    return self.__markerSyntax;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(this.__markerSyntax);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // TextNode implements updateDOM, so unlike CharNode.updateDOM this can - and must - defer to
    // super: its return value decides whether Lexical reuses the element or rebuilds it via
    // createDOM. On reuse, createDOM does not run again, so the marker-derived attribute and class
    // it set have to be rewritten here by hand. setMarker/setMarkerSyntax already reconcile the
    // visible text; without this the presentational data-marker and syntax class go stale, which is
    // the same gap CharNode.updateDOM closes for the char span.
    const isRecreated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__marker !== this.__marker) dom.setAttribute("data-marker", this.__marker);
    if (prevNode.__markerSyntax !== this.__markerSyntax) {
      dom.classList.remove(prevNode.__markerSyntax);
      dom.classList.add(this.__markerSyntax);
    }
    return isRecreated;
  }

  override exportJSON(): SerializedMarkerNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      text: this.getTextContent(),
      marker: this.getMarker(),
      markerSyntax: this.getMarkerSyntax(),
      version: MARKER_VERSION,
    };
  }
}

export function $createMarkerNode(marker?: string, markerSyntax?: MarkerSyntax): MarkerNode {
  return $applyNodeReplacement(new MarkerNode(marker, markerSyntax));
}

export function $isMarkerNode(node: LexicalNode | null | undefined): node is MarkerNode {
  return node instanceof MarkerNode;
}

export function isSerializedMarkerNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMarkerNode {
  return node?.type === MarkerNode.getType();
}

function getMarkerText(marker: string, markerSyntax: MarkerSyntax) {
  if (markerSyntax === "closing") return closingMarkerText(marker);
  if (markerSyntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(marker);
}
