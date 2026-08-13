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
 * `UnknownNode` tags that render inline instead of as a subdued block container: a line-level box
 * in the middle of a sentence would be visibly wrong. These are the two corpus-proven
 * mid-paragraph constructs — both nest INSIDE a `<para>`'s running text in the corpus fixtures
 * ("optional line break (optbreak)" and "cross-reference ref target"), and
 * `packages/utilities/src/converters/usj/converter-test.data.ts:2571,2581` shows both becoming
 * `UnknownNode`s (tags "optbreak" and "ref"):
 *
 * - `\optbreak` — PT9 renders it as a literal `//` token mid-sentence; `createUnknown`
 *   (usj-editor.adaptor.ts) renders that token as the node's own display child in editable
 *   mode, via `unknownDisplayParts` (unknownUsfm.utils.ts).
 * - `\ref` — a cross-reference target with real child text that must display inline; it carries
 *   no USFM bytes of its own, so it gets no display children at all.
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

  /**
   * Whether this unknown renders inline (optbreak, ref) rather than as a block box (figure,
   * sidebar, periph, ...). Inline unknowns sit within paragraph prose and carry SIGNIFICANT
   * surrounding whitespace — the spaces Paratext 9 preserves byte-for-byte around `//` — so
   * callers must not add or strip spaces next to them.
   */
  isInlineTag(): boolean {
    return INLINE_UNKNOWN_TAGS.has(this.getTag());
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
    // data-tag records the UnknownNode's USJ type so importDOM's $convertUnknownElement can read it
    // back on a DOM round-trip. The inline-vs-block CSS treatment is driven by the class chosen from
    // INLINE_UNKNOWN_TAGS below, not by data-tag; optbreak's `//` token renders as a real child text
    // node (see createUnknown in usj-editor.adaptor.ts), not a CSS-generated label.
    dom.setAttribute("data-tag", this.getTag());
    dom.setAttribute("data-marker", this.getMarker() ?? "");
    dom.classList.add(this.isInlineTag() ? "unknown-inline" : "unknown-block");
    // Read-only whole-block: no inline display:none here (that hid the content in every view).
    // Visibility is CSS-mode-gated in usj-nodes.css (hidden by default, revealed as a subdued
    // block/token in standard view's .marker-editable scope). contentEditable=false stops the
    // browser from placing a native caret inside it, so caret navigation skips over the whole
    // node like any decorator node.
    dom.contentEditable = "false";
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    // On a key-reused node whose tag/marker changed, sync the attributes and the inline-vs-block
    // class in place so createDOM's discriminators (data-tag/data-marker, unknown-inline vs
    // unknown-block) don't go stale. tag drives both data-tag and the class; marker drives
    // data-marker (empty string when absent, mirroring createDOM).
    if (prevNode.__tag !== this.__tag) {
      dom.setAttribute("data-tag", this.__tag);
      const inline = this.isInlineTag();
      dom.classList.toggle("unknown-inline", inline);
      dom.classList.toggle("unknown-block", !inline);
    }
    if ((prevNode.__marker ?? "") !== (this.__marker ?? ""))
      dom.setAttribute("data-marker", this.__marker ?? "");
    // Returning false keeps the existing DOM element (updated in place, never recreated — this
    // preserves contentEditable=false and the caret-skip behavior).
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

  // Narrowed from an unconditional `return destination !== "clone"` to leave "optbreak" out of
  // the exclusion. @lexical/clipboard's own copy-out machinery (`$appendNodesToJSON` for the
  // `application/x-lexical-editor` flavor, `$appendNodesToHTML` for `text/html`) both pass the
  // literal string `'html'` as `destination` for EVERY copy-out format, not only actual HTML
  // generation — `'clone'` is never passed by any Lexical-shipped code path in the installed
  // version (confirmed by reading `LexicalClipboard.dev.js`/`LexicalHtml.dev.js`), so the old,
  // unconditional form excluded every `UnknownNode` from BOTH flavors unconditionally. Excluding a
  // node does not drop it silently: `$appendNodesToJSON` hoists the excluded node's own children
  // into its parent's list in its place. For an optbreak, whose only child is the `//`
  // `ImmutableTypedTextNode` display token (a content-free DecoratorNode with no meaning once
  // separated from its owning `UnknownNode`), that stranded a loose decorator on the
  // same-namespace `application/x-lexical-editor` paste fast path — `$parseSerializedNode`
  // reconstructed the bare decorator, not a recognized optbreak, so the paste silently lost the
  // discretionary line break (live report: copying an optbreak worked, pasting the same clipboard
  // back did not restore it). Kept excluded for every OTHER kind (figure, table, sidebar, periph,
  // ref): those either carry real, independently-legible child content (`ref`) or are block-level
  // constructs whose copy-out behavior is untouched by this task and not verified here.
  override excludeFromCopy(destination: "clone" | "html"): boolean {
    return this.getTag() === "optbreak" ? false : destination !== "clone";
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
