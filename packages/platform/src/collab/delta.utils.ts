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
import { $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import {
  $createMilestoneNode,
  $isMilestoneNode,
  MilestoneNode,
} from "shared/nodes/usj/MilestoneNode";
import {
  $isSomeChapterNode,
  getUnknownAttributes,
  getVisibleOpenMarkerText,
  SomeChapterNode,
} from "shared/nodes/usj/node.utils";
import { $isNoteNode, NoteNode } from "shared/nodes/usj/NoteNode";
import { $createParaNode, $isParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { $createVerseNode } from "shared/nodes/usj/VerseNode";

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
          // If embed insertion fails, currentIndex is not advanced to prevent desync.
          logger?.error(
            `Failed to process insert embed operation: ${JSON.stringify(op.insert)} at index ${currentIndex}. Document may be inconsistent.`,
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
  // Handle char transformation: text to CharNode
  if (
    attributes.char &&
    typeof attributes.char === "object" &&
    attributes.char !== null &&
    "style" in attributes.char
  ) {
    const charEmbedData = attributes.char as OTEmbedChar;
    logger?.debug(
      `Attempting char transformation for range [${targetIndex}, ${targetIndex + retain - 1}] with char attributes: ${JSON.stringify(charEmbedData)}`,
    );

    const textToEmbed = $extractTextFromRangeInternal(targetIndex, retain, logger);

    if (textToEmbed !== undefined && textToEmbed.length > 0) {
      $deleteTextAtCurrentIndex(targetIndex, retain, logger);

      const newCharNode = $createChar(charEmbedData);
      if (!$isCharNode(newCharNode)) {
        logger?.error(
          `Failed to create CharNode for transformation. Style: ${charEmbedData.style}. Attributes: ${JSON.stringify(charEmbedData)}. Text was deleted.`,
        );
        return;
      }

      const textNode = $createTextNode(textToEmbed);
      const topLevelTextAttributes = { ...attributes };
      delete topLevelTextAttributes.char;
      applyTextAttributes(topLevelTextAttributes, textNode);
      newCharNode.append(textNode);

      if ($insertNodeAtCharacterOffset(targetIndex, newCharNode, logger)) {
        logger?.debug(
          `Successfully transformed text range (length ${retain}, content "${textToEmbed}") at index ${targetIndex} to CharNode: ${newCharNode.getKey()}`,
        );
        return;
      } else {
        logger?.error(
          `Failed to insert new CharNode (key: ${newCharNode.getKey()}) during transformation at index ${targetIndex}. Text was deleted. Attributes not fully applied.`,
        );
        return;
      }
    } else if (textToEmbed === undefined) {
      logger?.warn(
        `Char transformation: Failed to extract text for range [${targetIndex}, ${targetIndex + retain - 1}]. Skipping transformation, falling back to standard attribute application.`,
      );
    } else {
      // textToEmbed is ""
      logger?.debug(
        `Char transformation: Text to embed is empty for range [${targetIndex}, ${targetIndex + retain - 1}]. Skipping transformation, falling back to standard attribute application.`,
      );
    }
  }

  // Standard attribute application logic
  logger?.debug(
    `Applying standard attributes for range [${targetIndex}, ${targetIndex + retain - 1}] with attributes: ${JSON.stringify(attributes)}`,
  );
  let charsToFormat = retain;
  let charWalkerOffset = 0;
  const root = $getRoot();

  function $traverseAndApplyAttributesOriginalLogic(node: LexicalNode): boolean {
    if (charsToFormat <= 0) return true;

    if ($isTextNode(node)) {
      const textLength = node.getTextContentSize();
      if (
        targetIndex < charWalkerOffset + textLength &&
        charWalkerOffset < targetIndex + charsToFormat
      ) {
        const offsetInNode = Math.max(0, targetIndex - charWalkerOffset);
        const charsAvailableInNodeAfterOffset = textLength - offsetInNode;
        const charsToApplyInThisNode = Math.min(charsToFormat, charsAvailableInNodeAfterOffset);

        if (charsToApplyInThisNode > 0) {
          let targetNode = node;
          const needsSplitAtStart = offsetInNode > 0;
          const needsSplitAtEnd = charsToApplyInThisNode < textLength - offsetInNode;

          if (needsSplitAtStart && needsSplitAtEnd) {
            let middleNode;
            [, middleNode] = node.splitText(offsetInNode);
            [targetNode] = middleNode.splitText(charsToApplyInThisNode);
          } else if (needsSplitAtStart) {
            [, targetNode] = node.splitText(offsetInNode);
          } else if (needsSplitAtEnd) {
            [targetNode] = node.splitText(charsToApplyInThisNode);
          }
          applyTextAttributes(attributes, targetNode);
          charsToFormat -= charsToApplyInThisNode;
        }
      }
      charWalkerOffset += textLength;
    } else if (
      $isBookNode(node) ||
      $isSomeChapterNode(node) ||
      $isSomeVerseNode(node) ||
      $isMilestoneNode(node) ||
      $isImmutableUnmatchedNode(node)
    ) {
      if (targetIndex <= charWalkerOffset && charWalkerOffset < targetIndex + charsToFormat) {
        $applyEmbedAttributes(node, attributes);
        charsToFormat -= 1;
      }
      charWalkerOffset += 1;
    } else if ($isElementNode(node)) {
      let elementOtLength = 0;
      if ($isCharNode(node) || $isNoteNode(node) || $isParaNode(node) || $isUnknownNode(node)) {
        elementOtLength = 1;
        if (targetIndex <= charWalkerOffset && charWalkerOffset < targetIndex + charsToFormat) {
          $applyEmbedAttributes(node, attributes);
          charsToFormat -= elementOtLength;
        }
      }
      charWalkerOffset += elementOtLength;

      if (charsToFormat > 0) {
        const children = node.getChildren();
        for (const child of children) {
          if (charsToFormat <= 0) break;
          if ($traverseAndApplyAttributesOriginalLogic(child)) {
            if (charsToFormat <= 0) return true;
          }
        }
      }
    }
    return charsToFormat <= 0;
  }

  $traverseAndApplyAttributesOriginalLogic(root);
  if (charsToFormat > 0) {
    logger?.warn(
      `$applyAttributes: Not all characters in the retain operation (length ${retain}) could be processed. Remaining: ${charsToFormat}. targetIndex: ${targetIndex}, final charWalkerOffset: ${charWalkerOffset}`,
    );
  }
}

// Helper function to extract text from a given flat index and length from the document
function $extractTextFromRangeInternal(
  targetIndex: number,
  length: number,
  logger: LoggerBasic | undefined,
): string | undefined {
  if (length <= 0) {
    logger?.debug(
      "$extractTextFromRangeInternal: Requested length is 0 or less. Returning empty string.",
    );
    return "";
  }

  const root = $getRoot();
  let charWalkerOffset = 0;
  let remainingToExtract = length;
  let extractedText = "";
  let scanStartIndex = targetIndex;
  let scanEndIndex = targetIndex + length;

  logger?.debug(
    `$extractTextFromRangeInternal: Attempting to extract ${length} chars starting at index ${targetIndex}.`,
  );

  function $traverseAndExtract(currentNode: LexicalNode): boolean {
    if (remainingToExtract <= 0) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      const nodeStartOffsetInDoc = charWalkerOffset; // Renamed for clarity
      const nodeEndOffsetInDoc = charWalkerOffset + textLength;
      const effectiveStart = Math.max(scanStartIndex, nodeStartOffsetInDoc);
      const effectiveEnd = Math.min(scanEndIndex, nodeEndOffsetInDoc);

      if (effectiveStart < effectiveEnd) {
        const offsetInNode = effectiveStart - nodeStartOffsetInDoc;
        const countToExtractFromNode = effectiveEnd - effectiveStart;
        extractedText += currentNode
          .getTextContent()
          .substring(offsetInNode, offsetInNode + countToExtractFromNode);
        remainingToExtract -= countToExtractFromNode;
      }
      charWalkerOffset += textLength;
    } else if (
      $isBookNode(currentNode) ||
      $isSomeChapterNode(currentNode) ||
      $isSomeVerseNode(currentNode) ||
      $isMilestoneNode(currentNode) ||
      $isImmutableUnmatchedNode(currentNode)
    ) {
      const nodeOtLength = 1;
      if (scanStartIndex < charWalkerOffset + nodeOtLength && scanEndIndex > charWalkerOffset) {
        logger?.warn(
          `$extractTextFromRangeInternal: Range [${targetIndex}, ${targetIndex + length - 1}] includes non-text embed ${currentNode.getType()} at offset ${charWalkerOffset}. Text extraction might be partial or invalid for transformation.`,
        );
      }
      charWalkerOffset += nodeOtLength;
    } else if ($isElementNode(currentNode)) {
      let elementOtLength = 0;
      if (
        $isParaNode(currentNode) ||
        $isCharNode(currentNode) ||
        $isNoteNode(currentNode) ||
        $isUnknownNode(currentNode)
      ) {
        elementOtLength = 1;
      }
      if (
        elementOtLength > 0 &&
        scanStartIndex < charWalkerOffset + elementOtLength &&
        scanEndIndex > charWalkerOffset
      ) {
        logger?.warn(
          `$extractTextFromRangeInternal: Range [${targetIndex}, ${targetIndex + length - 1}] includes element ${currentNode.getType()} (OT length ${elementOtLength}) at offset ${charWalkerOffset}. Text extraction might be partial or invalid for transformation.`,
        );
      }
      charWalkerOffset += elementOtLength;

      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToExtract <= 0) break;
        if ($traverseAndExtract(child)) {
          if (remainingToExtract <= 0) return true;
        }
      }
    }
    return remainingToExtract <= 0;
  }

  $traverseAndExtract(root);

  if (remainingToExtract > 0) {
    logger?.warn(
      `$extractTextFromRangeInternal: Could not extract all ${length} chars. Extracted: "${extractedText}" (${extractedText.length}). Target: ${targetIndex}. Remaining: ${remainingToExtract}. Final charWalkerOffset: ${charWalkerOffset}.`,
    );
    return undefined;
  }
  return extractedText;
}

