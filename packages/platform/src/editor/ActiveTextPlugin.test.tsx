import { describe, expect, it } from "vitest";
import { $getRoot, $createTextNode, $getSelection, LexicalNode } from "lexical";
import {
  $createCharNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  CharNode,
  ImmutableTypedTextNode,
  MarkerNode,
  NBSP,
  ParaNode,
  VerseNode,
} from "shared";
import { $createImmutableVerseNode, ImmutableVerseNode } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $isParaBodyEmpty,
  $getVerseParaFromSelection,
  $getActiveVerseSiblings,
} from "./ActiveTextPlugin";

const nodes = [
  ParaNode,
  VerseNode,
  ImmutableVerseNode,
  MarkerNode,
  ImmutableTypedTextNode,
  CharNode,
];

/**
 * The three realistic ParaNode shapes the plugin must handle, matching what
 * `usj-editor.adaptor.ts` produces for each set of view options.
 *
 * - `editable`: `markerMode: "editable"` — paragraph starts with a mutable `MarkerNode("\\p")`
 *   followed by a `TextNode(NBSP)` (the "marker-trailing-space"), and verses are mutable
 *   `VerseNode`s containing visible text like `"\\v 1 "`.
 * - `gutter-hidden`: `markerMode: "hidden"` + `hasGutterParaMarkers: true` (the Paragraph
 *   Structure view this plugin actually ships in) — paragraph starts with an
 *   `ImmutableTypedTextNode("marker", "\\p\\u00A0")` for the gutter, then `ImmutableVerseNode`s.
 * - `plain-hidden`: `markerMode: "hidden"` with no gutter — no paragraph-marker prefix at all,
 *   and verses are `ImmutableVerseNode`s.
 */
type ParaShape = "editable" | "gutter-hidden" | "plain-hidden";

/** Builds the leading paragraph-marker children for the given shape, or [] if the shape has none. */
function $paraMarkerPrefix(shape: ParaShape, marker: string): LexicalNode[] {
  if (shape === "editable") return [$createMarkerNode(marker), $createTextNode(NBSP)];
  if (shape === "gutter-hidden")
    return [$createImmutableTypedTextNode("marker", `\\${marker}${NBSP}`)];
  return [];
}

/** Creates the appropriate verse-number node type for the given shape. */
function $verseFor(shape: ParaShape, number: string) {
  return shape === "editable" ? $createVerseNode(number) : $createImmutableVerseNode(number);
}

describe("$isParaBodyEmpty", () => {
  const shapes: ParaShape[] = ["editable", "gutter-hidden", "plain-hidden"];

  describe.each(shapes)("%s shape", (shape) => {
    it("is true for a verse with no body text", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("p").append(...$paraMarkerPrefix(shape, "p"), $verseFor(shape, "1"));
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        expect($isParaBodyEmpty(para)).toBe(true);
      });
    });

    it("is false when the verse has body text", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          $verseFor(shape, "1"),
          $createTextNode("In the beginning"),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        expect($isParaBodyEmpty(para)).toBe(false);
      });
    });

    it("is true when the verse is followed by whitespace only", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          $verseFor(shape, "1"),
          $createTextNode("   "),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        expect($isParaBodyEmpty(para)).toBe(true);
      });
    });
  });
});

describe("$getVerseParaFromSelection", () => {
  it("returns undefined for an undefined selection", () => {
    expect($getVerseParaFromSelection(undefined)).toBeUndefined();
  });

  it("returns the paragraph when cursor is in a verse paragraph (gutter-hidden shape)", () => {
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const textNode = $createTextNode("Hello world");
      $getRoot().append(
        $createParaNode("p").append(
          ...$paraMarkerPrefix("gutter-hidden", "p"),
          $verseFor("gutter-hidden", "1"),
          textNode,
        ),
      );
      textNode.select();
    });

    editor.getEditorState().read(() => {
      const result = $getVerseParaFromSelection($getSelection() ?? undefined);

      expect(result).toBeDefined();
    });
  });

  it("returns the paragraph when cursor is in a non-verse para (e.g. \\s heading)", () => {
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const textNode = $createTextNode("Heading");
      $getRoot().append(
        $createParaNode("s").append(...$paraMarkerPrefix("gutter-hidden", "s"), textNode),
      );
      textNode.select();
    });

    editor.getEditorState().read(() => {
      const result = $getVerseParaFromSelection($getSelection() ?? undefined);

      expect(result).not.toBeNull();
    });
  });
});

