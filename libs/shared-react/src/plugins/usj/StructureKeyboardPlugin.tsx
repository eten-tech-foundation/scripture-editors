import {
  $isArmedSelection,
  $mergeParaIntoPrevious,
  $placeCaretAtEnd,
  $sanitizeNodesForProtectedStructure,
  $selectionContainsVerseMarker,
  $shouldBlockSelectionReplacement,
  $shouldBlockStructuralEdit,
  $structuralDeleteTarget,
  ArmedDelete,
  keyDownToIntent,
} from "./structureKeyboard.utils";
import { $generateNodesFromDOM } from "@lexical/html";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import DOMPurify from "dompurify";
import { mergeRegister } from "@lexical/utils";
import {
  $createNodeSelection,
  $createRangeSelection,
  $getNodeByKey,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DRAGSTART_COMMAND,
  DROP_COMMAND,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
} from "lexical";
import { useEffect, useRef, useState, useCallback } from "react";
import { $isSomeVerseNode } from "../../nodes/usj";
import { $isSomeParaNode } from "shared";

/**
 * Governs structural keystrokes (Backspace/Delete/Enter/typing) at verse- and paragraph-marker
 * boundaries. When `isStructureProtected`, blocks them and sanitizes paste/drop payloads so
 * structural markers (paragraph breaks, verse markers, chapter markers) cannot be inserted —
 * text, inline character formatting, and notes are kept. When not protected, makes deletion a
 * deliberate two-step gesture: first press selects the marker/section, second press deletes it.
 * Registers a KEY_DOWN handler at COMMAND_PRIORITY_HIGH, mirroring ArrowNavigationPlugin.
 *
 * The armed state is published to the DOM (rather than rendered here) so the host app owns the
 * user-facing hint: the root element carries the `verse-delete-armed` class plus
 * `data-verse-delete-intent` (`deleteBackward` | `deleteForward`) and `data-verse-delete-kind`
 * (`verse` | `selection`), and the armed marker carries the `verse-selected` class. The host can
 * observe these to render a localized tooltip (see paranext-core's VerseDeleteTooltipOverlay).
 *
 * @param isStructureProtected - When true, structural keystrokes are blocked; when false, the
 *   two-step intentional-delete behavior is active. Only consulted when the feature is active.
 * @param isStructureProtectionActive - Whether the feature applies at all. Defaults to true. When
 *   false (e.g. the Power interface mode), the plugin registers no handlers and editing is fully
 *   native — no blocking, no two-step delete, no armed state.
 * @returns Always `null`; this plugin renders no UI, only editor behavior and DOM signals.
 */
