import { UnknownAttributes } from "../usj/node-constants.js";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  ElementNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export type SerializedUnknownNode = Spread<
  {
    tag: string;
    marker?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

/** List of known properties of `MarkerObject` */
export const UNKNOWN_MARKER_OBJECT_PROPS: (keyof MarkerObject)[] = ["type", "marker", "content"];

export const UNKNOWN_TAG_NAME = "unknown";
export const UNKNOWN_VERSION = 1;

/**
 * `UnknownNode` tags that render inline instead of as a subdued block container (design spec
 * §7: "a line-level box in the middle of a sentence would be visibly wrong"). These are the two
 * corpus-proven mid-paragraph constructs — both nest INSIDE a `<para>`'s running text in the
 * Phase 0 corpus fixtures ("optional line break (optbreak)" and "cross-reference ref target"),
 * and `packages/utilities/src/converters/usj/converter-test.data.ts:2571,2581` shows both
 * becoming `UnknownNode`s (tags "optbreak" and "ref"):
 *
 * - `\optbreak` — PT9 renders it as a literal `//` token mid-sentence; it has no children, so
 *   the CSS supplies the `//` label (keyed off `data-tag="optbreak"`).
 * - `\ref` — a cross-reference target with real child text that must display inline; it gets
 *   NO label (the optbreak label selector cannot match it).
 *
 * Everything else (table/figure/sidebar/periph/...) stays block-level.
 */
const INLINE_UNKNOWN_TAGS = new Set(["optbreak", "ref"]);

export class UnknownNode extends ElementNode {
  __tag: string;
  __marker?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(tag = "", marker?: string, unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__tag = tag;
    this.__marker = marker;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "unknown";
  }

  static override clone(node: UnknownNode): UnknownNode {
    const { __tag, __marker, __unknownAttributes, __key } = node;
    return new UnknownNode(__tag, __marker, __unknownAttributes, __key);
  }

  static override importDOM(): DOMConversionMap | null {
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

  static override importJSON(serializedNode: SerializedUnknownNode): UnknownNode {
    return $createUnknownNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedUnknownNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setTag(serializedNode.tag)
      .setMarker(serializedNode.marker)
      .setUnknownAttributes(serializedNode.unknownAttributes);
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

  setMarker(marker: string | undefined): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): string | undefined {
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

  override createDOM(): HTMLElement {
    const dom = document.createElement(UNKNOWN_TAG_NAME);
    // data-tag doubles as the CSS discriminator for construct-specific treatment (the
    // optbreak-only `//` label keys off [data-tag="optbreak"]) and mirrors what importDOM's
    // $convertUnknownElement reads back.
    dom.setAttribute("data-tag", this.getTag());
    dom.setAttribute("data-marker", this.getMarker() ?? "");
    dom.classList.add(INLINE_UNKNOWN_TAGS.has(this.getTag()) ? "unknown-inline" : "unknown-block");
    // Read-only whole-block: no inline display:none here (that hid the content in every view).
    // Visibility is CSS-mode-gated in usj-nodes.css (hidden by default, revealed as a subdued
    // block/token in standard view's .marker-editable scope). contentEditable=false stops the
    // browser from placing a native caret inside it, so caret navigation skips over the whole
    // node like any decorator node (design spec §7).
    dom.contentEditable = "false";
    return dom;
  }

  override updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its DOM element replacing with a
    // new copy from createDOM.
    return false;
  }

  override exportDOM(): DOMExportOutput {
    return { element: null };
  }

  override exportJSON(): SerializedUnknownNode {
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

  override canBeEmpty(): true {
    return true;
  }

  override isInline(): true {
    return true;
  }

  override extractWithChild(): false {
    return false;
  }

  override excludeFromCopy(destination: "clone" | "html"): boolean {
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
  tag?: string,
  marker?: string,
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