describe("$getActiveVerseSiblings", () => {
  it("returns (undefined, undefined) for an undefined selection", () => {
    let para: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      para = $createParaNode("p").append(
        ...$paraMarkerPrefix("gutter-hidden", "p"),
        $verseFor("gutter-hidden", "1"),
        $createTextNode("text"),
      );
      $getRoot().append(para);
    });

    editor.getEditorState().read(() => {
      const result = $getActiveVerseSiblings(para, undefined);

      expect(result.activeVerseKey).toBeUndefined();
      expect(result.nextVerseKey).toBeUndefined();
    });
  });

  const shapes: ParaShape[] = ["editable", "gutter-hidden", "plain-hidden"];

  describe.each(shapes)("%s shape", (shape) => {
    it("returns the verse key and undefined for a single-verse paragraph", () => {
      let para: ParaNode;
      let verse: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        verse = $verseFor(shape, "1");
        const text = $createTextNode("In the beginning");
        para = $createParaNode("p").append(...$paraMarkerPrefix(shape, "p"), verse, text);
        $getRoot().append(para);
        text.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBe(verse.getKey());
        expect(result.nextVerseKey).toBeUndefined();
      });
    });

    it("returns (verse1Key, verse2Key) when cursor is in the first verse section", () => {
      let para: ParaNode;
      let v1: VerseNode | ImmutableVerseNode;
      let v2: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        const t1 = $createTextNode("text one");
        v2 = $verseFor(shape, "2");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          v1,
          t1,
          v2,
          $createTextNode("text two"),
        );
        $getRoot().append(para);
        t1.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBe(v1.getKey());
        expect(result.nextVerseKey).toBe(v2.getKey());
      });
    });

    it("returns (verse2Key, verse3Key) when cursor is in the middle verse section", () => {
      let para: ParaNode;
      let v2: VerseNode | ImmutableVerseNode;
      let v3: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v2 = $verseFor(shape, "2");
        v3 = $verseFor(shape, "3");
        const t2 = $createTextNode("text two");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          $verseFor(shape, "1"),
          $createTextNode("text one"),
          v2,
          t2,
          v3,
          $createTextNode("text three"),
        );
        $getRoot().append(para);
        t2.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBe(v2.getKey());
        expect(result.nextVerseKey).toBe(v3.getKey());
      });
    });

    it("returns (lastVerseKey, undefined) when cursor is in the last verse section", () => {
      let para: ParaNode;
      let v2: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v2 = $verseFor(shape, "2");
        const t2 = $createTextNode("text two");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          $verseFor(shape, "1"),
          $createTextNode("text one"),
          v2,
          t2,
        );
        $getRoot().append(para);
        t2.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBe(v2.getKey());
        expect(result.nextVerseKey).toBeUndefined();
      });
    });

    it("returns (undefined, firstVerseKey) when cursor is in pre-verse intro text", () => {
      let para: ParaNode;
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        const intro = $createTextNode("intro");
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          intro,
          v1,
          $createTextNode("text one"),
        );
        $getRoot().append(para);
        intro.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBeUndefined();
        expect(result.nextVerseKey).toBe(v1.getKey());
      });
    });

    it("returns the verse key when the cursor is inside a CharNode within the verse section", () => {
      let para: ParaNode;
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        const charText = $createTextNode("Lord");
        const charNode = $createCharNode("nd").append(charText);
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
          v1,
          $createTextNode("The "),
          charNode,
          $createTextNode(" said"),
        );
        $getRoot().append(para);
        charText.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

        expect(result.activeVerseKey).toBe(v1.getKey());
        expect(result.nextVerseKey).toBeUndefined();
      });
    });
  });

  it("returns (undefined, undefined) for a paragraph with no verse nodes (e.g. \\q2 continuation)", () => {
    let para: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const text = $createTextNode("continuation line");
      para = $createParaNode("q2").append(...$paraMarkerPrefix("gutter-hidden", "q2"), text);
      $getRoot().append(para);
      text.select();
    });

    editor.getEditorState().read(() => {
      const result = $getActiveVerseSiblings(para, $getSelection() ?? undefined);

      expect(result.activeVerseKey).toBeUndefined();
      expect(result.nextVerseKey).toBeUndefined();
    });
  });
});
