import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import {
  $createWholeNote,
  $isSomeVerseNode,
  SomeVerseNode,
} from "../../../nodes/usj/node-react.utils";
import { UsjNodeOptions } from "../../../nodes/usj/usj-node-options.model";
import { ViewOptions } from "../../../views/view-options.utils";
import {
  $isEmbedNode,
  $isParaLikeNode,
  DeltaOp,
  EmbedNode,
  isInsertEmbedOpOfType,
  LF,
} from "./delta-common.utils";
import {
  DeltaOpInsertNoteEmbed,
  OT_BOOK_PROPS,
  OT_CHAPTER_PROPS,
  OT_CHAR_PROPS,
  OT_MILESTONE_PROPS,
  OT_NOTE_PROPS,
  OT_PARA_PROPS,
  OT_UNKNOWN_PROPS,
  OT_VERSE_PROPS,
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
  OTParaAttribute,
  OTUnknownEmbed,
  OTUnmatchedEmbed,
  OTVerseEmbed,
} from "./rich-text-ot.model";
import { BookCode } from "@eten-tech-foundation/scripture-utilities";
import { $unwrapNode } from "@lexical/utils";
import {
  $getRoot,
  $createTextNode,
  $isElementNode,
  $isTextNode,
  $setState,
  LexicalNode,
  TextFormatType,
  TextNode,
} from "lexical";
import { AttributeMap } from "quill-delta";
import {
  $createBookNode,
  $createChapterNode,
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createImmutableUnmatchedNode,
  $createImpliedParaNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createUnknownNode,
  $createVerseNode,
  $hasSameCharAttributes,
  $isBookNode,
  $isCharNode,
  $isImpliedParaNode,
  $isMilestoneNode,
  $isNoteNode,
  $isParaNode,
  $isSomeChapterNode,
  $isSomeParaNode,
  $isUnknownNode,
  BOOK_MARKER,
  BookNode,
  charIdState,
  CharNode,
  closingMarkerText,
  EMPTY_CHAR_PLACEHOLDER_TEXT,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  ImpliedParaNode,
  LoggerBasic,
  NoteNode,
  openingMarkerText,
  ParaNode,
  segmentState,
  SomeChapterNode,
  UnknownNode,
} from "shared";

type AttributeMapWithPara = AttributeMap & {
  para: OTParaAttribute;
};

type AttributeMapWithBook = AttributeMap & {
  book: OTBookAttribute;
};

type AttributeMapWithChar = AttributeMap & {
  char: OTCharAttribute;
};

/*
For implied paragraphs, we use the following logic:
  - An ImpliedParaNode (or ParaNode) takes up OT index space 1 but only at the end of the block.
  - An ImpliedParaNode is created when an inline node is inserted where there is no ParaNode.
  - If an LF is inserted, it closes the ImpliedParaNode if there are no attributes or it is replaced
    by a ParaNode specified by the attributes.
  - Our empty Lexical editor defaults to an empty ImpliedParaNode, so the first inline insertion
    should go inside it.

For CharNodes, we use the following logic:
  - CharNodes are created when attributes.char is present in a text insert operation.
  - CharNodes are inserted at the current index, and they can contain TextNodes with additional
    formatting attributes.
  - CharNodes have no OT length contribution themselves, but their text content does.
  - CharNodes can be nested inside SomeParaNode or other CharNodes.
  - CharNodes use the attributes style and cid to uniquely identify themselves.
  - A single CharNode can use an attributes object `{ char: { style: "bd", cid: "456" } }`.
  - A nested CharNode will use attributes.char object
      `{ char: [{ style: "it", cid: "123" }, { style: "bd", cid: "456" }] }`
    where "it" is the parent CharNode and "bd" is the child CharNode.
*/

/**
 * Apply Operational Transform rich-text updates to the editor.
 * @param ops - Operations array.
 * @param viewOptions - View options of the editor.
 * @param nodeOptions - Node options for USJ nodes.
 * @param logger - Logger to use, if any.
 *
 * @see https://github.com/ottypes/rich-text
 */
export function $applyUpdate(
  ops: DeltaOp[],
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger?: LoggerBasic,
) {
  /** Tracks the current position in the OT document */
  let currentIndex = 0;
  ops.forEach((op) => {
    if ("retain" in op) {
      currentIndex += $retain(op, currentIndex, viewOptions, logger);
    } else if ("delete" in op) {
      if (typeof op.delete !== "number" || op.delete <= 0) {
        logger?.error(`Invalid delete operation: ${JSON.stringify(op)}`);
        return; // Skip malformed operation
      }

      logger?.debug(`Delete: ${op.delete}`);
      $delete(currentIndex, op.delete, logger);
      // Delete operations do not advance the currentIndex in the OT Delta model
    } else if ("insert" in op) {
      if (typeof op.insert === "string") {
        logger?.debug(`Insert: '${op.insert}'`);
        currentIndex += $insertTextAtCurrentIndex(
          currentIndex,
          op.insert,
          op.attributes,
          viewOptions,
          logger,
        );
      } else if (typeof op.insert === "object" && op.insert !== null) {
        logger?.debug(`Insert embed: ${JSON.stringify(op.insert)}`);
        if ($insertEmbedAtCurrentIndex(currentIndex, op, viewOptions, nodeOptions, logger)) {
          currentIndex += 1;
        } else {
          // If embed insertion fails, currentIndex is not advanced to prevent de-sync.
          logger?.error(
            `Failed to process insert embed operation: ${JSON.stringify(op.insert)} at index ${
              currentIndex
            }. Document may be inconsistent.`,
          );
        }
      } else {
        logger?.error(`Insert of unknown type: ${JSON.stringify(op.insert)}`);
      }
    } else {
      logger?.error(`Unknown operation: ${JSON.stringify(op)}`);
    }
  });
}

function $retain(
  op: DeltaOp,
  currentIndex: number,
  viewOptions: ViewOptions,
  logger: LoggerBasic | undefined,
): number {
  if (typeof op.retain !== "number" || op.retain < 0) {
    logger?.error(`Invalid retain operation: ${JSON.stringify(op)}`);
    return 0;
  }

  logger?.debug(`Retain: ${op.retain}`);
  if (op.attributes) {
    logger?.debug(`Retain attributes: ${JSON.stringify(op.attributes)}`);
    $applyAttributes(currentIndex, op.retain, op.attributes, viewOptions, logger);
  }
  return op.retain;
}

