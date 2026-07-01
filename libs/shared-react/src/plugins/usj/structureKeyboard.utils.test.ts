// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { baseTestEnvironment, sutUpdate } from "./react-test.utils";
import { $createImmutableVerseNode } from "../../nodes/usj";
import {
  $adjacentVerseMarker,
  $caretAdjacentToVerseMarker,
  $caretAtParaEnd,
  $caretAtParaStart,
  $isArmedSelection,
  $mergeParaIntoPrevious,
  $sanitizeNodesForProtectedStructure,
  $selectionContainsVerseMarker,
  $selectionSpansBlockBoundary,
  $shouldBlockStructuralEdit,
  $structuralDeleteTarget,
  keyDownToIntent,
} from "./structureKeyboard.utils";
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $createTextNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  TextNode,
} from "lexical";
import {
  $createChapterNode,
  $createCharNode,
  $createNoteNode,
  $createParaNode,
  $createImpliedParaNode,
  $isCharNode,
  $isNoteNode,
  $isSomeParaNode,
  ParaNode,
} from "shared";

describe("structureKeyboard.utils", () => {
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
      expect($shouldBlockStructuralEdit($getSelection()!, "deleteBackward")).toBe(true);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "deleteBackward")).toBe(false);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "deleteBackward")).toBe(false);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "deleteBackward")).toBe(true);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "insertParagraph")).toBe(true);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "insertText")).toBe(false);
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
      expect($shouldBlockStructuralEdit($getSelection()!, "insertText")).toBe(true);
    });
  });
});

describe("$adjacentVerseMarker", () => {
  it("backward: returns the verse immediately before a collapsed caret", async () => {
    let verse: ReturnType<typeof $createImmutableVerseNode>;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append(verse, t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($adjacentVerseMarker($getSelection()!, "backward")?.getKey()).toBe(verse!.getKey());
      expect($adjacentVerseMarker($getSelection()!, "forward")).toBeUndefined();
    });
  });

  it("forward: returns the verse immediately after a collapsed caret", async () => {
    let verse: ReturnType<typeof $createImmutableVerseNode>;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("text");
      verse = $createImmutableVerseNode("2");
      $getRoot().append($createParaNode("p").append(t1, verse));
    });
    updateSelection(editor, t1!, 4);
    editor.getEditorState().read(() => {
      expect($adjacentVerseMarker($getSelection()!, "forward")?.getKey()).toBe(verse!.getKey());
      expect($adjacentVerseMarker($getSelection()!, "backward")).toBeUndefined();
    });
  });

  it("returns undefined mid-text", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append($createImmutableVerseNode("1"), t1));
    });
    updateSelection(editor, t1!, 2);
    editor.getEditorState().read(() => {
      expect($adjacentVerseMarker($getSelection()!, "backward")).toBeUndefined();
      expect($adjacentVerseMarker($getSelection()!, "forward")).toBeUndefined();
    });
  });
});

describe("$structuralDeleteTarget", () => {
  it("deleteBackward after a verse → that verse", async () => {
    let verse: ReturnType<typeof $createImmutableVerseNode>;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      t1 = $createTextNode("text");
      $getRoot().append($createParaNode("p").append(verse, t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      const target = $structuralDeleteTarget($getSelection()!, "deleteBackward");
      expect(target).toEqual({ kind: "verse", node: expect.anything() });
      expect(target?.node.getKey()).toBe(verse!.getKey());
    });
  });

  it("deleteBackward at para start with a previous block → current para", async () => {
    let para: ParaNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("q");
      t2 = $createTextNode("second");
      $getRoot().append($createParaNode("p").append($createTextNode("first")), para.append(t2));
    });
    updateSelection(editor, t2!, 0);
    editor.getEditorState().read(() => {
      const target = $structuralDeleteTarget($getSelection()!, "deleteBackward");
      expect(target?.kind).toBe("para");
      expect(target?.node.getKey()).toBe(para!.getKey());
    });
  });

  it("deleteForward at para end with a next block → the NEXT para", async () => {
    let next: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      next = $createParaNode("q");
      $getRoot().append($createParaNode("p").append(t1), next.append($createTextNode("second")));
    });
    updateSelection(editor, t1!, 5);
    editor.getEditorState().read(() => {
      const target = $structuralDeleteTarget($getSelection()!, "deleteForward");
      expect(target?.kind).toBe("para");
      expect(target?.node.getKey()).toBe(next!.getKey());
    });
  });

  it("returns undefined at the first para start (nothing to merge)", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("first");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect($structuralDeleteTarget($getSelection()!, "deleteBackward")).toBeUndefined();
    });
  });

  it("returns undefined mid-text", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("abcdef");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 3);
    editor.getEditorState().read(() => {
      expect($structuralDeleteTarget($getSelection()!, "deleteBackward")).toBeUndefined();
      expect($structuralDeleteTarget($getSelection()!, "deleteForward")).toBeUndefined();
    });
  });
});

