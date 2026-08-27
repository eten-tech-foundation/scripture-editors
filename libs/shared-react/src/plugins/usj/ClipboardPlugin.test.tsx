import { ClipboardPlugin } from "./ClipboardPlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_CRITICAL,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import { $createParaNode } from "shared";

/**
 * `document.execCommand` is the mechanism a clipboard write ultimately runs through when no real
 * clipboard event exists: `@lexical/clipboard` points the DOM selection at a hidden placeholder it
 * appends to the editor and calls `execCommand("copy")` to provoke one. jsdom implements no
 * `execCommand` at all, so these tests install a spy in its place — a call to it means a clipboard
 * write reached the browser, and no call means the clipboard was left exactly as the user left it.
 * That is the observable these tests pin: what does or does not get written, never the placeholder
 * itself, which lives in `@lexical/clipboard` and is not ours to depend on.
 */
let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: execCommand,
  });
  // `pasteSelection`/`pasteSelectionAsPlainText` read the async clipboard API, which jsdom also
  // does not implement. A read that never settles is enough for these tests: they assert only that
  // the paste keys still reach it, not what a paste does with what it finds.
  vi.stubGlobal("navigator", {
    ...navigator,
    clipboard: { read: vi.fn(() => new Promise(() => undefined)) },
  });
});

afterEach(() => {
  Reflect.deleteProperty(document, "execCommand");
  vi.unstubAllGlobals();
});

/** An editor holding one paragraph of text, with the clipboard key handling under test mounted. */
async function clipboardEnvironment(): Promise<{ editor: LexicalEditor; text: TextNode }> {
  let text: TextNode | undefined;
  const { editor } = await baseTestEnvironment(
    () => {
      text = $createTextNode("In the beginning");
      $getRoot().append($createParaNode("p").append(text));
    },
    <ClipboardPlugin />,
  );
  if (!text) throw new Error("expected the initial text node to exist");
  return { editor, text };
}

/** Presses a clipboard shortcut on the editor's root element, where the plugin listens. */
async function pressShortcut(
  editor: LexicalEditor,
  key: string,
  shiftKey = false,
): Promise<KeyboardEvent> {
  const rootElement = editor.getRootElement();
  if (!rootElement) throw new Error("editor has no root element to press a key on");
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    rootElement.dispatchEvent(event);
  });
  return event;
}

/**
 * Watches a clipboard command without claiming it, so a regression runs the whole real chain —
 * `@lexical/rich-text`'s fallback and the synthesized-copy machinery behind it — and trips the
 * `execCommand` assertion instead of being masked by the watcher itself.
 */
function watchCommand(editor: LexicalEditor, command: typeof COPY_COMMAND) {
  const seen = vi.fn(() => false);
  const unregister = editor.registerCommand(command, seen, COMMAND_PRIORITY_CRITICAL);
  return { seen, unregister };
}

describe("ClipboardPlugin — copy/cut with nothing selected", () => {
  it("leaves the clipboard untouched on Ctrl+C at a collapsed caret", async () => {
    const { editor, text } = await clipboardEnvironment();
    await act(async () => editor.update(() => text.select(3, 3)));
    const { seen, unregister } = watchCommand(editor, COPY_COMMAND);

    const event = await pressShortcut(editor, "c");
    unregister();

    // No copy is synthesized at all, so nothing can be written over what the clipboard holds.
    expect(execCommand).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    // The browser's own copy is left to run: for an empty selection it writes nothing, which is
    // the behavior this plugin's `preventDefault` would otherwise have suppressed.
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves the clipboard untouched on Ctrl+X at a collapsed caret, and removes nothing", async () => {
    const { editor, text } = await clipboardEnvironment();
    await act(async () => editor.update(() => text.select(3, 3)));
    const { seen, unregister } = watchCommand(editor, CUT_COMMAND);

    const event = await pressShortcut(editor, "x");
    unregister();

    expect(execCommand).not.toHaveBeenCalled();
    expect(seen).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("In the beginning"));
  });
});

describe("ClipboardPlugin — copy/cut with a selection", () => {
  it("copies on Ctrl+C and claims the key", async () => {
    const { editor, text } = await clipboardEnvironment();
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    // Claimed here so the copy stops at this assertion instead of running the real clipboard
    // machinery, whose synthesized-event timer would outlive the test.
    const seen = vi.fn(() => true);
    const unregister = editor.registerCommand(COPY_COMMAND, seen, COMMAND_PRIORITY_CRITICAL);

    const event = await pressShortcut(editor, "c");
    unregister();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("cuts on Ctrl+X and claims the key", async () => {
    const { editor, text } = await clipboardEnvironment();
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));
    const seen = vi.fn(() => true);
    const unregister = editor.registerCommand(CUT_COMMAND, seen, COMMAND_PRIORITY_CRITICAL);

    const event = await pressShortcut(editor, "x");
    unregister();

    expect(seen).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("ClipboardPlugin — paste keys are unaffected", () => {
  it("claims Ctrl+V and Ctrl+Shift+V regardless of the selection", async () => {
    const { editor, text } = await clipboardEnvironment();
    await act(async () => editor.update(() => text.select(3, 3)));

    // A collapsed caret is exactly where a paste belongs, so the empty-selection rule copy and cut
    // now follow must not reach these.
    expect((await pressShortcut(editor, "v")).defaultPrevented).toBe(true);
    expect((await pressShortcut(editor, "v", true)).defaultPrevented).toBe(true);
  });
});
