import { INVALID_CLASS_NAME, ZWSP } from "../usj/node-constants";
import {
  $applyNodeReplacement,
  DecoratorNode,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  isHTMLElement,
  LexicalEditor,
  LexicalNode,
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

export class ImmutableUnmatchedNode extends DecoratorNode<void> {
  __marker: string;

  constructor(marker: string, key?: NodeKey) {
    super(key);
    this.__marker = marker;
  }

  static getType(): string {
    return "unmatched";
  }

  static clone(node: ImmutableUnmatchedNode): ImmutableUnmatchedNode {
    const { __marker, __key } = node;
    return new ImmutableUnmatchedNode(__marker, __key);
  }

  static importJSON(serializedNode: SerializedImmutableUnmatchedNode): ImmutableUnmatchedNode {
    const { marker } = serializedNode;
    const node = $createImmutableUnmatchedNode(marker);
    return node;
  }

  static importDOM(): DOMConversionMap | null {
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

  createDOM(): HTMLElement {
    const dom = document.createElement(UNMATCHED_TAG_NAME);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(INVALID_CLASS_NAME);
    const isClosing = this.__marker.endsWith("*");
    dom.title = isClosing
      ? `This closing marker has no matching opening marker!`
      : `This opening marker has no matching closing marker!`;
    return dom;
  }

  updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.setAttribute("data-marker", this.getMarker());
      element.classList.add(INVALID_CLASS_NAME);
    }

    return { element };
  }

  decorate(): string {
    return `\\${this.getMarker()}${ZWSP}`;
  }

  exportJSON(): SerializedImmutableUnmatchedNode {
    return {
      type: this.getType(),
      marker: this.getMarker(),
      version: IMMUTABLE_UNMATCHED_VERSION,
    };
  }

  // Mutation

  isKeyboardSelectable(): false {
    return false;
  }
}

function $convertImmutableUnmatchedElement(element: HTMLElement): DOMConversionOutput {
  const marker = element.getAttribute("data-marker") ?? "";
  const node = $createImmutableUnmatchedNode(marker);
  return { node };
}

export function $createImmutableUnmatchedNode(marker: string): ImmutableUnmatchedNode {
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