/** Traverse and apply attributes to the retained range, or transform text to CharNode */
function $applyAttributes(
  targetIndex: number,
  retain: number,
  attributes: AttributeMap,
  viewOptions: ViewOptions,
  logger: LoggerBasic | undefined,
) {
  // Apply attributes using standard traversal logic
  logger?.debug(
    `Applying attributes for range [${targetIndex}, ${
      targetIndex + retain - 1
    }] with attributes: ${JSON.stringify(attributes)}`,
  );
  let lengthToFormat = retain;
  let currentIndex = 0;
  /** The nested CharNode depth */
  let nestedCharCount = -1;
  const root = $getRoot();

  function $traverseAndApplyAttributesRecursive(currentNode: LexicalNode): boolean {
    if (lengthToFormat <= 0) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      if (targetIndex < currentIndex + textLength && currentIndex < targetIndex + retain) {
        const offsetInNode = Math.max(0, targetIndex - currentIndex);
        const lengthAvailableInNodeAfterOffset = textLength - offsetInNode;
        const lengthToApplyInThisNode = Math.min(lengthToFormat, lengthAvailableInNodeAfterOffset);

        if (lengthToApplyInThisNode > 0) {
          let targetNode = currentNode;
          const needsSplitAtStart = offsetInNode > 0;
          const needsSplitAtEnd = lengthToApplyInThisNode < textLength - offsetInNode;

          if (needsSplitAtStart && needsSplitAtEnd) {
            const [, middleNode] = currentNode.splitText(offsetInNode);
            [targetNode] = middleNode.splitText(lengthToApplyInThisNode);
          } else if (needsSplitAtStart) {
            [, targetNode] = currentNode.splitText(offsetInNode);
          } else if (needsSplitAtEnd) {
            [targetNode] = currentNode.splitText(lengthToApplyInThisNode);
          }

          // Check if we need to convert TextNode to CharNode
          if (hasCharAttributes(attributes)) {
            // Apply new non-char attributes to TextNode as well

            // Check if this text node is already inside a CharNode
            const parentNode = targetNode.getParent();
            if ($isCharNode(parentNode)) {
              const charAttr = attributes.char;
              let charAttrItem: OTCharItem | undefined;
              if (Array.isArray(charAttr)) {
                if (nestedCharCount >= 0 && nestedCharCount <= charAttr.length - 1) {
                  charAttrItem = charAttr[nestedCharCount];
                }
              } else if (nestedCharCount === 0) {
                // Single char attribute
                charAttrItem = charAttr;
              }
              const hasSameCharAttributes = charAttrItem
                ? $hasSameCharAttributes(charAttrItem, parentNode)
                : false;

              if (hasSameCharAttributes && Array.isArray(charAttr) && charAttr.length > 1) {
                const placeholderNode = $createTextNode("");
                targetNode.replace(placeholderNode);
                const segment =
                  typeof attributes.segment === "string" ? attributes.segment : undefined;
                const nestedCharNodes = $createNestedChars(
                  charAttr.slice(1),
                  viewOptions,
                  targetNode,
                  segment,
                );
                // Insert all nodes (markers + CharNode) as siblings
                let currentPlaceholder: LexicalNode = placeholderNode;
                for (const node of nestedCharNodes) {
                  currentPlaceholder.insertAfter(node);
                  currentPlaceholder = node;
                }
                placeholderNode.remove();
                // Apply text attributes to the innermost node
                $applyTextAttributes(attributes, targetNode);
                // No need to update parent marker/cid, as it already matches
              } else if (!hasSameCharAttributes) {
                // If parent does not match, extract text and create new CharNode as sibling
                // Remove the text node from inside the parent CharNode
                targetNode.remove();

                // Create new CharNode(s) with the text
                const charNodes = $wrapInNestedCharNodes(
                  targetNode,
                  attributes,
                  viewOptions,
                  logger,
                );

                // Insert the new CharNodes as siblings to the parent CharNode
                if (charNodes && charNodes.length > 0) {
                  let currentNode: LexicalNode = parentNode;
                  for (const node of charNodes) {
                    currentNode.insertAfter(node);
                    currentNode = node;
                  }
                }
              } else {
                // Parent CharNode matches and no further nesting needed, just apply attributes
                $applyTextAttributes(attributes, targetNode);
              }
            } else {
              const placeholderNode = $createTextNode("");
              targetNode.replace(placeholderNode);
              const charNodes = $wrapInNestedCharNodes(targetNode, attributes, viewOptions, logger);
              if (charNodes && charNodes.length > 0) {
                let currentNode: LexicalNode = placeholderNode;
                for (const node of charNodes) {
                  currentNode.insertAfter(node);
                  currentNode = node;
                }
                placeholderNode.remove();
              } else {
                placeholderNode.replace(targetNode);
              }
            }
          } else {
            $applyTextAttributes(attributes, targetNode);
          }
          lengthToFormat -= lengthToApplyInThisNode;
        }
      }
      currentIndex += textLength;
    } else if ($isEmbedNode(currentNode)) {
      const embedNodeOtLength = 1;
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + retain &&
        lengthToFormat > 0
      ) {
        $applyEmbedAttributes(currentNode, attributes);
        lengthToFormat -= embedNodeOtLength;
      }
      currentIndex += embedNodeOtLength;
    } else if ($isCharNode(currentNode)) {
      // CharNodes don't contribute to OT length, they're just formatted text containers
      nestedCharCount += 1;
      let shouldRemoveCharNode = false;
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + retain &&
        lengthToFormat > 0
      ) {
        if (hasCharAttributes(attributes)) {
          // Support nested char arrays for deep char attribute application
          const charAttr = attributes.char;
          let charAttrItem: OTCharItem | undefined;
          if (Array.isArray(charAttr)) {
            if (nestedCharCount >= 0 && nestedCharCount <= charAttr.length - 1) {
              charAttrItem = charAttr[nestedCharCount];
            }
          } else if (nestedCharCount === 0) {
            // Single char attribute
            charAttrItem = charAttr;
          }
          // Only set attributes if needed
          if (charAttrItem) {
            // Update the CharNode's marker and attributes to match the retain attributes
            currentNode.setMarker(charAttrItem.style);
            if (typeof charAttrItem.cid === "string") {
              $setState(currentNode, charIdState, () => charAttrItem.cid);
            }
            const unknownAttributes = getUnknownAttributes(charAttrItem, OT_CHAR_PROPS);
            if (unknownAttributes && Object.keys(unknownAttributes).length > 0) {
              currentNode.setUnknownAttributes({
                ...(currentNode.getUnknownAttributes() ?? {}),
                ...unknownAttributes,
              });
            } else {
              // If no unknown attributes, clear them
              // TODO: this was added - review if this is right and add elsewhere?
              currentNode.setUnknownAttributes(undefined);
            }
          }
        } else if (
          attributes.char === false ||
          attributes.char === null ||
          isEmptyObject(attributes.char)
        ) {
          shouldRemoveCharNode = true;
        }
      }

      // Process children of CharNodes (no OT length contribution)
      if (lengthToFormat > 0) {
        const children = currentNode.getChildren();
        for (const child of children) {
          if (lengthToFormat <= 0) break;
          if ($traverseAndApplyAttributesRecursive(child)) {
            if (lengthToFormat <= 0) {
              if (shouldRemoveCharNode) $unwrapNode(currentNode);
              return true;
            }
          }
        }
      }

      if (shouldRemoveCharNode) {
        $unwrapNode(currentNode);
      }
      nestedCharCount -= 1;
    } else if ($isParaLikeNode(currentNode)) {
      // Process children first, then account for the block's own closing OT length.
      const children = currentNode.getChildren();
      for (const child of children) {
        if (lengthToFormat <= 0) break;
        if ($traverseAndApplyAttributesRecursive(child)) {
          if (lengthToFormat <= 0) return true; // Early exit if formatting complete
        }
      }

      // After children, account for the block's closing marker (OT length 1)
      const blockClosingOtLength = 1;
      // currentIndex is now positioned after all children of this block node.
      // Check if the retain operation targets this closing marker.
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + lengthToFormat &&
        lengthToFormat > 0
      ) {
        if (!$isImpliedParaNode(currentNode)) $applyEmbedAttributes(currentNode, attributes);
        else if (hasParaAttributes(attributes)) {
          const newPara = $createPara(attributes.para);
          if (newPara) currentNode.replace(newPara, true);
        }
        lengthToFormat -= blockClosingOtLength;
      }
      currentIndex += blockClosingOtLength;
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes that don't contribute to the OT length (like RootNode)
      const children = currentNode.getChildren();
      for (const child of children) {
        if (lengthToFormat <= 0) break;
        if ($traverseAndApplyAttributesRecursive(child)) {
          if (lengthToFormat <= 0) return true;
        }
      }
    }
    // Else: Non-text, non-element, non-handled nodes (e.g. LineBreakNode, DecoratorNode if not
    // explicitly handled). These typically don't contribute to OT length in this model or are
    // handled by Lexical internally.

    return lengthToFormat <= 0;
  }

  $traverseAndApplyAttributesRecursive(root);
  if (lengthToFormat > 0) {
    logger?.warn(
      `$applyAttributes: Not all characters in the retain operation (length ${
        retain
      }) could be processed. Remaining: ${lengthToFormat}. targetIndex: ${
        targetIndex
      }, final currentIndex: ${currentIndex}`,
    );
  }
}

/**
 * Applies the given attributes to the specified text node wrapped in nested CharNodes.
 * @param textNode - The text node to wrap and to which attributes should be applied.
 * @param attributes - The attributes to apply.
 * @param textAttributes - The text attributes to apply.
 * @param logger - The logger to use for logging, if any.
 * @returns A CharNode if the operation was successful, otherwise undefined.
 */
function $wrapInNestedCharNodes(
  textNode: TextNode,
  attributes: AttributeMapWithChar,
  viewOptions: ViewOptions,
  logger: LoggerBasic | undefined,
): LexicalNode[] | undefined {
  // Create new CharNode(s) with the attributes, supporting nested char arrays
  const segment = typeof attributes.segment === "string" ? attributes.segment : undefined;
  const newCharNodes = $createNestedChars(attributes.char, viewOptions, textNode, segment);
  const charNode = newCharNodes.find($isCharNode);
  if (!charNode) {
    logger?.error(
      `Failed to create CharNode for text transformation. Style: ${
        Array.isArray(attributes.char) ? attributes.char[0].style : attributes.char?.style
      }. Falling back to standard text attributes.`,
    );
    $applyTextAttributes(attributes, textNode);
    return undefined;
  }

  // Copy original text formatting to CharNode's unknownAttributes
  const textFormatAttributes: { [attributeName: string]: string } = {};
  TEXT_FORMAT_TYPES.forEach((format) => {
    if (textNode.hasFormat(format)) {
      textFormatAttributes[format] = "true";
    }
  });

  // Convert attributes to string values for unknownAttributes
  const stringifiedAttributes: { [attributeName: string]: string } = {};
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === "segment" || key === "char") return;

    if (typeof value === "string") {
      stringifiedAttributes[key] = value;
    } else if (value === true) {
      stringifiedAttributes[key] = "true";
    } else if (value === false) {
      stringifiedAttributes[key] = "false";
    }
    // Skip other types that can't be serialized to string
  });

  // Combine all attributes for the CharNode
  const combinedUnknownAttributes = {
    ...(charNode.getUnknownAttributes() ?? {}),
    ...textFormatAttributes,
    ...stringifiedAttributes,
  };

  if (Object.keys(combinedUnknownAttributes).length > 0) {
    charNode.setUnknownAttributes(combinedUnknownAttributes);
  }

  $applyTextAttributes(attributes, textNode);
  return newCharNodes;
}

