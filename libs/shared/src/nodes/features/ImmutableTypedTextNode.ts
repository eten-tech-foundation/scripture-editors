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

export type SerializedImmutableTypedTextNode = Spread<
  {
    textType: string;
    text: string;
  },
  SerializedLexicalNode
>;

export const IMMUTABLE_TYPED_TEXT_VERSION = 1;

export class ImmutableTypedTextNode extends DecoratorNode<string> {
  __textType: string;
  __text: string;

  constructor(textType = "", text = "", key?: NodeKey) {
    super(key);
    this.__textType = textType;
    this.__text = text;
  }

  static override getType(): string {
    return "immutable-typed-text";
  }

  static override clone(node: ImmutableTypedTextNode): ImmutableTypedTextNode {
    const { __textType, __text, __key } = node;
    return new ImmutableTypedTextNode(__textType, __text, __key);
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!isTypedTextElement(node)) return null;

        return {
          conversion: $convertImmutableTypedTextElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(
    serializedNode: SerializedImmutableTypedTextNode,
  ): ImmutableTypedTextNode {
    return $createImmutableTypedTextNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(
    serializedNode: LexicalUpdateJSON<SerializedImmutableTypedTextNode>,
  ): this {
    return super
      .updateFromJSON(serializedNode)
      .setTextType(serializedNode.textType)
      .setTextContent(serializedNode.text);
  }

  setTextType(textType: string): this {
    if (this.__textType === textType) return this;

    const self = this.getWritable();
    self.__textType = textType;
    return self;
  }

  getTextType(): string {
    const self = this.getLatest();
    return self.__textType;
  }

  setTextContent(text: string): this {
    if (this.__text === text) return this;

    const self = this.getWritable();
    self.__text = text;
    return self;
  }

  override getTextContent(): string {
    const self = this.getLatest();
    return self.__text;
  }

  override createDOM(): HTMLElement {
    const dom = document.createElement("span");
    dom.setAttribute("data-text-type", this.__textType);
    dom.classList.add(this.__textType);
    return dom;
  }

  override updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  override exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element && isHTMLElement(element)) {
      element.setAttribute("data-text-type", this.getTextType());
    }

    return { element };
  }

  override decorate(): string {
    return this.getTextContent();
  }

  override exportJSON(): SerializedImmutableTypedTextNode {
    return {
      type: this.getType(),
      textType: this.getTextType(),
      text: this.getTextContent(),
      version: IMMUTABLE_TYPED_TEXT_VERSION,
    };
  }

  // Mutation

  override isKeyboardSelectable(): false {
    return false;
  }
}

function $convertImmutableTypedTextElement(element: HTMLElement): DOMConversionOutput {
  const textType = element.getAttribute("data-text-type") ?? "";
  const text = element.textContent ?? "";
  const node = $createImmutableTypedTextNode(textType, text);
  return { node };
}

export function $createImmutableTypedTextNode(
  textType?: string,
  text?: string,
): ImmutableTypedTextNode {
  return $applyNodeReplacement(new ImmutableTypedTextNode(textType, text));
}

function isTypedTextElement(node: HTMLElement | null | undefined): boolean {
  return node?.tagName === "span";
}

export function $isImmutableTypedTextNode(
  node: LexicalNode | null | undefined,
): node is ImmutableTypedTextNode {
  return node instanceof ImmutableTypedTextNode;
}

export function isSerializedImmutableTypedTextNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableTypedTextNode {
  return node?.type === ImmutableTypedTextNode.getType();
}
