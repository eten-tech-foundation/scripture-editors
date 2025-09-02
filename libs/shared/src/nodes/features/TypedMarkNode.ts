/**
 * Adapted from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-mark/src/MarkNode.ts
 * This adaption allows for different types of marks while still only requiring one mark to enclose
 * a selection.
 */

import { addClassNamesToElement, removeClassNamesFromElement } from "@lexical/utils";
import type {
  BaseSelection,
  EditorConfig,
  LexicalNode,
  NodeKey,
  RangeSelection,
  SerializedElementNode,
  SerializedLexicalNode,
  Spread,
  TextNode,
} from "lexical";
import {
  $applyNodeReplacement,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
} from "lexical";

export interface TypedIDs {
  [type: string]: string[];
}

export type SerializedTypedMarkNode = Spread<
  {
    typedIDs: TypedIDs;
  },
  SerializedElementNode
>;

/** Reserved mark type for CommentPlugin. */
export const COMMENT_MARK_TYPE = "internal-comment";

/**
 * The name identifier for the typed mark node class.
 *
 * @remarks
 * This constant is used to identify and reference options for a TypedMarkNode instance.
 *
 * @example
 * ```tsx
 * const nodeOptions: UsjNodeOptions = {
 *  [typedMarkNodeName]: { addMissingComments: () => console.log("added missing comments") },
 * };
 * ```
 *
 * @public
 */
export const typedMarkNodeName = "TypedMarkNode";

const reservedTypes = [COMMENT_MARK_TYPE];
const TYPED_MARK_VERSION = 1;

export class TypedMarkNode extends ElementNode {
  /** @internal */
  __typedIDs: TypedIDs;

  constructor(typedIds: TypedIDs, key?: NodeKey) {
    super(key);
    this.__typedIDs = typedIds || {};
  }

  static override getType(): string {
    return "typed-mark";
  }

  static override clone(node: TypedMarkNode): TypedMarkNode {
    const __typedIDs = JSON.parse(JSON.stringify(node.__typedIDs));
    return new TypedMarkNode(__typedIDs, node.__key);
  }

  static isReservedType(type: string): boolean {
    return reservedTypes.includes(type);
  }

  static override importJSON(serializedNode: SerializedTypedMarkNode): TypedMarkNode {
    const { typedIDs } = serializedNode;
    return $createTypedMarkNode(typedIDs).updateFromJSON(serializedNode);
  }

  static override importDOM(): null {
    return null;
  }

  override exportJSON(): SerializedTypedMarkNode {
    return {
      ...super.exportJSON(),
      type: this.getType(),
      typedIDs: this.getTypedIDs(),
      version: TYPED_MARK_VERSION,
    };
  }

  override createDOM(config: EditorConfig): HTMLElement {
    const element = document.createElement("mark");
    for (const [type, ids] of Object.entries(this.__typedIDs)) {
      addClassNamesToElement(element, getTypedClassName(config.theme.typedMark, type));
      if (ids.length > 1) {
        addClassNamesToElement(element, getTypedClassName(config.theme.typedMarkOverlap, type));
      }
    }
    return element;
  }

  override updateDOM(prevNode: TypedMarkNode, element: HTMLElement, config: EditorConfig): boolean {
    for (const [type, nextIDs] of Object.entries(this.__typedIDs)) {
      const prevIDs = prevNode.__typedIDs[type];
      const prevIDsCount = prevIDs.length;
      const nextIDsCount = nextIDs.length;
      const markTheme = getTypedClassName(config.theme.typedMark, type);
      const overlapTheme = getTypedClassName(config.theme.typedMarkOverlap, type);

      if (prevIDsCount !== nextIDsCount) {
        if (prevIDsCount === 0) {
          if (nextIDsCount === 1) addClassNamesToElement(element, markTheme);
        } else if (nextIDsCount === 0) removeClassNamesFromElement(element, markTheme);

        if (prevIDsCount === 1) {
          if (nextIDsCount === 2) addClassNamesToElement(element, overlapTheme);
        } else if (nextIDsCount === 1) removeClassNamesFromElement(element, overlapTheme);
      }
    }
    return false;
  }

