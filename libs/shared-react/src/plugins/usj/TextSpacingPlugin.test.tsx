// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { $expectSelectionToBe } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { ImmutableVerseNode, $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode } from "../../nodes/usj/node-react.utils";
import { TextSpacingPlugin } from "./TextSpacingPlugin";
import {
  baseTestEnvironment,
  createTextAtSelection,
  deleteTextAtSelection,
  typeTextAfterNode,
  typeTextAtSelection,
} from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setState,
  LexicalNode,
  TextNode,
  $setSelection,
} from "lexical";
import {
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  $createTypedMarkNode,
  $createUnknownNode,
  $createVerseNode,
  $getLogicalContentItems,
  $hasCaretHeldVerseAttributeRun,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  $isTypedMarkNode,
  $isUnknownNode,
  $isVisibleMarkerNode,
  NBSP,
  openingMarkerText,
  ParaNode,
  textTypeState,
  UnknownNode,
  VerseNode,
} from "shared";

let v1Node: ImmutableVerseNode;
let textNode: TextNode;
let v4ParaNode: ParaNode;
let v4Node: ImmutableVerseNode;

function $defaultInitialEditorState() {
  v1Node = $createImmutableVerseNode("1");
  textNode = $createTextNode("b ");
  v4ParaNode = $createParaNode();
  v4Node = $createImmutableVerseNode("1");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append(v1Node, $createImmutableVerseNode("2")),
    $createParaNode().append($createImmutableVerseNode("3"), textNode),
    v4ParaNode.append(v4Node, $createNoteNode("f", "+")),
    $createParaNode().append(
      $createImmutableVerseNode("5"),
      $createCharNode("wj").append($createTextNode("e")),
    ),
  );
}

