import { CharNodePlugin } from "./CharNodePlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import { $getRoot, $createTextNode, $isTextNode, $setState } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  charIdState,
  CharNode,
  NBSP,
} from "shared";

describe("CharNodePlugin", () => {
  it("should load an initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append($createCharNode("add").append($createTextNode("add text "))),
      );
    });

    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getTextContent()).toBe("add text ");
      expect(root.getChildrenSize()).toBe(1);

      const p = root.getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text1 ")),
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with different markers", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text ")),
          $createCharNode("nd").append($createTextNode("nd text ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and attributes", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add", { customAttr: "value" }).append($createTextNode("add text1 ")),
          $createCharNode("add", { customAttr: "value" }).append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but different attributes", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add", { customAttr: "value1" }).append($createTextNode("add text1 ")),
          $createCharNode("add", { customAttr: "value2" }).append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker and empty cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but different cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id1");
      const char2 = $createCharNode("add");
      $setState(char2, charIdState, "char-id2");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine adjacent CharNodes with same marker, attributes and cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value" });
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add", { customAttr: "value" });
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker and cids but different attributes", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value1" });
      $setState(char1, charIdState, "char-id");
      const char2 = $createCharNode("add", { customAttr: "value2" });
      $setState(char2, charIdState, "char-id");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker and attributes but different cids", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add", { customAttr: "value" });
      $setState(char1, charIdState, "char-id1");
      const char2 = $createCharNode("add", { customAttr: "value" });
      $setState(char2, charIdState, "char-id2");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          char2.append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should not combine adjacent CharNodes with same marker but only one cid", async () => {
    const { editor } = await testEnvironment(() => {
      const char1 = $createCharNode("add");
      $setState(char1, charIdState, "char-id1");
      $getRoot().append(
        $createParaNode().append(
          char1.append($createTextNode("add text1 ")),
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
    });
  });

  it("should combine nested adjacent CharNodes with same marker", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append(
            $createTextNode("add text before "),
            $createCharNode("nd").append($createTextNode("nd text1 ")),
            $createCharNode("nd").append($createTextNode("nd text2 ")),
            $createTextNode("add text after "),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getChildrenSize()).toBe(3);

      const textBefore = add.getChildAtIndex(0);
      if (!$isTextNode(textBefore)) throw new Error("Expected a TextNode");
      expect(textBefore.getTextContent()).toBe("add text before ");

      const nd = add.getChildAtIndex(1);
      if (!$isCharNode(nd)) throw new Error("Expected a CharNode");
      expect(nd.getMarker()).toBe("nd");
      expect(nd.getChildrenSize()).toBe(1);
      expect(nd.getTextContent()).toBe("nd text1 nd text2 ");
    });
  });

  it("should not combine nested adjacent CharNodes with different markers", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append(
            $createTextNode("add text before "),
            $createCharNode("nd").append($createTextNode("nd text ")),
            $createCharNode("w").append($createTextNode("w text ")),
            $createTextNode("add text after "),
          ),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getChildrenSize()).toBe(4);
    });
  });

  it("should NOT combine adjacent \\fp (footnote-paragraph) CharNodes", async () => {
    // Each `\fp` span IS a footnote-paragraph break: adjacency is the normal shape (Enter or a
    // multi-line paste inside a note makes consecutive `\fp` spans), and merging them destroys
    // the break in the serialized USJ (observed: two breaks collapsed into one
    // `\fp somethingsomething else`). Formatting chars merge as before — `fp` adjacency is
    // content structure, not equivalent formatting runs.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("fp").append($createTextNode("first paragraph ")),
          $createCharNode("fp").append($createTextNode("second paragraph ")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(2);
      const [first, second] = p.getChildren();
      if (!$isCharNode(first) || !$isCharNode(second)) throw new Error("Expected CharNodes");
      expect(first.getMarker()).toBe("fp");
      expect(second.getMarker()).toBe("fp");
      expect(first.getTextContent()).toBe("first paragraph ");
      expect(second.getTextContent()).toBe("second paragraph ");
    });
  });

  it("should combine 3 adjacent CharNodes with same marker on update", async () => {
    let ndCharNode: CharNode;
    const { editor } = await testEnvironment(() => {
      ndCharNode = $createCharNode("nd").append($createTextNode("nd text "));
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("add").append($createTextNode("add text1 ")),
          ndCharNode,
          $createCharNode("add").append($createTextNode("add text2 ")),
        ),
      );
    });
    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(3);
    });

    await act(async () => {
      editor.update(() => {
        ndCharNode.setMarker("add");
      });
    });

    editor.getEditorState().read(() => {
      const p = $getRoot().getFirstChild();
      if (!$isParaNode(p)) throw new Error("Expected a ParaNode");
      expect(p.getChildrenSize()).toBe(1);

      const add = p.getFirstChild();
      if (!$isCharNode(add)) throw new Error("Expected a CharNode");
      expect(add.getMarker()).toBe("add");
      expect(add.getTextContent()).toBe("add text1 nd text add text2 ");
    });
  });

  // Self-healing nested glyphs: the tree is the source of truth for nesting; each glyph's cached
  // `+` (MarkerNode.__text via the `nested` flag) must follow the span when structure changes.
  describe("nested glyph healing ($syncNestedGlyphs transform)", () => {
    /** A char span's own marker glyph texts, in order. */
    function glyphTexts(char: CharNode): string[] {
      return char
        .getChildren()
        .filter($isMarkerNode)
        .map((m) => m.getTextContent());
    }

    it("drops the + from a nested span's glyphs when the span moves to paragraph level", async () => {
      let ndChar: CharNode;
      let outerChar: CharNode;
      const { editor } = await testEnvironment(() => {
        outerChar = $createCharNode("add");
        ndChar = $createCharNode("nd");
        ndChar.append(
          $createMarkerNode("nd", "opening", true),
          $createTextNode("holy"),
          $createMarkerNode("nd", "closing", true),
        );
        outerChar.append(
          $createMarkerNode("add"),
          $createTextNode("before "),
          ndChar,
          $createMarkerNode("add", "closing"),
        );
        $getRoot().append($createParaNode().append(outerChar));
      });

      await act(async () => {
        editor.update(() => {
          // Structure surgery that forgets to refresh glyphs (the drift the transform heals):
          // the nested span moves OUT to the paragraph level with its `\+nd` glyphs intact.
          outerChar.insertAfter(ndChar);
        });
      });

      editor.getEditorState().read(() => {
        expect(glyphTexts(ndChar)).toEqual(["\\nd", "\\nd*"]);
      });
    });

    it("adds the + to a bare span's glyphs when the span moves inside another char", async () => {
      let ndChar: CharNode;
      let outerChar: CharNode;
      const { editor } = await testEnvironment(() => {
        outerChar = $createCharNode("add");
        outerChar.append(
          $createMarkerNode("add"),
          $createTextNode("before "),
          $createMarkerNode("add", "closing"),
        );
        ndChar = $createCharNode("nd");
        ndChar.append(
          $createMarkerNode("nd"),
          $createTextNode("holy"),
          $createMarkerNode("nd", "closing"),
        );
        $getRoot().append($createParaNode().append(outerChar, ndChar));
      });

      await act(async () => {
        editor.update(() => {
          // The bare span moves INSIDE the other char (before its closer) — its glyphs must
          // gain the `+`.
          const closer = outerChar
            .getChildren()
            .find((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing");
          if (!closer) throw new Error("outer closer missing");
          closer.insertBefore(ndChar);
        });
      });

      editor.getEditorState().read(() => {
        expect(glyphTexts(ndChar)).toEqual(["\\+nd", "\\+nd*"]);
      });
    });

    it("heals a missing display separator after an opener (text-first and element-first)", async () => {
      let textFirstChar: CharNode;
      let elementFirstChar: CharNode;
      const { editor } = await testEnvironment(() => {
        // Text-first span missing its structural NBSP prefix (`\ndone` instead of `\nd one`).
        textFirstChar = $createCharNode("nd");
        textFirstChar.append(
          $createMarkerNode("nd"),
          $createTextNode("one"),
          $createMarkerNode("nd", "closing"),
        );
        // Element-first span missing the spacer between its opener and the nested span.
        elementFirstChar = $createCharNode("add");
        const inner = $createCharNode("wj");
        inner.append(
          $createMarkerNode("wj", "opening", true),
          $createTextNode(`${NBSP}in`),
          $createMarkerNode("wj", "closing", true),
        );
        elementFirstChar.append(
          $createMarkerNode("add"),
          inner,
          $createMarkerNode("add", "closing"),
        );
        $getRoot().append($createParaNode().append(textFirstChar, elementFirstChar));
      });

      await act(async () => {
        editor.update(() => {
          textFirstChar.getWritable();
          elementFirstChar.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        // Text-first: the content text gained the structural NBSP prefix.
        const content = textFirstChar
          .getChildren()
          .find((c) => $isTextNode(c) && !$isMarkerNode(c));
        expect(content?.getTextContent()).toBe(`${NBSP}one`);
        // Element-first: a standalone NBSP spacer sits between the opener and the nested span.
        const children = elementFirstChar.getChildren();
        expect($isMarkerNode(children[0]) && children[0].getTextContent()).toBe("\\add");
        expect($isTextNode(children[1]) && children[1].getTextContent()).toBe(NBSP);
        expect($isCharNode(children[2]) && children[2].getMarker()).toBe("wj");
      });
    });

    it("leaves a milestone's glyph run inside a char span alone (no bogus +)", async () => {
      let outerChar: CharNode;
      let msOpening: ReturnType<typeof $createMarkerNode>;
      const { editor } = await testEnvironment(() => {
        outerChar = $createCharNode("wj");
        // The adaptor renders a milestone INSIDE a char span as sibling glyphs of the milestone
        // node: an opening `\qt-s` MarkerNode and a self-closing `\*`. They are direct MarkerNode
        // children of the char but do NOT describe a nested char span — no `+` belongs on them.
        msOpening = $createMarkerNode("qt-s");
        outerChar.append(
          $createMarkerNode("wj"),
          $createTextNode("words "),
          msOpening,
          $createMarkerNode("", "selfClosing"),
          $createMarkerNode("wj", "closing"),
        );
        $getRoot().append($createParaNode().append(outerChar));
      });

      await act(async () => {
        editor.update(() => {
          // Any edit that dirties the span re-runs the transform.
          outerChar.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        expect(msOpening.getTextContent()).toBe("\\qt-s");
      });
    });
  });
});

async function testEnvironment($initialEditorState: () => void) {
  return baseTestEnvironment($initialEditorState, <CharNodePlugin />);
}
