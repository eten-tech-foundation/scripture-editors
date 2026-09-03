/**
 * Escape must not cost the user their caret.
 *
 * Diagnosis (instrumented, not assumed): with a caret in the editor and no palette open, an
 * Escape keydown reaches Lexical's `KEY_ESCAPE_COMMAND` dispatch unclaimed, and the ONLY
 * registered handler is `@lexical/rich-text`'s default, which calls `editor.blur()` —
 * `rootElement.blur()` plus `domSelection.removeAllRanges()`. The editor-state selection
 * survives; the DOM range (the visible caret) is what disappears. The palette's own Escape
 * handling (`NodeSelectionMenu`) is only registered while a menu is mounted and never touches
 * the selection, and the host's app-wide overlay-dismiss is a window listener that never
 * reaches the editor selection — so dismissing overlays was never the layer at fault.
 *
 * In this editor Escape is an overlay-dismiss key (marker palette, host menus, find bar);
 * silently discarding the caret makes every dismissal destructive. `EscapeKeyPlugin` claims the
 * command above the RichText default so the blur never runs, while leaving the DOM event
 * untouched for host-level listeners.
 */
import { EscapeKeyPlugin } from "./EscapeKeyPlugin";
import { MarkerEditPlugin } from "./markerEdit/MarkerEditPlugin";
import { viewOptions } from "./markerEdit/markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  KEY_DOWN_COMMAND,
  KEY_ESCAPE_COMMAND,
  LexicalEditor,
} from "lexical";
import { $createMarkerNode, $createParaNode, $isParaNode, NBSP } from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../libs/shared-react/src/plugins/usj/react-test.utils";

async function environment(): Promise<{ editor: LexicalEditor }> {
  return baseTestEnvironment(
    () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("content"),
        ),
      );
    },
    <>
      <EscapeKeyPlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
    </>,
  );
}

/** Focus the editor, park the caret mid-content, and press Escape through the real pipeline. */
async function $pressEscapeWithCaret(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.focus();
  });
  await act(async () =>
    editor.update(() => {
      // Re-query: the initial commit's transforms may have rewritten the mount-time nodes.
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const text = para.getLastChild();
      if (!$isTextNode(text)) throw new Error("content text missing");
      text.select(3, 3);
    }),
  );
  await act(async () => {
    editor.dispatchCommand(
      KEY_DOWN_COMMAND,
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
  });
}

describe("Escape with the caret in the editor", () => {
  it("keeps the caret: the DOM range survives and the state selection is untouched", async () => {
    const { editor } = await environment();
    await $pressEscapeWithCaret(editor);

    // The visible caret: Lexical's default escape-blur removed every DOM range; claimed, the
    // range must survive.
    expect(document.getSelection()?.rangeCount).toBeGreaterThan(0);
    // The state selection stays a collapsed range at the same spot.
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after Escape");
      expect(selection.isCollapsed()).toBe(true);
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("still lets Escape reach the command layer (the claim suppresses only the blur)", async () => {
    // Overlay layers (an open palette claims the KEYDOWN before Lexical maps it; the host's
    // window listener sees the DOM event regardless) must keep working: the claim neither
    // preventDefaults nor stops propagation, it only outranks the RichText blur handler.
    const { editor } = await environment();
    let dispatched = false;
    let defaultPrevented = true;
    editor.registerCommand(
      KEY_ESCAPE_COMMAND,
      (event: KeyboardEvent) => {
        dispatched = true;
        defaultPrevented = event.defaultPrevented;
        return false; // observe only
      },
      COMMAND_PRIORITY_CRITICAL,
    );
    await $pressEscapeWithCaret(editor);
    expect(dispatched).toBe(true);
    expect(defaultPrevented).toBe(false);
  });
});
