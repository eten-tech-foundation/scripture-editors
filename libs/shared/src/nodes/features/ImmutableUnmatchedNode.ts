import { INVALID_CLASS_NAME } from "../usj/node-constants.js";
import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  SerializedTextNode,
  Spread,
  TextNode,
} from "lexical";

export const UNMATCHED_TAG_NAME = "unmatched";
export const IMMUTABLE_UNMATCHED_VERSION = 2;

export type SerializedImmutableUnmatchedNode = Spread<
  {
    marker: string;
  },
  SerializedTextNode
>;

/** The displayed bytes for an unmatched marker: `marker` keeps its own trailing `*` (`"nd*"`,
 * or `"*"` for a bare stray closer), so the glyph is just a backslash prefix away. */
export function unmatchedGlyphText(marker: string): string {
  return `\\${marker}`;
}

/**
 * A marker with no counterpart to pair with — an unmatched closer (`\nd*` with no open span, PT9
 * `sink.Unmatched`) or a stray `\*`. Ordinary editable TEXT, not a decorator: under Invariant I
 * the flagged bytes are document bytes that happen to re-tokenize to nothing yet, so they must
 * remain caret-addressable and must flow through a Tier-2 rebuild as bytes — which is exactly how
 * an unmatched closer RE-matches when the document later supplies its opener (the tokenizer's own
 * frame matching consumes it). The `marker` field mirrors the node's rest-state bytes the same
 * way `MarkerNode`'s does: a user edit diverges the text from the state, the divergence pends,
 * and the settle re-tokenizes the displayed bytes.
 *
 * Despite the historical name, only the DEFAULT text mode is immutable-ish: "token", which makes
 * the node atomic (caret steps over it whole, deletion removes it whole, no in-place typing) —
 * the right behavior for view modes with no marker-edit engine to settle an in-place edit
 * (visible/hidden marker modes, and collab-materialized nodes). The editable-marker adaptor
 * serializes these nodes with mode "normal" so Standard view can edit the bytes in place.
 */
export class ImmutableUnmatchedNode extends TextNode {
  __marker: string;

  constructor(marker = "", key?: NodeKey) {
    super(unmatchedGlyphText(marker), key);
    this.__marker = marker;
    // Direct assignment, not setMode: the constructor owns the instance, and the writable-node
    // machinery is not available until the node is attached to an update.
    this.__mode = 1; // "token"
  }

  static override getType(): string {
    return "unmatched";
  }

  static override clone(node: ImmutableUnmatchedNode): ImmutableUnmatchedNode {
    const { __marker, __key } = node;
    // Text, format, style, mode, and detail are copied by afterCloneFrom (TextNode), so a
    // mid-edit divergence between the bytes and __marker survives cloning.
    return new ImmutableUnmatchedNode(__marker, __key);
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      [UNMATCHED_TAG_NAME]: (node: HTMLElement) => {
        if (!isUnmatchedElement(node)) return null;

        return {
          conversion: $convertImmutableUnmatchedElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(
    serializedNode: SerializedImmutableUnmatchedNode,
  ): ImmutableUnmatchedNode {
    return $createImmutableUnmatchedNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedImmutableUnmatchedNode>,
  ): this {
    // Version-1 serializations (and the collab materializer's embed data) carry only `marker` —
    // none of the TextNode fields — so every text field defaults at runtime even though the
    // serialized type declares them required: bytes derive from the marker, and the mode
    // defaults to the constructor's atomic "token".
    const marker = serializedNode.marker ?? "";
    const self = super.updateFromJSON({
      ...serializedNode,
      detail: serializedNode.detail ?? 0,
      format: serializedNode.format ?? 0,
      mode: serializedNode.mode ?? "token",
      style: serializedNode.style ?? "",
      text: serializedNode.text ?? unmatchedGlyphText(marker),
    });
    // Assigned directly rather than via setMarker, which would rewrite the just-applied text to
    // canonical and lose a serialized mid-edit divergence.
    const writable = self.getWritable();
    writable.__marker = marker;
    return writable;
  }

  setMarker(marker: string): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    self.__text = unmatchedGlyphText(marker);
    return self;
  }

  getMarker(): string {
    const self = this.getLatest();
    return self.__marker;
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(INVALID_CLASS_NAME);
    dom.title = unmatchedTitle(this.__marker);
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement, config: EditorConfig): boolean {
    // TextNode reconciles the visible text; on element reuse createDOM does not run again, so the
    // marker-derived attribute and title are rewritten by hand — same gap MarkerNode.updateDOM
    // closes for glyphs.
    const isRecreated = super.updateDOM(prevNode, dom, config);
    if (prevNode.__marker !== this.__marker) {
      dom.setAttribute("data-marker", this.__marker);
      dom.title = unmatchedTitle(this.__marker);
    }
    return isRecreated;
  }

  override exportDOM(): DOMExportOutput {
    // The dedicated element round-trips through importDOM above, so an HTML copy of the flagged
    // bytes pastes back as the same construct.
    const element = document.createElement(UNMATCHED_TAG_NAME);
    element.setAttribute("data-marker", this.getMarker());
    element.classList.add(INVALID_CLASS_NAME);
    element.textContent = this.getTextContent();
    return { element };
  }

  override exportJSON(): SerializedImmutableUnmatchedNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      marker: this.getMarker(),
      version: IMMUTABLE_UNMATCHED_VERSION,
    };
  }

  override canInsertTextBefore(): boolean {
    // Typing at either edge belongs to the surrounding content, not to the flagged bytes — the
    // same reason a completed closer keeps appended typing outside the glyph.
    return false;
  }

  override canInsertTextAfter(): boolean {
    return false;
  }
}

/** Whether the node's rendered bytes still spell its own state's glyph — at rest, as opposed to
 * mid-edit (pend-shaped). The unmatched counterpart of `$isCanonicalMarkerNode`.
 * Read-only: call inside `editor.getEditorState().read(...)` or an update. */
export function $isCanonicalUnmatchedNode(node: ImmutableUnmatchedNode): boolean {
  return node.getTextContent() === unmatchedGlyphText(node.getMarker());
}

function unmatchedTitle(marker: string): string {
  return marker.endsWith("*")
    ? `This closing marker has no matching opening marker!`
    : `This opening marker has no matching closing marker!`;
}

function $convertImmutableUnmatchedElement(element: HTMLElement): DOMConversionOutput {
  const marker = element.getAttribute("data-marker") ?? "";
  const node = $createImmutableUnmatchedNode(marker);
  return { node };
}

export function $createImmutableUnmatchedNode(marker?: string): ImmutableUnmatchedNode {
  return $applyNodeReplacement(new ImmutableUnmatchedNode(marker));
}

function isUnmatchedElement(node: HTMLElement | null | undefined): boolean {
  return node?.tagName === UNMATCHED_TAG_NAME;
}

export function $isImmutableUnmatchedNode(
  node: LexicalNode | null | undefined,
): node is ImmutableUnmatchedNode {
  return node instanceof ImmutableUnmatchedNode;
}

export function isSerializedImmutableUnmatchedNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableUnmatchedNode {
  return node?.type === ImmutableUnmatchedNode.getType();
}
