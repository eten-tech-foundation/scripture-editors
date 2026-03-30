// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $createImmutableNoteCallerNode,
  $createImmutableVerseNode,
  ImmutableVerseNode,
} from "../../nodes/usj";
import {
  $findThisVerse,
  $resolveVerseNode,
  $selectNextVerse,
  $selectPreviousVerse,
} from "../../nodes/usj/node-react.utils";
import { getDefaultViewOptions } from "../../views/view-options.utils";
import { ArrowNavigationPlugin } from "./ArrowNavigationPlugin";
import { TextDirectionPlugin } from "./TextDirectionPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import {
  $createLineBreakNode,
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  LineBreakNode,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createImpliedParaNode,
  $createImmutableChapterNode,
  $createNoteNode,
  $createParaNode,
  ImpliedParaNode,
  ImmutableChapterNode,
  ParaNode,
} from "shared";

describe("Note collapsed", () => {
  describe("LTR forward direction", () => {
    it("should move over note when moving forward from note start", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      });
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });

    it("should move over note when moving forward from note start in implied para", async () => {
      let para: ImpliedParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createImpliedParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      });
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });

    it("should move over note when moving forward from note start when note is at end of para", async () => {
      let para1: ParaNode;
      let note1LastText: TextNode;
      let para2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para1 = $createParaNode();
        note1LastText = $createTextNode("note1 text");
        para2Text = $createTextNode("p2 text");
        $getRoot().append(
          para1.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1LastText),
            ),
          ),
          $createParaNode().append(para2Text),
        );
      });
      updateSelection(editor, para1!, 1);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para2Text!, 0);
      });
    });

    it("should not move over note when moving forward from note start when nothing is after note", async () => {
      let para: ParaNode;
      let note1LastText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        note1LastText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1LastText),
            ),
          ),
        );
      });
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 1);
      });
    });
  });

  describe("RTL forward direction", () => {
    it("should move over note when moving forward from note start", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      }, "rtl");
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });

    it("should move over note when moving forward from note start in implied para", async () => {
      let para: ImpliedParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createImpliedParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      }, "rtl");
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });

    it("should move over note when moving forward from note start when note is at end of para", async () => {
      let para1: ParaNode;
      let note1LastText: TextNode;
      let para2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para1 = $createParaNode();
        note1LastText = $createTextNode("note1 text");
        para2Text = $createTextNode("p2 text");
        $getRoot().append(
          para1.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1LastText),
            ),
          ),
          $createParaNode().append(para2Text),
        );
      }, "rtl");
      updateSelection(editor, para1!, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para2Text!, 0);
      });
    });

    it("should not move over note when moving forward from note start when nothing is after note", async () => {
      let para: ParaNode;
      let note1LastText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        note1LastText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1LastText),
            ),
          ),
        );
      }, "rtl");
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 1);
      });
    });
  });

  describe("LTR backward direction", () => {
    it("should move to start of note when moving backward from text after note", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      });
      updateSelection(editor, v1Text!, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 1);
      });
    });
  });

  describe("RTL backward direction", () => {
    it("should move to start of note when moving backward from text after note", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+").append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createTextNode("note1 text")),
            ),
            v1Text,
          ),
        );
      }, "rtl");
      updateSelection(editor, v1Text!, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 1);
      });
    });
  });
});

