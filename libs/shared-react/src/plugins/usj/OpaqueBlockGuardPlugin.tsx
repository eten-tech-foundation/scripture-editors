import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNearestNodeFromDOMNode,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  DELETE_CHARACTER_COMMAND,
  DELETE_LINE_COMMAND,
  DELETE_WORD_COMMAND,
  DROP_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalNode,
  PASTE_COMMAND,
} from "lexical";
import { useEffect } from "react";
import { $isImmutableTableNode, $isUnknownNode } from "shared";

/**
 * Refuses an edit aimed INSIDE a construct the editor carries opaquely — an `UnknownNode` (figure,
 * sidebar, `\periph`, `\ref`, `\optbreak`) or a table — so a read-only block is genuinely read-only
 * rather than destructive on contact.
 *
 * Without this, a keystroke reaching such a block does not fail to apply; it applies CATASTROPHICALLY.
 * The adaptor renders an opaque block's content children in Lexical's TOKEN mode so the block reads
 * and navigates as one unit, and inserting into a token node REPLACES THE WHOLE NODE — one typed
 * character turns a figure's `My caption` into `Z`, taking the rest of the caption with it. Silently
 * accepting a keystroke and losing neighbouring content to it is the failure the no-silent-no-ops
 * rule exists to prevent; a refused keystroke, where the character simply never appears, is not.
 *
 * The rule is deliberately narrow: an edit is refused when an END of the selection lands INSIDE an
 * opaque construct. That covers a caret sitting in one, and a selection reaching in from the text
 * outside and stopping partway through — the shape that guts the construct's engine-owned bytes (a
 * row's `\tr ` glyph and its separator) while leaving the construct itself in the document. Nothing
 * repairs that afterwards: `$settleScopeForNode` returns undefined inside an opaque construct, so no
 * re-tokenization ever reconciles the screen with the file again.
 *
 * A selection that CONTAINS a construct whole — both ends outside it — is deliberately still not
 * this guard's business. That is a request to replace a region of the document, which is the
 * structural-deletion question and is answered elsewhere; annexing it here would turn a targeted
 * guard into a blanket one.
 *
 * Navigation and copying stay untouched, because they are what a read-only block is FOR: the block's
 * bytes are selectable and copyable. Only keys that would insert or delete are refused, and
 * modifier chords (Ctrl+C, Ctrl+Z, the marker engine's Ctrl+Space) are never treated as text.
 * Dragging OUT of a block is likewise left alone so drag-to-copy keeps working; the destructive
 * clipboard directions (cut, and a drop landing inside) are refused by their own commands.
 *
 * The delete COMMANDS are guarded alongside `KEY_DOWN` rather than left to it, because a delete
 * chord never reaches the key filter as typing: Lexical routes Ctrl/Alt+Backspace straight to
 * `DELETE_WORD_COMMAND` and Cmd/Ctrl+Backspace to `DELETE_LINE_COMMAND`, and the filter must keep
 * treating a modifier chord as a command so Ctrl+C and Ctrl+Space still work. Guarding the delete
 * commands themselves closes that without reopening the chords.
 *
 * Mount alongside the other guards. Read-only is not a view mode — a construct the editor cannot
 * model is opaque in every marker mode — so this plugin takes no `viewOptions` and is never gated
 * on one.
 */
export function OpaqueBlockGuardPlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    /**
     * Refuse when the caret is inside an opaque construct. Command payloads differ by kind — the
     * clipboard and key commands carry an `Event` to `preventDefault` (which is what stops the
     * browser applying the keystroke itself), while `CONTROLLED_TEXT_INSERTION` carries a bare
     * string — so the event is guarded on rather than assumed.
     */
    const $refuseEditInsideOpaqueBlock = (payload: unknown): boolean => {
      if (payload instanceof KeyboardEvent && !isEditingKey(payload)) return false;
      if (!$selectionReachesIntoOpaqueBlock()) return false;
      if (payload instanceof Event) payload.preventDefault();
      return true;
    };

    return mergeRegister(
      editor.registerCommand(KEY_DOWN_COMMAND, $refuseEditInsideOpaqueBlock, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(
        CONTROLLED_TEXT_INSERTION_COMMAND,
        $refuseEditInsideOpaqueBlock,
        COMMAND_PRIORITY_HIGH,
      ),
      // CUT and PASTE run at CRITICAL because their standard-view handlers — the ones that
      // actually copy and then remove — are themselves registered at HIGH, where the winner is
      // decided by registration order rather than by intent. A refusal has to outrank the actor it
      // refuses, not tie with it. The engine's own CRITICAL cut arm records what a cut would cover
      // and claims nothing, so either order of the two is correct: with no removal, nothing it
      // armed can be reaped.
      editor.registerCommand(
        PASTE_COMMAND,
        $refuseEditInsideOpaqueBlock,
        COMMAND_PRIORITY_CRITICAL,
      ),
      editor.registerCommand(CUT_COMMAND, $refuseEditInsideOpaqueBlock, COMMAND_PRIORITY_CRITICAL),
      // DROP is judged by the drop TARGET, not the live selection: Lexical dispatches
      // DROP_COMMAND straight from the DOM handler with no selection update, so at drop time
      // `$getSelection()` still holds whatever was selected when the drag STARTED. Testing that
      // inverted both promises above — dragging a caption OUT of a figure was refused (source
      // inside), while dragging outside text INTO a caption was allowed (source outside).
      editor.registerCommand(
        DROP_COMMAND,
        (event) => {
          if (!(event instanceof Event) || !(event.target instanceof Node)) return false;
          const targetNode = $getNearestNodeFromDOMNode(event.target);
          if (!targetNode || !$opaqueBlockAncestor(targetNode)) return false;
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        DELETE_CHARACTER_COMMAND,
        $refuseEditInsideOpaqueBlock,
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        DELETE_WORD_COMMAND,
        $refuseEditInsideOpaqueBlock,
        COMMAND_PRIORITY_HIGH,
      ),
      editor.registerCommand(
        DELETE_LINE_COMMAND,
        $refuseEditInsideOpaqueBlock,
        COMMAND_PRIORITY_HIGH,
      ),
    );
  }, [editor]);

  return null;
}

/**
 * Whether this keystroke would insert or delete text. A modifier chord is a command, not typing —
 * Ctrl+C and Ctrl+Z must keep working inside a read-only block, and the marker engine's Ctrl+Space
 * must reach its own handler — so any of Ctrl/Meta/Alt disqualifies the key outright. Everything
 * else is judged by what the key produces: a single character (a space included), or one of the
 * three keys that remove or break text.
 */
function isEditingKey(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return (
    event.key.length === 1 ||
    event.key === "Backspace" ||
    event.key === "Delete" ||
    event.key === "Enter"
  );
}

/**
 * Read-only: safe inside `editor.getEditorState().read()`, an `editor.update()`, or a command
 * handler — it only walks parents.
 *
 * The nearest opaque-construct ancestor of `node` (itself included), or `undefined`.
 *
 * Exported because it is the ONE place "this node belongs to a read-only construct" is decided, and
 * more than the edit guard needs the answer: `ArrowNavigationPlugin` asks it to decide that a
 * construct's marker glyphs are crossed whole rather than walked through. When table editability
 * lands, this predicate is where it comes back out.
 */
export function $opaqueBlockAncestor(node: LexicalNode): LexicalNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent())
    if ($isUnknownNode(current) || $isImmutableTableNode(current)) return current;
  return undefined;
}

/**
 * Mutating: read inside an `editor.update()` or a command handler.
 *
 * Whether an END of the selection lands inside an opaque construct — a caret parked in one, or a
 * range that reaches in from the outside and stops partway through. Both ends are resolved
 * separately, and either one being inside is enough, because an edit that lands partway into a
 * construct destroys engine-owned bytes the construct keeps in the file.
 *
 * A range whose ends are BOTH outside is not this guard's business even when it contains a
 * construct whole: that is a region replacement, answered by the structural-deletion rules.
 *
 * Exported for actors that TIE with this plugin's refusals at Lexical's ceiling priority
 * (CRITICAL has no rank above it, so the winner is registration order): the marker engine's
 * in-note paste claim consults this before claiming, so either registration order refuses.
 */
export function $selectionReachesIntoOpaqueBlock(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  return (
    $opaqueBlockAncestor(selection.anchor.getNode()) !== undefined ||
    $opaqueBlockAncestor(selection.focus.getNode()) !== undefined
  );
}
