import { INVALID_CLASS_NAME, ZWSP } from "../usj/node-constants.js";
import {
  $applyNodeReplacement,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  isHTMLElement,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical";

export const UNMATCHED_TAG_NAME = "unmatched";
export const IMMUTABLE_UNMATCHED_VERSION = 1;

export type SerializedImmutableUnmatchedNode = Spread<
  {
    marker: string;
  },
  SerializedLexicalNode
>;

export class ImmutableUnmatchedNode extends DecoratorNode<null> {
  __marker: string;

  constructor(marker = "", key?: NodeKey) {
    super(key);
    this.__marker = marker;
  }

  static override getType(): string {
    return "unmatched";
  }

  static override clone(node: ImmutableUnmatchedNode): ImmutableUnmatchedNode {
    const { __marker, __key } = node;
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
    return super.updateFromJSON(serializedNode).setMarker(serializedNode.marker);
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

  override createDOM(): HTMLElement {
    const dom = document.createElement(UNMATCHED_TAG_NAME);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(INVALID_CLASS_NAME);
    const isClosing = this.__marker.endsWith("*");
    dom.title = isClosing
      ? `This closing marker has no matching opening marker!`
      : `This opening marker has no matching closing marker!`;
    // The flagged marker's bytes are written into the element itself, NOT rendered through the
    // decorator portal — see `decorate` for why.
    dom.textContent = `\\${this.__marker}${ZWSP}`;
    return dom;
  }

  override updateDOM(prevNode: this): boolean {
    // A marker change rewrites data-marker, the title, and the rendered bytes together, so let
    // Lexical rebuild the element from createDOM rather than patching three things by hand.
    // (`setMarker` only ever runs while building a node from JSON, before this element exists, so
    // in practice this is always the false branch.) Returning false tells Lexical that this node
    // does not need its DOM element replacing with a new copy from createDOM.
    return prevNode.__marker !== this.__marker;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.setAttribute("data-marker", this.getMarker());
      element.classList.add(INVALID_CLASS_NAME);
    }

    return { element };
  }

  /**
   * No decorator payload: the flagged bytes are rendered by {@link createDOM} instead. Same
   * unsound-stable-identity reason as `ImmutableTypedTextNode.decorate` (whose doc comment carries
   * the full account) — Lexical's `reconcileDecorator` skips notifying its listener when the
   * decorator value is unchanged, so re-creating this node's element while the node survives left
   * `useDecorators`' React portal painting into the old, detached element and the live one empty.
   *
   * Reachable for exactly the same reason too: an unmatched marker is a preserved Tier-2 sentinel
   * (`$appendNodesFragment`'s catch-all, tier2Rebuild.utils.ts), so `$replaceSentinels` re-parents
   * it into the rebuilt paragraph and its `\marker` glyph blanked out the moment anything else in
   * that paragraph settled.
   */
  override decorate(): null {
    return null;
  }

  override exportJSON(): SerializedImmutableUnmatchedNode {
    return {
      type: this.getType(),
      marker: this.getMarker(),
      version: IMMUTABLE_UNMATCHED_VERSION,
    };
  }

  // Mutation

  override isKeyboardSelectable(): false {
    return false;
  }
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