describe("TextSpacingPlugin", () => {
  it("should load default initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("\n\nb \n\n\n\ne");
    });
  });

  it("should insert a character between empty verses and add trailing space and retain caret location", async () => {
    const { editor } = await testEnvironment();

    await typeTextAfterNode(editor, "a", v1Node, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[1];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(1);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("a ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should remove the character between empty verses and trailing space is removed", async () => {
    const { editor } = await testEnvironment();

    // Remove the 'b' and leave the space.
    await act(async () => {
      editor.update(() => {
        if ($isTextNode(textNode) && textNode.isAttached()) textNode.setTextContent(" ");
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[2];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(1);
      const verseNode = para.getChildAtIndex(0);
      if (!$isSomeVerseNode(verseNode)) throw new Error("Expected some verse node");
    });
  });

  it("should insert a character before a note node and not add trailing space", async () => {
    const { editor } = await testEnvironment();

    await typeTextAfterNode(editor, "d", v4Node, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[3];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(1);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should not add a space inside a char node", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[4];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const charNode = para.getChildAtIndex(1);
      if (!$isCharNode(charNode)) throw new Error("Expected a CharNode");
      expect(charNode.getTextContent()).toBe("e");
    });
  });

  it("should not add a space inside a TypedMarkNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("This is "),
          $createTypedMarkNode({ testType1: ["testID1"] }).append(
            $createTextNode("a TypedMarkNode"),
          ),
          $createTextNode("."),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildrenSize()).toBe(3);
      const markNode = para.getChildAtIndex(1);
      if (!$isTypedMarkNode(markNode)) throw new Error("Expected a TypedMarkNode");
      // No extra space at the end.
      expect(markNode.getTextContent()).toBe("a TypedMarkNode");
    });
  });

  it("should not add trailing space when next sibling is a CharNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("abc"),
          $createCharNode("nd").append($createTextNode("xyz")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("abc");
      const charNode = para.getChildAtIndex(1);
      if (!$isCharNode(charNode)) throw new Error("Expected a CharNode");
      expect(charNode.getTextContent()).toBe("xyz");
    });
  });

  it("should not add trailing space when next sibling is a TypedMarkNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("abc"),
          $createTypedMarkNode({ testType1: ["testID1"] }).append($createTextNode("marked")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("abc");
      const markNode = para.getChildAtIndex(1);
      if (!$isTypedMarkNode(markNode)) throw new Error("Expected a TypedMarkNode");
      expect(markNode.getTextContent()).toBe("marked");
    });
  });

  it("should preserve space-only TextNode when next sibling is a CharNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode(" "),
          $createCharNode("nd").append($createTextNode("xyz")),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(2);
      const spaceNode = para.getChildAtIndex(0);
      if (!$isTextNode(spaceNode)) throw new Error("Expected a TextNode");
      expect(spaceNode.getTextContent()).toBe(" ");
    });
  });

  it("should add a space if typing before an initial verse in a para", async () => {
    const { editor } = await testEnvironment();

    await typeTextAtSelection(editor, "d", v4ParaNode, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[3];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should add a space if typing before a verse in a para starting with an UnknownNode", async () => {
    let unknownTextNode: TextNode;
    const { editor } = await testEnvironment(() => {
      unknownTextNode = $createTextNode("wat-z");
      $getRoot().append(
        $createParaNode().append(
          $createUnknownNode("wat", "z").append(unknownTextNode),
          $createImmutableVerseNode("6"),
          $createTextNode("f"),
        ),
      );
    });

    // Defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await createTextAtSelection(editor, "d", unknownTextNode!, 0);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(4);
      const textNode = para.getChildAtIndex(0);
      if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
      expect(textNode.getTextContent()).toBe("d ");
      $expectSelectionToBe(textNode, 1);
    });
  });

  it("should not remove a space if it precedes a verse", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode(" "),
          $createImmutableVerseNode("2"),
        ),
      );
    });

    // Trigger an update by moving selection (or any other update)
    await act(async () => {
      editor.update(() => {
        const verse1 = $getRoot().getFirstDescendant();
        if (verse1) $setSelection(verse1.selectNext(0, 0));
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(3);
      const spaceNode = para.getChildAtIndex(1);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should move typed text out of an UnknownNode and add space before verse", async () => {
    let unknownNode: UnknownNode;
    let innerTextNode: TextNode;
    const { editor } = await testEnvironment(() => {
      innerTextNode = $createTextNode("abc");
      unknownNode = $createUnknownNode("tag", "content").append(innerTextNode);
      $getRoot().append($createParaNode().append(unknownNode, $createImmutableVerseNode("1")));
    });

    // Select within the inner text node and type. `innerTextNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await createTextAtSelection(editor, "d", innerTextNode!, 1); // Select after 'a'

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [UnknownNode, TextNode("d "), VerseNode]
      expect(para.getChildren()).toHaveLength(3);
      const typedTextNode = para.getChildAtIndex(1);
      if (!$isTextNode(typedTextNode)) throw new Error("Expected a TextNode");
      expect(typedTextNode.getTextContent()).toBe("d ");
      const originalUnknownNode = para.getChildAtIndex(0);
      expect(originalUnknownNode?.getKey()).toBe(unknownNode.getKey());
      expect(originalUnknownNode?.getTextContent()).toBe("abc"); // Original text unchanged
      $expectSelectionToBe(typedTextNode, 1); // Selection after the typed 'd'
    });
  });

  it("should insert a space before a verse if preceded by a CharNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createCharNode("wj").append($createTextNode("abc")),
          $createImmutableVerseNode("1"),
        ),
      );
    });

    // Trigger an update
    await act(async () => {
      editor.update(() => {
        const verse1 = $getRoot().getLastDescendant();
        if (verse1) $setSelection(verse1.selectPrevious(0, 0));
      });
    });

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [CharNode, TextNode(" "), VerseNode]
      expect(para.getChildren()).toHaveLength(3);
      const spaceNode = para.getChildAtIndex(1);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should not insert a space before a verse if preceded by an UnknownNode", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createUnknownNode("tag", "content").append($createTextNode("abc")),
          $createImmutableVerseNode("1"),
        ),
      );
    });

    // Trigger an update (no change expected)
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should remain [UnknownNode, VerseNode]
      expect(para.getChildren()).toHaveLength(2);
      expect($isUnknownNode(para.getChildAtIndex(0))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(1))).toBe(true);
    });
  });

  // An optbreak (`//`) is an inline UnknownNode. The spaces around it are SIGNIFICANT (Paratext 9
  // preserves them byte-for-byte), so the trailing-space transform must treat a text node ADJACENT
  // to an optbreak the same way it already treats text adjacent to a note/char/typed-mark: leave it
  // exactly as authored. The transform's own doc comment promises this ("adjacent to ... UnknownNode
  // content"), but the code only checked `$isUnknownNode(parent)` (inside), not the next sibling.
  it("should not add a trailing space to text before an optbreak", async () => {
    let textNode: TextNode;
    const { editor } = await testEnvironment(() => {
      textNode = $createTextNode("one");
      $getRoot().append(
        $createParaNode().append(textNode, $createUnknownNode("optbreak"), $createTextNode("two")),
      );
    });

    // Force the transform to run on the text node.
    // `textNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await act(async () => editor.update(() => textNode!.getWritable()));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const text = para.getChildAtIndex(0);
      if (!$isTextNode(text)) throw new Error("Expected a TextNode");
      // `one`, not `one ` — the tight `one//two` form must survive.
      expect(text.getTextContent()).toBe("one");
    });
  });

  it("should let the user delete the space before an optbreak (it is not re-added)", async () => {
    let textNode: TextNode;
    const { editor } = await testEnvironment(() => {
      textNode = $createTextNode("one ");
      $getRoot().append(
        $createParaNode().append(textNode, $createUnknownNode("optbreak"), $createTextNode("two")),
      );
    });

    // Delete the trailing space before the optbreak. `textNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteTextAtSelection(editor, textNode!, 3, textNode!, 4);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const text = para.getChildAtIndex(0);
      if (!$isTextNode(text)) throw new Error("Expected a TextNode");
      // The deleted space stays deleted — the transform must not re-append it.
      expect(text.getTextContent()).toBe("one");
    });
  });

  it("should preserve a lone space-only TextNode before an optbreak", async () => {
    let spaceNode: TextNode;
    const { editor } = await testEnvironment(() => {
      spaceNode = $createTextNode(" ");
      $getRoot().append(
        $createParaNode().append(spaceNode, $createUnknownNode("optbreak"), $createTextNode("two")),
      );
    });

    // Force the transform to run on the space node.
    // `spaceNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await act(async () => editor.update(() => spaceNode!.getWritable()));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const space = para.getChildAtIndex(0);
      // The leading-space `//two` form must survive — not stripped to empty.
      expect($isTextNode(space) && space.getTextContent() === " ").toBe(true);
    });
  });

  it("should not insert a space before a verse if preceded by a gutter paragraph marker prefix", async () => {
    // Regression test for PT-3835 Gen 2: gutter mode (`hasGutterParaMarkers: true`) renders the
    // paragraph's `\p` marker as a visible-marker ImmutableTypedTextNode (textType "marker") that is
    // verse 1's previous sibling. That node is a DecoratorNode, not a TextNode/UnknownNode, so
    // $verseNodeTransform used to treat it like arbitrary unrecognized content and insert a spurious
    // leading space, shifting every logical content index in the paragraph.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableTypedTextNode("marker", openingMarkerText("p") + NBSP),
          $createImmutableVerseNode("1"),
        ),
      );
    });

    // Trigger an update (no change expected).
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should remain [marker prefix, VerseNode] -- no spurious space inserted.
      expect(para.getChildren()).toHaveLength(2);
      expect($isVisibleMarkerNode(para.getChildAtIndex(0))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(1))).toBe(true);
    });
  });

  it("should space an annotation over plain text before a verse without shifting its logical index", async () => {
    // The annotation wrapper is transparent to USJ content: the inserted space coalesces onto
    // the wrapped text's run (the trailing-space transform can't reach text inside a
    // TypedMarkNode), so the verse's logical content index is unchanged.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode("the "),
          $createTypedMarkNode({ t: ["1"] }).append($createTextNode("beginning")),
          $createImmutableVerseNode("2"),
        ),
      );
    });

    // Trigger an update (transforms run).
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // [verse 1, "the beginning ", verse 2] — space coalesced into the run, no index shift.
      expect($getLogicalContentItems(para)).toHaveLength(3);
      expect(para.getTextContent()).toBe("the beginning ");
    });
  });

  it("should insert the structural space when an annotation ending on a CharNode precedes a verse", async () => {
    // A space between a char and a following verse marker is structural, not content: USJ→USFM
    // conversion needs it and Paratext 9 re-inserts it when removed. Canonical USJ therefore has
    // a standalone " " item here, so inserting it matches the exported shape — the annotation
    // wrapper must not suppress it.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode("text "),
          $createTypedMarkNode({ t: ["1"] }).append(
            $createCharNode("nd").append($createTextNode("LORD")),
          ),
          $createImmutableVerseNode("2"),
        ),
      );
    });

    // Trigger an update (transforms run).
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // [verse 1, "text ", char, " ", verse 2] — the structural space is its own content item,
      // exactly as canonical USJ from Paratext has it.
      const items = $getLogicalContentItems(para);
      expect(items).toHaveLength(5);
      expect(items[3].type).toBe("text");
    });
  });

  it("should not insert a space before a verse for an empty annotation wrapper", async () => {
    // An empty TypedMarkNode resolves to no content, so no structural space belongs after it —
    // inserting one would add exporter-visible USJ content because of a presentation-only node.
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createImmutableVerseNode("1"),
          $createTextNode("a "),
          $createTypedMarkNode({ t: ["1"] }),
          $createImmutableVerseNode("2"),
        ),
      );
    });

    // Trigger an update (transforms run).
    await act(async () => editor.update(() => undefined));

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // [verse 1, "a ", verse 2] — no double space, no extra content item.
      expect($getLogicalContentItems(para)).toHaveLength(3);
      expect(para.getTextContent()).toBe("a ");
    });
  });

  it("should not remove a space left after deletion if it precedes a verse", async () => {
    let textNodeToDelete: TextNode;
    const { editor } = await testEnvironment(() => {
      textNodeToDelete = $createTextNode("abc ");
      $getRoot().append($createParaNode().append(textNodeToDelete, $createImmutableVerseNode("1")));
    });

    // Select "abc" and delete. `textNodeToDelete` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteTextAtSelection(editor, textNodeToDelete!, 0, textNodeToDelete!, 3); // Select "abc"

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // Should be [TextNode(" "), VerseNode]
      expect(para.getChildren()).toHaveLength(2);
      const spaceNode = para.getChildAtIndex(0);
      expect($isTextNode(spaceNode) && spaceNode.getTextContent() === " ").toBe(true);
    });
  });

  it("should not insert a space before a verse if it's empty", async () => {
    let paraNode: ParaNode;
    const { editor } = await testEnvironment(() => {
      paraNode = $createParaNode();
      $getRoot().append(
        paraNode.append(
          $createImmutableVerseNode("1"),
          $createImmutableVerseNode("2"),
          $createImmutableVerseNode("3"),
        ),
      );
    });

    // `paraNode` defined by the test environment.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "a", paraNode!, 2);

    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      expect(para.getChildren()).toHaveLength(4);
      expect($isSomeVerseNode(para.getChildAtIndex(0))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(1))).toBe(true);
      expect($isSomeVerseNode(para.getChildAtIndex(3))).toBe(true);
      const typedTextNode = para.getChildAtIndex(2);
      if (!$isTextNode(typedTextNode)) throw new Error("Expected a TextNode");
      $expectSelectionToBe(typedTextNode, 1); // Selection after the typed 'a'
    });
  });

  // Self-healing verse attribute display runs: VerseNode.__altnumber/__pubnumber are the truth,
  // and the \va/\vp triplets riding as its following siblings are a derived cache that must
  // follow them — including remote collab updates (delta-apply calls only setAltnumber/
  // setPubnumber, never touches the runs) and structure surgery. Registered here because this is
  // the shared-react home that already registers VerseNode transforms (the spacing transform
  // above) — matching the CharNodePlugin precedent of one plugin owning all of a node type's
  // self-healing display syncs.
  describe("attribute run healing ($syncVerseAttributeDisplay transform)", () => {
    /** A marker's opening/value/closing triplet immediately following `after`, if any. */
    function attributeRun(
      after: LexicalNode,
      marker: "va" | "vp",
    ): { open: TextNode; value: TextNode; close: TextNode } | undefined {
      const open = after.getNextSibling();
      if (!$isMarkerNode(open) || open.getMarker() !== marker) return undefined;
      const value = open.getNextSibling();
      if (!$isTextNode(value)) return undefined;
      const close = value.getNextSibling();
      if (!$isMarkerNode(close) || close.getMarker() !== marker) return undefined;
      return { open, value, close };
    }

    it("heals missing \\va and \\vp runs from altnumber/pubnumber, va before vp", async () => {
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", "1b");
        $getRoot().append($createParaNode().append(verse));
      });

      await act(async () => {
        editor.update(() => {
          // Force the transform to re-run on this already-constructed verse.
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        const va = attributeRun(verse, "va");
        expect(va?.open.getTextContent()).toBe("\\va");
        expect(va?.value.getTextContent()).toBe(`${NBSP}2`);
        expect(va?.close.getTextContent()).toBe("\\va*");
        if (!va) throw new Error("No \\va run found");
        const vp = attributeRun(va.close, "vp");
        expect(vp?.open.getTextContent()).toBe("\\vp");
        expect(vp?.value.getTextContent()).toBe(`${NBSP}1b`);
        expect(vp?.close.getTextContent()).toBe("\\vp*");
      });
    });

    it("heals only a \\va run when pubnumber is absent, without disturbing later siblings", async () => {
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", undefined);
        $getRoot().append($createParaNode().append(verse, $createTextNode(" after")));
      });

      await act(async () => {
        editor.update(() => {
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        const va = attributeRun(verse, "va");
        expect(va?.value.getTextContent()).toBe(`${NBSP}2`);
        if (!va) throw new Error("No \\va run found");
        expect(attributeRun(va.close, "vp")).toBeUndefined();
        expect(va.close.getNextSibling()?.getTextContent()).toBe(" after");
      });
    });

    it("does not disturb an existing \\vp run while inserting a missing \\va run before it", async () => {
      let verse: VerseNode;
      let vpOpen: ReturnType<typeof $createMarkerNode>;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", "1b");
        vpOpen = $createMarkerNode("vp");
        const vpValue = $createTextNode(`${NBSP}1b`);
        $setState(vpValue, textTypeState, "attribute");
        verse.setPubnumber("1b");
        $getRoot().append(
          $createParaNode().append(verse, vpOpen, vpValue, $createMarkerNode("vp", "closing")),
        );
      });

      await act(async () => {
        editor.update(() => {
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        const va = attributeRun(verse, "va");
        expect(va?.value.getTextContent()).toBe(`${NBSP}2`);
        // The pre-existing \vp opener is the SAME node instance — not torn down and rebuilt.
        if (!va) throw new Error("No \\va run found");
        expect(va.close.getNextSibling()?.getKey()).toBe(vpOpen.getKey());
      });
    });

    it("heals stale run text after altnumber changes (remote update)", async () => {
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", undefined);
        const open = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append(
          $createParaNode().append(verse, open, value, $createMarkerNode("va", "closing")),
        );
      });

      await act(async () => {
        editor.update(() => {
          // Remote collab update: delta-apply touches only the node's own field, never the run.
          verse.setAltnumber("3");
        });
      });

      editor.getEditorState().read(() => {
        expect(attributeRun(verse, "va")?.value.getTextContent()).toBe(`${NBSP}3`);
      });
    });

    it("removes a leftover run when its value is cleared", async () => {
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", undefined);
        const open = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append(
          $createParaNode().append(verse, open, value, $createMarkerNode("va", "closing")),
        );
      });

      await act(async () => {
        editor.update(() => {
          verse.setAltnumber(undefined);
        });
      });

      editor.getEditorState().read(() => {
        expect(attributeRun(verse, "va")).toBeUndefined();
      });
    });

    it("leaves an edited run alone while the collapsed caret is inside it, and reports it caret-held", async () => {
      let verse: VerseNode;
      let value: ReturnType<typeof $createTextNode>;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", undefined);
        const open = $createMarkerNode("va");
        value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append(
          $createParaNode().append(verse, open, value, $createMarkerNode("va", "closing")),
        );
      });

      await act(async () => {
        editor.update(() => {
          // Mid-edit: the user has typed into the run, so its text has drifted from canonical
          // while the caret still sits inside it.
          value.setTextContent(`${NBSP}23`);
          value.select(value.getTextContentSize(), value.getTextContentSize());
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        expect(attributeRun(verse, "va")?.value.getTextContent()).toBe(`${NBSP}23`);
        expect($hasCaretHeldVerseAttributeRun(verse, "2", undefined)).toBe(true);
      });
    });

    it("leaves a just-deleted run alone while the caret sits at its insertion site, and reports it caret-held", async () => {
      // The user deleted the whole `\va 2\va*` triplet, leaving the caret at the verse's end (the
      // run's insertion point). altnumber is still "2", so without a missing-run grace the sync
      // would immediately re-derive the triplet — the deletion visibly undoing itself. The grace
      // must leave it alone and report it caret-held so the marker-edit engine settles it on
      // departure.
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1 ", undefined, "2", undefined);
        const open = $createMarkerNode("va");
        const value = $createTextNode(`${NBSP}2`);
        $setState(value, textTypeState, "attribute");
        $getRoot().append(
          $createParaNode().append(
            verse,
            open,
            value,
            $createMarkerNode("va", "closing"),
            $createTextNode(" after"),
          ),
        );
      });

      let reportedCaretHeld: boolean | undefined;
      await act(async () => {
        editor.update(
          () => {
            // Delete the whole \va triplet and park the caret at the verse's end (its site).
            const open = verse.getNextSibling();
            const value = open?.getNextSibling();
            const close = value?.getNextSibling();
            close?.remove();
            value?.remove();
            open?.remove();
            verse.select(verse.getTextContentSize(), verse.getTextContentSize());
            reportedCaretHeld = $hasCaretHeldVerseAttributeRun(verse, "2", undefined);
          },
          { discrete: true },
        );
      });

      expect(reportedCaretHeld).toBe(true);
      editor.getEditorState().read(() => {
        // The sync ran after this commit's mutations and did NOT re-insert the triplet.
        expect(attributeRun(verse, "va")).toBeUndefined();
        expect(verse.getNextSibling()?.getTextContent()).toBe(" after");
      });
    });

    it("reports \\vp caret-held even when \\va independently diverges with the caret elsewhere", async () => {
      // \va missing (diverges from altnumber) but the caret is nowhere near it — the sync would
      // heal it on its own, given the chance. \vp is mid-edit with the caret inside it. The two
      // triplets are independent: \va's divergence (without the caret) must not short-circuit
      // the \vp check. Asserted INSIDE the same update as construction, before the mounted sync
      // transform gets a chance to heal the un-held \va divergence away.
      const { editor } = await testEnvironment(() => undefined);
      let reportedCaretHeld: boolean | undefined;

      await act(async () => {
        editor.update(
          () => {
            const verse = $createVerseNode("1", "\\v 1", undefined, "2", "1b");
            const vpOpen = $createMarkerNode("vp");
            const vpValue = $createTextNode(`${NBSP}1b`);
            $setState(vpValue, textTypeState, "attribute");
            $getRoot().append(
              $createParaNode().append(verse, vpOpen, vpValue, $createMarkerNode("vp", "closing")),
            );
            vpValue.setTextContent(`${NBSP}1c`);
            vpValue.select(vpValue.getTextContentSize(), vpValue.getTextContentSize());
            reportedCaretHeld = $hasCaretHeldVerseAttributeRun(verse, "2", "1b");
          },
          { discrete: true },
        );
      });

      expect(reportedCaretHeld).toBe(true);
    });

    it("is idempotent on a canonical verse", async () => {
      let verse: VerseNode;
      let originalValue: ReturnType<typeof $createTextNode>;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1", undefined, "2", undefined);
        const open = $createMarkerNode("va");
        originalValue = $createTextNode(`${NBSP}2`);
        $setState(originalValue, textTypeState, "attribute");
        $getRoot().append(
          $createParaNode().append(verse, open, originalValue, $createMarkerNode("va", "closing")),
        );
      });

      await act(async () => {
        editor.update(() => {
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        const run = attributeRun(verse, "va");
        // Same node instance, untouched — proof the sync writes only on change.
        expect(run?.value.getKey()).toBe(originalValue.getKey());
        expect(run?.value.getTextContent()).toBe(`${NBSP}2`);
      });
    });

    it("serializes a plain verse (no altnumber/pubnumber) unchanged", async () => {
      let verse: VerseNode;
      const { editor } = await testEnvironment(() => {
        verse = $createVerseNode("1", "\\v 1");
        $getRoot().append($createParaNode().append(verse));
      });

      await act(async () => {
        editor.update(() => {
          verse.getWritable();
        });
      });

      editor.getEditorState().read(() => {
        expect(verse.getNextSibling()).toBeNull();
      });
    });
  });
});

async function testEnvironment($initialEditorState: () => void = $defaultInitialEditorState) {
  return baseTestEnvironment($initialEditorState, <TextSpacingPlugin />);
}
