import { replaceBrothersWithBrethren } from "./delta-utils-test.data";
import { $applyUpdate } from "./delta.utils";
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
import { getViewOptions, ViewOptions } from "shared-react/views/view-options.utils";
import { TypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { $isCharNode } from "shared/nodes/usj/CharNode";
import { $createImmutableChapterNode } from "shared/nodes/usj/ImmutableChapterNode";
import { $createImpliedParaNode } from "shared/nodes/usj/ImpliedParaNode";
import { $isMilestoneNode } from "shared/nodes/usj/MilestoneNode";
import { $isSomeChapterNode } from "shared/nodes/usj/node.utils";
import { $createParaNode, $isParaNode } from "shared/nodes/usj/ParaNode";

const defaultViewOptions = getViewOptions() as ViewOptions;

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
      const ops: Op[] = [{ retain: 5, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(1, "Retain: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(2);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesu");
        expect(t1.hasFormat("bold")).toBe(true);
        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe("s wept.");
        expect(t2.hasFormat("bold")).toBe(false);
      });
    });

    it("should retain 1st word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 1 }, { retain: 5, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleDebugSpy).toHaveBeenNthCalledWith(2, "Retain: 5");
      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(2);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus");
        expect(t1.hasFormat("bold")).toBe(true);
        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe(" wept.");
        expect(t2.hasFormat("bold")).toBe(false);
      });
    });

    it("should retain middle word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 7 }, { retain: 4, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(3);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus ");
        expect(t1.hasFormat("bold")).toBe(false);
        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe("wept");
        expect(t2.hasFormat("bold")).toBe(true);
        const t3 = p.getChildAtIndex(2);
        if (!$isTextNode(t3)) throw new Error("t2 is not a text node");
        expect(t3.getTextContent()).toBe(".");
        expect(t3.hasFormat("bold")).toBe(false);
      });
    });

    it("should retain last word with format attributes after retain without attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const ops: Op[] = [{ retain: 7 }, { retain: 5, attributes: { bold: true } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(2);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus ");
        expect(t1.hasFormat("bold")).toBe(false);
        const t2 = p.getChildAtIndex(1);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
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
        if (!$isParaNode(p)) throw new Error("p is not a para node");
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
        const c2 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(c2)) throw new Error("c2 is not some chapter node");
        expect(c2.getNumber()).toBe("2");
      });
    });

    it("should retain embedded verse with attributes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createImmutableVerseNode("1")));
      });
      const ops: Op[] = [{ retain: 1 }, { retain: 1, attributes: { number: "1-2" } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(1);
        const v1 = p.getFirstChild();
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not some verse node");
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
      const ops: Op[] = [{ retain: 12 }, { retain: wordsOfJesus.length, attributes }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(2);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus said ");
        const char = p.getChildAtIndex(1);
        if (!$isCharNode(char)) throw new Error("char is not a char node");
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
        { retain: 1 + prefix.length }, // Retain 1 for the para node.
        {
          retain: transformText.length,
          attributes: { char: { style: "xt", cid }, bold: true },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(3); // Prefix text, CharNode, Suffix text

        const prefixTextNode = p.getFirstChild();
        if (!$isTextNode(prefixTextNode)) throw new Error("prefix is not a text node");
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
        if (!$isTextNode(suffixTextNode)) throw new Error("suffix is not a text node");
        expect(suffixTextNode.getTextContent()).toBe(suffix);
      });
    });

    it("should fallback to standard attribute application if char.style is missing", async () => {
      const text = "FormatThisText";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const ops: Op[] = [
        { retain: 1 }, // Retain 1 for the para node.
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
        if (!$isParaNode(p)) throw new Error("p is not a para node");
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
        { retain: 1 }, // Retain 1 for the para node.
        {
          retain: part1.length + part2.length,
          attributes: { char: { style: "sp", cid } },
        },
      ];
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(1); // Adjacent TextNodes are combined in Lexical.
      });

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
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
        { retain: 1 + textBefore.length }, // Retain 1 for the para node.
        {
          retain: 1, // This targets the VerseNode
          attributes: { char: { style: "xt", cid: "verse-char-attr" }, customVerseAttr: "applied" },
        },
      ];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(3);

        const verseNode = p.getChildAtIndex(1);
        // Check that it's still a VerseNode, not transformed into a CharNode
        if (!$isSomeVerseNode(verseNode)) throw new Error("verseNode is not a VerseNode");

        // Check if 'customVerseAttr' was applied
        expect(verseNode.getUnknownAttributes()).toEqual(
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
      const embedChapter = { chapter: { number: "1", style: "c" } };
      const ops: Op[] = [{ insert: embedChapter }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const c1 = $getRoot().getFirstChild();
        if (!$isSomeChapterNode(c1)) throw new Error("c1 is not a chapter node");
        expect(c1.getNumber()).toBe("1");
        expect(c1.getMarker()).toBe("c");
      });
    });

    it("should insert a chapter embed at the beginning of a document with existing content", async () => {
      const initialText = "Initial text.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedChapter = { chapter: { number: "1", style: "c" } };
      // No retain, so insert happens at the current index 0 before the ParaNode.
      const ops: Op[] = [{ insert: embedChapter }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2);

        const firstChild = root.getFirstChild();
        if (!$isSomeChapterNode(firstChild)) throw new Error("First child is not a ChapterNode");
        expect(firstChild.getNumber()).toBe("1");
        expect(firstChild.getMarker()).toBe("c");

        const secondChild = root.getChildAtIndex(1);
        if (!$isParaNode(secondChild)) throw new Error("Second child is not a ParaNode");
        expect(secondChild.getTextContent()).toBe(initialText);
      });
    });

    it("should insert a chapter embed after an existing ParaNode at the root level", async () => {
      const initialText = "Some initial content in a para.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedChapter = { chapter: { number: "2", style: "c" } };
      // Retain past the initial text in the para node (length + 1 for the para itself)
      const ops: Op[] = [{ retain: 1 + initialText.length }, { insert: embedChapter }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(2); // ParaNode and ChapterNode

        const firstChild = root.getFirstChild();
        if (!$isParaNode(firstChild)) throw new Error("First child should be ParaNode");
        expect(firstChild.getTextContent()).toBe(initialText);
        expect(firstChild.getChildrenSize()).toBe(1); // Only the TextNode

        const secondChild = root.getChildAtIndex(1);
        if (!$isSomeChapterNode(secondChild)) throw new Error("Second child should be ChapterNode");
        expect(secondChild.getNumber()).toBe("2");
        expect(secondChild.getMarker()).toBe("c");
      });
    });

    it("should insert a verse embed at the end of a document with existing content", async () => {
      const initialText = "Initial text.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedVerse = { verse: { number: "1", style: "v" } };
      // Retain past the initial text in the para node (length + 1 for the para itself)
      const ops: Op[] = [{ retain: initialText.length + 1 }, { insert: embedVerse }];

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

        const verseNode = paraNode.getChildAtIndex(1);
        if (!$isSomeVerseNode(verseNode))
          throw new Error("Second child of para is not a VerseNode");
        expect(verseNode.getNumber()).toBe("1");
        expect(verseNode.getMarker()).toBe("v");
      });
    });

    it("should insert a verse embed inside text", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode("Jesus wept.")));
      });
      const embedVerse = { verse: { number: "1", style: "v" } };
      const ops: Op[] = [{ retain: 7 }, { insert: embedVerse }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(3);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus ");
        const v1 = p.getChildAtIndex(1);
        if (!$isSomeVerseNode(v1)) throw new Error("v1 is not a verse node");
        expect(v1.getNumber()).toBe("1");
        expect(v1.getMarker()).toBe("v");
        const t2 = p.getChildAtIndex(2);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe("wept.");
      });
    });

    it("should insert an embed when the targetIndex is out of bounds", async () => {
      const initialText = "Short text."; // Length 11
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(initialText)));
      });
      const embedVerse = { verse: { number: "10", style: "v" } };
      // Retain past the end of the text and the para node itself.
      // initialText.length (11) + 1 (for ParaNode) = 12. Retain 20.
      const ops: Op[] = [{ retain: 20 }, { insert: embedVerse }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1);
        const paraNode = root.getFirstChild();
        if (!$isParaNode(paraNode)) throw new Error("First child is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(2); // Initial TextNode + VerseNode

        const verseNode = paraNode.getLastChild();
        if (!$isSomeVerseNode(verseNode)) throw new Error("Last child of para is not a VerseNode");
        expect(verseNode.getNumber()).toBe("10");
        expect(verseNode.getMarker()).toBe("v");
      });
    });

    it("should insert an embed between two existing embed nodes", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append(
          $createParaNode().append($createImmutableVerseNode("1"), $createImmutableVerseNode("3")),
        );
      });
      const embedVerseToInsert = { verse: { number: "2", style: "v" } };
      // Retain past the ParaNode (1) and the first VerseNode (1)
      const ops: Op[] = [{ retain: 1 + 1 }, { insert: embedVerseToInsert }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(1); // Root should still have one ParaNode

        const paraNode = root.getFirstChild();
        if (!$isParaNode(paraNode)) throw new Error("First child is not a ParaNode");
        expect(paraNode.getChildrenSize()).toBe(3); // Verse1, VerseToInsert, Verse3

        const verse1 = paraNode.getChildAtIndex(0);
        if (!$isSomeVerseNode(verse1)) throw new Error("Child 0 of para is not VerseNode");
        expect(verse1.getNumber()).toBe("1");

        const verse2 = paraNode.getChildAtIndex(1);
        if (!$isSomeVerseNode(verse2)) throw new Error("Child 1 of para is not VerseNode");
        expect(verse2.getNumber()).toBe("2");

        const verse3 = paraNode.getChildAtIndex(2);
        if (!$isSomeVerseNode(verse3)) throw new Error("Child 2 of para is not VerseNode");
        expect(verse3.getNumber()).toBe("3");
      });
    });

    it("should insert para with attributes", async () => {
      const { editor } = await testEnvironment();
      const ops: Op[] = [{ insert: { para: { style: "q1" } } }];

      await sutApplyUpdate(editor, ops);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(0);
      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
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
      const ops: Op[] = [{ retain: 1 }, insertCharOp];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        const char = p.getFirstChild();
        if (!$isCharNode(char)) throw new Error("char is not a char node");
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
      const ops: Op[] = [{ retain: 12 }, insertCharOp, { retain: 3 }, { retain: 4, attributes }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(4);
        const t1 = p.getFirstChild();
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("Jesus said ");
        const char = p.getChildAtIndex(1);
        if (!$isCharNode(char)) throw new Error("char is not a char node");
        expect(char.getTextContent()).toBe(wordsOfJesus);
        expect(char.getMarker()).toBe("wj");
        const t2 = p.getChildAtIndex(2);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe("to ");
        expect(t2.hasFormat("italic")).toBe(false);
        const t3 = p.getChildAtIndex(3);
        if (!$isTextNode(t3)) throw new Error("t3 is not a text node");
        expect(t3.getTextContent()).toBe("them");
        expect(t3.hasFormat("italic")).toBe(true);
      });
    });

    it("should insert milestone embeds in empty para", async () => {
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode());
      });
      const embedStartMS = { ms: { style: "qt-s", status: "start", who: "Jesus" } };
      const ops: Op[] = [{ retain: 1 }, { insert: embedStartMS }];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getChildrenSize()).toBe(1);
        const startMilestone = p.getFirstChild();
        if (!$isMilestoneNode(startMilestone))
          throw new Error("startMilestone is not a milestone node");
        expect(startMilestone.getMarker()).toBe("qt-s");
        expect(startMilestone.getUnknownAttributes()).toEqual({ status: "start", who: "Jesus" });
      });
    });

    it("should insert milestone embeds before and in text", async () => {
      const text = "“So you say,” answered Jesus.";
      const { editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });
      const embedStartMS = { ms: { style: "qt-s", status: "start", who: "Jesus" } };
      const embedEndMS = { ms: { style: "qt-e", status: "end" } };
      const ops: Op[] = [
        { retain: 1 },
        { insert: embedStartMS },
        { retain: 13 },
        { insert: embedEndMS },
      ];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const p = $getRoot().getFirstChild();
        if (!$isParaNode(p)) throw new Error("p is not a para node");
        expect(p.getTextContent()).toBe(text);
        expect(p.getChildrenSize()).toBe(4);
        const msStart = p.getFirstChild();
        if (!$isMilestoneNode(msStart)) throw new Error("msStart is not a milestone node");
        expect(msStart.getMarker()).toBe(embedStartMS.ms.style);
        const t1 = p.getChildAtIndex(1);
        if (!$isTextNode(t1)) throw new Error("t1 is not a text node");
        expect(t1.getTextContent()).toBe("“So you say,”");
        const msEnd = p.getChildAtIndex(2);
        if (!$isMilestoneNode(msEnd)) throw new Error("msEnd is not a milestone node");
        expect(msEnd.getMarker()).toBe(embedEndMS.ms.style);
        const t2 = p.getChildAtIndex(3);
        if (!$isTextNode(t2)) throw new Error("t2 is not a text node");
        expect(t2.getTextContent()).toBe(" answered Jesus.");
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

    xit("should sequentially insert multiple embeds into an empty document", async () => {
      const { editor } = await testEnvironment();
      const embedChapter1 = { chapter: { number: "1", style: "c" } };
      const embedParaP = { para: { style: "p" } };
      const embedChapter2 = { chapter: { number: "2", style: "c" } };
      const embedParaQ1 = { para: { style: "q1" } };
      const embedMilestone = { ms: { style: "ts-s", sid: "TS1" } };
      const ops: Op[] = [
        { insert: embedChapter1 },
        { insert: embedParaP },
        { insert: embedChapter2 },
        { insert: embedParaQ1 },
        { insert: embedMilestone },
      ];

      await sutApplyUpdate(editor, ops);

      editor.getEditorState().read(() => {
        const root = $getRoot();
        expect(root.getChildrenSize()).toBe(3); // Chapter1, ParaP, Chapter2, ParaQ1, Milestone

        const chapter1Node = root.getChildAtIndex(0);
        if (!$isSomeChapterNode(chapter1Node)) throw new Error("Child 0 is not a ChapterNode");
        expect(chapter1Node.getNumber()).toBe("1");
        expect(chapter1Node.getMarker()).toBe("c");

        const paraPNode = root.getChildAtIndex(1);
        if (!$isParaNode(paraPNode)) throw new Error("Child 1 is not a ParaNode");
        expect(paraPNode.getMarker()).toBe("p");
        expect(paraPNode.getChildrenSize()).toBe(0); // ParaP should be empty

        const chapter2Node = root.getChildAtIndex(2);
        if (!$isSomeChapterNode(chapter2Node)) throw new Error("Child 2 is not a ChapterNode");
        expect(chapter2Node.getNumber()).toBe("2");
        expect(chapter2Node.getMarker()).toBe("c2");

        const paraQ1Node = root.getChildAtIndex(3);
        if (!$isParaNode(paraQ1Node)) throw new Error("Child 3 is not a ParaNode");
        expect(paraQ1Node.getMarker()).toBe("q1");
        expect(paraQ1Node.getChildrenSize()).toBe(0);

        const milestoneNode = root.getChildAtIndex(4);
        if (!$isMilestoneNode(milestoneNode))
          throw new Error("Child of ParaQ1 is not a MilestoneNode");
        expect(milestoneNode.getMarker()).toBe("ts-s");
        expect(milestoneNode.getUnknownAttributes()).toEqual({ sid: "TS1" });
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
