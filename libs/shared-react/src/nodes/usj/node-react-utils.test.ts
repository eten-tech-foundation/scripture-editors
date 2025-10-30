// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { ViewOptions } from "../../views/view-options.utils";
import { $isImmutableNoteCallerNode, ImmutableNoteCallerNode } from "./ImmutableNoteCallerNode";
import { ImmutableVerseNode, $createImmutableVerseNode } from "./ImmutableVerseNode";
import {
  $findVerseInNode,
  $findVerseOrPara,
  $findLastVerse,
  $findThisVerse,
  $insertNote,
} from "./node-react.utils";
import { UsjNodeOptions } from "./usj-node-options.model";
import { $createTextNode, $getNodeByKey, $getRoot, NodeKey } from "lexical";
import {
  $createBookNode,
  $createImmutableChapterNode,
  $createParaNode,
  $createTypedMarkNode,
  $createVerseNode,
  $isCharNode,
  $isNoteNode,
  CharNode,
  GENERATOR_NOTE_CALLER,
  HIDDEN_NOTE_CALLER,
  ImmutableChapterNode,
  NoteNode,
  ParaNode,
  TypedMarkNode,
} from "shared";

describe("$findVerseInNode()", () => {
  it("should find the given verse in the node", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createVerseNode("1");
        const v2 = $createVerseNode("2");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findVerseInNode($getRoot().getChildren()[0], 2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });

  it("should find the first verse in the node when the verse is a range", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createVerseNode("1");
        const v2 = $createVerseNode("2-3");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findVerseInNode($getRoot().getChildren()[0], 2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2-3");
    });
  });

  it("should find the last verse in the node when the verse is a range", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createVerseNode("1");
        const v2 = $createVerseNode("2-3");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findVerseInNode($getRoot().getChildren()[0], 3);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2-3");
    });
  });

  it("should find the first verse in the node when the verse is a range with segments", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createVerseNode("1");
        const v2 = $createVerseNode("2a-3b");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findVerseInNode($getRoot().getChildren()[0], 2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2a-3b");
    });
  });
});

describe("$findVerseOrPara()", () => {
  let s1NodeKey: NodeKey;

  it("should find the given verse in the nodes before the first verse", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const id = $createBookNode("GEN");
        const s1 = $createParaNode("s1");
        const h1 = $createParaNode("h");
        const p1 = $createParaNode();
        root.append(id, s1, h1, p1);
        s1NodeKey = s1.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const sectionNode = $findVerseOrPara($getRoot().getChildren(), 0);

      expect(sectionNode).toBeDefined();
      expect(sectionNode?.getKey()).toBe(s1NodeKey);
    });
  });
});

describe("$findLastVerse()", () => {
  it("should find the last verse in node", () => {
    const { editor } = createBasicTestEnvironment();
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createVerseNode("1");
        const v2 = $createVerseNode("2");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findLastVerse($getRoot().getChildren());

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });

  it("should find the last immutable verse in node", () => {
    const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode]);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const v2 = $createImmutableVerseNode("2");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const verseNode = $findLastVerse($getRoot().getChildren());

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });
});

