// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { $expectSelectionToBe } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { ImmutableVerseNode, $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode } from "../../nodes/usj/node-react.utils";
import { $getRangeFromUsjSelection } from "./annotation/selection.utils";
import { TextSpacingPlugin } from "./TextSpacingPlugin";
import {
  baseTestEnvironment,
  createTextAtSelection,
  deleteTextAtSelection,
  typeTextAfterNode,
  typeTextAtSelection,
} from "./react-test.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, TextNode, $setSelection } from "lexical";
import {
  $createCharNode,
  $createImmutableChapterNode,
  $createImmutableTypedTextNode,
  $createNoteNode,
  $createParaNode,
  $createTypedMarkNode,
  $createUnknownNode,
  $getLogicalContentItems,
  $isCharNode,
  $isParaNode,
  $isTypedMarkNode,
  $isUnknownNode,
  $isVisibleMarkerNode,
  NBSP,
  openingMarkerText,
  ParaNode,
  UnknownNode,
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

  it("should remove an empty verse's space that an edit left behind", async () => {
    // Covers the space arriving via a user EDIT (type then delete); the sibling test below covers
    // it arriving with already-loaded content. See `$textNodeTrailingSpaceTransform` for why the
    // space must go. Unit-level guard only — the cross-process reload this prevents lives in core
    // and is not exercised here.
    const { editor } = await testEnvironment();

    // Type between the two empty verses; the transform adds the structural trailing space.
    await typeTextAfterNode(editor, "a", v1Node, 0);

    let typedNode: TextNode | undefined;
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[1];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const node = para.getChildAtIndex(1);
      if (!$isTextNode(node)) throw new Error("Expected a TextNode");
      expect(node.getTextContent()).toBe("a ");
      typedNode = node;
    });

    // Delete the "a", leaving only the structural space behind.
    // `typedNode` is assigned in the read above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteTextAtSelection(editor, typedNode!, 0, typedNode!, 1);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren()[1];
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      // The caret comes to rest on the paragraph itself, at the boundary just after verse 1 —
      // the same resting position an untouched empty verse has. Asserting the exact node and
      // offset matters: merely asserting a non-null selection would also pass when the space
      // survives, because the caret then simply stays inside the leftover text node.
      $expectSelectionToBe(para, 1);
      // [verse 1, verse 2] — no exporter-visible content item for the now-empty verse.
      expect($getLogicalContentItems(para)).toHaveLength(2);
      expect(para.getTextContent()).toBe("");
    });
  });

  it("should keep USJ content indexes resolvable after an empty verse's space is removed", async () => {
    // Annotation and comment anchors resolve by logical content index, so a paragraph's item count
    // here must match the shape core serves. Core drops the empty verse's space, giving
    // [verse 1, verse 2, "tail"]; if the editor kept the space, logical index 2 would resolve to
    // verse 2 instead of the tail text and every anchor after an empty verse would land one item
    // early — the index-shift class guarded against in $verseNodeTransform.
    let verse1: ImmutableVerseNode;
    let tailText: TextNode;
    const { editor } = await testEnvironment(() => {
      verse1 = $createImmutableVerseNode("1");
      tailText = $createTextNode("tail");
      $getRoot().append($createParaNode().append(verse1, $createImmutableVerseNode("2"), tailText));
    });

    // Type into empty verse 1 then delete it again — the flow that leaves the structural space.
    // `verse1` is assigned in the setup callback above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAfterNode(editor, "a", verse1!, 0);

    let typedNode: TextNode | undefined;
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");
      const node = para.getChildAtIndex(1);
      if (!$isTextNode(node)) throw new Error("Expected a TextNode");
      typedNode = node;
    });
    // `typedNode` is assigned in the read above.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await deleteTextAtSelection(editor, typedNode!, 0, typedNode!, 1);

    editor.getEditorState().read(() => {
      // Logical index 2 is the tail text in core's shape; it must be the tail text here too.
      const range = $getRangeFromUsjSelection({
        start: { jsonPath: "$.content[0].content[2]", offset: 1 },
      });
      if (!range) throw new Error("Expected the USJ selection to resolve");
      // `tailText` is assigned in the setup callback above.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(range.anchor.key).toBe(tailText!.getKey());
      expect(range.anchor.offset).toBe(1);
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

  it("should remove an empty verse's space that arrived with already-loaded content", async () => {
    // Covers the space arriving with content the editor was LOADED with (e.g. a document whose USJ
    // already carries it), not produced by an edit as in the sibling test above — the transform
    // must clean it up on its first pass over existing content, without any edit to trigger it.
    // See `$textNodeTrailingSpaceTransform` for why the space must go. Unit-level guard only.
    //
    // Note this stays narrower than "never remove a space before a verse": a space preceding a
    // verse is still kept when it is genuine structural content — after a CharNode (see the
    // annotation test below) or as a paragraph's leading text (see the deletion test below).
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
      // [verse 1, verse 2] — the empty verse contributes no content item. Asserted on logical
      // content items rather than children so this stays invariant to whether Lexical has yet
      // garbage-collected the emptied text node.
      expect($getLogicalContentItems(para)).toHaveLength(2);
      expect(para.getTextContent()).toBe("");
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
});

async function testEnvironment($initialEditorState: () => void = $defaultInitialEditorState) {
  return baseTestEnvironment($initialEditorState, <TextSpacingPlugin />);
}
