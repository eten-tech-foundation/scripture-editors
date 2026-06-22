// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { baseTestEnvironment } from "./react-test.utils";
import { $createImmutableVerseNode } from "../../nodes/usj";
import {
  $caretAdjacentToVerseMarker,
  $caretAtParaEnd,
  $caretAtParaStart,
  $selectionContainsVerseMarker,
  $selectionSpansBlockBoundary,
  $shouldBlockStructuralEdit,
  keyDownToIntent,
} from "./structureProtection.utils";
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $createTextNode,
  $setSelection,
  TextNode,
} from "lexical";
import { $createParaNode, $createImpliedParaNode, ParaNode } from "shared";

describe("structureProtection.utils", () => {
  it("$selectionSpansBlockBoundary: true across two paragraphs", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createImpliedParaNode().append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);
    editor.getEditorState().read(() => {
      expect($selectionSpansBlockBoundary($getSelection()!)).toBe(true);
    });
  });

  it("$selectionSpansBlockBoundary: false within one paragraph", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0, t1!, 5);
    editor.getEditorState().read(() => {
      expect($selectionSpansBlockBoundary($getSelection()!)).toBe(false);
    });
  });

  it("$selectionContainsVerseMarker: true when range includes a verse", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("text");
      $getRoot().append(para.append($createImmutableVerseNode("1"), t1));
    });
    updateSelection(editor, para!, 0, t1!, 4);
    editor.getEditorState().read(() => {
      expect($selectionContainsVerseMarker($getSelection()!)).toBe(true);
    });
  });

  it("$selectionContainsVerseMarker: true for NodeSelection containing a verse node", async () => {
    let verseNode: ReturnType<typeof $createImmutableVerseNode>;
    const { editor } = await baseTestEnvironment(() => {
      verseNode = $createImmutableVerseNode("1");
      $getRoot().append($createParaNode("p").append(verseNode, $createTextNode("text")));
    });
    editor.update(
      () => {
        const ns = $createNodeSelection();
        ns.add(verseNode.getKey());
        $setSelection(ns);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect($selectionContainsVerseMarker($getSelection()!)).toBe(true);
    });
  });

  it("$caretAtParaStart: true at offset 0 of first text, false mid-text", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($caretAtParaStart($getSelection()!)).toBe(true);
    });
    updateSelection(editor, t1!, 2);
    editor.getEditorState().read(() => {
      expect($caretAtParaStart($getSelection()!)).toBe(false);
    });
  });

  it("$caretAtParaEnd: true at end of last text, false mid-text", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 5);
    editor.getEditorState().read(() => {
      expect($caretAtParaEnd($getSelection()!)).toBe(true);
    });
    updateSelection(editor, t1!, 2);
    editor.getEditorState().read(() => {
      expect($caretAtParaEnd($getSelection()!)).toBe(false);
    });
  });

  it("empty paragraph: caret is both at start and at end", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      $getRoot().append($createParaNode("q").append($createTextNode("prev")), para);
    });
    updateSelection(editor, para!, 0);
    editor.getEditorState().read(() => {
      const sel = $getSelection()!;
      expect($caretAtParaStart(sel)).toBe(true);
      expect($caretAtParaEnd(sel)).toBe(true);
    });
  });

  it("$caretAdjacentToVerseMarker backward: true when caret immediately follows a verse", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("text");
      $getRoot().append(para.append($createImmutableVerseNode("1"), t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($caretAdjacentToVerseMarker($getSelection()!, "backward")).toBe(true);
      expect($caretAdjacentToVerseMarker($getSelection()!, "forward")).toBe(false);
    });
  });
});

describe("keyDownToIntent (B1 — modifier mapping)", () => {
  const ev = (key: string, mods: KeyboardEventInit = {}) =>
    new KeyboardEvent("keydown", { key, ...mods });

  it("maps plain and modified Backspace/Delete to deletions (NOT skipped on modifiers)", () => {
    expect(keyDownToIntent(ev("Backspace"))).toBe("deleteBackward");
    expect(keyDownToIntent(ev("Backspace", { altKey: true }))).toBe("deleteBackward");
    expect(keyDownToIntent(ev("Backspace", { metaKey: true }))).toBe("deleteBackward");
    expect(keyDownToIntent(ev("Backspace", { ctrlKey: true }))).toBe("deleteBackward");
    expect(keyDownToIntent(ev("Delete"))).toBe("deleteForward");
    expect(keyDownToIntent(ev("Delete", { altKey: true }))).toBe("deleteForward");
  });

  it("maps plain Enter to insertParagraph, Shift+Enter to undefined", () => {
    expect(keyDownToIntent(ev("Enter"))).toBe("insertParagraph");
    expect(keyDownToIntent(ev("Enter", { shiftKey: true }))).toBeUndefined();
  });

  it("maps a printable char to insertText, but command-modified/non-editing keys to undefined", () => {
    expect(keyDownToIntent(ev("a"))).toBe("insertText");
    expect(keyDownToIntent(ev("a", { ctrlKey: true }))).toBeUndefined();
    expect(keyDownToIntent(ev("c", { metaKey: true }))).toBeUndefined();
    expect(keyDownToIntent(ev("ArrowLeft"))).toBeUndefined();
  });
});

describe("$shouldBlockStructuralEdit (decision logic)", () => {
  it("blocks deleteBackward at paragraph start with a previous block", async () => {
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t2 = $createTextNode("second");
      $getRoot().append(
        $createParaNode("p").append($createTextNode("first")),
        $createParaNode("q").append(t2),
      );
    });
    updateSelection(editor, t2!, 0);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("deleteBackward")).toBe(true);
    });
  });

  it("ALLOWS deleteBackward mid-text (regression: normal editing not blocked)", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("deleteBackward")).toBe(false);
    });
  });

  it("ALLOWS deleteBackward at the first paragraph start (nothing to merge)", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("deleteBackward")).toBe(false);
    });
  });

  it("blocks deleteBackward when the caret is immediately after a verse marker", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("text");
      $getRoot().append(
        $createParaNode("q").append($createTextNode("prev")),
        para.append($createImmutableVerseNode("1"), t1),
      );
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("deleteBackward")).toBe(true);
    });
  });

  it("always blocks insertParagraph (Enter) at a collapsed caret", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("insertParagraph")).toBe(true);
    });
  });

  it("ALLOWS insertText at a collapsed caret (typing a character is fine)", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("insertText")).toBe(false);
    });
  });

  it("blocks any intent over a selection spanning a block boundary", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append(t1), $createParaNode("q").append(t2));
    });
    updateSelection(editor, t1!, 0, t2!, 6);
    editor.getEditorState().read(() => {
      expect($shouldBlockStructuralEdit("insertText")).toBe(true);
    });
  });
});
