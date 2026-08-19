/**
 * The transient caret host past a trailing note, in the plugin combination the app actually mounts.
 *
 * `TrailingNoteCaretGuardPlugin`'s own tests (shared-react) pin its lifecycle in isolation. What
 * only this combination can answer is whether the host survives contact with the transforms that
 * run when its insertion dirties the paragraph — the marker-edit engine's pend/settle machinery and
 * the trailing-space transform, both of which act on text nodes in a paragraph — and whether the
 * character can reach the file. Loading real USJ through the production adaptor and comparing the
 * serialized USJ before and after the caret arrives is the sharpest form of that question: any
 * fabricated byte, from the host itself or from a transform the host woke, shows up as a diff.
 *
 * jsdom performs no layout and no hit testing, so whether a browser PAINTS a caret in the host — the
 * reason the host exists — cannot be asserted anywhere headless. That stays a manual check.
 */

import editorUsjAdaptor, {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "./adaptors/editor-usj.adaptor";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "./adaptors/usj-editor.adaptor";
import { MarkerEditPlugin } from "./markerEdit/MarkerEditPlugin";
import { Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import {
  CharNodePlugin,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
  TrailingNoteCaretGuardPlugin,
  ViewOptions,
} from "shared-react";
import { $isNoteNode, $isParaNode, CURSOR_PLACEHOLDER_CHAR, ParaNode } from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../libs/shared-react/src/plugins/usj/react-test.utils";

/** `\p \v 1 before |note|` — the note is the paragraph's last child, which is the whole point. */
const USX = `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />before <note caller="+" style="f"><char style="fr">1.1: </char><char style="ft">note body</char></note></para></usx>`;

function requireStandardViewOptions(): ViewOptions {
  const options = getViewOptions(STANDARD_VIEW_MODE);
  if (!options) throw new Error("Standard view options are required for these tests.");
  return options;
}

/** Loads `USX` through the production adaptor and mounts the transform-registering plugins. */
async function mountLoaded(): Promise<{
  editor: LexicalEditor;
  usj: Usj;
  viewOptions: ViewOptions;
}> {
  const viewOptions = requireStandardViewOptions();
  const usj = usxStringToUsj(USX);
  initializeSerialize(undefined, undefined);
  reset();
  initializeDeserialize(undefined);
  const state = serializeEditorState(usj, viewOptions);
  const { editor } = await baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
      <TrailingNoteCaretGuardPlugin />
    </>,
  );
  return { editor, usj, viewOptions };
}

/** The paragraph holding the trailing note. */
function readNoteParagraph(editor: LexicalEditor): ParaNode {
  return editor.getEditorState().read(() => {
    const para = $getRoot()
      .getChildren()
      .find((child): child is ParaNode => $isParaNode(child) && $isNoteNode(child.getLastChild()));
    if (!para) throw new Error("no paragraph ending in a note");
    return para;
  });
}

/** Marks `node` and every descendant dirty, so each one's registered transforms run. */
function $markSubtreeDirty(node: LexicalNode): void {
  node.markDirty();
  if ($isElementNode(node)) node.getChildren().forEach($markSubtreeDirty);
}

/** Rest the caret on the paragraph's own end — the position past the trailing note. */
async function restCaretPastNote(editor: LexicalEditor, para: ParaNode): Promise<void> {
  await act(async () => {
    editor.update(
      () => {
        para.select(para.getChildrenSize(), para.getChildrenSize());
      },
      { discrete: true },
    );
  });
  await act(async () => {
    editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
  });
}

describe("the caret host past a trailing note, with the production transforms mounted", () => {
  it("hosts the caret without changing the document the transforms see", async () => {
    const { editor, viewOptions } = await mountLoaded();
    const para = readNoteParagraph(editor);
    const before = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);

    await restCaretPastNote(editor, para);

    editor.getEditorState().read(() => {
      const last = para.getLastChild();
      if (!$isTextNode(last)) throw new Error("expected a text host as the paragraph's last child");
      // Exactly the host, and nothing else: no trailing space was fabricated onto it, and it was
      // not swallowed by the empty-verse-content branch of the trailing-space transform.
      expect(last.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.key).toBe(last.getKey());
    });

    // The character never reaches the file: the serialized USJ is byte-identical either way.
    const after = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toContain(CURSOR_PLACEHOLDER_CHAR);
  });

  it("survives a transform pass over its own paragraph without being padded or swallowed", async () => {
    // The host is a text node in a paragraph, which is exactly what the trailing-space transform and
    // the marker-edit engine's plain-text catch-all act on. Dirtying the paragraph and its children
    // runs both over it. It must come out byte-identical — no fabricated trailing space, no empty-
    // verse-content clearing — and the document must still serialize to what was loaded.
    const { editor, usj, viewOptions } = await mountLoaded();
    const para = readNoteParagraph(editor);
    await restCaretPastNote(editor, para);

    // The host is in the tree GOING IN — otherwise the pass below asserts nothing about it.
    editor.getEditorState().read(() => {
      const last = para.getLastChild();
      expect($isTextNode(last) && last.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
    });

    await act(async () => {
      editor.update(
        () => {
          para.markDirty();
          para.getChildren().forEach((child) => child.markDirty());
        },
        { discrete: true },
      );
    });

    // Whether the host OUTLIVES the pass is deliberately not asserted, for the same reason the
    // whole-document test below gives: dirtying wholesale can strand the selection at the root, and
    // the guard then correctly removes a host no caret is resting in. Pinning its survival pins an
    // artifact of the harness — and did, intermittently — rather than a property of the guard. What
    // the transforms must not do is leave a mark, and the serialized document is where either
    // failure would show: a fabricated trailing space, or a swallowed placeholder, changes it.
    const after = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    expect(after).toEqual(usj);
  });

  it("keeps the loaded document a fixed point when everything is dirtied with the caret resting there", async () => {
    // The corpus fixed-point net runs this pass with no caret anywhere. With a caret resting past
    // the note there is a host in the tree while every transform fires, so this is the same
    // assertion under the one condition the corpus net cannot create: whatever the pass leaves
    // behind, the document must still serialize to exactly what was loaded, with no placeholder in
    // it. (Whether the host itself outlives the pass is left unasserted on purpose — the pass can
    // strand the selection at the root, and the guard then correctly cleans the host up, so pinning
    // its survival would pin an artifact of the harness rather than a property of the guard.)
    const { editor, usj, viewOptions } = await mountLoaded();
    const para = readNoteParagraph(editor);
    await restCaretPastNote(editor, para);

    await act(async () => {
      editor.update(
        () => {
          $getRoot().getChildren().forEach($markSubtreeDirty);
        },
        { discrete: true },
      );
    });

    const after = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    expect(after).toEqual(usj);
    expect(JSON.stringify(after)).not.toContain(CURSOR_PLACEHOLDER_CHAR);
  });

  it("lands typed text after the note, in the paragraph, and in the saved USJ", async () => {
    const { editor, viewOptions } = await mountLoaded();
    const para = readNoteParagraph(editor);
    await restCaretPastNote(editor, para);

    await act(async () => {
      editor.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("X");
        },
        { discrete: true },
      );
    });

    editor.getEditorState().read(() => {
      const last = para.getLastChild();
      expect($isTextNode(last) && last.getTextContent()).toBe("X");
      const note = para.getChildAtIndex(para.getChildrenSize() - 2);
      expect($isNoteNode(note)).toBe(true);
      expect(note?.getTextContent()).not.toContain("X");
    });

    const usjAfter = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
    const serialized = JSON.stringify(usjAfter);
    expect(serialized).not.toContain(CURSOR_PLACEHOLDER_CHAR);
    expect(serialized).toContain("X");
  });
});
