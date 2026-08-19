/**
 * An undo must reach the file the same way typing does.
 *
 * Reported: renaming a milestone's marker worked, but undoing the rename left the RENAMED name in
 * the saved file even after the caret moved away. The screen showed the original name; the file
 * kept the new one — Invariant I (the displayed bytes are the document) violated across undo.
 *
 * The mechanism these pins guard is a mismatch between how a host is TOLD the document changed and
 * what it then SAVES:
 *
 * - the host schedules a save only in response to `onUsjChange`;
 * - `onUsjChange` fires off the delta/tree leg (`deserializeEditorState`), which reads node state
 *   and excludes engine-owned display bytes from its coordinates by design (Invariant II);
 * - but the host saves `EditorRef.getUsj()`, the read-only SETTLED leg, which re-tokenizes those
 *   display bytes.
 *
 * A marker edit undoes in two history steps — the Tier-2 settle (node state) and the typed glyph
 * bytes — and those two legs change on OPPOSITE steps. The step that restores the displayed bytes
 * therefore changes the settled document while producing no delta ops and no tree-USJ difference,
 * so nothing notified the host and the file kept the pre-undo content.
 *
 * So the load-bearing property is not "the editor state is right after undo" (it already was) but
 * "every undo/redo step that changes the SETTLED document notifies the host". That is what
 * `assertEveryDocumentChangeWasNotified` asserts, and it is deliberately independent of how many
 * history steps a given edit happens to occupy — multi-step undo for applies and settles is
 * ratified behavior, so a pin that hard-codes a press count would be pinning the wrong thing.
 *
 * Both legs are asserted byte-for-byte against the document as it stood BEFORE the edit, captured
 * from the editor itself rather than hand-written, so the pin cannot drift from what a load
 * actually produces. Equivalence between the legs alone would be vacuous — two legs can agree on
 * the same wrong answer — so every shape below also names the expected marker VALUE.
 */

import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { EditorRef } from "../editor.model";
import { mountStandardViewEditor, requireStandardViewOptions } from "../settledGetUsj.test-helpers";
import { requireDefined } from "./markerEdit.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, LexicalEditor, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { RefObject } from "react";
import { $isMarkerNode, $isParaNode } from "shared";

const viewOptions = requireStandardViewOptions();

// Undo/redo restore a collapsed selection while the editor root holds DOM focus, and Lexical's
// post-commit scroll-into-view reads a rect off the selection target — a Range or an Element.
// jsdom implements neither. (The shared harness stubs `Range` only; undo needs `Element` too.)
// Same zero-rect stub markerEditUndoResettle.test.tsx uses.
function zeroRect(): DOMRect {
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
}
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = zeroRect;
if (typeof Element.prototype.getBoundingClientRect !== "function")
  Element.prototype.getBoundingClientRect = zeroRect;

/** A two-paragraph doc carrying `milestone`, plus somewhere to depart the caret to. */
function milestoneUsj(milestone: MarkerObject): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1" },
      { type: "para", marker: "p", content: ["before ", milestone, " after"] },
      { type: "para", marker: "p", content: ["depart here"] },
    ],
  };
}

const plainUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: ["hello world"] },
    { type: "para", marker: "p", content: ["depart here"] },
  ],
};

/** The editor's USJ through the editor→USJ adaptor — the tree leg. */
function treeUsj(lexical: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(lexical.getEditorState().toJSON(), viewOptions);
}

/** Stable serialization of a leg's output, for byte-for-byte comparison. */
function bytes(usj: Usj | undefined): string {
  return JSON.stringify(usj);
}

type MilestoneMarkerObject = MarkerObject & { who?: string; sid?: string };

/** The single `ms` marker object anywhere in `usj`, or undefined. */
function msOf(usj: Usj | undefined): MilestoneMarkerObject | undefined {
  const found: MarkerObject[] = [];
  const walk = (content: MarkerObject["content"]): void => {
    content?.forEach((entry) => {
      if (typeof entry === "string") return;
      if (entry.type === "ms") found.push(entry);
      walk(entry.content);
    });
  };
  walk(usj?.content);
  return found.length === 1 ? found[0] : undefined;
}

