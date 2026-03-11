import { $createImmutableVerseNode, ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { $isReactNodeWithMarker } from "../../nodes/usj/node-react.utils";
import * as useUsfmMarkersForMenuModule from "../PerfNodesItems/useUsfmMarkersForMenu";
import { UsjNodesMenuPlugin } from "./UsjNodesMenuPlugin";
import { baseTestEnvironment } from "./react-test.utils";
import { $getRoot, $createTextNode, LexicalEditor, $getSelection, TextNode } from "lexical";
import {
  $createImmutableChapterNode,
  $createImpliedParaNode,
  $createParaNode,
  $isImpliedParaNode,
  ImpliedParaNode,
  ScriptureReference,
} from "shared";
import { vi } from "vitest";

let firstVerseNode: ImmutableVerseNode;
let firstVerseTextNode: TextNode;
let secondVerseNode: ImmutableVerseNode;
let secondVerseTextNode: TextNode;
let thirdVerseNode: ImmutableVerseNode;
let thirdVerseTextNode: TextNode;

function $defaultInitialEditorState() {
  firstVerseNode = $createImmutableVerseNode("1-2");
  firstVerseTextNode = $createTextNode("first verse text ");
  secondVerseNode = $createImmutableVerseNode("3a");
  secondVerseTextNode = $createTextNode("second verse text ");
  thirdVerseNode = $createImmutableVerseNode("4-5a");
  thirdVerseTextNode = $createTextNode("third verse text ");
  $getRoot().append(
    $createImmutableChapterNode("1"),
    $createParaNode().append(firstVerseNode, firstVerseTextNode),
    $createParaNode().append(secondVerseNode, secondVerseTextNode),
    $createParaNode().append(thirdVerseNode, thirdVerseTextNode),
  );
}

describe("UsjNodesMenuPlugin", () => {
  it("should load default initialEditorState (sanity check)", async () => {
    const { editor } = await testEnvironment();

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(
        "first verse text \n\nsecond verse text \n\nthird verse text ",
      );
      expect(firstVerseNode.getNumber()).toBe("1-2");
      expect(secondVerseNode.getNumber()).toBe("3a");
      expect(thirdVerseNode.getNumber()).toBe("4-5a");
    });
  });

  it("should get 'p' marker from implied para to enable menu there", async () => {
    let impliedPara: ImpliedParaNode;
    const { editor } = await testEnvironment(() => {
      impliedPara = $createImpliedParaNode();
      $getRoot().append($createImmutableChapterNode("1"), impliedPara);
    });

    editor.getEditorState().read(() => {
      if (!$isImpliedParaNode(impliedPara))
        throw new Error("impliedPara is not an implied para node");
      if (!$isReactNodeWithMarker(impliedPara))
        throw new Error("impliedPara is not a React node with marker");
      expect(impliedPara.getMarker()).toBe("p");
    });
  });

  describe("context marker", () => {
    it("forwards provided contextMarker prop", async () => {
      const contextMarker = "p";
      const spy = vi.spyOn(useUsfmMarkersForMenuModule, "default");

      try {
        await testEnvironment(undefined, contextMarker);

        type UseUsfmMarkersArgs = Parameters<(typeof useUsfmMarkersForMenuModule)["default"]>[0];

        const wasCalledWithProp = spy.mock.calls.some((call) => {
          const [options] = call as [UseUsfmMarkersArgs | undefined];
          return options?.contextMarker === contextMarker;
        });

        expect(wasCalledWithProp).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });
});

async function testEnvironment(
  $initialEditorState: () => void = $defaultInitialEditorState,
  contextMarker?: string | undefined,
) {
  const scriptureReference = { book: "GEN", chapterNum: 1, verseNum: 1 };
  const verseToInsert = "3";

  function getMarkerAction(marker: string) {
    return {
      action: (currentEditor: { reference: ScriptureReference; editor: LexicalEditor }) => {
        if (marker !== "v") return;

        currentEditor.editor.update(() => {
          const selection = $getSelection();
          selection?.insertNodes([$createImmutableVerseNode(verseToInsert)]);
        });
      },
      label: undefined,
    };
  }

  return baseTestEnvironment(
    $initialEditorState,
    <UsjNodesMenuPlugin
      trigger="\\"
      scrRef={scriptureReference}
      contextMarker={contextMarker}
      getMarkerAction={getMarkerAction}
    />,
  );
}
