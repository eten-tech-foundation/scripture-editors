/**
 * `ViewOptions.isNoteShellEditable: false` — an expanded note's opening glyph and caller are
 * governed by the host's UI (Paratext 10's footnote editor has a dropdown for each, as does
 * Paratext 9), so the caret must not be able to enter them and typing must not be able to change
 * them.
 *
 * Left editable, that slot is not merely cosmetic: an edit to it looks accepted and does not
 * persist, and the note-scoped Tier-2 rebuild refuses a caller it cannot recognize — so anything
 * else typed there (a `\cat` category run, which Paratext 9 puts exactly there) is dropped with
 * it. Making the shell atomic is what routes such typing to the note's CONTENT instead, which is
 * the position the tokenizer folds `\cat` from.
 */
import { findOnlyNote, noteUsx, viewOptions } from "./markerEdit.test-helpers";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $getRoot, $isTextNode } from "lexical";
import { $isMarkerNode } from "shared";
import { ViewOptions } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

const expandedEditable: ViewOptions = { ...viewOptions, noteMode: "expanded" };
const protectedShell: ViewOptions = { ...expandedEditable, isNoteShellEditable: false };

/** `serializedState` from the shared helpers always uses the default view options; these two
 * cases differ ONLY in the view options, so the state has to be built with the one under test. */
async function mount(view: ViewOptions) {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(noteUsx(`closed="false"`), view);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <MarkerEditPlugin viewOptions={view} />,
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

describe("expanded note shell", () => {
  it("is atomic when the host governs the marker and caller", async () => {
    const { editor } = await mount(protectedShell);
    editor.getEditorState().read(() => {
      // `token` is Lexical's atomic text mode: no caret inside, no typing into it, and the whole
      // node is the unit of deletion — the same treatment a collapsed caller already gets.
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
});
