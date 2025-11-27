/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/cv/c.html */

import {
  $applyNodeReplacement,
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  DecoratorNode,
  LexicalEditor,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedLexicalNode,
  Spread,
  isHTMLElement,
} from "lexical";
import { CHAPTER_CLASS_NAME, UnknownAttributes } from "./node-constants.js";
import { getVisibleOpenMarkerText } from "./node.utils.js";

export const IMMUTABLE_CHAPTER_VERSION = 1;

const CHAPTER_MARKER = "c";
const IMMUTABLE_CHAPTER_TAG_NAME = "span";

type ChapterMarker = typeof CHAPTER_MARKER;

export type SerializedImmutableChapterNode = Spread<
  {
    marker: ChapterMarker;
    number: string;
    showMarker?: boolean;
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedLexicalNode
>;

export class ImmutableChapterNode extends DecoratorNode<string> {
  __marker: ChapterMarker;
  __number: string;
  __showMarker?: boolean;
  __sid?: string;
  __altnumber?: string;
  __pubnumber?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    chapterNumber = "",
    showMarker = false,
    sid?: string,
    altnumber?: string,
    pubnumber?: string,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = CHAPTER_MARKER;
    this.__number = chapterNumber;
    this.__showMarker = showMarker;
    this.__sid = sid;
    this.__altnumber = altnumber;
    this.__pubnumber = pubnumber;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "immutable-chapter";
  }

  static override clone(node: ImmutableChapterNode): ImmutableChapterNode {
    const { __number, __showMarker, __sid, __altnumber, __pubnumber, __unknownAttributes, __key } =
      node;
    return new ImmutableChapterNode(
      __number,
      __showMarker,
      __sid,
      __altnumber,
      __pubnumber,
      __unknownAttributes,
      __key,
    );
  }

  static override importDOM(): DOMConversionMap | null {
    return {
      span: (node: HTMLElement) => {
        if (!isImmutableChapterElement(node)) return null;

        return {
          conversion: $convertImmutableChapterElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(serializedNode: SerializedImmutableChapterNode): ImmutableChapterNode {
    return $createImmutableChapterNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedImmutableChapterNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker)
      .setNumber(serializedNode.number)
      .setShowMarker(serializedNode.showMarker)
      .setSid(serializedNode.sid)
      .setAltnumber(serializedNode.altnumber)
      .setPubnumber(serializedNode.pubnumber)
      .setUnknownAttributes(serializedNode.unknownAttributes);
  }

  setMarker(marker: ChapterMarker): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): ChapterMarker {
    const self = this.getLatest();
    return self.__marker;
  }

  setNumber(chapterNumber: string): this {
    if (this.__number === chapterNumber) return this;

    const self = this.getWritable();
    self.__number = chapterNumber;
    return self;
  }

  getNumber(): string {
    const self = this.getLatest();
    return self.__number;
  }

  setShowMarker(showMarker = false): this {
    if (this.__showMarker === showMarker) return this;

    const self = this.getWritable();
    self.__showMarker = showMarker;
    return self;
  }

  getShowMarker(): boolean | undefined {
    const self = this.getLatest();
    return self.__showMarker;
  }

  setSid(sid: string | undefined): this {
    if (this.__sid === sid) return this;

    const self = this.getWritable();
    self.__sid = sid;
    return self;
  }

  getSid(): string | undefined {
    const self = this.getLatest();
    return self.__sid;
  }

  setAltnumber(altnumber: string | undefined): this {
    if (this.__altnumber === altnumber) return this;

    const self = this.getWritable();
    self.__altnumber = altnumber;
    return self;
  }

  getAltnumber(): string | undefined {
    const self = this.getLatest();
    return self.__altnumber;
  }

  setPubnumber(pubnumber: string | undefined): this {
    if (this.__pubnumber === pubnumber) return this;

    const self = this.getWritable();
    self.__pubnumber = pubnumber;
    return self;
  }

  getPubnumber(): string | undefined {
    const self = this.getLatest();
    return self.__pubnumber;
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
    const dom = document.createElement(IMMUTABLE_CHAPTER_TAG_NAME);
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(CHAPTER_CLASS_NAME, `usfm_${this.__marker}`);
    if (this.__showMarker) dom.classList.add("marker");
    dom.setAttribute("data-number", this.__number);
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
      element.setAttribute("data-marker", this.getMarker());
      element.classList.add(CHAPTER_CLASS_NAME, `usfm_${this.getMarker()}`);
      element.setAttribute("data-number", this.getNumber());
    }

    return { element };
  }

  override decorate(): string {
    return this.getShowMarker()
      ? getVisibleOpenMarkerText(this.getMarker(), this.getNumber())
      : this.getNumber();
  }

  override exportJSON(): SerializedImmutableChapterNode {
    return {
      type: this.getType(),
      marker: this.getMarker(),
      number: this.getNumber(),
      showMarker: this.getShowMarker(),
      sid: this.getSid(),
      altnumber: this.getAltnumber(),
      pubnumber: this.getPubnumber(),
      unknownAttributes: this.getUnknownAttributes(),
      version: IMMUTABLE_CHAPTER_VERSION,
    };
  }

  // Mutation

  override isInline(): false {
    return false;
  }

  override isKeyboardSelectable(): false {
    return false;
  }
}

function $convertImmutableChapterElement(element: HTMLElement): DOMConversionOutput {
  const chapterNumber = element.getAttribute("data-number") ?? "0";
  const node = $createImmutableChapterNode(chapterNumber);
  return { node };
}

export function $createImmutableChapterNode(
  chapterNumber?: string,
  showMarker?: boolean,
  sid?: string,
  altnumber?: string,
  pubnumber?: string,
  unknownAttributes?: UnknownAttributes,
): ImmutableChapterNode {
  return $applyNodeReplacement(
    new ImmutableChapterNode(
      chapterNumber,
      showMarker,
      sid,
      altnumber,
      pubnumber,
      unknownAttributes,
    ),
  );
}

export function isImmutableChapterElement(element: HTMLElement | null | undefined): boolean {
  if (!element) return false;

  return (
    element.classList.contains(CHAPTER_CLASS_NAME) &&
    element.tagName.toLowerCase() === IMMUTABLE_CHAPTER_TAG_NAME
  );
}

export function $isImmutableChapterNode(
  node: LexicalNode | null | undefined,
): node is ImmutableChapterNode {
  return node instanceof ImmutableChapterNode;
}

export function isSerializedImmutableChapterNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableChapterNode {
  return node?.type === ImmutableChapterNode.getType();
}