/** Flush the deferred (microtask) settle resolution and change notification. */
async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Move the caret to the last paragraph and let the departure settle run to completion. */
async function departAndSettle(
  lexical: LexicalEditor,
  ref: RefObject<EditorRef | null>,
): Promise<void> {
  await act(async () => {
    lexical.update(() => {
      requireDefined(
        $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("depart here")),
        "departure target not found",
      ).select(0, 0);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => ref.current?.commitPendingMarkerEdits?.());
  await flush();
}

/** One press of undo or redo, with the deferred work flushed. */
async function press(lexical: LexicalEditor, command: typeof UNDO_COMMAND): Promise<void> {
  await act(async () => {
    lexical.dispatchCommand(command, undefined);
    await Promise.resolve();
  });
  await flush();
}

/** What one history press did: the document the host would save, and how many times it was told. */
interface Press {
  saved: string;
  tree: string;
  notifications: number;
}

/**
 * Press `command` `count` times, recording after each press the document the host would SAVE
 * (`getUsj()`, the settled leg), the tree leg, and how many host notifications that press produced.
 */
async function pressAndRecord(
  lexical: LexicalEditor,
  ref: RefObject<EditorRef | null>,
  notified: Usj[],
  command: typeof UNDO_COMMAND,
  count: number,
): Promise<Press[]> {
  const presses: Press[] = [];
  for (let i = 0; i < count; i++) {
    const before = notified.length;
    // History presses are inherently sequential — each one's result depends on the last.
    await press(lexical, command);
    presses.push({
      saved: bytes(ref.current?.getUsj()),
      tree: bytes(treeUsj(lexical)),
      notifications: notified.length - before,
    });
  }
  return presses;
}

/**
 * THE defect pin. For every press that CHANGED the document the host would save, the host must
 * have been notified at least once — that notification is the only thing that schedules a save, so
 * a changed-but-unannounced document is exactly "the file keeps the pre-undo content".
 *
 * A press that changes NEITHER leg is history exhaustion (nothing left to undo, so Lexical commits
 * nothing) and must stay silent; that direction is what stops the contract from being satisfiable
 * by an unconditional notification on every tick. A press that moves only the tree leg is
 * deliberately unconstrained: that is the first half of a marker edit's two-step history, it does
 * not change what a save would write, and notifying there is harmless (the host compares against
 * what it last read from disk before writing).
 */
function assertEveryDocumentChangeWasNotified(
  startingPoint: { saved: string; tree: string },
  presses: Press[],
): void {
  let previous = startingPoint;
  presses.forEach(({ saved, tree, notifications }, index) => {
    const savedChanged = saved !== previous.saved;
    const nothingChanged = !savedChanged && tree === previous.tree;
    const actual = { press: index + 1, notified: notifications > 0 };
    if (savedChanged) expect(actual).toEqual({ press: index + 1, notified: true });
    else if (nothingChanged) expect(actual).toEqual({ press: index + 1, notified: false });
    previous = { saved, tree };
  });
}

describe("an undo reaches the file the same way typing does", () => {
  it("undoing a milestone marker rename restores the pre-edit document in BOTH legs, and tells the host", async () => {
    const notified: Usj[] = [];
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
      (usj) => notified.push(usj),
    );

    // The document as loaded, taken from the editor so the pin cannot drift from a real load.
    const preEditSaved = bytes(ref.current?.getUsj());
    const preEditTree = bytes(treeUsj(lexical));
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt-s");

    // Rename the milestone in its opening glyph: \qt-s -> \qt1-s.
    await act(async () => {
      lexical.update(() => {
        const glyph = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((node) => $isMarkerNode(node) && node.getMarker() === "qt-s"),
          "milestone opening glyph not found",
        );
        glyph.setTextContent("\\qt1-s");
        glyph.select(6, 6);
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await departAndSettle(lexical, ref);

    // The rename landed in both legs; this is the state the file now holds.
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt1-s");
    expect(msOf(treeUsj(lexical))?.marker).toBe("qt1-s");
    const renamed = { saved: bytes(ref.current?.getUsj()), tree: bytes(treeUsj(lexical)) };

    // Undo. A marker edit occupies more than one history step (settle, then typed bytes) and that
    // granularity is ratified behavior, so press enough times to walk the whole edit out and let
    // the assertions below say what must be true — rather than pinning a press count.
    const undos = await pressAndRecord(lexical, ref, notified, UNDO_COMMAND, 4);

    // 1. Behavior pin, naming the expected VALUE: the save leg is back to the ORIGINAL name.
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt-s");
    // 2. Both legs equal the pre-edit document byte-for-byte.
    expect(bytes(ref.current?.getUsj())).toBe(preEditSaved);
    expect(bytes(treeUsj(lexical))).toBe(preEditTree);
    // 3. And the host was told about every step that changed what it would save.
    assertEveryDocumentChangeWasNotified(renamed, undos);

    // The owner's "even after I moved the caret away": a departure after the undo must not
    // re-settle the restored bytes back to the renamed name.
    await departAndSettle(lexical, ref);
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt-s");
    expect(bytes(ref.current?.getUsj())).toBe(preEditSaved);
  });

  it("redoing a milestone marker rename reaches the file too", async () => {
    const notified: Usj[] = [];
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
      (usj) => notified.push(usj),
    );

    await act(async () => {
      lexical.update(() => {
        const glyph = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((node) => $isMarkerNode(node) && node.getMarker() === "qt-s"),
          "milestone opening glyph not found",
        );
        glyph.setTextContent("\\qt1-s");
        glyph.select(6, 6);
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await departAndSettle(lexical, ref);
    const renamedSaved = bytes(ref.current?.getUsj());
    const renamedTree = bytes(treeUsj(lexical));

    await pressAndRecord(lexical, ref, notified, UNDO_COMMAND, 4);
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt-s");
    const undone = { saved: bytes(ref.current?.getUsj()), tree: bytes(treeUsj(lexical)) };

    const redos = await pressAndRecord(lexical, ref, notified, REDO_COMMAND, 4);

    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt1-s");
    expect(bytes(ref.current?.getUsj())).toBe(renamedSaved);
    expect(bytes(treeUsj(lexical))).toBe(renamedTree);
    assertEveryDocumentChangeWasNotified(undone, redos);
  });

  it("undoing a paragraph marker retag reaches the file too — the class is not milestone-specific", async () => {
    const notified: Usj[] = [];
    const { ref, lexical } = await mountStandardViewEditor(plainUsj, (usj) => notified.push(usj));

    const preEditSaved = bytes(ref.current?.getUsj());
    const preEditTree = bytes(treeUsj(lexical));

    // Retag the first paragraph by editing its own marker glyph: \p -> \q1.
    await act(async () => {
      lexical.update(() => {
        const glyph = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((node) => $isMarkerNode(node) && node.getTextContent() === "\\p"),
          "paragraph marker glyph not found",
        );
        glyph.setTextContent("\\q1");
        glyph.select(3, 3);
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await departAndSettle(lexical, ref);

    const paraMarkers = (): string[] =>
      lexical.getEditorState().read(() =>
        $getRoot()
          .getChildren()
          .filter($isParaNode)
          .map((para) => para.getMarker()),
      );
    expect(paraMarkers()).toEqual(["q1", "p"]);
    const retagged = { saved: bytes(ref.current?.getUsj()), tree: bytes(treeUsj(lexical)) };

    const undos = await pressAndRecord(lexical, ref, notified, UNDO_COMMAND, 4);

    expect(paraMarkers()).toEqual(["p", "p"]);
    expect(bytes(ref.current?.getUsj())).toBe(preEditSaved);
    expect(bytes(treeUsj(lexical))).toBe(preEditTree);
    assertEveryDocumentChangeWasNotified(retagged, undos);
  });

  it("undoing and redoing a plain text edit reaches the file — the control that was never broken", async () => {
    // Ordinary text is real document content, so its undo produces genuine delta ops and always
    // notified. Kept as a control so a future change that fixes the display-byte class by
    // breaking the ordinary one fails here.
    const notified: Usj[] = [];
    const { ref, lexical } = await mountStandardViewEditor(plainUsj, (usj) => notified.push(usj));

    const preEditSaved = bytes(ref.current?.getUsj());

    await act(async () => {
      lexical.update(() => {
        const node = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((textNode) => textNode.getTextContent().includes("hello world")),
          "text node not found",
        );
        node.setTextContent("hello brave world");
        node.select(5, 5);
      });
      await Promise.resolve();
    });
    await flush();
    const edited = { saved: bytes(ref.current?.getUsj()), tree: bytes(treeUsj(lexical)) };
    expect(edited.saved).not.toBe(preEditSaved);

    const undos = await pressAndRecord(lexical, ref, notified, UNDO_COMMAND, 2);
    expect(bytes(ref.current?.getUsj())).toBe(preEditSaved);
    assertEveryDocumentChangeWasNotified(edited, undos);
    const undone = { saved: bytes(ref.current?.getUsj()), tree: bytes(treeUsj(lexical)) };

    const redos = await pressAndRecord(lexical, ref, notified, REDO_COMMAND, 2);
    expect(bytes(ref.current?.getUsj())).toBe(edited.saved);
    assertEveryDocumentChangeWasNotified(undone, redos);
  });
});
