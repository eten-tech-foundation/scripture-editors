import { $applyNodeReplacement, EditorConfig, NodeKey } from "lexical";
import { Attributes, SerializedUsfmElementNode, UsfmElementNode } from "./UsfmElementNode";
import { addClassNamesToElement } from "@lexical/utils";

export type SerializedInlineNode = SerializedUsfmElementNode;

export class InlineNode extends UsfmElementNode {
  constructor(attributes: Attributes = {}, key?: NodeKey) {
    super(attributes, undefined, "span", key);
  }

  static getType(): string {
    return "inline";
  }

  static clone(node: InlineNode): InlineNode {
    return new InlineNode(node.__attributes, node.__key);
  }

  isInline(): boolean {
    return true;
  }

  createDOM(config: EditorConfig): HTMLSpanElement {
    const element = document.createElement("span");
    const attributes = this.getAttributes() ?? {};
    Object.keys(attributes).forEach((attKey) => {
      element.setAttribute(attKey, attributes[attKey]);
    });
    addClassNamesToElement(element, config.theme.sectionmark);
    return element;
  }

  static importJSON(serializedNode: SerializedInlineNode): InlineNode {
    const { attributes } = serializedNode;
    return $createInlineNode(attributes).updateFromJSON(serializedNode);
  }

  exportJSON(): SerializedInlineNode {
    return {
      ...super.exportJSON(),
      type: "inline",
      version: 1,
    };
  }

  updateDOM(): boolean {
    // Returning false tells Lexical that this node does not need its
    // DOM element replacing with a new copy from createDOM.
    return false;
  }
}

function $createInlineNode(attributes?: Attributes): InlineNode {
  return $applyNodeReplacement(new InlineNode(attributes));
}
