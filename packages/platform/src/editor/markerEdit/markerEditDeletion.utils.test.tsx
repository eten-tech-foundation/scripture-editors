import { $appendCharPara, $appendVersePara, testEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, INSERT_PARAGRAPH_COMMAND, LexicalNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  MarkerNode,
  NBSP,
  NoteNode,
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

describe("deletion semantics", () => {
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

describe("collapsed-note atomic deletion", () => {
  /** A `\p` para with `before`, a collapsed `\f` note (opener glyph, caller-placeholder text,
   * `\fr`/`\ft` content, closer glyph), and ` after` — the editable-mode shape `createNote`
   * builds. Returns the note. */
  function $appendParaWithCollapsedNote(): NoteNode {
    const note = $createNoteNode("f", "+", true);
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}before`),
        note.append(
          $createMarkerNode("f"),
          $createTextNode(`${NBSP}8.4 `),
          $createCharNode("fr").append($createMarkerNode("fr"), $createTextNode(`${NBSP}8.4`)),
          $createMarkerNode("f", "closing"),
        ),
        $createTextNode(" after"),
      ),
    );
    return note;
  }

  function paraText(editor: { getEditorState: () => { read: <T>(fn: () => T) => T } }): string {
    return editor.getEditorState().read(() => $getRoot().getTextContent());
  }

  function $onlyNoteCount(): number {
    let count = 0;
    const walk = (node: LexicalNode): void => {
      if ($isNoteNode(node)) count += 1;
      const el: unknown = node;
      if (el && typeof (el as { getChildren?: unknown }).getChildren === "function")
        (el as { getChildren: () => LexicalNode[] }).getChildren().forEach(walk);
    };
    $getRoot().getChildren().forEach(walk);
    return count;
  }

  it("removes the whole note when its closing glyph is deleted (Backspace after the note)", async () => {
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        const closer = note
          .getChildren()
          .filter($isMarkerNode)
          .find((m) => m.getMarkerSyntax() === "closing");
        closer?.remove(); // what Backspace right after the collapsed note deletes
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
    // The corruption this pins: the damaged note must NOT spill its internals into the
    // paragraph as literal glyph text (live-verified pre-fix: `\fr 8.4 \ft \f*` in the verse).
    const text = paraText(editor);
    expect(text).not.toContain("\\fr");
    expect(text).not.toContain("\\f");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  it("removes the whole note when its opening glyph is deleted (forward Delete before the note)", async () => {
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        const opener = note
          .getChildren()
          .filter($isMarkerNode)
          .find((m) => m.getMarkerSyntax() === "opening");
        opener?.remove();
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(0));
    const text = paraText(editor);
    expect(text).not.toContain("\\fr");
    expect(text).toContain("before");
    expect(text).toContain("after");
  });

  it("leaves an intact collapsed note alone", async () => {
    const { editor } = await testEnvironment(() => {
      $appendParaWithCollapsedNote();
    });

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
  });

  it("leaves a glyph-less collapsed note alone (non-editable creation shapes)", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createNoteNode("f", "+", true).append($createTextNode(`${NBSP}content only`)),
        ),
      );
    });

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
  });

  it("keeps an intact note when a stray TextNode lands as its first child (typing at note start)", async () => {
    // Typing at the very start of a collapsed note anchors the typed char as the note's first
    // child, before the `\f` opener — the transient NoteNodePlugin's `$noteNodeTransform`
    // salvages by moving the text out. The opener glyph still exists (now second), so the note is
    // intact and must survive: a first/last-position glyph check would read this as "opener
    // deleted" and destroy the whole footnote before the salvage runs (transform ordering race).
    let note: NoteNode;
    const { editor } = await testEnvironment(() => {
      note = $appendParaWithCollapsedNote();
    });

    await act(async () =>
      editor.update(() => {
        note.splice(0, 0, [$createTextNode("x")]); // typed char lands before the `\f` opener
      }),
    );

    editor.getEditorState().read(() => expect($onlyNoteCount()).toBe(1));
    // The paragraph is intact around the surviving note (its own glyph text stays inside it —
    // that is the note rendering, not a spill). The typed char was not lost either.
    const text = paraText(editor);
    expect(text).toContain("before");
    expect(text).toContain("after");
    expect(text).toContain("x");
  });
});
