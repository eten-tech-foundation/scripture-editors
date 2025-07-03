import {
  OT_BOOK_PROPS,
  OT_CHAPTER_PROPS,
  OT_CHAR_PROPS,
  OT_MILESTONE_PROPS,
  OT_PARA_PROPS,
  OT_VERSE_PROPS,
  OTBookAttribute,
  OTChapterEmbed,
  OTCharAttribute,
  OTCharItem,
  OTMilestoneEmbed,
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
import { AttributeMap, Op } from "quill-delta";
import { $createImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode, SomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import { ViewOptions } from "shared-react/views/view-options.utils";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import { charIdState, deltaStates, segmentState } from "shared/nodes/collab/delta.state";
import {
  $isImmutableUnmatchedNode,
  ImmutableUnmatchedNode,
} from "shared/nodes/features/ImmutableUnmatchedNode";
import { $isUnknownNode, UnknownNode } from "shared/nodes/features/UnknownNode";
import { $createBookNode, $isBookNode, BOOK_MARKER, BookNode } from "shared/nodes/usj/BookNode";
import { $createChapterNode } from "shared/nodes/usj/ChapterNode";
import { $createCharNode, $isCharNode, CharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode, $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import {
  $createMilestoneNode,
  $isMilestoneNode,
  MilestoneNode,
} from "shared/nodes/usj/MilestoneNode";
import {
  $hasSameCharAttributes,
  $isSomeChapterNode,
  $isSomeParaNode,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  SomeChapterNode,
} from "shared/nodes/usj/node.utils";
import { $isNoteNode, NoteNode } from "shared/nodes/usj/NoteNode";
import { $createParaNode, $isParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { $createVerseNode } from "shared/nodes/usj/VerseNode";

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

export const LF = "\n";

/**
 * Apply Operational Transform rich-text updates to the editor.
 * @param ops - Operations array.
 * @param viewOptions - View options of the editor.
 * @param logger - Logger to use, if any.
 *
 * @see https://github.com/ottypes/rich-text
 */
export function $applyUpdate(ops: Op[], viewOptions: ViewOptions, logger?: LoggerBasic) {
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
        if ($insertEmbedAtCurrentIndex(currentIndex, op.insert, viewOptions, logger)) {
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

function $retain(op: Op, currentIndex: number, logger: LoggerBasic | undefined): number {
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
            const [, middleNode] = $splitTextWithDeltaStates(currentNode, offsetInNode);
            [targetNode] = $splitTextWithDeltaStates(middleNode, lengthToApplyInThisNode);
          } else if (needsSplitAtStart) {
            [, targetNode] = $splitTextWithDeltaStates(currentNode, offsetInNode);
          } else if (needsSplitAtEnd) {
            [targetNode] = $splitTextWithDeltaStates(currentNode, lengthToApplyInThisNode);
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
    } else if ($isAtomicEmbedNode(currentNode)) {
      const atomicNodeOtLength = 1;
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + retain &&
        lengthToFormat > 0
      ) {
        // Apply attributes to the atomic node itself
        $applyEmbedAttributes(currentNode, attributes);
        lengthToFormat -= atomicNodeOtLength;
      }
      currentIndex += atomicNodeOtLength;
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
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      const containerEmbedOtLength = 1;
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + retain &&
        lengthToFormat > 0
      ) {
        // Apply attributes to the container node itself (its "tag")
        $applyEmbedAttributes(currentNode, attributes);
        lengthToFormat -= containerEmbedOtLength;
      }
      currentIndex += containerEmbedOtLength;

      // Then, process children of these container embeds
      if (lengthToFormat > 0) {
        const children = currentNode.getChildren();
        for (const child of children) {
          if (lengthToFormat <= 0) break;
          if ($traverseAndApplyAttributesRecursive(child)) {
            if (lengthToFormat <= 0) return true;
          }
        }
      }
    } else if ($isSomeParaNode(currentNode) || $isBookNode(currentNode)) {
      // Paragraph-like nodes: process children first, then account for the block's own closing OT
      // length.
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
          const newPara = $createPara(attributes);
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
  if ($isCharNode(newCharNode)) {
    // Copy original text formatting to CharNode's unknownAttributes
    const textFormatAttributes: Record<string, string> = {};
    TEXT_FORMAT_TYPES.forEach((format) => {
      if (textNode.hasFormat(format)) {
        textFormatAttributes[format] = "true";
      }
    });

    // Convert attributes to string values for unknownAttributes
    const stringifiedAttributes: Record<string, string> = {};
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
  } else {
    logger?.error(
      `Failed to create CharNode for text transformation. Style: ${
        Array.isArray(attributes.char) ? attributes.char[0].style : attributes.char?.style
      }. Falling back to standard text attributes.`,
    );
    $applyTextAttributes(attributes, textNode);
  }
}

// Apply attributes to the given embed node
function $applyEmbedAttributes(
  node: AtomicEmbedNode | CharNode | NoteNode | UnknownNode | ParaNode | BookNode,
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
      } else if (key == "code" && $isBookNode(node)) {
        node.setCode(value as BookCode);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
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
    } else if ($isAtomicEmbedNode(currentNode)) {
      // Check if the deletion should remove this atomic embed
      if (targetIndex <= currentIndex && currentIndex < targetIndex + remainingToDelete) {
        // The deletion spans this atomic embed - remove it
        currentNode.remove();
        logger?.debug(
          `Deleted atomic embed node (key: ${currentNode.getKey()}) at currentIndex: ${currentIndex}. ` +
            `Original targetIndex: ${targetIndex}, remainingToDelete: ${remainingToDelete}.`,
        );
        remainingToDelete -= 1;
      } else {
        // Deletion doesn't affect this embed, just advance past it
        currentIndex += 1;
      }
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds: advance past their tag (OT length 1), then recurse to delete text *inside* them.
      currentIndex += 1; // For the container tag itself

      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToDelete <= 0) break;
        if ($traverseAndDelete(child)) {
          if (remainingToDelete <= 0) return true;
        }
      }
    } else if ($isSomeParaNode(currentNode) || $isBookNode(currentNode)) {
      // Paragraph-like nodes: process children first, then handle the symbolic close
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
        ($isParaNode(currentNode) || $isBookNode(currentNode))
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
              } else if ($isAtomicEmbedNode(nextChild)) {
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
  if (textToInsert === LF && !attributes) {
    // Handle LF without attributes - split ParaNode into ImpliedParaNode + ParaNode
    return $handleNewlineWithoutAttributes(targetIndex, logger);
  } else if (
    textToInsert === LF &&
    (hasParaAttributes(attributes) || hasBookAttributes(attributes))
  ) {
    // Handle LF with para/book attributes - replace current ImpliedParaNode with ParaNode/BookNode
    return $handleNewlineWithBlockAttributes(targetIndex, attributes, logger);
  } else if (textToInsert !== LF && hasCharAttributes(attributes)) {
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
      } else if ($isAtomicEmbedNode(node)) {
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
        if ($isContainerEmbedNode(node) || $isSomeParaNode(node) || $isBookNode(node)) {
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
  const unknownAttributes: Record<string, string> = {};
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
          const [, tailNode] = $splitTextWithDeltaStates(currentNode, offsetInNode);
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
    } else if ($isAtomicEmbedNode(currentNode)) {
      // If targetIndex is exactly at currentIndex, means insert *before* this atomic node.
      // This function is for rich text; inserting before/after atomic nodes usually involves
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
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      const containerEmbedOtLength = 1;
      const offsetAtContainerStart = currentIndex;

      // Try inserting at the beginning of the container's *content*
      // (i.e., targetIndex matches after the container's opening tag)
      if (!insertionPointFound && targetIndex === offsetAtContainerStart + containerEmbedOtLength) {
        // This implies inserting as the first child inside the container
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
      currentIndex += containerEmbedOtLength; // Advance for the container tag

      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true;
        if (insertionPointFound) break;
      }
      // Try appending to the container if targetIndex matches after children
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
    } else if ($isSomeParaNode(currentNode) || $isBookNode(currentNode)) {
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
          const [headNode] = $splitTextWithDeltaStates(child, splitOffset);
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
      } else if ($isAtomicEmbedNode(child)) {
        currentIndex += 1;
      } else if ($isCharNode(child)) {
        // CharNodes don't contribute to OT length, they're just formatted text containers
        // No OT length contribution for the CharNode itself
        if ($traverseAndInsertRecursive(child)) return true;
        // currentIndex is now after child's content and its own recursive calls
      } else if ($isContainerEmbedNode(child)) {
        // Container embeds have an OT length of 1, then their children are processed.
        currentIndex += 1; // For the container tag itself
        if ($traverseAndInsertRecursive(child)) return true;
        // currentIndex is now after child's content and its own recursive calls
      } else if ($isSomeParaNode(child) || $isBookNode(child)) {
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
          ($isParaNode(nodeToInsert) || $isBookNode(nodeToInsert)) &&
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
        // Appending to an existing container (ParaNode, ImpliedParaNode, CharNode, etc.)
        // currentNode here is the container itself. currentIndex is at the point of currentNode's
        // closing marker. targetIndex === currentIndex means we are inserting at the conceptual end
        // of this container.
        $isSomeParaNode(currentNode) ||
        $isContainerEmbedNode(currentNode)
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
  embedObject: object,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  let newNodeToInsert: LexicalNode | undefined;

  // Determine the LexicalNode to create based on the embedObject structure
  if (isEmbedOfType("chapter", embedObject)) {
    newNodeToInsert = $createChapter(embedObject.chapter as OTChapterEmbed, viewOptions);
  } else if (isEmbedOfType("verse", embedObject)) {
    newNodeToInsert = $createVerse(embedObject.verse as OTVerseEmbed, viewOptions);
  } else if (isEmbedOfType("ms", embedObject)) {
    newNodeToInsert = $createMilestone(embedObject.ms as OTMilestoneEmbed);
  }
  // TODO: Add other embed types here as needed (e.g. NoteNode?, ImmutableUnmatchedNode?)
  // While it would be technically and structurally possible to add a ParaNode here, it's not the
  // way Quill handles paragraphs which is always by inserting a newline (LF) character with a
  // `para` attribute.

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
 * Handles inserting a newline (LF) character with para or book attributes.
 * This can replace an ImpliedParaNode with a ParaNode or BookNode, or split a regular ParaNode
 * if the para attributes differ from the containing paragraph.
 * @param targetIndex - The index in the document's flat representation.
 * @param attributes - The attributes to use for creating the ParaNode or BookNode.
 * @param logger - Logger to use, if any.
 * @returns Always returns 1 (the LF character's OT length).
 */
function $handleNewlineWithBlockAttributes(
  targetIndex: number,
  attributes: AttributeMapWithPara | AttributeMapWithBook,
  logger?: LoggerBasic,
): number {
  const root = $getRoot();
  const _hasParaAttributes = hasParaAttributes(attributes);
  const newBlockNode = _hasParaAttributes ? $createPara(attributes) : $createBook(attributes);
  const isNewParaNode = $isParaNode(newBlockNode);
  let currentIndex = 0;
  let foundTargetBlock = false;

  function $traverseAndHandleNewline(currentNode: LexicalNode): boolean {
    if (foundTargetBlock) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if targetIndex is within this text node
      if (targetIndex >= currentIndex && targetIndex < currentIndex + textLength) {
        // Split is happening within a text node - need to check if we're in a ParaNode
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara) && isNewParaNode) {
          // LF with attributes should ALWAYS split a regular ParaNode
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) with LF attributes at ` +
              `targetIndex ${targetIndex}`,
          );

          // Split the text node at the target position
          const splitOffset = targetIndex - currentIndex;
          const beforeText = currentNode.getTextContent().slice(0, splitOffset);
          const afterText = currentNode.getTextContent().slice(splitOffset);

          // Create new ParaNode with original attributes (for the SECOND paragraph)
          const secondParaNode = $createParaNode(
            parentPara.getMarker(),
            parentPara.getUnknownAttributes(),
          );

          // Set the current text node to contain only the before text
          currentNode.setTextContent(beforeText);

          // Move all content after the split to the second paragraph
          const afterTextNode = afterText ? $createTextNode(afterText) : null;
          if (afterTextNode) {
            secondParaNode.append(afterTextNode);
          }

          // Move subsequent siblings to the second paragraph
          let nextSibling = currentNode.getNextSibling();
          while (nextSibling) {
            const siblingToMove = nextSibling;
            nextSibling = nextSibling.getNextSibling();
            secondParaNode.append(siblingToMove);
          }

          // Apply LF attributes to the FIRST paragraph (current one)
          if (newBlockNode.getMarker() !== parentPara.getMarker()) {
            parentPara.setMarker(newBlockNode.getMarker());
          }
          if (newBlockNode.getUnknownAttributes()) {
            parentPara.setUnknownAttributes(newBlockNode.getUnknownAttributes());
          }

          // Insert the second paragraph after the first one
          parentPara.insertAfter(secondParaNode);

          foundTargetBlock = true;
          return true;
        }
      }
      // Check if targetIndex is exactly at the end of this text node (between siblings)
      if (targetIndex === currentIndex + textLength) {
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara) && isNewParaNode) {
          // Split is happening between this text node and the next sibling
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) between siblings at ` +
              `targetIndex ${targetIndex}`,
          );

          // Create new ParaNode with original attributes (for the SECOND paragraph)
          const secondParaNode = $createParaNode(
            parentPara.getMarker(),
            parentPara.getUnknownAttributes(),
          );

          // Move subsequent siblings to the second paragraph
          let nextSibling = currentNode.getNextSibling();
          while (nextSibling) {
            const siblingToMove = nextSibling;
            nextSibling = nextSibling.getNextSibling();
            secondParaNode.append(siblingToMove);
          }

          // Apply LF attributes to the FIRST paragraph (current one)
          if (newBlockNode.getMarker() !== parentPara.getMarker()) {
            parentPara.setMarker(newBlockNode.getMarker());
          }
          if (newBlockNode.getUnknownAttributes()) {
            parentPara.setUnknownAttributes(newBlockNode.getUnknownAttributes());
          }

          // Insert the second paragraph after the first one
          parentPara.insertAfter(secondParaNode);

          foundTargetBlock = true;
          return true;
        }
      }
      currentIndex += textLength;
    } else if ($isAtomicEmbedNode(currentNode)) {
      currentIndex += 1;
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      currentIndex += 1; // For the container tag itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetBlock) break;
      }
    } else if ($isSomeParaNode(currentNode) || $isBookNode(currentNode)) {
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

  $traverseAndHandleNewline(root);

  if (!foundTargetBlock) {
    logger?.warn(
      `Could not find location to handle newline with para attributes at targetIndex ${
        targetIndex
      }. Final currentIndex: ${currentIndex}.`,
    );
  }

  return 1; // LF always contributes 1 to the OT index
}

/**
 * Handles inserting a newline (LF) character without attributes.
 * This splits a regular ParaNode into an ImpliedParaNode for the first part
 * and keeps the second part as a ParaNode.
 * @param targetIndex - The index in the document's flat representation.
 * @param logger - Logger to use, if any.
 * @returns Always returns 1 (the LF character's OT length).
 */
function $handleNewlineWithoutAttributes(targetIndex: number, logger?: LoggerBasic): number {
  const root = $getRoot();
  let currentIndex = 0;
  let foundTargetPara = false;

  function $traverseAndHandleNewline(currentNode: LexicalNode): boolean {
    if (foundTargetPara) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if targetIndex is within this text node
      if (targetIndex >= currentIndex && targetIndex < currentIndex + textLength) {
        // Split is happening within a text node - check if we're in a ParaNode
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara)) {
          // LF without attributes should split ParaNode into ImpliedParaNode + ParaNode
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) without attributes at ` +
              `targetIndex ${targetIndex}`,
          );

          // Split the text node at the target position
          const splitOffset = targetIndex - currentIndex;
          const beforeText = currentNode.getTextContent().slice(0, splitOffset);
          const afterText = currentNode.getTextContent().slice(splitOffset);

          // Create ImpliedParaNode for the first part
          const firstImpliedParaNode = $createImpliedParaNode();

          // Create ParaNode with original attributes for the second part
          const secondParaNode = $createParaNode(
            parentPara.getMarker(),
            parentPara.getUnknownAttributes(),
          );

          // Add before text to the first ImpliedParaNode if it exists
          if (beforeText) {
            firstImpliedParaNode.append($createTextNode(beforeText));
          }

          // Move all content before the split to the first ImpliedParaNode
          let prevSibling = currentNode.getPreviousSibling();
          while (prevSibling) {
            const siblingToMove = prevSibling;
            prevSibling = prevSibling.getPreviousSibling();
            const firstChild = firstImpliedParaNode.getFirstChild();
            if (firstChild) {
              firstChild.insertBefore(siblingToMove);
            } else {
              firstImpliedParaNode.append(siblingToMove);
            }
          }

          // Add after text to the second ParaNode if it exists
          if (afterText) {
            secondParaNode.append($createTextNode(afterText));
          }

          // Move subsequent siblings to the second ParaNode
          let nextSibling = currentNode.getNextSibling();
          while (nextSibling) {
            const siblingToMove = nextSibling;
            nextSibling = nextSibling.getNextSibling();
            secondParaNode.append(siblingToMove);
          }

          // Replace the original ParaNode with the first ImpliedParaNode
          parentPara.replace(firstImpliedParaNode);

          // Insert the second ParaNode after the first one
          firstImpliedParaNode.insertAfter(secondParaNode);

          foundTargetPara = true;
          return true;
        }
      }
      // Check if targetIndex is exactly at the end of this text node (between siblings)
      if (targetIndex === currentIndex + textLength) {
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara)) {
          // Split is happening between this text node and the next sibling
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) between siblings without ` +
              `attributes at targetIndex ${targetIndex}`,
          );

          // Create ImpliedParaNode for the first part
          const firstImpliedParaNode = $createImpliedParaNode();

          // Create ParaNode with original attributes for the second part
          const secondParaNode = $createParaNode(
            parentPara.getMarker(),
            parentPara.getUnknownAttributes(),
          );

          // Move all content up to and including the current text node to the first ImpliedParaNode
          let currentChild = parentPara.getFirstChild();
          while (currentChild && currentChild !== currentNode.getNextSibling()) {
            const childToMove = currentChild;
            currentChild = currentChild.getNextSibling();
            firstImpliedParaNode.append(childToMove);
          }

          // Move subsequent siblings to the second ParaNode
          let nextSibling = currentNode.getNextSibling();
          while (nextSibling) {
            const siblingToMove = nextSibling;
            nextSibling = nextSibling.getNextSibling();
            secondParaNode.append(siblingToMove);
          }

          // Replace the original ParaNode with the first ImpliedParaNode
          parentPara.replace(firstImpliedParaNode);

          // Insert the second ParaNode after the first one
          firstImpliedParaNode.insertAfter(secondParaNode);

          foundTargetPara = true;
          return true;
        }
      }
      currentIndex += textLength;
    } else if ($isAtomicEmbedNode(currentNode)) {
      currentIndex += 1;
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      currentIndex += 1; // For the container tag itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    } else if ($isSomeParaNode(currentNode) || $isBookNode(currentNode)) {
      // First, process children to find current position
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }

      // currentIndex is now at the end of this para's content
      // Check if targetIndex matches the para's closing marker position
      if (targetIndex === currentIndex && !foundTargetPara) {
        // This handles the case where we're inserting at the very end of a ParaNode. For LF without
        // attributes, we only split if we're in a regular ParaNode (not ImpliedParaNode)
        if ($isParaNode(currentNode)) {
          logger?.debug(
            `Splitting ParaNode (marker: ${currentNode.getMarker()}) at end without attributes ` +
              `at targetIndex ${targetIndex}`,
          );

          // Create a new empty ParaNode for the second part
          const newParaNode = $createParaNode(
            currentNode.getMarker(),
            currentNode.getUnknownAttributes(),
          );

          // Insert the new paragraph after the current one
          currentNode.insertAfter(newParaNode);

          foundTargetPara = true;
          return true;
        }
      }

      // Advance by 1 for the para's closing marker
      currentIndex += 1;
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes that don't contribute to the OT length (like RootNode, CharNode)
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    }

    return foundTargetPara;
  }

  $traverseAndHandleNewline(root);

  if (!foundTargetPara) {
    logger?.warn(
      `Could not find location to handle newline without attributes at targetIndex ${
        targetIndex
      }. Final currentIndex: ${currentIndex}.`,
    );
  }

  return 1; // LF always contributes 1 to the OT index
}

