import { replaceBrothersWithBrethren } from "./delta-utils-test.data";
import { $applyUpdate } from "./delta.utils";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { render, act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import { Op } from "quill-delta";
import { usjReactNodes } from "shared-react/nodes/usj";
import { $createImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { TypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $isSomeChapterNode } from "shared/nodes/usj/node.utils";
import { $createParaNode } from "shared/nodes/usj/ParaNode";

describe("Delta Utils $applyUpdate", () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods before each test and provide mock implementations
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods after each test to their original implementations
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it("should handle an empty operations array (sanity check)", async () => {
    const { editor } = await testEnvironment();
    const ops: Op[] = [];
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("");
    });

    await sutApplyUpdate(editor, ops);

    expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("");
    });
  });

  it("should handle an empty operation in ops array", async () => {
    const { editor } = await testEnvironment();
    const ops: Op[] = [{}];

    await sutApplyUpdate(editor, ops);

    expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  describe("Retain Operations", () => {
    it("should correctly log a retain operation with a positive value", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ retain: 5 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 5");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });

    it("should correctly log a retain operation with value 0", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ retain: 0 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 0");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Delete Operations", () => {
    it("should correctly log a delete operation with a positive value", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createImpliedParaNode().append(
            $createTextNode("Paul, an apostle—not from men nor through man, "),
          ),
        );
      });
      const ops: Op[] = [{ delete: 4 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Delete: 4");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(2);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(", an apostle—not from men nor through man, ");
      });
    });

    it("should correctly log a delete operation with a positive value inside an embed", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Paul, an apostle—not from men nor through man, "),
          ),
        );
      });
      const ops: Op[] = [{ retain: 1 }, { delete: 4 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 1");
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(2, "Delete: 4");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(3);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(", an apostle—not from men nor through man, ");
      });
    });
  });

  describe("Insert Operations", () => {
    it("should correctly log an insert operation with an empty string", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: "" }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Insert: ''");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(2);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
      });
    });

    it("should insert text into an empty editor", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: "Hello World" }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Hello World");
      });
    });

    it("should insert text into an editor with empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const ops: Op[] = [{ insert: "Hello World" }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Hello World");
      });
    });

    it("should replace 'brothers' with 'brethren'", async () => {
      const brothers = "brothers";
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createImpliedParaNode().append(
            $createImmutableVerseNode("1"),
            $createTextNode(
              // length: 122
              "Paul, an apostle—not from men nor through man, but through Jesus Christ and God the Father, who raised him from the dead— ",
            ),
            $createImmutableVerseNode("2"),
            $createTextNode(
              // lengths: 12, 8, 46
              `and all the ${brothers} who are with me, To the churches of Galatia: `,
            ),
          ),
        );
      });
      const ops: Op[] = replaceBrothersWithBrethren.op.ops;
      // retain - 2("br") - (c1(1(embed)) + v1 + v2)
      const textIndex = 139 - 2 - 3;
      editor.getEditorState().read(() => {
        expect(
          $getRoot()
            .getTextContent()
            .slice(textIndex, textIndex + brothers.length),
        ).toBe(brothers);
      });

      await sutApplyUpdate(editor, ops);

      const brethren = "brethren";
      editor.getEditorState().read(() => {
        const textContent = $getRoot().getTextContent();
        expect(textContent.slice(textIndex, textIndex + brethren.length)).toBe(brethren);
        expect(textContent.slice(textIndex + brethren.length).startsWith(" who are with me")).toBe(
          true,
        );
      });
    });

    it("should correctly log an insert operation with an object (embed)", async () => {
      const { editor } = await testEnvironment();
      const embedChapter = { chapter: { number: "1", style: "c" } };
      const ops: Op[] = [{ insert: embedChapter }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const c1 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(c1)) throw new Error("v1 is not a chapter node");
        expect(c1.getNumber()).toBe("1");
        expect(c1.getMarker()).toBe("c");
      });
    });
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  let editor: LexicalEditor;

  function GrabEditor() {
    [editor] = useLexicalComposerContext();
    return null;
  }

  function App() {
    return (
      <LexicalComposer
        initialConfig={{
          editorState: $initialEditorState,
          namespace: "TestEditor",
          nodes: [TypedMarkNode, ...usjReactNodes],
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
      </LexicalComposer>
    );
  }

  await act(async () => {
    render(<App />);
  });

  // `editor` is defined on React render.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor: editor! };
}

/** SUT (Software Under test) to apply an OT update. */
async function sutApplyUpdate(editor: LexicalEditor, ops: Op[]) {
  await act(async () => {
    editor.update(() => {
      $applyUpdate(ops, console);
    });
  });
}
