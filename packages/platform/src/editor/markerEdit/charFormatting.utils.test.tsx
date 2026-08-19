import {
  $appendCharPara,
  requireDefined,
  testEnvironment,
  testEnvironmentWithDisplaySyncs,
  usjNoteFromUsfm,
  usjNoteOf,
} from "./markerEdit.test-helpers";
import { $removeCharFormattingFromSelection } from "./charFormatting.utils";
import { act } from "@testing-library/react";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setState,
  ElementNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  CharNode,
  getEditableCallerText,
  NBSP,
  NoteNode,
  ParaNode,
  textTypeState,
} from "shared";

/** The char span's plain content text node (its non-marker child). */
function $charContent(char: ReturnType<typeof $createCharNode>): TextNode {
  return requireDefined(
    char
      .getChildren()
      .filter($isTextNode)
      .find((n) => !$isMarkerNode(n)),
    "char span has no content text node",
  );
}

/** All plain (non-marker) TextNode descendants of `node`, in document order. */
function $collectPlainTextNodes(node: LexicalNode): TextNode[] {
  const result: TextNode[] = [];
  const visit = (current: LexicalNode) => {
    if ($isTextNode(current) && !$isMarkerNode(current)) result.push(current);
    if ($isElementNode(current)) current.getChildren().forEach(visit);
  };
  visit(node);
  return result;
}

