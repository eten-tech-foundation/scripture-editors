import {
  $isImmutableNoteCallerNode,
  $isImmutableVerseNode,
  defaultNoteCallers,
  ImmutableNoteCallerNode,
  UsjNodeOptions,
} from "../../nodes/usj";
import { ViewOptions } from "../../views/view-options.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $findMatchingParent, mergeRegister } from "@lexical/utils";
import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_LOW,
  EditorState,
  LexicalEditor,
  NodeMutation,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import { useEffect, useRef } from "react";
import {
  $findFirstAncestorNoteNode,
  $getNoteCallerPreviewText,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isSomeParaNode,
  CharNode,
  GENERATOR_NOTE_CALLER,
  LoggerBasic,
  NBSP,
  NoteNode,
} from "shared";

export interface CounterStyleRuleLike {
  name: string;
  symbols: string;
  type?: number;
}

/**
 * This plugin is responsible for handling NoteNode and NoteNodeCaller interactions. It also
 * updates the counter style symbols for note callers when the node options change.
 * @param nodeOptions - Node options that includes the list of potential node callers.
 * @param viewOptions - View options of the editor.
 * @param logger - Logger to use, if any.
 * @returns
 */
export function NoteNodePlugin<TLogger extends LoggerBasic>({
  nodeOptions,
  viewOptions,
  logger,
}: {
  nodeOptions: UsjNodeOptions;
  viewOptions: ViewOptions | undefined;
  logger?: TLogger;
}): null {
  const [editor] = useLexicalComposerContext();
  useNodeOptions(nodeOptions, logger);
  useNoteNode(editor, viewOptions, logger);
  return null;
}

/**
 * This hook is responsible for handling updates to `nodeOptions`.
 * @param nodeOptions - Node options that includes the list of potential node callers.
 * @param logger - Logger to use, if any.
 */
function useNodeOptions(nodeOptions: UsjNodeOptions, logger?: LoggerBasic) {
  const previousNoteCallersRef = useRef<string[] | undefined>(undefined);
  const nodeOptionsNoteCallers = nodeOptions.noteCallers;

  useEffect(() => {
    let noteCallers = nodeOptionsNoteCallers;
    if (!noteCallers || noteCallers.length <= 0) noteCallers = defaultNoteCallers;
    if (previousNoteCallersRef.current !== noteCallers) {
      previousNoteCallersRef.current = noteCallers;
      updateCounterStyleSymbols("note-callers", noteCallers, logger);
    }
  }, [logger, nodeOptionsNoteCallers]);
}

/**
 * This hook is responsible for handling NoteNode and NoteNodeCaller interactions.
 * @param editor - The LexicalEditor instance used to access the DOM.
 * @param viewOptions - View options of the editor.
 */
function useNoteNode(
  editor: LexicalEditor,
  viewOptions: ViewOptions | undefined,
  logger: LoggerBasic | undefined,
) {
  const noteKeyRef = useRef<string | undefined>();

  useEffect(() => {
    if (!editor.hasNodes([CharNode, NoteNode, ImmutableNoteCallerNode])) {
      throw new Error(
        "NoteNodePlugin: CharNode, NoteNode or ImmutableNoteCallerNode not registered on editor!",
      );
    }

    const doubleClickListener = (event: MouseEvent) =>
      editor.update(() => $handleDoubleClick(event));

    return mergeRegister(
      // Remove NoteNode if it doesn't contain a caller node and ensure typed text goes before it.
      editor.registerNodeTransform(NoteNode, (node) => $noteNodeTransform(node, viewOptions)),

      // Update NoteNodeCaller preview text when NoteNode children text is changed.
      editor.registerNodeTransform(CharNode, $noteCharNodeTransform),
      editor.registerNodeTransform(TextNode, $noteTextNodeTransform),

      // Ensure NBSP after caller.
      editor.registerNodeTransform(ImmutableNoteCallerNode, $noteCallerNodeTransform),

      // Re-generate all note callers when a note is removed.
      editor.registerMutationListener(
        ImmutableNoteCallerNode,
        (nodeMutations, { prevEditorState }) =>
          generateNoteCallersOnDestroy(nodeMutations, prevEditorState),
      ),

      // Handle the cursor moving next to a NoteNode. NoteNode arrow key navigation when note is
      // after a verse node is handled in the ArrowNavigationPlugin.
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => $handleCursorNextToNoteNode(editor, viewOptions, noteKeyRef, logger),
        COMMAND_PRIORITY_LOW,
      ),

      // Handle double-click of a word immediately following a NoteNode (no space between).
      editor.registerRootListener(
        (rootElement: HTMLElement | null, prevRootElement: HTMLElement | null) => {
          if (prevRootElement !== null) {
            prevRootElement.removeEventListener("dblclick", doubleClickListener);
          }
          if (rootElement !== null) {
            rootElement.addEventListener("dblclick", doubleClickListener);
          }
        },
      ),
    );
  }, [editor, logger, viewOptions]);
}

