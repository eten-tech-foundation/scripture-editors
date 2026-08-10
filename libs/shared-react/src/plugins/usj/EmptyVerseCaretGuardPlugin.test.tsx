// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { $createImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj";
import { EmptyVerseCaretGuardPlugin } from "./EmptyVerseCaretGuardPlugin";
import { baseTestEnvironment, deleteTextAtSelection } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import { $createParaNode, CURSOR_PLACEHOLDER_CHAR, ParaNode } from "shared";

async function guardedEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment($initialEditorState, <EmptyVerseCaretGuardPlugin />);
}

/** Fire the selection-change command the plugin listens on, inside act. */
async function dispatchSelectionChange(editor: LexicalEditor) {
  await act(async () => {
    editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
  });
}

describe("EmptyVerseCaretGuardPlugin", () => {
  it("hosts the caret in a verse whose text was fully deleted", async () => {
    let content: TextNode;
    const { editor } = await guardedEnvironment(() => {
      content = $createTextNode("hello");
      $getRoot().append($createParaNode("p").append($createImmutableVerseNode("1"), content));
    });

    // Delete all of verse 1's text: the caret collapses to a hostless element point.
    await deleteTextAtSelection(editor, content!, 0, content!, 5);
    await dispatchSelectionChange(editor);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild() as ParaNode;
      const children = para.getChildren();
      // A single zero-width-space host now follows the verse marker.
      expect(children.length).toBe(2);
      expect(children[0]).toBeInstanceOf(ImmutableVerseNode);
      expect($isTextNode(children[1])).toBe(true);
      expect(children[1].getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
      // The caret rests inside that host, so it is visible and typing lands in the verse.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.isCollapsed()).toBe(true);
      expect(selection.anchor.key).toBe(children[1].getKey());
    });
  });

  it("does not add a host when the verse still has text", async () => {
    let content: TextNode;
    const { editor } = await guardedEnvironment(() => {
      content = $createTextNode("hello");
      $getRoot().append($createParaNode("p").append($createImmutableVerseNode("1"), content));
    });

    // Delete only part of the text, then collapse the caret into the remaining text.
    await deleteTextAtSelection(editor, content!, 0, content!, 2);
    await dispatchSelectionChange(editor);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild() as ParaNode;
      const hasPlaceholder = para
        .getChildren()
        .some((n) => $isTextNode(n) && n.getTextContent().includes(CURSOR_PLACEHOLDER_CHAR));
      expect(hasPlaceholder).toBe(false);
    });
  });

  it("strips the placeholder once real text is typed into the host", async () => {
    let content: TextNode;
    const { editor } = await guardedEnvironment(() => {
      content = $createTextNode("hi");
      $getRoot().append($createParaNode("p").append($createImmutableVerseNode("1"), content));
    });
    await deleteTextAtSelection(editor, content!, 0, content!, 2);
    await dispatchSelectionChange(editor);

    // Type into the host: its placeholder should be dropped, leaving only the typed text.
    await act(async () => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("X");
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild() as ParaNode;
      const text = para.getChildren().find((n): n is TextNode => $isTextNode(n));
      expect(text?.getTextContent()).toBe("X");
    });
  });

  it("removes the host when the caret leaves the empty verse", async () => {
    let v1Content: TextNode;
    let v2Content: TextNode;
    const { editor } = await guardedEnvironment(() => {
      v1Content = $createTextNode("hi");
      v2Content = $createTextNode("there");
      $getRoot().append(
        $createParaNode("p").append(
          $createImmutableVerseNode("1"),
          v1Content,
          $createImmutableVerseNode("2"),
          v2Content,
        ),
      );
    });

    // Empty verse 1 → a host is added and the caret rests in it.
    await deleteTextAtSelection(editor, v1Content!, 0, v1Content!, 2);
    await dispatchSelectionChange(editor);
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild() as ParaNode;
      expect(
        para
          .getChildren()
          .some((n) => $isTextNode(n) && n.getTextContent() === CURSOR_PLACEHOLDER_CHAR),
      ).toBe(true);
    });

    // Move the caret into verse 2's text: the now-stale host should be cleaned up.
    await act(async () => {
      editor.update(() => {
        v2Content!.select(0, 0);
      });
    });
    await dispatchSelectionChange(editor);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild() as ParaNode;
      const hasPlaceholder = para
        .getChildren()
        .some((n) => $isTextNode(n) && n.getTextContent().includes(CURSOR_PLACEHOLDER_CHAR));
      expect(hasPlaceholder).toBe(false);
    });
  });
});
