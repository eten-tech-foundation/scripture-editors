import {
  $createImmutableNoteCallerNode,
  ImmutableNoteCallerNode,
  OnClick,
} from "../../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../../nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode, SomeVerseNode } from "../../../nodes/usj/node-react.utils";
import { UsjNodeOptions } from "../../../nodes/usj/usj-node-options.model";
import { ViewOptions } from "../../../views/view-options.utils";
import { $isEmbedNode, $isParaLikeNode, DeltaOp, EmbedNode, LF } from "./delta-common.utils";
import {
  OT_BOOK_PROPS,
  OT_CHAPTER_PROPS,
  OT_CHAR_PROPS,
  OT_MILESTONE_PROPS,
  OT_NOTE_PROPS,
  OT_PARA_PROPS,
  OT_VERSE_PROPS,
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
  OTNoteEmbed,
  OTParaAttribute,
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
  $getState,
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
  $createImpliedParaNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
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
  getEditableCallerText,
  getNoteCallerPreviewText,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  ImpliedParaNode,
  LoggerBasic,
  MarkerNode,
  NoteNode,
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
      currentIndex += $retain(op, currentIndex, logger);
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
        currentIndex += $insertTextAtCurrentIndex(currentIndex, op.insert, op.attributes, logger);
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

function $retain(op: DeltaOp, currentIndex: number, logger: LoggerBasic | undefined): number {
  if (typeof op.retain !== "number" || op.retain < 0) {
    logger?.error(`Invalid retain operation: ${JSON.stringify(op)}`);
    return 0;
  }

  logger?.debug(`Retain: ${op.retain}`);
  if (op.attributes) {
    logger?.debug(`Retain attributes: ${JSON.stringify(op.attributes)}`);
    $applyAttributes(currentIndex, op.retain, op.attributes, logger);
  }
  return op.retain;
}

/** Traverse and apply attributes to the retained range, or transform text to CharNode */
function $applyAttributes(
  targetIndex: number,
  retain: number,
  attributes: AttributeMap,
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
                const nestedCharNode = $createNestedChars(charAttr.slice(1), targetNode, segment);
                placeholderNode.replace(nestedCharNode);
                // Apply text attributes to the innermost node
                $applyTextAttributes(attributes, targetNode);
                // No need to update parent marker/cid, as it already matches
              } else if (!hasSameCharAttributes) {
                // If parent does not match, wrap the targetNode in new nested CharNode(s)
                const placeholderNode = $createTextNode("");
                targetNode.replace(placeholderNode);
                const char = $wrapInNestedCharNodes(targetNode, attributes, logger);
                if (char) parentNode.insertAfter(char);
                else placeholderNode.replace(targetNode);
              } else {
                // Parent CharNode matches and no further nesting needed, just apply attributes
                $applyTextAttributes(attributes, targetNode);
              }
            } else {
              const placeholderNode = $createTextNode("");
              targetNode.replace(placeholderNode);
              const char = $wrapInNestedCharNodes(targetNode, attributes, logger);
              if (char) placeholderNode.replace(char);
              else placeholderNode.replace(targetNode);
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
  logger?: LoggerBasic,
): CharNode | undefined {
  // Create new CharNode(s) with the attributes, supporting nested char arrays
  const segment = typeof attributes.segment === "string" ? attributes.segment : undefined;
  const newCharNode = $createNestedChars(attributes.char, textNode, segment);
  if (!$isCharNode(newCharNode)) {
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
    ...(newCharNode.getUnknownAttributes() ?? {}),
    ...textFormatAttributes,
    ...stringifiedAttributes,
  };

  if (Object.keys(combinedUnknownAttributes).length > 0) {
    newCharNode.setUnknownAttributes(combinedUnknownAttributes);
  }

  $applyTextAttributes(attributes, textNode);
  return newCharNode;
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
  logger?: LoggerBasic,
): number {
  if (textToInsert === LF) {
    return $handleNewline(targetIndex, attributes, logger);
  } else if (hasCharAttributes(attributes)) {
    return $handleCharText(targetIndex, textToInsert, attributes, logger);
  } else {
    // Handle rich text insertion (possibly with formatting like bold, italic)
    logger?.debug(
      `Attempting to insert text "${textToInsert}" with attributes ${JSON.stringify(
        attributes,
      )} at index ${targetIndex}`,
    );
    return $insertRichText(targetIndex, textToInsert, attributes, logger);
  }
}

