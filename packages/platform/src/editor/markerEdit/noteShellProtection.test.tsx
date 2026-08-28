/**
 * `ViewOptions.isNoteShellEditable: false` — an expanded note's opening glyph and caller are
 * governed by the host's UI (Paratext 10's footnote editor has a dropdown for each, as does
 * Paratext 9), so the caret must not be able to enter them and typing must not be able to change
 * them.
 *
 * Left editable, that slot is not merely cosmetic: an edit to it looks accepted and does not
 * persist, and the note-scoped Tier-2 rebuild refuses a caller it cannot recognize — so anything
 * else typed there (a `\cat` category run, which Paratext 9 puts exactly there) is dropped with
 * it. Routing such typing to the note's CONTENT is what makes it fold, which is what
 * noteCategoryTyping.test.tsx covers from the other side.
 *
 * The assertions here are deliberately about what the DOCUMENT does under a keystroke, not about
 * how the shell is marked. `token` mode is necessary but not sufficient: Lexical redirects an
 * insertion at a token node's BOUNDARY, but a caret strictly inside one replaces the whole node
 * with the typed character, and nothing about the mode keeps a caret from landing there. A test
 * that asserts only the mode therefore says nothing about whether the shell is protected — so
 * each case here puts a caret somewhere in the shell, types, and checks the note.
 */
import {
  findOnlyNote,
  findUsjNote,
  noteUsx,
  requireDefined,
  viewOptions,
} from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import { $isMarkerNode, $noteEditableCallerNode, getEditableCallerText, NoteNode } from "shared";
import { NoteShellCaretGuardPlugin, ViewOptions } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

const expandedEditable: ViewOptions = { ...viewOptions, noteMode: "expanded" };
const protectedShell: ViewOptions = { ...expandedEditable, isNoteShellEditable: false };

/** `serializedState` from the shared helpers always uses the default view options; these cases
 * differ ONLY in the view options, so the state has to be built with the one under test. */
async function mount(view: ViewOptions) {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(noteUsx(`closed="false"`), view);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <>
      <MarkerEditPlugin viewOptions={view} />
      <NoteShellCaretGuardPlugin />
    </>,
  );
}

/** The note's opening glyph and caller text node — the two nodes that make up its shell. */
function $shellModes() {
  const note = findOnlyNote($getRoot());
  const children = note.getChildren();
  const opener = children.find((child) => $isMarkerNode(child));
  const caller = children.find(
    (child) => $isTextNode(child) && !$isMarkerNode(child) && child.getTextContent().includes("+"),
  );
  return {
    opener: $isTextNode(opener) ? opener.getMode() : undefined,
    caller: $isTextNode(caller) ? caller.getMode() : undefined,
  };
}

/** The note's opening `\f` glyph. */
function $opener(note: NoteNode): TextNode {
  const opener = note.getChildren().find((child) => $isMarkerNode(child));
  return requireDefined($isTextNode(opener) ? opener : undefined, "opening glyph not found");
}

/** The whole document as USJ — what the file would get. */
function usjOf(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  return editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
}

/**
 * Put the caret at `offset` of the shell node `pick` returns, announcing the move the way a click
 * or an arrow press does — through `SELECTION_CHANGE_COMMAND`, which is where the guard listens.
 */
