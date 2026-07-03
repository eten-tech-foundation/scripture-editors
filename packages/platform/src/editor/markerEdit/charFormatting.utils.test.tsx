import { $appendCharPara, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_DOWN_COMMAND,
  LexicalNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  NBSP,
  textTypeState,
} from "shared";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

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

describe("Ctrl+Space (§5.5)", () => {
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
});