/**
 * Cleans up a NoteNode to ensure it is valid.
 *
 * @remarks Removes a NoteNode if it does not contain an ImmutableNoteCallerNode child when
 * `markerMode` is not 'editable'. This can happen during certain editing operations or data
 * inconsistencies. Also if the first node is a TextNode move it before the NoteNode, i.e. the user
 * typed when the selection was at the beginning of a NoteNode.
 * @param node - The NoteNode to check.
 * @param viewOptions - The view options that includes the marker mode.
 */
function $noteNodeTransform(node: NoteNode, viewOptions: ViewOptions | undefined): void {
  const nodeChildren = node.getChildren();
  const hasNoteCaller = nodeChildren.some((child) => $isImmutableNoteCallerNode(child));
  if (!hasNoteCaller && viewOptions?.markerMode !== "editable") node.remove();

  if (nodeChildren.length > 0) {
    const firstChild = nodeChildren[0];
    if ($isTextNode(firstChild) && !$isMarkerNode(firstChild)) {
      node.insertBefore(firstChild);
    }
  }
}

/**
 * Changes in NoteNode children text are updated in the NoteNodeCaller preview text.
 * Also ensure NBSP after each note top-level node.
 * @param node - CharNode thats needs its preview text updated.
 */
function $noteCharNodeTransform(node: CharNode): void {
  const parent = node.getParentOrThrow();
  const children = parent.getChildren();
  const noteCaller = children.find((child) => $isImmutableNoteCallerNode(child));
  if (!$isCharNode(node) || !$isNoteNode(parent) || !noteCaller) return;

  const previewText = $getNoteCallerPreviewText(children);
  if (noteCaller.getPreviewText() !== previewText) noteCaller.setPreviewText(previewText);

  // Ensure NBSP after each note top-level CharNode
  const nextSibling = node.getNextSibling();
  if (!$isTextNode(nextSibling)) node.insertAfter($createTextNode(NBSP));
  else if (nextSibling.getTextContent() !== NBSP) nextSibling.setTextContent(NBSP);
}

/**
 * Changes in NoteNode children text are updated in the NoteNodeCaller preview text.
 * Also ensure NBSP after each note top-level CharNode isn't modified.
 * @param node - TextNode thats needs its preview text updated.
 */
function $noteTextNodeTransform(node: TextNode): void {
  const noteNode = $findFirstAncestorNoteNode(node);
  const children = noteNode?.getChildren();
  const noteCaller = children?.find((child) => $isImmutableNoteCallerNode(child));
  if (!$isTextNode(node) || !$isNoteNode(noteNode) || !noteCaller || !children) return;

  const previewText = $getNoteCallerPreviewText(children);
  if (noteCaller.getPreviewText() !== previewText) noteCaller.setPreviewText(previewText);

  if ($isMarkerNode(node) || !$isNoteNode(node.getParent())) return;

  if (node.getTextContent() !== NBSP) {
    node.setTextContent(NBSP);
    node.selectEnd();
  }
}

/**
 * Ensure NBSP after caller.
 * @param node - TextNode thats needs its preview text updated.
 */
