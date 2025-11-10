import {
  $createImmutableNoteCallerNode,
  defaultNoteCallers,
  ImmutableNoteCallerNode,
} from "../../nodes/usj/ImmutableNoteCallerNode";
import { $createImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { UsjNodeOptions } from "../../nodes/usj/usj-node-options.model";
import { ViewOptions } from "../../views/view-options.utils";
import { CounterStyleRuleLike, NoteNodePlugin } from "./NoteNodePlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $createTextNode,
  LexicalEditor,
  TextNode,
  $isTextNode,
  $getNodeByKey,
} from "lexical";
import {
  $createCharNode,
  $createImmutableChapterNode,
  $createNoteNode,
  $createParaNode,
  $isCharNode,
  $isNoteNode,
  $isParaNode,
  GENERATOR_NOTE_CALLER,
  NBSP,
  NoteNode,
} from "shared";
import { MockInstance } from "vitest";

let styleSheetsSpy: MockInstance;
let firstVerseTextNode: TextNode;
let firstNoteNode: NoteNode;
let secondNoteNode: NoteNode;
let thirdNoteNode: NoteNode;

function $createFootnoteNode(caller: string, reference: string, text: string) {
  const footnoteNode = $createNoteNode("f", GENERATOR_NOTE_CALLER);
  footnoteNode.append(
    $createImmutableNoteCallerNode(caller, `${reference} ${text}`),
    $createCharNode("fr").append($createTextNode(reference)),
    $createCharNode("ft").append($createTextNode(text)),
  );
  return footnoteNode;
}

function $defaultInitialEditorState() {
  const firstVerseNode = $createImmutableVerseNode("1");
  const secondVerseNode = $createImmutableVerseNode("2");
  const secondVerseTextNode = $createTextNode("second verse text ");
  const thirdVerseNode = $createImmutableVerseNode("3");
  const thirdVerseTextNode = $createTextNode("third verse text ");

  firstNoteNode = $createFootnoteNode("a", "1:1 ", "First footnote text ");
  firstVerseTextNode = $createTextNode("first verse text ");
  secondNoteNode = $createFootnoteNode("b", "1:2 ", "Second footnote text ");
  thirdNoteNode = $createFootnoteNode("c", "1:3 ", "Third footnote text ");

  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append(firstVerseNode, firstNoteNode, firstVerseTextNode),
    $createParaNode().append(secondVerseNode, secondNoteNode, secondVerseTextNode),
    $createParaNode().append(thirdVerseNode, thirdNoteNode, thirdVerseTextNode),
  );
}

beforeAll(() => {
  const fakeRule: CounterStyleRuleLike = {
    name: "note-callers",
    symbols:
      '"a" "b" "c" "d" "e" "f" "g" "h" "i" "j" "k" "l" "m" "n" "o" "p" "q" "r" "s" "t" "u" "v" "w" "x" "y" "z"',
    type: 11, // CSSRule.COUNTER_STYLE_RULE
  };
  const fakeStyleSheet = {
    cssRules: [fakeRule],
    rules: [fakeRule],
  };
  styleSheetsSpy = vi
    .spyOn(document, "styleSheets", "get")
    // Simplify testing.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation(() => [fakeStyleSheet] as any);
});

afterAll(() => {
  if (styleSheetsSpy) {
    styleSheetsSpy.mockRestore();
  }
});

