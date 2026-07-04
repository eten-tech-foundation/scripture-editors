import { historyTestEnvironment, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ENTER_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $createMarkerNode, $createNoteNode, $createParaNode, $isParaNode, NBSP } from "shared";

describe("Tier 2 literal-text triggers", () => {
  it("re-tokenizes a terminated typed char marker", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello world`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello world`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd Lord\\nd* world`);
      }),
    );
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).not.toContain("\\\\nd ");
  });

  it("leaves an unterminated backslash sequence alone until Enter", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd`);
      }),
    );
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\nd");
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"nd"');
  });

  it("splits paragraphs on pasted multi-para USFM (simulated as one insertion)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}start end`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}start end`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}start \\q1 poetry \\v 2 verse two end`);
      }),
    );
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("q1");
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"number":"2"');
  });

  it("keeps subsequent keystrokes in the glyph after a mid-paragraph marker split (no scramble)", async () => {
    // Typing `\z` mid-paragraph terminates immediately against the pre-existing following
    // space and splits the paragraph. The user is mid-way through typing a longer marker
    // name (`\zfoo `): each subsequent keystroke must land at the END of the glyph so the
    // name builds up in order. Pre-fix, the post-rebuild caret sat INSIDE the glyph
    // (between "\" and "z"), so `\zfoo ` came out as the scrambled `\foo z` (Task 9 QA).
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(`${NBSP}For Yahweh knows the way`)),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}For Yahweh knows the way`);
        expect(text).toBeDefined();
        // simulate the user having just typed "\z" after "knows"; caret right after the "z"
        text?.setTextContent(`${NBSP}For Yahweh knows\\z the way`);
        const offset = `${NBSP}For Yahweh knows\\z`.length;
        text?.select(offset, offset);
      }),
    );
    // Continue typing the rest of the marker name at the restored caret.
    for (const character of ["f", "o", "o", " "]) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          expect($isRangeSelection(selection)).toBe(true);
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zfoo")).toBe(true);
    });
  });

  it("coalesces the rebuild with the triggering edit into one undo step", async () => {
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      $getRoot().append(para.append($createMarkerNode("p"), $createTextNode(`${NBSP}hello world`)));
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === `${NBSP}hello world`);
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}hello \\nd Lord\\nd* world`);
      }),
    );
    // Sanity: the rebuild actually happened before undoing it.
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"nd"');
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("hello world");
      expect($getRoot().getTextContent()).not.toContain("Lord");
      // A single undo step must fully restore the pre-edit tree: no leftover CharNode.
      expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('"marker":"nd"');
    });
  });

  it("does not re-tokenize a COLLAPSED note's content (preserve-or-refuse)", async () => {
    // The note skip is lifted (Phase 3): the trigger now fires inside note content and
    // routes to `$rebuildNoteContent`. A collapsed note, however, is not inline-editable,
    // so its content re-tokenization is refused and the typed text stays literal.
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+"); // isCollapsed defaults to true
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append(
            $createMarkerNode("f"),
            $createTextNode(`${NBSP}note text`),
            $createMarkerNode("f", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("note text"));
        expect(text).toBeDefined();
        text?.setTextContent(`${NBSP}note \\bd bold\\bd* text`);
      }),
    );
    // literal text preserved — no CharNode created inside the collapsed note
    expect(JSON.stringify(editor.getEditorState().toJSON())).toContain("\\\\bd");
  });
});