describe("$findThisVerse()", () => {
  it("should find the last verse in node", () => {
    let t2Key: string;
    const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode]);
    /*
     *    root
     *     p1
     * v1 t1 v2 t2
     *          ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const v2 = $createImmutableVerseNode("2");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, t2);
        t2Key = t2.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const t2 = $getNodeByKey(t2Key);
      const verseNode = $findThisVerse(t2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });

  it("should find the last verse in node when the text is in a mark", () => {
    let t2Key: string;
    const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode, TypedMarkNode]);
    /*
     *    root
     *     p1
     * v1 t1 v2 m1
     *          t2
     *          ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const v2 = $createImmutableVerseNode("2");
        const t1 = $createTextNode("text1");
        const m1 = $createTypedMarkNode({ testType1: ["testID1"] });
        const t2 = $createTextNode("text2");
        root.append(p1);
        p1.append(v1, t1, v2, m1);
        m1.append(t2);
        t2Key = t2.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const t2 = $getNodeByKey(t2Key);
      const verseNode = $findThisVerse(t2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });

  it("should find the verse in a previous parent node", () => {
    let t3Key: string;
    const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode]);
    /*
     *         root
     *   p1     p2    p3
     * v1 t1    t2    t3
     *                ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const p2 = $createParaNode();
        const p3 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        const t3 = $createTextNode("text3");
        root.append(p1, p2, p3);
        p1.append(v1, t1);
        p2.append(t2);
        p3.append(t3);
        t3Key = t3.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const t3 = $getNodeByKey(t3Key);
      const verseNode = $findThisVerse(t3);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("1");
    });
  });

  it("should find the last verse in the previous parent node", () => {
    let t2Key: string;
    const { editor } = createBasicTestEnvironment([ParaNode, ImmutableVerseNode]);
    /*
     *       root
     *    p1       p2
     * v1 t1 v2    t2
     *             ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const p2 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const v2 = $createImmutableVerseNode("2");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(p1, p2);
        p1.append(v1, t1, v2);
        p2.append(t2);
        t2Key = t2.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const t2 = $getNodeByKey(t2Key);
      const verseNode = $findThisVerse(t2);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("2");
    });
  });

  it("should find the last verse in a previous parent node if the para is empty", () => {
    let p3Key: string;
    const { editor } = createBasicTestEnvironment([
      ImmutableChapterNode,
      ParaNode,
      ImmutableVerseNode,
    ]);
    /*
     *         root
     * c1    p1     p2    p3
     *     v1 t1    t2
     *                    ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const c1 = $createImmutableChapterNode("1");
        const p1 = $createParaNode();
        const p2 = $createParaNode();
        const p3 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const t1 = $createTextNode("text1");
        const t2 = $createTextNode("text2");
        root.append(c1, p1, p2, p3);
        p1.append(v1, t1);
        p2.append(t2);
        p3Key = p3.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const p3 = $getNodeByKey(p3Key);
      const verseNode = $findThisVerse(p3);

      expect(verseNode).toBeDefined();
      expect(verseNode?.getNumber()).toEqual("1");
    });
  });

  it("should not find a verse if a chapter is encountered first from para", () => {
    let p2Key: string;
    const { editor } = createBasicTestEnvironment([
      ImmutableChapterNode,
      ImmutableVerseNode,
      ParaNode,
    ]);
    /*
     *   root
     * p1 c1 p2
     * v1    ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const c1 = $createImmutableChapterNode("1");
        const p2 = $createParaNode();
        root.append(p1, c1, p2);
        p1.append(v1);
        p2Key = p2.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const p2 = $getNodeByKey(p2Key);
      const verseNode = $findThisVerse(p2);

      expect(verseNode).toBeUndefined();
    });
  });

  it("should not find a verse if a chapter is encountered first from text", () => {
    let t1Key: string;
    const { editor } = createBasicTestEnvironment([
      ImmutableChapterNode,
      ImmutableVerseNode,
      ParaNode,
    ]);
    /*
     *   root
     * p1 c1 p2
     * v1    t1
     *       ^^
     */
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const v1 = $createImmutableVerseNode("1");
        const c1 = $createImmutableChapterNode("1");
        const p2 = $createParaNode();
        const t1 = $createTextNode("text1");
        root.append(p1, c1, p2);
        p1.append(v1);
        p2.append(t1);
        t1Key = t1.getKey();
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      const t1 = $getNodeByKey(t1Key);
      const verseNode = $findThisVerse(t1);

      expect(verseNode).toBeUndefined();
    });
  });
});

