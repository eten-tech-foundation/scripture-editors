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
    /**
     * Whether this glyph belongs to a char span nested inside another char span. A nested span's
     * marker text carries the `+` prefix (`\+w …\+w*`) — ParatextData's writer rule and PT9's
     * on-screen display for USFM ≤3.0. Stored (not derived live from the tree) so the visible
     * glyph text and the node's structural role stay in agreement at rest; every path that changes
     * a span's nesting (Tier-2 rebuild, collab materialize) rebuilds the glyph through the adaptor.
     */
    nested?: boolean;
  },
  SerializedTextNode
>;

export class MarkerNode extends TextNode {
  __marker: string;
  __markerSyntax: MarkerSyntax;
  __nested: boolean;

  constructor(marker = "", markerSyntax: MarkerSyntax = "opening", nested = false, key?: NodeKey) {
    super(getMarkerText(marker, markerSyntax, nested), key);
    this.__marker = marker;
    this.__markerSyntax = markerSyntax;
    this.__nested = nested;
  }

  static override getType(): string {
    return "marker";
  }

  static override clone(node: MarkerNode): MarkerNode {
    return new MarkerNode(node.__marker, node.__markerSyntax, node.__nested, node.__key);
  }

  static override importJSON(serializedNode: SerializedMarkerNode): MarkerNode {
    return $createMarkerNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedMarkerNode>): this {
    const { marker, markerSyntax = "opening", nested = false } = serializedNode;
    return super
      .updateFromJSON(serializedNode)
      .setNested(nested)
      .setMarker(marker)
      .setMarkerSyntax(markerSyntax);
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    self.__text = getMarkerText(marker, self.__markerSyntax, self.__nested);
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
    self.__text = getMarkerText(self.__marker, markerSyntax, self.__nested);
    return self;
  }

  getMarkerSyntax(): MarkerSyntax {
    const self = this.getLatest();
    return self.__markerSyntax;
  }

  setNested(nested: boolean): this {
    if (this.__nested === nested) return this;

    const self = this.getWritable();
    self.__nested = nested;
    self.__text = getMarkerText(self.__marker, self.__markerSyntax, nested);
    return self;
  }

  getNested(): boolean {
    const self = this.getLatest();
    return self.__nested;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(this.__markerSyntax);
    return dom;
  }

  override exportJSON(): SerializedMarkerNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      text: this.getTextContent(),
      marker: this.getMarker(),
      markerSyntax: this.getMarkerSyntax(),
      // Only serialize the flag for genuinely nested glyphs; absence means non-nested, so
      // existing states (and the overwhelmingly common non-nested markers) stay unchanged.
      ...(this.getNested() ? { nested: true } : {}),
      version: MARKER_VERSION,
    };
  }
}

export function $createMarkerNode(
  marker?: string,
  markerSyntax?: MarkerSyntax,
  nested?: boolean,
): MarkerNode {
  return $applyNodeReplacement(new MarkerNode(marker, markerSyntax, nested));
}

export function $isMarkerNode(node: LexicalNode | null | undefined): node is MarkerNode {
  return node instanceof MarkerNode;
}

export function isSerializedMarkerNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedMarkerNode {
  return node?.type === MarkerNode.getType();
}

function getMarkerText(marker: string, markerSyntax: MarkerSyntax, nested = false) {
  // The self-closing form is a milestone terminator (`\*`); milestones never nest inside a char
  // span, so the `+` prefix does not apply to it.
  if (markerSyntax === "closing") return closingMarkerText(marker, nested);
  if (markerSyntax === "selfClosing") return closingMarkerText("");
  return openingMarkerText(marker, nested);
}
