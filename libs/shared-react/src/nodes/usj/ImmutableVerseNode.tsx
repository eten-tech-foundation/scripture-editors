/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/cv/v.html */

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
import { ReactElement } from "react";
import { getVisibleOpenMarkerText, UnknownAttributes, VERSE_CLASS_NAME, ZWSP } from "shared";

export const VERSE_MARKER = "v";
export const IMMUTABLE_VERSE_VERSION = 1;

type VerseMarker = typeof VERSE_MARKER;

export type SerializedImmutableVerseNode = Spread<
  {
    marker: VerseMarker;
    number: string;
    showMarker?: boolean;
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedLexicalNode
>;

export class ImmutableVerseNode extends DecoratorNode<ReactElement> {
  __marker: VerseMarker;
  __number: string;
  __showMarker?: boolean;
  __sid?: string;
  __altnumber?: string;
  __pubnumber?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    verseNumber = "",
    showMarker = false,
    sid?: string,
    altnumber?: string,
    pubnumber?: string,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = VERSE_MARKER;
    this.__number = verseNumber;
    this.__showMarker = showMarker;
    this.__sid = sid;
    this.__altnumber = altnumber;
    this.__pubnumber = pubnumber;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "immutable-verse";
  }

  static override clone(node: ImmutableVerseNode): ImmutableVerseNode {
    const { __number, __showMarker, __sid, __altnumber, __pubnumber, __unknownAttributes, __key } =
      node;
    return new ImmutableVerseNode(
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
        if (!isVerseElement(node)) return null;

        return {
          conversion: $convertImmutableVerseElement,
          priority: 1,
        };
      },
    };
  }

  static override importJSON(serializedNode: SerializedImmutableVerseNode): ImmutableVerseNode {
    return $createImmutableVerseNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedImmutableVerseNode>): this {
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

  setMarker(marker: VerseMarker): this {
    if (this.__marker === marker) return this;

    const self = this.getWritable();
    self.__marker = marker;
    return self;
  }

  getMarker(): VerseMarker {
    const self = this.getLatest();
    return self.__marker;
  }

  setNumber(verseNumber: string): this {
    if (this.__number === verseNumber) return this;

    const self = this.getWritable();
    self.__number = verseNumber;
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
    const dom = document.createElement("span");
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(VERSE_CLASS_NAME, `usfm_${this.__marker}`);
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
      element.classList.add(VERSE_CLASS_NAME, `usfm_${this.getMarker()}`);
      element.setAttribute("data-number", this.getNumber());
    }

    return { element };
  }

  override decorate(): ReactElement {
    return (
      <span>
        {this.getShowMarker()
          ? getVisibleOpenMarkerText(this.getMarker(), this.getNumber())
          : // ZWSP added so double click word selection works without including this number.
            ZWSP + this.getNumber() + ZWSP}
      </span>
    );
  }

  override exportJSON(): SerializedImmutableVerseNode {
    return {
      type: this.getType(),
      marker: this.getMarker(),
      number: this.getNumber(),
      showMarker: this.getShowMarker(),
      sid: this.getSid(),
      altnumber: this.getAltnumber(),
      pubnumber: this.getPubnumber(),
      unknownAttributes: this.getUnknownAttributes(),
      version: IMMUTABLE_VERSE_VERSION,
    };
  }

  // Mutation

  override isKeyboardSelectable(): false {
    return false;
  }
}

function $convertImmutableVerseElement(element: HTMLElement): DOMConversionOutput {
  const verseNumber = element.getAttribute("data-number") ?? "0";
  const node = $createImmutableVerseNode(verseNumber);
  return { node };
}

export function $createImmutableVerseNode(
  verseNumber?: string,
  showMarker?: boolean,
  sid?: string,
  altnumber?: string,
  pubnumber?: string,
  unknownAttributes?: UnknownAttributes,
): ImmutableVerseNode {
  return $applyNodeReplacement(
    new ImmutableVerseNode(verseNumber, showMarker, sid, altnumber, pubnumber, unknownAttributes),
  );
}

function isVerseElement(node: HTMLElement | null | undefined): boolean {
  const marker = node?.getAttribute("data-marker") ?? undefined;
  return marker === VERSE_MARKER;
}

export function $isImmutableVerseNode(
  node: LexicalNode | null | undefined,
): node is ImmutableVerseNode {
  return node instanceof ImmutableVerseNode;
}

export function isSerializedImmutableVerseNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedImmutableVerseNode {
  return node?.type === ImmutableVerseNode.getType();
}