describe("$insertNote()", () => {
  const requiredNodes = [ParaNode, NoteNode, CharNode, ImmutableNoteCallerNode];
  const viewOptions: ViewOptions = {
    markerMode: "hidden",
    noteMode: "expanded",
    hasSpacing: true,
    isFormattedFont: true,
  };
  const nodeOptions: UsjNodeOptions = {};

  it("should throw error for invalid note marker", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select();
      },
      { discrete: true },
    );

    editor.update(() => {
      expect(() => {
        $insertNote(
          "invalid",
          GENERATOR_NOTE_CALLER,
          undefined,
          { book: "GEN", chapterNum: 1, verseNum: 1 },
          viewOptions,
          nodeOptions,
          undefined,
        );
      }).toThrow("$insertNote: Invalid note marker 'invalid'");
    });
  });

  it("should insert a footnote with collapsed selection", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        // Set collapsed selection at position 2
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 5 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect($isNoteNode(noteNode)).toBe(true);
      expect(noteNode?.getMarker()).toBe("f");
      expect(noteNode?.getCaller()).toBe(GENERATOR_NOTE_CALLER);

      // Check children structure: should have fr, ft chars
      const children = noteNode?.getChildren() ?? [];
      expect(children.length).toBeGreaterThan(0);

      const charNodes = children.filter($isCharNode);
      expect(charNodes.length).toBeGreaterThanOrEqual(2);

      // First should be fr with chapter:verse
      expect(charNodes[0].getMarker()).toBe("fr");
      expect(charNodes[0].getTextContent()).toBe("1:5");

      // Last should be ft with placeholder
      const ftNode = charNodes.find((node) => node.getMarker() === "ft");
      expect(ftNode).toBeDefined();
      expect(ftNode?.getTextContent()).toBe(HIDDEN_NOTE_CALLER);
    });
  });

  it("should insert a footnote with selected text", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("selected text here");
        root.append(p1);
        p1.append(t1);
        // Select "selected"
        t1.select(0, 8);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 2, verseNum: 3 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();

      const children = noteNode?.getChildren() ?? [];
      const charNodes = children.filter($isCharNode);

      // Should have fr, fq (with selected text), ft
      expect(charNodes.length).toBeGreaterThanOrEqual(3);

      const fqNode = charNodes.find((node) => node.getMarker() === "fq");
      expect(fqNode).toBeDefined();
      expect(fqNode?.getTextContent()).toBe("selected");
    });
  });

  it("should insert a cross-reference note", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "x",
        HIDDEN_NOTE_CALLER,
        undefined,
        { book: "JHN", chapterNum: 3, verseNum: 16 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getMarker()).toBe("x");

      const children = noteNode?.getChildren() ?? [];
      const charNodes = children.filter($isCharNode);

      // Should have xo and xt chars
      expect(charNodes.length).toBeGreaterThanOrEqual(2);

      const xoNode = charNodes.find((node) => node.getMarker() === "xo");
      expect(xoNode).toBeDefined();
      expect(xoNode?.getTextContent()).toBe("3:16");

      const xtNode = charNodes.find((node) => node.getMarker() === "xt");
      expect(xtNode).toBeDefined();
      expect(xtNode?.getTextContent()).toBe(HIDDEN_NOTE_CALLER);
    });
  });

  it("should insert note with collapsed noteMode", () => {
    const collapsedViewOptions: ViewOptions = {
      ...viewOptions,
      noteMode: "collapsed",
    };

    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        collapsedViewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getIsCollapsed()).toBe(true);
    });
  });

  it("should insert endnote (fe marker)", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "fe",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getMarker()).toBe("fe");

      const children = noteNode?.getChildren() ?? [];
      const charNodes = children.filter($isCharNode);

      // Should have fr and ft chars (same structure as footnote)
      expect(charNodes.some((node) => node.getMarker() === "fr")).toBe(true);
      expect(charNodes.some((node) => node.getMarker() === "ft")).toBe(true);
    });
  });

  it("should insert study note (ef marker)", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "ef",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getMarker()).toBe("ef");
    });
  });

  it("should insert extended cross-reference (ex marker)", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "ex",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getMarker()).toBe("ex");

      const children = noteNode?.getChildren() ?? [];
      const charNodes = children.filter($isCharNode);

      // Should have xo and xt chars (same structure as cross-reference)
      expect(charNodes.some((node) => node.getMarker() === "xo")).toBe(true);
      expect(charNodes.some((node) => node.getMarker() === "xt")).toBe(true);
    });
  });

  it("should insert note without scripture reference", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        GENERATOR_NOTE_CALLER,
        undefined,
        undefined,
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();

      const children = noteNode?.getChildren() ?? [];
      const charNodes = children.filter($isCharNode);

      // Should only have ft char (no fr without scripture reference)
      const frNode = charNodes.find((node) => node.getMarker() === "fr");
      expect(frNode).toBeUndefined();

      const ftNode = charNodes.find((node) => node.getMarker() === "ft");
      expect(ftNode).toBeDefined();
    });
  });

  it("should return undefined when selection is not a range selection", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);

    editor.update(() => {
      // Don't set any selection
      const noteNode = $insertNote(
        "f",
        GENERATOR_NOTE_CALLER,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeUndefined();
    });
  });

  it("should handle caller with different values", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        "a",
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      expect(noteNode).toBeDefined();
      expect(noteNode?.getCaller()).toBe("a");
    });
  });

  it("should handle undefined caller", () => {
    const { editor } = createBasicTestEnvironment(requiredNodes);
    editor.update(
      () => {
        const root = $getRoot();
        const p1 = $createParaNode();
        const t1 = $createTextNode("text");
        root.append(p1);
        p1.append(t1);
        t1.select(2, 2);
      },
      { discrete: true },
    );

    editor.update(() => {
      const noteNode = $insertNote(
        "f",
        undefined,
        undefined,
        { book: "GEN", chapterNum: 1, verseNum: 1 },
        viewOptions,
        nodeOptions,
        undefined,
      );

      if (!noteNode) throw new Error("noteNode not inserted");
      expect(noteNode.getCaller()).toBe(GENERATOR_NOTE_CALLER);
      expect(noteNode.getChildrenSize()).toBe(6); // caller, space, fr, space, ft, space

      const caller = noteNode.getFirstChild();
      expect($isImmutableNoteCallerNode(caller)).toBe(true);
    });
  });
});