describe("NoteNodePlugin", () => {
  it("should load default initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(
        `${NBSP}1:1 ${NBSP}First footnote text ${NBSP}first verse text \n\n` +
          `${NBSP}1:2 ${NBSP}Second footnote text ${NBSP}second verse text \n\n` +
          `${NBSP}1:3 ${NBSP}Third footnote text ${NBSP}third verse text `,
      );
      expect(getNoteCaller(firstNoteNode)).toBe("a");
      expect(getNoteCaller(secondNoteNode)).toBe("b");
      expect(getNoteCaller(thirdNoteNode)).toBe("c");
    });
  });

  describe("Note Caller Preview Text", () => {
    it("should update preview text", async () => {
      const { editor } = await testEnvironment();
      editor.getEditorState().read(() => {
        expect(getPreviewText(firstNoteNode)).toBe("1:1  First footnote text");
      });

      await updateNoteNodeText(editor, firstNoteNode, 2, 0, "1:1a ");

      editor.getEditorState().read(() => {
        expect(getPreviewText(firstNoteNode)).toBe("1:1a  First footnote text");
      });
    });

    it("should update preview text when 'empty' placeholder text", async () => {
      const { editor } = await testEnvironment(undefined, undefined, () => {
        firstNoteNode = $createNoteNode("f", GENERATOR_NOTE_CALLER);
        $getRoot().append(
          $createParaNode().append(
            firstNoteNode.append(
              $createImmutableNoteCallerNode("a", ""),
              $createCharNode("fr").append($createTextNode("1:1 ")),
              $createCharNode("ft").append($createTextNode(NBSP)),
            ),
          ),
        );
      });

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");

        const note = para.getFirstChild();
        if (!$isNoteNode(note)) throw new Error("Expected a NoteNode");
        expect(getPreviewText(note)).toBe("1:1");
      });
    });

    it("should remove 'empty' placeholder text once content exists", async () => {
      const { editor } = await testEnvironment(undefined, undefined, () => {
        firstNoteNode = $createNoteNode("f", GENERATOR_NOTE_CALLER);
        $getRoot().append(
          $createParaNode().append(
            firstNoteNode.append(
              $createImmutableNoteCallerNode("a", ""),
              $createCharNode("fr").append($createTextNode("1:1 ")),
              $createCharNode("ft").append($createTextNode(NBSP)),
            ),
          ),
        );
      });

      await updateNoteNodeText(editor, firstNoteNode, 4, 0, `${NBSP}Updated text`);

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");

        const note = para.getFirstChild();
        if (!$isNoteNode(note)) throw new Error("Expected a NoteNode");
        expect(getPreviewText(note)).toBe("1:1  Updated text");

        const ftChar = note.getChildAtIndex(4);
        if (!$isCharNode(ftChar)) throw new Error("Expected a CharNode");
        expect(ftChar.getMarker()).toBe("ft");

        const textNode = ftChar.getFirstChild();
        if (!$isTextNode(textNode)) throw new Error("Expected a TextNode");
        expect(textNode.getTextContent()).toBe("Updated text");
      });
    });

    it("should remove CharNode when content is cleared", async () => {
      const { editor } = await testEnvironment(undefined, undefined, () => {
        firstNoteNode = $createNoteNode("f", GENERATOR_NOTE_CALLER);
        $getRoot().append(
          $createParaNode().append(
            firstNoteNode.append(
              $createImmutableNoteCallerNode("a", ""),
              $createCharNode("fr").append($createTextNode("1:1 ")),
              $createCharNode("ft").append($createTextNode("Some content")),
            ),
          ),
        );
      });

      await updateNoteNodeText(editor, firstNoteNode, 4, 0, "");

      editor.getEditorState().read(() => {
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected a ParaNode");

        const note = para.getFirstChild();
        if (!$isNoteNode(note)) throw new Error("Expected a NoteNode");
        expect(getPreviewText(note)).toBe("1:1");

        const charNodes = note.getChildren().filter($isCharNode);
        const markers = charNodes.map((child) => child.getMarker());
        expect(markers, JSON.stringify(markers)).not.toContain("ft");

        const frChar = charNodes.find((child) => child.getMarker() === "fr");
        if (!$isCharNode(frChar)) throw new Error("Expected a CharNode");

        const frText = frChar.getFirstChild();
        if (!$isTextNode(frText)) throw new Error("Expected a TextNode");
        expect(frText.getTextContent()).toBe("1:1 ");
      });
    });
  });

  describe("Deleted Note Caller", () => {
    it("should remove NoteNode without caller when markerMode is not 'editable'", async () => {
      let noteNodeWithoutCallerKey: string | undefined;
      const { editor } = await testEnvironment(
        undefined,
        // viewOptions (`markerMode` is not 'editable')
        { markerMode: "visible", hasSpacing: true, isFormattedFont: true }, // Explicitly non-editable
        () => {
          const noteNodeWithoutCaller = $createNoteNode("f", GENERATOR_NOTE_CALLER);
          // Add some other nodes, but not an ImmutableNoteCallerNode
          noteNodeWithoutCaller.append(
            $createCharNode("fr").append($createTextNode("1:1a ")),
            $createCharNode("ft").append($createTextNode("Some text")),
          );
          noteNodeWithoutCallerKey = noteNodeWithoutCaller.getKey();
          $getRoot().append($createParaNode().append(noteNodeWithoutCaller));
        },
      );

      editor.getEditorState().read(() => {
        // Node should be removed
        expect($getNodeByKey(noteNodeWithoutCallerKey as string)).toBeNull();
      });
    });

    it("should not remove NoteNode without caller when markerMode is 'editable'", async () => {
      let noteNodeKey: string;
      const { editor } = await testEnvironment(
        undefined,
        { markerMode: "editable", hasSpacing: false, isFormattedFont: false },
        () => {
          const noteNode = $createNoteNode("f", GENERATOR_NOTE_CALLER);
          noteNode.append(
            $createTextNode(NBSP + "a "),
            $createCharNode("fr").append($createTextNode("1:1a ")),
            $createCharNode("ft").append($createTextNode("Some text")),
          );
          noteNodeKey = noteNode.getKey();
          $getRoot().append($createParaNode().append(noteNode));
        },
      );

      editor.getEditorState().read(() => {
        const noteNode = $getNodeByKey(noteNodeKey);
        // Node should not be removed
        expect(noteNode).not.toBeNull();
        expect(noteNode?.isAttached()).toBe(true);
      });
    });
  });
});

