import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { $rebuildNoteContent, $rebuildParas } from "./tier2Rebuild.utils";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  ElementNode,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  NBSP,
  NoteNode,
  TypedMarkNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes } from "shared-react";

const viewOptions = getViewOptions(STANDARD_VIEW_MODE);
if (!viewOptions) throw new Error("Standard view options are required for these tests.");

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/**
 * USX for a paragraph with an inline note. `closed` controls whether the note renders
 * expanded inline (Task 1: `closed="false"` → PT9 `opennote`) or collapsed.
 */
function noteUsx(noteAttrs: string, noteContent = `<char style="ft">A note</char>`) {
  return usxStringToUsj(
    `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" />` +
      `<para style="p"><verse number="1" style="v" />text` +
      `<note caller="+" style="f" ${noteAttrs}>${noteContent}</note> after</para></usx>`,
  );
}

/** Serialize `usj` to a standard-view editor state string (root wrapper). */
function serializedState(usj: ReturnType<typeof usxStringToUsj>): string {
  initializeSerialize(undefined, undefined);
  initializeDeserialize(undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  return JSON.stringify({ root: state.root });
}

/**
 * Mount a headless standard-view editor with `MarkerEditPlugin` active, containing an
 * inline-expanded (unclosed) note whose `\ft` content is a single char span.
 */
async function renderStandardEditorWithUnclosedNote() {
  return baseTestEnvironment(
    serializedState(noteUsx(`closed="false"`)),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
}

/** The single NoteNode in the tree (throws if not exactly one). */
function findOnlyNote(root: ElementNode): NoteNode {
  const notes: NoteNode[] = [];
  const walk = (node: LexicalNode) => {
    if ($isNoteNode(node)) notes.push(node);
    if ($isElementNode(node)) node.getChildren().forEach(walk);
  };
  root.getChildren().forEach(walk);
  if (notes.length !== 1) throw new Error(`expected exactly one note, found ${notes.length}`);
  return notes[0];
}

/** The `\ft` content TextNode of the note (the one holding "A note"). */
function $noteContentText(note: NoteNode): TextNode {
  const text = note
    .getChildren()
    .filter($isCharNode)
    .flatMap((char) => char.getChildren())
    .find(
      (node): node is TextNode => $isTextNode(node) && node.getTextContent().includes("A note"),
    );
  return requireDefined(text, "note content text node not found");
}

/** Char markers (in order) directly inside the note's content. */
function noteCharMarkers(note: NoteNode): string[] {
  return note
    .getChildren()
    .filter($isCharNode)
    .map((char) => char.getMarker());
}

/**
 * Simulate typing `text` at the end of the note's `\ft` content (drives the real
 * `$textNodeTier2Transform` / whitespace transform through the mounted plugin).
 */
async function typeInNoteContent(editor: { update: (fn: () => void) => void }, text: string) {
  await act(async () => {
    editor.update(() => {
      const content = $noteContentText(findOnlyNote($getRoot()));
      const end = content.getTextContentSize();
      content.select(end, end);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    });
  });
}

describe("note-scope Tier 2 rebuild", () => {
  it("re-tokenizes a typed marker inside note content, leaving the note atomic to the paragraph", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    // Type a terminated `\fq ` marker after the existing `\ft` content.
    await typeInNoteContent(editor, " \\fq quote");

    editor.getEditorState().read(() => {
      const root = $getRoot();
      const note = findOnlyNote(root);
      // The note's content re-tokenized into `\ft` then `\fq` char spans.
      expect(noteCharMarkers(note)).toEqual(["ft", "fq"]);
      const fq = requireDefined(
        note
          .getChildren()
          .filter($isCharNode)
          .find((c) => c.getMarker() === "fq"),
        "fq char not found",
      );
      // The `\fq` is now a structural marker glyph + separate content text — not the
      // literal backslash text the user typed.
      expect(fq.getChildren()[0]?.getType()).toBe("marker");
      const fqText = requireDefined(
        fq.getChildren().find((n) => $isTextNode(n) && !$isMarkerNode(n)),
        "fq content text",
      );
      expect(fqText.getTextContent()).toContain("quote");
      expect(fqText.getTextContent()).not.toContain("\\"); // no literal backslash left in content

      // The note stayed atomic to its paragraph: still exactly one note, in the same para,
      // and the surrounding paragraph text is untouched.
      const paras = root.getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      const paraNoteCount = paras[0].getChildren().filter($isNoteNode).length;
      expect(paraNoteCount).toBe(1);
      expect(paras[0].getTextContent()).toContain("text");
      expect(paras[0].getTextContent()).toContain("after");
    });
  });

  it("preserves the note node identity, its opening marker, and its caller across the rebuild", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    let noteKey = "";
    let callerKey = "";
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      noteKey = note.getKey();
      callerKey = requireDefined(note.getChildren()[1], "caller node not found").getKey();
    });

    await typeInNoteContent(editor, " \\fq quote");

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getKey()).toBe(noteKey); // same NoteNode instance, not recreated
      expect(note.getMarker()).toBe("f");
      expect(note.getCaller()).toBe("+");
      // Opening marker `\f` and the caller node are preserved (same caller instance).
      expect(note.getChildren()[0]?.getTextContent()).toBe("\\f");
      expect(note.getChildren()[1]?.getKey()).toBe(callerKey);
      expect(note.getChildren()[1]?.getTextContent()).toBe(` +${NBSP}`); // getEditableCallerText("+")
    });
  });

  it("displays note-content space runs as NBSP", async () => {
    const { editor } = await renderStandardEditorWithUnclosedNote();

    await typeInNoteContent(editor, " two  spaces");

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      const text = note.getTextContent();
      // The double space is shown as NBSP (whitespace-display invariant), not raw spaces.
      expect(text).toContain(`two${NBSP}${NBSP}spaces`);
      expect(text).not.toContain("two  spaces");
    });
  });

  it("refuses to rebuild a collapsed note's content (preserve-or-refuse)", async () => {
    // A closed note collapses in standard view; its content is not inline re-tokenizable.
    const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
    editor.setEditorState(
      editor.parseEditorState(serializedState(noteUsx(""))), // closed (collapsed) note
    );
    editor.update(
      () => {
        const note = findOnlyNote($getRoot());
        expect(note.getIsCollapsed()).toBe(true);
        expect($rebuildNoteContent(note, viewOptions)).toBe(false);
      },
      { discrete: true },
    );
  });

  it("refuses a no-op rebuild (fixed point) so it cannot loop", async () => {
    const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
    editor.setEditorState(editor.parseEditorState(serializedState(noteUsx(`closed="false"`))));
    editor.update(
      () => {
        // No new marker typed: re-tokenizing the unchanged content is a fixed point.
        const note = findOnlyNote($getRoot());
        expect($rebuildNoteContent(note, viewOptions)).toBe(false);
        expect(noteCharMarkers(note)).toEqual(["ft"]); // untouched
      },
      { discrete: true },
    );
  });

  it("keeps a NoteNode atomic inside a paragraph rebuild (does not descend into content)", async () => {
    const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
    editor.setEditorState(editor.parseEditorState(serializedState(noteUsx(`closed="false"`))));
    let noteKey = "";
    let contentTextKey = "";
    editor.update(
      () => {
        const note = findOnlyNote($getRoot());
        noteKey = note.getKey();
        contentTextKey = $noteContentText(note).getKey();
        const para = requireDefined(
          $getRoot().getChildren().filter($isParaNode)[0],
          "para not found",
        );
        // Force a real paragraph rebuild by typing a terminated char marker in the
        // trailing text, so the rebuild runs (not a no-op) and must carry the note through.
        const after = requireDefined(
          para
            .getChildren()
            .filter($isTextNode)
            .find((n) => n.getTextContent().includes("after")),
          "trailing text not found",
        );
        after.setTextContent(` \\nd Lord\\nd*${after.getTextContent()}`);
        // A paragraph rebuild treats the note as an atomic sentinel: same note instance,
        // and its inner content text node is moved through untouched (not re-tokenized).
        expect($rebuildParas([para], viewOptions)).toBe(true);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getKey()).toBe(noteKey);
      expect($noteContentText(note).getKey()).toBe(contentTextKey);
      expect(noteCharMarkers(note)).toEqual(["ft"]);
      // The paragraph edit itself did rebuild (the `\nd` span was created).
      const paraJson = JSON.stringify(editor.getEditorState().toJSON());
      expect(paraJson).toContain('"marker":"nd"');
    });
  });
});
