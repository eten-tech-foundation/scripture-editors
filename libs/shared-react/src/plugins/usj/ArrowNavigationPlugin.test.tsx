// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { $expectSelectionToBe } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableNoteCallerNode, $createImmutableVerseNode } from "../../nodes/usj";
import { getDefaultViewOptions, getViewOptions } from "../../views/view-options.utils";
import { STANDARD_VIEW_MODE, UNFORMATTED_VIEW_MODE } from "../../views/view-mode.model";
import { ArrowNavigationPlugin, hasVisualLineBeyondCaret } from "./ArrowNavigationPlugin";
import { TextDirectionPlugin } from "./TextDirectionPlugin";
import { baseTestEnvironment, pressKey, updateSelection } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  LineBreakNode,
  TextNode,
} from "lexical";
import {
  $createAttributeRunNode,
  $createCharNode,
  $createImmutableTypedTextNode,
  $createImpliedParaNode,
  $createImmutableChapterNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  $createVerseNode,
  AttributeRunNode,
  CharNode,
  ImpliedParaNode,
  MarkerNode,
  ParaNode,
  textTypeState,
  VerseNode,
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
      let v1Para: ParaNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Para = $createParaNode();
        v2Text = $createTextNode("verse2 text ");
        $getRoot().append(
          v1Para.append($createImmutableVerseNode("1"), $createTextNode("verse1 text ")),
          $createParaNode().append($createImmutableVerseNode("2"), v2Text),
        );
      });
      updateSelection(editor, v1Para!, 1); // element at offset 1: after ImmutableVerseNode("1")

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2Text!, 0);
      });
    });

    it("moves to previous verse when pressing ArrowUp", async () => {
      let v1Text: TextNode;
      let v2Para: ParaNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("verse1 text ");
        v2Para = $createParaNode();
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), v1Text),
          v2Para.append($createImmutableVerseNode("2"), $createTextNode("verse2 text ")),
        );
      });
      updateSelection(editor, v2Para!, 1); // element at offset 1: after ImmutableVerseNode("2")

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });
  });

  describe("verses in same para", () => {
    it("moves to next verse when pressing ArrowDown", async () => {
      let para: ParaNode;
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v2Text = $createTextNode("v2 ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            $createTextNode("v1 "),
            $createImmutableVerseNode("2"),
            v2Text,
          ),
        );
      });
      updateSelection(editor, para!, 1); // element at offset 1: after ImmutableVerseNode("1")

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v2Text!, 0);
      });
    });

    it("moves to previous verse when pressing ArrowUp", async () => {
      let para: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        para = $createParaNode();
        v1Text = $createTextNode("v1 ");
        $getRoot().append(
          para.append(
            $createImmutableVerseNode("1"),
            v1Text,
            $createImmutableVerseNode("2"),
            $createTextNode("v2 "),
          ),
        );
      });
      updateSelection(editor, para!, 3); // element at offset 3: after ImmutableVerseNode("2")

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });
  });

  describe("cursor in verse text — Lexical handles, not custom navigation", () => {
    it("does not intercept ArrowDown when cursor is mid-verse text", async () => {
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v1Text = $createTextNode("verse text");
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), v1Text),
          $createParaNode().append($createImmutableVerseNode("2"), $createTextNode("verse2 text")),
        );
      });
      updateSelection(editor, v1Text!, 5);

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        // JSDOM has no layout, so Lexical's default visual-line move does not fire.
        // Cursor stays only if the custom guard correctly returned false.
        $expectSelectionToBe(v1Text!, 5);
      });
    });

    it("does not intercept ArrowUp when cursor is mid-verse text", async () => {
      let v2Text: TextNode;
      const { editor } = await testEnvironment(() => {
        v2Text = $createTextNode("verse text");
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), $createTextNode("verse1 text")),
          $createParaNode().append($createImmutableVerseNode("2"), v2Text),
        );
      });
      updateSelection(editor, v2Text!, 5);

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        // JSDOM has no layout, so Lexical's default visual-line move does not fire.
        // Cursor stays only if the custom guard correctly returned false.
        $expectSelectionToBe(v2Text!, 5);
      });
    });
  });

  describe("WEB-style verse paragraph (linebreak + verse only, no text after verse marker)", () => {
    it("ArrowDown: element selection on the para moves to the next verse", async () => {
      let q1: ParaNode;
      let v3Text: TextNode;
      const { editor } = await testEnvironment(() => {
        q1 = $createParaNode("q1");
        v3Text = $createTextNode("verse3 ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode("ms1").append($createTextNode("BOOK 1")),
          $createParaNode("q1").append($createLineBreakNode(), $createImmutableVerseNode("1")),
          q1.append($createLineBreakNode(), $createImmutableVerseNode("2")),
          $createParaNode("q1").append(
            $createLineBreakNode(),
            $createImmutableVerseNode("3"),
            v3Text,
          ),
        );
      });
      updateSelection(editor, q1!, 2);

      await pressKey(editor, "ArrowDown");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v3Text!, 0);
      });
    });

    it("ArrowUp: element selection on the para moves to the previous verse", async () => {
      let q1: ParaNode;
      let v1Text: TextNode;
      const { editor } = await testEnvironment(() => {
        q1 = $createParaNode("q1");
        v1Text = $createTextNode("verse1 ");
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode("ms1").append($createTextNode("BOOK 1")),
          $createParaNode("q1").append(
            $createLineBreakNode(),
            $createImmutableVerseNode("1"),
            v1Text,
          ),
          q1.append($createLineBreakNode(), $createImmutableVerseNode("2")),
        );
      });
      updateSelection(editor, q1!, 2);

      await pressKey(editor, "ArrowUp");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(v1Text!, 0);
      });
    });
  });
});