  hasID(type: string, id: string): boolean {
    const typedIDs = this.getTypedIDs();
    const ids = typedIDs[type];
    if (!ids) return false;

    for (const existingId of ids) {
      if (id === existingId) {
        return true;
      }
    }
    return false;
  }

  getTypedIDs(): TypedIDs {
    const self = this.getLatest();
    return $isTypedMarkNode(self) ? self.__typedIDs : {};
  }

  addID(type: string, id: string): void {
    const self = this.getWritable();
    if (!$isTypedMarkNode(self)) return;

    const ids = self.__typedIDs[type] ?? [];
    self.__typedIDs[type] = ids;
    for (const existingId of ids) {
      // If we already have it, don't add again
      if (id === existingId) {
        return;
      }
    }
    ids.push(id);
  }

  deleteID(type: string, id: string): void {
    const self = this.getWritable();
    if (!$isTypedMarkNode(self)) return;

    const ids = self.__typedIDs[type];
    for (let i = 0; i < ids.length; i++) {
      if (id === ids[i]) {
        ids.splice(i, 1);
        return;
      }
    }
  }

  hasNoIDsForEveryType(): boolean {
    return Object.values(this.getTypedIDs()).every((ids) => ids === undefined || ids.length === 0);
  }

  override insertNewAfter(_selection: RangeSelection, restoreSelection = true): null | ElementNode {
    const node = $createTypedMarkNode(this.__typedIDs);
    this.insertAfter(node, restoreSelection);
    return node;
  }

  override canInsertTextBefore(): false {
    return false;
  }

  override canInsertTextAfter(): false {
    return false;
  }

  override canBeEmpty(): false {
    return false;
  }

  override isInline(): true {
    return true;
  }

  override extractWithChild(
    _child: LexicalNode,
    selection: BaseSelection,
    destination: "clone" | "html",
  ): boolean {
    if (!$isRangeSelection(selection) || destination === "html") {
      return false;
    }
    const anchor = selection.anchor;
    const focus = selection.focus;
    const anchorNode = anchor.getNode();
    const focusNode = focus.getNode();
    const isBackward = selection.isBackward();
    const selectionLength = isBackward
      ? anchor.offset - focus.offset
      : focus.offset - anchor.offset;
    return (
      this.isParentOf(anchorNode) &&
      this.isParentOf(focusNode) &&
      this.getTextContent().length === selectionLength
    );
  }

  override excludeFromCopy(destination: "clone" | "html"): boolean {
    return destination !== "clone";
  }
}

function getTypedClassName(className: string, type: string): string {
  return `${className}-${type}`;
}

export function $createTypedMarkNode(typedIds: TypedIDs): TypedMarkNode {
  return $applyNodeReplacement(new TypedMarkNode(typedIds));
}

export function $isTypedMarkNode(node: LexicalNode | null | undefined): node is TypedMarkNode {
  return node instanceof TypedMarkNode;
}

export function isSerializedTypedMarkNode(
  node: SerializedLexicalNode | null | undefined,
): node is SerializedTypedMarkNode {
  return node?.type === TypedMarkNode.getType();
}

/**
 * Adapted from https://github.com/facebook/lexical/blob/92c47217244f9d3c22a59728633fb41a10420724/packages/lexical-mark/src/index.ts
 */

export function $unwrapTypedMarkNode(node: TypedMarkNode): void {
  const children = node.getChildren();
  let target: LexicalNode | null = null;
  for (const child of children) {
    if (target === null) {
      node.insertBefore(child);
    } else {
      target.insertAfter(child);
    }
    target = child;
  }
  node.remove();
}

