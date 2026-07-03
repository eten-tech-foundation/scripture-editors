import { $appendCharPara, $appendVersePara, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, INSERT_PARAGRAPH_COMMAND } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  MarkerNode,
  NBSP,
  PARA_MARKER_DEFAULT,
  ParaNode,
  VerseNode,
} from "shared";

// jsdom implements `getBoundingClientRect` on Element but not on Range. The Enter-split test
// below seeds an initial selection, which gives the editor root DOM focus as soon as it mounts;
// once focused, Lexical's post-commit scroll-into-view step reads a native `Range`'s bounding
// rect to decide whether to scroll, and jsdom's missing method throws. Stub it the same way
// jsdom already stubs Element's version (a zero rect nothing here asserts on).
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
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
  };
}

describe("§5.5 deletion semantics", () => {
  it("merges a para into the previous para when its marker is deleted", async () => {
    let first: ParaNode, second: ParaNode, secondMarker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      first = $createParaNode("p");
      second = $createParaNode("q1");
      secondMarker = $createMarkerNode("q1");
      $getRoot().append(
        first.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("one")),
        second.append(secondMarker, $createTextNode(NBSP), $createTextNode("two")),
      );
    });
    await act(async () => editor.update(() => secondMarker.remove()));
    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      expect(first.getTextContent()).toContain("one");
      expect(first.getTextContent()).toContain("two");
    });
  });

  it("resets to \\p with a visible prefix when there is no previous para", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("q1");
      marker = $createMarkerNode("q1");
      $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("text")));
    });
    await act(async () => editor.update(() => marker.remove()));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe(PARA_MARKER_DEFAULT);
      expect($isMarkerNode(para.getFirstChild())).toBe(true);
    });
  });

  it("injects a marker prefix into the Enter-split paragraph (cloned marker)", async () => {
    let para: ParaNode;
    const { editor } = await testEnvironment(() => {
      para = $createParaNode("q1");
      const text = $createTextNode("one two");
      $getRoot().append(para.append($createMarkerNode("q1"), $createTextNode(NBSP), text));
      text.select(3, 3);
    });
    await act(async () => {
      editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
    });
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      expect(paras[1].getMarker()).toBe("q1"); // cloned by insertNewAfter
      expect($isMarkerNode(paras[1].getFirstChild())).toBe(true); // engine injected the prefix
    });
  });

  it("unwraps a char span when its opener is deleted", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.remove()));
    editor.getEditorState().read(() => {
      expect(parts.char.isAttached()).toBe(false);
      // content survived as plain text without the NBSP prefix or closer glyph
      expect($getRoot().getTextContent()).toContain("Lord");
      expect($getRoot().getTextContent()).not.toContain("\\nd*");
    });
  });

  it("preserves an unwrapped span's unknown attributes as literal text", async () => {
    let char: ReturnType<typeof $createCharNode>, opener: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      char = $createCharNode("w", { lemma: "grace" });
      opener = $createMarkerNode("w");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(opener, $createTextNode(`${NBSP}grace`), $createMarkerNode("w", "closing")),
        ),
      );
    });
    await act(async () => editor.update(() => opener.remove()));
    editor.getEditorState().read(() => {
      expect(char.isAttached()).toBe(false); // span unwrapped
      // PT9 leaves the attributes as literal bytes: `|lemma="grace"` survives.
      expect($getRoot().getTextContent()).toContain('|lemma="grace"');
      expect($getRoot().getTextContent()).toContain("grace");
    });
  });

  it("routes closer deletion to Tier 2 (span extends per tokenizer rules)", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}Lord`),
            $createMarkerNode("nd", "closing"),
          ),
          $createTextNode(" of hosts"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => {
        const closer = $getRoot()
          .getAllTextNodes()
          .find((n) => $isMarkerNode(n) && n.getMarkerSyntax() === "closing");
        closer?.remove();
      }),
    );
    editor.getEditorState().read(() => {
      // tokenizer auto-closes at para end: "of hosts" is now inside the span
      const char = $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode);
      expect(char?.getTextContent()).toContain("of hosts");
    });
  });

  it("deletes a verse when its whole token is deleted", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent("")));
    editor.getEditorState().read(() => expect(verse.isAttached()).toBe(false));
  });
});
