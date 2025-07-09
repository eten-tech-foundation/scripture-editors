import { baseTestEnvironment } from "../react-test.utils";
import { OnChangePlugin } from "./DeltaOnChangePlugin";
import { $getRoot, EditorState, LexicalEditor } from "lexical";
import { Op } from "quill-delta";
import { $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";

let changeOps: Op[];

describe("OnChangePlugin", () => {
  it("should load an initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    expect(changeOps).toBeUndefined();
    editor.getEditorState().read(() => {
      const root = $getRoot();
      expect(root.getChildrenSize()).toBe(1);

      const p = root.getFirstChild();
      if (!$isImpliedParaNode(p)) throw new Error("Expected an ImpliedParaNode");
      expect(p.getChildrenSize()).toBe(0);
    });
  });
});

async function testEnvironment($initialEditorState?: () => void) {
  return baseTestEnvironment(
    $initialEditorState,
    <OnChangePlugin onChange={handleChange} ignoreSelectionChange ignoreHistoryMergeTagChange />,
  );
}

function handleChange(
  _editorState: EditorState,
  _editor: LexicalEditor,
  _tags: Set<string>,
  ops: Op[],
) {
  changeOps = ops;
}
