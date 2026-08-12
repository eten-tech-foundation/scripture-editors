// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { $expectSelectionToBe } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { $createImmutableNoteCallerNode, $createImmutableVerseNode } from "../../nodes/usj";
import { getDefaultViewOptions } from "../../views/view-options.utils";
import { ArrowNavigationPlugin, hasVisualLineBeyondCaret } from "./ArrowNavigationPlugin";
import { TextDirectionPlugin } from "./TextDirectionPlugin";
import { baseTestEnvironment, pressKey, updateSelection } from "./react-test.utils";
import { act } from "@testing-library/react";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  COMMAND_PRIORITY_NORMAL,
  KEY_DOWN_COMMAND,
  LexicalEditor,
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

describe("Milestone display run", () => {
  /**
   * Standard view's editable milestone shape: a zero-width `MilestoneNode` (a `DecoratorNode`)
   * followed by ONE `AttributeRunNode` wrapper holding its `\qt-s`…`\*` glyph pair.
   */
  async function milestoneRunEnvironment(textDirection: "ltr" | "rtl" = "ltr") {
    let precedingText: TextNode;
    let openingGlyph: MarkerNode;
    let wrapper: AttributeRunNode;
    const { editor } = await testEnvironment(() => {
      precedingText = $createTextNode("before ");
      openingGlyph = $createMarkerNode("qt-s", "opening");
      wrapper = $createAttributeRunNode("milestone").append(
        openingGlyph,
        $createMarkerNode("", "selfClosing"),
      );
      $getRoot().append(
        $createParaNode().append(
          precedingText,
          $createMilestoneNode("qt-s", "ms1"),
          wrapper,
          $createTextNode(" after"),
        ),
      );
    }, textDirection);
    return {
      editor,
      precedingText: precedingText!,
      openingGlyph: openingGlyph!,
      wrapper: wrapper!,
    };
  }

  /**
   * The same milestone with its glyphs riding LOOSE as bare following siblings — the shape before
   * the run was wrapped. Used as the parity control for which keystrokes Lexical ever hopped.
   */
  async function looseMilestoneRunEnvironment() {
    let precedingText: TextNode;
    let openingGlyph: MarkerNode;
    const { editor } = await testEnvironment(() => {
      precedingText = $createTextNode("before ");
      openingGlyph = $createMarkerNode("qt-s", "opening");
      $getRoot().append(
        $createParaNode().append(
          precedingText,
          $createMilestoneNode("qt-s", "ms1"),
          openingGlyph,
          $createMarkerNode("", "selfClosing"),
          $createTextNode(" after"),
        ),
      );
    });
    return { editor, precedingText: precedingText!, openingGlyph: openingGlyph! };
  }

  /**
   * Watches whether the plugin DECLINED a key. The listener sits at NORMAL priority — below the
   * plugin's HIGH, above Lexical's own EDITOR-level arrow handling — so it fires only on a
   * decline, and swallowing the key there keeps Lexical's native fall-through (which jsdom does
   * not implement) out of a test that is only about the claim decision.
   */
  function watchForDecline(editor: LexicalEditor) {
    const state = { declined: false };
    const unregister = editor.registerCommand(
      KEY_DOWN_COMMAND,
      () => {
        state.declined = true;
        return true;
      },
      COMMAND_PRIORITY_NORMAL,
    );
    return { state, unregister };
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

  it("should move to the end of the preceding text when moving backward from the run's first glyph", async () => {
    const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressKey(editor, "ArrowLeft");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(precedingText);
    });
  });

  it("should move to the end of the preceding text when moving backward from an element point at the wrapper's start", async () => {
    const { editor, precedingText, wrapper } = await milestoneRunEnvironment();
    updateSelection(editor, wrapper, 0);

    await pressKey(editor, "ArrowLeft");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(precedingText);
    });
  });

  // Backward is keyed on LOGICAL direction, not the physical key: in RTL, ArrowRight is backward.
  it("should move to the end of the preceding text when moving backward in RTL", async () => {
    const { editor, precedingText, openingGlyph } = await milestoneRunEnvironment("rtl");
    updateSelection(editor, openingGlyph, 0);

    await pressKey(editor, "ArrowRight");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(precedingText);
    });
  });

  it("should leave the run's leading edge to the browser when moving forward", async () => {
    const { editor, openingGlyph } = await milestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressKey(editor, "ArrowRight");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph, 0);
    });
  });

  it("should not claim a backward move from inside the glyph text", async () => {
    const { editor, openingGlyph } = await milestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 1);

    await pressKey(editor, "ArrowLeft");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph, 1);
    });
  });

  it("should not claim a backward move out of a verse's \\va run", async () => {
    let openingGlyph: MarkerNode;
    const { editor } = await testEnvironment(() => {
      openingGlyph = $createMarkerNode("va", "opening");
      $getRoot().append(
        $createParaNode().append(
          $createVerseNode("1"),
          $createAttributeRunNode("va").append(
            openingGlyph,
            $createTextNode("2"),
            $createMarkerNode("va", "closing"),
          ),
          $createTextNode("verse text"),
        ),
      );
    });
    updateSelection(editor, openingGlyph!, 0);

    await pressKey(editor, "ArrowLeft");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph!, 0);
    });
  });

  // The structural rule is the registry's, not "the owner happens to be a decorator": a wrapper is
  // a milestone's only when its own runKind says so AND a MilestoneNode sits directly before it.
  it("should not claim a backward move out of a non-milestone-kind wrapper that follows a milestone", async () => {
    let openingGlyph: MarkerNode;
    const { editor } = await testEnvironment(() => {
      openingGlyph = $createMarkerNode("va", "opening");
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("before "),
          $createMilestoneNode("qt-s", "ms1"),
          $createAttributeRunNode("va").append(
            openingGlyph,
            $createTextNode("2"),
            $createMarkerNode("va", "closing"),
          ),
          $createTextNode(" after"),
        ),
      );
    });
    updateSelection(editor, openingGlyph!, 0);

    const { state, unregister } = watchForDecline(editor);
    let declined = false;
    try {
      await pressKey(editor, "ArrowLeft");
      declined = state.declined;
    } finally {
      unregister();
    }

    expect(declined).toBe(true);
    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph!, 0);
    });
  });

  // Modified arrows are excluded from the hop because Lexical never hopped them either — before or
  // after the run was wrapped. Its keydown gate matches modifiers EXACTLY (only shift is allowed
  // through to `KEY_ARROW_LEFT_COMMAND`), so ctrl+ArrowLeft dispatches the unhandled
  // `MOVE_TO_START` and alt+ArrowLeft dispatches nothing; both reach the browser
  // un-preventDefaulted with word/line granularity. The LOOSE (pre-wrapper) case below is the
  // parity control: it shows there is no earlier behavior to restore for those keystrokes.
  it("should not hop a ctrl-modified backward move even in the pre-wrapper shape", async () => {
    const { editor, openingGlyph } = await looseMilestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressModifiedKey(editor, "ArrowLeft", { ctrlKey: true });

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph, 0);
    });
  });

  it("should hop an unmodified backward move in the pre-wrapper shape (Lexical's own decorator handling)", async () => {
    const { editor, precedingText, openingGlyph } = await looseMilestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressKey(editor, "ArrowLeft");

    editor.getEditorState().read(() => {
      $expectSelectionToBe(precedingText);
    });
  });

  it("should not claim a ctrl-modified backward move out of the run", async () => {
    const { editor, openingGlyph } = await milestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressModifiedKey(editor, "ArrowLeft", { ctrlKey: true });

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph, 0);
    });
  });

  it("should not claim an alt-modified backward move out of the run", async () => {
    const { editor, openingGlyph } = await milestoneRunEnvironment();
    updateSelection(editor, openingGlyph, 0);

    await pressModifiedKey(editor, "ArrowLeft", { altKey: true });

    editor.getEditorState().read(() => {
      $expectSelectionToBe(openingGlyph, 0);
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
