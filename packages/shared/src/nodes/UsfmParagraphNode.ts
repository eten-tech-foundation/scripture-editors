import { addClassNamesToElement } from "@lexical/utils";
import {
  $applyNodeReplacement,
  $isTextNode,
  EditorConfig,
  LexicalNode,
  NodeKey,
  RangeSelection,
} from "lexical";
import { Attributes, SerializedUsfmElementNode, UsfmElementNode } from "./UsfmElementNode";

const DEFAULT_TAG = "p";

export type SerializedUsfmParagraphNode = SerializedUsfmElementNode;

export class UsfmParagraphNode extends UsfmElementNode {
  constructor(attributes: Attributes = {}, tag?: string, key?: NodeKey) {
    super(attributes, undefined, tag, key);
  }

  static getType(): string {
    return "usfmparagraph";
  }

  static clone(node: UsfmParagraphNode): UsfmParagraphNode {
    return new UsfmParagraphNode(node.__attributes, node.__tag, node.__key);
  }

  static importJSON(serializedNode: SerializedUsfmParagraphNode): UsfmParagraphNode {
    const { attributes, tag } = serializedNode;
    return $createUsfmParagraphNode(attributes, tag ?? DEFAULT_TAG).updateFromJSON(serializedNode);
  }

  createDOM(config: EditorConfig): HTMLElement {
    const attributes = this.getAttributes() ?? {};
    const element = document.createElement(this.getTag() ?? DEFAULT_TAG);
    Object.keys(attributes).forEach((attKey) => {
      element.setAttribute(attKey, attributes[attKey]);
    });

    addClassNamesToElement(element, config.theme.sectionmark);
    return element;
  }

  isInline(): boolean {
    return false;
  }

  exportJSON(): SerializedUsfmParagraphNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      version: 1,
    };
  }

  updateDOM(): boolean {
    return false;
  }

  insertNewAfter(_: RangeSelection, restoreSelection: boolean): UsfmParagraphNode {
    const newElement = $createUsfmParagraphNode(this.getAttributes(), this.getTag());
    const direction = this.getDirection();
    newElement.setDirection(direction);
    this.insertAfter(newElement, restoreSelection);
    return newElement;
  }

  collapseAtStart(): boolean {
    const children = this.getChildren();
    // If we have an empty (trimmed) first paragraph and try and remove it,
    // delete the paragraph as long as we have another sibling to go to
    if (
      children.length === 0 ||
      ($isTextNode(children[0]) && children[0].getTextContent().trim() === "")
    ) {
      const nextSibling = this.getNextSibling();
      if (nextSibling !== null) {
        this.selectNext();
        this.remove();
        return true;
      }
      const prevSibling = this.getPreviousSibling();
      if (prevSibling !== null) {
        this.selectPrevious();
        this.remove();
        return true;
      }
    }
    return false;
  }
}

export function $createUsfmParagraphNode(attributes?: Attributes, tag?: string): UsfmParagraphNode {
  return $applyNodeReplacement(new UsfmParagraphNode(attributes, tag));
}

export function $isUsfmParagraphNode(
  node: LexicalNode | null | undefined,
): node is UsfmParagraphNode {
  return node instanceof UsfmParagraphNode;
}