describe("$isArmedSelection", () => {
  it("verse: true when a NodeSelection holds the armed verse key", async () => {
    let verse: ReturnType<typeof $createImmutableVerseNode>;
    const { editor } = await baseTestEnvironment(() => {
      verse = $createImmutableVerseNode("1");
      $getRoot().append($createParaNode("p").append(verse, $createTextNode("text")));
    });
    editor.update(
      () => {
        const ns = $createNodeSelection();
        ns.add(verse.getKey());
        $setSelection(ns);
      },
      { discrete: true },
    );
    editor.getEditorState().read(() => {
      expect(
        $isArmedSelection($getSelection(), {
          key: verse.getKey(),
          kind: "verse",
          intent: "deleteBackward",
        }),
      ).toBe(true);
      expect(
        $isArmedSelection($getSelection(), {
          key: "nonexistent",
          kind: "verse",
          intent: "deleteBackward",
        }),
      ).toBe(false);
    });
  });

  it("para: true when a non-collapsed range's anchor and focus both resolve to the armed para", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("hello");
      $getRoot().append(para.append(t1));
    });
    updateSelection(editor, t1!, 0, t1!, 5);
    editor.getEditorState().read(() => {
      expect(
        $isArmedSelection($getSelection(), {
          key: para!.getKey(),
          kind: "para",
          intent: "deleteBackward",
        }),
      ).toBe(true);
    });
  });

  it("para: false for a collapsed caret (nothing armed)", async () => {
    let para: ParaNode;
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      para = $createParaNode("p");
      t1 = $createTextNode("hello");
      $getRoot().append(para.append(t1));
    });
    updateSelection(editor, t1!, 0);
    editor.getEditorState().read(() => {
      expect(
        $isArmedSelection($getSelection(), {
          key: para!.getKey(),
          kind: "para",
          intent: "deleteBackward",
        }),
      ).toBe(false);
    });
  });

  it("$isArmedSelection: selection kind matches the same live range", async () => {
    let t1: TextNode;
    let t2: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("text");
      t2 = $createTextNode("more");
      $getRoot().append($createParaNode("p").append(t1, $createImmutableVerseNode("1"), t2));
    });
    // Endpoints are text points on the flanking text nodes — never on the verse DecoratorNode.
    updateSelection(editor, t1!, 0, t2!, 2);

    editor.getEditorState().read(() => {
      const sel = $getSelection();
      if (!$isRangeSelection(sel)) throw new Error("expected a RangeSelection");
      const armed = {
        kind: "selection" as const,
        intent: "deleteBackward" as const,
        key: "anchor-verse",
        verseKeys: ["anchor-verse"],
        anchor: { key: sel.anchor.key, offset: sel.anchor.offset, type: sel.anchor.type },
        focus: { key: sel.focus.key, offset: sel.focus.offset, type: sel.focus.type },
      };
      expect($isArmedSelection(sel, armed)).toBe(true);
    });
  });

  it("$isArmedSelection: selection kind is false once the range moves", async () => {
    let t1: TextNode;
    const { editor } = await baseTestEnvironment(() => {
      t1 = $createTextNode("hello");
      $getRoot().append($createParaNode("p").append(t1));
    });
    updateSelection(editor, t1!, 0, t1!, 3);

    const armed = {
      kind: "selection" as const,
      intent: "deleteBackward" as const,
      key: "x",
      verseKeys: ["x"],
      anchor: { key: "different", offset: 0, type: "text" as const },
      focus: { key: "different", offset: 3, type: "text" as const },
    };
    editor.getEditorState().read(() => {
      expect($isArmedSelection($getSelection(), armed)).toBe(false);
    });
  });
});

