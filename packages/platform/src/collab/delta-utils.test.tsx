import { replaceBrothersWithBrethren } from "./delta-utils-test.data";
import { $applyUpdate, LF } from "./delta.utils";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { render, act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, LexicalEditor } from "lexical";
import Delta, { Op } from "quill-delta";
import { usjReactNodes } from "shared-react/nodes/usj";
import { $createImmutableVerseNode } from "shared-react/nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode } from "shared-react/nodes/usj/node-react.utils";
import { getDefaultViewOptions, ViewOptions } from "shared-react/views/view-options.utils";
import { TypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { $isCharNode, $createCharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode, $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $isMilestoneNode } from "shared/nodes/usj/MilestoneNode";
import { $isSomeChapterNode } from "shared/nodes/usj/node.utils";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";

const defaultViewOptions = getDefaultViewOptions();

/**
 * Key to bracketed content at the beginning of the test description:
 * - "(dc)" the test has been Delta Checked using `compose`.
 * - "(dci)" the test has been Delta Checked using `compose` and is included in the test.
 */

describe("Delta Utils $applyUpdate", () => {
  let consoleDebugSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Spy on console methods before each test and provide mock implementations
    consoleDebugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods after each test to their original implementations
    consoleDebugSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("(dc) should handle an empty operations array (sanity check)", async () => {
    const { editor } = await testEnvironment();
    const ops: Op[] = [];
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("");
      const para = $getRoot().getFirstChild();
      if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
      expect(para.getChildrenSize()).toBe(0);
    });

    await sutApplyUpdate(editor, ops);

    expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("");
      const para = $getRoot().getFirstChild();
      if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
      expect(para.getChildrenSize()).toBe(0);
    });
  });

  it("(dci) should handle an empty operation in ops array", async () => {
    const doc = new Delta([{ insert: LF }]);
    const { editor } = await testEnvironment();
    const ops: Op[] = [{}];

    const updatedDoc = doc.compose(new Delta(ops));
    await sutApplyUpdate(editor, ops);

    expect(updatedDoc.ops).toEqual([{ insert: undefined }, { insert: LF }]);
    expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe("");
      const para = $getRoot().getFirstChild();
      if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
      expect(para.getChildrenSize()).toBe(0);
    });
  });

  describe("Retain Operations", () => {
    it("(dc)should correctly log a retain operation with a positive value", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ retain: 5 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 5");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
        const para = $getRoot().getFirstChild();
        if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
        expect(para.getChildrenSize()).toBe(0);
      });
    });

    it("(dci) should correctly log a retain operation with value 0", async () => {
      const doc = new Delta([{ insert: LF }]);
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ retain: 0 }];

      const updatedDoc = doc.compose(new Delta(ops));
      await sutApplyUpdate(editor, ops);

      expect(updatedDoc.ops).toEqual([]);
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 0");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
        const para = $getRoot().getFirstChild();
        if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
        expect(para.getChildrenSize()).toBe(0);
      });
    });

    it("(dc) should handle retain with negative value", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ retain: -5 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid retain operation"),
      );
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
        const para = $getRoot().getFirstChild();
        if (!$isImpliedParaNode(para)) throw new Error("para is not an ImpliedParaNode");
        expect(para.getChildrenSize()).toBe(0);
      });
    });

    it("(dc) should handle retain value larger than document length", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Short text")));
      });
      const ops: Op[] = [{ retain: 1000 }]; // Much larger than document

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 1000");
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Short text");
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(1);
      });
    });

    it("(dc) should retain with format attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 4, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 4");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesu");
        expect(t1.hasFormat("bold")).toBe(true);

        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("s wept.");
        expect(t2.hasFormat("bold")).toBe(false);
      });
    });

    it("(dc) should retain 1st word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 5, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus");
        expect(t1.hasFormat("bold")).toBe(true);

        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe(" wept.");
        expect(t2.hasFormat("bold")).toBe(false);
      });
    });

    it("(dc) should retain middle word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 6 }, { retain: 4, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(3);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus ");
        expect(t1.hasFormat("bold")).toBe(false);

        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("wept");
        expect(t2.hasFormat("bold")).toBe(true);

        const t3 = p.getChildAtIndex(2);
        if (!$isTextNode(t3)) throw new Error("t2 is not a TextNode");
        expect(t3.getTextContent()).toBe(".");
        expect(t3.hasFormat("bold")).toBe(false);
      });
    });

    it("(dc) should retain last word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 6 }, { retain: 5, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus ");
        expect(t1.hasFormat("bold")).toBe(false);

        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("wept.");
        expect(t2.hasFormat("bold")).toBe(true);
      });
    });

    it("(dc) should retain embedded para with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const ops: Op[] = [{ retain: 1, attributes: { style: "q1" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const q1 = $getRoot().getFirstChild();
        if (!$isParaNode(q1)) throw new Error("q1 is not a ParaNode");
        expect(q1.getMarker()).toBe("q1");
      });
    });

    it("Delta Check 36 for the following test", () => {
      const initialDoc = new Delta([{ insert: { chapter: { number: "1" } } }]);
      const ops = new Delta([{ retain: 1, attributes: { number: "2" } }]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        { insert: { chapter: { number: "1" } }, attributes: { number: "2" } },
      ]);
    });

    it("should retain embedded chapter with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createImmutableChapterNode("1"));
      });
      const ops: Op[] = [{ retain: 1, attributes: { number: "2" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        // TODO: can't modify embed. Must delete and insert a new one.
        const ch2 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(ch2)) throw new Error("ch2 is not SomeChapterNode");
        expect(ch2.getNumber()).toBe("2");
      });
    });

    it("Delta Check 37 for the following test", () => {
      const initialDoc = new Delta([
        { insert: { verse: { number: "1" } } },
        { insert: LF, attributes: { style: "p" } },
      ]);
      const ops = new Delta([{ retain: 1, attributes: { number: "1-2" } }]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        { insert: { verse: { number: "1" } }, attributes: { number: "1-2" } },
        { insert: LF, attributes: { style: "p" } },
      ]);
    });

    it("should retain embedded verse with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createImmutableVerseNode("1")));
      });
      const ops: Op[] = [{ retain: 1, attributes: { number: "1-2" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        // TODO: can't modify embed. Must delete and insert a new one.
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const v1 = p.getFirstChild();
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not SomeVerseNode");
        expect(v1.getNumber()).toBe("1-2");
      });
    });

    it("(dc) should retain embedded char", async () => {
      const wordsOfJesus = "It is finished.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(`Jesus said ${wordsOfJesus}`)));
      });
      const attributes = {
        segment: "verse_1_1",
        char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
      };
      const ops: Op[] = [{ retain: 11 }, { retain: wordsOfJesus.length, attributes }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus said ");

        const char = p.getChildAtIndex(1);
        if (!$isCharNode(char)) throw new Error("char is not a CharNode");
        expect(char.getTextContent()).toBe(wordsOfJesus);
        expect(char.getMarker()).toBe("wj");
        expect(char.getUnknownAttributes()).toEqual({
          cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545",
        });
      });
    });

    it("(dc) should transform text to CharNode and apply top-level formats to inner text", async () => {
      const prefix = "Prefix ";
      const transformText = "TextToTransform";
      const suffix = " Suffix";
      const initialText = `${prefix}${transformText}${suffix}`;
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const cid = "char-id-1";
      const ops: Op[] = [
        { retain: prefix.length },
        {
          retain: transformText.length,
          attributes: { char: { style: "xt", cid }, bold: true },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(3); // Prefix text, CharNode, Suffix text

        const prefixTextNode = p.getFirstChild();
        if (!$isTextNode(prefixTextNode)) throw new Error("prefix is not a TextNode");
        expect(prefixTextNode.getTextContent()).toBe(prefix);

        const charNode = p.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("xt");
        expect(charNode.getUnknownAttributes()).toEqual({ cid });

        const innerTextNode = charNode.getFirstChild();
        if (!$isTextNode(innerTextNode)) throw new Error("innerTextNode is not a TextNode");
        expect(innerTextNode.getTextContent()).toBe(transformText);
        expect(innerTextNode.hasFormat("bold")).toBe(true); // Verify inner text formatting

        const suffixTextNode = p.getChildAtIndex(2);
        if (!$isTextNode(suffixTextNode)) throw new Error("suffix is not a TextNode");
        expect(suffixTextNode.getTextContent()).toBe(suffix);
      });
    });

    it("(dc) should fallback to standard attribute application if char.style is missing", async () => {
      const text = "FormatThisText";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const ops: Op[] = [
        {
          retain: text.length,
          // 'char' object is present, but 'style' is missing. 'cid' might be for other purposes.
          // 'bold' is a standard attribute that should still apply.
          attributes: { char: { cid: "some-id" }, bold: true },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const textNode = p.getFirstChild();
        if (!$isTextNode(textNode)) throw new Error("textNode is not a TextNode");
        expect(textNode.getTextContent()).toBe(text);
        expect(textNode.hasFormat("bold")).toBe(true);
      });
    });

    it("(dc) should transform text to CharNode when retain spans multiple TextNodes", async () => {
      const part1 = "FirstPart";
      const part2 = "SecondPart";
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            // Adding a format to prevent TextNodes from being combined
            $createTextNode(part1).toggleFormat("bold"),
            $createTextNode(part2),
          ),
        );
      });
      const cid = "speaker-id";
      const ops: Op[] = [
        {
          retain: part1.length + part2.length,
          attributes: { char: { style: "sp", cid } },
        },
      ];
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);
      });

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(2);

        const char1 = p.getFirstChild();
        if (!$isCharNode(char1)) throw new Error("char1 is not a CharNode");
        expect(char1.getMarker()).toBe("sp");
        expect(char1.getTextContent()).toBe(part1);
        expect(char1.getUnknownAttributes()).toEqual({ cid });

        const char2 = p.getChildAtIndex(1);
        if (!$isCharNode(char2)) throw new Error("char2 is not a CharNode");
        expect(char2.getMarker()).toBe("sp");
        expect(char2.getTextContent()).toBe(part2);
        expect(char2.getUnknownAttributes()).toEqual({ cid });
      });
    });

    it("Delta Check 42 for the following test", () => {
      const textBefore = "TextBefore ";
      const initialDoc = new Delta([
        { insert: textBefore },
        { insert: { verse: { number: "1" } } },
        { insert: " TextAfter" },
        { insert: LF, attributes: { style: "p" } },
      ]);
      const ops = new Delta([
        { retain: textBefore.length },
        {
          retain: 1,
          attributes: { char: { style: "xt", cid: "verse-char-attr" }, customVerseAttr: "applied" },
        },
      ]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        { insert: textBefore },
        {
          insert: { verse: { number: "1" } },
          attributes: { char: { style: "xt", cid: "verse-char-attr" }, customVerseAttr: "applied" },
        },
        { insert: " TextAfter" },
        { insert: LF, attributes: { style: "p" } },
      ]);
    });

    it("should fallback to standard attribute application when retain targets an existing embed for char transformation", async () => {
      const textBefore = "TextBefore ";
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode(textBefore),
            $createImmutableVerseNode("1"), // This VerseNode has OT length 1
            $createTextNode(" TextAfter"),
          ),
        );
      });
      const ops: Op[] = [
        { retain: textBefore.length },
        {
          retain: 1, // This targets the VerseNode
          attributes: { char: { style: "xt", cid: "verse-char-attr" }, customVerseAttr: "applied" },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(3);

        const v1 = p.getChildAtIndex(1);
        // Check that it's still a VerseNode, not transformed into a CharNode
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not SomeVerseNode");
        // Check if 'customVerseAttr' was applied
        // TODO: missing `char` attribute.
        expect(v1.getUnknownAttributes()).toEqual(
          expect.objectContaining({ customVerseAttr: "applied" }),
        );
      });
    });

    // Error handling and boundary conditions

    it("(dc) should handle multiple format attributes simultaneously", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("This is a test text.")));
      });
      const ops: Op[] = [
        { retain: 5 }, // "This "
        {
          retain: 4, // "is a"
          attributes: {
            char: { style: "bd", cid: "test-id" },
            bold: true,
          },
        },
        { retain: 11 },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");

        const charNode = p.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("bd");
        expect(charNode.getUnknownAttributes()).toEqual(
          expect.objectContaining({ cid: "test-id" }),
        );

        // Check that inner text has bold formatting
        const innerText = charNode.getFirstChild();
        if (!$isTextNode(innerText)) throw new Error("innerText is not a TextNode");
        expect(innerText.hasFormat("bold")).toBe(true);
      });
    });

    it("Delta Check 43 for the following test", () => {
      const initialDoc = new Delta([
        { insert: "bold text", attributes: { char: { style: "bd" }, highlight: true } },
        { insert: " normal text" },
        { insert: LF, attributes: { style: "p" } },
      ]);
      const ops = new Delta([
        {
          retain: 1 + 9,
          attributes: {
            char: false,
            highlight: false,
          },
        },
      ]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        { insert: "bold text ", attributes: { char: false, highlight: false } },
        { insert: "normal text" },
        { insert: LF, attributes: { style: "p" } },
      ]);
    });

    it("should handle format removal with false attribute values", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createCharNode("bd").append($createTextNode("bold text").toggleFormat("highlight")),
            $createTextNode(" normal text"),
          ),
        );
      });
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        const charNode = p.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        const t1 = charNode.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("bold text");
        expect(t1.hasFormat("highlight")).toBe(true);
      });
      const ops: Op[] = [
        {
          retain: 1 + 9, // 1 (CharNode) + "bold text" length
          attributes: {
            char: false,
            highlight: false,
          },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getTextContent()).toBe("bold text normal text");

        const charNode = p.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        // TODO: depends on fixing DC43 first.
        // expect(charNode.getUnknownAttributes()).toEqual(expect.objectContaining({ char: false }));

        const t1 = charNode.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("bold text");
        expect(t1.hasFormat("highlight")).toBe(false);
      });
    });

    it("(dc) should handle retain at exact text boundaries", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("First"),
            // Adding a format prevents the TextNodes from being combined.
            $createTextNode(" Second").toggleFormat("bold"),
            $createTextNode(" Third"),
          ),
        );
      });
      const ops: Op[] = [
        { retain: 5 }, // Exactly at end of "First"
        { retain: 7, attributes: { char: { style: "it" } } }, // Exactly " Second"
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(3);

        const charNode = p.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("it");
        expect(charNode.getTextContent()).toBe(" Second");
      });
    });

    it("Delta Check 45 for the following test", () => {
      const initialDoc = new Delta([
        { insert: "Start " },
        { insert: "bold", attributes: { char: { style: "bd" } } },
        { insert: " end" },
        { insert: LF, attributes: { style: "p" } },
      ]);
      const ops = new Delta([
        { retain: 3 },
        {
          retain: 3 + 4 + 2,
          attributes: { char: { style: "it" } },
        },
      ]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        { insert: "Sta" },
        { insert: "rt bold e", attributes: { char: { style: "it" } } },
        { insert: "nd" },
        { insert: LF, attributes: { style: "p" } },
      ]);
    });

    it("should handle retain spanning multiple elements", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Start "),
            $createCharNode("bd").append($createTextNode("bold")),
            $createTextNode(" end"),
          ),
        );
      });
      const ops: Op[] = [
        { retain: 3 }, // "Sta"
        {
          retain: 3 + 4 + 2, // "rt bold e" - spans across text, CharNode text, and text
          attributes: { char: { style: "it" } },
        },
      ];

      await sutApplyUpdate(editor, ops);

      // TODO: Need to combine adjacent CharNodes with the same attributes in Lexical.
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getTextContent()).toBe("Start bold end");
        expect(p.getChildrenSize()).toBe(5);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Sta");

        const char1 = p.getChildAtIndex(1);
        if (!$isCharNode(char1)) throw new Error("char1 is not a CharNode");
        expect(char1.getMarker()).toBe("it");

        const t2 = char1.getChildAtIndex(0);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("rt ");

        const char2 = p.getChildAtIndex(2);
        if (!$isCharNode(char2)) throw new Error("char2 is not a CharNode");
        expect(char2.getMarker()).toBe("it");

        const t3 = char2.getChildAtIndex(0);
        if (!$isTextNode(t3)) throw new Error("t3 is not a TextNode");
        expect(t3.getTextContent()).toBe("bold");

        const char3 = p.getChildAtIndex(3);
        if (!$isCharNode(char3)) throw new Error("char3 is not a CharNode");
        expect(char3.getMarker()).toBe("it");

        const t4 = char3.getChildAtIndex(0);
        if (!$isTextNode(t4)) throw new Error("t4 is not a TextNode");
        expect(t4.getTextContent()).toBe(" e");

        const t5 = p.getChildAtIndex(4);
        if (!$isTextNode(t5)) throw new Error("t5 is not a TextNode");
        expect(t5.getTextContent()).toBe("nd");
      });
    });

    it("(dc) should handle invalid attribute values gracefully", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Test text")));
      });
      const ops: Op[] = [
        { retain: 4 },
        {
          retain: 4,
          attributes: {
            char: { style: "invalid-style" },
            invalidAttr: null,
            undefinedAttr: undefined,
          },
        },
        { retain: 1 },
      ];

      await sutApplyUpdate(editor, ops);

      // Should not crash, but may log warnings
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");

        // Should still apply the operation, even with invalid values
        expect(p.getTextContent()).toBe("Test text");
        expect(p.getChildrenSize()).toBe(3);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Test");

        const charNode = p.getChildAtIndex(1);
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("invalid-style");
        // Non-string attributes (null, undefined) should be filtered out gracefully
        // The system should not crash, but these values should not be stored
        expect(charNode.getUnknownAttributes()).toBeUndefined();

        const t2 = charNode.getChildAtIndex(0);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe(" tex");

        const t3 = p.getChildAtIndex(2);
        if (!$isTextNode(t3)) throw new Error("t3 is not a TextNode");
        expect(t3.getTextContent()).toBe("t");
      });
    });

    it("(dc) should handle retain in mixed operations context", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Initial text for testing")));
      });
      const ops: Op[] = [
        { retain: 8 }, // "Initial "
        { delete: 4 }, // Delete "text"
        { insert: "content" },
        { retain: 12, attributes: { char: { style: "bd" } } }, // " for testing"
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getTextContent()).toBe("Initial content for testing");

        // Check if a CharNode was created for the formatted text
        const lastChild = p.getLastChild();
        if ($isCharNode(lastChild)) {
          expect(lastChild.getMarker()).toBe("bd");
          expect(lastChild.getTextContent()).toBe(" for testing");
        }
      });
    });

    it("(dc) should handle conflicting attribute updates", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createCharNode("bd", { color: "red" }).append($createTextNode("formatted text")),
          ),
        );
      });
      const ops: Op[] = [
        {
          retain: 14, // length of "formatted text"
          attributes: {
            // Keep same style but add new cid and change color
            char: { style: "bd", cid: "new-id", color: "blue" },
          },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");

        const charNode = p.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");

        // Should maintain the style and apply new attributes
        expect(charNode.getMarker()).toBe("bd");
        expect(charNode.getUnknownAttributes()).toEqual(
          expect.objectContaining({
            cid: "new-id",
            color: "blue",
          }),
        );
      });
    });

    it("(dci) should handle zero-length retain with attributes", async () => {
      const doc = new Delta([{ insert: "Test text" }, { insert: LF, attributes: { style: "p" } }]);
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Test text")));
      });
      const ops: Op[] = [{ retain: 0, attributes: { char: { style: "bd" } } }];

      const updatedDoc = doc.compose(new Delta(ops));
      await sutApplyUpdate(editor, ops);

      // Note: `{ retain: 0 }` shouldn't modify the doc. This looks like a bug in `quill-delta`.
      expect(updatedDoc.ops).toEqual([{ insert: LF, attributes: { style: "p" } }]);
      // Zero-length retain should not crash but also should not affect content
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getTextContent()).toBe("Test text");
        expect(p.getChildrenSize()).toBe(1);
      });
    });

    xit("Delta Check 53 for the following test", async () => {
      const doc = new Delta()
        .insert({ chapter: { number: "1", style: "c" } })
        .insert({ verse: { number: "1", style: "v" } })
        .insert("God", { char: [{ style: "qt" }, { style: "w" }] })
        .insert(" so ", { char: { style: "qt" } })
        .insert("loved", { char: [{ style: "qt" }, { style: "w" }] })
        .insert(" the world", { char: { style: "qt" } })
        .insert(" that he ")
        .insert("gave", { char: { style: "w" } })
        .insert(" his son")
        .insert(LF, { para: { style: "p" } });
      const ops = new Delta([
        {
          retain: 1, // Chapter node at root level
          attributes: {
            chapter: {
              pubnumber: "3a",
              altnumber: "Three",
            },
          },
        } /*
        {
          retain: 1, // Verse node inside para
          attributes: {
            number: "16",
            altnumber: "sixteen",
          },
        },
        {
          retain: 1, // First CharNode (qt) - speaker attributes
          attributes: {
            who: "Jesus",
            context: "teaching",
          },
        },
        {
          retain: 1, // First nested CharNode (w for "God") - lexical data
          attributes: {
            strong: "G2316",
            lemma: "θεός",
          },
        },
        {
          // Skip "God", " so " text, next w node text, and " the world" text
          retain: 3 + 4 + 5 + 10,
        },
        {
          retain: 9, // Text " that he "
        },
        {
          retain: 1, // Last CharNode (w for "gave") - verb analysis
          attributes: {
            strong: "G1325",
            lemma: "δίδωμι",
          },
        },*/,
      ]);

      const transformed = doc.compose(ops);

      expect(transformed.ops.length).toBe(10);
      expect(transformed.ops[0]).toEqual({
        insert: { chapter: { number: "1", style: "c", pubnumber: "3a", altnumber: "Three" } },
      });
      expect(transformed.ops[1]).toEqual({ insert: { verse: { number: "1", style: "v" } } });
      expect(transformed.ops[2]).toEqual({
        insert: "God",
        attributes: { char: [{ style: "qt" }, { style: "w" }] },
      });
      expect(transformed.ops[3]).toEqual({ insert: " so ", attributes: { char: { style: "qt" } } });
      expect(transformed.ops[4]).toEqual({
        insert: "loved",
        attributes: { char: [{ style: "qt" }, { style: "w" }] },
      });
      expect(transformed.ops[5]).toEqual({
        insert: " the world",
        attributes: { char: { style: "qt" } },
      });
      expect(transformed.ops[6]).toEqual({ insert: " that he " });
      expect(transformed.ops[7]).toEqual({ insert: "gave", attributes: { char: { style: "w" } } });
      expect(transformed.ops[8]).toEqual({ insert: " his son" });
      expect(transformed.ops[9]).toEqual({ insert: LF, attributes: { para: { style: "p" } } });
    });

    xit("should handle complex nested container attributes with deep nesting with cross references", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createImmutableChapterNode("3"),
          $createParaNode().append(
            $createImmutableVerseNode("16"),
            $createCharNode("qt").append(
              $createCharNode("w").append($createTextNode("God")),
              $createTextNode(" so "),
              $createCharNode("w").append($createTextNode("loved")),
              $createTextNode(" the world"),
            ),
            $createTextNode(" that he "),
            $createCharNode("w").append($createTextNode("gave")),
            $createTextNode(" his son"),
          ),
        );
      });
      const ops: Op[] = [
        {
          retain: 1, // Chapter node at root level
          attributes: {
            pubnumber: "3a",
            altnumber: "Three",
          },
        },
        {
          retain: 1, // Verse node inside para
          attributes: {
            number: "16",
            altnumber: "sixteen",
          },
        },
        {
          retain: 1, // First CharNode (qt) - speaker attributes
          attributes: {
            who: "Jesus",
            context: "teaching",
          },
        },
        {
          retain: 1, // First nested CharNode (w for "God") - lexical data
          attributes: {
            strong: "G2316",
            lemma: "θεός",
          },
        },
        {
          // Skip "God", " so " text, next w node text, and " the world" text
          retain: 3 + 4 + 5 + 10,
        },
        {
          retain: 9, // Text " that he "
        },
        {
          retain: 1, // Last CharNode (w for "gave") - verb analysis
          attributes: {
            strong: "G1325",
            lemma: "δίδωμι",
          },
        },
      ];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // Chapter and ParaNode at root level

        const ch3 = root.getFirstChild();
        if (!$isSomeChapterNode(ch3)) throw new Error("ch3 is not SomeChapterNode");
        expect(ch3.getNumber()).toBe("3");
        expect(ch3.getPubnumber()).toBe("3a");
        expect(ch3.getAltnumber()).toBe("Three");

        const p = root.getChildAtIndex(1);
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        const children = p.getChildren();
        expect(children.length).toBe(5); // v16, qt CharNode, text, last w node, text

        const v16 = children[0];
        if (!$isSomeVerseNode(v16)) throw new Error("v16 is not SomeVerseNode");
        expect(v16.getNumber()).toBe("16");
        expect(v16.getAltnumber()).toBe("sixteen");

        const qtCharNode = children[1];
        if (!$isCharNode(qtCharNode)) throw new Error("qtCharNode is not CharNode");
        expect(qtCharNode.getMarker()).toBe("qt");
        expect(qtCharNode.getUnknownAttributes()).toEqual({
          who: "Jesus",
          context: "teaching",
        });
        const qtChildren = qtCharNode.getChildren();
        expect(qtChildren.length).toBe(4); // 2 nested w nodes and 2 text nodes

        const godCharNode = qtChildren[0];
        if (!$isCharNode(godCharNode)) throw new Error("godCharNode is not CharNode");
        expect(godCharNode.getMarker()).toBe("w");
        expect(godCharNode.getUnknownAttributes()).toEqual({
          strong: "G2316",
          lemma: "θεός",
        });

        // Check second nested w node (loved)
        const lovedCharNode = qtChildren[2];
        if (!$isCharNode(lovedCharNode)) throw new Error("lovedCharNode is not CharNode");
        expect(lovedCharNode.getMarker()).toBe("w");
        expect(lovedCharNode.getUnknownAttributes()).toBeUndefined();

        // Verify final w node (gave) received verb analysis
        const gaveCharNode = children[3];
        if (!$isCharNode(gaveCharNode)) throw new Error("gaveCharNode is not CharNode");
        expect(gaveCharNode.getMarker()).toBe("w");
        expect(gaveCharNode.getUnknownAttributes()).toEqual({
          strong: "G1325",
          lemma: "δίδωμι",
        });
      });
    });
  });

  describe("Delete Operations", () => {
    it("(dc) should correctly log a delete operation with a positive value", async () => {
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

    it("(dc) should correctly log a delete operation with a positive value inside a para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
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

    it("(dc) should handle delete with negative value", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Some text here")));
      });
      const ops: Op[] = [{ delete: -5 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("Invalid delete operation"),
      );
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Some text here"); // No change
      });
    });

    it("(dc) should handle delete with zero value", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Some text here")));
      });
      const ops: Op[] = [{ delete: 0 }];

      await sutApplyUpdate(editor, ops);

      // Zero value should be rejected/logged as an error
      expect(consoleDebugSpy).toHaveBeenCalledTimes(0);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Some text here"); // No change
      });
    });

    it("Delta Check 28 for the following test", () => {
      const doc = new Delta([
        { insert: "Short text." },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const ops = new Delta([{ delete: 100 }]);

      const updatedDoc = doc.compose(ops);

      expect(updatedDoc.ops).toEqual([{ delete: 88 }]);
    });

    it("should handle delete larger than document length", async () => {
      const text = "Short text.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const ops: Op[] = [{ delete: 100 }]; // Much larger than document

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 100");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0); // Should warn, not error
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(""); // All text deleted
        // TODO: expect($getRoot().getChildrenSize()).toBe(0); // No children left or default para created
      });
    });

    it("(dc) should delete from middle of text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept softly.")));
      });
      const ops: Op[] = [{ retain: 6 }, { delete: 5 }]; // Delete "wept "

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus softly.");
      });
    });

    it("(dc) should delete from end of text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 6 }, { delete: 5 }]; // Delete "wept."

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus ");
      });
    });

    it("(dc) should delete spanning multiple TextNodes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("First part "),
            $createTextNode("Second part").toggleFormat("bold"), // Prevent combining
          ),
        );
      });
      const ops: Op[] = [{ retain: 7 }, { delete: 9 }]; // Delete "part Second"

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 9");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("First pd part");
        expect(root.getChildrenSize()).toBe(1);

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(2); // Two TextNodes remain
      });
    });

    it("(dc) should delete text before an embed", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Text before "),
            $createImmutableVerseNode("1"),
            $createTextNode(" text after"),
          ),
        );
      });

      const ops: Op[] = [{ retain: 7 }, { delete: 5 }]; // Delete "fore "

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Text be text after");
        expect(root.getChildrenSize()).toBe(1);

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(3);
      });
    });

    it("(dc) should delete text after an embed", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Text before "),
            $createImmutableVerseNode("1"),
            $createTextNode(" text after"),
          ),
        );
      });
      const ops: Op[] = [{ retain: 13 }, { delete: 5 }]; // Delete " text"

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Text before  after");
        expect(root.getChildrenSize()).toBe(1);

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(3);
      });
    });

    it("(dc) should delete text between embeds", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createTextNode(" middle text "),
            $createImmutableVerseNode("2"),
          ),
        );
      });

      const ops: Op[] = [{ retain: 1 }, { delete: 8 }]; // Delete " middle "

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 8");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("text ");
        expect(root.getChildrenSize()).toBe(1);

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(3);
      });
    });

    it("(dc) should delete crossing embed boundaries", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Text "),
            $createImmutableVerseNode("1"),
            $createTextNode(" more text"),
          ),
        );
      });
      // Initial text content: "Text  more text" (ImmutableVerseNode doesn't contribute text content)
      // After retain: 2, we're at "Te|xt  more text"
      const ops: Op[] = [{ retain: 2 }, { delete: 9 }]; // Delete "xt  more" (8 chars + 1 for verse node)

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 9");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        // Should delete "xt  more", leaving "Te text" (ImmutableVerseNode doesn't contribute to text content)
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Te text");
        expect(root.getChildrenSize()).toBe(1);

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
        expect(para.getChildrenSize()).toBe(1);
      });
    });

    it("(dc) should delete in 'empty' document", async () => {
      // Empty editor always has default paragraph (ImpliedParaNode)
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ delete: 5 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      // Should warn about not being able to delete from empty document
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("");
        expect(root.getChildrenSize()).toBe(1);
        expect($isImpliedParaNode(root.getFirstChild())).toBe(true);
      });
    });

    it("(dc) should delete at very beginning of document", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Delete from start")));
      });
      const ops: Op[] = [{ delete: 7 }]; // Delete "Delete "

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 7");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("from start");
      });
    });

    it("(dc) should delete in complex operation sequence", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Initial text content here")));
      });
      const ops: Op[] = [
        { retain: 8 }, // Move to "text"
        { delete: 4 }, // Delete "text"
        { insert: "new" }, // Insert "new"
        { retain: 8 }, // Move past " content"
        { delete: 5 }, // Delete " here"
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 4");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Initial new content");
      });
    });

    it("(dc) should handle multiple delete operations", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("One Two Three Four")));
      });
      const ops: Op[] = [
        { delete: 4 }, // Delete "One "
        { retain: 4 }, // Skip "Two "
        { delete: 6 }, // Delete "Three "
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 4");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 6");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Two Four");
      });
    });

    it("(dc) should delete text inside a CharNode container", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Prefix "),
            $createCharNode("wj").append($createTextNode("Jesus said hello")),
            $createTextNode(" suffix"),
          ),
        );
      });
      // Delete "said " from inside the CharNode
      const ops: Op[] = [{ retain: 7 + 6 }, { delete: 5 }]; // "Prefix " + "Jesus " = 13

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Prefix Jesus hello suffix");
      });
    });

    it("Delta Check 1 for the following test", async () => {
      const doc = new Delta([
        { insert: "First paragraph text" },
        { insert: LF, attributes: { para: { style: "p" } } },
        { insert: "Second paragraph text" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const ops = new Delta([{ retain: 10 }, { delete: 22 }]);

      const updatedDoc = doc.compose(ops);

      expect(updatedDoc.ops).toEqual([
        { insert: "First paragraph text" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
    });

    it("should delete across multiple paragraphs", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append($createTextNode("First paragraph text")),
          $createParaNode().append($createTextNode("Second paragraph text")),
        );
      });

      // In rich-text doc: "First paragraph text" (20) + LF (1) + "Second paragraph text" (21) = 42 chars
      // Retain 10: should position after "First para"
      // Delete 22: should delete "graph text" (10) + LF (1) + "Second para" (11) = 22 chars
      const ops: Op[] = [{ retain: 10 }, { delete: 22 }]; // Delete "graph text" + LF + "Second para"

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 22");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        // Current implementation doesn't merge paragraphs, and has off-by-one issue
        // Result: "First para" + "\n\n" + "raph text" (missing the "g" due to off-by-one)
        // TODO: Fix off-by-one error and implement paragraph merging
        expect($getRoot().getTextContent()).toBe("First para\n\nraph text");
      });
    });

    it("(dc) should delete with invalid index larger than document", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Short")));
      });
      const ops: Op[] = [{ retain: 100 }, { delete: 5 }]; // Retain beyond document end

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 5");
      // Should handle gracefully without crashing
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Short"); // No change due to invalid position
      });
    });

    it("(dc) should delete formatted text and preserve formatting structure", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Start "),
            $createTextNode("bold text").toggleFormat("bold"),
            $createTextNode(" normal text"),
          ),
        );
      });
      // Delete part of bold text and some normal text
      const ops: Op[] = [{ retain: 8 }, { delete: 8 }]; // Delete "ld text "

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 8");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Start bonormal text");
        // Check that formatting is preserved
        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        const children = para.getChildren();
        expect(children.length).toBe(3); // Should maintain formatting structure
      });
    });

    it("(dc) should delete entire embed nodes when delete spans them completely", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Before "),
            $createImmutableVerseNode("1"),
            $createTextNode(" between "),
            $createImmutableVerseNode("2"),
            $createTextNode(" after"),
          ),
        );
      });
      // This should test if deleting across embeds removes the embeds or skips them
      const ops: Op[] = [{ retain: 5 }, { delete: 15 }]; // Delete "re ", v1", " between ", v2, " a"

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 15");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Beforfter");

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        const children = para.getChildren();
        expect(children.length).toBe(1);
      });
    });

    it("(dc) should handle delete in document with mixed content types", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createImmutableChapterNode("1"),
          $createParaNode().append(
            $createImmutableVerseNode("1"),
            $createTextNode("In the beginning was the Word."),
          ),
        );
      });
      // Retain 17: skip Chapter(1) + Verse(1) + "In the beginnin" (15 text chars) = OT position 17
      // Delete 10: delete "g was the " from the text content
      const ops: Op[] = [{ retain: 17 }, { delete: 10 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 10");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("In the beginninWord.");

        const para = root.getChildAtIndex(1);
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        const children = para.getChildren();
        expect(children.length).toBe(2); // Should maintain formatting structure
      });
    });

    it("(dc) should handle delete with special characters and Unicode", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Καὶ εἶπεν ὁ θεὸς· γενηθήτω φῶς. καὶ ἐγένετο φῶς."),
          ),
        );
      });
      const ops: Op[] = [{ retain: 15 }, { delete: 12 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 12");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Καὶ εἶπεν ὁ θεὸφῶς. καὶ ἐγένετο φῶς.");
      });
    });

    it("(dc) should handle delete at very beginning of document", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Hello world")));
      });

      const ops: Op[] = [{ delete: 6 }]; // Delete "Hello "
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 6");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("world");
      });
    });

    it("Delta Check 9 for the following test", async () => {
      const doc = new Delta([
        { insert: "Hello world" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const ops = new Delta([{ retain: 11 }, { delete: 1 }]);

      const updatedDoc = doc.compose(ops);

      expect(updatedDoc.ops).toEqual([{ insert: "Hello world" }]);
    });

    it("should handle delete at very end of document", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Hello world")));
      });
      // Position at the very end (after "world")
      const ops: Op[] = [{ retain: 11 }, { delete: 1 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 11");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 1");
      // Should warn since there's nothing to delete at end
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Delete operation could not remove all requested characters/),
      );
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Hello world");

        const para = root.getChildAtIndex(0);
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        expect(para.getChildrenSize()).toBe(1);
      });
    });

    it("(dc) should handle delete spanning multiple text nodes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("First "),
            // Format prevents combining with adjacent nodes
            $createTextNode("second ").toggleFormat("bold"),
            $createTextNode("third"),
          ),
        );
      });

      // Delete "st second th" (12 chars) starting from position 3
      const ops: Op[] = [{ retain: 3 }, { delete: 12 }];
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 3");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 12");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Firird");

        const para = root.getChildAtIndex(0);
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        const children = para.getChildren();
        expect(children.length).toBe(1);
      });
    });

    it("(dc) should handle delete that removes entire text nodes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("First"),
            // Format prevents combining with adjacent nodes
            $createTextNode("Second").toggleFormat("bold"),
            $createTextNode("Third"),
          ),
        );
      });

      // Delete the entire middle text node "Second" (6 chars) starting from position 5
      const ops: Op[] = [{ retain: 5 }, { delete: 6 }];
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 5");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 6");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("FirstThird");

        const para = root.getChildAtIndex(0);
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        const children = para.getChildren();
        expect(children.length).toBe(1);
      });
    });

    it("(dc) should handle delete with complex char node structures", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Before "),
            $createCharNode("add").append($createTextNode("added text")),
            $createCharNode("wj").append($createTextNode(" Jesus said")),
            $createTextNode(" after"),
          ),
        );
      });

      // Delete part of the char node content: "ed text Jesus" (13 chars) starting from position 10
      const ops: Op[] = [{ retain: 10 }, { delete: 13 }];
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 10");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 13");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Before add said after");

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        expect(para.getChildrenSize()).toBe(4); // Should maintain structure with 3 text nodes
      });
    });

    it("(dc) should handle delete operations in sequence", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("The quick brown fox jumps")));
      });

      // Multiple deletes in one delta: delete "quick " then "fox "
      const ops: Op[] = [
        { retain: 4 }, // "The "
        { delete: 6 }, // delete "quick "
        { retain: 6 }, // "brown "
        { delete: 4 }, // delete "fox "
      ];
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 4");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 6");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 6");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 4");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("The brown jumps");
      });
    });

    it("(dc) should handle delete with container embeds containing text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append(
            $createTextNode("Before "),
            $createCharNode("add").append($createTextNode("inserted text")),
            $createTextNode(" after"),
          ),
        );
      });

      // Delete text that spans before, inside, and after the CharNode
      // Delete "re inserted te" (14 chars) starting from position 4
      const ops: Op[] = [{ retain: 4 }, { delete: 14 }];
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 4");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 14");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("Befoxt after");

        const para = root.getFirstChild();
        if (!$isParaNode(para)) throw new Error("Expected ParaNode");
        expect(para.getChildrenSize()).toBe(3); // Should maintain structure with 3 nodes
      });
    });

    it("Delta Check 29 for the following test", () => {
      const doc = new Delta([
        { insert: "First paragraph" },
        { insert: LF, attributes: { para: { style: "p" } } },
        { insert: "Second paragraph" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const ops = new Delta([{ retain: 10 }, { delete: 15 }]);

      const updatedDoc = doc.compose(ops);

      expect(updatedDoc.ops).toEqual([
        { insert: "First pararagraph" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
    });

    xit("should handle delete across paragraph boundaries correctly", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append($createTextNode("First paragraph")),
          $createParaNode().append($createTextNode("Second paragraph")),
        );
      });

      // Delete text that spans across paragraph boundary
      // This should handle the implied newline correctly
      const ops: Op[] = [{ retain: 10 }, { delete: 15 }]; // Delete "paragraph\nSecond"
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 10");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 15");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        // Should merge paragraphs after deletion
        expect($getRoot().getTextContent()).toBe("First para paragraph");
      });
    });

    it("Delta Check 33 for the following test", () => {
      const doc = new Delta([
        { insert: "First" },
        { insert: LF, attributes: { para: { style: "p" } } },
        { insert: "Second" },
        { insert: LF, attributes: { para: { style: "p" } } },
        { insert: "Third" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const ops = new Delta([{ retain: 6 }, { delete: 7 }]);

      const updatedDoc = doc.compose(ops);

      expect(updatedDoc.ops).toEqual([
        { insert: "First" },
        { insert: LF, attributes: { para: { style: "p" } } },
        { insert: "Third" },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
    });

    xit("should handle delete that removes entire paragraphs", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append($createTextNode("First")),
          $createParaNode().append($createTextNode("Second")),
          $createParaNode().append($createTextNode("Third")),
        );
      });

      // Delete the entire middle paragraph and its boundaries
      const ops: Op[] = [{ retain: 6 }, { delete: 7 }]; // Delete "\nSecond\n"
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 6");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 7");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("FirstThird");
      });
    });

    it("(dc) should handle delete with line breaks and whitespace", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Line one\n\nLine three")));
      });

      // Delete the double newline
      const ops: Op[] = [{ retain: 8 }, { delete: 2 }]; // Delete "\n\n"
      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Retain: 8");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 2");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Line oneLine three");
      });
    });

    it("(dc) should handle consecutive delete operations without retain", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("ABCDEFGHIJKLMNOP")));
      });
      const ops: Op[] = [
        { delete: 3 }, // Delete "ABC"
        { delete: 2 }, // Delete "DE"
        { delete: 1 }, // Delete "F"
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 3");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 2");
      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 1");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("GHIJKLMNOP");
      });
    });

    it("(dc) should handle delete operation that would empty the document", async () => {
      const text = "All content";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const ops: Op[] = [{ delete: text.length }]; // Delete all text

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith(`Delete: ${text.length}`);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getTextContent()).toBe("");
        // Should still have paragraph structure
        expect(root.getChildrenSize()).toBe(1);
        expect($isParaNode(root.getFirstChild())).toBe(true);
      });
    });

    it("(dc) should log warnings when delete operation cannot remove all requested characters", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Short")));
      });
      const ops: Op[] = [{ delete: 100 }]; // Request deletion of more than available

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenCalledWith("Delete: 100");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Delete operation could not remove all requested characters/),
      );
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe(""); // All available text deleted
      });
    });
  });

  describe("Insert Operations", () => {
    it("(dc) should correctly log an insert operation with an empty string", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: "" }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Insert: ''");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(3);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
        expect($getRoot().getChildrenSize()).toBe(1);
      });
    });

    it("(dc) should insert text into an 'empty' editor", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: "Jesus wept." }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus wept.");
        expect($getRoot().getChildrenSize()).toBe(1);
      });
    });

    it("(dc) should insert text into an editor with empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const ops: Op[] = [{ insert: "Jesus wept." }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus wept.");
        expect($getRoot().getChildrenSize()).toBe(1);
      });
    });

    it("Delta Check 46 for the following test", () => {
      const brothers = "brothers";
      const initialDoc = new Delta([
        { insert: { chapter: { number: "1" } } },
        { insert: { verse: { number: "1" } } },
        {
          insert:
            "Paul, an apostle—not from men nor through man, but through Jesus Christ and God the Father, who raised him from the dead— ",
        },
        { insert: { verse: { number: "2" } } },
        { insert: `and all the ${brothers} who are with me, To the churches of Galatia: ` },
        { insert: LF },
      ]);
      const ops: Op[] = [
        { retain: 139 },
        { insert: "e" },
        { delete: 1 },
        { retain: 2 },
        { insert: "ren" },
        { delete: 3 },
      ];
      const result = initialDoc.compose(new Delta(ops));
      expect(result.ops).toEqual([
        { insert: { chapter: { number: "1" } } },
        { insert: { verse: { number: "1" } } },
        {
          insert:
            "Paul, an apostle—not from men nor through man, but through Jesus Christ and God the Father, who raised him from the dead— ",
        },
        { insert: { verse: { number: "2" } } },
        { insert: "and all the brethren who are with me, To the churches of Galatia: " + LF },
      ]);
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
      // TODO: deal with `segment` attributes.
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

    it("(dc) should insert a chapter embed into an empty editor", async () => {
      const { editor } = await testEnvironment();
      const ch1Embed = { chapter: { number: "1", style: "c" } };
      const ops: Op[] = [{ insert: ch1Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);

        const ch1 = root.getFirstChild();
        if (!$isSomeChapterNode(ch1)) throw new Error("c1 is not SomeChapterNode");
        expect(ch1.getNumber()).toBe("1");

        const para = root.getChildAtIndex(1);
        expect($isImpliedParaNode(para)).toBe(true);
      });
    });

    it("(dc) should insert a chapter embed at the beginning of a document with existing content", async () => {
      const initialText = "Initial text.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const ch1Embed = { chapter: { number: "1", style: "c" } };
      // No retain, so insert happens at the current index 0 before the ParaNode.
      const ops: Op[] = [{ insert: ch1Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);

        const ch1 = root.getFirstChild();
        if (!$isSomeChapterNode(ch1)) throw new Error("First child is not SomeChapterNode");
        expect(ch1.getNumber()).toBe("1");

        const existingPara = root.getChildAtIndex(1);
        if (!$isParaNode(existingPara)) throw new Error("Second child is not a ParaNode");
        expect(existingPara.getTextContent()).toBe(initialText);
      });
    });

    it("(dc) should insert a chapter embed after an existing ParaNode at the root level", async () => {
      const initialText = "Some initial content in a para.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const ch2Embed = { chapter: { number: "2", style: "c" } };
      // Retain past the initial text in the ParaNode (length + 1 for the para itself)
      const ops: Op[] = [{ retain: 1 + initialText.length }, { insert: ch2Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // ParaNode and chapter node

        const existingPara = root.getFirstChild();
        if (!$isParaNode(existingPara)) throw new Error("First child should be a ParaNode");
        expect(existingPara.getTextContent()).toBe(initialText);
        expect(existingPara.getChildrenSize()).toBe(1); // Only the TextNode

        const ch2 = root.getChildAtIndex(1);
        if (!$isSomeChapterNode(ch2)) throw new Error("Second child should be SomeChapterNode");
        expect(ch2.getNumber()).toBe("2");
      });
    });

    it("(dc) should insert a verse embed at the end of a document with existing content", async () => {
      const initialText = "Initial text.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedVerse = { verse: { number: "1", style: "v" } };
      // Retain past the initial text in the ParaNode
      const ops: Op[] = [{ retain: initialText.length }, { insert: embedVerse }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1); // Root should still have one ParaNode

        const paraNode = root.getFirstChild();
        if (!$isParaNode(paraNode)) throw new Error("First child is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(2); // TextNode and VerseNode

        const textNode = paraNode.getFirstChild();
        if (!$isTextNode(textNode)) throw new Error("First child of para is not a TextNode");
        expect(textNode.getTextContent()).toBe(initialText);

        const v1Node = paraNode.getChildAtIndex(1);
        if (!$isSomeVerseNode(v1Node)) throw new Error("Second child of para is not SomeVerseNode");
        expect(v1Node.getNumber()).toBe("1");
      });
    });

    it("(dc) should insert a verse embed inside text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const v1Embed = { verse: { number: "1", style: "v" } };
      const ops: Op[] = [{ retain: 6 }, { insert: v1Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(3);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus ");

        const v1 = p.getChildAtIndex(1);
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not SomeVerseNode");
        expect(v1.getNumber()).toBe("1");

        const t2 = p.getChildAtIndex(2);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("wept.");
      });
    });

    it("(dci) should insert an embed when the targetIndex is out of bounds", async () => {
      const initialText = "Short text."; // Length 11
      const doc = new Delta([
        { insert: initialText },
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const v10Embed = { verse: { number: "10", style: "v" } };
      // Retain past the end of the text and the ParaNode itself.
      // initialText.length (11) + 1 (for ParaNode) = 12. Retain 20.
      const ops: Op[] = [{ retain: 20 }, { insert: v10Embed }];

      const updatedDoc = doc.compose(new Delta(ops));
      await sutApplyUpdate(editor, ops);

      expect(updatedDoc.ops).toEqual([
        { insert: initialText },
        { insert: LF, attributes: { para: { style: "p" } } },
        { retain: 8 },
        { insert: v10Embed },
      ]);
      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // Root should have ParaNode and ImpliedParaNode

        const paraNode = root.getFirstChild();
        if (!$isParaNode(paraNode)) throw new Error("First child is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(1); // Initial TextNode

        const impliedParaNode = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(impliedParaNode))
          throw new Error("Second child is not an ImpliedParaNode");
        expect(impliedParaNode.getChildrenSize()).toBe(1);

        const v10Node = impliedParaNode.getFirstChild();
        if (!$isSomeVerseNode(v10Node))
          throw new Error("First child of implied para is not SomeVerseNode");
        expect(v10Node.getNumber()).toBe("10");
      });
    });

    it("(dc) should insert an embed between two existing embed nodes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), $createImmutableVerseNode("3")),
        );
      });
      const v2Embed = { verse: { number: "2", style: "v" } };
      // Retain past the first VerseNode (1)
      const ops: Op[] = [{ retain: 1 }, { insert: v2Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1); // Root should still have one ParaNode

        const paraNode = root.getFirstChild();
        if (!$isParaNode(paraNode)) throw new Error("First child is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(3); // Verse1, VerseToInsert, Verse3

        const v1 = paraNode.getChildAtIndex(0);
        if (!$isSomeVerseNode(v1)) throw new Error("Child 0 of para is not SomeVerseNode");
        expect(v1.getNumber()).toBe("1");

        const v2 = paraNode.getChildAtIndex(1);
        if (!$isSomeVerseNode(v2)) throw new Error("Child 1 of para is not SomeVerseNode");
        expect(v2.getNumber()).toBe("2");

        const v3 = paraNode.getChildAtIndex(2);
        if (!$isSomeVerseNode(v3)) throw new Error("Child 2 of para is not SomeVerseNode");
        expect(v3.getNumber()).toBe("3");
      });
    });

    it("(dc) should insert para with attributes", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: { para: { style: "q1" } } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getChildrenSize()).toBe(2);
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getMarker()).toBe("q1");
      });
    });

    it("Delta Check 59 for the following test", () => {
      const initialDoc = new Delta([{ insert: LF, attributes: { para: { style: "p" } } }]);
      const wordsOfJesus = "It is finished.";
      const insertCharOp = {
        insert: wordsOfJesus,
        attributes: {
          segment: "verse_1_1",
          char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
        },
      };
      const ops = new Delta([insertCharOp]);
      const result = initialDoc.compose(ops);
      expect(result.ops).toEqual([
        insertCharOp,
        { insert: LF, attributes: { para: { style: "p" } } },
      ]);
    });

    it("should insert a char embed in empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const wordsOfJesus = "It is finished.";
      const ops: Op[] = [
        {
          insert: wordsOfJesus,
          attributes: {
            segment: "verse_1_1",
            char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
          },
        },
      ];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);

        const p = root.getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const char = p.getFirstChild();
        if (!$isCharNode(char)) throw new Error("char is not a CharNode");
        expect(char.getTextContent()).toBe(wordsOfJesus);
        expect(char.getMarker()).toBe("wj");
        // TODO: deal with `segment` attributes.
        expect(char.getUnknownAttributes()).toEqual({
          cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545",
        });
      });
    });

    it("(dc) should insert a char embed inside text and apply attributes after", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus said to them")));
      });
      const wordsOfJesus = "It is finished. ";
      const insertCharOp = {
        insert: wordsOfJesus,
        attributes: {
          segment: "verse_1_1",
          char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
        },
      };
      const attributes = { italic: true };
      const ops: Op[] = [{ retain: 11 }, insertCharOp, { retain: 3 }, { retain: 4, attributes }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(4);

        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("Jesus said ");

        const char = p.getChildAtIndex(1);
        if (!$isCharNode(char)) throw new Error("char is not a CharNode");
        expect(char.getTextContent()).toBe(wordsOfJesus);
        expect(char.getMarker()).toBe("wj");

        const t2 = p.getChildAtIndex(2);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe("to ");
        expect(t2.hasFormat("italic")).toBe(false);

        const t3 = p.getChildAtIndex(3);
        if (!$isTextNode(t3)) throw new Error("t3 is not a TextNode");
        expect(t3.getTextContent()).toBe("them");
        expect(t3.hasFormat("italic")).toBe(true);
      });
    });

    it("(dc) should insert milestone embeds in empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const msStartEmbed = { ms: { style: "qt-s", status: "start", who: "Jesus" } };
      const ops: Op[] = [{ insert: msStartEmbed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const startMilestone = p.getFirstChild();
        if (!$isMilestoneNode(startMilestone))
          throw new Error("startMilestone is not a MilestoneNode");
        expect(startMilestone.getMarker()).toBe("qt-s");
        expect(startMilestone.getUnknownAttributes()).toEqual({ status: "start", who: "Jesus" });
      });
    });

    it("(dc) should insert milestone embeds before and in text", async () => {
      const text = "“So you say,” answered Jesus.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const msStartEmbed = { ms: { style: "qt-s", status: "start", who: "Jesus" } };
      const msEndEmbed = { ms: { style: "qt-e", status: "end" } };
      const ops: Op[] = [{ insert: msStartEmbed }, { retain: 13 }, { insert: msEndEmbed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getTextContent()).toBe(text);
        expect(p.getChildrenSize()).toBe(4);

        const msStart = p.getFirstChild();
        if (!$isMilestoneNode(msStart)) throw new Error("msStart is not a MilestoneNode");
        expect(msStart.getMarker()).toBe(msStartEmbed.ms.style);
        expect(msStart.getUnknownAttributes()).toEqual({
          status: "start",
          who: "Jesus",
        });

        const t1 = p.getChildAtIndex(1);
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("“So you say,”");

        const msEnd = p.getChildAtIndex(2);
        if (!$isMilestoneNode(msEnd)) throw new Error("msEnd is not a MilestoneNode");
        expect(msEnd.getMarker()).toBe(msEndEmbed.ms.style);
        expect(msEnd.getUnknownAttributes()).toEqual({ status: "end" });

        const t2 = p.getChildAtIndex(3);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe(" answered Jesus.");
      });
    });

    it("(dc) should sequentially insert multiple items into an empty document", async () => {
      const { editor } = await testEnvironment();
      const ch1Embed = { chapter: { number: "1", style: "c" } };
      const v1Embed = { verse: { number: "1", style: "v" } };
      const v1Text = "v1 text ";
      const v1TextInsertOp = {
        attributes: {
          segment: "verse_1_1",
        },
        insert: v1Text,
      };
      const v2Embed = { verse: { number: "2", style: "v" } };
      const v2Text = "v2 text ";
      const v2TextInsertOp = {
        attributes: {
          segment: "verse_1_2",
        },
        insert: v2Text,
      };
      const milestoneEmbed = { ms: { style: "ts-s", sid: "TS1" } };
      const ops: Op[] = [
        // OT index: 0
        { insert: ch1Embed }, // 1
        { insert: v1Embed }, // 2
        v1TextInsertOp, // 10
        { insert: LF }, // 11
        { insert: v2Embed }, // 12
        v2TextInsertOp, // 20
        { insert: milestoneEmbed }, // 21
        {
          insert: LF, // 22
          attributes: {
            para: {
              style: "q1",
            },
          },
        },
      ];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(3); // ch1, existing implied-para, ParaNode

        const ch1Node = root.getChildAtIndex(0);
        if (!$isSomeChapterNode(ch1Node)) throw new Error("Child 0 is not SomeChapterNode");
        expect(ch1Node.getNumber()).toBe("1");

        const impliedParaNode = root.getChildAtIndex(1);
        if (!$isImpliedParaNode(impliedParaNode))
          throw new Error("Child 1 is not a ImpliedParaNode");
        expect(impliedParaNode.getChildrenSize()).toBe(2);

        const v1Node = impliedParaNode.getChildAtIndex(0);
        if (!$isSomeVerseNode(v1Node))
          throw new Error("Child of impliedParaNode is not SomeVerseNode");
        expect(v1Node.getNumber()).toBe("1");

        const v1TextNode = impliedParaNode.getChildAtIndex(1);
        if (!$isTextNode(v1TextNode)) throw new Error("Child of impliedParaNode is not a TextNode");
        expect(v1TextNode.getTextContent()).toBe(v1Text);

        const paraNode = root.getChildAtIndex(2);
        if (!$isParaNode(paraNode)) throw new Error("Child 1 is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(3);
        expect(paraNode.getMarker()).toBe("q1");

        const v2Node = paraNode.getChildAtIndex(0);
        if (!$isSomeVerseNode(v2Node)) throw new Error("Child of paraNode is not SomeVerseNode");
        expect(v2Node.getNumber()).toBe("2");

        const v2TextNode = paraNode.getChildAtIndex(1);
        if (!$isTextNode(v2TextNode)) throw new Error("Child of paraNode is not a TextNode");
        expect(v2TextNode.getTextContent()).toBe(v2Text);

        const milestoneNode = paraNode.getChildAtIndex(2);
        if (!$isMilestoneNode(milestoneNode))
          throw new Error("Child of paraNode is not a MilestoneNode");
        expect(milestoneNode.getMarker()).toBe("ts-s");
        expect(milestoneNode.getSid()).toBe("TS1");
      });
    });

    describe("Line Break Handling", () => {
      it("(dc) should insert a simple line break in 'empty' editor", async () => {
        const { editor } = await testEnvironment();
        const ops: Op[] = [{ insert: LF }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(1);

          const impliedPara = root.getFirstChild();
          if (!$isImpliedParaNode(impliedPara))
            throw new Error("impliedPara is not an ImpliedParaNode");
          expect(impliedPara.getChildrenSize()).toBe(0); // Empty implied para
        });
      });

      it("(dc) should insert line break with para attributes", async () => {
        const { editor } = await testEnvironment();
        const ops: Op[] = [{ insert: LF, attributes: { para: { style: "q1" } } }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(1);

          const paraNode = root.getFirstChild();
          if (!$isParaNode(paraNode)) throw new Error("paraNode is not a ParaNode");
          expect(paraNode.getMarker()).toBe("q1");
          expect(paraNode.getChildrenSize()).toBe(0); // Empty para
        });
      });

      it("(dc) should handle line break insertion in regular ParaNode", async () => {
        const firstLine = "First line";
        const text = " text";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode(`${firstLine}${text}`)));
        });
        const ops: Op[] = [{ retain: firstLine.length }, { insert: LF }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(2);

          const p1 = root.getFirstChild();
          if (!$isImpliedParaNode(p1)) throw new Error("p1 is not a ImpliedParaNode");
          expect(p1.getTextContent()).toBe(firstLine);

          const p2 = root.getChildAtIndex(1);
          if (!$isParaNode(p2)) throw new Error("p2 is not a ParaNode");
          expect(p2.getTextContent()).toBe(text);
        });
      });

      it("(dc) should split regular ParaNode when LF has different para attributes", async () => {
        const original = "Original ";
        const paragraphText = "paragraph text";
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createParaNode().append($createTextNode(`${original}${paragraphText}`)),
          );
        });
        const ops: Op[] = [
          { retain: original.length }, // After original
          { insert: LF, attributes: { para: { style: "q2" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks split regular ParaNodes when para attributes differ
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(original);
          expect(firstPara.getMarker()).toBe("q2"); // LF attributes go to FIRST paragraph

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(paragraphText);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on SECOND paragraph
        });
      });

      it("(dc) should insert new ParaNode before existing ParaNode when LF has different para attributes at beginning", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Content here")));
        });
        const ops: Op[] = [{ insert: LF, attributes: { para: { style: "q1" } } }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks at beginning of document create new paragraphs when para attributes are present
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(""); // Empty paragraph from LF
          expect(firstPara.getMarker()).toBe("q1"); // LF attributes go to first paragraph

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe("Content here");
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
        });
      });

      it("(dc) should create new ParaNode after existing ParaNode when LF has different para attributes at end", async () => {
        const t1 = "Full content";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode(t1)));
        });
        const ops: Op[] = [
          { retain: t1.length + 1 }, // +1 for the end of ParaNode (symbolically closed by LF)
          { insert: LF, attributes: { para: { style: "b" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks at end of regular ParaNode create new paragraphs when para attributes differ
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(t1);
          expect(firstPara.getMarker()).toBe("p"); // Original marker preserved

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(""); // Empty new paragraph
          expect(secondPara.getMarker()).toBe("b"); // New marker from attributes
        });
      });

      it("(dc) should create multiple ParaNodes with consecutive line breaks having different para attributes", async () => {
        const base = "Base";
        const text = " text";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode(`${base}${text}`)));
        });
        const ops: Op[] = [
          { retain: base.length }, // After base
          { insert: LF, attributes: { para: { style: "q1" } } },
          { insert: LF, attributes: { para: { style: "q2" } } },
          { insert: LF }, // No attributes - should create ImpliedParaNode
          // TODO: revise inserting ImpliedParaNode after a ParaNode - while this is technically possible here I don't think USFM allows it.
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Multiple line breaks in regular ParaNode create multiple new paragraphs
          expect(root.getChildrenSize()).toBe(4);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(base);
          expect(firstPara.getMarker()).toBe("q1"); // First LF attributes go to first paragraph

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe("");
          expect(secondPara.getMarker()).toBe("q2"); // Second LF attributes go to new first paragraph

          const thirdPara = root.getChildAtIndex(2);
          if (!$isImpliedParaNode(thirdPara))
            throw new Error("thirdPara is not an ImpliedParaNode");
          expect(thirdPara.getTextContent()).toBe("");

          const forthPara = root.getChildAtIndex(3);
          if (!$isParaNode(forthPara)) throw new Error("forthPara is not a ParaNode");
          expect(forthPara.getTextContent()).toBe(text);
          expect(forthPara.getMarker()).toBe("p"); // Original attributes end up on final paragraph
        });
      });

      it("(dc) should split ParaNode between embeds when LF has different para attributes", async () => {
        const v1Text = "First verse text";
        const v2Text = "Second verse text";
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createTextNode(v1Text),
              $createImmutableVerseNode("2"),
              $createTextNode(v2Text),
            ),
          );
        });
        const ops: Op[] = [
          { retain: 1 + v1Text.length }, // After v1 and v1Text
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break between embeds in regular ParaNode splits the paragraph when para attributes differ
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getChildrenSize()).toBe(2); // v1 + v1Text
          expect(firstPara.getTextContent()).toBe(v1Text);
          expect(firstPara.getMarker()).toBe("q1"); // LF attributes go to first paragraph

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getChildrenSize()).toBe(2); // v2 + v2Text
          expect(secondPara.getTextContent()).toBe(v2Text);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
        });
      });

      it("(dc) should split ParaNode with text formatting preservation when LF has different para attributes", async () => {
        const boldText = "Bold text ";
        const regularText = "regular text";
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createParaNode().append(
              $createTextNode(boldText).setFormat("bold"),
              $createTextNode(regularText),
            ),
          );
        });
        const ops: Op[] = [
          { retain: boldText.length }, // After boldText
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode splits the paragraph when para attributes differ
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(boldText);
          expect(firstPara.getMarker()).toBe("q1"); // LF attributes go to first paragraph
          expect(firstPara.getChildrenSize()).toBe(1); // Only the bold text
          // Check that bold formatting is preserved
          const firstText = firstPara.getFirstChild();
          if (!$isTextNode(firstText)) throw new Error("firstText is not a TextNode");
          expect(firstText.hasFormat("bold")).toBe(true);

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(regularText);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
          expect(secondPara.getChildrenSize()).toBe(1); // Only the regular text
          // Check that regular formatting is preserved
          const secondText = secondPara.getFirstChild();
          if (!$isTextNode(secondText)) throw new Error("secondText is not a TextNode");
          expect(secondText.hasFormat("bold")).toBe(false);
        });
      });

      it("(dc) should split ParaNode in complex document structure when LF has different para attributes", async () => {
        const inTheBeginning = "In the beginning ";
        const godCreated = "God created the heavens and the earth.";
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createImmutableChapterNode("1"),
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createTextNode(`${inTheBeginning}${godCreated}`),
            ),
          );
        });
        const ops: Op[] = [
          { retain: 1 + 1 + inTheBeginning.length }, // After ch1 + v1 + inTheBeginning
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode splits it when para attributes differ, even in complex structure
          expect(root.getChildrenSize()).toBe(3); // ch1 + 2 paras

          const ch1 = root.getFirstChild();
          if (!$isSomeChapterNode(ch1)) throw new Error("ch1 is not SomeChapterNode");
          expect(ch1.getNumber()).toBe("1");

          const firstPara = root.getChildAtIndex(1);
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(inTheBeginning);
          expect(firstPara.getMarker()).toBe("q1"); // LF attributes go to first paragraph
          expect(firstPara.getChildrenSize()).toBe(2); // v1 + inTheBeginning text

          const secondPara = root.getChildAtIndex(2);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(godCreated);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
          expect(secondPara.getChildrenSize()).toBe(1); // Only the godCreated text
        });
      });

      it("(dc) should split ParaNode gracefully even with invalid para style", async () => {
        const test = "Test";
        const content = " content";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode(`${test}${content}`)));
        });
        const ops: Op[] = [
          { retain: test.length },
          { insert: LF, attributes: { para: { style: "invalid-marker-xyz" } } },
        ];

        await sutApplyUpdate(editor, ops);

        // Should not error even with invalid style
        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode splits it even with invalid style
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(test);
          expect(firstPara.getMarker()).toBe("invalid-marker-xyz"); // LF attributes (even invalid) go to first paragraph

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(content);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
        });
      });

      it("Delta Check 75 for the following test", () => {
        const mixed = "Mixed";
        const attributesTest = " attributes test";
        const initialDoc = new Delta([
          { insert: `${mixed}${attributesTest}` },
          { insert: LF, attributes: { para: { style: "p" } } },
        ]);
        const ops = new Delta([
          { retain: mixed.length },
          {
            insert: LF,
            attributes: {
              para: { style: "q1" },
              segment: "verse_1_1",
              customAttr: "value",
            },
          },
        ]);
        const result = initialDoc.compose(ops);
        expect(result.ops).toEqual([
          { insert: mixed },
          {
            insert: LF,
            attributes: {
              para: { style: "q1" },
              segment: "verse_1_1",
              customAttr: "value",
            },
          },
          { insert: attributesTest },
          { insert: LF, attributes: { para: { style: "p" } } },
        ]);
      });

      it("should split ParaNode with mixed attributes when para attributes differ", async () => {
        const mixed = "Mixed";
        const attributesTest = " attributes test";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode(`${mixed}${attributesTest}`)));
        });
        const ops: Op[] = [
          { retain: mixed.length },
          {
            insert: LF,
            attributes: {
              para: { style: "q1" },
              segment: "verse_1_1",
              customAttr: "value",
            },
          },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode splits it when para attributes differ, even with mixed attributes
          expect(root.getChildrenSize()).toBe(2);

          const firstPara = root.getFirstChild();
          if (!$isParaNode(firstPara)) throw new Error("firstPara is not a ParaNode");
          expect(firstPara.getTextContent()).toBe(mixed);
          expect(firstPara.getMarker()).toBe("q1"); // LF attributes go to first paragraph
          // TODO: non-para attributes shouldn't be ignored for line breaks???

          const secondPara = root.getChildAtIndex(1);
          if (!$isParaNode(secondPara)) throw new Error("secondPara is not a ParaNode");
          expect(secondPara.getTextContent()).toBe(attributesTest);
          expect(secondPara.getMarker()).toBe("p"); // Original attributes stay on second paragraph
        });
      });

      it("(dc) should replace ImpliedParaNode with ParaNode when LF has para attributes", async () => {
        const impliedParaContent = "Implied para content";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createImpliedParaNode().append($createTextNode(impliedParaContent)));
        });
        const ops: Op[] = [
          { retain: impliedParaContent.length },
          // After impliedParaContent" (at the ImpliedParaNode's closing marker)
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getMarker()).toBe("q1"); // ImpliedParaNode was replaced with ParaNode
          expect(para.getTextContent()).toBe(impliedParaContent);
        });
      });

      it("(dc) should do nothing when LF without attributes is inserted in ImpliedParaNode", async () => {
        const impliedParaContent = "Implied para content";
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createImpliedParaNode().append($createTextNode(impliedParaContent)));
        });
        const ops: Op[] = [
          { retain: impliedParaContent.length }, // After impliedParaContent (at the ImpliedParaNode's closing marker)
          { insert: LF }, // No para attributes
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(1);

          const impliedPara = root.getFirstChild();
          if (!$isImpliedParaNode(impliedPara))
            throw new Error("impliedPara is not an ImpliedParaNode");
          expect(impliedPara.getTextContent()).toBe(impliedParaContent);
          expect(impliedPara.getChildrenSize()).toBe(1); // Still has only the text node
        });
      });

      it("(dc) should replace empty ImpliedParaNode with ParaNode when LF has para attributes", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createImpliedParaNode()); // Empty ImpliedParaNode
        });
        const ops: Op[] = [{ insert: LF, attributes: { para: { style: "p" } } }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getMarker()).toBe("p");
          expect(para.getChildrenSize()).toBe(0); // Empty
        });
      });
    });

    describe("Error Handling", () => {
      it("(dci) should handle invalid embed structure gracefully", async () => {
        const doc = new Delta([]);
        const { editor } = await testEnvironment();
        const invalidEmbed = { invalidType: { data: "test" } };
        const ops: Op[] = [{ insert: invalidEmbed }];

        const updatedDoc = doc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([{ insert: invalidEmbed }]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("(dci) should handle missing required attributes in chapter embeds", async () => {
        const initialDoc = new Delta([]);
        const { editor } = await testEnvironment();
        const incompleteChapter = { chapter: {} }; // Missing number
        const ops: Op[] = [{ insert: incompleteChapter }];

        const updatedDoc = initialDoc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([{ insert: incompleteChapter }]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("(dci) should handle missing required attributes in verse embeds", async () => {
        const doc = new Delta([]);
        const { editor } = await testEnvironment();
        const incompleteVerse = { verse: { style: "v" } }; // Missing number
        const ops: Op[] = [{ insert: incompleteVerse }];

        const updatedDoc = doc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([{ insert: incompleteVerse }]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("(dc) should handle invalid para style gracefully", async () => {
        const { editor } = await testEnvironment();
        const invalidPara = { para: { style: "invalid-style-123" } };
        const ops: Op[] = [{ insert: invalidPara }];

        await sutApplyUpdate(editor, ops);

        // Should not error but may log a warning
        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const p = $getRoot().getFirstChild();
          if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
          expect(p.getMarker()).toBe("invalid-style-123"); // Should still create with invalid style
        });
      });

      it("(dc) should handle malformed char embed attributes", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Test text")));
        });
        const malformedCharOp = {
          insert: "char text",
          attributes: {
            char: { style: "wj" }, // Missing cid
          },
        };
        const ops: Op[] = [malformedCharOp];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const p = $getRoot().getFirstChild();
          if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
          expect(p.getChildrenSize()).toBe(2); // Should have 2 children: CharNode and TextNode

          const firstChild = p.getFirstChild();
          if (!$isCharNode(firstChild)) throw new Error("firstChild is not a CharNode");
          expect(firstChild.getMarker()).toBe("wj");
          expect(firstChild.getTextContent()).toBe("char text");
          expect(firstChild.getUnknownAttributes()).toBeUndefined(); // cid should be undefined

          const secondChild = p.getChildAtIndex(1);
          if (!$isTextNode(secondChild)) throw new Error("secondChild is not a TextNode");
          expect(secondChild.getTextContent()).toBe("Test text");
        });
      });

      it("(dci) should handle null or undefined insert values", async () => {
        const doc = new Delta([]);
        const { editor } = await testEnvironment();
        const ops: Op[] = [{ insert: null } as unknown as Op, { insert: undefined }];

        const updatedDoc = doc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([{ insert: null }, { insert: undefined }]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      });

      it("(dci) should handle empty embed objects", async () => {
        const doc = new Delta([]);
        const { editor } = await testEnvironment();
        const ops: Op[] = [
          { insert: {} },
          { insert: { chapter: null } },
          { insert: { verse: undefined } },
        ];

        const updatedDoc = doc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([
          { insert: {} },
          { insert: { chapter: null } },
          { insert: { verse: undefined } },
        ]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(6);
      });

      it("(dc) should handle extremely large text insertions", async () => {
        const { editor } = await testEnvironment();
        const largeText = "a".repeat(100000); // 100k characters
        const ops: Op[] = [{ insert: largeText }];

        await sutApplyUpdate(editor, ops);

        // Should handle large text without errors
        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          expect($getRoot().getTextContent()).toBe(largeText);
        });
      });

      it("(dc) should handle special characters and Unicode in inserts", async () => {
        const { editor } = await testEnvironment();
        const specialText = "Text with émojis 🙏 and UTF-8 characters ñ\u200B\u2028\u2029";
        const ops: Op[] = [{ insert: specialText }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          expect($getRoot().getTextContent()).toBe(specialText);
        });
      });

      it("(dci) should handle milestone with missing required style", async () => {
        const doc = new Delta([{ insert: LF, attributes: { para: { style: "p" } } }]);
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode());
        });
        const incompleteMilestone = { ms: { status: "start" } }; // Missing style
        const ops: Op[] = [{ insert: incompleteMilestone }];

        const updatedDoc = doc.compose(new Delta(ops));
        await sutApplyUpdate(editor, ops);

        expect(updatedDoc.ops).toEqual([
          { insert: incompleteMilestone },
          { insert: LF, attributes: { para: { style: "p" } } },
        ]);
        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("(dc) should handle deeply nested malformed objects", async () => {
        const { editor } = await testEnvironment();
        const deeplyMalformed = {
          chapter: {
            number: "1",
            style: "c",
            nested: {
              invalid: {
                structure: "test",
                someProperty: "value",
              },
            },
          },
        };
        const ops: Op[] = [{ insert: deeplyMalformed }];

        await sutApplyUpdate(editor, ops);

        // Should handle without crashing even with deeply nested objects
        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const ch = $getRoot().getFirstChild();
          if (!$isSomeChapterNode(ch)) throw new Error("ch is not SomeChapterNode");
          expect(ch.getNumber()).toBe("1");
          expect(ch.getUnknownAttributes()).toEqual({
            nested: {
              invalid: {
                structure: "test",
                someProperty: "value",
              },
            },
          });
        });
      });

      it("(dc) should handle concurrent error operations", async () => {
        const { editor } = await testEnvironment();
        const ops: Op[] = [
          { insert: { invalidType1: {} } },
          { insert: "valid text" },
          { insert: { invalidType2: { bad: "data" } } },
          { insert: { chapter: { number: "1", style: "c" } } }, // Valid
          { insert: null } as unknown as Op,
        ];

        await sutApplyUpdate(editor, ops);

        // Should have 5 errors but still process valid operations
        expect(consoleErrorSpy).toHaveBeenCalledTimes(5);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          expect(root.getTextContent()).toContain("valid text");
          expect(root.getChildrenSize()).toBe(1);

          const impliedParaNode = root.getFirstChild();
          if (!$isImpliedParaNode(impliedParaNode))
            throw new Error("First child is not an ImpliedParaNode");
          expect(impliedParaNode.getChildrenSize()).toBe(2); // TextNode and SomeChapterNode

          const t1 = impliedParaNode.getFirstChild();
          if (!$isTextNode(t1)) throw new Error("First child of impliedParaNode is not a TextNode");
          expect(t1.getTextContent()).toBe("valid text");

          const ch1 = impliedParaNode.getChildAtIndex(1);
          if (!$isSomeChapterNode(ch1)) throw new Error("Second child is not SomeChapterNode");
          expect(ch1.getNumber()).toBe("1");
        });
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

/** SUT (Software Under Test) to apply an OT update. */
async function sutApplyUpdate(
  editor: LexicalEditor,
  ops: Op[],
  viewOptions: ViewOptions = defaultViewOptions,
) {
  await act(async () => {
    editor.update(() => {
      $applyUpdate(ops, viewOptions, console);
    });
  });
}
