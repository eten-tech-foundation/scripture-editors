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
import { $isCharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode, $isImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $isMilestoneNode } from "shared/nodes/usj/MilestoneNode";
import { $isSomeChapterNode } from "shared/nodes/usj/node.utils";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";

const defaultViewOptions = getDefaultViewOptions();

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

    it("should retain with format attributes", async () => {
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

    it("should retain 1st word with format attributes after retain without attributes", async () => {
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

    it("should retain middle word with format attributes after retain without attributes", async () => {
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

    it("should retain last word with format attributes after retain without attributes", async () => {
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

    it("should retain embedded para with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const ops: Op[] = [{ retain: 1, attributes: { style: "q1" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getMarker()).toBe("q1");
      });
    });

    it("should retain embedded chapter with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createImmutableChapterNode("1"));
      });
      const ops: Op[] = [{ retain: 1, attributes: { number: "2" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const ch2 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(ch2)) throw new Error("ch2 is not SomeChapterNode");
        expect(ch2.getNumber()).toBe("2");
      });
    });

    it("should retain embedded verse with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createImmutableVerseNode("1")));
      });
      const ops: Op[] = [{ retain: 1, attributes: { number: "1-2" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1);

        const v1 = p.getFirstChild();
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not SomeVerseNode");
        expect(v1.getNumber()).toBe("1-2");
      });
    });

    it("should retain embedded char", async () => {
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

    it("should transform text to CharNode and apply top-level formats to inner text", async () => {
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

    it("should fallback to standard attribute application if char.style is missing", async () => {
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

    it("should transform text to CharNode when retain spans multiple TextNodes", async () => {
      const part1 = "FirstPart";
      const part2 = "SecondPart";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(part1), $createTextNode(part2)));
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
        expect(p.getChildrenSize()).toBe(1); // Adjacent TextNodes are combined in Lexical.
      });

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getChildrenSize()).toBe(1); // Original TextNodes should be replaced by one CharNode

        const charNode = p.getFirstChild();
        if (!$isCharNode(charNode)) throw new Error("charNode is not a CharNode");
        expect(charNode.getMarker()).toBe("sp");
        expect(charNode.getTextContent()).toBe(part1 + part2);
        expect(charNode.getUnknownAttributes()).toEqual({ cid });
      });
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

        const v1Node = p.getChildAtIndex(1);
        // Check that it's still a VerseNode, not transformed into a CharNode
        if (!$isSomeVerseNode(v1Node)) throw new Error("verseNode is not SomeVerseNode");

        // Check if 'customVerseAttr' was applied
        expect(v1Node.getUnknownAttributes()).toEqual(
          expect.objectContaining({ customVerseAttr: "applied" }),
        );
      });
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
      const ops: Op[] = [{ delete: 4 }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Delete: 4");
      expect(consoleDebugSpy).toHaveBeenCalledTimes(2);
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
      expect(consoleDebugSpy).toHaveBeenCalledTimes(3);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("");
      });
    });

    it("should insert text into an empty editor", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: "Jesus wept." }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus wept.");
      });
    });

    it("should insert text into an editor with empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const ops: Op[] = [{ insert: "Jesus wept." }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toBe("Jesus wept.");
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

    it("should insert a chapter embed into an empty editor", async () => {
      const { editor } = await testEnvironment();
      const ch1Embed = { chapter: { number: "1", style: "c" } };
      const ops: Op[] = [{ insert: ch1Embed }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const ch1 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(ch1)) throw new Error("c1 is not SomeChapterNode");
        expect(ch1.getNumber()).toBe("1");
      });
    });

    it("should insert a chapter embed at the beginning of a document with existing content", async () => {
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

    it("should insert a chapter embed after an existing ParaNode at the root level", async () => {
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

    it("should insert a verse embed at the end of a document with existing content", async () => {
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

    it("should insert a verse embed inside text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const embedVerse = { verse: { number: "1", style: "v" } };
      const ops: Op[] = [{ retain: 6 }, { insert: embedVerse }];

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

    it("should insert an embed when the targetIndex is out of bounds", async () => {
      const initialText = "Short text."; // Length 11
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedVerse = { verse: { number: "10", style: "v" } };
      // Retain past the end of the text and the ParaNode itself.
      // initialText.length (11) + 1 (for ParaNode) = 12. Retain 20.
      const ops: Op[] = [{ retain: 20 }, { insert: embedVerse }];

      await sutApplyUpdate(editor, ops);

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

    it("should insert an embed between two existing embed nodes", async () => {
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

    it("should insert para with attributes", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: { para: { style: "q1" } } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a ParaNode");
        expect(p.getMarker()).toBe("q1");
      });
    });

    it("should insert a char embed in empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const wordsOfJesus = "It is finished.";
      const insertCharOp = {
        insert: wordsOfJesus,
        attributes: {
          segment: "verse_1_1",
          char: { style: "wj", cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545" },
        },
      };
      const ops: Op[] = [insertCharOp];

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
        expect(char.getUnknownAttributes()).toEqual({
          cid: "afd886c6-2397-4e4c-8a94-696bf9f2e545",
        });
      });
    });

    it("should insert a char embed inside text and apply attributes after", async () => {
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

    it("should insert milestone embeds in empty para", async () => {
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

    it("should insert milestone embeds before and in text", async () => {
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

        const t1 = p.getChildAtIndex(1);
        if (!$isTextNode(t1)) throw new Error("t1 is not a TextNode");
        expect(t1.getTextContent()).toBe("“So you say,”");

        const msEnd = p.getChildAtIndex(2);
        if (!$isMilestoneNode(msEnd)) throw new Error("msEnd is not a MilestoneNode");
        expect(msEnd.getMarker()).toBe(msEndEmbed.ms.style);

        const t2 = p.getChildAtIndex(3);
        if (!$isTextNode(t2)) throw new Error("t2 is not a TextNode");
        expect(t2.getTextContent()).toBe(" answered Jesus.");
      });
    });

    it("should sequentially insert multiple items into an empty document", async () => {
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
        {
          insert: LF, // 11
        },
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
      it("should insert a simple line break in empty editor", async () => {
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

      it("should insert line break with para attributes", async () => {
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

      it("should handle line break insertion in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("First line text")));
        });
        const ops: Op[] = [{ retain: 10 }, { insert: LF }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks in regular ParaNodes don't create new paragraphs
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          // The text remains unchanged since line breaks don't split regular ParaNodes
          expect(para.getTextContent()).toBe("First line text");
        });
      });

      it("should handle line break with para attributes in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Original paragraph text")));
        });
        const ops: Op[] = [
          { retain: 9 }, // After "Original "
          { insert: LF, attributes: { para: { style: "q2" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks don't split regular ParaNodes, even with para attributes
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          // The text and marker remain unchanged
          expect(para.getTextContent()).toBe("Original paragraph text");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break at the beginning of regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Content here")));
        });
        const ops: Op[] = [{ insert: LF, attributes: { para: { style: "q1" } } }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks at beginning of regular ParaNode don't create new paragraphs
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getTextContent()).toBe("Content here");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break at the end of regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Full content")));
        });
        const ops: Op[] = [{ retain: 12 }, { insert: LF, attributes: { para: { style: "b" } } }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line breaks at end of regular ParaNode don't create new paragraphs
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getTextContent()).toBe("Full content");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle multiple consecutive line breaks in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Base text")));
        });
        const ops: Op[] = [
          { retain: 4 }, // After "Base"
          { insert: LF, attributes: { para: { style: "q1" } } },
          { insert: LF, attributes: { para: { style: "q2" } } },
          { insert: LF }, // No attributes - should create ImpliedParaNode
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Multiple line breaks in regular ParaNode don't create new paragraphs
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getTextContent()).toBe("Base text");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break between embeds in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createTextNode("First verse text"),
              $createImmutableVerseNode("2"),
              $createTextNode("Second verse text"),
            ),
          );
        });
        const ops: Op[] = [
          { retain: 2 + 16 }, // After verse 1 and "First verse text"
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break between embeds in regular ParaNode doesn't split the paragraph
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getChildrenSize()).toBe(4); // verse 1 + text + verse 2 + text
          expect(para.getTextContent()).toBe("First verse textSecond verse text");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break with text formatting preservation in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          const para = $createParaNode();
          const boldText = $createTextNode("Bold text ");
          boldText.setFormat("bold");
          const regularText = $createTextNode("regular text");
          para.append(boldText, regularText);
          $getRoot().append(para);
        });
        const ops: Op[] = [
          { retain: 10 }, // After "Bold text "
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode doesn't split the paragraph
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getMarker()).toBe("p"); // Original marker preserved

          // Text formatting should still be preserved
          expect(para.getChildrenSize()).toBe(2);
          const boldText = para.getFirstChild();
          if (!$isTextNode(boldText)) throw new Error("boldText is not a TextNode");
          expect(boldText.getTextContent()).toBe("Bold text ");
          expect(boldText.hasFormat("bold")).toBe(true);

          const regularText = para.getChildAtIndex(1);
          if (!$isTextNode(regularText)) throw new Error("regularText is not a TextNode");
          expect(regularText.getTextContent()).toBe("regular text");
          expect(regularText.hasFormat("bold")).toBe(false);
        });
      });

      it("should handle line break in complex document structure in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createImmutableChapterNode("1"),
            $createParaNode().append(
              $createImmutableVerseNode("1"),
              $createTextNode("In the beginning God created the heavens and the earth."),
            ),
          );
        });
        const ops: Op[] = [
          { retain: 1 + 1 + 17 }, // After chapter + verse + "In the beginning"
          { insert: LF, attributes: { para: { style: "q1" } } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode doesn't split it, even in complex structure
          expect(root.getChildrenSize()).toBe(2); // chapter + 1 para

          const chapter = root.getFirstChild();
          if (!$isSomeChapterNode(chapter)) throw new Error("chapter is not SomeChapterNode");
          expect(chapter.getNumber()).toBe("1");

          const para = root.getChildAtIndex(1);
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getTextContent()).toBe(
            "In the beginning God created the heavens and the earth.",
          );
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break with invalid para style gracefully in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Test content")));
        });
        const ops: Op[] = [
          { retain: 4 },
          { insert: LF, attributes: { para: { style: "invalid-marker-xyz" } } },
        ];

        await sutApplyUpdate(editor, ops);

        // Should not error even with invalid style
        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          const root = $getRoot();
          // Line break in regular ParaNode doesn't split it, even with invalid style
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getTextContent()).toBe("Test content");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
        });
      });

      it("should handle line break with mixed attributes in regular ParaNode (no splitting)", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode().append($createTextNode("Mixed attributes test")));
        });
        const ops: Op[] = [
          { retain: 5 },
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
          // Line break in regular ParaNode doesn't split it, even with mixed attributes
          expect(root.getChildrenSize()).toBe(1);

          const para = root.getFirstChild();
          if (!$isParaNode(para)) throw new Error("para is not a ParaNode");
          expect(para.getMarker()).toBe("p"); // Original marker preserved
          expect(para.getTextContent()).toBe("Mixed attributes test");
          // Note: non-para attributes should be ignored for line breaks
        });
      });

      // Tests for actual line break functionality with ImpliedParaNodes
      it("should replace ImpliedParaNode with ParaNode when LF has para attributes", async () => {
        const { editor } = await testEnvironment(() => {
          // Start with an ImpliedParaNode containing text
          $getRoot().append(
            $createImpliedParaNode().append($createTextNode("Implied para content")),
          );
        });
        const ops: Op[] = [
          { retain: 20 }, // After "Implied para content" (at the ImpliedParaNode's closing marker)
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
          expect(para.getTextContent()).toBe("Implied para content");
        });
      });

      it("should do nothing when LF without attributes is inserted in ImpliedParaNode", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append(
            $createImpliedParaNode().append($createTextNode("Implied para content")),
          );
        });
        const ops: Op[] = [
          { retain: 20 }, // After "Implied para content" (at the ImpliedParaNode's closing marker)
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
          expect(impliedPara.getTextContent()).toBe("Implied para content");
        });
      });

      it("should replace empty ImpliedParaNode with ParaNode when LF has para attributes", async () => {
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
      it("should handle invalid embed structure gracefully", async () => {
        const { editor } = await testEnvironment();
        const invalidEmbed = { invalidType: { data: "test" } };
        const ops: Op[] = [{ insert: invalidEmbed }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("should handle missing required attributes in chapter embeds", async () => {
        const { editor } = await testEnvironment();
        const incompleteChapter = { chapter: {} }; // Missing number
        const ops: Op[] = [{ insert: incompleteChapter }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("should handle missing required attributes in verse embeds", async () => {
        const { editor } = await testEnvironment();
        const incompleteVerse = { verse: { style: "v" } }; // Missing number
        const ops: Op[] = [{ insert: incompleteVerse }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("should handle invalid para style gracefully", async () => {
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

      it("should handle malformed char embed attributes", async () => {
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

          const secondChild = p.getChildAtIndex(1);
          if (!$isTextNode(secondChild)) throw new Error("secondChild is not a TextNode");
          expect(secondChild.getTextContent()).toBe("Test text");
        });
      });

      it("should handle null or undefined insert values", async () => {
        const { editor } = await testEnvironment();
        const ops: Op[] = [{ insert: null } as unknown as Op, { insert: undefined }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      });

      it("should handle empty embed objects", async () => {
        const { editor } = await testEnvironment();
        const ops: Op[] = [
          { insert: {} },
          { insert: { chapter: null } },
          { insert: { verse: undefined } },
        ];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(6);
      });

      it("should handle extremely large text insertions", async () => {
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

      it("should handle special characters and Unicode in inserts", async () => {
        const { editor } = await testEnvironment();
        const specialText = "Text with émojis 🙏 and UTF-8 characters ñ\u200B\u2028\u2029";
        const ops: Op[] = [{ insert: specialText }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
        editor.getEditorState().read(() => {
          expect($getRoot().getTextContent()).toBe(specialText);
        });
      });

      it("should handle milestone with missing required style", async () => {
        const { editor } = await testEnvironment(() => {
          $getRoot().append($createParaNode());
        });
        const incompleteMilestone = { ms: { status: "start" } }; // Missing style
        const ops: Op[] = [{ insert: incompleteMilestone }];

        await sutApplyUpdate(editor, ops);

        expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining("Cannot create LexicalNode for embed object"),
        );
      });

      it("should handle deeply nested malformed objects", async () => {
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
        });
      });

      it("should handle concurrent error operations", async () => {
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

    xit("Delta playground of the following test", async () => {
      const delta = new Delta()
        .insert({ chapter: { number: "1", style: "c" } })
        .insert({ para: { style: "p" } })
        .insert({ chapter: { number: "2", style: "c" } })
        .insert({ para: { style: "q1" } })
        .insert({ ms: { style: "ts-s", sid: "TS1" } });

      delta.eachLine((line, attributes, i) => console.debug(line, attributes, i));

      expect(consoleDebugSpy).toHaveBeenCalledTimes(1);
      expect(consoleDebugSpy).toHaveBeenNthCalledWith(
        1,
        {
          ops: [
            { insert: { chapter: { number: "1", style: "c" } } },
            { insert: { para: { style: "p" } } },
            { insert: { chapter: { number: "2", style: "c" } } },
            { insert: { para: { style: "q1" } } },
            { insert: { ms: { style: "ts-s", sid: "TS1" } } },
          ],
        },
        {},
        0,
      );
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
