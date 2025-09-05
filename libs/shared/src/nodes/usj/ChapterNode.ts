/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/cv/c.html */

import {
  $applyNodeReplacement,
  ElementNode,
  LexicalNode,
  LexicalUpdateJSON,
  NodeKey,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
} from "lexical";
import { CHAPTER_CLASS_NAME, UnknownAttributes } from "./node-constants.js";

export const CHAPTER_MARKER = "c";
export const CHAPTER_VERSION = 1;
export type ChapterMarker = typeof CHAPTER_MARKER;

export type SerializedChapterNode = Spread<
  {
    marker: ChapterMarker;
    number: string;
    sid?: string;
    altnumber?: string;
    pubnumber?: string;
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

export class ChapterNode extends ElementNode {
  __marker: ChapterMarker;
  __number: string;
  __sid?: string;
  __altnumber?: string;
  __pubnumber?: string;
  __unknownAttributes?: UnknownAttributes;

  constructor(
    chapterNumber = "",
    sid?: string,
    altnumber?: string,
    pubnumber?: string,
    unknownAttributes?: UnknownAttributes,
    key?: NodeKey,
  ) {
    super(key);
    this.__marker = CHAPTER_MARKER;
    this.__number = chapterNumber;
    this.__sid = sid;
    this.__altnumber = altnumber;
    this.__pubnumber = pubnumber;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "chapter";
  }

  static override clone(node: ChapterNode): ChapterNode {
    const { __number, __sid, __altnumber, __pubnumber, __unknownAttributes, __key } = node;
    return new ChapterNode(__number, __sid, __altnumber, __pubnumber, __unknownAttributes, __key);
  }

  static override importJSON(serializedNode: SerializedChapterNode): ChapterNode {
    return $createChapterNode().updateFromJSON(serializedNode);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedChapterNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setMarker(serializedNode.marker)
      .setNumber(serializedNode.number)
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
    const dom = document.createElement("p");
    dom.setAttribute("data-marker", this.__marker);
    dom.classList.add(CHAPTER_CLASS_NAME, `usfm_${this.__marker}`);
    dom.setAttribute("data-number", this.__number);
    return dom;
  }

  override updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  override exportJSON(): SerializedChapterNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      marker: this.getMarker(),
      number: this.getNumber(),
      sid: this.getSid(),
      altnumber: this.getAltnumber(),
      pubnumber: this.getPubnumber(),
      unknownAttributes: this.getUnknownAttributes(),
      version: CHAPTER_VERSION,
    };
  }
}

export function $createChapterNode(
  chapterNumber?: string,
  sid?: string,
  altnumber?: string,
  pubnumber?: string,
  unknownAttributes?: UnknownAttributes,
): ChapterNode {
  return $applyNodeReplacement(
    new ChapterNode(chapterNumber, sid, altnumber, pubnumber, unknownAttributes),
  );
}

export function $isChapterNode(node: LexicalNode | null | undefined): node is ChapterNode {
  return node instanceof ChapterNode;
}

export function isSerializedChapterNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedChapterNode {
  return node?.type === ChapterNode.getType();
}
