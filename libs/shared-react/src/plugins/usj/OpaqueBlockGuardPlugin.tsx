import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_HIGH,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
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
 * The rule is deliberately narrow: only a selection whose BOTH ends sit inside the SAME opaque
 * construct is refused. A selection that merely spans one from outside is asking to replace a region
 * of the document, which is the structural-deletion question and is answered elsewhere; annexing it
 * here would turn a targeted guard into a blanket one.
 *
 * Navigation and copying stay untouched, because they are what a read-only block is FOR: the block's
 * bytes are selectable and copyable. Only keys that would insert or delete are refused, and
 * modifier chords (Ctrl+C, Ctrl+Z, the marker engine's Ctrl+Space) are never treated as text.
 * Dragging OUT of a block is likewise left alone so drag-to-copy keeps working; the destructive
 * clipboard directions (cut, and a drop landing inside) are refused by their own commands.
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
      if (!$selectionIsWithinOneOpaqueBlock()) return false;
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
      editor.registerCommand(PASTE_COMMAND, $refuseEditInsideOpaqueBlock, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(CUT_COMMAND, $refuseEditInsideOpaqueBlock, COMMAND_PRIORITY_HIGH),
      editor.registerCommand(DROP_COMMAND, $refuseEditInsideOpaqueBlock, COMMAND_PRIORITY_HIGH),
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

/** The nearest opaque-construct ancestor of `node` (itself included), or `undefined`. */
function $opaqueBlockAncestor(node: LexicalNode): LexicalNode | undefined {
  for (let current: LexicalNode | null = node; current; current = current.getParent())
    if ($isUnknownNode(current) || $isImmutableTableNode(current)) return current;
  return undefined;
}

/**
 * Mutating: read inside an `editor.update()` or a command handler.
 *
 * Whether the whole selection sits inside ONE opaque construct. Both ends are resolved separately
 * and required to land on the same construct, so a selection reaching in from outside — which is a
 * request to replace a span of the document, not to edit the block — is not this guard's business.
 */
function $selectionIsWithinOneOpaqueBlock(): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const anchorBlock = $opaqueBlockAncestor(selection.anchor.getNode());
  const focusBlock = $opaqueBlockAncestor(selection.focus.getNode());
  return anchorBlock !== undefined && anchorBlock.is(focusBlock);
}
