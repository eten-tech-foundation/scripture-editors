import { $getRoot, $createTextNode, $isElementNode, $isTextNode, LexicalNode } from "lexical";
import { Op } from "quill-delta";
import { $createImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import { $isUnknownNode } from "shared/nodes/features/UnknownNode";
import { $isCharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $isSomeChapterNode } from "shared/nodes/usj/node.utils";
import { $isNoteNode } from "shared/nodes/usj/NoteNode";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";

/**
 * Apply Operational Transform updates to the editor.
 * @param ops - Operations array.
 * @param logger - Logger to use, if any.
 */
export function $applyUpdate(ops: Op[], logger?: LoggerBasic) {
  /** Tracks the current position in the OT document */
  let currentIndex = 0;
  ops.forEach((op) => {
    if ("retain" in op) {
      if (typeof op.retain !== "number" || op.retain < 0) {
        logger?.error(`Invalid retain operation: ${JSON.stringify(op)}`);
        return;
      }

      logger?.debug(`Retain: ${op.retain}`);
      // TODO: Handle attributes if present in op.attributes
      currentIndex += op.retain;
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
        $insertStringAtCurrentIndex(currentIndex, op.insert, logger);
        currentIndex += op.insert.length;
      } else if (typeof op.insert === "object" && op.insert != null) {
        logger?.debug(`Insert embed: ${JSON.stringify(op.insert)}`);
        const wasEmbedInserted = $insertEmbedAtCurrentIndex(currentIndex, op.insert, logger);
        if (wasEmbedInserted) {
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

// Helper function to delete text starting at a given flat index from the document
function $deleteTextAtCurrentIndex(targetIndex: number, count: number, logger?: LoggerBasic) {
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
    } else if ($isSomeChapterNode(currentNode) || $isSomeVerseNode(currentNode)) {
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

function $insertStringAtCurrentIndex(
  targetIndex: number,
  textToInsert: string,
  logger?: LoggerBasic,
) {
  if (textToInsert.length <= 0) {
    logger?.debug("Attempted to insert empty string. No action taken.");
    return;
  }

  const root = $getRoot();
  let charWalkerOffset = 0;
  let insertionPointFound = false;

  // Inner recursive function to find and insert text
  function $findAndInsertRecursive(
    currentNode: LexicalNode,
  ): boolean /* true if insertion is done */ {
    if (insertionPointFound) return true;

    if ($isTextNode(currentNode)) {
      const textLength = currentNode.getTextContentSize();
      // Check if the targetIndex is within this text node's span
      if (targetIndex >= charWalkerOffset && targetIndex <= charWalkerOffset + textLength) {
        const offsetInNode = targetIndex - charWalkerOffset;
        currentNode.spliceText(offsetInNode, 0, textToInsert);
        logger?.debug(
          `Inserted "${textToInsert}" in TextNode (key: ${currentNode.getKey()}) at nodeOffset ${offsetInNode}. ` +
            `Original targetIndex: ${targetIndex}, charWalkerOffset at node start: ${charWalkerOffset}.`,
        );
        insertionPointFound = true;
        return true;
      }
      charWalkerOffset += textLength;
    } else if ($isSomeChapterNode(currentNode) || $isSomeVerseNode(currentNode)) {
      // These nodes contribute to length. Insertion typically happens in adjacent TextNodes
      // or by creating new TextNodes, handled by traversal logic.
      charWalkerOffset += 1;
    } else if ($isElementNode(currentNode)) {
      let elementEmbedLength = 0;
      let isParaLikeContainer = false; // Can this element directly contain the inserted text?

      if ($isParaNode(currentNode)) {
        elementEmbedLength = 1;
        isParaLikeContainer = true;
      } else if (
        $isCharNode(currentNode) ||
        $isNoteNode(currentNode) ||
        $isUnknownNode(currentNode)
      ) {
        // These are single-character embeds, not containers for arbitrary text insertion within them.
        elementEmbedLength = 1;
      }
      // ImpliedParaNode or other generic ElementNodes (like RootNode) don't have their own embed length.

      const offsetAtElementStart = charWalkerOffset;

      // Case 1: targetIndex is exactly at the start of a ParaNode-like embed.
      // This means insert text at the beginning of this container's content.
      if (isParaLikeContainer && targetIndex === offsetAtElementStart) {
        const firstChild = currentNode.getFirstChild();
        if ($isTextNode(firstChild)) {
          firstChild.spliceText(0, 0, textToInsert);
        } else {
          const newTextNode = $createTextNode(textToInsert);
          // If firstChild exists, insert before it. Otherwise (ParaNode is empty), append.
          if (firstChild) {
            firstChild.insertBefore(newTextNode);
          } else {
            currentNode.append(newTextNode);
          }
        }
        logger?.debug(
          `Inserted "${textToInsert}" at beginning of ParaNode-like container (key: ${currentNode.getKey()}). ` +
            `targetIndex: ${targetIndex}, charWalkerOffset at container start: ${offsetAtElementStart}.`,
        );
        insertionPointFound = true;
        return true;
      }

      // Advance charWalkerOffset for the element's own embed length (if any)
      if (elementEmbedLength > 0) {
        charWalkerOffset += elementEmbedLength;
      }

      // Recurse into children
      const children = currentNode.getChildren();
      for (const child of children) {
        if ($findAndInsertRecursive(child)) return true; // Propagate if insertion happened
        if (insertionPointFound) break;
      }

      // Case 2: targetIndex is exactly at the end of a ParaNode-like container's content area.
      // charWalkerOffset here is *after* this element's embedLength and all its children have been processed.
      if (isParaLikeContainer && targetIndex === charWalkerOffset) {
        const newTextNode = $createTextNode(textToInsert);
        currentNode.append(newTextNode);
        logger?.debug(
          `Appended "${textToInsert}" to end of ParaNode-like container (key: ${currentNode.getKey()}). ` +
            `targetIndex: ${targetIndex}, charWalkerOffset after container content: ${charWalkerOffset}.`,
        );
        insertionPointFound = true;
        return true;
      }
    }
    // Other node types (e.g., specific DecoratorNodes not covered) might need length handling if they affect charWalkerOffset.
    return insertionPointFound;
  }

  $findAndInsertRecursive(root);

  // Fallback: If insertion point wasn't found by traversal (e.g., empty doc or append at very end of document)
  if (!insertionPointFound && targetIndex === charWalkerOffset) {
    logger?.debug(
      `Insertion point matches end of document (targetIndex: ${targetIndex}, final charWalkerOffset: ${charWalkerOffset}). Appending text to new ParaNode.`,
    );
    const newTextNode = $createTextNode(textToInsert);
    const newParaNode = $createParaNode().append(newTextNode);
    root.append(newParaNode);
    insertionPointFound = true;
  }

  if (!insertionPointFound) {
    logger?.warn(
      `$insertStringAtCurrentIndex: Could not find insertion point for text "${textToInsert}" at targetIndex ${targetIndex}. ` +
        `Final charWalkerOffset: ${charWalkerOffset}. Text not inserted.`,
    );
  }
}

/**
 * Inserts an embed (LexicalNode) at a given flat index in the document.
 * @param targetIndex - The 0-based index in the document's flat representation where the embed
 *   should be inserted.
 * @param embedObject - The object defining the embed, e.g., `{ chapter: { ... } }`.
 * @param logger - Logger to use, if any.
 * @returns `true` if the embed was successfully inserted, `false` otherwise.
 */
function $insertEmbedAtCurrentIndex(
  targetIndex: number,
  embedObject: object,
  logger?: LoggerBasic,
): boolean {
  let newNodeToInsert: LexicalNode | undefined;

  // Determine the LexicalNode to create based on the embedObject structure
  if (
    "chapter" in embedObject &&
    typeof embedObject.chapter === "object" &&
    embedObject.chapter != null
  ) {
    const chapterData = embedObject.chapter as { number: string; style: string };
    newNodeToInsert = $createImmutableChapterNode(chapterData.number);
  } else if (
    "verse" in embedObject &&
    typeof embedObject.verse === "object" &&
    embedObject.verse != null
  ) {
    const verseData = embedObject.verse as { number: string; style: string };
    newNodeToInsert = $createImmutableVerseNode(verseData.number);
  }
  // TODO: Add other embed types here as needed (e.g., Note, Milestone, Char)
  // else if ('note' in embedObject && ...) { newNodeToInsert = $createNoteNode(...); }

  if (!newNodeToInsert) {
    logger?.error(`Cannot create LexicalNode for embed object: ${JSON.stringify(embedObject)}`);
    return false;
  }

  const root = $getRoot();
  let currentOffset = 0;
  let wasInserted = false;

  // Recursive function to traverse the document and find the insertion point.
  function $traverseAndInsert(parentElement: LexicalNode): boolean {
    if (wasInserted) return true;

    // Handle insertion at the beginning of the document or into an empty root.
    // As per test expectations, embeds like chapters are wrapped in a ParaNode.
    if (parentElement === root && targetIndex === 0 && newNodeToInsert) {
      const firstChild = root.getFirstChild();
      if (!firstChild) {
        // Root is empty
        logger?.debug(
          `Inserting embed into empty root, wrapped in ParaNode. targetIndex: ${targetIndex}`,
        );
        const para = $createParaNode().append(newNodeToInsert);
        root.append(para);
        wasInserted = true;
        return true;
      }
      // If root is not empty, the loop below will handle inserting before the first child.
    }

    if (!$isElementNode(parentElement)) {
      // Should not happen if called correctly, as we only recurse on ElementNodes.
      return false;
    }

    const children = parentElement.getChildren();
    for (const child of children) {
      // If targetIndex matches currentOffset, insert newNodeToInsert *before* the current child.
      if (targetIndex === currentOffset && newNodeToInsert) {
        child.insertBefore(newNodeToInsert);
        logger?.debug(
          `Inserted embed ${newNodeToInsert.getType()} before child ${child.getType()} (key: ${child.getKey()}) in ${parentElement.getType()} (key: ${parentElement.getKey()}). targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        wasInserted = true;
        return true;
      }

      // Advance currentOffset based on the type of the child node.
      if ($isTextNode(child)) {
        currentOffset += child.getTextContentSize();
      } else if (
        $isSomeChapterNode(child) ||
        $isSomeVerseNode(child) ||
        $isParaNode(child) ||
        $isCharNode(child) ||
        $isNoteNode(child) ||
        $isUnknownNode(child)
        // TODO: Add other nodes that have a Delta length of 1.
      ) {
        currentOffset += 1;
      }

      if ($isElementNode(child) && !$isSomeChapterNode(child) && !$isSomeVerseNode(child)) {
        // For other ElementNodes (e.g., ImpliedParaNode), recurse. Their length is sum of children.
        if ($traverseAndInsert(child)) return true;
      }
      // Other node types (e.g., LineBreakNode, DecoratorNodes) might need specific length handling if they contribute to OT index.

      if (wasInserted) return true;
    }

    // After iterating all children, if targetIndex matches currentOffset,
    // it means the insertion point is at the end of parentElement's content.
    if (targetIndex === currentOffset && newNodeToInsert && $isElementNode(parentElement)) {
      if (parentElement === root) {
        // Append to root, wrapped in a ParaNode.
        logger?.debug(
          `Appending embed to root, wrapped in ParaNode. targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        const para = $createParaNode().append(newNodeToInsert);
        parentElement.append(para);
      } else if ($isParaNode(parentElement) /* || other suitable containers */) {
        logger?.debug(
          `Appending embed to ${parentElement.getType()} (key: ${parentElement.getKey()}). targetIndex: ${targetIndex}, currentOffset: ${currentOffset}`,
        );
        parentElement.append(newNodeToInsert);
      } else {
        // Fallback for other element types, may need refinement based on desired structure.
        logger?.warn(
          `Appending embed to a generic ElementNode ${parentElement.getType()} (key: ${parentElement.getKey()}) that might not be an ideal container. Review structure if issues arise. targetIndex: ${targetIndex}`,
        );
        parentElement.append(newNodeToInsert);
      }
      wasInserted = true;
      return true;
    }
    return wasInserted;
  }

  $traverseAndInsert(root);

  if (!wasInserted) {
    logger?.warn(
      `$insertEmbedAtCurrentIndex: Could not find insertion point for embed at targetIndex ${targetIndex}. ` +
        `Final currentOffset: ${currentOffset}. Embed not inserted.`,
    );
  }
  return wasInserted;
}