// Apply attributes to the given embed node
function $applyEmbedAttributes(
  node: EmbedNode | CharNode | NoteNode | UnknownNode | ParaNode | BookNode,
  attributes: AttributeMap,
) {
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];

    // Special handling for char attributes on CharNodes
    if (key === "char" && $isCharNode(node) && hasCharAttributes(attributes)) {
      const charAttributes = value as OTCharItem;
      node.setMarker(charAttributes.style);

      // Set charIdState if cid is present
      if (typeof charAttributes.cid === "string") {
        const cid = charAttributes.cid;
        $setState(node, charIdState, () => cid);
      }

      // Apply other char attributes to unknownAttributes
      const unknownAttributes = getUnknownAttributes(charAttributes, OT_CHAR_PROPS);
      if (unknownAttributes && Object.keys(unknownAttributes).length > 0) {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          ...unknownAttributes,
        });
      }
      continue;
    }

    if (typeof value !== "string") {
      // Skip non-string attributes (except char which is handled above)
      continue;
    }

    if (
      $isSomeChapterNode(node) ||
      $isSomeVerseNode(node) ||
      $isMilestoneNode(node) ||
      $isNoteNode(node) ||
      $isUnknownNode(node)
    ) {
      node.setUnknownAttributes({
        ...(node.getUnknownAttributes() ?? {}),
        [key]: value,
      });
    } else if ($isBookNode(node) || $isParaNode(node) || $isCharNode(node)) {
      if (key === "style" && !$isBookNode(node)) {
        node.setMarker(value);
      } else if (key === "code" && $isBookNode(node)) {
        node.setCode(value as BookCode);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    }

    if (key === "segment") {
      $setState(node, segmentState, () => value);
    }
  }
}

// Helper function to delete items starting at a given flat index from the document
function $delete(targetIndex: number, otLength: number, logger: LoggerBasic | undefined) {
  if (otLength <= 0) return;

  const root = $getRoot();
  let currentIndex = 0; // Tracks characters traversed so far in the document's text content
  let remainingToDelete = otLength;

  // Inner recursive function to find and delete text
  function $traverseAndDelete(
    currentNode: LexicalNode,
  ): boolean /* true if deletion is complete */ {
    if (remainingToDelete <= 0) return true;

    if ($isTextNode(currentNode)) {
      let textLength = currentNode.getTextContentSize();
      if (
        targetIndex < currentIndex + textLength &&
        currentIndex < targetIndex + remainingToDelete
      ) {
        const offsetInNode = Math.max(0, targetIndex - currentIndex);
        const deletableLengthInNode = textLength - offsetInNode;
        const lengthToDeleteFromThisNode = Math.min(remainingToDelete, deletableLengthInNode);

        if (lengthToDeleteFromThisNode > 0) {
          currentNode.spliceText(offsetInNode, lengthToDeleteFromThisNode, "");

          // Remove the TextNode if it becomes empty
          if (currentNode.getTextContentSize() === 0) {
            currentNode.remove();
          }

          logger?.debug(
            `Deleted ${lengthToDeleteFromThisNode} length from TextNode ` +
              `(key: ${currentNode.getKey()}) at nodeOffset ${offsetInNode}. ` +
              `Original targetIndex: ${targetIndex}, current currentIndex: ${currentIndex}.`,
          );
          remainingToDelete -= lengthToDeleteFromThisNode;
          // Adjust textLength to account for the text that was deleted
          textLength -= lengthToDeleteFromThisNode;
        }
      }
      currentIndex += textLength;
    } else if ($isEmbedNode(currentNode)) {
      // Check if the deletion should remove this embed
      if (targetIndex <= currentIndex && currentIndex < targetIndex + remainingToDelete) {
        // The deletion spans this embed - remove it
        currentNode.remove();
        logger?.debug(
          `Deleted embed node (key: ${currentNode.getKey()}) at currentIndex: ${currentIndex}. ` +
            `Original targetIndex: ${targetIndex}, remainingToDelete: ${remainingToDelete}.`,
        );
        remainingToDelete -= 1;
      } else {
        // Deletion doesn't affect this embed, just advance past it
        currentIndex += 1;
      }
    } else if ($isParaLikeNode(currentNode)) {
      // Process children first, then handle the symbolic close.
      const childrenBefore = currentNode.getChildren().slice(); // Save original children

      // Process children
      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToDelete <= 0) break;
        if ($traverseAndDelete(child)) {
          if (remainingToDelete <= 0) return true;
        }
      }

      // Check if the deletion targets the symbolic close of this block node
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + remainingToDelete &&
        $isParaLikeNode(currentNode)
      ) {
        // Deleting the symbolic close of a block node
        remainingToDelete -= 1;

        // Determine if this entire paragraph should be removed
        const currentChildrenLength = currentNode.getChildren().length;
        const hadChildren = childrenBefore.length > 0;
        const deletedAllContent = hadChildren && currentChildrenLength === 0;

        if (deletedAllContent) {
          // This paragraph had content that was entirely deleted, and now we're deleting its symbolic close
          // Remove the entire paragraph
          const parent = currentNode.getParent();
          const siblings = parent?.getChildren() ?? [];

          if (siblings.length > 1) {
            // There are other paragraphs, safe to remove this one
            currentNode.remove();

            logger?.debug(
              `Removed entire ParaNode that had all its content deleted at currentIndex: ${currentIndex}. ` +
                `Original targetIndex: ${targetIndex}, remainingToDelete: ${remainingToDelete}.`,
            );
          } else {
            // This is the only paragraph, replace with ImpliedParaNode instead of removing
            currentNode.replace($createImpliedParaNode(), true);

            logger?.debug(
              `Replaced last ParaNode with ImpliedParaNode at currentIndex: ${currentIndex}. ` +
                `Original targetIndex: ${targetIndex}, remainingToDelete: ${remainingToDelete}.`,
            );
          }
        } else if (remainingToDelete > 0) {
          // We're deleting the symbolic close and continuing to next content
          const nextSibling = currentNode.getNextSibling();
          if (nextSibling && $isSomeParaNode(nextSibling)) {
            // Standard merge logic: merge next paragraph into current one
            let tempCurrentIndex = currentIndex + 1;

            const nextChildren = nextSibling.getChildren();
            for (const nextChild of nextChildren) {
              if (remainingToDelete <= 0) break;

              const originalCurrentIndex = currentIndex;
              currentIndex = tempCurrentIndex;

              if ($traverseAndDelete(nextChild)) {
                currentIndex = originalCurrentIndex;
                break;
              }

              if ($isTextNode(nextChild)) {
                tempCurrentIndex += nextChild.getTextContentSize();
              } else if ($isEmbedNode(nextChild)) {
                tempCurrentIndex += 1;
              }

              currentIndex = originalCurrentIndex;
            }

            // Move remaining content from next paragraph to current paragraph
            const remainingNextChildren = nextSibling.getChildren();
            for (const remainingChild of remainingNextChildren) {
              remainingChild.remove();
              currentNode.append(remainingChild);
            }

            nextSibling.remove();

            logger?.debug(
              `Merged next paragraph into current one after deleting symbolic close at currentIndex: ${currentIndex}. ` +
                `Original targetIndex: ${targetIndex}, remainingToDelete: ${remainingToDelete}.`,
            );
          } else {
            // No next paragraph to merge, replace with ImpliedParaNode
            currentNode.replace($createImpliedParaNode(), true);
          }
        } else if ($isParaNode(currentNode)) {
          // Only deleting the symbolic close, replace with ImpliedParaNode
          currentNode.replace($createImpliedParaNode(), true);
        } else {
          currentNode.remove();
        }
      }
      currentIndex += 1;
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes that don't contribute to the OT length (like RootNode, CharNode)
      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToDelete <= 0) break;
        if ($traverseAndDelete(child)) {
          if (remainingToDelete <= 0) return true;
        }
      }
    }
    return remainingToDelete <= 0;
  }

  $traverseAndDelete(root);

  if (remainingToDelete > 0) {
    logger?.warn(
      `Delete operation could not remove all requested characters. Remaining to delete: ${
        remainingToDelete
      }. Original targetIndex: ${targetIndex}, OT length: ${otLength}. Final currentIndex: ${
        currentIndex
      }`,
    );
  }
}

/**
 * Inserts text or a CharNode at a given flat index in the document.
 * If attributes.char is present, a CharNode is created and inserted.
 * Otherwise, rich text is inserted, potentially with formatting attributes.
 * @param targetIndex - The index in the document's flat representation.
 * @param textToInsert - The string to insert.
 * @param attributes - Optional attributes for the insert operation.
 * @param logger - Logger to use, if any.
 * @returns The length to advance the currentIndex in $applyUpdate (1 for CharNode, text.length for
 *   text).
 */