async function testEnvironment(
  nodeOptions: UsjNodeOptions = { noteCallers: defaultNoteCallers },
  viewOptions: ViewOptions = { markerMode: "hidden", hasSpacing: true, isFormattedFont: true },
  $initialEditorState: () => void = $defaultInitialEditorState,
) {
  // Create a ref for expanded note key - using a simple object to simulate useRef behavior in tests
  const expandedNoteKeyRef = { current: undefined as string | undefined };

  return baseTestEnvironment(
    $initialEditorState,
    <NoteNodePlugin
      expandedNoteKeyRef={expandedNoteKeyRef}
      nodeOptions={nodeOptions}
      viewOptions={viewOptions}
      logger={console}
    />,
  );
}

/**
 * Updates the text content of a CharNode within a NoteNode.
 *
 * @param editor - The LexicalEditor instance where the NoteNode is located.
 * @param noteNode - The NoteNode instance containing the CharNode to update.
 * @param charNodeIndex - The index of the CharNode within the NoteNode's children.
 * @param textNodeIndex - The index of the TextNode within the CharNode's children.
 * @param text - The new text content to set on the CharNode.
 * @returns A promise that resolves once the text content has been updated.
 */
async function updateNoteNodeText(
  editor: LexicalEditor,
  noteNode: NoteNode,
  charNodeIndex: number,
  textNodeIndex: number,
  text: string,
) {
  await act(async () => {
    editor.update(() => {
      const noteNodeChild = noteNode.getChildAtIndex(charNodeIndex);
      if (!$isCharNode(noteNodeChild)) throw new Error("Expected CharNode");

      const charNodeChild = noteNodeChild.getChildAtIndex(textNodeIndex);
      if (!$isTextNode(charNodeChild)) throw new Error("Expected TextNode");

      charNodeChild.setTextContent(text);
    });
  });
}

function getNoteCaller(noteNode: NoteNode | undefined): string | undefined {
  return noteNode?.getChildAtIndex<ImmutableNoteCallerNode>(0)?.getCaller();
}

function getPreviewText(noteNode: NoteNode | undefined): string | undefined {
  return noteNode?.getChildAtIndex<ImmutableNoteCallerNode>(0)?.getPreviewText();
}