// The visual-line gate (PT-4308): custom verse-jumping must yield to native single-line movement
// when the caret's verse wraps onto further lines. These exercise the pure decision directly with
// synthetic rects, since jsdom has no layout to produce real ones.
describe("hasVisualLineBeyondCaret", () => {
  const line = (top: number): { top: number; bottom: number; height: number } => ({
    top,
    bottom: top + 16,
    height: 16,
  });

  it("ArrowDown: reports a line below when the verse wraps past the caret's line", () => {
    const caret = line(100);
    const rects = [line(100), line(120), line(140)]; // caret on the first of three wrapped lines
    expect(hasVisualLineBeyondCaret(caret, rects, "down")).toBe(true);
  });

  it("ArrowDown: reports no line below when the caret is on the last visual line", () => {
    const caret = line(140);
    const rects = [line(100), line(120), line(140)];
    expect(hasVisualLineBeyondCaret(caret, rects, "down")).toBe(false);
  });

  it("ArrowUp: reports a line above when the caret is below the block's first line", () => {
    const caret = line(140);
    const rects = [line(100), line(120), line(140)];
    expect(hasVisualLineBeyondCaret(caret, rects, "up")).toBe(true);
  });

  it("ArrowUp: reports no line above when the caret is on the first visual line", () => {
    const caret = line(100);
    const rects = [line(100), line(120), line(140)];
    expect(hasVisualLineBeyondCaret(caret, rects, "up")).toBe(false);
  });

  it("treats a single-line verse as having no line beyond in either direction", () => {
    const caret = line(100);
    const rects = [line(100)];
    expect(hasVisualLineBeyondCaret(caret, rects, "down")).toBe(false);
    expect(hasVisualLineBeyondCaret(caret, rects, "up")).toBe(false);
  });

  it("cannot measure without layout (zero-height caret, e.g. jsdom) — returns false so verse-jump is kept", () => {
    const caret = { top: 0, bottom: 0, height: 0 };
    const rects = [line(100), line(120)];
    expect(hasVisualLineBeyondCaret(caret, rects, "down")).toBe(false);
  });

  it("ignores sub-pixel wobble on the caret's own line", () => {
    const caret = line(100);
    const rects = [{ top: 100.5, bottom: 116.5, height: 16 }]; // same line, sub-pixel offset
    expect(hasVisualLineBeyondCaret(caret, rects, "down")).toBe(false);
  });

  it("ignores a taller inline box on the caret's own line (verse number / note caller)", () => {
    const caret = line(100); // top 100, bottom 116
    // A raised, taller inline sharing the caret's line: it descends below the caret box but starts
    // on the same line, so it must NOT read as a wrapped line (this fails under a raw-bottom test).
    const tallerSameLineInline = { top: 94, bottom: 124, height: 30 };
    expect(hasVisualLineBeyondCaret(caret, [caret, tallerSameLineInline], "down")).toBe(false);
    expect(hasVisualLineBeyondCaret(caret, [caret, tallerSameLineInline], "up")).toBe(false);
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

// An expanded note's `\fp` span renders with a CSS-generated line break before it. The pseudo
// content has no DOM position, so the plugin must supply the two caret stops around the visual
// newline: end of the previous line, then the very start of the `\fp` span on the new line.
describe("\\fp boundary in expanded note", () => {
  const isCollapsed = false;

  describe("editable marker glyphs", () => {
    /** Expanded note: caller, `\ft` span (glyph + text), `\fp` span (glyph + text). */
    async function fpGlyphEnvironment(textDirection: "ltr" | "rtl" = "ltr") {
      let ftText: TextNode;
      let fpGlyph: MarkerNode;
      const { editor } = await testEnvironment(() => {
        ftText = $createTextNode(" footnote stuff ");
        fpGlyph = $createMarkerNode("fp");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createMarkerNode("ft"), ftText),
              $createCharNode("fp").append(fpGlyph, $createTextNode(" fp text")),
            ),
          ),
        );
      }, textDirection);
      return { editor, ftText: ftText!, fpGlyph: fpGlyph! };
    }

    it("should stop at the start of the fp glyph when moving forward from the end of the previous span", async () => {
      const { editor, ftText, fpGlyph } = await fpGlyphEnvironment();
      updateSelection(editor, ftText);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpGlyph, 0);
      });
    });

    it("should not intercept moving forward from the start of the fp glyph", async () => {
      const { editor, fpGlyph } = await fpGlyphEnvironment();
      updateSelection(editor, fpGlyph, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        // JSDOM has no native caret movement, so the caret moves only if the plugin claims the
        // key. Staying put proves the in-glyph move is left to the browser.
        $expectSelectionToBe(fpGlyph, 0);
      });
    });

    it("should move to the end of the previous span when moving backward from the start of the fp glyph", async () => {
      const { editor, ftText, fpGlyph } = await fpGlyphEnvironment();
      updateSelection(editor, fpGlyph, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });

    it("should stop at the start of the fp glyph when moving backward from after its first character", async () => {
      const { editor, fpGlyph } = await fpGlyphEnvironment();
      updateSelection(editor, fpGlyph, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpGlyph, 0);
      });
    });

    it("should not claim shift+ArrowRight at the fp boundary so range extension stays native", async () => {
      const { editor, ftText } = await fpGlyphEnvironment();
      updateSelection(editor, ftText);

      await act(async () => {
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", {
            key: "ArrowRight",
            shiftKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });

    it("should stop at the start of the fp glyph when moving forward in RTL", async () => {
      const { editor, ftText, fpGlyph } = await fpGlyphEnvironment("rtl");
      updateSelection(editor, ftText);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpGlyph, 0);
      });
    });

    it("should move to the end of the previous span when moving backward in RTL", async () => {
      const { editor, ftText, fpGlyph } = await fpGlyphEnvironment("rtl");
      updateSelection(editor, fpGlyph, 0);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });

    it("should move to the end of the previous fp span when moving backward from a following fp", async () => {
      let fp1Text: TextNode;
      let fp2Glyph: MarkerNode;
      const { editor } = await testEnvironment(() => {
        fp1Text = $createTextNode(" first paragraph ");
        fp2Glyph = $createMarkerNode("fp");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("fp").append($createMarkerNode("fp"), fp1Text),
              $createCharNode("fp").append(fp2Glyph, $createTextNode(" second paragraph ")),
            ),
          ),
        );
      });
      updateSelection(editor, fp2Glyph!, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fp1Text!);
      });
    });

    it("should not intercept at an fp inside a collapsed note", async () => {
      let ftText: TextNode;
      const { editor } = await testEnvironment(() => {
        ftText = $createTextNode(" footnote stuff ");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", true).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createMarkerNode("ft"), ftText),
              $createCharNode("fp").append($createMarkerNode("fp"), $createTextNode(" fp text")),
            ),
          ),
        );
      });
      updateSelection(editor, ftText!);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        // No visual line break renders in a collapsed note, so the move stays native.
        $expectSelectionToBe(ftText!);
      });
    });
  });

  describe("hidden marker glyphs (span starts with content text)", () => {
    /** Expanded note without glyph nodes: caller, `\ft` span (text), `\fp` span (text). */
    async function fpContentEnvironment() {
      let ftText: TextNode;
      let fpText: TextNode;
      const { editor } = await testEnvironment(() => {
        ftText = $createTextNode("footnote stuff ");
        fpText = $createTextNode("fp content");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append(ftText),
              $createCharNode("fp").append(fpText),
            ),
          ),
        );
      });
      return { editor, ftText: ftText!, fpText: fpText! };
    }

    it("should stop at the start of the fp content when moving forward from the end of the previous span", async () => {
      const { editor, ftText, fpText } = await fpContentEnvironment();
      updateSelection(editor, ftText);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpText, 0);
      });
    });

    it("should move to the end of the previous span when moving backward from the start of the fp content", async () => {
      const { editor, ftText, fpText } = await fpContentEnvironment();
      updateSelection(editor, fpText, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });
  });

  describe("non-editable marker glyphs (span starts with an immutable glyph)", () => {
    /** Expanded note in visible-marker shape: the `\fp` span opens with an immutable glyph. */
    async function fpImmutableGlyphEnvironment() {
      let ftText: TextNode;
      let fpSpan: CharNode;
      const { editor } = await testEnvironment(() => {
        ftText = $createTextNode("footnote stuff ");
        fpSpan = $createCharNode("fp");
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createNoteNode("f", "+", isCollapsed).append(
              $createImmutableNoteCallerNode("+", "note1 preview"),
              $createCharNode("ft").append($createImmutableTypedTextNode("marker", "\\ft"), ftText),
              fpSpan.append(
                $createImmutableTypedTextNode("marker", "\\fp"),
                $createTextNode("fp content"),
              ),
            ),
          ),
        );
      });
      return { editor, ftText: ftText!, fpSpan: fpSpan! };
    }

    it("should stop before the immutable fp glyph when moving forward from the end of the previous span", async () => {
      const { editor, ftText, fpSpan } = await fpImmutableGlyphEnvironment();
      updateSelection(editor, ftText);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpSpan, 0);
      });
    });

    it("should move to the end of the previous span when moving backward from before the immutable fp glyph", async () => {
      const { editor, ftText, fpSpan } = await fpImmutableGlyphEnvironment();
      updateSelection(editor, fpSpan, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });
  });
});

