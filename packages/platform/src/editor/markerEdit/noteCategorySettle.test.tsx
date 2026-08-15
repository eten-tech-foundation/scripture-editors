/**
 * Integration regressions for a note's `\cat` category display run: display, edit-settle, and
 * deletion-settle. Mounts the marker-edit engine (which registers the cat sync itself, the same
 * home the milestone sync has) over an inline-expanded (unclosed) note carrying a category — the
 * shape `\f + \cat People\cat*\ft …\f*` loads to. The grace + pend + settle-on-departure wiring
 * must fold an edited value back onto `category`, and clear `category` when the run is deleted,
 * without the sync resurrecting either.
 */

import {
  findOnlyNote,
  noteUsx,
  requireDefined,
  serializedState,
  viewOptions,
} from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { act } from "@testing-library/react";
import { $getRoot, $isTextNode, $setSelection, TextNode } from "lexical";
import {
  $isNoteNode,
  $noteCategoryRunPieces,
  $noteEditableCallerNode,
  NBSP,
  NoteNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

/** Mount an inline-expanded (unclosed) note with `category="People"`. */
async function renderExpandedNoteWithCategory() {
  return baseTestEnvironment(
    serializedState(noteUsx(`closed="false" category="People"`)),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
}

/** The paragraph text node holding " after" — a caret parking spot outside the note. */
function $textOutsideNote(): TextNode {
  const text = $getRoot()
    .getChildren()
    .flatMap((child) => ("getChildren" in child ? (child as NoteNode).getChildren() : []))
    .find((node): node is TextNode => $isTextNode(node) && node.getTextContent().includes("after"));
  return requireDefined(text, "text outside the note not found");
}

describe("note \\cat category run", () => {
  it("loads with the run directly after the caller, canonical bytes", async () => {
    const { editor } = await renderExpandedNoteWithCategory();
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getCategory()).toBe("People");
      const pieces = $noteCategoryRunPieces(note);
      expect(pieces.wrapper).toBeDefined();
      expect(pieces.opener?.getTextContent()).toBe("\\cat");
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}People`);
      expect(pieces.closer?.getTextContent()).toBe("\\cat*");
      // The run rides directly after the editable caller.
      const anchor = requireDefined($noteEditableCallerNode(note), "editable caller not found");
      expect(anchor.getNextSibling()?.is(pieces.wrapper)).toBe(true);
    });
  });

  it("editing the value settles onto category on caret departure", async () => {
    const { editor } = await renderExpandedNoteWithCategory();

    // Edit the displayed value with the caret inside it (mid-edit shape).
    await act(async () =>
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        const value = requireDefined($noteCategoryRunPieces(note).value, "cat value not found");
        value.setTextContent(`${NBSP}Places`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits in the value: node state still has the OLD category.
    editor.getEditorState().read(() => {
      expect(findOnlyNote($getRoot()).getCategory()).toBe("People");
    });

    // Caret departs → the pended note settles via the note-scope re-tokenize.
    await act(async () =>
      editor.update(() => {
        const text = $textOutsideNote();
        text.select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getCategory()).toBe("Places");
      // The settled run is canonical for the new value.
      const pieces = $noteCategoryRunPieces(note);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}Places`);
      expect(pieces.opener?.getTextContent()).toBe("\\cat");
      expect(pieces.closer?.getTextContent()).toBe("\\cat*");
    });
  });

  it("deleting the whole run clears category on caret departure with no resurrection", async () => {
    const { editor } = await renderExpandedNoteWithCategory();

    await act(async () =>
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        const wrapper = requireDefined($noteCategoryRunPieces(note).wrapper, "wrapper not found");
        wrapper.remove();
        const anchor = requireDefined($noteEditableCallerNode(note), "caller not found");
        anchor.select(anchor.getTextContentSize(), anchor.getTextContentSize());
      }),
    );

    // Grace holds at the deletion site: the sync must NOT re-derive the run, and category is
    // still set (pending, not settled).
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect($noteCategoryRunPieces(note).opener).toBeUndefined();
      expect(note.getCategory()).toBe("People");
    });

    await act(async () =>
      editor.update(() => {
        const text = $textOutsideNote();
        text.select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getCategory()).toBeUndefined();
      expect($noteCategoryRunPieces(note).opener).toBeUndefined();
      expect($noteCategoryRunPieces(note).wrapper).toBeUndefined();
    });
  });

  it("a settled category note is a rebuild fixed point (no oscillation on unrelated edits)", async () => {
    const { editor } = await renderExpandedNoteWithCategory();

    // Park the caret outside and force a settle pass with nothing pending — the canonical tree
    // must refuse the rebuild (fixed point), not splice a different structure every pass.
    await act(async () =>
      editor.update(() => {
        $setSelection(null);
      }),
    );

    const before = JSON.stringify(editor.getEditorState().toJSON());
    await act(async () =>
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        // Dirty the note without changing anything (a no-op write) so its transforms re-run.
        if ($isNoteNode(note)) note.setCategory(note.getCategory());
        note.markDirty();
      }),
    );
    const after = JSON.stringify(editor.getEditorState().toJSON());
    expect(after).toBe(before);
  });
});