describe("$mergeParaIntoPrevious", () => {
  it("moves children into the previous block, drops the merged para and its marker, preserves text", async () => {
    let p: ParaNode;
    let q: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      p = $createParaNode("p");
      q = $createParaNode("q");
      $getRoot().append(p.append($createTextNode("first")), q.append($createTextNode("second")));
    });

    await sutUpdate(editor, () => {
      $mergeParaIntoPrevious(q!);
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);
      const merged = root.getChildren()[0] as ParaNode;
      expect(merged.getKey()).toBe(p!.getKey());
      expect(merged.getMarker()).toBe("p"); // previous block's marker kept; "q" gone
      expect(merged.getTextContent()).toBe("firstsecond");
    });
  });

  it("merges an empty para by simply removing it", async () => {
    let p: ParaNode;
    let empty: ParaNode;
    const { editor } = await baseTestEnvironment(() => {
      p = $createParaNode("p");
      empty = $createParaNode("q");
      $getRoot().append(p.append($createTextNode("text")), empty);
    });

    await sutUpdate(editor, () => {
      $mergeParaIntoPrevious(empty!);
    });

    editor.getEditorState().read(() => {
      expect($getRoot().getChildrenSize()).toBe(1);
      expect(($getRoot().getChildren()[0] as ParaNode).getTextContent()).toBe("text");
    });
  });
});

describe("$sanitizeNodesForProtectedStructure", () => {
  it("flattens a paragraph to its text content", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const para = $createParaNode("p").append($createTextNode("hello"));
      const result = $sanitizeNodesForProtectedStructure([para]);
      expect(result).toHaveLength(1);
      expect($isTextNode(result[0])).toBe(true);
      expect(result[0].getTextContent()).toBe("hello");
      expect(result.some((n) => $isSomeParaNode(n))).toBe(false);
    });
  });

  it("removes a verse marker entirely", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const verse = $createImmutableVerseNode("1");
      const result = $sanitizeNodesForProtectedStructure([verse]);
      expect(result).toHaveLength(0);
    });
  });

  it("removes a chapter marker entirely", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const chapter = $createChapterNode("1");
      const result = $sanitizeNodesForProtectedStructure([chapter]);
      expect(result).toHaveLength(0);
    });
  });

  it("preserves an inline CharNode", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const para = $createParaNode("p").append(
        $createCharNode("wj").append($createTextNode("words")),
      );
      const result = $sanitizeNodesForProtectedStructure([para]);
      expect(result).toHaveLength(1);
      expect($isCharNode(result[0])).toBe(true);
      expect(result[0].getTextContent()).toBe("words");
    });
  });

  it("preserves a NoteNode", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const para = $createParaNode("p").append($createNoteNode("f"));
      const result = $sanitizeNodesForProtectedStructure([para]);
      expect(result).toHaveLength(1);
      expect($isNoteNode(result[0])).toBe(true);
    });
  });

  it("joins two paragraphs with a single space", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const result = $sanitizeNodesForProtectedStructure([
        $createParaNode("p").append($createTextNode("a")),
        $createParaNode("q").append($createTextNode("b")),
      ]);
      expect(result.map((n) => n.getTextContent())).toEqual(["a", " ", "b"]);
    });
  });

  it("strips a verse marker nested inside a paragraph but keeps the text", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const para = $createParaNode("p").append(
        $createImmutableVerseNode("2"),
        $createTextNode("after"),
      );
      const result = $sanitizeNodesForProtectedStructure([para]);
      expect(result).toHaveLength(1);
      expect(result[0].getTextContent()).toBe("after");
    });
  });

  it("returns an empty array when the entire payload is structural markers", async () => {
    const { editor } = await baseTestEnvironment();
    await sutUpdate(editor, () => {
      const result = $sanitizeNodesForProtectedStructure([$createImmutableVerseNode("1")]);
      expect(result).toHaveLength(0);
    });
  });
});