// One press, one visible crossing. Every shape below stacks several tree positions at a single
// screen location — a zero-width milestone anchor, a wrapper seam, a span boundary — and each used
// to cost a press that moved nothing the eye could follow. These pins are press COUNTS: one press
// must land past exactly one rendered character, and N presses back must return to the very same
// tree position.
//
// All of them run in editable-marker mode, the only mode that builds display runs and glyph text
// at all; the other views keep the browser's own traversal untouched.
describe("Visible-stop traversal (editable markers)", () => {
  const standardView = getViewOptions(STANDARD_VIEW_MODE);
  const unformattedView = getViewOptions(UNFORMATTED_VIEW_MODE);

  /** `before |\qt-s\*| after` — a milestone anchor and its display run mid-paragraph. */
  async function milestoneRunEnvironment(textDirection: "ltr" | "rtl" = "ltr") {
    let para: ParaNode;
    let precedingText: TextNode;
    let openingGlyph: MarkerNode;
    let closingGlyph: MarkerNode;
    let followingText: TextNode;
    let wrapper: AttributeRunNode;
    const { editor } = await testEnvironment(
      () => {
        precedingText = $createTextNode("before ");
        openingGlyph = $createMarkerNode("qt-s", "opening");
        closingGlyph = $createMarkerNode("", "selfClosing");
        followingText = $createTextNode(" after");
        wrapper = $createAttributeRunNode("milestone").append(openingGlyph, closingGlyph);
        para = $createParaNode();
        $getRoot().append(
          para.append(precedingText, $createMilestoneNode("qt-s", "ms1"), wrapper, followingText),
        );
      },
      textDirection,
      standardView,
    );
    return {
      editor,
      para: para!,
      precedingText: precedingText!,
      openingGlyph: openingGlyph!,
      closingGlyph: closingGlyph!,
      followingText: followingText!,
      wrapper: wrapper!,
    };
  }

  /**
   * The caret's LOCATION, reporting an element point as the equivalent text point where one exists.
   * A position between two nodes has two spellings — the element point between them and offset 0 of
   * the node after — and Lexical settles on one or the other depending on when its own selection
   * reconciliation runs. They are the same place, so pins about WHERE the caret is compare this.
   */
  function locationOf(editor: LexicalEditor): string {
    let location = "";
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection");
      const { anchor } = selection;
      const node = anchor.getNode();
      if (anchor.type === "element" && $isElementNode(node)) {
        const child = node.getChildAtIndex(anchor.offset);
        if ($isTextNode(child)) {
          location = `text:${child.getKey()}@0`;
          return;
        }
      }
      location = `${anchor.type}:${anchor.key}@${anchor.offset}`;
    });
    return location;
  }

  /** Reads the caret as a comparable tuple, for round-trip closure. */
  function caretOf(editor: LexicalEditor): string {
    let caret = "";
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection");
      const { anchor } = selection;
      caret = `${anchor.type}:${anchor.key}@${anchor.offset}`;
    });
    return caret;
  }

  /** Presses `key` with modifiers held; `pressKey` covers the unmodified case. */
  async function pressModifiedKey(
    editor: LexicalEditor,
    key: string,
    modifiers: Pick<KeyboardEventInit, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">,
  ) {
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }),
      );
    });
  }

  describe("a milestone run's leading seam", () => {
    it("crosses the opening glyph's backslash in ONE press forward", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment();
      updateSelection(editor, precedingText);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(openingGlyph, 1);
      });
    });

    it("crosses back out of the run in ONE press backward", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment();
      updateSelection(editor, openingGlyph, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(precedingText);
      });
    });

    // A click can still park the caret on one of the stacked positions; the next press normalizes
    // it rather than moving underneath the user, so it still crosses exactly one character.
    it("crosses one character backward from an element point at the wrapper's start", async () => {
      const { editor, precedingText, wrapper } = await milestoneRunEnvironment();
      updateSelection(editor, wrapper, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(precedingText, "before ".length - 1);
      });
    });

    it("mirrors in RTL, where ArrowLeft is forward", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment("rtl");
      updateSelection(editor, precedingText);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(openingGlyph, 1);
      });
    });
  });

  /** `\add word\add*\qt-s\*` — the `*`→`\` seam the maintainer measured at three presses. */
  async function spanThenMilestoneEnvironment() {
    let addCloser: MarkerNode;
    let openingGlyph: MarkerNode;
    const { editor } = await testEnvironment(
      () => {
        addCloser = $createMarkerNode("add", "closing");
        openingGlyph = $createMarkerNode("qt-s", "opening");
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("x "),
            $createCharNode("add").append(
              $createMarkerNode("add", "opening"),
              $createTextNode("word"),
              addCloser,
            ),
            $createMilestoneNode("qt-s", "ms1"),
            $createAttributeRunNode("milestone").append(
              openingGlyph,
              $createMarkerNode("", "selfClosing"),
            ),
            $createTextNode(" after"),
          ),
        );
      },
      "ltr",
      standardView,
    );
    return { editor, addCloser: addCloser!, openingGlyph: openingGlyph! };
  }

  describe("a span boundary that meets a milestone", () => {
    it("crosses the seam in ONE press forward", async () => {
      const { editor, addCloser, openingGlyph } = await spanThenMilestoneEnvironment();
      updateSelection(editor, addCloser);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(openingGlyph, 1);
      });
    });

    it("crosses the seam in ONE press backward", async () => {
      const { editor, addCloser, openingGlyph } = await spanThenMilestoneEnvironment();
      updateSelection(editor, openingGlyph, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(addCloser);
      });
    });
  });

  /** `\qt-s\*\qt-e\*` — two zero-width anchors with no text between the runs. */
  async function adjacentMilestonesEnvironment() {
    let firstCloser: MarkerNode;
    let secondOpener: MarkerNode;
    const { editor } = await testEnvironment(
      () => {
        firstCloser = $createMarkerNode("", "selfClosing");
        secondOpener = $createMarkerNode("qt-e", "opening");
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("x "),
            $createMilestoneNode("qt-s", "ms1"),
            $createAttributeRunNode("milestone").append(
              $createMarkerNode("qt-s", "opening"),
              firstCloser,
            ),
            $createMilestoneNode("qt-e", undefined, "ms1"),
            $createAttributeRunNode("milestone").append(
              secondOpener,
              $createMarkerNode("", "selfClosing"),
            ),
            $createTextNode(" after"),
          ),
        );
      },
      "ltr",
      standardView,
    );
    return { editor, firstCloser: firstCloser!, secondOpener: secondOpener! };
  }

  describe("two milestones back to back", () => {
    it("crosses into the next run in ONE press forward", async () => {
      const { editor, firstCloser, secondOpener } = await adjacentMilestonesEnvironment();
      updateSelection(editor, firstCloser);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondOpener, 1);
      });
    });

    it("crosses back into the previous run in ONE press backward", async () => {
      const { editor, firstCloser, secondOpener } = await adjacentMilestonesEnvironment();
      updateSelection(editor, secondOpener, 1);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(firstCloser);
      });
    });
  });

  // The rule is not milestone-specific: every display run's seams normalize the same way.
  describe("other display runs", () => {
    it("crosses into a verse's \\va run in ONE press", async () => {
      let verse: VerseNode;
      let openingGlyph: MarkerNode;
      const { editor } = await testEnvironment(
        () => {
          verse = $createVerseNode("1");
          openingGlyph = $createMarkerNode("va", "opening");
          $getRoot().append(
            $createParaNode().append(
              verse,
              $createAttributeRunNode("va").append(
                openingGlyph,
                $createTextNode("2"),
                $createMarkerNode("va", "closing"),
              ),
              $createTextNode("verse text"),
            ),
          );
        },
        "ltr",
        standardView,
      );
      updateSelection(editor, verse!);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(openingGlyph!, 1);
      });
    });

    it("crosses into a char span's own |attribute run in ONE press", async () => {
      let word: TextNode;
      let attribute: TextNode;
      const { editor } = await testEnvironment(
        () => {
          word = $createTextNode("word");
          attribute = $createTextNode('|lemma="x"');
          $getRoot().append(
            $createParaNode().append(
              $createTextNode("x "),
              $createCharNode("w").append(
                $createMarkerNode("w", "opening"),
                word,
                attribute,
                $createMarkerNode("w", "closing"),
              ),
              $createTextNode(" after"),
            ),
          );
          $setState(attribute, textTypeState, "attribute");
        },
        "ltr",
        standardView,
      );
      updateSelection(editor, word!);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(attribute!, 1);
      });
    });

    it("crosses from an expanded note's last text into a following milestone run in ONE press", async () => {
      let noteText: TextNode;
      let openingGlyph: MarkerNode;
      const { editor } = await testEnvironment(
        () => {
          noteText = $createTextNode("note text");
          openingGlyph = $createMarkerNode("qt-s", "opening");
          $getRoot().append(
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createNoteNode("f", "+").append(
                $createImmutableNoteCallerNode("+", "preview"),
                $createCharNode("ft").append(noteText),
              ),
              $createMilestoneNode("qt-s", "ms1"),
              $createAttributeRunNode("milestone").append(
                openingGlyph,
                $createMarkerNode("", "selfClosing"),
              ),
              $createTextNode(" after"),
            ),
          );
        },
        "ltr",
        unformattedView,
      );
      updateSelection(editor, noteText!);

      await pressKey(editor, "ArrowRight");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(openingGlyph!, 1);
      });
    });
  });

  // The unformatted view is editable-marker too, so the normalizer runs there — and it is the one
  // view whose paragraphs carry real line breaks: with `hasSpacing: false` the adaptor emits a
  // `LineBreakNode` before EVERY verse (usj-editor.adaptor.ts). A line break ends its line and its
  // two sides are genuinely different places, so it must be crossed like a glyph. Classified
  // invisible it would be stepped over, taking the line-start and line-end positions with it.
  describe("a line break before a verse (unformatted view)", () => {
    async function lineBrokenEnvironment() {
      let firstLine: TextNode;
      let verse: VerseNode;
      let lineBreak: LineBreakNode;
      const { editor } = await testEnvironment(
        () => {
          firstLine = $createTextNode("first line");
          lineBreak = $createLineBreakNode();
          verse = $createVerseNode("2");
          $getRoot().append(
            $createParaNode().append(firstLine, lineBreak, verse, $createTextNode("second line")),
          );
        },
        "ltr",
        unformattedView,
      );
      return { editor, firstLine: firstLine!, verse: verse!, lineBreak: lineBreak! };
    }

    // The stop just past the break is the new line's start, before the verse number — resolved as
    // the element point after the break, which is the same place as offset 0 of the verse.
    it("crosses the break in ONE press forward, resting at the start of the new line", async () => {
      const { editor, firstLine, verse } = await lineBrokenEnvironment();
      updateSelection(editor, firstLine);

      await pressKey(editor, "ArrowRight");

      expect(locationOf(editor)).toBe(`text:${verse.getKey()}@0`);
    });

    it("crosses the break in ONE press backward, resting at the end of the previous line", async () => {
      const { editor, firstLine, verse } = await lineBrokenEnvironment();
      updateSelection(editor, verse, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(firstLine);
      });
    });

    // Classified invisible, the break would be stepped over: forward would land one grapheme inside
    // the next line and backward before the previous line's last character, losing both line-edge
    // positions and breaking closure.
    it("does not skip past the break's far side in either direction", async () => {
      const { editor, firstLine, verse } = await lineBrokenEnvironment();
      updateSelection(editor, firstLine);
      const start = locationOf(editor);

      await pressKey(editor, "ArrowRight");
      const afterBreak = locationOf(editor);
      await pressKey(editor, "ArrowLeft");

      expect(afterBreak).toBe(`text:${verse.getKey()}@0`);
      expect(locationOf(editor)).toBe(start);
    });
  });

  // Two seams the normalizer must NOT own, both in the unformatted view's expanded notes.
  describe("seams other handlers own", () => {
    /** An expanded note whose `\fp` span carries the CSS-only line break. */
    async function expandedNoteEnvironment() {
      let ftText: TextNode;
      let fpSpan: CharNode;
      let fpContent: TextNode;
      const { editor } = await testEnvironment(
        () => {
          ftText = $createTextNode("footnote stuff ");
          fpSpan = $createCharNode("fp");
          fpContent = $createTextNode("fp content");
          $getRoot().append(
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createNoteNode("f", "+", false).append(
                $createImmutableNoteCallerNode("+", "preview"),
                $createCharNode("ft").append(ftText),
                fpSpan.append(fpContent),
              ),
            ),
          );
        },
        "ltr",
        unformattedView,
      );
      return { editor, ftText: ftText!, fpSpan: fpSpan!, fpContent: fpContent! };
    }

    // The `\fp` break is a CSS pseudo-element with no node behind it, so no tree classifier can see
    // that a line ended there. The fp handlers run first and keep it; the normalizer never sees it.
    it("leaves the CSS-only \\fp line break to the fp handlers", async () => {
      const { editor, ftText, fpContent } = await expandedNoteEnvironment();
      updateSelection(editor, ftText);

      await pressKey(editor, "ArrowRight");

      // `$handleForwardFpNavigation`'s own landing — the head of the span's first text, a stop the
      // one-crossing rule would not have rested on.
      editor.getEditorState().read(() => {
        $expectSelectionToBe(fpContent, 0);
      });
    });

    it("leaves the backward \\fp hop to the fp handlers", async () => {
      const { editor, ftText, fpSpan } = await expandedNoteEnvironment();
      updateSelection(editor, fpSpan, 0);

      await pressKey(editor, "ArrowLeft");

      editor.getEditorState().read(() => {
        $expectSelectionToBe(ftText);
      });
    });

    // The note handlers get first refusal, and where they claim, their landings stand — element
    // points the one-crossing rule would never come to rest on. Characterized here in
    // editable-marker mode, since the note pins above all run in the formatted view.
    it("leaves a collapsed note's boundary to the note handlers", async () => {
      let para: ParaNode;
      let afterNote: TextNode;
      const { editor } = await testEnvironment(
        () => {
          afterNote = $createTextNode("verse text");
          para = $createParaNode();
          $getRoot().append(
            para.append(
              $createImmutableVerseNode("1"),
              $createNoteNode("f", "+", true).append(
                $createImmutableNoteCallerNode("+", "preview"),
                $createCharNode("ft").append($createTextNode("note text")),
              ),
              afterNote,
            ),
          );
        },
        "ltr",
        standardView,
      );
      updateSelection(editor, afterNote!, 0);

      await pressKey(editor, "ArrowLeft");

      // `$handleBackwardNavigation`'s collapsed-note branch: an element point before the note.
      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 1);
      });
    });
  });

  describe("closure and containment", () => {
    // Where several tree positions share one screen location only ONE is a resting place, so a seam
    // crossed one way and back returns to the identical tree position — same node, same offset,
    // same point type. Closure across the seams is what canonicalization buys and what was broken:
    // before it, crossing out of a run and back landed on the run's own glyph instead of the text.
    //
    // Presses that stay INSIDE a text node are deliberately left to the browser (its grapheme and
    // bidi rules beat a tree walk), and jsdom implements no native `Selection.modify`, so a longer
    // N-out/N-back walk cannot be driven here. Each seam is therefore closed on its own, across
    // every shape that stacks positions.
    it("returns to the identical position when each seam is crossed out and back", async () => {
      const milestone = await milestoneRunEnvironment();
      const span = await spanThenMilestoneEnvironment();
      const adjacent = await adjacentMilestonesEnvironment();
      const seams: [string, LexicalEditor, LexicalNode, number][] = [
        ["milestone run leading seam", milestone.editor, milestone.precedingText, "before ".length],
        ["span-to-milestone seam", span.editor, span.addCloser, "\\add*".length],
        ["milestone-to-milestone seam", adjacent.editor, adjacent.firstCloser, "\\*".length],
      ];

      for (const [seam, editor, node, offset] of seams) {
        updateSelection(editor, node, offset);
        const start = caretOf(editor);

        await pressKey(editor, "ArrowRight");
        const crossed = caretOf(editor);
        await pressKey(editor, "ArrowLeft");

        expect(crossed, `${seam} did not move`).not.toBe(start);
        expect(caretOf(editor), `${seam} did not close`).toBe(start);
      }
    });

    // The stacked positions include element points on the PARAGRAPH, which render at the line's
    // left margin rather than at the seam — landing on one flashed the caret across the screen. No
    // press may come to rest there, from any of the positions a click can leave the caret on.
    // (Scoped to THESE run-seam shapes: after a LineBreakNode the paragraph element point renders
    // at the next line's start, not the margin, and the line-break pins deliberately rest there.)
    it("never rests on a paragraph element point", async () => {
      const starts: ["preceding text" | "glyph" | "wrapper", number, string][] = [
        ["preceding text", "before ".length, "ArrowRight"],
        ["glyph", 1, "ArrowLeft"],
        ["glyph", 0, "ArrowLeft"],
        ["wrapper", 0, "ArrowLeft"],
      ];

      for (const [from, offset, key] of starts) {
        // A fresh editor per start: re-seeding a selection on a mounted one drives Lexical's
        // scroll-into-view, which jsdom cannot measure.
        const { editor, para, precedingText, openingGlyph, wrapper } =
          await milestoneRunEnvironment();
        const node =
          from === "preceding text" ? precedingText : from === "glyph" ? openingGlyph : wrapper;
        updateSelection(editor, node, offset);

        await pressKey(editor, key);

        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error("no range selection");
          expect(selection.anchor.key, `${key} from ${from}@${offset}`).not.toBe(para.getKey());
        });
      }
    });

    it("leaves modified arrows alone", async () => {
      for (const modifiers of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }]) {
        const { editor, openingGlyph } = await milestoneRunEnvironment();
        updateSelection(editor, openingGlyph, 1);

        await pressModifiedKey(editor, "ArrowLeft", modifiers);

        editor.getEditorState().read(() => {
          $expectSelectionToBe(openingGlyph, 1);
        });
      }
    });

    // Outside editable-marker mode there are no display runs or glyph text to stack positions, so
    // the browser's own traversal is left in place.
    it("does not normalize outside editable-marker mode", async () => {
      let para: ParaNode;
      let precedingText: TextNode;
      const { editor } = await testEnvironment(() => {
        precedingText = $createTextNode("before ");
        para = $createParaNode();
        $getRoot().append(
          para.append(
            precedingText,
            $createMilestoneNode("qt-s", "ms1"),
            $createAttributeRunNode("milestone").append(
              $createMarkerNode("qt-s", "opening"),
              $createMarkerNode("", "selfClosing"),
            ),
            $createTextNode(" after"),
          ),
        );
      });
      updateSelection(editor, precedingText!);

      await pressKey(editor, "ArrowRight");

      // Lexical's own handling, unchanged: it resolves the move onto the milestone anchor and stops
      // on the paragraph element point before the wrapper — the invisible stop the normalizer
      // removes in editable-marker mode, left in place here.
      editor.getEditorState().read(() => {
        $expectSelectionToBe(para!, 2);
      });
    });
  });

  // Shift-arrows grow a selection by the same stops the caret walks: the focus moves one rendered
  // position, the anchor never does. Leftward out of a run this also lifts a recorded stall — an
  // extend across the zero-width milestone anchor was handed to the browser, which would not make
  // it, exactly as a collapsed move was not.
  describe("shift-extension", () => {
    /** The selection as `anchor -> focus`, so a pin can say the anchor held still. */
    function rangeOf(editor: LexicalEditor): string {
      let range = "";
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection");
        const { anchor, focus } = selection;
        range = `${anchor.type}:${anchor.key}@${anchor.offset} -> ${focus.type}:${focus.key}@${focus.offset}`;
      });
      return range;
    }

    it("extends the focus into a run in one press, leaving the anchor put", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment();
      updateSelection(editor, precedingText);

      await pressModifiedKey(editor, "ArrowRight", { shiftKey: true });

      expect(rangeOf(editor)).toBe(
        `text:${precedingText.getKey()}@${"before ".length} -> text:${openingGlyph.getKey()}@1`,
      );
    });

    it("extends the focus out of a run leftward in one press, leaving the anchor put", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment();
      updateSelection(editor, openingGlyph, 1);

      await pressModifiedKey(editor, "ArrowLeft", { shiftKey: true });

      expect(rangeOf(editor)).toBe(
        `text:${openingGlyph.getKey()}@1 -> text:${precedingText.getKey()}@${"before ".length}`,
      );
    });

    it("mirrors in RTL, where shift+ArrowLeft extends forward", async () => {
      const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment("rtl");
      updateSelection(editor, precedingText);

      await pressModifiedKey(editor, "ArrowLeft", { shiftKey: true });

      expect(rangeOf(editor)).toBe(
        `text:${precedingText.getKey()}@${"before ".length} -> text:${openingGlyph.getKey()}@1`,
      );
    });

    it("keeps the anchor put while the focus crosses a seam and comes back", async () => {
      const { editor, precedingText } = await milestoneRunEnvironment();
      updateSelection(editor, precedingText);
      const collapsed = rangeOf(editor);

      await pressModifiedKey(editor, "ArrowRight", { shiftKey: true });
      const extended = rangeOf(editor);
      await pressModifiedKey(editor, "ArrowLeft", { shiftKey: true });

      expect(extended).not.toBe(collapsed);
      expect(rangeOf(editor)).toBe(collapsed);
    });

    it("leaves ctrl- and alt-modified shift arrows alone", async () => {
      for (const modifiers of [
        { shiftKey: true, ctrlKey: true },
        { shiftKey: true, altKey: true },
      ]) {
        const { editor, openingGlyph } = await milestoneRunEnvironment();
        updateSelection(editor, openingGlyph, 1);

        await pressModifiedKey(editor, "ArrowLeft", modifiers);

        editor.getEditorState().read(() => {
          $expectSelectionToBe(openingGlyph, 1);
        });
      }
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