function $insertTextAtCurrentIndex(
  targetIndex: number,
  textToInsert: string,
  attributes: AttributeMap | undefined,
  viewOptions: ViewOptions,
  logger: LoggerBasic | undefined,
): number {
  if (textToInsert === LF) {
    return $handleNewline(targetIndex, attributes, logger);
  } else if (textToInsert.endsWith(LF) && !hasParaAttributes(attributes)) {
    // Split the operation: insert text without LF, then handle the LF separately as an implied para
    const textWithoutLF = textToInsert.slice(0, -1);
    let deltaOTLength = 0;
    if (textWithoutLF.length > 0) {
      if (hasCharAttributes(attributes))
        throw new Error("Text + LF should not have char attributes");

      deltaOTLength += $insertRichText(targetIndex, textWithoutLF, attributes, logger);
    }
    deltaOTLength += $handleNewline(targetIndex + deltaOTLength, attributes, logger);
    return deltaOTLength;
  } else if (hasCharAttributes(attributes)) {
    return $handleCharText(targetIndex, textToInsert, attributes, viewOptions, logger);
  } else {
    return $insertRichText(targetIndex, textToInsert, attributes, logger);
  }
}

function $handleCharText(
  targetIndex: number,
  textToInsert: string,
  attributes: AttributeMapWithChar,
  viewOptions: ViewOptions,
  logger: LoggerBasic | undefined,
): number {
  logger?.debug(
    `Attempting to insert CharNode with text "${textToInsert}" and attributes ${JSON.stringify(
      attributes.char,
    )} at index ${targetIndex}`,
  );

  const textNode = $createTextNode(
    textToInsert === "" ? EMPTY_CHAR_PLACEHOLDER_TEXT : textToInsert,
  );
  // Apply other non-char attributes to the TextNode inside the CharNode if necessary.
  $applyTextAttributes(attributes, textNode);

  // Find parent CharNode at insertion point, if any
  let parentCharNode: CharNode | undefined;
  {
    // Traverse to find the parent node at the insertion point
    const root = $getRoot();
    let currentIndex = 0;
    function findParentCharNode(node: LexicalNode): boolean {
      if ($isTextNode(node)) {
        const textLength = node.getTextContentSize();
        if (targetIndex >= currentIndex && targetIndex < currentIndex + textLength) {
          const parent = node.getParent();
          if ($isCharNode(parent)) {
            parentCharNode = parent;
          }
          return true;
        }
        currentIndex += textLength;
      } else if ($isEmbedNode(node)) {
        currentIndex += 1;
      } else if ($isCharNode(node)) {
        // CharNodes don't contribute to OT length, but may contain text
        const children = node.getChildren();
        for (const child of children) {
          if (findParentCharNode(child)) return true;
        }
      } else if ($isElementNode(node)) {
        const children = node.getChildren();
        for (const child of children) {
          if (findParentCharNode(child)) return true;
        }
        if ($isParaLikeNode(node)) {
          currentIndex += 1;
        }
      }
      return false;
    }
    findParentCharNode(root);
  }

  // If inserting a nested char array, and parent matches the first char, skip nesting that one
  // If parent doesn't match, clear it so we insert as sibling instead
  let charAttr = attributes.char;
  if (Array.isArray(charAttr)) {
    if (parentCharNode) {
      const first = charAttr[0];
      if (first && $hasSameCharAttributes(first, parentCharNode)) {
        // Only nest the remaining char attributes
        charAttr = charAttr.slice(1);
        // If only one left, treat as single
        if (charAttr.length === 1) charAttr = charAttr[0];
        // Keep parentCharNode - we're nesting into it
      } else {
        // Parent doesn't match, don't use it
        parentCharNode = undefined;
      }
    }
  } else if (parentCharNode) {
    // Single char attribute - check if it matches parent
    if (!$hasSameCharAttributes(charAttr, parentCharNode)) {
      // Parent doesn't match, don't use it
      parentCharNode = undefined;
    }
  }
  const segment = typeof attributes.segment === "string" ? attributes.segment : undefined;
  const existingNodes = parentCharNode ? [parentCharNode] : undefined;
  const charNodes = $createNestedChars(charAttr, viewOptions, textNode, segment, existingNodes);

  // If charNodes is empty, it means we merged into existingNodes - no insertion needed
  if (charNodes.length === 0) {
    return textToInsert.length; // Successfully merged into existing CharNode
  }

  const charNode = charNodes.find($isCharNode);
  if (!charNode) {
    logger?.error(
      `CharNode style is missing for text "${textToInsert}". Attributes: ${JSON.stringify(
        attributes.char,
      )}. Falling back to rich text insertion.`,
    );
    // Fallback to rich text insertion
    return $insertRichText(targetIndex, textToInsert, undefined, logger);
  }

  // Set unknownAttributes for non-char, non-segment attributes
  const unknownAttributes: { [attributeName: string]: string } = {};
  for (const [key, value] of Object.entries(attributes)) {
    if (key !== "char" && key !== "segment" && typeof value === "string") {
      unknownAttributes[key] = value;
    }
  }
  if (Object.keys(unknownAttributes).length > 0) {
    charNode.setUnknownAttributes(unknownAttributes);
  }

  // Insert all nodes (might include markers) at the target position
  let allInserted = true;
  for (const node of charNodes) {
    if (!$insertNodeAtCharacterOffset(targetIndex, node, logger)) {
      allInserted = false;
      break;
    }
    // Only advance index for non-marker nodes (markers don't contribute to OT length)
    // CharNodes themselves don't contribute, only their text content does
  }

  if (allInserted) {
    return textToInsert.length; // CharNode itself has no OT length, just its text content
  } else {
    logger?.error(
      `Failed to insert CharNode with text "${textToInsert}" at index ${
        targetIndex
      }. Falling back to rich text.`,
    );
    // Fallback to rich text insertion if CharNode insertion fails
    return $insertRichText(targetIndex, textToInsert, undefined, logger);
  }
}

/**
 * Helper to insert rich text, i.e. potentially with formatting or other attributes.
 * This function contains the core logic for text node insertion and splitting.
 * @returns The length of the inserted text.
 */
