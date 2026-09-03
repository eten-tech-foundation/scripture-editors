import { OptionItem } from "./Menu";
import { NodeSelectionMenu } from "./NodeSelectionMenu";
import { baseTestEnvironment } from "../usj/react-test.utils";
import { act } from "@testing-library/react";
import { COMMAND_PRIORITY_NORMAL, KEY_DOWN_COMMAND, LexicalEditor } from "lexical";
import { vi } from "vitest";

const options: OptionItem[] = [
  { name: "nd", label: "nd", description: "Name of God", action: () => undefined },
  { name: "zz", label: "zz", description: "Custom marker", action: () => undefined },
];

/**
 * A mounted menu plus the two things a press can do to the world around it: `downstream` records
 * every press the menu DECLINED (it is registered below the menu's own capture, so it runs only
 * when the capture returns false — the editor's undo/copy/paste handlers live below it in exactly
 * the same way), and `onClose` records the menu ending its session.
 */
async function mountMenu(): Promise<{
  editor: LexicalEditor;
  downstream: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
}> {
  const onClose = vi.fn();
  const { editor } = await baseTestEnvironment(
    undefined,
    <NodeSelectionMenu options={options} onClose={onClose} />,
  );
  const downstream = vi.fn(() => false);
  editor.registerCommand(KEY_DOWN_COMMAND, downstream, COMMAND_PRIORITY_NORMAL);
  return { editor, downstream, onClose };
}

/** What the menu shows as the live query - the filter it would commit from. */
function queryText(): string {
  const input = document.querySelector<HTMLInputElement>(".autocomplete-menu-container input");
  if (!input) throw new Error("the menu's query input did not render");
  return input.value;
}

/**
 * Presses one key at the editor and reports whether the press was `preventDefault`ed - the half
 * of a claim the browser (and the host's own shortcut handling) acts on.
 */
async function press(
  editor: LexicalEditor,
  key: string,
  modifiers: KeyboardEventInit = {},
): Promise<{ defaultPrevented: boolean }> {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...modifiers,
  });
  await act(async () => {
    editor.dispatchCommand(KEY_DOWN_COMMAND, event);
  });
  return { defaultPrevented: event.defaultPrevented };
}

describe("NodeSelectionMenu query capture", () => {
  it("takes a plain character into the query and claims it", async () => {
    const { editor, downstream, onClose } = await mountMenu();

    const { defaultPrevented } = await press(editor, "n");

    expect(queryText()).toBe("n");
    expect(defaultPrevented).toBe(true);
    expect(downstream).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("keeps filtering on a SHIFTED character - Shift is not a chord", async () => {
    const { editor, downstream, onClose } = await mountMenu();

    // The Shift half fires its own keydown before the character it capitalizes; the menu sits
    // still for it and passes it on.
    await press(editor, "Shift", { shiftKey: true });
    downstream.mockClear();

    await press(editor, "N", { shiftKey: true });

    expect(queryText()).toBe("N");
    expect(downstream).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open and idle on a modifier's own keydown", async () => {
    const { editor, downstream, onClose } = await mountMenu();
    await press(editor, "n");

    await press(editor, "Control", { ctrlKey: true });

    expect(queryText()).toBe("n");
    expect(downstream).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  // Ctrl/Cmd/Alt chords are the user's editing shortcuts, not palette input. Ingesting them
  // appended their letter to the filter, and claiming them left undo, copy, paste and select-all
  // dead for as long as the menu was open.
  const chords: { name: string; key: string; modifiers: KeyboardEventInit }[] = [
    { name: "Ctrl+Z (undo)", key: "z", modifiers: { ctrlKey: true } },
    { name: "Ctrl+C (copy)", key: "c", modifiers: { ctrlKey: true } },
    { name: "Cmd+V (paste)", key: "v", modifiers: { metaKey: true } },
    { name: "Ctrl+A (select all)", key: "a", modifiers: { ctrlKey: true } },
    { name: "Alt+F", key: "f", modifiers: { altKey: true } },
  ];
  chords.forEach(({ name, key, modifiers }) => {
    it(`lets ${name} through unfiltered and unclaimed, and closes the menu`, async () => {
      const { editor, downstream, onClose } = await mountMenu();
      await press(editor, "n");

      await press(editor, key, modifiers);

      // Reaching `downstream` is the whole point: below it sit the editor's own undo, copy,
      // paste and select-all handlers, which the menu used to shut out. Whether the press ends
      // up `preventDefault`ed is then THEIR call, not the menu's, so it is not asserted here.
      expect(queryText()).toBe("n");
      expect(downstream).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
