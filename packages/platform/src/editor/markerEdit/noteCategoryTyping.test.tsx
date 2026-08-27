/**
 * Typing a `\cat` category run into a note that has none — the authoring direction, as opposed to
 * noteCategorySettle.test.tsx, which starts from a note that already carries `category` and edits
 * the run the adaptor built for it.
 *
 * Paratext 9 puts a note's category directly after the caller, and that is the one position the
 * note-scoped Tier-2 rebuild folds `\cat` from, so this is how a user gives a footnote a category
 * in a host (Paratext 10's footnote editor) whose note shell is governed by dropdowns: type the
 * run into the note's content at position zero.
 *
 * Two things have to hold for that to work, and each is its own regression here:
 *
 * - The typed `\cat` span has to keep re-tokenizing. `\cat` is the one attribute marker usfm.sty
 *   omits, so a stylesheet-keyed "can the engine re-derive this?" test reads it as an unknown
 *   custom marker and preserves it as an opaque sentinel — after which its bytes never reach the
 *   tokenizer again, the fold never fires, and every later pass is a fixed point. The run then
 *   only becomes a category by round-tripping through the file.
 * - The caret has to stay on the byte the user typed. A settle that moves it off the end of
 *   `\cat ` and past the following marker glyph sends the rest of what they type into the NEXT
 *   span, so the value and its closer land outside the run they belong to.
 */

import {
  findOnlyNote,
  noteUsx,
  requireDefined,
  usjNoteFromUsfm,
  usjNoteOf,
  viewOptions,
} from "./markerEdit.test-helpers";
import { IDLE_SETTLE_DELAY_MS, MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
} from "lexical";
import { $isCharNode, $noteCategoryRunPieces, $noteEditableCallerNode, NBSP } from "shared";
import { ViewOptions } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** The footnote editor's view: notes expanded, and their shell governed by its two dropdowns. */
const popoverView: ViewOptions = {
  ...viewOptions,
  noteMode: "expanded",
  isNoteShellEditable: false,
};

/** A closed note with no category, rendered expanded the way the footnote editor renders one. */
async function mountNoteWithoutCategory() {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(noteUsx(""), popoverView);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <MarkerEditPlugin viewOptions={popoverView} />,
  );
}

/** Type `text` one character at a time as a user gesture (keydown re-arms the idle settle clock). */
async function typeText(editor: LexicalEditor, text: string): Promise<void> {
  for (const ch of text) {
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: ch }));
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(ch);
      });
    });
  }
}

/** Put the caret where a click just after the note's `\f + ` shell leaves it. */
async function clickAfterCaller(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.update(() => {
      const caller = requireDefined(
        $noteEditableCallerNode(findOnlyNote($getRoot())),
        "editable caller",
      );
      caller.select(caller.getTextContentSize(), caller.getTextContentSize());
    });
  });
}

describe("typing a \\cat run into a note that has none", () => {
  it("folds onto the note's category once the run is closed", async () => {
    const { editor } = await mountNoteWithoutCategory();
    await clickAfterCaller(editor);

    await typeText(editor, "\\cat People\\cat*");
    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      expect(findOnlyNote($getRoot()).getCategory()).toBe("People");
    });
    // The bytes, not just the state: the note must serialize exactly as the file spells it.
    expect(usjNoteOf(editor)).toEqual(usjNoteFromUsfm(`\\f + \\cat People\\cat*\\ft A note\\f*`));
  });

  it("settles the closed run into the canonical display triplet", async () => {
    const { editor } = await mountNoteWithoutCategory();
    await clickAfterCaller(editor);

    await typeText(editor, "\\cat People\\cat*");
    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      const pieces = $noteCategoryRunPieces(findOnlyNote($getRoot()));
      expect(pieces.opener?.getTextContent()).toBe("\\cat");
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}People`);
      expect(pieces.closer?.getTextContent()).toBe("\\cat*");
    });
  });

  it("leaves the caret at the end of a half-typed `\\cat `, not past the next glyph", async () => {
    const { editor } = await mountNoteWithoutCategory();
    await clickAfterCaller(editor);

    // The space terminates the marker name, so this is the point the engine re-tokenizes — and
    // the user is mid-word, about to type the value. The caret must still be inside the `\cat`
    // span it just built, or the value they type next lands in the following span instead.
    await typeText(editor, "\\cat ");
    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      const owner = anchorNode.getParent();
      expect($isCharNode(owner) ? owner.getMarker() : undefined).toBe("cat");
      // At the very end of the span's value, which is where the next keystroke belongs.
      expect($isTextNode(anchorNode) ? anchorNode.getTextContentSize() : -1).toBe(
        selection.anchor.offset,
      );
    });
  });

  it("keeps typing the value into the run the caret was left in", async () => {
    const { editor } = await mountNoteWithoutCategory();
    await clickAfterCaller(editor);

    // The user's real sequence: type the marker, let it settle, then carry on with the value and
    // its closer. This is the whole bug — after the settle the rest went into the next span.
    await typeText(editor, "\\cat ");
    await advance(IDLE_SETTLE_DELAY_MS + 50);
    await typeText(editor, "People\\cat*");
    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      expect(findOnlyNote($getRoot()).getCategory()).toBe("People");
    });
    expect(usjNoteOf(editor)).toEqual(usjNoteFromUsfm(`\\f + \\cat People\\cat*\\ft A note\\f*`));
  });
});