async function placeCaretInShell(
  editor: LexicalEditor,
  pick: (note: NoteNode) => TextNode,
  offset: number,
): Promise<void> {
  await act(async () => {
    editor.update(() => {
      const node = pick(findOnlyNote($getRoot()));
      node.select(offset, offset);
      // Dispatched INSIDE the update the move happens in, which is where Lexical dispatches it
      // for a real caret move — and the only way `$getPreviousSelection()` still reports where
      // the caret came FROM rather than where it just went.
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
  });
}

/**
 * Put the caret at `offset` of a shell node the way a CLICK does: the pointer is down when the
 * selection lands, which is the order a real click delivers (`pointerdown`, selection change,
 * `pointerup`).
 */
async function clickCaretInShell(
  editor: LexicalEditor,
  pick: (note: NoteNode) => TextNode,
  offset: number,
): Promise<void> {
  const doc = editor.getRootElement()?.ownerDocument ?? document;
  await act(async () => {
    doc.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    editor.update(() => {
      const node = pick(findOnlyNote($getRoot()));
      node.select(offset, offset);
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
    doc.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
}

/**
 * Park the caret past the note's content, which is where a popover's `focus()` leaves it when it
 * has no selection to restore: `focus()` falls back to the document END, and the popover's document
 * holds nothing but the note.
 */
async function focusPastNoteContent(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.update(() => {
      findOnlyNote($getRoot()).getLastChild()?.selectEnd();
    });
  });
}

/** Type `text` one character at a time as a user gesture. */
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

describe("expanded note shell", () => {
  it("is atomic when the host governs the marker and caller", async () => {
    const { editor } = await mount(protectedShell);
    editor.getEditorState().read(() => {
      // `token` is Lexical's atomic text mode, and the mode the caret guard reads to know which
      // nodes it is protecting. It is necessary, not sufficient — see the cases below.
      expect($shellModes()).toEqual({ opener: "token", caller: "token" });
    });
  });

  it("stays editable by default, for a view whose only way to edit a note is as text", async () => {
    // The main editor's Markers view expands notes precisely so the marker and caller can be
    // typed. Defaulting to atomic would take that away.
    const { editor } = await mount(expandedEditable);
    editor.getEditorState().read(() => {
      expect($shellModes()).toEqual({ opener: "normal", caller: "normal" });
    });
  });

  describe("under a keystroke", () => {
    it.each([
      [
        "inside the caller",
        (note: NoteNode) => requireDefined($noteEditableCallerNode(note), "caller"),
        1,
      ],
      [
        "at the caller's start",
        (note: NoteNode) => requireDefined($noteEditableCallerNode(note), "caller"),
        0,
      ],
      ["inside the opening glyph", $opener, 1],
      ["at the opening glyph's start", $opener, 0],
      ["at the seam between the glyph and the caller", $opener, 2],
    ])("keeps the note whole with the caret %s", async (_label, pick, offset) => {
      const { editor } = await mount(protectedShell);

      await placeCaretInShell(editor, pick, offset);
      await typeText(editor, "X");

      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        // The shell itself is untouched: the glyph and the caller still read as they did, and the
        // note's own caller never took the keystroke.
        expect($opener(note).getTextContent()).toBe("\\f");
        expect($noteEditableCallerNode(note)?.getTextContent()).toBe(
          getEditableCallerText(note.getCaller()),
        );
        expect(note.getCaller()).toBe("+");
      });
      // And the keystroke landed in the note's CONTENT, at its start — the position the shell's
      // trailing edge hands typing to, and where a `\cat` run belongs. Never a lost caller, a
      // character leaked into the caller slot, or (for the glyph) a note unwrapped as damage.
      const note = findUsjNote(usjOf(editor)?.content);
      expect(note.marker).toBe("f");
      expect(note.caller).toBe("+");
      expect(note.content?.[0]).toBe("X");
    });
  });

  it("moves a caret that lands in the shell to the one position just past it", async () => {
    const { editor } = await mount(protectedShell);

    await placeCaretInShell(
      editor,
      (note) => requireDefined($noteEditableCallerNode(note), "caller"),
      1,
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const caller = requireDefined($noteEditableCallerNode(findOnlyNote($getRoot())), "caller");
      // The shell's trailing edge: the caller's own end, which is the only offset in the shell
      // where a keystroke is redirected FORWARD into the note's content instead of rewriting a
      // shell node. On screen it is the position immediately after `\f + `.
      expect(selection.anchor.getNode().is(caller)).toBe(true);
      expect(selection.anchor.offset).toBe(caller.getTextContentSize());
    });
  });

  it("sends a CLICK in the shell to the note's content, wherever the caret was before", async () => {
    const { editor } = await mount(protectedShell);

    // The popover focuses its editor with no selection, which parks the caret at the document
    // end — inside this very note, past its content. Read as a direction that says "moving left
    // out of the note", and the click that follows lands past the whole note instead of in it.
    // A pointer names a destination, so it is not a direction at all.
    await focusPastNoteContent(editor);
    await clickCaretInShell(editor, $opener, 1);

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const caller = requireDefined($noteEditableCallerNode(findOnlyNote($getRoot())), "caller");
      expect(selection.anchor.getNode().is(caller)).toBe(true);
      expect(selection.anchor.offset).toBe(caller.getTextContentSize());
    });
  });

  it("crosses the shell in one hop coming back out of the note's content", async () => {
    const { editor } = await mount(protectedShell);

    // Arrive from the content side — what a leftward arrow press out of the note looks like.
    await act(async () => {
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        const content = requireDefined(
          note.getChildren().find((child) => child.getIndexWithinParent() > 1),
          "note content",
        );
        content.selectStart();
      });
    });
    await placeCaretInShell(
      editor,
      (note) => requireDefined($noteEditableCallerNode(note), "caller"),
      2,
    );

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      // Out of the note entirely, rather than pushed forward again into its content — which would
      // trap the caret against a shell it can never cross.
      const note = findOnlyNote($getRoot());
      const anchorNode = selection.anchor.getNode();
      expect(note.is(anchorNode)).toBe(false);
      expect(anchorNode.getParent()?.is(note) ?? false).toBe(false);
    });
  });

  it("leaves an editable shell alone, caret and keystroke both", async () => {
    const { editor } = await mount(expandedEditable);

    await placeCaretInShell(
      editor,
      (note) => requireDefined($noteEditableCallerNode(note), "caller"),
      1,
    );
    await typeText(editor, "X");

    editor.getEditorState().read(() => {
      // The Markers view edits the caller as text on purpose, and the engine folds what was typed
      // onto the note's own caller. The guard must be a no-op there, so that still happens.
      const note = findOnlyNote($getRoot());
      expect(note.getCaller()).toBe("X+");
      expect($noteEditableCallerNode(note)?.getTextContent()).toBe(getEditableCallerText("X+"));
    });
  });
});
