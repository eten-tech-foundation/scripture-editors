import {
  OTEmbedChapter,
  OTEmbedVerse,
  OTEmbedMilestone,
  OT_CHAPTER_PROPS,
  OT_VERSE_PROPS,
  OT_MILESTONE_PROPS,
  OTEmbedPara,
  OT_PARA_PROPS,
  OTEmbedChar,
  OT_CHAR_PROPS,
} from "./rich-text-ot.model";
import {
  $getRoot,
  $createTextNode,
  $isElementNode,
  $isTextNode,
  LexicalNode,
  TextFormatType,
  TextNode,
} from "lexical";
import { AttributeMap, Op } from "quill-delta";
import { $createImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode, SomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import { ViewOptions } from "shared-react/views/view-options.utils";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import {
  $isImmutableUnmatchedNode,
  ImmutableUnmatchedNode,
} from "shared/nodes/features/ImmutableUnmatchedNode";
import { $isUnknownNode, UnknownNode } from "shared/nodes/features/UnknownNode";
import { $isBookNode, BookNode } from "shared/nodes/usj/BookNode";
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
  $isSomeChapterNode,
  $isSomeParaNode,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  SomeChapterNode,
} from "shared/nodes/usj/node.utils";
import { $isNoteNode, NoteNode } from "shared/nodes/usj/NoteNode";
import { $createParaNode, $isParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { $createVerseNode } from "shared/nodes/usj/VerseNode";

/*
For implied paragraphs, we use the following logic:
  - An ImpliedParaNode (or ParaNode) takes up OT index space 1 but only at the end of the block.
  - An ImpliedParaNode is created when an inline node is inserted where there is no ParaNode.
  - If an LF is inserted, it closes the ImpliedParaNode if there are no attributes or it is replaced
    by a ParaNode specified by the attributes.
  - Our empty Lexical editor defaults to an empty ImpliedParaNode, so the first inline insertion
    should go inside it.
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
      $deleteTextAtCurrentIndex(currentIndex, op.delete, logger);
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
            let middleNode;
            [, middleNode] = currentNode.splitText(offsetInNode);
            [targetNode] = middleNode.splitText(lengthToApplyInThisNode);
          } else if (needsSplitAtStart) {
            [, targetNode] = currentNode.splitText(offsetInNode);
          } else if (needsSplitAtEnd) {
            [targetNode] = currentNode.splitText(lengthToApplyInThisNode);
          }

          // Check if we need to convert TextNode to CharNode
          if (
            attributes.char &&
            typeof attributes.char === "object" &&
            attributes.char !== null &&
            "style" in attributes.char
          ) {
            // Check if this text node is already inside a CharNode
            const parentNode = targetNode.getParent();
            if ($isCharNode(parentNode)) {
              // Don't create a new CharNode, just apply non-char attributes to the text
              const topLevelTextAttributes = { ...attributes };
              delete topLevelTextAttributes.char;
              applyTextAttributes(topLevelTextAttributes, targetNode);
            } else {
              // Create new CharNode with the char attributes
              const charEmbedData = attributes.char as OTEmbedChar;
              const textContent = targetNode.getTextContent();

              const newCharNode = $createChar(charEmbedData);
              if ($isCharNode(newCharNode)) {
                // Create text node with the content and apply non-char attributes
                const newTextNode = $createTextNode(textContent);
                const topLevelTextAttributes = { ...attributes };
                delete topLevelTextAttributes.char;
                applyTextAttributes(topLevelTextAttributes, newTextNode);

                // Add text to CharNode and replace the original text node
                newCharNode.append(newTextNode);
                targetNode.replace(newCharNode);
              } else {
                logger?.error(
                  `Failed to create CharNode for text transformation. Style: ${charEmbedData.style}. ` +
                    `Falling back to standard text attributes.`,
                );
                applyTextAttributes(attributes, targetNode);
              }
            }
          } else {
            applyTextAttributes(attributes, targetNode);
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
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + retain &&
        lengthToFormat > 0 &&
        attributes.char &&
        typeof attributes.char === "object" &&
        attributes.char !== null &&
        "style" in attributes.char
      ) {
        const charEmbedData = attributes.char as OTEmbedChar;
        // Update the CharNode's marker and attributes to match the retain attributes
        currentNode.setMarker(charEmbedData.style);
        const unknownAttributes = getUnknownAttributes(charEmbedData, OT_CHAR_PROPS);
        if (unknownAttributes && Object.keys(unknownAttributes).length > 0) {
          currentNode.setUnknownAttributes({
            ...(currentNode.getUnknownAttributes() ?? {}),
            ...unknownAttributes,
          });
        }
      }

      // Process children of CharNodes (no OT length contribution)
      if (lengthToFormat > 0) {
        const children = currentNode.getChildren();
        for (const child of children) {
          if (lengthToFormat <= 0) break;
          if ($traverseAndApplyAttributesRecursive(child)) {
            if (lengthToFormat <= 0) return true;
          }
        }
      }
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
    } else if ($isSomeParaNode(currentNode)) {
      // Paragraph-like nodes: process children first, then account for the para's own closing OT
      // length.
      const children = currentNode.getChildren();
      for (const child of children) {
        if (lengthToFormat <= 0) break;
        if ($traverseAndApplyAttributesRecursive(child)) {
          if (lengthToFormat <= 0) return true; // Early exit if formatting complete
        }
      }

      // After children, account for the ParaNode/ImpliedParaNode's closing marker (OT length 1)
      const paraClosingOtLength = 1;
      // currentIndex is now positioned after all children of this ParaNode.
      // Check if the retain operation targets this closing marker.
      if (
        targetIndex <= currentIndex &&
        currentIndex < targetIndex + lengthToFormat &&
        lengthToFormat > 0
      ) {
        $applyEmbedAttributes(
          currentNode as ParaNode /*or ImpliedParaNode, handled by $applyEmbedAttributes type*/,
          attributes,
        );
        lengthToFormat -= paraClosingOtLength;
      }
      currentIndex += paraClosingOtLength;
    } else if ($isElementNode(currentNode)) {
      // Other generic ElementNodes (like RootNode, or custom unhandled ones)
      // Process children. These elements themselves usually have OT length 0.
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

// Apply attributes to the given embed node
function $applyEmbedAttributes(
  node: AtomicEmbedNode | CharNode | NoteNode | UnknownNode | ParaNode,
  attributes: AttributeMap,
) {
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];

    // Special handling for char attributes on CharNodes
    if (key === "char" && $isCharNode(node) && typeof value === "object" && value !== null) {
      const charAttributes = value as Record<string, unknown>;

      // Update marker if style is provided
      if ("style" in charAttributes && typeof charAttributes.style === "string") {
        node.setMarker(charAttributes.style);
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

    if ($isBookNode(node)) {
      if (key === "style") {
        // Don't change marker for books.
        continue;
      } else if (key === "code") {
        if (BookNode.isValidBookCode(value)) {
          node.setCode(value);
        }
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    } else if ($isSomeChapterNode(node) || $isSomeVerseNode(node)) {
      if (key === "number") {
        node.setNumber(value);
      } else if (key === "style") {
        // Don't change marker for chapters or verses.
        continue;
      } else if (key === "sid") {
        node.setSid(value);
      } else if (key === "altnumber") {
        node.setAltnumber(value);
      } else if (key === "pubnumber") {
        node.setPubnumber(value);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    } else if ($isMilestoneNode(node)) {
      if (key === "style") {
        node.setMarker(value);
      } else if (key === "sid") {
        node.setSid(value);
      } else if (key === "eid") {
        node.setEid(value);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    } else if ($isNoteNode(node)) {
      if (key === "style") {
        node.setMarker(value);
      } else if (key === "caller") {
        node.setCaller(value);
      } else if (key === "category") {
        node.setCategory(value);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    } else if ($isParaNode(node) || $isCharNode(node) || $isUnknownNode(node)) {
      if (key === "style") {
        node.setMarker(value);
      } else {
        node.setUnknownAttributes({
          ...(node.getUnknownAttributes() ?? {}),
          [key]: value,
        });
      }
    } else if ($isImmutableUnmatchedNode(node)) {
      if (key === "style") {
        node.setMarker(value);
      }
    }
  }
}

// Helper function to delete text starting at a given flat index from the document
function $deleteTextAtCurrentIndex(
  targetIndex: number,
  count: number,
  logger: LoggerBasic | undefined,
) {
  if (count <= 0) return;

  const root = $getRoot();
  let currentIndex = 0; // Tracks characters traversed so far in the document's text content
  let remainingToDelete = count;

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
    } else if ($isCharNode(currentNode)) {
      // CharNodes don't contribute to OT length, just process their children directly
      if (remainingToDelete > 0) {
        const children = currentNode.getChildren();
        for (const child of children) {
          if (remainingToDelete <= 0) break;
          if ($traverseAndDelete(child)) {
            if (remainingToDelete <= 0) return true;
          }
        }
      }
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds: advance past their tag (OT length 1), then recurse to delete text *inside* them.
      currentIndex += 1; // For the container tag itself

      if (remainingToDelete > 0) {
        const children = currentNode.getChildren();
        for (const child of children) {
          if (remainingToDelete <= 0) break;
          if ($traverseAndDelete(child)) {
            if (remainingToDelete <= 0) return true;
          }
        }
      }
    } else if ($isSomeParaNode(currentNode)) {
      // Paragraph-like nodes: process children first
      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToDelete <= 0) break;
        if ($traverseAndDelete(child)) {
          if (remainingToDelete <= 0) return true;
        }
      }
      // After children, account for the ParaNode/ImpliedParaNode's closing marker.
      // Deleting this conceptual newline is complex (merge, unwrap) and typically
      // handled by specific operations, not general text deletion. For now, just advance offset.
      currentIndex += 1;
    } else if ($isElementNode(currentNode)) {
      // Other generic ElementNodes (like RootNode)
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
      }. Original targetIndex: ${targetIndex}, count: ${count}. Final currentIndex: ${
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
  } else if (textToInsert === LF && attributes && typeof attributes.para === "object") {
    // Handle LF with para attributes - replace current ImpliedParaNode with ParaNode
    return $handleNewlineWithParaAttributes(targetIndex, attributes.para as OTEmbedPara, logger);
  } else if (textToInsert !== LF && typeof attributes?.char === "object") {
    // Handle CharNode insertion
    logger?.debug(
      `Attempting to insert CharNode with text "${textToInsert}" and attributes ${JSON.stringify(
        attributes.char,
      )} at index ${targetIndex}`,
    );

    const charNode = $createChar(attributes.char as OTEmbedChar);
    if (!$isCharNode(charNode)) {
      logger?.error(
        `CharNode style is missing for text "${textToInsert}". Attributes: ${JSON.stringify(
          attributes.char,
        )}. Falling back to rich text insertion.`,
      );
      // Fallback to rich text insertion
      return $insertRichText(targetIndex, textToInsert, undefined, logger);
    }

    const textNode = $createTextNode(textToInsert);
    // Apply other non-char attributes (e.g. bold) to the TextNode inside the CharNode if necessary.
    if (attributes) {
      const textAttributes = { ...attributes };
      delete textAttributes.char; // Remove char attribute as it's handled by CharNode
      // TODO: Apply these textAttributes to the textNode if any (e.g., bold, italic)
      // For now, assuming CharNode itself carries all necessary style, and text inside is rich text
      // or inherits from CharNode's context.
    }
    charNode.append(textNode);

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

/**
 * Helper to insert rich text, i.e. potentially with formatting or other attributes.
 * This function contains the core logic for text node insertion and splitting.
 * @returns The length of the inserted text.
 */
function $insertRichText(
  targetIndex: number,
  textToInsert: string,
  textAttributes: AttributeMap | undefined,
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
        applyTextAttributes(textAttributes, newTextNode);

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
        applyTextAttributes(textAttributes, newTextNode);
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
        applyTextAttributes(textAttributes, newTextNode);
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
        applyTextAttributes(textAttributes, newTextNode);
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
        applyTextAttributes(textAttributes, newTextNode);
        currentNode.append(newTextNode);
        logger?.debug(
          `Appended text "${textToInsert}" to end of container ` +
            `${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }
    } else if ($isSomeParaNode(currentNode)) {
      const offsetAtParaStart = currentIndex;
      // Try inserting at the beginning of the ParaNode
      if (!insertionPointFound && targetIndex === offsetAtParaStart) {
        const newTextNode = $createTextNode(textToInsert);
        applyTextAttributes(textAttributes, newTextNode);
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
        applyTextAttributes(textAttributes, newTextNode);
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
    applyTextAttributes(textAttributes, newTextNode);
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
          const para = $createImpliedParaNode().append(nodeToInsert);
          root.append(para);
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
            const para = $createImpliedParaNode().append(nodeToInsert);
            child.insertBefore(para);
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
          const splitNodes = child.splitText(splitOffset);
          // Insert after the first part of the split text
          splitNodes[0].insertAfter(nodeToInsert);
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
        // True container embeds have an OT length of 1 for their "tag", then their children are processed.
        currentIndex += 1; // For the container tag itself
        if ($traverseAndInsertRecursive(child)) return true;
        // currentIndex is now after child's content and its own recursive calls
      } else if ($isSomeParaNode(child)) {
        const paraLikeChild = child;
        // currentIndex is currently at the START of paraLikeChild's content area (or its embed
        // point if empty)
        if ($traverseAndInsertRecursive(paraLikeChild)) return true;

        // If not inserted inside, `currentIndex` is now at the end of `paraLikeChild`'s content.
        const otIndexForParaChildClosingMarker = currentIndex;

        // Check for replacement: if inserting a ParaNode at the closing marker of an
        // ImpliedParaNode
        if (
          $isImpliedParaNode(paraLikeChild) &&
          $isParaNode(nodeToInsert) && // The node we are trying to insert
          // Target is at the ImpliedPara's implicit newline
          targetIndex === otIndexForParaChildClosingMarker &&
          !wasInserted // Ensure we haven't already inserted elsewhere
        ) {
          logger?.debug(
            `$insertNodeAtCharacterOffset: Replacing ImpliedParaNode ` +
              `(key: ${paraLikeChild.getKey()}) with ParaNode ${nodeToInsert.getType()} ` +
              `(key: ${nodeToInsert.getKey()}) at OT index ${targetIndex}.`,
          );
          child.replace(nodeToInsert, true);

          // The replacementNode (ParaNode) also has a closing marker.
          // currentIndex was at otIndexForParaChildClosingMarker (end of content).
          // Now, advance by 1 for the new ParaNode's closing marker.
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

// Make sure $insertEmbedAtCurrentIndex correctly calls $insertNodeAtCharacterOffset
// with the created node. The logic for creating nodeToInsert from embedObject remains the same.
// The $traverseAndInsertRecursive helper within $insertEmbedAtCurrentIndex can be removed
// if $insertNodeAtCharacterOffset is now the canonical implementation for node insertion.
// Or, ensure $insertEmbedAtCurrentIndex's helper mirrors this refined logic.
// For simplicity and to avoid duplication, $insertEmbedAtCurrentIndex should ideally
// just create the node and then call $insertNodeAtCharacterOffset.

function $insertEmbedAtCurrentIndex(
  targetIndex: number,
  embedObject: object,
  viewOptions: ViewOptions,
  logger?: LoggerBasic,
): boolean {
  let newNodeToInsert: LexicalNode | undefined;

  // Determine the LexicalNode to create based on the embedObject structure
  if (isEmbedOfType("chapter", embedObject)) {
    newNodeToInsert = $createChapter(embedObject.chapter as OTEmbedChapter, viewOptions);
  } else if (isEmbedOfType("verse", embedObject)) {
    newNodeToInsert = $createVerse(embedObject.verse as OTEmbedVerse, viewOptions);
  } else if (isEmbedOfType("para", embedObject)) {
    newNodeToInsert = $createPara(embedObject.para as OTEmbedPara);
  } else if (isEmbedOfType("ms", embedObject)) {
    newNodeToInsert = $createMilestone(embedObject.ms as OTEmbedMilestone);
  }
  // TODO: Add other embed types here as needed (e.g., BookNode, NoteNode, ImmutableUnmatchedNode)

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
 * Handles inserting a newline (LF) character with para attributes.
 * This can replace an ImpliedParaNode with a ParaNode, or split a regular ParaNode
 * if the para attributes differ from the containing paragraph.
 * @param targetIndex - The index in the document's flat representation.
 * @param paraAttributes - The para attributes to use for creating the ParaNode.
 * @param logger - Logger to use, if any.
 * @returns Always returns 1 (the LF character's OT length).
 */
function $handleNewlineWithParaAttributes(
  targetIndex: number,
  paraAttributes: OTEmbedPara,
  logger?: LoggerBasic,
): number {
  const root = $getRoot();
  let currentIndex = 0;
  let foundTargetPara = false;

  function $traverseAndHandleNewline(currentNode: LexicalNode): boolean {
    if (foundTargetPara) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if targetIndex is within this text node
      if (targetIndex >= currentIndex && targetIndex < currentIndex + textLength) {
        // Split is happening within a text node - need to check if we're in a ParaNode
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara)) {
          // LF with attributes should ALWAYS split a regular ParaNode
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) with LF attributes at ` +
              `targetIndex ${targetIndex}`,
          );

          // Split the text node at the target position
          const splitOffset = targetIndex - currentIndex;
          const beforeText = currentNode.getTextContent().slice(0, splitOffset);
          const afterText = currentNode.getTextContent().slice(splitOffset);

          // Create new ParaNode with LF attributes (for the FIRST paragraph)
          const newFirstParaNode = $createPara(paraAttributes);
          if (newFirstParaNode) {
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
            if (newFirstParaNode.getMarker() !== parentPara.getMarker()) {
              parentPara.setMarker(newFirstParaNode.getMarker());
            }
            if (newFirstParaNode.getUnknownAttributes()) {
              parentPara.setUnknownAttributes(newFirstParaNode.getUnknownAttributes());
            }

            // Insert the second paragraph after the first one
            parentPara.insertAfter(secondParaNode);

            foundTargetPara = true;
            return true;
          }
        }
      }
      // Check if targetIndex is exactly at the end of this text node (between siblings)
      if (targetIndex === currentIndex + textLength) {
        const parentPara = currentNode.getParent();
        if ($isParaNode(parentPara)) {
          // Split is happening between this text node and the next sibling
          logger?.debug(
            `Splitting ParaNode (marker: ${parentPara.getMarker()}) between siblings at ` +
              `targetIndex ${targetIndex}`,
          );

          // Create new ParaNode with LF attributes (for the FIRST paragraph)
          const newFirstParaNode = $createPara(paraAttributes);
          if (newFirstParaNode) {
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
            if (newFirstParaNode.getMarker() !== parentPara.getMarker()) {
              parentPara.setMarker(newFirstParaNode.getMarker());
            }
            if (newFirstParaNode.getUnknownAttributes()) {
              parentPara.setUnknownAttributes(newFirstParaNode.getUnknownAttributes());
            }

            // Insert the second paragraph after the first one
            parentPara.insertAfter(secondParaNode);

            foundTargetPara = true;
            return true;
          }
        }
      }
      currentIndex += textLength;
    } else if ($isAtomicEmbedNode(currentNode)) {
      currentIndex += 1;
    } else if ($isCharNode(currentNode)) {
      // CharNodes don't contribute to OT length, they're just formatted text containers
      // No OT length contribution for the CharNode itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      currentIndex += 1; // For the container tag itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    } else if ($isSomeParaNode(currentNode)) {
      // First, process children to find current position
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }

      // currentIndex is now at the end of this para's content
      // Check if targetIndex matches the para's closing marker position
      if (targetIndex === currentIndex) {
        if ($isImpliedParaNode(currentNode)) {
          logger?.debug(
            `Replacing ImpliedParaNode (key: ${currentNode.getKey()}) with ParaNode at ` +
              `targetIndex ${targetIndex}`,
          );
          const newParaNode = $createPara(paraAttributes);

          // Replace the ImpliedParaNode with the new ParaNode
          if (newParaNode) {
            currentNode.replace(newParaNode, true);
            foundTargetPara = true;
            return true;
          }
        } else if ($isParaNode(currentNode)) {
          const paraNode: ParaNode = currentNode;
          // LF with attributes should ALWAYS create a new paragraph after regular ParaNode
          logger?.debug(
            "Creating new ParaNode with LF attributes after existing ParaNode " +
              `(marker: ${paraNode.getMarker()}) at targetIndex ${targetIndex}`,
          );

          const newParaNode = $createPara(paraAttributes);
          if (newParaNode) {
            // Insert the new paragraph with LF attributes after the current one
            paraNode.insertAfter(newParaNode);

            foundTargetPara = true;
            return true;
          }
        }
      }

      // Advance by 1 for the para's closing marker
      currentIndex += 1;

      // Check if targetIndex matches the position after this para (for inserting after the para)
      if (targetIndex === currentIndex) {
        if ($isParaNode(currentNode)) {
          // LF with attributes should create a new paragraph after this ParaNode
          logger?.debug(
            `Creating new ParaNode after existing ParaNode (marker: ${currentNode.getMarker()}) ` +
              `at targetIndex ${targetIndex}`,
          );

          const newParaNode = $createPara(paraAttributes);
          if (newParaNode) {
            // Insert the new paragraph with LF attributes after the current one
            currentNode.insertAfter(newParaNode);

            foundTargetPara = true;
            return true;
          }
        }
      }
    } else if ($isElementNode(currentNode)) {
      // Other ElementNodes (like RootNode)
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
    } else if ($isCharNode(currentNode)) {
      // CharNodes don't contribute to OT length, they're just formatted text containers
      // No OT length contribution for the CharNode itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    } else if ($isContainerEmbedNode(currentNode)) {
      // True container embeds have an OT length of 1 for their "tag", then their children are processed.
      currentIndex += 1; // For the container tag itself
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($traverseAndHandleNewline(child)) return true;
        if (foundTargetPara) break;
      }
    } else if ($isSomeParaNode(currentNode)) {
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
      // Other ElementNodes (like RootNode)
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

type AtomicEmbedNode =
  | BookNode
  | SomeChapterNode
  | SomeVerseNode
  | MilestoneNode
  | ImmutableUnmatchedNode;

/**
 * Type guard to check if a node is a atomic embed (BookNode, SomeChapterNode, SomeVerseNode,
 * MilestoneNode, or ImmutableUnmatchedNode). Atomic embeds have an OT length of 1 and are
 * self-contained (no children to process).
 */
function $isAtomicEmbedNode(node: LexicalNode): node is AtomicEmbedNode {
  return (
    $isBookNode(node) ||
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

function $createChapter(chapterData: OTEmbedChapter, viewOptions: ViewOptions) {
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

function $createVerse(verseData: OTEmbedVerse, viewOptions: ViewOptions) {
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

function $createMilestone(msData: OTEmbedMilestone) {
  const { style, sid, eid } = msData;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(msData, OT_MILESTONE_PROPS);
  return $createMilestoneNode(style, sid, eid, unknownAttributes);
}

function $createPara(paraData: OTEmbedPara) {
  const { style } = paraData;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(paraData, OT_PARA_PROPS);
  return $createParaNode(style, unknownAttributes);
}

function $createChar(charData: OTEmbedChar) {
  const { style } = charData;
  if (!style) return;

  const unknownAttributes = getUnknownAttributes(charData, OT_CHAR_PROPS);
  return $createCharNode(style, unknownAttributes);
}

/**
 * Type guard to check if an object has a specific property that is a non-null object.
 * @param embedObj The object to check.
 * @param embedType The property key to check for.
 * @returns `true` if `embedObj` has a property `embedType` and `embedObj[embedType]` is a non-null
 *   object, `false` otherwise.
 * @template T The type of the object.
 * @template K The type of the property key.
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

function applyTextAttributes(attributes: AttributeMap | undefined, textNode: TextNode) {
  if (!attributes) return;

  for (const key of Object.keys(attributes)) {
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
    // TODO: Handle other non-format attributes if necessary.
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