export function $wrapSelectionInTypedMarkNode(
  selection: RangeSelection,
  type: string,
  id: string,
  createNode?: (typedIds: TypedIDs) => TypedMarkNode,
): void {
  const nodes = selection.getNodes();
  const anchorOffset = selection.anchor.offset;
  const focusOffset = selection.focus.offset;
  const nodesLength = nodes.length;
  const isBackward = selection.isBackward();
  const startOffset = isBackward ? focusOffset : anchorOffset;
  const endOffset = isBackward ? anchorOffset : focusOffset;
  let currentNodeParent;
  let lastCreatedMarkNode;

  // We only want wrap adjacent text nodes, line break nodes and inline element nodes. For decorator
  // nodes and block element nodes, we step out of their boundary and start again after, if there
  // are more nodes.
  for (let i = 0; i < nodesLength; i++) {
    const node = nodes[i];
    if ($isElementNode(lastCreatedMarkNode) && lastCreatedMarkNode.isParentOf(node)) {
      // If the current node is a child of the last created mark node, there is nothing to do here
      continue;
    }
    const isFirstNode = i === 0;
    const isLastNode = i === nodesLength - 1;
    let targetNode: LexicalNode | null = null;

    if ($isTextNode(node)) {
      // Case 1: The node is a text node and we can split it
      const textContentSize = node.getTextContentSize();
      const startTextOffset = isFirstNode ? startOffset : 0;
      const endTextOffset = isLastNode ? endOffset : textContentSize;
      if (startTextOffset === 0 && endTextOffset === 0) {
        continue;
      }
      const splitNodes = node.splitText(startTextOffset, endTextOffset);
      targetNode =
        splitNodes.length > 1 &&
        (splitNodes.length === 3 ||
          (isFirstNode && !isLastNode) ||
          endTextOffset === textContentSize)
          ? splitNodes[1]
          : splitNodes[0];
    } else if ($isTypedMarkNode(node)) {
      // Case 2: the node is a mark node and we can ignore it as a target, moving on to its
      // children. Note that when we make a mark inside another mark, it may ultimately be un-nested
      // by a call to `registerNestedElementResolver<TypedMarkNode>` somewhere else in the
      // codebase.

      continue;
    } else if ($isElementNode(node) && node.isInline()) {
      // Case 3: inline element nodes can be added in their entirety to the new mark
      targetNode = node;
    }

    if (targetNode !== null) {
      // Now that we have a target node for wrapping with a mark, we can run through special cases.
      if (targetNode && targetNode.is(currentNodeParent)) {
        // The current node is a child of the target node to be wrapped, there is nothing to do
        // here.
        continue;
      }
      const parentNode = targetNode.getParent();
      if (parentNode == null || !parentNode.is(currentNodeParent)) {
        // If the parent node is not the current node's parent node, we can clear the last created
        // mark node.
        lastCreatedMarkNode = undefined;
      }

      currentNodeParent = parentNode;

      if (lastCreatedMarkNode === undefined) {
        // If we don't have a created mark node, we can make one
        const createTypedMarkNode = createNode || $createTypedMarkNode;
        lastCreatedMarkNode = createTypedMarkNode({ [type]: [id] });
        targetNode.insertBefore(lastCreatedMarkNode);
      }

      // Add the target node to be wrapped in the latest created mark node
      lastCreatedMarkNode.append(targetNode);
    } else {
      // If we don't have a target node to wrap we can clear our state and continue on with the next
      // node
      currentNodeParent = undefined;
      lastCreatedMarkNode = undefined;
    }
  }
  // Make selection collapsed at the end for comments.
  if (type === COMMENT_MARK_TYPE && $isElementNode(lastCreatedMarkNode)) {
    if (isBackward) lastCreatedMarkNode.selectStart();
    else lastCreatedMarkNode.selectEnd();
  }
}

export function $getMarkIDs(node: TextNode, type: string, offset: number): string[] | undefined {
  let currentNode: LexicalNode | null = node;
  while (currentNode !== null) {
    if ($isTypedMarkNode(currentNode)) {
      return currentNode.getTypedIDs()[type];
    } else if ($isTextNode(currentNode) && offset === currentNode.getTextContentSize()) {
      const nextSibling = currentNode.getNextSibling();
      if ($isTypedMarkNode(nextSibling)) {
        return nextSibling.getTypedIDs()[type];
      }
    }
    currentNode = currentNode.getParent();
  }
  return undefined;
}

/**
 * Gets the external typed mark type.
 *
 * @remarks
 * This is used to ensure unique identification of external typed marks. Along with reserved types
 * prefaced with 'internal-' for internal typed marks @see {@link COMMENT_MARK_TYPE}.
 */
export function externalTypedMarkType(type: string): string {
  return `external-${type}`;
}