describe("Arrow up/down verse navigation", () => {
  describe("verses in separate paras", () => {
    it("moves to next verse when pressing ArrowDown", async () => {
      let v1Text: TextNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("verse1 text ");
        v2Text = $createTextNode("verse2 text ");
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), v1Text),
          $createParaNode().append($createImmutableVerseNode("2"), v2Text),
        );
      });
      updateSelection(editor, v1Text!, 0);

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2Text!, 0);
      });
    });

    it("moves to previous verse when pressing ArrowUp", async () => {
      let v1Text: TextNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("verse1 text ");
        v2Text = $createTextNode("verse2 text ");
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), v1Text),
          $createParaNode().append($createImmutableVerseNode("2"), v2Text),
        );
      });
      updateSelection(editor, v2Text!, 0);

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });
  });

  describe("verses in same para", () => {
    it("moves to next verse when pressing ArrowDown", async () => {
      let v1Text: TextNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("v1 ");
        v2Text = $createTextNode("v2 ");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            v1Text,
            $createImmutableVerseNode("2"),
            v2Text,
          ),
        );
      });
      updateSelection(editor, v1Text!, 0);

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2Text!, 0);
      });
    });

    it("moves to previous verse when pressing ArrowUp", async () => {
      let v1Text: TextNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("v1 ");
        v2Text = $createTextNode("v2 ");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            v1Text,
            $createImmutableVerseNode("2"),
            v2Text,
          ),
        );
      });
      updateSelection(editor, v2Text!, 0);

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });
  });

  describe("$selectNextVerse() / $selectPreviousVerse() / $resolveVerseNode()", () => {
    it("ArrowDown: WEB-style empty paras (linebreak + verse), element selection on para resolves to this verse and advances to the next", () => {
      let verseTwoParagraphKey: string;
      const { editor } = createBasicTestEnvironment(
        [ImmutableChapterNode, ParaNode, ImmutableVerseNode, LineBreakNode],
        () => {
          const verseTwoParagraph = $createParaNode("q1").append(
            $createLineBreakNode(),
            $createImmutableVerseNode("2"),
          );
          $getRoot().append(
            $createImmutableChapterNode("1"),
            $createParaNode("ms1").append($createTextNode("BOOK 1")),
            $createParaNode("q1").append($createLineBreakNode(), $createImmutableVerseNode("1")),
            verseTwoParagraph,
            $createParaNode("q1").append($createLineBreakNode(), $createImmutableVerseNode("3")),
          );
          verseTwoParagraphKey = verseTwoParagraph.getKey();
        },
      );

      editor.update(
        () => {
          const selection = $createRangeSelection();
          selection.anchor = $createPoint(verseTwoParagraphKey, 2, "element");
          selection.focus = $createPoint(verseTwoParagraphKey, 2, "element");
          $setSelection(selection);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const verseTwoParagraph = $getNodeByKey(verseTwoParagraphKey);
        if (!verseTwoParagraph) throw new Error("verse-two paragraph missing");

        expect($findThisVerse(verseTwoParagraph)?.getNumber()).toBe("1");

        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected range selection");
        expect($resolveVerseNode(verseTwoParagraph, selection)?.getNumber()).toBe("2");
      });

      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("expected range selection");
          expect($selectNextVerse(selection)).toBe(true);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const after = $getSelection();
        if (!$isRangeSelection(after)) throw new Error("expected range selection after next verse");
        expect($resolveVerseNode(after.anchor.getNode(), after)?.getNumber()).toBe("3");
      });
    });

    it("ArrowUp: same structure resolves current verse and moves to the previous verse", () => {
      let verseTwoParagraphKey: string;
      const { editor } = createBasicTestEnvironment(
        [ImmutableChapterNode, ParaNode, ImmutableVerseNode, LineBreakNode],
        () => {
          const verseTwoParagraph = $createParaNode("q1").append(
            $createLineBreakNode(),
            $createImmutableVerseNode("2"),
          );
          $getRoot().append(
            $createImmutableChapterNode("1"),
            $createParaNode("ms1").append($createTextNode("BOOK 1")),
            $createParaNode("q1").append($createLineBreakNode(), $createImmutableVerseNode("1")),
            verseTwoParagraph,
          );
          verseTwoParagraphKey = verseTwoParagraph.getKey();
        },
      );

      editor.update(
        () => {
          const selection = $createRangeSelection();
          selection.anchor = $createPoint(verseTwoParagraphKey, 2, "element");
          selection.focus = $createPoint(verseTwoParagraphKey, 2, "element");
          $setSelection(selection);
        },
        { discrete: true },
      );

      editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("expected range selection");
          expect($selectPreviousVerse(selection)).toBe(true);
        },
        { discrete: true },
      );

      editor.getEditorState().read(() => {
        const after = $getSelection();
        if (!$isRangeSelection(after))
          throw new Error("expected range selection after previous verse");
        expect($resolveVerseNode(after.anchor.getNode(), after)?.getNumber()).toBe("1");
      });
    });
  });
});

// These tests are skipped because they are flaky. Running together several fail (but which ones
// fail varies) but just about always pass when run individually.
describe("Note expanded", () => {
  const isCollapsed = false;
  // Wait for DOM updates to complete for expanded notes
  const domUpdateDelayMS = 0;

  describe("LTR forward direction", () => {
    it("should move into note when moving forward from note start", async () => {
      let para: ParaNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      });
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowRight", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });

    it("should move into note when moving forward from node before note", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            v1Text,
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      });
      updateSelection(editor, v1Text!);

      await pressKey(editor, "ArrowRight", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });

    it("should move into note when moving forward from note start in implied para", async () => {
      let para: ImpliedParaNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createImpliedParaNode();
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      });
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowRight", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });

    it("should move into note when moving forward from node before note", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            v1Text,
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      });
      updateSelection(editor, v1Text!);

      await pressKey(editor, "ArrowRight", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });
  });

  describe("RTL forward direction", () => {
    it("should move into note when moving forward from note start", async () => {
      let para: ParaNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      }, "rtl");
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowLeft", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });

    it("should move into note when moving forward from note start in implied para", async () => {
      let para: ImpliedParaNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createImpliedParaNode();
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      }, "rtl");
      updateSelection(editor, para!, 1);

      await pressKey(editor, "ArrowLeft", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });

    it("should move into note when moving forward from node before note", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      let note1FirstText: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("verse1 text ");
        note1FirstText = $createTextNode("note1 text");
        $getRoot().append(
          para.append(
            v1Text,
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(note1FirstText),
            ),
          ),
        );
      }, "rtl");
      updateSelection(editor, v1Text!);

      await pressKey(editor, "ArrowLeft", domUpdateDelayMS);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(note1FirstText!, 0);
      });
    });
  });
});

async function testEnvironment(
  $initialEditorState: () => void,
  textDirection: "ltr" | "rtl" = "ltr",
  viewOptions = getDefaultViewOptions(),
) {
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <ArrowNavigationPlugin viewOptions={viewOptions} />
      <TextDirectionPlugin textDirection={textDirection} />
    </>,
  );
}