function $insertRichText(
  targetIndex: number,
  textToInsert: string,
  attributes: AttributeMap | undefined,
  logger: LoggerBasic | undefined,
): number {
  if (textToInsert.length <= 0) {
    logger?.debug("Attempted to insert empty string. No action taken.");
    return 0;
  }

  const root = $getRoot();
  let currentIndex = 0;
  let insertionPointFound = false;

  function $findAndInsertRecursive(currentNode: LexicalNode): boolean {
    if (insertionPointFound) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if targetIndex is within this TextNode's range
      if (targetIndex >= currentIndex && targetIndex <= currentIndex + textLength) {
        const offsetInNode = targetIndex - currentIndex;
        const newTextNode = $createTextNode(textToInsert);
        $applyTextAttributes(attributes, newTextNode);

        if (offsetInNode === 0) {
          currentNode.insertBefore(newTextNode);
        } else if (offsetInNode === textLength) {
          // Special case: if this TextNode is inside a CharNode and we're inserting plain text at the end,
          // check if we should insert after the CharNode instead of inside it
          const parent = currentNode.getParent();
          if ($isCharNode(parent) && !hasCharAttributes(attributes)) {
            // Plain text (no char attributes) should not be inserted inside CharNodes
            // Instead, insert after the CharNode at the parent level
            parent.insertAfter(newTextNode);
          } else {
            // Normal case: insert after this TextNode
            currentNode.insertAfter(newTextNode);
          }
        } else {
          const [, tailNode] = currentNode.splitText(offsetInNode);
          tailNode.insertBefore(newTextNode);
        }
        logger?.debug(
          `Inserted text "${textToInsert}" in/around TextNode ` +
            `(key: ${currentNode.getKey()}) at nodeOffset ${offsetInNode}. Original targetIndex: ${
              targetIndex
            }, currentIndex at node start: ${currentIndex}.`,
        );
        insertionPointFound = true;
        return true;
      }
      currentIndex += textLength;
    } else if ($isEmbedNode(currentNode)) {
      // If targetIndex is exactly at currentIndex, means insert *before* this embed node.
      // This function is for rich text; inserting before/after embed nodes usually involves
      // $insertNodeAtCharacterOffset or ensuring a Para wrapper.
      // For now, just advance offset.
      if (targetIndex === currentIndex && !insertionPointFound) {
        // Potentially insert into a new para before this node if context allows,
        // or let caller handle creating appropriate structure.
        // This function's primary goal is inserting into existing text-compatible locations.
      }
      currentIndex += 1;
    } else if ($isCharNode(currentNode)) {
      // CharNodes don't contribute to OT length, they're just formatted text containers
      const offsetAtCharNodeStart = currentIndex;

      // Try inserting at the beginning of the CharNode's content
      if (!insertionPointFound && targetIndex === offsetAtCharNodeStart) {
        // This implies inserting as the first child inside the CharNode
        const newTextNode = $createTextNode(textToInsert);
        $applyTextAttributes(attributes, newTextNode);
        const firstChild = currentNode.getFirstChild();
        if (firstChild) {
          firstChild.insertBefore(newTextNode);
        } else {
          currentNode.append(newTextNode);
        }
        logger?.debug(
          `Inserted text "${textToInsert}" at beginning of CharNode ` +
            `${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }
      // No OT length contribution for CharNodes themselves

      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true;
        if (insertionPointFound) break;
      }
      // Try appending to the CharNode if targetIndex matches after children
      if (!insertionPointFound && targetIndex === currentIndex) {
        const newTextNode = $createTextNode(textToInsert);
        $applyTextAttributes(attributes, newTextNode);
        currentNode.append(newTextNode);
        logger?.debug(
          `Appended text "${textToInsert}" to end of CharNode ` +
            `${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }
    } else if ($isParaLikeNode(currentNode)) {
      const offsetAtParaStart = currentIndex;
      // Try inserting at the beginning of the block node
      if (!insertionPointFound && targetIndex === offsetAtParaStart) {
        const newTextNode = $createTextNode(textToInsert);
        $applyTextAttributes(attributes, newTextNode);
        const firstChild = currentNode.getFirstChild();
        if (firstChild) {
          firstChild.insertBefore(newTextNode);
        } else {
          currentNode.append(newTextNode);
        }
        logger?.debug(
          `Inserted text "${textToInsert}" at beginning of container ` +
            `${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }

      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true;
        if (insertionPointFound) break;
      }

      // After children, currentIndex is at the end of the *content* of the ParaNode.
      // Try appending text if targetIndex matches (before para's own closing marker)
      if (!insertionPointFound && targetIndex === currentIndex) {
        const newTextNode = $createTextNode(textToInsert);
        $applyTextAttributes(attributes, newTextNode);
        currentNode.append(newTextNode);
        logger?.debug(
          `Appended text "${textToInsert}" to end of container ` +
            `${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }
      // After children and potential append, account for ParaNode's closing marker.
      currentIndex += 1;
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes (e.g. RootNode)
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true;
        if (insertionPointFound) break;
      }
    }
    return insertionPointFound;
  }

  $findAndInsertRecursive(root);

  if (!insertionPointFound && targetIndex === currentIndex) {
    logger?.debug(
      `Insertion point matches end of document (targetIndex: ${
        targetIndex
      }, final currentIndex: ${currentIndex}). Appending text to new ParaNode.`,
    );
    const newTextNode = $createTextNode(textToInsert);
    $applyTextAttributes(attributes, newTextNode);
    const newParaNode = $createImpliedParaNode().append(newTextNode);
    root.append(newParaNode);
    insertionPointFound = true;
  }

  if (!insertionPointFound) {
    logger?.warn(
      `$insertRichText: Could not find insertion point for text "${
        textToInsert
      }" at targetIndex ${targetIndex}. Final currentIndex: ${currentIndex}. Text not inserted.`,
    );
    return 0; // Text not inserted
  }
  return textToInsert.length;
}

/**
 * Inserts a pre-constructed LexicalNode at a given character-based flat index in the document.
 * This is a complex operation that needs to correctly find the text-based offset.
 * @param targetIndex - The character offset in the document's flat text representation.
 * @param nodeToInsert - The LexicalNode to insert (e.g., a CharNode).
 * @param logger - Logger to use, if any.
 * @returns `true` if the node was successfully inserted, `false` otherwise.
 */
function $insertNodeAtCharacterOffset(
  targetIndex: number,
  nodeToInsert: LexicalNode,
  logger: LoggerBasic | undefined,
): boolean {
  const root = $getRoot();
  /** Tracks the current OT position during traversal */
  let currentIndex = 0;
  let wasInserted = false;

  function $traverseAndInsertRecursive(currentNode: LexicalNode): boolean {
    if (wasInserted) return true;

    // Handle insertion at the beginning of the document or into an empty root.
    if (currentNode === root && targetIndex === 0) {
      const firstChild = root.getFirstChild();
      if (!firstChild) {
        // Root is empty
        if (nodeToInsert.isInline()) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserting inline node ` +
              `${nodeToInsert.getType()} into empty root, wrapped in ImpliedParaNode. ` +
              `targetIndex: ${targetIndex}`,
          );
          root.append($createImpliedParaNode().append(nodeToInsert));
        } else {
          // Block node, insert directly into root
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserting block node ` +
              `${nodeToInsert.getType()} directly into empty root. targetIndex: ${targetIndex}`,
          );
          root.append(nodeToInsert);
        }
        wasInserted = true;
        return true;
      }
      // If root is not empty, the loop below will handle inserting before the first child.
    }

    if (!$isElementNode(currentNode)) {
      return false; // Should not happen if called with ElementNode initially
    }

    const children = currentNode.getChildren();
    for (const child of children) {
      // Case 1: Insert *before* the current child
      if (targetIndex === currentIndex && !wasInserted) {
        // Check if we're inserting an inline node directly into the root
        if (currentNode === root && nodeToInsert.isInline()) {
          // If the child we're inserting before is a para-like node, insert into it
          if ($isSomeParaNode(child)) {
            logger?.debug(
              `$insertNodeAtCharacterOffset: Inserting inline node ` +
                `${nodeToInsert.getType()} into existing ${child.getType()} at beginning. ` +
                `targetIndex: ${targetIndex}`,
            );
            // Insert at the beginning of the para by appending to the beginning
            const firstChildOfPara = child.getFirstChild();
            if (firstChildOfPara) {
              firstChildOfPara.insertBefore(nodeToInsert);
            } else {
              child.append(nodeToInsert);
            }
          } else {
            logger?.debug(
              `$insertNodeAtCharacterOffset: Inserting inline node ` +
                `${nodeToInsert.getType()} into root before ${child.getType()}, wrapping in ` +
                `ImpliedParaNode. targetIndex: ${targetIndex}`,
            );
            child.insertBefore($createImpliedParaNode().append(nodeToInsert));
          }
        } else {
          child.insertBefore(nodeToInsert);
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserted node ${nodeToInsert.getType()} ` +
              `(key: ${nodeToInsert.getKey()}) before child ${child.getType()} ` +
              `(key: ${child.getKey()}) in ${currentNode.getType()} ` +
              `(key: ${currentNode.getKey()}). targetIndex: ${targetIndex}, currentIndex: ${
                currentIndex
              }`,
          );
        }
        wasInserted = true;
        return true;
      }

      // Case 2: Process current `child` to advance `currentIndex` or insert within/after it.
      if ($isTextNode(child)) {
        const textLength = child.getTextContentSize();
        // Case 2a: Insert *within* this TextNode
        if (!wasInserted && targetIndex > currentIndex && targetIndex < currentIndex + textLength) {
          const splitOffset = targetIndex - currentIndex;
          const [headNode] = child.splitText(splitOffset);
          headNode.insertAfter(nodeToInsert);
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserted node ${nodeToInsert.getType()} ` +
              `(key: ${nodeToInsert.getKey()}) by splitting TextNode (key: ${child.getKey()}) ` +
              `at offset ${splitOffset}. targetIndex: ${targetIndex}, currentIndex at node start: ${
                currentIndex
              }`,
          );
          wasInserted = true;
          return true;
        }
        currentIndex += textLength;
      } else if ($isEmbedNode(child)) {
        currentIndex += 1;
      } else if ($isCharNode(child)) {
        // CharNodes don't contribute to OT length, they're just formatted text containers
        // No OT length contribution for the CharNode itself
        if ($traverseAndInsertRecursive(child)) return true;
        // currentIndex is now after child's content and its own recursive calls
      } else if ($isParaLikeNode(child)) {
        const paraLikeChild = child;
        // currentIndex is currently at the START of paraLikeChild's content area (or its embed
        // point if empty)
        if ($traverseAndInsertRecursive(paraLikeChild)) return true;

        // If not inserted inside, `currentIndex` is now at the end of `paraLikeChild`'s content.
        const otIndexForParaChildClosingMarker = currentIndex;

        // Check for replacement: if inserting a block node at the closing marker of an
        // ImpliedParaNode
        if (
          $isImpliedParaNode(paraLikeChild) &&
          $isParaLikeNode(nodeToInsert) &&
          // Target is at the ImpliedPara's implicit newline
          targetIndex === otIndexForParaChildClosingMarker &&
          !wasInserted // Ensure we haven't already inserted elsewhere
        ) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Replacing ImpliedParaNode ` +
              `(key: ${paraLikeChild.getKey()}) with block node '${nodeToInsert.getType()}' ` +
              `(key: ${nodeToInsert.getKey()}) at OT index ${targetIndex}.`,
          );
          child.replace(nodeToInsert, true);

          // The replacement block node also has a closing marker.
          // currentIndex was at otIndexForParaChildClosingMarker (end of content).
          // Now, advance by 1 for the new block node's closing marker.
          currentIndex = otIndexForParaChildClosingMarker + 1;
          wasInserted = true;
          return true;
        }
        // If not replaced, add 1 for the original paraLikeChild's closing marker.
        currentIndex += 1;
      } else if ($isElementNode(child)) {
        // Other ElementNode children (e.g. custom, or nested root-like)
        if ($traverseAndInsertRecursive(child)) return true; // Recurse
      }
      // Else: other node types (LineBreakNode, DecoratorNode) - typically 0 OT length or handled by
      // Lexical.

      if (wasInserted) return true;
    } // End for loop over children

    // After iterating all children of `currentNode`, `currentIndex` reflects the OT position
    // *after* `currentNode`'s content and its children's closing markers.
    // This means `targetIndex === currentIndex` implies appending to `currentNode` or inserting
    // after it if `currentNode` is not root. For out-of-bounds cases where
    // `targetIndex > currentIndex`, we also handle appending to root.

    if (
      $isElementNode(currentNode) &&
      !wasInserted &&
      (targetIndex === currentIndex || (currentNode === root && targetIndex > currentIndex))
    ) {
      if (currentNode === root) {
        // Appending to the root. currentIndex is total document OT length (or targetIndex is beyond
        // document end).
        if (nodeToInsert.isInline()) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Appending inline node ` +
              `${nodeToInsert.getType()} to root. Wrapping in new ImpliedParaNode. targetIndex: ${
                targetIndex
              }, current document OT length: ${currentIndex}.`,
          );
          root.append($createImpliedParaNode().append(nodeToInsert));
        } else {
          // nodeToInsert is block
          logger?.debug(
            `$insertNodeAtCharacterOffset: Appending block node ${nodeToInsert.getType()} to ` +
              `root. targetIndex: ${targetIndex}, current document OT length: ${currentIndex}.`,
          );
          root.append(nodeToInsert);
        }
        wasInserted = true;
        return true;
      } else if (
        // Appending to an existing container (ParaNode, ImpliedParaNode)
        // currentNode here is the container itself. currentIndex is at the point of currentNode's
        // closing marker. targetIndex === currentIndex means we are inserting at the conceptual end
        // of this container.
        $isSomeParaNode(currentNode)
      ) {
        // If trying to insert a ParaNode at the closing marker of an ImpliedParaNode (this
        // container)
        if (
          $isImpliedParaNode(currentNode) &&
          $isParaNode(nodeToInsert) &&
          targetIndex === currentIndex
        ) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Replacing ImpliedParaNode container ` +
              `(key: ${currentNode.getKey()}) with ParaNode ${nodeToInsert.getType()} ` +
              `(key: ${nodeToInsert.getKey()}) via append logic. targetIndex: ${targetIndex}`,
          );
          currentNode.replace(nodeToInsert, true);
          // currentIndex remains correct relative to the start of this operation for the calling
          // $applyUpdate
          wasInserted = true;
          return true;
        } else if (nodeToInsert.isInline() || !$isSomeParaNode(nodeToInsert)) {
          // Append inline content, or non-para block content, into the container
          logger?.debug(
            `$insertNodeAtCharacterOffset: Appending node ${nodeToInsert.getType()} to existing ` +
              `container ${currentNode.getType()} (key: ${currentNode.getKey()}). targetIndex: ${
                targetIndex
              }, container end OT index: ${currentIndex}.`,
          );
          currentNode.append(nodeToInsert);
          wasInserted = true;
          return true;
        } else {
          // Block node trying to append to a non-root container, insert *after* the container
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserting block node ${nodeToInsert.getType()} after ` +
              `container ${currentNode.getType()} (key: ${currentNode.getKey()}). targetIndex: ${
                targetIndex
              }, container end OT index: ${currentIndex}.`,
          );
          currentNode.insertAfter(nodeToInsert);
          wasInserted = true;
          return true;
        }
      } else {
        // Generic element, try to append, or insert after if block
        // Special case: When at the end of a CharNode, insert after it as a sibling
        // (nested CharNodes are handled elsewhere via $createNestedChars merging logic)
        if ($isCharNode(currentNode)) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserting node ${nodeToInsert.getType()} after ` +
              `CharNode (key: ${currentNode.getKey()}). targetIndex: ${
                targetIndex
              }, element end OT index: ${currentIndex}.`,
          );
          currentNode.insertAfter(nodeToInsert);
        } else if (nodeToInsert.isInline() || !$isSomeParaNode(nodeToInsert)) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Appending node ${nodeToInsert.getType()} to generic ` +
              `element ${currentNode.getType()} (key: ${currentNode.getKey()}). targetIndex: ${
                targetIndex
              }, element end OT index: ${currentIndex}.`,
          );
          currentNode.append(nodeToInsert);
        } else {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Inserting block node ${nodeToInsert.getType()} after ` +
              `generic element ${currentNode.getType()} (key: ${currentNode.getKey()}). ` +
              `targetIndex: ${targetIndex}, element end OT index: ${currentIndex}.`,
          );
          currentNode.insertAfter(nodeToInsert);
        }
        wasInserted = true;
        return true;
      }
    }
    return wasInserted;
  }

  $traverseAndInsertRecursive(root);

  if (!wasInserted) {
    logger?.warn(
      "$insertNodeAtCharacterOffset: Could not find insertion point for node " +
        `${nodeToInsert.getType()} (key: ${nodeToInsert.getKey()}) at targetIndex ${
          targetIndex
        }. Final currentIndex: ${currentIndex}. Node not inserted.`,
    );
  }
  return wasInserted;
}

function $insertEmbedAtCurrentIndex(
  targetIndex: number,
  op: DeltaOp,
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): boolean {
  let newNodeToInsert: LexicalNode | undefined;

  // Determine the LexicalNode to create based on the embedObject structure
  if (isInsertEmbedOpOfType("chapter", op)) {
    newNodeToInsert = $createChapter(op.insert.chapter, viewOptions);
  } else if (isInsertEmbedOpOfType("verse", op)) {
    newNodeToInsert = $createVerse(op.insert.verse, viewOptions);
  } else if (isInsertEmbedOpOfType("ms", op)) {
    newNodeToInsert = $createMilestone(op.insert.ms);
  } else if (isInsertEmbedOpOfType("note", op)) {
    newNodeToInsert = $createNote(op, viewOptions, nodeOptions, logger);
  } else if (isInsertEmbedOpOfType("unknown", op)) {
    newNodeToInsert = $createUnknown(op, viewOptions, nodeOptions, logger);
  } else if (isInsertEmbedOpOfType("unmatched", op)) {
    newNodeToInsert = $createImmutableUnmatched(op.insert.unmatched);
  }
  // While it would be technically and structurally possible to add a ParaNode here, it's not the
  // way Quill (and therefore flat rich-text docs) handles paragraphs which is always by inserting a
  // newline (LF) character with a `para` attribute.

  if (!newNodeToInsert) {
    logger?.error(
      `$insertEmbedAtCurrentIndex: Cannot create LexicalNode for embed object: ${JSON.stringify(
        op.insert,
      )}`,
    );
    return false;
  }

  return $insertNodeAtCharacterOffset(targetIndex, newNodeToInsert, logger);
}

/**
 * Handles inserting a newline (LF) character.
 * This can replace an ImpliedParaNode with a ParaNode or BookNode, or split a regular ParaNode
 * if the para attributes differ from the containing paragraph.
 * When there are no attributes it splits a regular ParaNode into an ImpliedParaNode for the first
 * part and keeps the second part as a ParaNode.
 * @param targetIndex - The index in the document's flat representation.
 * @param attributes - The attributes to use for creating the ParaNode or BookNode.
 * @param logger - Logger to use, if any.
 * @returns Always returns 1 (the LF character's OT length).
 */
function $handleNewline(
  targetIndex: number,
  attributes: AttributeMap | undefined,
  logger: LoggerBasic | undefined,
): number {
  let _newBlockNode: ParaNode | BookNode | ImpliedParaNode | undefined;
  if (hasParaAttributes(attributes)) {
    _newBlockNode = $createPara(attributes.para);
  } else if (hasBookAttributes(attributes)) {
    const attributesWithBook: AttributeMapWithBook = attributes;
    _newBlockNode = $createBook(attributesWithBook.book);
  }
  _newBlockNode ??= $createImpliedParaNode();
  const newBlockNode = _newBlockNode;
  const isNewParaNode = $isParaNode(newBlockNode);
  const isNewImpliedParaNode = $isImpliedParaNode(newBlockNode);
  let currentIndex = 0;
  let foundTargetBlock = false;

  function $traverseAndHandleNewline(currentNode: LexicalNode): boolean {
    if (foundTargetBlock) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if targetIndex is within this text node
      if (targetIndex >= currentIndex && targetIndex <= currentIndex + textLength) {
        // Split is happening within a text node - need to check if we're in a ParaNode
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara) && (isNewParaNode || isNewImpliedParaNode)) {
          // LF with attributes should ALWAYS split a regular ParaNode
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) with LF attributes at ` +
              `targetIndex ${targetIndex}`,
          );

          // Split the text node at the target position
          const splitOffset = targetIndex - currentIndex;
          const [headNode] = splitOffset > 0 ? currentNode.splitText(splitOffset) : [undefined];

          // Move all content before the split to the new ParaNode
          let prevSibling = headNode?.getPreviousSibling();
          while (prevSibling) {
            const siblingToMove = prevSibling;
            prevSibling = prevSibling.getPreviousSibling();
            const firstChild = newBlockNode.getFirstChild();
            if (firstChild) {
              firstChild.insertBefore(siblingToMove);
            } else {
              newBlockNode.append(siblingToMove);
            }
          }

          if (headNode) newBlockNode.append(headNode);

          // Insert the new paragraph before the existing one
          parentPara.insertBefore(newBlockNode);

          foundTargetBlock = true;
          return true;
        }
      }
      currentIndex += textLength;
    } else if ($isEmbedNode(currentNode)) {
      currentIndex += 1;
    } else if ($isParaLikeNode(currentNode)) {
      // First, process children to find current position
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetBlock) break;
      }

      // currentIndex is now at the end of this para's content
      // Check if targetIndex matches the para's closing marker position
      if (targetIndex === currentIndex) {
        if ($isImpliedParaNode(currentNode) && newBlockNode) {
          logger?.debug(
            `Replacing ImpliedParaNode (key: ${currentNode.getKey()}) with ParaNode at ` +
              `targetIndex ${targetIndex}`,
          );

          // Replace the ImpliedParaNode with the new block node
          currentNode.replace(newBlockNode, true);
          foundTargetBlock = true;
          return true;
        } else if ($isParaNode(currentNode) && newBlockNode) {
          const paraNode: ParaNode = currentNode;
          // LF with attributes should ALWAYS create a new block node after regular ParaNode
          logger?.debug(
            "Creating new block node with LF attributes after existing ParaNode " +
              `(marker: ${paraNode.getMarker()}) at targetIndex ${targetIndex}`,
          );

          // Insert the new block node with LF attributes after the current one
          paraNode.insertAfter(newBlockNode);

          foundTargetBlock = true;
          return true;
        }
      }

      // Advance by 1 for the para's closing marker
      currentIndex += 1;

      // Check if targetIndex matches the position after this para (for inserting after the para)
      if (targetIndex === currentIndex) {
        if ($isParaNode(currentNode) && newBlockNode) {
          // LF with attributes should create a new block node after this ParaNode
          logger?.debug(
            `Creating new block node after existing ParaNode (marker: ${currentNode.getMarker()}) ` +
              `at targetIndex ${targetIndex}`,
          );

          // Insert the new block node with LF attributes after the current one
          currentNode.insertAfter(newBlockNode);

          foundTargetBlock = true;
          return true;
        }
      }
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes that don't contribute to the OT length (like RootNode, CharNode)
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetBlock) break;
      }
    }

    return foundTargetBlock;
  }

  $traverseAndHandleNewline($getRoot());

  if (!foundTargetBlock) {
    logger?.warn(
      `Could not find location to handle newline with para attributes at targetIndex ${
        targetIndex
      }. Final currentIndex: ${currentIndex}.`,
    );
  }

  return 1; // LF always contributes 1 to the OT index
}

