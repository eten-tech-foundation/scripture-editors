// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  updateSelection,
} from "../../../../libs/shared/src/nodes/usj/test.utils";
import ScriptureReferencePlugin from "./ScriptureReferencePlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { act, render } from "@testing-library/react";
import {
  TextNode,
  $getRoot,
  SELECTION_CHANGE_COMMAND,
  $createTextNode,
  LexicalEditor,
} from "lexical";
import { useState } from "react";
import { $createBookNode, $createImmutableChapterNode, $createParaNode } from "shared";
import { $createImmutableVerseNode, usjReactNodes } from "shared-react";

let sectionTextNode: TextNode;
let firstVerseTextNode: TextNode;
let secondVerseTextNode: TextNode;
let thirdVerseTextNode: TextNode;

describe("ScriptureReferencePlugin", () => {
  const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };
  const mockOnScrRefChange = vi.fn();

  beforeEach(() => {
    mockOnScrRefChange.mockClear();
  });

  it("should load default initialEditorState (sanity check) and book loaded", async () => {
    const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(
        "Test Book\n\nSection Text\n\nfirst verse text \n\nsecond verse text \n\nthird verse text ",
      );
      $expectSelectionToBe(firstVerseTextNode, 0);
    });
    expect(mockOnScrRefChange).not.toHaveBeenCalled();
  });

  describe("Selection Change", () => {
    it("should move the cursor", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

      updateSelection(editor, firstVerseTextNode, 2);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(firstVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });
  });

  describe("Incoming scrRef Change", () => {
    it("should move the cursor", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 2 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not move the cursor if already in verse", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      updateSelection(editor, secondVerseTextNode, 2);
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);

      await setScrRef({ ...scrRef, verseNum: 2 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).toHaveBeenCalled();
    });

    it("should move the cursor into the start of range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 3 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should move the cursor into the end of range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 4 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not move the cursor if already in range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, thirdVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 3 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });
  });
});

function $defaultInitialEditorState() {
  sectionTextNode = $createTextNode("Section Text");
  firstVerseTextNode = $createTextNode("first verse text ");
  secondVerseTextNode = $createTextNode("second verse text ");
  thirdVerseTextNode = $createTextNode("third verse text ");

  $getRoot().append(
    $createBookNode("GEN").append($createTextNode("Test Book")),
    $createImmutableChapterNode("1"),
    $createParaNode("s1").append(sectionTextNode),
    $createParaNode().append($createImmutableVerseNode("1"), firstVerseTextNode),
    $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
    $createParaNode().append($createImmutableVerseNode("3-4"), thirdVerseTextNode),
  );
}

async function testEnvironment(
  scrRef: SerializedVerseRef = { book: "GEN", chapterNum: 1, verseNum: 1 },
  onScrRefChange: (scrRef: SerializedVerseRef) => void = () => undefined,
  $initialEditorState: () => void = $defaultInitialEditorState,
) {
  let editor: LexicalEditor;
  let _setScrRef: (scrRef: SerializedVerseRef) => void;

  function GrabEditor() {
    [editor] = useLexicalComposerContext();
    return null;
  }

  function App() {
    const [internalScrRef, setInternalScrRef] = useState<SerializedVerseRef>(scrRef);
    _setScrRef = setInternalScrRef;
    return (
      <LexicalComposer
        initialConfig={{
          editorState: $initialEditorState,
          namespace: "TestEditor",
          nodes: usjReactNodes,
          onError: (error) => {
            throw error;
          },
          theme: {},
        }}
      >
        <GrabEditor />
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ScriptureReferencePlugin scrRef={internalScrRef} onScrRefChange={onScrRefChange} />
      </LexicalComposer>
    );
  }

  async function setScrRef(newScrRef: SerializedVerseRef) {
    await act(async () => {
      _setScrRef(newScrRef);
    });
  }

  await act(async () => {
    render(<App />);
  });

  // `editor` is defined on React render.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor: editor!, setScrRef };
}