export function StructureKeyboardPlugin({
  isStructureProtected,
  isStructureProtectionActive = true,
}: {
  isStructureProtected: boolean;
  isStructureProtectionActive?: boolean;
}): null {
  const [editor] = useLexicalComposerContext();
  const armedRef = useRef<ArmedDelete | undefined>(undefined);
  const [armed, setArmed] = useState<ArmedDelete | undefined>(undefined);
  const setArmedState = useCallback((next: ArmedDelete | undefined) => {
    armedRef.current = next;
    setArmed(next);
  }, []);

  useEffect(() => {
    // Feature off (e.g. Power mode): register nothing so editing stays fully native.
    if (!isStructureProtectionActive) return undefined;

    const $handleKeyDown = (event: KeyboardEvent): boolean => {
      const intent = keyDownToIntent(event);
      if (!intent) return false;
      const selection = $getSelection();
      if (isStructureProtected) {
        if (selection && $shouldBlockStructuralEdit(selection, intent)) {
          event.preventDefault();
          return true;
        }
        return false;
      }
      // Unprotected: two-step intentional delete (delete intents only).
      if (intent !== "deleteBackward" && intent !== "deleteForward") return false;
      return $handleTwoStepDelete(intent, event);
    };

    const $handleTwoStepDelete = (
      intent: "deleteBackward" | "deleteForward",
      event: KeyboardEvent,
    ): boolean => {
      const selection = $getSelection();
      const armed = armedRef.current;

      // FIRE / cancel: a target is armed.
      if (armed && selection && $isArmedSelection(selection, armed)) {
        setArmedState(undefined);
        event.preventDefault();
        if (intent !== armed.intent) return true; // mismatched direction: cancel, no delete
        const node = $getNodeByKey(armed.key) ?? undefined;
        if (armed.kind === "verse") {
          if (node) {
            const parent = node.getParent();
            const prev = node.getPreviousSibling();
            const next = node.getNextSibling();
            node.remove();
            if (prev) $placeCaretAtEnd(prev);
            else if (next && $isTextNode(next)) next.select(0, 0);
            else parent?.selectStart();
          }
        } else if (armed.kind === "selection") {
          if ($isRangeSelection(selection)) selection.removeText(); // deletes the whole range, verse included
        } else if ($isSomeParaNode(node)) {
          // Only paragraphs merge into paragraphs; never merge some other ElementNode.
          $mergeParaIntoPrevious(node);
        }
        return true;
      }

      // ARM: caret at a structural boundary, or a range selection containing a verse marker.
      if (!selection) return false;
      const target = $structuralDeleteTarget(selection, intent);
      if (target) {
        if (target.kind === "verse") {
          const ns = $createNodeSelection();
          ns.add(target.node.getKey());
          $setSelection(ns);
        } else {
          const range = $createRangeSelection();
          range.anchor.set(target.node.getKey(), 0, "element");
          range.focus.set(target.node.getKey(), target.node.getChildrenSize(), "element");
          $setSelection(range);
        }
        setArmedState({ key: target.node.getKey(), kind: target.kind, intent });
        event.preventDefault();
        return true;
      }
      // Range/text selection that includes a verse marker: arm without altering the selection.
      if (
        $isRangeSelection(selection) &&
        !selection.isCollapsed() &&
        $selectionContainsVerseMarker(selection)
      ) {
        const verseKeys = selection
          .getNodes()
          .filter($isSomeVerseNode)
          .map((n) => n.getKey());
        const { anchor, focus } = selection;
        setArmedState({
          kind: "selection",
          intent,
          key: verseKeys[0],
          anchor: { key: anchor.key, offset: anchor.offset, type: anchor.type },
          focus: { key: focus.key, offset: focus.offset, type: focus.type },
        });
        event.preventDefault();
        return true;
      }
      return false;
    };

    // Guard for vectors that bypass KEY_DOWN (cut, dragstart, IME-composed input).
    // Rule 1: block when the selection spans a boundary or contains a verse marker.
    // `payload` is `unknown` because this guard serves commands with differing payload
    // types: CUT/DRAGSTART carry an `Event` (which we preventDefault), while
    // CONTROLLED_TEXT_INSERTION carries a string. We only call preventDefault for Events.
    const $blockUnsafeSelection = (payload: unknown): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (!selection || !$shouldBlockSelectionReplacement(selection)) return false;
      if (payload instanceof Event) payload.preventDefault();
      return true;
    };

    // Sanitize a paste/drop payload: strip structural markers from the HTML and insert the rest.
    // Returns true (consume) when we handled an HTML payload; false to let the default handler run.
    const $sanitizeAndInsert = (html: string | undefined, event: Event): boolean => {
      if (!html) return false; // plain-text-only (or empty) payload carries no markers
      // Sanitize untrusted clipboard/drop HTML before parsing — strips scripts, event
      // handlers, and javascript: URLs so they can never reach the DOM (defense in depth;
      // Lexical only reconstructs known node types, but this also clears the taint flow).
      const safeHtml = DOMPurify.sanitize(html);
      const dom = new DOMParser().parseFromString(safeHtml, "text/html");
      const sanitized = $sanitizeNodesForProtectedStructure($generateNodesFromDOM(editor, dom));
      // For DROP, the browser pre-positions the DOM selection at the drop point before the event fires, so $getSelection() reflects the drop target.
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertNodes(sanitized);
      event.preventDefault();
      return true;
    };

    const $handlePaste = (event: ClipboardEvent): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockSelectionReplacement(selection)) {
        event.preventDefault();
        return true;
      }
      return $sanitizeAndInsert(event.clipboardData?.getData("text/html"), event);
    };

    const $handleDrop = (event: DragEvent): boolean => {
      if (!isStructureProtected) return false;
      const selection = $getSelection();
      if (selection && $shouldBlockSelectionReplacement(selection)) {
        event.preventDefault();
        return true;
      }
      return $sanitizeAndInsert(event.dataTransfer?.getData("text/html"), event);
    };

    // Drop the latch as soon as the live selection no longer encodes the armed target
    // (arrow key, click, typing, etc.). Reads only; never mutates the editor.
    const clearStaleLatch = () => {
      const armed = armedRef.current;
      if (!armed) return;
      editor.getEditorState().read(() => {
        if (!$isArmedSelection($getSelection(), armed)) setArmedState(undefined);
      });
    };

    return mergeRegister(
      editor.registerCommand(KEY_DOWN_COMMAND, $handleKeyDown, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(PASTE_COMMAND, $handlePaste, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DRAGSTART_COMMAND, $blockUnsafeSelection, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DROP_COMMAND, $handleDrop, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        $blockUnsafeSelection,
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerUpdateListener(clearStaleLatch),
    );
  }, [editor, isStructureProtected, isStructureProtectionActive, setArmedState]);

  // Publish the armed state onto the editor root: the class gates the CSS blink to armed markers,
  // and the data attributes let the host app render a localized destructive hint. `para` merges
  // expose no hint kind (verse-marker scope), matching the previous no-tooltip behavior.
  useEffect(() => {
    const root = editor.getRootElement();
    if (!root) return;
    const showHint = !!armed && armed.kind !== "para";
    root.classList.toggle("verse-delete-armed", !!armed);
    if (showHint) {
      root.setAttribute("data-verse-delete-intent", armed.intent);
      root.setAttribute("data-verse-delete-kind", armed.kind);
    } else {
      root.removeAttribute("data-verse-delete-intent");
      root.removeAttribute("data-verse-delete-kind");
    }
    return () => {
      root.classList.remove("verse-delete-armed");
      root.removeAttribute("data-verse-delete-intent");
      root.removeAttribute("data-verse-delete-kind");
    };
  }, [editor, armed]);

  // Renders no UI: the armed hint is owned by the host app (see this component's JSDoc).
  return null;
}