function $createBook(bookAttributes: OTBookAttribute) {
  const { style, code } = bookAttributes;
  if (!style || style !== BOOK_MARKER || !code || !BookNode.isValidBookCode(code)) return;

  const unknownAttributes = getUnknownAttributes(bookAttributes, OT_BOOK_PROPS);
  return $createBookNode(code, unknownAttributes);
}

function $createPara(paraAttributes: OTParaAttribute) {
  const { style } = paraAttributes;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(paraAttributes, OT_PARA_PROPS);
  return $createParaNode(style, unknownAttributes);
}

function $createChapter(chapterData: OTChapterEmbed | null, viewOptions: ViewOptions) {
  if (!chapterData) return;

  const { number, sid, altnumber, pubnumber } = chapterData;
  if (!number) return;

  const unknownAttributes = getUnknownAttributes(chapterData, OT_CHAPTER_PROPS);
  let newNodeToInsert: SomeChapterNode;
  if (viewOptions.markerMode === "editable") {
    newNodeToInsert = $createChapterNode(number, sid, altnumber, pubnumber, unknownAttributes);
  } else {
    const showMarker = viewOptions.markerMode === "visible";
    newNodeToInsert = $createImmutableChapterNode(
      number,
      showMarker,
      sid,
      altnumber,
      pubnumber,
      unknownAttributes,
    );
  }
  return newNodeToInsert;
}

