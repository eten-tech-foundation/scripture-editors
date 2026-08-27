import { ClipboardPlugin } from "./ClipboardPlugin";
import { ContextMenuPlugin } from "./ContextMenuPlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor, TextNode } from "lexical";
import { $createParaNode } from "shared";

/**
 * The context menu's Cut/Copy dispatch the same commands the keyboard shortcuts do, so they are
 * covered by the same empty-copy guard (`registerEmptyCopyGuard`, mounted by `ClipboardPlugin` —
 * both plugins ship together in every editor that mounts either). This pins that the leg really
 * does go through it, rather than dispatching around it.
 *
 * Note where `onSelect` runs: inside `editor.update()` (see the plugin's Enter handler). That is
 * why the guard has to live on the COMMAND and read the live selection — a check in front of the
 * dispatch reading the last committed state would be both stale and, via `editor.read()`, unsafe
 * to call from there.
 *
 * `document.execCommand("copy")` is the observable, as everywhere else in this suite: called means
 * a clipboard write reached the browser, not called means the clipboard is untouched.
 */
let execCommand: ReturnType<typeof vi.fn>;

beforeEach(() => {
  execCommand = vi.fn(() => true);
  Object.defineProperty(document, "execCommand", {
    configurable: true,
    writable: true,
    value: execCommand,
  });
});

afterEach(async () => {
  // Drain `@lexical/clipboard`'s module-level `EVENT_LATENCY` (50ms) handle, which otherwise makes
  // a test that reached the real copy path silence the next test's assertion.
  await new Promise((resolve) => setTimeout(resolve, 60));
  Reflect.deleteProperty(document, "execCommand");
});

async function contextMenuEnvironment(): Promise<{ editor: LexicalEditor; text: TextNode }> {
  let text: TextNode | undefined;
  const { editor } = await baseTestEnvironment(
    () => {
      text = $createTextNode("In the beginning");
      $getRoot().append($createParaNode("p").append(text));
    },
    <>
      <ClipboardPlugin />
      <ContextMenuPlugin />
    </>,
  );
  if (!text) throw new Error("expected the initial text node to exist");
  return { editor, text };
}

/**
 * Opens the context menu over the editor's content and activates the option at `index` the way a
 * keyboard user would (the plugin's own arrow/Enter handling), rather than by reaching for the
 * rendered menu's markup. Built-in order: Cut, Copy, Paste, Paste as Plain Text.
 */
async function chooseContextMenuOption(editor: LexicalEditor, index: number): Promise<void> {
  const rootElement = editor.getRootElement();
  const target = rootElement?.firstElementChild;
  if (!target) throw new Error("expected the editor to have rendered content to right-click");
  await act(async () => {
    target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
  for (let step = 0; step <= index; step++) {
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
  }
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

const COPY_OPTION = 1;
const CUT_OPTION = 0;

describe("ContextMenuPlugin — Cut/Copy go through the empty-copy guard", () => {
  it("Copy with a collapsed caret leaves the clipboard untouched", async () => {
    const { editor, text } = await contextMenuEnvironment();
    await act(async () => editor.update(() => text.select(3, 3)));

    await chooseContextMenuOption(editor, COPY_OPTION);

    expect(execCommand).not.toHaveBeenCalled();
  });

  it("Cut with a collapsed caret leaves the clipboard untouched and removes nothing", async () => {
    const { editor, text } = await contextMenuEnvironment();
    await act(async () => editor.update(() => text.select(3, 3)));

    await chooseContextMenuOption(editor, CUT_OPTION);

    expect(execCommand).not.toHaveBeenCalled();
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("In the beginning"));
  });

  it("Copy with a selection copies — the menu leg is really wired to the command", async () => {
    const { editor, text } = await contextMenuEnvironment();
    await act(async () => editor.update(() => text.select(0, text.getTextContentSize())));

    await chooseContextMenuOption(editor, COPY_OPTION);

    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
