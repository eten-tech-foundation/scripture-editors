// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  updateSelection,
} from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableNoteCallerNode, $createImmutableVerseNode } from "../../nodes/usj";
import { getDefaultViewOptions } from "../../views/view-options.utils";
import { ArrowNavigationPlugin } from "./ArrowNavigationPlugin";
import { TextDirectionPlugin } from "./TextDirectionPlugin";
import { baseTestEnvironment, pressKey } from "./react-test.utils";
import { $createTextNode, $getRoot, TextNode } from "lexical";
import {
  $createCharNode,
  $createImpliedParaNode,
  $createNoteNode,
  $createParaNode,
  ImpliedParaNode,
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