function $createVerse(verseData: OTVerseEmbed | null, viewOptions: ViewOptions) {
  if (!verseData) return;

  const { style, number, sid, altnumber, pubnumber } = verseData;
  if (!number) return;

  const unknownAttributes = getUnknownAttributes(verseData, OT_VERSE_PROPS);
  let newNodeToInsert: SomeVerseNode;
  if (viewOptions.markerMode === "editable") {
    if (!style) return;

    const text = getVisibleOpenMarkerText(style, number);
    newNodeToInsert = $createVerseNode(number, text, sid, altnumber, pubnumber, unknownAttributes);
  } else {
    const showMarker = viewOptions.markerMode === "visible";
    newNodeToInsert = $createImmutableVerseNode(
      number,
      showMarker,
      sid,
      altnumber,
      pubnumber,
      unknownAttributes,
    );
  }
  return newNodeToInsert;
}

function $createMilestone(msData: OTMilestoneEmbed | null) {
  if (!msData) return;

  const { style, sid, eid } = msData;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(msData, OT_MILESTONE_PROPS);
  return $createMilestoneNode(style, sid, eid, unknownAttributes);
}

function $createNote(
  op: DeltaOpInsertNoteEmbed,
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
) {
  const noteEmbed = op.insert;
  if (!noteEmbed.note) return;

  const { style, caller, category, contents } = noteEmbed.note;
  if (!style || caller == null) return;

  if (caller === "") logger?.warn("Note has empty caller. Only use for note editing.");

  const unknownAttributes = getUnknownAttributes(noteEmbed.note, OT_NOTE_PROPS);

  const segment = op.attributes?.segment;
  let nodeSegment: string | undefined;
  if (segment && typeof segment === "string") nodeSegment = segment;

  const contentNodes: LexicalNode[] = [];
  for (const childOp of contents?.ops ?? []) {
    if (typeof childOp.insert !== "string") continue;
    if (hasCharAttributes(childOp.attributes)) {
      const charNodes = $createNestedChars(
        childOp.attributes.char,
        viewOptions,
        $createTextNode(childOp.insert),
        undefined,
        contentNodes,
      );
      contentNodes.push(...charNodes);
    } else {
      contentNodes.push($createTextNode(childOp.insert));
    }
  }

  const note = $createWholeNote(style, caller, contentNodes, viewOptions, nodeOptions, nodeSegment)
    .setCategory(category)
    .setUnknownAttributes(unknownAttributes);

  return note;
}

function $createUnknown(
  op: DeltaOp & { insert: { unknown: OTUnknownEmbed | null } },
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): LexicalNode | undefined {
  const unknownData = op.insert.unknown;
  if (!unknownData) return;

  const { tag, marker, contents } = unknownData;
  if (!tag) return;

  const unknownAttributes = getUnknownAttributes(unknownData, OT_UNKNOWN_PROPS);
  const unknownNode = $createUnknownNode(tag, marker, unknownAttributes);

  const childOps = contents?.ops ?? [];
  if (childOps.length > 0) {
    const childNodes = $createInlineNodesFromOps(childOps, viewOptions, nodeOptions, logger);
    childNodes.forEach((child) => unknownNode.append(child));
  }

  const segment = op.attributes?.segment;
  if (typeof segment === "string") $setState(unknownNode, segmentState, () => segment);

  return unknownNode;
}

function $createInlineNodesFromOps(
  ops: DeltaOp[],
  viewOptions: ViewOptions,
  nodeOptions: UsjNodeOptions,
  logger: LoggerBasic | undefined,
): LexicalNode[] {
  const nodes: LexicalNode[] = [];

  for (const childOp of ops) {
    if (typeof childOp.insert === "string") {
      if (hasCharAttributes(childOp.attributes)) {
        const textNode = $createTextNode(childOp.insert);
        const charNodes = $createNestedChars(
          childOp.attributes.char,
          viewOptions,
          textNode,
          undefined,
          nodes,
        );
        nodes.push(...charNodes);
      } else {
        nodes.push($createTextNode(childOp.insert));
      }
      continue;
    }

    if (!childOp.insert || typeof childOp.insert !== "object") continue;

    if (isInsertEmbedOpOfType("unknown", childOp)) {
      const nestedUnknown = $createUnknown(childOp, viewOptions, nodeOptions, logger);
      if (nestedUnknown) nodes.push(nestedUnknown);
      continue;
    }

    if (isInsertEmbedOpOfType("note", childOp)) {
      const nestedNote = $createNote(childOp, viewOptions, nodeOptions, logger);
      if (nestedNote) nodes.push(nestedNote);
      continue;
    }

    logger?.warn(
      `$createInlineNodesFromOps: Unsupported embed inside unknown contents: ${JSON.stringify(
        childOp.insert,
      )}`,
    );
  }

  return nodes;
}