function $noteCallerNodeTransform(node: ImmutableNoteCallerNode): void {
  if (!$isImmutableNoteCallerNode(node)) return;

  const nextSibling = node.getNextSibling();
  if (!$isTextNode(nextSibling) || $isMarkerNode(nextSibling))
    node.insertAfter($createTextNode(NBSP));
  else if (nextSibling.getTextContent() !== NBSP) nextSibling.setTextContent(NBSP);
}

/**
 * When a NoteNode is destroyed, check if it was generated and force a CSS reflow.
 * @param nodeMutations - Map of node mutations.
 * @param prevEditorState - The previous EditorState.
 */
function generateNoteCallersOnDestroy(
  nodeMutations: Map<string, NodeMutation>,
  prevEditorState: EditorState,
) {
  for (const [nodeKey, mutation] of nodeMutations) {
    if (mutation !== "destroyed") continue;

    const nodeWasGenerated = prevEditorState.read(() => {
      const node = $getNodeByKey<ImmutableNoteCallerNode>(nodeKey);
      const parent = node?.getParent();
      return (
        $isImmutableNoteCallerNode(node) &&
        $isNoteNode(parent) &&
        parent.getCaller() === GENERATOR_NOTE_CALLER
      );
    });
    const editorElement = document.querySelector<HTMLElement>(".editor-input");
    if (!nodeWasGenerated || !editorElement) continue;

    editorElement.classList.add("reset-counters");

    // Force a reflow to ensure the counter reset is applied
    void editorElement.offsetHeight;

    editorElement.classList.remove("reset-counters");
  }
}

function $handleCursorNextToNoteNode(
  editor: LexicalEditor,
  viewOptions: ViewOptions | undefined,
  noteKeyRef: React.MutableRefObject<string | undefined>,
  logger: LoggerBasic | undefined,
): false {
  if (viewOptions?.noteMode !== "expandInline") return false;

  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return false;

  const anchor = selection.anchor;
  const node = anchor.getNode();

  // Case 1: caret moved away from a NoteNode → collapse it
  if (noteKeyRef.current) {
    const noteAncestor = $findMatchingParent(node, (n) => $isNoteNode(n));
    if (!noteAncestor) {
      const note = $getNodeByKey<NoteNode>(noteKeyRef.current);
      if (note && !note.getIsCollapsed()) {
        logger?.debug("Cursor moved away from NoteNode, collapsing it");
        $toggleNoteCollapseWithFallback(editor, noteKeyRef.current, logger);
      }
      noteKeyRef.current = undefined;
    } else {
      // Still inside a NoteNode → keep tracking it.
      if (noteKeyRef.current !== noteAncestor.getKey()) {
        // Update key since we moved to a different note.
        noteKeyRef.current = noteAncestor.getKey();
      }
    }
  }

  // Case 2: caret at start of a text node → check prev sibling
  if (anchor.offset === 0) {
    const prev = node.getPreviousSibling();
    if ($isNoteNode(prev)) {
      logger?.debug("Cursor is just after a NoteNode");
      const noteKey = prev.getKey();
      if (prev.getIsCollapsed()) noteKeyRef.current = noteKey;
      else noteKeyRef.current = undefined;
      $toggleNoteCollapseWithFallback(editor, noteKey, logger);
    }
  }

  // Case 3: caret at end of a text node → check next sibling
  if (anchor.offset === node.getTextContentSize()) {
    const next = node.getNextSibling();
    if ($isNoteNode(next)) {
      logger?.debug("Cursor is just before a NoteNode");
      const noteKey = next.getKey();
      if (next.getIsCollapsed()) noteKeyRef.current = noteKey;
      else noteKeyRef.current = undefined;
      $toggleNoteCollapseWithFallback(editor, noteKey, logger);
    } else if (!next) {
      const noteAncestor = $findMatchingParent(node, (n) => $isNoteNode(n));
      if (
        noteAncestor &&
        noteAncestor.getIsCollapsed() &&
        $isSomeParaNode(noteAncestor.getParent()) &&
        noteAncestor.is(noteAncestor.getParent()?.getLastChild())
      ) {
        logger?.debug("Cursor is at end of note at end of para");
        const noteKey = noteAncestor.getKey();
        noteKeyRef.current = noteKey;
        $toggleNoteCollapseWithFallback(editor, noteKey, logger);
      }
    }
  }

  // Case 4: caret between verse and note → toggle note
  if ($isSomeParaNode(node)) {
    const child = node.getChildAtIndex(anchor.offset);
    const prevChild = child?.getPreviousSibling();
    if ($isImmutableVerseNode(prevChild) && $isNoteNode(child)) {
      logger?.debug("Cursor is between verse and NoteNode");
      const noteKey = child.getKey();
      if (child.getIsCollapsed()) noteKeyRef.current = noteKey;
      else noteKeyRef.current = undefined;
      $toggleNoteCollapseWithFallback(editor, noteKey, logger);
    }
  }

  return false;
}

