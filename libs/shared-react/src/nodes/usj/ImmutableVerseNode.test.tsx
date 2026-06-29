import { baseTestEnvironment } from "../../plugins/usj/react-test.utils";
import {
  $createImmutableVerseNode,
  ImmutableVerseNode,
  VERSE_SELECTED_CLASS_NAME,
} from "./ImmutableVerseNode";
import { act } from "@testing-library/react";
import {
  $createNodeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  LexicalEditor,
} from "lexical";
import { $createParaNode } from "shared";

/** Query the rendered verse marker that carries the "selected" class, if any. */
function selectedVerseEl(editor: LexicalEditor): Element | null {
  return editor.getRootElement()?.querySelector(`.${VERSE_SELECTED_CLASS_NAME}`) ?? null;
}

describe("ImmutableVerseNode selected-state rendering", () => {
  it("renders no selected class when the verse is not in a NodeSelection", async () => {
    const { editor } = await baseTestEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createImmutableVerseNode("1"), $createTextNode("text")),
      );
    });

    expect(selectedVerseEl(editor)).toBeNull();
  });

  it("renders the selected class when its key is added to a NodeSelection, and removes it when cleared", async () => {
    let verse: ImmutableVerseNode;
    const { editor } = await baseTestEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      $getRoot().append($createParaNode("p").append(verse, $createTextNode("text")));
    });

    // Arm: select the verse marker.
    await act(async () => {
      editor.update(
        () => {
          const ns = $createNodeSelection();
          ns.add(verse.getKey());
          $setSelection(ns);
        },
        { discrete: true },
      );
    });
    expect(selectedVerseEl(editor)).not.toBeNull();

    // Clear: collapse back to a range caret in the text.
    await act(async () => {
      editor.update(() => $setSelection(null), { discrete: true });
    });
    expect(selectedVerseEl(editor)).toBeNull();
  });
});
