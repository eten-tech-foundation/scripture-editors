/**
 * This file contains code adapted from the Lexical project:
 * https://github.com/facebook/lexical/blob/510720e727a6bdd86a10ebc2da03fa916746bbd4/packages/lexical-react/src/LexicalTypeaheadMenuPlugin.tsx
 *
 * Lexical is licensed under the MIT License.
 *
 * Changes made to the original code:
 * - Removed React-specific code and dependencies
 * - Adapted the typeahead functionality for use in a non-React environment
 * - Modified the trigger function to accept a custom trigger string
 * - Added additional utility functions for text manipulation
 */

import type { LexicalEditor, RangeSelection, TextNode } from "lexical";
import { $getSelection, $isRangeSelection, $isTextNode } from "lexical";
//TODO: This list is very language specific and probably should be externally supplied perhaps by the UI language setting.
export const PUNCTUATION = "\\.,\\+\\*\\?\\$\\@\\|#{}\\(\\)\\^\\-\\[\\]\\\\/!%'\"~=<>_:;";

export interface SuggestionsTextMatch {
  leadOffset: number;
  matchingString: string;
  replaceableString: string;
}

export type TriggerFn = (text: string, editor: LexicalEditor) => SuggestionsTextMatch | null;

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); // $& means the whole matched string
}

export function typeaheadTriggerMatch(
  trigger: string,
  { minLength = 1, maxLength = 75 }: { minLength?: number; maxLength?: number },
): TriggerFn {
  return (text: string) => {
    const validChars = `[^${escapeRegExp(trigger)}${PUNCTUATION}\\s]`;
    const typeaheadTriggerRegex = new RegExp(
      `(^|\\s|\\(|.)([${escapeRegExp(trigger)}]((?:${validChars}){0,${maxLength}}))$`,
    );

    const match = typeaheadTriggerRegex.exec(text);
    if (match !== null) {
      const maybeLeadingWhitespace = match[1];
      const matchingString = match[3];
      if (matchingString.length >= minLength) {
        return {
          leadOffset: match.index + maybeLeadingWhitespace.length,
          matchingString,
          replaceableString: match[2],
        };
      }
    }
    return null;
  };
}

function getTextUpToAnchor(selection: RangeSelection): string | null {
  const anchor = selection.anchor;
  if (anchor.type !== "text") {
    return null;
  }
  const anchorNode = anchor.getNode();
  if (!anchorNode.isSimpleText()) {
    return null;
  }
  const anchorOffset = anchor.offset;
  return anchorNode.getTextContent().slice(0, anchorOffset);
}

const defaultTrigger = (triggerText = "/", text: string, editor: LexicalEditor) =>
  typeaheadTriggerMatch(triggerText, { minLength: 0 })(text, editor);

function isSelectionOnEntityBoundary(editor: LexicalEditor, offset: number): boolean {
  if (offset !== 0) {
    return false;
  }
  return editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const anchor = selection.anchor;
      const anchorNode = anchor.getNode();
      const prevSibling = anchorNode.getPreviousSibling();
      return $isTextNode(prevSibling) && prevSibling.isTextEntity();
    }
    return false;
  });
}

function getQueryTextForSearch(editor: LexicalEditor): string | null {
  let text = null;
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) {
      return;
    }
    text = getTextUpToAnchor(selection);
  });
  return text;
}

function tryToPositionRange(leadOffset: number, range: Range, editorWindow: Window): boolean {
  const domSelection = editorWindow.getSelection();
  if (domSelection === null || !domSelection.isCollapsed) {
    return false;
  }
  const anchorNode = domSelection.anchorNode;
  const startOffset = leadOffset;
  const endOffset = domSelection.anchorOffset;

  if (anchorNode == null || endOffset == null) {
    return false;
  }

  try {
    range.setStart(anchorNode, startOffset);
    range.setEnd(anchorNode, endOffset);
  } catch {
    return false;
  }

  return true;
}

/**
 * Walk backwards along user input and forward through entity title to try
 * and replace more of the user's text with entity.
 */
function getFullMatchOffset(documentText: string, entryText: string, offset: number): number {
  let triggerOffset = offset;
  for (let i = triggerOffset; i <= entryText.length; i++) {
    if (documentText.substr(-i) === entryText.substr(0, i)) {
      triggerOffset = i;
    }
  }
  return triggerOffset;
}

/**
 * Split Lexical TextNode and return a new TextNode only containing matched text.
 * Common use cases include: removing the node, replacing with a new node.
 */
export function $splitNodeContainingQuery(match: SuggestionsTextMatch): TextNode | null {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }
  const anchor = selection.anchor;
  if (anchor.type !== "text") {
    return null;
  }
  const anchorNode = anchor.getNode();
  if (!anchorNode.isSimpleText()) {
    return null;
  }
  const selectionOffset = anchor.offset;
  const textContent = anchorNode.getTextContent().slice(0, selectionOffset);
  const characterOffset = match.replaceableString.length;
  const queryOffset = getFullMatchOffset(textContent, match.matchingString, characterOffset);
  const startOffset = selectionOffset - queryOffset;
  if (startOffset < 0) {
    return null;
  }
  let newNode;
  if (startOffset === 0) {
    [newNode] = anchorNode.splitText(selectionOffset);
  } else {
    [, newNode] = anchorNode.splitText(startOffset, selectionOffset);
  }

  return newNode;
}

export const registerTypeAheadListener = (
  editor: LexicalEditor,
  trigger?: string | TriggerFn,
  onTypeahead?: (
    value: null | {
      match: SuggestionsTextMatch;
      range: Range;
    },
  ) => void,
) => {
  return onTypeahead
    ? editor.registerUpdateListener(() => {
        editor.getEditorState().read(() => {
          const selection = $getSelection();

          // Ensure the selection is a collapsed range selection
          if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
            onTypeahead(null);
            return;
          }

          // Get the text up to the anchor point
          const text = getQueryTextForSearch(editor);
          if (text === null) {
            onTypeahead(null);
            return;
          }

          // Determine the match using the trigger function or default trigger
          const match =
            typeof trigger === "function"
              ? trigger(text, editor)
              : defaultTrigger(trigger, text, editor);

          // If no match or selection is on entity boundary, exit early
          if (match === null || isSelectionOnEntityBoundary(editor, match.leadOffset)) {
            onTypeahead(null);
            return;
          }

          // Create a range and try to position it
          const editorWindow = editor._window || window;
          const range = editorWindow.document.createRange();
          const isRangePositioned = tryToPositionRange(match.leadOffset, range, editorWindow);

          // Toggle typeahead with the match and range if positioned, otherwise null
          onTypeahead(isRangePositioned ? { match, range } : null);
        });
      })
    : undefined;
};