/**
 * Toggle the collapse state of a NoteNode, with fallback to deferred update if read-only error
 * occurs. This handles the edge case where clicking next to a note immediately after editor load
 * triggers a read-only selection context.
 * @param editor - The LexicalEditor instance used to access the DOM.
 * @param noteKey - The key of the NoteNode to toggle.
 */
function $toggleNoteCollapseWithFallback(
  editor: LexicalEditor,
  noteKey: string,
  logger: LoggerBasic | undefined,
) {
  const noteNode = $getNodeByKey<NoteNode>(noteKey);
  try {
    // Try immediate update first (works in most cases)
    noteNode?.toggleIsCollapsed();
  } catch (error) {
    // If we get a read-only error, defer the update
    if (error instanceof Error && error.message.includes("read only")) {
      logger?.warn("Fallback triggered after stabilization - edge case");
      setTimeout(() => {
        editor.update(() => {
          noteNode?.toggleIsCollapsed();
        });
      }, 0);
    } else {
      throw error; // Re-throw if it's not the expected read-only error
    }
  }
}

/**
 * Ensure that when double-clicking on a word after a note node (no space between) that it only
 * selects that word and does not include the note in the selection.
 * @param event - The MouseEvent triggered by the double-click interaction
 */
function $handleDoubleClick(event: MouseEvent) {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return;

  const anchor = selection.anchor;
  const focus = selection.focus;
  const anchorNode = anchor.getNode();
  const focusNode = focus.getNode();

  if ($isNoteNode(anchorNode) && $isTextNode(focusNode)) {
    event.preventDefault();

    // Create new selection only including the TextNode
    const newSelection = $createRangeSelection();
    newSelection.anchor.set(focusNode.getKey(), 0, "text");
    newSelection.focus.set(focusNode.getKey(), focus.offset, "text");
    $setSelection(newSelection);
  }
}

function updateCounterStyleSymbols(
  counterStyleName: string,
  newSymbols: string[],
  logger?: LoggerBasic,
): void {
  // Loop through all stylesheets
  for (const styleSheet of document.styleSheets) {
    try {
      const cssRules = styleSheet.cssRules || styleSheet.rules;

      // Loop through all CSS rules in the current stylesheet
      for (const rule of cssRules) {
        if (isCounterStyleRuleLike(rule, counterStyleName)) {
          // Create the symbols string (space-separated symbols)
          const symbolsValue = newSymbols.map((symbol) => `"${symbol}"`).join(" ");

          // Set the new symbols
          rule.symbols = symbolsValue;
          return;
        }
      }
    } catch {
      // Skip cross-origin stylesheets that can't be accessed
      continue;
    }
  }

  // If the counter-style wasn't found, you could create it
  logger?.warn(`Editor: counter style "${counterStyleName}" not found.`);
}

function isCounterStyleRuleLike(
  rule: unknown,
  counterStyleName: string,
): rule is CSSCounterStyleRule | CounterStyleRuleLike {
  return (
    // This check could be simpler but as is also works for test mocks.
    typeof rule === "object" &&
    rule !== null &&
    "name" in rule &&
    rule.name === counterStyleName &&
    "symbols" in rule &&
    typeof rule.symbols === "string"
  );
}
