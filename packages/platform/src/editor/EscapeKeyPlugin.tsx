import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COMMAND_PRIORITY_LOW, KEY_ESCAPE_COMMAND } from "lexical";
import { useEffect } from "react";

/**
 * Keeps Escape from costing the user their caret.
 *
 * Lexical's RichText default `KEY_ESCAPE_COMMAND` handler (COMMAND_PRIORITY_EDITOR) calls
 * `editor.blur()`, which removes every DOM selection range along with focus — so any Escape
 * press that reaches it silently discards the visible caret. In this editor Escape is an
 * overlay-dismiss key (the marker palette claims the keydown while open; host menus and the
 * find bar listen at the window level), and dismissal must not be destructive: the caret stays
 * where the user left it.
 *
 * Claiming at LOW outranks only the RichText default. Layers that claim the raw keydown before
 * Lexical maps it to this command (an open palette's key capture) are unaffected, and the DOM
 * event is neither preventDefaulted nor stopped, so window-level Escape listeners still fire.
 */
export function EscapeKeyPlugin(): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return editor.registerCommand(KEY_ESCAPE_COMMAND, () => true, COMMAND_PRIORITY_LOW);
  }, [editor]);
  return null;
}