// Apply attributes to the given embed node
function $applyEmbedAttributes(
  node:
    | BookNode
    | SomeChapterNode
    | SomeVerseNode
    | MilestoneNode
    | NoteNode
    | CharNode
    | ParaNode
    | UnknownNode
    | ImmutableUnmatchedNode,
  attributes: AttributeMap,
) {
  for (const key of Object.keys(attributes)) {
    const value = attributes[key];
    if (typeof value !== "string") {
      // Skip non-string attributes
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
    } else if ($isCharNode(node) || $isParaNode(node) || $isUnknownNode(node)) {
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
  let charWalkerOffset = 0; // Tracks characters traversed so far in the document's text content
  let remainingToDelete = count;

  // Inner recursive function to find and delete text
  function $traverseAndDelete(
    currentNode: LexicalNode,
  ): boolean /* true if deletion is complete */ {
    if (remainingToDelete <= 0) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if the current text node is where the deletion should start or continue
      if (targetIndex < charWalkerOffset + textLength) {
        const offsetInNode = Math.max(0, targetIndex - charWalkerOffset);
        const deletableCharsInNode = textLength - offsetInNode;
        const numCharsToDeleteFromThisNode = Math.min(remainingToDelete, deletableCharsInNode);

        if (numCharsToDeleteFromThisNode > 0) {
          currentNode.spliceText(offsetInNode, numCharsToDeleteFromThisNode, "");
          logger?.debug(
            `Deleted ${numCharsToDeleteFromThisNode} chars from TextNode (key: ${currentNode.getKey()}) ` +
              `at nodeOffset ${offsetInNode}. Original targetIndex: ${targetIndex}, current charWalkerOffset: ${charWalkerOffset}.`,
          );
          remainingToDelete -= numCharsToDeleteFromThisNode;
        }
      }
      charWalkerOffset += textLength;
    } else if (
      $isSomeChapterNode(currentNode) ||
      $isSomeVerseNode(currentNode) ||
      $isMilestoneNode(currentNode)
    ) {
      charWalkerOffset += 1;
    } else if ($isElementNode(currentNode)) {
      let elementEmbedLength = 0;
      // Determine if this element node is treated as an embed with a specific length
      // in the Delta model.
      if (
        $isParaNode(currentNode) ||
        $isCharNode(currentNode) ||
        $isNoteNode(currentNode) ||
        $isUnknownNode(currentNode)
      ) {
        elementEmbedLength = 1; // Assume these embeds have a Delta length of 1
      }

      if (elementEmbedLength > 0) {
        // If the deletion target is within this embed itself, this function (for text deletion)
        // might not be the right place to handle it. For now, we assume deletion targets text
        // that appears after such embeds.
        // We advance charWalkerOffset past this embed.
        charWalkerOffset += elementEmbedLength;
      }

      const children = currentNode.getChildren();
      for (const child of children) {
        if (remainingToDelete <= 0) break;
        if ($traverseAndDelete(child)) {
          if (remainingToDelete <= 0) return true;
        }
      }
    }
    // Other node types (LineBreakNode, DecoratorNode, Embeds) might need specific length handling for charWalkerOffset.

    return remainingToDelete <= 0; // Return true if deletion is complete
  }

  $traverseAndDelete(root);

  if (remainingToDelete > 0) {
    logger?.warn(
      `Delete operation could not remove all requested characters. ` +
        `Remaining to delete: ${remainingToDelete}. Original targetIndex: ${targetIndex}, count: ${count}. Final charWalkerOffset: ${charWalkerOffset}`,
    );
  }
}

/**
 * Inserts text or a CharNode at a given flat index in the document.
 * If attributes.char is present, a CharNode is created and inserted.
 * Otherwise, plain text is inserted, potentially with formatting attributes.
 * @param targetIndex - The index in the document's flat representation.
 * @param textToInsert - The string to insert.
 * @param attributes - Optional attributes for the insert operation.
 * @param logger - Logger to use, if any.
 * @returns The length to advance the currentIndex in $applyUpdate (1 for CharNode, text.length for text).
 */
function $insertTextAtCurrentIndex(
  targetIndex: number,
  textToInsert: string,
  attributes: AttributeMap | undefined,
  logger?: LoggerBasic,
): number {
  if (typeof attributes?.char === "object") {
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
        )}. Falling back to plain text insertion.`,
      );
      // Fallback to plain text insertion
      return $insertPlainTextInternal(targetIndex, textToInsert, undefined, logger);
    }

    const textNode = $createTextNode(textToInsert);
    // Apply other non-char attributes (e.g., bold) to the text node *inside* the char node if necessary
    if (attributes) {
      const textAttributes = { ...attributes };
      delete textAttributes.char; // Remove char attribute as it's handled by CharNode
      // TODO: Apply these textAttributes to the textNode if any (e.g., bold, italic)
      // For now, assuming CharNode itself carries all necessary style, and text inside is plain
      // or inherits from CharNode's context.
    }
    charNode.append(textNode);

    if ($insertNodeAtCharacterOffset(targetIndex, charNode, logger)) {
      return 1 + textToInsert.length; // CharNode counts as 1 in OT length
    } else {
      logger?.error(
        `Failed to insert CharNode with text "${textToInsert}" at index ${targetIndex}. Falling back to plain text.`,
      );
      // Fallback to plain text insertion if CharNode insertion fails
      return $insertPlainTextInternal(targetIndex, textToInsert, undefined, logger);
    }
  } else {
    // Handle plain text insertion (possibly with formatting like bold, italic)
    logger?.debug(
      `Attempting to insert text "${textToInsert}" with attributes ${JSON.stringify(
        attributes,
      )} at index ${targetIndex}`,
    );
    return $insertPlainTextInternal(targetIndex, textToInsert, attributes, logger);
  }
}

/**
 * Internal helper to insert plain text, potentially with formatting.
 * This function contains the core logic for text node insertion and splitting.
 * @returns The length of the inserted text.
 */
function $insertPlainTextInternal(
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
  let charWalkerOffset = 0;
  let insertionPointFound = false;

  function $findAndInsertRecursive(currentNode: LexicalNode): boolean {
    if (insertionPointFound) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      if (targetIndex >= charWalkerOffset && targetIndex <= charWalkerOffset + textLength) {
        const offsetInNode = targetIndex - charWalkerOffset;

        const newTextNode = $createTextNode(textToInsert);
        applyTextAttributes(textAttributes, newTextNode);

        // Splice and insert
        if (offsetInNode === 0) {
          currentNode.insertBefore(newTextNode);
        } else if (offsetInNode === textLength) {
          currentNode.insertAfter(newTextNode);
        } else {
          const [, tailNode] = currentNode.splitText(offsetInNode);
          tailNode.insertBefore(newTextNode);
        }

        logger?.debug(
          `Inserted text "${textToInsert}" in/around TextNode (key: ${currentNode.getKey()}) at nodeOffset ${offsetInNode}. ` +
            `Original targetIndex: ${targetIndex}, charWalkerOffset at node start: ${charWalkerOffset}.`,
        );
        insertionPointFound = true;
        return true;
      }
      charWalkerOffset += textLength;
    } else if (
      $isBookNode(currentNode) ||
      $isSomeChapterNode(currentNode) ||
      $isSomeVerseNode(currentNode) ||
      $isMilestoneNode(currentNode) ||
      $isImmutableUnmatchedNode(currentNode)
    ) {
      charWalkerOffset += 1;
    } else if ($isElementNode(currentNode)) {
      let elementEmbedLength = 0;
      if (
        $isParaNode(currentNode) ||
        $isCharNode(currentNode) ||
        $isNoteNode(currentNode) ||
        $isUnknownNode(currentNode)
      ) {
        elementEmbedLength = 1; // These elements count as 1 in OT length
      }

      let isParaLikeContainer = false;
      if ($isParaNode(currentNode) || $isImpliedParaNode(currentNode)) isParaLikeContainer = true;

      const offsetAtElementStart = charWalkerOffset;

      if (isParaLikeContainer && targetIndex === offsetAtElementStart) {
        const newTextNode = $createTextNode(textToInsert);
        applyTextAttributes(textAttributes, newTextNode);
        const firstChild = currentNode.getFirstChild();
        if (firstChild) {
          firstChild.insertBefore(newTextNode);
        } else {
          currentNode.append(newTextNode);
        }
        logger?.debug(
          `Inserted text "${textToInsert}" at beginning of container ${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }

      charWalkerOffset += elementEmbedLength; // Advance by element's own length before traversing children

      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true;
        if (insertionPointFound) break;
      }

      // After children, charWalkerOffset is at the end of this element's content for OT purposes
      if (isParaLikeContainer && targetIndex === charWalkerOffset) {
        const newTextNode = $createTextNode(textToInsert);
        applyTextAttributes(textAttributes, newTextNode);
        currentNode.append(newTextNode);
        logger?.debug(
          `Appended text "${textToInsert}" to end of container ${currentNode.getType()} (key: ${currentNode.getKey()}).`,
        );
        insertionPointFound = true;
        return true;
      }
    }
    return insertionPointFound;
  }

  $findAndInsertRecursive(root);

  if (!insertionPointFound && targetIndex === charWalkerOffset) {
    logger?.debug(
      `Insertion point matches end of document (targetIndex: ${targetIndex}, final charWalkerOffset: ${charWalkerOffset}). Appending text to new ParaNode.`,
    );
    const newTextNode = $createTextNode(textToInsert);
    applyTextAttributes(textAttributes, newTextNode);
    const newParaNode = $createParaNode().append(newTextNode);
    root.append(newParaNode);
    insertionPointFound = true;
  }

  if (!insertionPointFound) {
    logger?.warn(
      `$insertPlainTextInternal: Could not find insertion point for text "${textToInsert}" at targetIndex ${targetIndex}. ` +
        `Final charWalkerOffset: ${charWalkerOffset}. Text not inserted.`,
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
  let charWalkerOffset = 0;
  let wasInserted = false;

  function $traverseAndInsertRecursive(parentElement: LexicalNode): boolean {
    if (wasInserted) return true;

    // Case: Empty document or inserting at the very beginning (targetIndex 0)
    // This specific block handles insertion into an empty root or right before the first actual content.
    if (parentElement === root && targetIndex === 0) {
      const firstChild = root.getFirstChild();
      if (!firstChild) {
        // Empty root
        logger?.debug(`Inserting node into empty root (targetIndex: ${targetIndex}).`);
        if ($isElementNode(nodeToInsert) && nodeToInsert.isInline()) {
          const para = $createParaNode().append(nodeToInsert);
          root.append(para);
        } else {
          root.append(nodeToInsert);
        }
        wasInserted = true;
        return true;
      }
      // If not empty root but targetIndex is 0, it means insert before the firstChild.
      // This will be handled by the loop logic's "insertBefore" if firstChild is an Element,
      // or by TextNode logic if firstChild is Text.
    }

    if (!$isElementNode(parentElement)) {
      return false; // Should not happen if called with ElementNode initially
    }

    const children = parentElement.getChildren();
    for (const child of children) {
      if ($isTextNode(child)) {
        const textLength = child.getTextContentSize();
        if (targetIndex >= charWalkerOffset && targetIndex <= charWalkerOffset + textLength) {
          const offsetInNode = targetIndex - charWalkerOffset;
          logger?.debug(
            `Found insertion point in TextNode (key: ${child.getKey()}) at offset ${offsetInNode}. targetIndex: ${targetIndex}, charWalkerOffset: ${charWalkerOffset}`,
          );
          if (offsetInNode === 0) {
            child.insertBefore(nodeToInsert);
          } else if (offsetInNode === textLength) {
            child.insertAfter(nodeToInsert);
          } else {
            const [, tailNode] = child.splitText(offsetInNode);
            tailNode.insertBefore(nodeToInsert);
          }
          wasInserted = true;
          return true;
        }
        charWalkerOffset += textLength;
      } else {
        // Element Node
        let childOtItselfLength = 0;
        if (
          $isBookNode(child) ||
          $isSomeChapterNode(child) ||
          $isSomeVerseNode(child) ||
          $isMilestoneNode(child) ||
          $isCharNode(child) ||
          $isNoteNode(child) ||
          $isUnknownNode(child) ||
          $isImmutableUnmatchedNode(child) ||
          $isParaNode(child) // Ensure ParaNode is treated as a 1-length OT item
        ) {
          childOtItselfLength = 1;
        }

        // Try to insert *before* the current child if targetIndex is at its start
        if (targetIndex === charWalkerOffset) {
          logger?.debug(
            `Inserting node ${nodeToInsert.getType()} before child ${child.getType()} (key: ${child.getKey()}) in ${parentElement.getType()} (key: ${parentElement.getKey()}). targetIndex: ${targetIndex}, charWalkerOffset: ${charWalkerOffset}`,
          );
          child.insertBefore(nodeToInsert);
          wasInserted = true;
          return true;
        }

        // Advance charWalkerOffset by the child's own OT length.
        // This must happen *before* a potential recursive call into a container,
        // so that the recursive call uses the updated offset if its logic depends on it
        // (e.g., for its own children or its append logic).
        charWalkerOffset += childOtItselfLength;

        // If child is a container type we might recurse into, and we haven't inserted yet.
        // Relevant containers: ParaNode, CharNode, NoteNode, ImpliedParaNode (though ImpliedPara has 0 OT length itself).
        // RootNode is handled by the initial call.
        if (
          ($isParaNode(child) ||
            $isCharNode(child) ||
            $isNoteNode(child) ||
            $isImpliedParaNode(child)) && // Check if it's a type that can have children we'd insert into
          !wasInserted // And we haven't already inserted.
        ) {
          if ($traverseAndInsertRecursive(child)) {
            // child becomes parentElement for the recursive call
            // If insertion happened inside the child, wasInserted will be true.
            return true;
          }
        }
        // If not a container we recursed into, or if recursion didn't lead to insertion,
        // charWalkerOffset is now correctly positioned *after* this child.
        // The loop continues to the next sibling.
      }
    } // End children loop

    // After iterating all children of parentElement:
    // If targetIndex matches charWalkerOffset, it means the insertion is at the end of parentElement's content.
    if (targetIndex === charWalkerOffset && $isElementNode(parentElement)) {
      if (parentElement === root) {
        // Append to root, wrapped in a ParaNode.
        logger?.debug(
          `Appending embed to root, wrapped in ParaNode. targetIndex: ${targetIndex}, charWalkerOffset: ${charWalkerOffset}`,
        );
        const para = $createParaNode().append(nodeToInsert);
        parentElement.append(para);
      } else if ($isParaNode(parentElement) /* || other suitable containers */) {
        logger?.debug(
          `Appending embed to ${parentElement.getType()} (key: ${parentElement.getKey()}). targetIndex: ${targetIndex}, charWalkerOffset: ${charWalkerOffset}`,
        );
        parentElement.append(nodeToInsert);
      } else {
        // Fallback for other element types, may need refinement based on desired structure.
        logger?.warn(
          `Appending embed to a generic ElementNode ${parentElement.getType()} (key: ${parentElement.getKey()}) that might not be an ideal container. Review structure if issues arise. targetIndex: ${targetIndex}`,
        );
        parentElement.append(nodeToInsert);
      }
      wasInserted = true;
      return true;
    }

    return wasInserted; // Should be false if no insertion happened in this path
  }

  $traverseAndInsertRecursive(root);

  // Fallback: If insertion point wasn't found by traversal (e.g., empty doc or append at very end of document)
  // This condition might be redundant if the main traversal logic correctly handles appending to root/para.
  if (!wasInserted && targetIndex === charWalkerOffset && root.getChildrenSize() === 0) {
    logger?.debug(
      `Fallback: Inserting node into empty root (targetIndex: ${targetIndex}, charWalkerOffset: ${charWalkerOffset}).`,
    );
    if ($isElementNode(nodeToInsert) && nodeToInsert.isInline()) {
      const para = $createParaNode().append(nodeToInsert);
      root.append(para);
    } else {
      root.append(nodeToInsert);
    }
    wasInserted = true;
  }

  if (!wasInserted) {
    logger?.warn(
      `$insertNodeAtCharacterOffset: Could not find insertion point for node ${nodeToInsert.getType()} at targetIndex ${targetIndex}. ` +
        `Final charWalkerOffset: ${charWalkerOffset}. Node not inserted.`,
    );
  }
  return wasInserted;
}

/**
 * Inserts an embed (LexicalNode) at a given flat index in the document.
 * @param targetIndex - The index in the document's flat representation where the embed
 *   should be inserted.
 * @param embedObject - The object defining the embed, e.g., `{ chapter: { ... } }`.
 * @param viewOptions - View options of the editor.
 * @param logger - Logger to use, if any.
 * @returns `true` if the embed was successfully inserted, `false` otherwise.
 */
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
    logger?.error(`Cannot create LexicalNode for embed object: ${JSON.stringify(embedObject)}`);
    return false;
  }

  const nodeToInsert: LexicalNode = newNodeToInsert;
  const root = $getRoot();
  let currentOffset = 0;
  let wasInserted = false;

  // Recursive function to traverse the document and find the insertion point.
  function $traverseAndInsertRecursive(parentNode: LexicalNode): boolean {
    if (wasInserted) return true;

    // Handle insertion at the beginning of the document or into an empty root.
    if (parentNode === root && targetIndex === 0) {
      const firstChild = root.getFirstChild();
      if (!firstChild) {
        // Root is empty
        logger?.debug(
          `Inserting embed into empty root, wrapped in ParaNode. targetIndex: ${targetIndex}`,
        );
        const para = $createParaNode().append(nodeToInsert);
        root.append(para);
        wasInserted = true;
        return true;
      }
      // If root is not empty, the loop below will handle inserting before the first child.
    }

    if (!$isElementNode(parentNode)) {
      // Should not happen if called correctly, as we only recurse on ElementNodes.
      return false;
    }

    const children = parentNode.getChildren();
    for (const child of children) {
      // Case 1: Insert *before* the current child
      if (targetIndex === currentOffset) {
        child.insertBefore(nodeToInsert);
        logger?.debug(
          `Inserted embed ${nodeToInsert.getType()} before child ${child.getType()} (key: ${child.getKey()}) in ${parentNode.getType()} (key: ${parentNode.getKey()}). targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        wasInserted = true;
        return true;
      }

      // Case 2: Process current `child`
      if ($isTextNode(child)) {
        const textLength = child.getTextContentSize();
        // Case 2a: Insert *within* this TextNode
        if (targetIndex > currentOffset && targetIndex < currentOffset + textLength) {
          const splitOffset = targetIndex - currentOffset;
          const splitNodes = child.splitText(splitOffset);
          splitNodes[0].insertAfter(nodeToInsert);
          logger?.debug(
            `Inserted embed ${nodeToInsert.getType()} by splitting TextNode at offset ${splitOffset}. targetIndex: ${targetIndex}, currentOffset at node start: ${currentOffset}`,
          );
          wasInserted = true;
          return true;
        }
        // If not inserted within, advance offset by full length of text node
        currentOffset += textLength;
      } else if ($isSomeChapterNode(child) || $isSomeVerseNode(child) || $isMilestoneNode(child)) {
        currentOffset += 1;
      } else if ($isElementNode(child)) {
        let childOtLength = 0;
        let isAtomicEmbed = false;

        if ($isCharNode(child) || $isNoteNode(child) || $isUnknownNode(child)) {
          childOtLength = 1;
          isAtomicEmbed = true; // These are generally atomic and don't contain further indexed content for OT
        } else if ($isParaNode(child)) {
          childOtLength = 1; // ParaNode itself counts as 1 for its tag
        }
        // else: ImpliedParaNode, RootNode (parentElement) - their OT length is 0, content is traversed.

        // Advance currentOffset by the OT length of the element itself
        currentOffset += childOtLength;

        // Recurse if it's not an atomic embed (i.e., it's a container like ParaNode or ImpliedParaNode)
        if (!isAtomicEmbed) {
          if ($traverseAndInsertRecursive(child)) return true;
        }
      }
      // Else: other node types (LineBreakNode, DecoratorNode) - assume 0 OT length for now.
    } // End for loop over children

    // After iterating all children of parentElement, if targetIndex matches currentOffset,
    // it means the insertion point is at the end of parentElement's content.
    if (targetIndex >= currentOffset && $isElementNode(parentNode)) {
      if (parentNode === root) {
        // Append to root, potentially wrapped in a ParaNode if inline.
        logger?.debug(
          `Appending embed to root. targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        if ($isElementNode(nodeToInsert) && nodeToInsert.isInline()) {
          const para = $createParaNode().append(nodeToInsert);
          parentNode.append(para);
        } else {
          parentNode.append(nodeToInsert);
        }
      } else if (targetIndex === currentOffset && !nodeToInsert.isInline()) {
        parentNode.insertAfter(nodeToInsert);
      } else if ($isParaNode(parentNode) /* || other suitable containers */) {
        logger?.debug(
          `Appending embed to ${parentNode.getType()} (key: ${parentNode.getKey()}). targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        parentNode.append(nodeToInsert);
      } else {
        // Fallback for other element types, may need refinement based on desired structure.
        logger?.warn(
          `Appending embed to a generic ElementNode ${parentNode.getType()} (key: ${parentNode.getKey()}) that might not be an ideal container. Review structure if issues arise. targetIndex: ${targetIndex}`,
        );
        parentNode.append(nodeToInsert);
      }
      wasInserted = true;
      return true;
    }

    return wasInserted;
  }

  $traverseAndInsertRecursive(root);

  if (!wasInserted) {
    logger?.warn(
      `$insertEmbedAtCurrentIndex: Could not find insertion point for embed at targetIndex ${targetIndex}. ` +
        `Final currentOffset: ${currentOffset}. Embed not inserted.`,
    );
  }
  return wasInserted;
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
 * @returns `true` if `embedObj` has a property `embedType` and `embedObj[embedType]` is a non-null object, `false` otherwise.
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
  // After the 'embedType in embedObj' check, TypeScript knows that 'embedObj' has the property 'embedType'.
  // The type of 'embedObj' is narrowed to 'T & Record<K, unknown>'.
  // So, we can safely access embedObj[embedType], and its type will be 'unknown'.
  const value = (embedObj as T & Record<K, unknown>)[embedType];
  return typeof value === "object" && value !== null;
}

function applyTextAttributes(attributes: AttributeMap | undefined, textNode: TextNode) {
  if (!attributes) return;

  for (const key of Object.keys(attributes)) {
    // TODO: Text format attributes probably shouldn't be allowed but are helpful at the moment for testing.
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