type AtomicEmbedNode = SomeChapterNode | SomeVerseNode | MilestoneNode | ImmutableUnmatchedNode;

/**
 * Type guard to check if a node is a atomic embed (SomeChapterNode, SomeVerseNode, MilestoneNode,
 * or ImmutableUnmatchedNode). Atomic embeds have an OT length of 1 and are self-contained (no
 * children to process).
 */
function $isAtomicEmbedNode(node: LexicalNode): node is AtomicEmbedNode {
  return (
    $isSomeChapterNode(node) ||
    $isSomeVerseNode(node) ||
    $isMilestoneNode(node) ||
    $isImmutableUnmatchedNode(node)
  );
}

/**
 * Type guard to check if a node is a true container embed that contributes 1 to OT length.
 * This excludes CharNodes which are just formatted text without OT tag contribution.
 */
function $isContainerEmbedNode(node: LexicalNode): node is NoteNode | UnknownNode {
  return $isNoteNode(node) || $isUnknownNode(node);
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

function $createBook(attributes: AttributeMapWithBook) {
  const { style, code } = attributes.book;
  if (!style || style !== BOOK_MARKER || !code || !BookNode.isValidBookCode(code)) return;

  // Start with para-specific unknown attributes
  let unknownAttributes = getUnknownAttributes(attributes.book, OT_BOOK_PROPS);

  // Add non-para attributes from allAttributes if provided
  if (attributes) {
    const nonParaAttributes: Record<string, string> = {};

    // Extract all non-para attributes as strings
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== "book" && typeof value === "string") {
        nonParaAttributes[key] = value;
      }
    }

    // Merge with existing unknown attributes
    if (Object.keys(nonParaAttributes).length > 0) {
      unknownAttributes = {
        ...(unknownAttributes ?? {}),
        ...nonParaAttributes,
      };
    }
  }

  return $createBookNode(code, unknownAttributes);
}

