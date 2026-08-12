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

export class ImmutableTypedTextNode extends DecoratorNode<null> {
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
    // The glyph bytes are written into the element itself, NOT rendered through the decorator
    // portal — see `decorate` for why. The resulting DOM is identical either way (React rendered
    // the same string as this element's only text child), so nothing downstream changes shape.
    dom.textContent = this.__text;
    return dom;
  }

  override updateDOM(prevNode: this, dom: HTMLElement): boolean {
    // Keep the rendered bytes in step with an in-place `setTextContent` (the JSON update path is
    // its only caller); the guard means an untouched node writes nothing. `__textType` is
    // deliberately NOT re-applied here — it is only ever set while building a node from JSON,
    // before this element exists, so the class list has never been able to go stale, and
    // re-deriving it would be a behavior change this fix does not need.
    if (prevNode.__text !== this.__text) dom.textContent = this.__text;
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

  /**
   * No decorator payload: the glyph bytes are rendered by {@link createDOM} instead.
   *
   * This node used to return its text here, so `@lexical/react`'s `useDecorators` painted the
   * bytes into this element through a React portal. That is unsound for a value with STABLE
   * IDENTITY. Lexical only notifies its decorator listener when the decorator value actually
   * changes — `reconcileDecorator` bails on `currentDecorators[key] === decorator` — and two equal
   * strings always compare equal. So whenever Lexical DESTROYS and RE-CREATES this node's element
   * while the node itself survives (`$createNode` runs for every child of a freshly created parent,
   * which is exactly what re-parenting a node does), the map never changed, no listener fired,
   * `useDecorators` never rebuilt its portal list, and the portal stayed pointed at the OLD,
   * detached element. The new element was left permanently EMPTY — the glyph vanished from the
   * screen while the node, the USJ, and the file on disk all still carried it, and only remounting
   * the editor brought it back.
   *
   * The marker-edit engine re-parents preserved nodes on every Tier-2 paragraph rebuild
   * (`$replaceSentinels`, tier2Rebuild.utils.ts, moves each preserved node into the rebuilt
   * paragraph), so an `\optbreak`'s `//` token — a child of the preserved `UnknownNode` — blanked
   * out the first time anything else in its paragraph settled. Rendering from `createDOM` removes
   * the portal indirection entirely: the bytes travel with the element that carries them, so any
   * number of re-parents keeps them, and there is one less React portal per glyph.
   */
  override decorate(): null {
    return null;
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