describe("Ctrl+Space", () => {
  it("breaks out of a char style at the caret (split + plain space)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        // caret between "Lo" and "rd" (content text is NBSP + "Lord")
        $charContent(parts.char).select(3, 3);
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2);
      expect(chars[0].getTextContent()).toContain("Lo");
      expect(chars[1].getTextContent()).toContain("rd");
      // a plain space sits between the two spans
      const between = chars[0].getNextSibling();
      expect($isTextNode(between) && between.getTextContent()).toBe(" ");
    });
  });

  it("unwraps a fully selected char span", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        const content = $charContent(parts.char);
        content.select(0, content.getTextContentSize());
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      expect(parts.char.isAttached()).toBe(false);
      expect($getRoot().getTextContent()).toContain("Lord");
    });
  });

  it("reuses an existing next space instead of inserting a second one (PT9 parity)", async () => {
    let char: ReturnType<typeof $createCharNode>;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord of hosts`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        // caret right before the space between "Lord" and "of"
        $charContent(char).select(5, 5);
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      // PT9 still SPLITS the span at the caret even though a space sits right
      // there — it just reuses that space as the separator instead of
      // manufacturing a second one.
      const chars = para
        .getChildren()
        .filter($isCharNode)
        .filter((c) => c.getMarker() === "nd");
      expect(chars).toHaveLength(2);
      const [left, right] = chars;

      const between = left.getNextSibling();
      expect(between?.is(right.getPreviousSibling())).toBe(true);
      const separator = requireDefined(
        $isTextNode(between) && !$isMarkerNode(between) ? between : undefined,
        "separator between the split spans is not a plain text node",
      );
      // exactly one (reused) space, not two (one reused + one inserted)
      expect(separator.getTextContent()).toBe(" ");

      expect($charContent(left).getTextContent()).toContain("Lord");
      expect($charContent(right).getTextContent()).toContain("of hosts");

      // no plain text node anywhere in the paragraph doubled the space —
      // proves the existing space was reused, not supplemented
      const plainTextNodes = $collectPlainTextNodes(para);
      expect(plainTextNodes.some((n) => n.getTextContent().includes("  "))).toBe(false);

      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(separator)).toBe(true);
      expect(selection.anchor.offset).toBe(1);
    });
  });

  it("splits an interior selection into styled-plain-styled (PT9)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        // "or" out of "Lord": both boundaries land mid-text (content is NBSP + "Lord").
        $charContent(parts.char).select(2, 4);
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2);
      expect(chars.every((char) => char.getMarker() === "nd")).toBe(true);
      const [left, tail] = chars;
      expect(left.isEmpty()).toBe(false);
      expect(tail.isEmpty()).toBe(false);
      const middle = left.getNextSibling();
      expect(middle?.is(tail.getPreviousSibling())).toBe(true);
      // the previously-selected text is now plain, not wrapped in any CharNode
      expect($isTextNode(middle) && !$isMarkerNode(middle) && !$isCharNode(middle)).toBe(true);
      const middleText = middle && $isTextNode(middle) ? middle.getTextContent() : "";
      const leftText = $charContent(left).getTextContent().replace(NBSP, "");
      const tailText = $charContent(tail).getTextContent().replace(NBSP, "");
      // original content characters survive, in order, split across the three segments
      expect(leftText + middleText + tailText).toBe("Lord");
    });
  });

  it("carries a nested char span after the split point into the right half (document order)", async () => {
    // `\add foo` + nested `\nd bar\nd*` + ` baz`: splitting inside "foo" must move
    // EVERYTHING after the caret — the rest of the text, the nested span, and the tail — into
    // the right half in document order. Collecting only text nodes stranded the nested span in
    // the LEFT half while the text around it moved right, scrambling the reading order.
    let addChar: ReturnType<typeof $createCharNode>;
    let foo: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      addChar = $createCharNode("add");
      foo = $createTextNode(`${NBSP}foo`);
      const nd = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          addChar.append(
            $createMarkerNode("add"),
            foo,
            nd.append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}bar`),
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" baz"),
            $createMarkerNode("add", "closing"),
          ),
        ),
      );
    });
    // caret between "fo" and "o" (content text is NBSP + "foo")
    await act(async () => editor.update(() => foo.select(3, 3)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      const addChars = para
        .getChildren()
        .filter($isCharNode)
        .filter((c) => c.getMarker() === "add");
      expect(addChars).toHaveLength(2);
      const [left, right] = addChars;
      // Left keeps only the text before the caret; the nested `\nd` span moved out.
      expect(left.getTextContent()).toContain("fo");
      expect(left.getTextContent()).not.toContain("bar");
      // Right half holds, in document order: split-off text, the intact nested span, the tail.
      const rightContent = right.getChildren().filter((c) => !$isMarkerNode(c));
      expect(rightContent).toHaveLength(3);
      expect($isTextNode(rightContent[0]) && rightContent[0].getTextContent().includes("o")).toBe(
        true,
      );
      expect($isCharNode(rightContent[1]) && rightContent[1].getMarker() === "nd").toBe(true);
      expect(rightContent[1].getTextContent()).toContain("bar");
      expect($isTextNode(rightContent[2]) && rightContent[2].getTextContent()).toBe(" baz");
      // Full paragraph reading order is preserved: never "fo bar o baz".
      const readingOrder = $collectPlainTextNodes(para)
        .map((n) => n.getTextContent())
        .join("")
        .replaceAll(NBSP, " ")
        .replace(/\s+/g, " ")
        .trim();
      expect(readingOrder).toBe("fo o bar baz");
    });
  });

  it("splits at the end of a text node when a nested span still follows (mid-span)", async () => {
    // `\add foo` + nested `\nd bar\nd*` + ` baz`, caret exactly at the end of "foo": PT9's
    // flat USFM has no text-node boundaries — the caret is simply mid-span (content still
    // follows), so Ctrl+Space must close `\add` AT the caret, put the plain space there, and
    // re-open `\add` for the remainder (StyleApplicator closes all char styles before the
    // space and re-opens the ones still active after it). Treating end-of-text-node as
    // span end would drop the space after " baz" instead — past content the caret never
    // crossed.
    let addChar: ReturnType<typeof $createCharNode>;
    let foo: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      addChar = $createCharNode("add");
      foo = $createTextNode(`${NBSP}foo`);
      const nd = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          addChar.append(
            $createMarkerNode("add"),
            foo,
            nd.append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}bar`),
              $createMarkerNode("nd", "closing"),
            ),
            $createTextNode(" baz"),
            $createMarkerNode("add", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => foo.select(foo.getTextContentSize(), foo.getTextContentSize())),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      const addChars = para
        .getChildren()
        .filter($isCharNode)
        .filter((c) => c.getMarker() === "add");
      expect(addChars).toHaveLength(2);
      const [left, right] = addChars;
      expect(left.getTextContent()).toContain("foo");
      expect(left.getTextContent()).not.toContain("bar");
      // a single plain space separates the halves; the caret sits after it
      const between = left.getNextSibling();
      expect(between?.is(right.getPreviousSibling())).toBe(true);
      const separator = requireDefined(
        $isTextNode(between) && !$isMarkerNode(between) ? between : undefined,
        "separator between the split spans is not a plain text node",
      );
      expect(separator.getTextContent()).toBe(" ");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(separator)).toBe(true);
      expect(selection.anchor.offset).toBe(1);
      // Right half holds the intact nested span, then the tail. " baz" keeps its leading
      // space: PT9's reuse-next-space only applies to the char directly at the caret, and
      // the nested span sits between the caret and this space.
      const rightContent = right.getChildren().filter((c) => !$isMarkerNode(c));
      expect(rightContent).toHaveLength(2);
      expect($isCharNode(rightContent[0]) && rightContent[0].getMarker() === "nd").toBe(true);
      expect(rightContent[0].getTextContent()).toContain("bar");
      expect($isTextNode(rightContent[1]) && rightContent[1].getTextContent()).toBe(" baz");
      const readingOrder = $collectPlainTextNodes(para)
        .map((n) => n.getTextContent())
        .join("")
        .replaceAll(NBSP, " ")
        .replace(/\s+/g, " ")
        .trim();
      expect(readingOrder).toBe("foo bar baz");
    });
  });

  it("keeps a right half whose only content is a nested span", async () => {
    // `\add foo\nd bar\nd*\add*`, caret at the end of "foo": the right half of the split holds
    // ONLY the nested `\nd` span — no direct text child at all. An emptiness check that counts
    // just direct text children would judge the half empty and delete it, silently discarding
    // "bar" from the document.
    let addChar: ReturnType<typeof $createCharNode>;
    let foo: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      addChar = $createCharNode("add");
      foo = $createTextNode(`${NBSP}foo`);
      const nd = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          addChar.append(
            $createMarkerNode("add"),
            foo,
            nd.append(
              $createMarkerNode("nd"),
              $createTextNode(`${NBSP}bar`),
              $createMarkerNode("nd", "closing"),
            ),
            $createMarkerNode("add", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => foo.select(foo.getTextContentSize(), foo.getTextContentSize())),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      const addChars = para
        .getChildren()
        .filter($isCharNode)
        .filter((c) => c.getMarker() === "add");
      expect(addChars).toHaveLength(2);
      const [left, right] = addChars;
      expect(left.getTextContent()).toContain("foo");
      const between = left.getNextSibling();
      expect(between?.is(right.getPreviousSibling())).toBe(true);
      expect($isTextNode(between) && between.getTextContent()).toBe(" ");
      // "bar" survived, still wrapped in its nested span inside the right half
      const rightContent = right.getChildren().filter((c) => !$isMarkerNode(c));
      expect(rightContent).toHaveLength(1);
      expect($isCharNode(rightContent[0]) && rightContent[0].getMarker() === "nd").toBe(true);
      expect(rightContent[0].getTextContent()).toContain("bar");
      const readingOrder = $collectPlainTextNodes(para)
        .map((n) => n.getTextContent())
        .join("")
        .replaceAll(NBSP, " ")
        .replace(/\s+/g, " ")
        .trim();
      expect(readingOrder).toBe("foo bar");
    });
  });

  it("inserts the plain space after the span when the caret is at the true span end", async () => {
    // Caret at the very end of the span's LAST content — only the closer glyph follows. The
    // span is already effectively closed at the caret, so no split: the plain space goes
    // after the whole span (a split's right half would be empty and dropped anyway).
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        const content = $charContent(parts.char);
        content.select(content.getTextContentSize(), content.getTextContentSize());
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(1);
      expect($charContent(chars[0]).getTextContent()).toBe(`${NBSP}Lord`);
      const after = chars[0].getNextSibling();
      expect($isTextNode(after) && after.getTextContent()).toBe(" ");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(after && selection.anchor.getNode().is(after)).toBe(true);
      expect(selection.anchor.offset).toBe(1);
    });
  });

  it("keeps unknown attributes on only one half when a span is split", async () => {
    let char: ReturnType<typeof $createCharNode>;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("w", { lemma: "grace" });
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("w"),
            $createTextNode(`${NBSP}abcd`),
            $createMarkerNode("w", "closing"),
          ),
        ),
      );
    });
    // caret mid-content ("ab" | "cd"): the split makes two "w" spans
    await act(async () => editor.update(() => $charContent(char).select(3, 3)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const wChars = para
        .getChildren()
        .filter($isCharNode)
        .filter((c) => c.getMarker() === "w");
      expect(wChars).toHaveLength(2);
      // Attributes are not duplicated: exactly one half carries them.
      expect(wChars.filter((c) => c.getUnknownAttributes() !== undefined)).toHaveLength(1);
    });
  });

  it("unwraps BOTH spans of a selection fully covering two sibling char spans", async () => {
    // `\add foo\add* mid \nd bar\nd*` selected from the start of "foo" to the end of "bar":
    // every span the selection touches must unwrap (the multi-span loop) — a loop that stopped
    // after the first span would leave "bar" styled, and one that unwrapped only the
    // anchor's span would do the same.
    let fooText: TextNode;
    let barText: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const addChar = $createCharNode("add");
      fooText = $createTextNode(`${NBSP}foo`);
      const ndChar = $createCharNode("nd");
      barText = $createTextNode(`${NBSP}bar`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          addChar.append($createMarkerNode("add"), fooText, $createMarkerNode("add", "closing")),
          $createTextNode(" mid "),
          ndChar.append($createMarkerNode("nd"), barText, $createMarkerNode("nd", "closing")),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        fooText.select(0, 0);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        selection.focus.set(barText.getKey(), barText.getTextContentSize(), "text");
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      // No char span survives anywhere in the paragraph...
      expect(para.getChildren().filter($isCharNode)).toHaveLength(0);
      // ...and the spans' glyphs went with them — only the paragraph's own prefix remains.
      const glyphs = para
        .getChildren()
        .filter($isMarkerNode)
        .map((g) => g.getTextContent());
      expect(glyphs).toEqual(["\\p"]);
      // Reading order preserved as plain text.
      const readingOrder = $collectPlainTextNodes(para)
        .map((n) => n.getTextContent())
        .join("")
        .replaceAll(NBSP, " ")
        .replace(/\s+/g, " ")
        .trim();
      expect(readingOrder).toBe("foo mid bar");
    });
  });

  it("splits both boundary spans of a selection running from mid-span to mid-span", async () => {
    // `\add foo\add* mid \nd bar\nd*` with the selection from "fo|o" to "ba|r": the loop
    // handles each span by its own boundary shape — the START span keeps its left part styled
    // and unwraps the rest, the END span unwraps its head and keeps the tail styled. The
    // unknown attributes on `\add` must survive on exactly ONE half (the styled left one):
    // duplicating them into the split-off half would also dump literal `|lemma="…"` bytes
    // into the paragraph when that half unwraps.
    let fooText: TextNode;
    let barText: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const addChar = $createCharNode("add", { lemma: "grace" });
      fooText = $createTextNode(`${NBSP}foo`);
      const ndChar = $createCharNode("nd");
      barText = $createTextNode(`${NBSP}bar`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          addChar.append($createMarkerNode("add"), fooText, $createMarkerNode("add", "closing")),
          $createTextNode(" mid "),
          ndChar.append($createMarkerNode("nd"), barText, $createMarkerNode("nd", "closing")),
        ),
      );
    });
    // Anchor between "fo" and "o" (content is NBSP + "foo"), focus between "ba" and "r".
    await act(async () =>
      editor.update(() => {
        fooText.select(3, 3);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        selection.focus.set(barText.getKey(), 3, "text");
      }),
    );
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      const chars = para.getChildren().filter($isCharNode);
      // Exactly two styled remnants: the add head and the nd tail.
      expect(chars.map((c) => c.getMarker())).toEqual(["add", "nd"]);
      const [addLeft, ndTail] = chars;
      expect(addLeft.getTextContent()).toContain("fo");
      expect(addLeft.getTextContent()).not.toContain("o mid");
      expect(ndTail.getTextContent()).toContain("r");
      expect(ndTail.getTextContent()).not.toContain("ba");
      // Attributes are not duplicated: only the styled add head carries them, and no literal
      // `|lemma` bytes leaked into the paragraph from an attribute-bearing unwrapped half.
      expect(chars.filter((c) => c.getUnknownAttributes() !== undefined)).toEqual([addLeft]);
      expect(para.getTextContent()).not.toContain("|lemma");
      // Reading order preserved across styled and unwrapped segments: the concatenated content
      // (structural NBSP separators stripped) is character-for-character the original — the
      // range flow inserts no separator spaces, it only moves the style boundaries.
      const readingOrder = $collectPlainTextNodes(para)
        .map((n) => n.getTextContent())
        .join("")
        .replaceAll(NBSP, "");
      expect(readingOrder).toBe("foo mid bar");
    });
  });

  it("inserts a plain space when the caret is in plain text (PT9 parity)", async () => {
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("ab");
      const markerTrailingSpace = $createTextNode(NBSP);
      $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
      $getRoot().append(para.append($createMarkerNode("p"), markerTrailingSpace, text));
    });
    await act(async () => editor.update(() => text.select(1, 1)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => expect(text.getTextContent()).toBe("a b"));
  });

  it("claims a range with no character styles and inserts nothing", async () => {
    // PT9 inserts no space at all on a range — the key clears formatting, and there is none here.
    // Reporting "not handled" is what let the keystroke fall through to the browser, which types a
    // literal space OVER the selection: a Ctrl+Space that silently deletes the selected words.
    // Asserted on the return value rather than the dispatch, because that is what decides whether
    // `MarkerEditPlugin` calls `preventDefault` on the DOM event.
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("abcdef");
      const markerTrailingSpace = $createTextNode(NBSP);
      $setState(markerTrailingSpace, textTypeState, "marker-trailing-space");
      $getRoot().append(para.append($createMarkerNode("p"), markerTrailingSpace, text));
    });
    let handled: boolean | undefined;
    await act(async () =>
      editor.update(() => {
        text.select(0, 3);
        handled = $removeCharFormattingFromSelection();
      }),
    );
    expect(handled).toBe(true);
    editor.getEditorState().read(() => expect($getRoot().getTextContent()).toContain("abcdef"));
  });

  it("leaves no empty marker pair when the range covers a span's whole word", async () => {
    // A double-click selects the WORD, not the span's structural separator, so the range starts at
    // offset 1 and the span splits rather than being unwrapped whole. The left half is then a
    // marker pair around nothing — fabricated bytes in the file, not a cleared style.
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const nd = $createCharNode("nd");
      content = $createTextNode(`${NBSP}holy`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          nd.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
        ),
      );
    });
    await act(async () => editor.update(() => content.select(1, 5)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });

    editor.getEditorState().read(() => {
      const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
      expect(para.getChildren().filter($isCharNode)).toHaveLength(0);
      expect(
        para
          .getAllTextNodes()
          .map((textNode) => textNode.getTextContent())
          .join("")
          .replaceAll(NBSP, " "),
      ).toBe("\\p holy");
    });
  });
});

describe("Ctrl+Space through a nested character-style stack", () => {
  /**
   * `\p \wj \+nd thing\+nd*\wj*` — a two-deep stack whose outer span's only content is the
   * nested one, so the outer opener's separator is the standalone NBSP spacer
   * `$syncOpenerSeparators` maintains for element-first content.
   */
  function $appendNestedStackPara(): { wj: CharNode; nd: CharNode; content: TextNode } {
    const para = $createParaNode("p");
    const wj = $createCharNode("wj");
    const nd = $createCharNode("nd");
    const content = $createTextNode(`${NBSP}thing`);
    $getRoot().append(
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        wj.append(
          $createMarkerNode("wj"),
          $createTextNode(NBSP),
          nd.append(
            $createMarkerNode("nd", "opening", true),
            content,
            $createMarkerNode("nd", "closing", true),
          ),
          $createMarkerNode("wj", "closing"),
        ),
      ),
    );
    return { wj, nd, content };
  }

  /**
   * The USFM bytes `node`'s subtree stands for: every text node in document order (glyph nodes
   * included — a `MarkerNode` is a `TextNode` whose text is its own glyph) with the structural
   * NBSP separators rendered as the plain spaces they serialize to.
   */
  function $usfmBytes(node: ElementNode): string {
    return node
      .getAllTextNodes()
      .map((textNode) => textNode.getTextContent())
      .join("")
      .replaceAll(NBSP, " ");
  }

  function $onlyPara(): ParaNode {
    return requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para missing");
  }

  async function pressCtrlSpace(editor: LexicalEditor) {
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
  }

  it("closes innermost-out, emits an unstyled space, and reopens outermost-in", async () => {
    let parts: ReturnType<typeof $appendNestedStackPara>;
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (parts = $appendNestedStackPara()),
    );
    // caret between "thi" and "ng" (content text is NBSP + "thing")
    await act(async () => editor.update(() => parts.content.select(4, 4)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      const para = $onlyPara();
      // Closers innermost-then-outermost before the space; openers outermost-then-innermost
      // after it, with the `+` on the nested one only.
      expect($usfmBytes(para)).toBe("\\p \\wj \\+nd thi\\+nd*\\wj* \\wj \\+nd ng\\+nd*\\wj*");
      // The space belongs to no span: its parent is the paragraph.
      const space = requireDefined(
        para.getChildren().find((child) => $isTextNode(child) && child.getTextContent() === " "),
        "unstyled space missing from the paragraph",
      );
      expect($isParaNode(space.getParent())).toBe(true);
    });
  });

  it("lands the caret immediately after the space", async () => {
    let parts: ReturnType<typeof $appendNestedStackPara>;
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (parts = $appendNestedStackPara()),
    );
    await act(async () => editor.update(() => parts.content.select(4, 4)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isTextNode(anchorNode) && anchorNode.getTextContent()).toBe(" ");
      expect(selection.anchor.offset).toBe(1);
      expect($isParaNode(anchorNode.getParent())).toBe(true);
    });
  });

  it("closes the stack without reopening it when nothing follows the caret", async () => {
    let parts: ReturnType<typeof $appendNestedStackPara>;
    // Full harness, like its siblings: `TextSpacingPlugin`'s trailing-space transform no longer
    // deletes a paragraph-final lone space, so it can no longer swallow the emitted byte before
    // this test sees it.
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (parts = $appendNestedStackPara()),
    );
    // caret at the very end of the innermost span's content, which is also the outer span's end
    await act(async () => editor.update(() => parts.content.select(6, 6)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      expect($usfmBytes($onlyPara())).toBe("\\p \\wj \\+nd thing\\+nd*\\wj* ");
      // The emitted space survived the commit as a real one-space text node at the paragraph's
      // end — the byte the trailing-space transform used to empty. Read as a node rather than
      // through the joined bytes above, which cannot tell an emptied node from a missing one.
      const last = $onlyPara().getLastChild();
      expect($isTextNode(last) && last.getTextContent()).toBe(" ");
    });
  });

  it("does not reopen the stack when the caret ends the run but text follows the span", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const wj = $createCharNode("wj");
      const nd = $createCharNode("nd");
      content = $createTextNode(`${NBSP}thing`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(NBSP),
            nd.append(
              $createMarkerNode("nd", "opening", true),
              content,
              $createMarkerNode("nd", "closing", true),
            ),
            $createMarkerNode("wj", "closing"),
          ),
          $createTextNode("tail"),
        ),
      );
    });
    await act(async () => editor.update(() => content.select(6, 6)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      expect($usfmBytes($onlyPara())).toBe("\\p \\wj \\+nd thing\\+nd*\\wj* tail");
      // One span, not two: nothing inside the stack followed the caret, so nothing reopened.
      expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(1);
    });
  });

  it("drops the opened span rather than reopening an empty one at a run's start", async () => {
    let parts: ReturnType<typeof $appendNestedStackPara>;
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (parts = $appendNestedStackPara()),
    );
    // caret at the innermost run's content start — just past its structural NBSP separator
    await act(async () => editor.update(() => parts.content.select(1, 1)));
    await pressCtrlSpace(editor);

    editor
      .getEditorState()
      .read(() => expect($usfmBytes($onlyPara())).toBe("\\p  \\wj \\+nd thing\\+nd*\\wj*"));
  });

  it("clears EVERY level of the stack over a range", async () => {
    // Ctrl+Space over a selection is an unformatter, so a range covering all of a stack's content
    // leaves the text bare — both spans are nothing without it.
    let parts: ReturnType<typeof $appendNestedStackPara>;
    const { editor } = await testEnvironmentWithDisplaySyncs(
      () => (parts = $appendNestedStackPara()),
    );
    // the word, not the span's structural separator — the range starts at offset 1
    await act(async () => editor.update(() => parts.content.select(1, 6)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      expect($usfmBytes($onlyPara())).toBe("\\p thing");
      expect($onlyPara().getChildren().filter($isCharNode)).toHaveLength(0);
    });
  });

  it("keeps a partially covered outer style around the unformatted run", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const wj = $createCharNode("wj");
      const nd = $createCharNode("nd");
      content = $createTextNode(`${NBSP}holy`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(`${NBSP}A `),
            nd.append(
              $createMarkerNode("nd", "opening", true),
              content,
              $createMarkerNode("nd", "closing", true),
            ),
            $createTextNode(" B"),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });
    await act(async () => editor.update(() => content.select(1, 5))); // "holy"
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      // `\wj` extends past the selection on both sides, so it closes before the unformatted run
      // and reopens after it; `\nd`, which the run covered entirely, is gone.
      expect($usfmBytes($onlyPara())).toBe("\\p \\wj A \\wj*holy\\wj  B\\wj*");
    });
  });

  it("clears each level over exactly the selected extent when the boundary is an outer CHILD INDEX", async () => {
    // `\p \wj one \+nd two\+nd* three\wj*`, select "two three": the selection START sits at the
    // inner span's content start — at the OUTER level that boundary is a child index (the nested
    // span's position), not a text offset in the outer span's own text. The inner level is
    // covered whole (cleared), the outer level is covered from that child boundary to its content
    // end ("two three" cleared), and the outer text BEFORE the boundary keeps its style.
    let innerContent!: TextNode;
    let tail!: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const wj = $createCharNode("wj");
      const nd = $createCharNode("nd");
      innerContent = $createTextNode(`${NBSP}two`);
      tail = $createTextNode(" three");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(`${NBSP}one `),
            nd.append(
              $createMarkerNode("nd", "opening", true),
              innerContent,
              $createMarkerNode("nd", "closing", true),
            ),
            tail,
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        // "two three" — from the inner span's content start (past its structural separator) to
        // the end of the outer span's trailing text.
        const selection = $createRangeSelection();
        selection.anchor.set(innerContent.getKey(), 1, "text");
        selection.focus.set(tail.getKey(), tail.getTextContentSize(), "text");
        $setSelection(selection);
      }),
    );
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      // `\wj` keeps its unselected head "one "; both levels are cleared over "two three".
      expect($usfmBytes($onlyPara())).toBe("\\p \\wj one \\wj*two three");
      const spans = $onlyPara().getChildren().filter($isCharNode);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.getMarker()).toBe("wj");
    });
  });

  it("keeps the outer tail styled when the selection ENDS at the inner span's content end", async () => {
    // The mirror image: `\p \wj one \+nd two\+nd* three\wj*`, select "one two". The selection END
    // sits at the inner span's content end — a child-index boundary at the outer level. Both
    // levels clear over "one two"; the outer text AFTER the boundary reopens with its style, the
    // reopened glyph carrying its structural separator ahead of the text's own space.
    let outerHead!: TextNode;
    let innerContent!: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const wj = $createCharNode("wj");
      const nd = $createCharNode("nd");
      outerHead = $createTextNode(`${NBSP}one `);
      innerContent = $createTextNode(`${NBSP}two`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          wj.append(
            $createMarkerNode("wj"),
            outerHead,
            nd.append(
              $createMarkerNode("nd", "opening", true),
              innerContent,
              $createMarkerNode("nd", "closing", true),
            ),
            $createTextNode(" three"),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        // "one two" — from the outer text's content start to the inner span's content end.
        const selection = $createRangeSelection();
        selection.anchor.set(outerHead.getKey(), 1, "text");
        selection.focus.set(innerContent.getKey(), innerContent.getTextContentSize(), "text");
        $setSelection(selection);
      }),
    );
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      expect($usfmBytes($onlyPara())).toBe("\\p one two\\wj  three\\wj*");
      const spans = $onlyPara().getChildren().filter($isCharNode);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.getMarker()).toBe("wj");
    });
  });

  describe("attribute bytes survive as plain text when the span goes", () => {
    /** `\p \w holy<runText>\w*` with `attributes` as the span's state and `runText` as its run. */
    async function unformatWord(attributes: { [name: string]: string }, runText: string) {
      // The engine alone: the attribute-run sync re-dirties a freshly built attributed span and
      // parks the caret at the paragraph start, which would clobber the selection under test.
      let content: TextNode;
      const { editor } = await testEnvironment(() => {
        const para = $createParaNode("p");
        const w = $createCharNode("w", attributes);
        content = $createTextNode(`${NBSP}holy`);
        const displayRun = $createTextNode(runText);
        $setState(displayRun, textTypeState, "attribute");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            w.append(
              $createMarkerNode("w"),
              content,
              displayRun,
              $createMarkerNode("w", "closing"),
            ),
          ),
        );
      });
      await act(async () =>
        editor.update(() => {
          content.select(1, 5);
          $removeCharFormattingFromSelection();
        }),
      );
      let bytes = "";
      editor.getEditorState().read(() => (bytes = $usfmBytes($onlyPara())));
      return bytes;
    }

    it("collapses a lone default attribute to its bare value", async () => {
      expect(await unformatWord({ lemma: "grace" }, "|grace")).toBe("\\p holy|grace");
    });

    it("keeps the name for a non-default attribute", async () => {
      expect(await unformatWord({ gloss: "stuff" }, '|gloss="stuff"')).toBe(
        '\\p holy|gloss="stuff"',
      );
    });

    it("keeps every name when there is more than one attribute", async () => {
      expect(
        await unformatWord({ lemma: "things", gloss: "stuff" }, '|lemma="things" gloss="stuff"'),
      ).toBe('\\p holy|lemma="things" gloss="stuff"');
    });
  });

  it("reuses the space one character ahead instead of inserting a second one", async () => {
    let content: TextNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const wj = $createCharNode("wj");
      const nd = $createCharNode("nd");
      content = $createTextNode(`${NBSP}Lord of hosts`);
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          wj.append(
            $createMarkerNode("wj"),
            $createTextNode(NBSP),
            nd.append(
              $createMarkerNode("nd", "opening", true),
              content,
              $createMarkerNode("nd", "closing", true),
            ),
            $createMarkerNode("wj", "closing"),
          ),
        ),
      );
    });
    // caret right before the space between "Lord" and "of"
    await act(async () => editor.update(() => content.select(5, 5)));
    await pressCtrlSpace(editor);

    editor
      .getEditorState()
      .read(() =>
        expect($usfmBytes($onlyPara())).toBe(
          "\\p \\wj \\+nd Lord\\+nd*\\wj* \\wj \\+nd of hosts\\+nd*\\wj*",
        ),
      );
  });

  it("emits a real \\ft* so the unstyled space is not the \\ft's trailing content", async () => {
    // `\ft` runs until the next note marker or `\f*`, so a space merely placed after its content
    // re-reads as more of that content and the gesture is a no-op in the file. A footnote content
    // marker IS a character format, so Ctrl+Space strips it the same way it strips `\nd`: the
    // span is given a real closing marker, the space follows it unstyled, and a fresh `\ft`
    // reopens after — matching Paratext 9.
    //
    // Inserting a note-content MARKER (`\fq`, `\fp`) still emits no closer: the marker itself is
    // what terminates the span, so no unformatted character is needed and none is invented. Those
    // two gestures share this close-and-reopen primitive and are pinned apart, in
    // markerMenuApply.utils.test.tsx and noteEnterFp.test.tsx.
    let content: TextNode;
    let noteRef: NoteNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+", false);
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      content = $createTextNode(`${NBSP}AB`);
      note.append(
        $createMarkerNode("f"),
        $createTextNode(getEditableCallerText("+")),
        ft.append($createMarkerNode("ft"), content),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("text "), note),
      );
      noteRef = note;
    });
    // caret between "A" and "B"
    await act(async () => editor.update(() => content.select(2, 2)));
    await pressCtrlSpace(editor);

    editor
      .getEditorState()
      .read(() => expect($usfmBytes(noteRef)).toBe("\\f + \\ft A\\ft* \\ft B\\f*"));
    // What the FILE gets, checked against the tokenizer's own reading of those bytes: the left
    // `\ft` is explicitly closed (no `closed="false"`) and the space is a note-level string.
    expect(usjNoteOf(editor)).toEqual(usjNoteFromUsfm("\\p \\f + \\ft A\\ft* \\ft B\\f*"));
  });

  it("emits a real \\ft* at the \\ft's content END, where there is nothing to reopen", async () => {
    // The branch with no continuation. Nothing follows the caret, so no `\ft` reopens — but the
    // closing marker is needed all the same: the space sits between the span's content and the
    // `\f*` that would otherwise end it, which is `\ft` content.
    let content: TextNode;
    let noteRef: NoteNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+", false);
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      content = $createTextNode(`${NBSP}A note`);
      note.append(
        $createMarkerNode("f"),
        $createTextNode(getEditableCallerText("+")),
        ft.append($createMarkerNode("ft"), content),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("text "), note),
      );
      noteRef = note;
    });
    await act(async () =>
      editor.update(() =>
        content.select(content.getTextContentSize(), content.getTextContentSize()),
      ),
    );
    await pressCtrlSpace(editor);

    editor
      .getEditorState()
      .read(() => expect($usfmBytes(noteRef)).toBe("\\f + \\ft A note\\ft* \\f*"));
    expect(usjNoteOf(editor)).toEqual(usjNoteFromUsfm("\\p \\f + \\ft A note\\ft* \\f*"));
  });

  it("emits a real \\ft* around a RANGE too, so the stripped run is not \\ft content", async () => {
    // Same reasoning as the collapsed caret, one gesture further: text merely moved out of the
    // span still sits between its content and whatever ends it, so without a closing marker the
    // file reads it back as `\ft` content and the unformat never happened.
    let content: TextNode;
    let noteRef: NoteNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+", false);
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      // The tail starts with a non-space on purpose. A continuation span whose content begins
      // with a space loses one on the way through the writer's own structural space — a
      // whitespace-ownership question of its own, and not the one under test here.
      content = $createTextNode(`${NBSP}A holy, B`);
      note.append(
        $createMarkerNode("f"),
        $createTextNode(getEditableCallerText("+")),
        ft.append($createMarkerNode("ft"), content),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("text "), note),
      );
      noteRef = note;
    });
    // select "holy" (content text is NBSP + "A holy, B")
    await act(async () => editor.update(() => content.select(3, 7)));
    await pressCtrlSpace(editor);

    editor
      .getEditorState()
      .read(() => expect($usfmBytes(noteRef)).toBe("\\f + \\ft A \\ft*holy\\ft , B\\f*"));
    expect(usjNoteOf(editor)).toEqual(usjNoteFromUsfm("\\p \\f + \\ft A \\ft*holy\\ft , B\\f*"));
  });

  it("closes and reopens note-content spans but not the enclosing note", async () => {
    let content: TextNode;
    let noteRef: NoteNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      const para = $createParaNode("p");
      const note = $createNoteNode("f", "+", false);
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      const nd = $createCharNode("nd");
      content = $createTextNode(`${NBSP}holy`);
      note.append(
        $createMarkerNode("f"),
        $createTextNode(getEditableCallerText("+")),
        ft.append(
          $createMarkerNode("ft"),
          $createTextNode(`${NBSP}A `),
          nd.append(
            $createMarkerNode("nd", "opening", true),
            content,
            $createMarkerNode("nd", "closing", true),
          ),
          $createTextNode(" B"),
        ),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append(
        para.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("text "), note),
      );
      noteRef = note;
    });
    // caret between "ho" and "ly" inside the nested \nd
    await act(async () => editor.update(() => content.select(3, 3)));
    await pressCtrlSpace(editor);

    editor.getEditorState().read(() => {
      // \nd and \ft both close and reopen; the space is a NOTE child, so \f is untouched. The
      // implicitly-closed \ft is given a REAL \ft* on the way out — without one the space is its
      // trailing content and the strip never reaches the file.
      expect($usfmBytes(noteRef)).toBe(
        "\\f + \\ft A \\+nd ho\\+nd*\\ft* \\ft \\+nd ly\\+nd* B\\f*",
      );
      const space = requireDefined(
        noteRef.getChildren().find((child) => $isTextNode(child) && child.getTextContent() === " "),
        "unstyled space missing from the note",
      );
      expect($isNoteNode(space.getParent())).toBe(true);
    });
    expect(usjNoteOf(editor)).toEqual(
      usjNoteFromUsfm("\\p \\f + \\ft A \\+nd ho\\+nd*\\ft* \\ft \\+nd ly\\+nd* B\\f*"),
    );
  });
});