function $handleCharText(
  targetIndex: number,
  textToInsert: string,
  attributes: AttributeMapWithChar,
  logger?: LoggerBasic,
): number {
  logger?.debug(
    `Attempting to insert CharNode with text "${textToInsert}" and attributes ${JSON.stringify(
      attributes.char,
    )} at index ${targetIndex}`,
  );

  const textNode = $createTextNode(textToInsert);
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
        if (targetIndex >= currentIndex && targetIndex <= currentIndex + textLength) {
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
  let charAttr = attributes.char;
  if (Array.isArray(charAttr) && parentCharNode) {
    const parentStyle = parentCharNode.getMarker();
    const parentCid = $getState(parentCharNode, charIdState);
    const first = charAttr[0];
    if (first && first.style === parentStyle && first.cid === parentCid) {
      // Only nest the remaining char attributes
      charAttr = charAttr.slice(1);
      // If only one left, treat as single
      if (charAttr.length === 1) charAttr = charAttr[0];
    }
  }
  const segment = typeof attributes.segment === "string" ? attributes.segment : undefined;
  const charNode = $createNestedChars(charAttr, textNode, segment);
  if (!$isCharNode(charNode)) {
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

  if ($insertNodeAtCharacterOffset(targetIndex, charNode, logger)) {
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
  logger?: LoggerBasic,
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
          currentNode.insertAfter(newTextNode);
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
        if (nodeToInsert.isInline() || !$isSomeParaNode(nodeToInsert)) {
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
  logger?: LoggerBasic,
): boolean {
  const embedObject = op.insert as object;
  let newNodeToInsert: LexicalNode | undefined;

  // Determine the LexicalNode to create based on the embedObject structure
  if (isEmbedOfType("chapter", embedObject)) {
    newNodeToInsert = $createChapter(embedObject.chapter as OTChapterEmbed, viewOptions);
  } else if (isEmbedOfType("verse", embedObject)) {
    newNodeToInsert = $createVerse(embedObject.verse as OTVerseEmbed, viewOptions);
  } else if (isEmbedOfType("ms", embedObject)) {
    newNodeToInsert = $createMilestone(embedObject.ms as OTMilestoneEmbed);
  } else if (isEmbedOfType("note", embedObject)) {
    newNodeToInsert = $createNote(op, viewOptions, nodeOptions);
  }
  // TODO: Add other embed types here as needed (e.g. ImmutableUnmatchedNode?)
  // While it would be technically and structurally possible to add a ParaNode here, it's not the
  // way Quill (and therefore flat rich-text docs) handles paragraphs which is always by inserting a
  // newline (LF) character with a `para` attribute.

  if (!newNodeToInsert) {
    logger?.error(
      `$insertEmbedAtCurrentIndex: Cannot create LexicalNode for embed object: ${JSON.stringify(
        embedObject,
      )}`,
    );
    return false;
  }

  // Delegate the actual insertion to the refined $insertNodeAtCharacterOffset
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
  logger?: LoggerBasic,
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

function $createChapter(chapterData: OTChapterEmbed, viewOptions: ViewOptions) {
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

function $createVerse(verseData: OTVerseEmbed, viewOptions: ViewOptions) {
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

function $createMilestone(msData: OTMilestoneEmbed) {
  const { style, sid, eid } = msData;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(msData, OT_MILESTONE_PROPS);
  return $createMilestoneNode(style, sid, eid, unknownAttributes);
}

function $createNote(op: DeltaOp, viewOptions: ViewOptions, nodeOptions: UsjNodeOptions) {
  const noteEmbed = op.insert as { note: OTNoteEmbed };
  const { style, caller, category, contents } = noteEmbed.note;
  if (!style || !caller) return;

  const unknownAttributes = getUnknownAttributes(noteEmbed.note, OT_NOTE_PROPS);
  const note = $createNoteNode(style, caller, category, unknownAttributes);

  const segment = op.attributes?.segment;
  if (segment && typeof segment === "string") $setState(note, segmentState, () => segment);

  const contentNodes: LexicalNode[] = [];
  for (const op of contents?.ops ?? []) {
    if (typeof op.insert !== "string") continue;
    if (hasCharAttributes(op.attributes)) {
      contentNodes.push($createNestedChars(op.attributes.char, $createTextNode(op.insert)));
    } else {
      contentNodes.push($createTextNode(op.insert));
    }
  }

  let callerNode: ImmutableNoteCallerNode | TextNode;
  if (viewOptions?.markerMode === "editable") {
    callerNode = $createTextNode(getEditableCallerText(caller));
  } else {
    const previewText = getNoteCallerPreviewText(contentNodes);
    let onClick: OnClick = () => undefined;
    if (nodeOptions?.noteCallerOnClick) {
      onClick = nodeOptions.noteCallerOnClick;
    }
    callerNode = $createImmutableNoteCallerNode(caller, previewText, onClick);
  }

  let openingMarkerNode: MarkerNode | undefined;
  let closingMarkerNode: MarkerNode | undefined;
  if (viewOptions?.markerMode === "visible" || viewOptions?.markerMode === "editable") {
    openingMarkerNode = $createMarkerNode(style);
    closingMarkerNode = $createMarkerNode(style, "closing");
  }

  if (openingMarkerNode) note.append(openingMarkerNode);
  note.append(callerNode, ...contentNodes);
  if (closingMarkerNode) note.append(closingMarkerNode);

  return note;
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

// Helper to create nested CharNodes from OTCharAttribute (array or single)
function $createNestedChars(
  charAttr: OTCharAttribute,
  innerNode?: LexicalNode,
  segment?: string,
): CharNode {
  if (Array.isArray(charAttr)) {
    if (charAttr.length === 0) throw new Error("Empty charAttr array");
    return charAttr.reduceRight((child, attr, idx) => {
      const charNode = $createCharNode(attr.style, getUnknownAttributes(attr, OT_CHAR_PROPS));
      if (typeof attr.cid === "string") $setState(charNode, charIdState, () => attr.cid);
      if (segment && idx === charAttr.length - 1) $setState(charNode, segmentState, () => segment);
      if (child) charNode.append(child);
      return charNode;
    }, innerNode) as CharNode;
  } else {
    const charNode = $createCharNode(charAttr.style, getUnknownAttributes(charAttr, OT_CHAR_PROPS));
    if (typeof charAttr.cid === "string") $setState(charNode, charIdState, () => charAttr.cid);
    if (segment) $setState(charNode, segmentState, () => segment);
    if (innerNode) charNode.append(innerNode);
    return charNode;
  }
}

/**
 * Type guard to check if an object has a specific property that is a non-null object.
 * @param embedObj - The object to check.
 * @param embedType - The property key to check for.
 * @returns `true` if `embedObj` has a property `embedType` and `embedObj[embedType]` is a non-null
 *   object, `false` otherwise.
 */
function isEmbedOfType<T extends object, K extends PropertyKey>(
  embedType: K,
  embedObj: T,
): embedObj is T & { [P in K]: object } {
  if (!(embedType in embedObj)) {
    return false;
  }
  // After the 'embedType in embedObj' check, TypeScript knows that 'embedObj' has the property
  // 'embedType'. The type of 'embedObj' is narrowed to 'T & { [P in K]: unknown }'. So, we can
  // safely access embedObj[embedType], and its type will be 'unknown'.
  const value = (embedObj as T & { [P in K]: unknown })[embedType];
  return typeof value === "object" && value !== null;
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
