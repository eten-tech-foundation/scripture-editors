/** Conforms with USJ v3.1 @see https://docs.usfm.bible/usfm/3.1/doc/id.html */

import { BookCode, isValidBookCode } from "@eten-tech-foundation/scripture-utilities";
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
import { UnknownAttributes } from "./node-constants.js";

export const BOOK_MARKER = "id";
export const BOOK_VERSION = 1;
export type BookMarker = typeof BOOK_MARKER;

export type SerializedBookNode = Spread<
  {
    marker: BookMarker;
    code: BookCode | "";
    unknownAttributes?: UnknownAttributes;
  },
  SerializedElementNode
>;

export class BookNode extends ElementNode {
  __marker: BookMarker = BOOK_MARKER;
  __code: BookCode | "";
  __unknownAttributes?: UnknownAttributes;

  constructor(code: BookCode | "" = "", unknownAttributes?: UnknownAttributes, key?: NodeKey) {
    super(key);
    this.__code = code;
    this.__unknownAttributes = unknownAttributes;
  }

  static override getType(): string {
    return "book";
  }

  static override clone(node: BookNode): BookNode {
    const { __code, __unknownAttributes, __key } = node;
    return new BookNode(__code, __unknownAttributes, __key);
  }

  static override importJSON(serializedNode: SerializedBookNode): BookNode {
    const { code } = serializedNode;
    return $createBookNode(code).updateFromJSON(serializedNode);
  }

  static isValidBookCode(code: string): code is BookCode {
    return isValidBookCode(code);
  }

  override updateFromJSON(serializedNode: LexicalUpdateJSON<SerializedBookNode>): this {
    return super
      .updateFromJSON(serializedNode)
      .setCode(serializedNode.code)
      .setUnknownAttributes(serializedNode.unknownAttributes);
  }

  getMarker(): BookMarker {
    const self = this.getLatest();
    return self.__marker;
  }

  setCode(code: BookCode | ""): this {
    if (this.__code === code) return this;

    const self = this.getWritable();
    self.__code = code;
    return self;
  }

  /**
   * Get the book code (ID).
   * @returns the book code (ID).
   */
  getCode(): BookCode | "" {
    const self = this.getLatest();
    return self.__code;
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
    dom.classList.add(this.__type, `usfm_${this.__marker}`);
    dom.setAttribute("data-code", this.__code);
    return dom;
  }

  override updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }

  override exportJSON(): SerializedBookNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      marker: this.getMarker(),
      code: this.getCode(),
      unknownAttributes: this.getUnknownAttributes(),
      version: BOOK_VERSION,
    };
  }
}

export function $createBookNode(
  code?: BookCode | "",
  unknownAttributes?: UnknownAttributes,
): BookNode {
  return $applyNodeReplacement(new BookNode(code, unknownAttributes));
}

export function $isBookNode(node: LexicalNode | null | undefined): node is BookNode {
  return node instanceof BookNode;
}

export function isSerializedBookNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedBookNode {
  return node?.type === BookNode.getType();
}
