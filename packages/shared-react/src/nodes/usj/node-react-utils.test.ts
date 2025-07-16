import { ImmutableVerseNode, $createImmutableVerseNode } from "./ImmutableVerseNode";
import {
  $findVerseInNode,
  $findVerseOrPara,
  $findLastVerse,
  $findThisVerse,
} from "./node-react.utils";
import { $createTextNode, $getNodeByKey, $getRoot, NodeKey } from "lexical";
import { TypedMarkNode, $createTypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { $createBookNode } from "shared/nodes/usj/BookNode";
import {
  ImmutableChapterNode,
  $createImmutableChapterNode,
} from "shared/nodes/usj/ImmutableChapterNode";
import { $createParaNode, ParaNode } from "shared/nodes/usj/ParaNode";
import { createBasicTestEnvironment } from "shared/nodes/usj/test.utils";
import { $createVerseNode } from "shared/nodes/usj/VerseNode";

describe("Editor Node Utilities", () => {
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
});