function $createPara(attributes: AttributeMapWithPara) {
  const { style } = attributes.para;
  if (!style) return;

  // Start with para-specific unknown attributes
  let unknownAttributes = getUnknownAttributes(attributes.para, OT_PARA_PROPS);

  // Add non-para attributes from allAttributes if provided
  if (attributes) {
    const nonParaAttributes: Record<string, string> = {};

    // Extract all non-para attributes as strings
    for (const [key, value] of Object.entries(attributes)) {
      if (key !== "para" && typeof value === "string") {
        nonParaAttributes[key] = value;
      }
    }

    // Merge with existing unknown attributes
    if (Object.keys(nonParaAttributes).length > 0) {
      unknownAttributes = {
        ...(unknownAttributes ?? {}),
        ...nonParaAttributes,
      };
    }
  }

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
      if (typeof attr.cid === "string") $setState(charNode, charIdState, attr.cid);
      if (segment && idx === charAttr.length - 1) $setState(charNode, segmentState, segment);
      if (child) charNode.append(child);
      return charNode;
    }, innerNode) as CharNode;
  } else {
    const charNode = $createCharNode(charAttr.style, getUnknownAttributes(charAttr, OT_CHAR_PROPS));
    if (typeof charAttr.cid === "string") $setState(charNode, charIdState, charAttr.cid);
    if (segment) $setState(charNode, segmentState, segment);
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
 * @template T - The type of the object.
 * @template K - The type of the property key.
 */
function isEmbedOfType<T extends object, K extends PropertyKey>(
  embedType: K,
  embedObj: T,
): embedObj is T & { [P in K]: object } {
  if (!(embedType in embedObj)) {
    return false;
  }
  // After the 'embedType in embedObj' check, TypeScript knows that 'embedObj' has the property
  // 'embedType'. The type of 'embedObj' is narrowed to 'T & Record<K, unknown>'. So, we can safely
  // access embedObj[embedType], and its type will be 'unknown'.
  const value = (embedObj as T & Record<K, unknown>)[embedType];
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

/**
 * Helper function to split a text node while preserving delta states.
 * Fixed in https://github.com/facebook/lexical/pull/7641 but not released as of 2025-06-26.
 * TODO: Remove this when Lexical releases a version with the fix.
 */
function $splitTextWithDeltaStates(textNode: TextNode, offset: number): [TextNode, TextNode] {
  const [headNode, tailNode] = textNode.splitText(offset);

  // Preserve delta states on the tail node if they exist (head is already preserved).
  for (const state of deltaStates) {
    const stateValue = $getState(textNode, state);
    if (stateValue !== undefined) {
      $setState(tailNode, state, stateValue);
    }
  }

  return [headNode, tailNode];
}