function $createImmutableUnmatched(unmatchedData: OTUnmatchedEmbed | null) {
  if (!unmatchedData) return;

  const { marker } = unmatchedData;
  if (!marker) return;

  return $createImmutableUnmatchedNode(marker);
}

// Helper to create nested CharNodes from OTCharAttribute (array or single)
// Returns an array of nodes: [opening marker?, CharNode, closing marker?]
// If existingNodes is provided, will merge with the last CharNode if style/cid match
function $createNestedChars(
  charAttr: OTCharAttribute,
  viewOptions: ViewOptions,
  innerNode?: LexicalNode,
  segment?: string,
  existingNodes?: LexicalNode[],
): LexicalNode[] {
  if ($isTextNode(innerNode) && innerNode.getTextContentSize() === 0) {
    innerNode.setTextContent(EMPTY_CHAR_PLACEHOLDER_TEXT);
  }
  if (Array.isArray(charAttr)) {
    if (charAttr.length === 0) throw new Error("Empty charAttr array");

    // Check if we can merge with existing CharNode
    const outerAttr = charAttr[0];
    const lastNode = existingNodes?.[existingNodes.length - 1];
    if ($isCharNode(lastNode) && $hasSameCharAttributes(outerAttr, lastNode)) {
      // Merge into existing CharNode by creating inner nodes only
      if (charAttr.length > 1) {
        const innerCharNodes = $createNestedChars(charAttr.slice(1), viewOptions, innerNode);
        innerCharNodes.forEach((node) => lastNode.append(node));
      } else {
        // Just append the innerNode
        if (innerNode) lastNode.append(innerNode);
      }
      return []; // Return empty array since we merged into existing node
    }

    // Build nested CharNodes from innermost to outermost using reduceRight
    // At each level, we add markers as children if needed
    const outermostCharNode = charAttr.reduceRight((child, attr, idx) => {
      const charNode = $createCharNode(attr.style, getUnknownAttributes(attr, OT_CHAR_PROPS));
      if (typeof attr.cid === "string") $setState(charNode, charIdState, () => attr.cid);
      if (segment && idx === charAttr.length - 1) $setState(charNode, segmentState, () => segment);

      // If there's a child, append it (with markers if it's a CharNode)
      if (child) {
        // If the child is a CharNode, it needs markers around it
        if ($isCharNode(child)) {
          // The child was created from attr at idx+1, so get its marker
          const childMarker = child.getMarker();
          const childMarkers: LexicalNode[] = [];
          $addOpeningMarker(childMarker, childMarkers, viewOptions);
          childMarkers.forEach((marker) => charNode.append(marker));

          charNode.append(child);

          const closingMarkers: LexicalNode[] = [];
          $addClosingMarker(childMarker, closingMarkers, viewOptions);
          closingMarkers.forEach((marker) => charNode.append(marker));
        } else {
          // Just append the child (it's the innermost text node)
          charNode.append(child);
        }
      }

      return charNode;
    }, innerNode) as CharNode;

    // Add markers inside the outermost CharNode (as children)
    const outermostAttr = charAttr[0];
    $addOpeningMarker(outermostAttr.style, outermostCharNode, viewOptions);
    $addClosingMarker(outermostAttr.style, outermostCharNode, viewOptions);

    return [outermostCharNode];
  } else {
    // Single char attribute
    // Check if we can merge with existing CharNode
    const lastNode = existingNodes?.[existingNodes.length - 1];
    if ($isCharNode(lastNode) && $hasSameCharAttributes(charAttr, lastNode)) {
      // Merge into existing CharNode
      if (innerNode) lastNode.append(innerNode);
      return []; // Return empty array since we merged into existing node
    }

    const charNode = $createCharNode(charAttr.style, getUnknownAttributes(charAttr, OT_CHAR_PROPS));
    if (typeof charAttr.cid === "string") $setState(charNode, charIdState, () => charAttr.cid);
    if (segment) $setState(charNode, segmentState, () => segment);
    if (innerNode) charNode.append(innerNode);

    // Add markers inside the CharNode (as children)
    $addOpeningMarker(charAttr.style, charNode, viewOptions);
    $addClosingMarker(charAttr.style, charNode, viewOptions);

    return [charNode];
  }
}

function $addOpeningMarker(
  marker: string,
  target: LexicalNode[] | CharNode,
  viewOptions: ViewOptions,
) {
  let markerNode: LexicalNode | undefined;
  if (viewOptions?.markerMode === "editable") {
    markerNode = $createMarkerNode(marker);
  } else if (viewOptions?.markerMode === "visible") {
    markerNode = $createImmutableTypedTextNode("marker", openingMarkerText(marker));
  }

  if (markerNode) {
    if (Array.isArray(target)) {
      target.push(markerNode);
    } else {
      // Prepend to CharNode children
      const firstChild = target.getFirstChild();
      if (firstChild) {
        firstChild.insertBefore(markerNode);
      } else {
        target.append(markerNode);
      }
    }
  }
}

function $addClosingMarker(
  marker: string,
  target: LexicalNode[] | CharNode,
  viewOptions: ViewOptions,
  isSelfClosing = false,
) {
  if (CharNode.isValidFootnoteMarker(marker) || CharNode.isValidCrossReferenceMarker(marker))
    return;

  let markerNode: LexicalNode | undefined;
  if (viewOptions?.markerMode === "editable") {
    if (isSelfClosing) markerNode = $createMarkerNode("", "selfClosing");
    else markerNode = $createMarkerNode(marker, "closing");
  } else if (viewOptions?.markerMode === "visible") {
    markerNode = $createImmutableTypedTextNode(
      "marker",
      closingMarkerText(isSelfClosing ? "" : marker),
    );
  }

  if (markerNode) {
    if (Array.isArray(target)) {
      target.push(markerNode);
    } else {
      // Append to CharNode children
      target.append(markerNode);
    }
  }
}

/** Type guard for Book attributes. */
function hasBookAttributes(
  attributes: AttributeMap | undefined,
): attributes is AttributeMapWithBook {
  return (
    !!attributes &&
    !!attributes.book &&
    typeof attributes.book === "object" &&
    attributes.book !== null &&
    "style" in attributes.book &&
    typeof attributes.book.style === "string" &&
    "code" in attributes.book &&
    typeof attributes.book.code === "string"
  );
}

/** Type guard for Para attributes. */
function hasParaAttributes(
  attributes: AttributeMap | undefined,
): attributes is AttributeMapWithPara {
  return (
    !!attributes &&
    !!attributes.para &&
    typeof attributes.para === "object" &&
    attributes.para !== null &&
    "style" in attributes.para &&
    typeof attributes.para.style === "string"
  );
}

/** Type guard for Char attributes. */
function hasCharAttributes(
  attributes: AttributeMap | undefined,
): attributes is AttributeMapWithChar {
  return (
    !!attributes &&
    !!attributes.char &&
    typeof attributes.char === "object" &&
    attributes.char !== null &&
    ((!Array.isArray(attributes.char) &&
      "style" in attributes.char &&
      typeof attributes.char.style === "string") ||
      (Array.isArray(attributes.char) &&
        attributes.char.length > 0 &&
        "style" in attributes.char[0] &&
        typeof attributes.char[0].style === "string"))
  );
}

function isEmptyObject(obj: unknown): boolean {
  return (
    typeof obj === "object" && obj !== null && !Array.isArray(obj) && Object.keys(obj).length === 0
  );
}

function $applyTextAttributes(attributes: AttributeMap | undefined, textNode: TextNode) {
  if (!attributes) return;

  for (const key of Object.keys(attributes)) {
    // Handle segment attribute
    if (key === "segment" && typeof attributes[key] === "string") {
      const segment = attributes[key];
      $setState(textNode, segmentState, () => segment);
      continue;
    }

    // TODO: Text format attributes probably shouldn't be allowed but are helpful at the moment for
    // testing.
    if (isTextFormatType(key)) {
      const shouldSet = !!attributes[key];
      const formatKey: TextFormatType = key;
      const isAlreadySet = textNode.hasFormat(formatKey);
      if ((shouldSet && !isAlreadySet) || (!shouldSet && isAlreadySet)) {
        textNode.toggleFormat(formatKey);
      }
    }
  }
}

const TEXT_FORMAT_TYPES: readonly TextFormatType[] = [
  "bold",
  "underline",
  "strikethrough",
  "italic",
  "highlight",
  "code",
  "subscript",
  "superscript",
  "lowercase",
  "uppercase",
  "capitalize",
];

function isTextFormatType(key: string): key is TextFormatType {
  // This cast is safe because TEXT_FORMAT_TYPES is readonly TextFormatType[]
  return (TEXT_FORMAT_TYPES as readonly string[]).includes(key);
}
