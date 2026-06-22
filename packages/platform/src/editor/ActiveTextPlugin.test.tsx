import { describe, expect, it } from "vitest";
import { $getRoot, $createTextNode, $getSelection, LexicalNode } from "lexical";
import {
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
import { $createImmutableVerseNode, ImmutableVerseNode, SomeVerseNode } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";
import {
  $getActiveVerseKey,
  $getEmptyVerseStatus,
  $getParaFromSelection,
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
function $createParaMarkerPrefixNodes(shape: ParaShape, marker: string): LexicalNode[] {
  if (shape === "editable") return [$createMarkerNode(marker), $createTextNode(NBSP)];
  if (shape === "gutter-hidden")
    return [$createImmutableTypedTextNode("marker", `\\${marker}${NBSP}`)];
  return [];
}

/** Creates the appropriate verse-number node type for the given shape. */
function $verseFor(shape: ParaShape, number: string) {
  return shape === "editable" ? $createVerseNode(number) : $createImmutableVerseNode(number);
}

describe("$getEmptyVerseStatus", () => {
  const shapes: ParaShape[] = ["editable", "gutter-hidden", "plain-hidden"];

  describe.each(shapes)("%s shape", (shape) => {
    it("marks the verse empty when it has no body text", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(...$createParaMarkerPrefixNodes(shape, "p"), v1);
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([v1.getKey()]);
        expect(result.nonEmptyKeys).toEqual([]);
      });
    });

    it("marks the verse non-empty when it has body text", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          v1,
          $createTextNode("In the beginning"),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([]);
        expect(result.nonEmptyKeys).toEqual([v1.getKey()]);
      });
    });

    it("marks the verse empty when it is followed by whitespace only", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          v1,
          $createTextNode("   "),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([v1.getKey()]);
        expect(result.nonEmptyKeys).toEqual([]);
      });
    });

    it("marks only the empty verse when one of two verses in the paragraph has no body", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      let v2: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        v2 = $verseFor(shape, "2");
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          v1,
          v2,
          $createTextNode("In the beginning"),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([v1.getKey()]);
        expect(result.nonEmptyKeys).toEqual([v2.getKey()]);
      });
    });

    it("marks the trailing verse empty when it has no body after a non-empty preceding verse", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      let v2: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        v2 = $verseFor(shape, "2");
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          v1,
          $createTextNode("text one"),
          v2,
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([v2.getKey()]);
        expect(result.nonEmptyKeys).toEqual([v1.getKey()]);
      });
    });

    it("returns no keys for a paragraph with no verses", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("q2").append(
          ...$createParaMarkerPrefixNodes(shape, "q2"),
          $createTextNode("continuation"),
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([]);
        expect(result.nonEmptyKeys).toEqual([]);
      });
    });

    it("ignores text before the first verse (intro text does not affect classification)", () => {
      let para: ParaNode;
      let v1: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          $createTextNode("pre-verse intro"),
          v1,
        );
        $getRoot().append(para);
      });

      editor.getEditorState().read(() => {
        const result = $getEmptyVerseStatus(para);

        expect(result.emptyKeys).toEqual([v1.getKey()]);
        expect(result.nonEmptyKeys).toEqual([]);
      });
    });
  });
});

describe("$getActiveVerseKey", () => {
  const shapes: ParaShape[] = ["editable", "gutter-hidden", "plain-hidden"];

  it("returns undefined when there is no range selection", () => {
    const { editor } = createBasicTestEnvironment(nodes, () => {
      $getRoot().append(
        $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes("gutter-hidden", "p"),
          $verseFor("gutter-hidden", "1"),
        ),
      );
    });

    editor.getEditorState().read(() => {
      const result = $getActiveVerseKey();

      expect(result).toBeUndefined();
    });
  });

  it("returns undefined when cursor is in a non-verse paragraph (e.g. \\s heading)", () => {
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const heading = $createTextNode("Heading");
      $getRoot().append(
        $createParaNode("s").append(...$createParaMarkerPrefixNodes("gutter-hidden", "s"), heading),
      );
      heading.select();
    });

    editor.getEditorState().read(() => {
      const result = $getActiveVerseKey();

      expect(result).toBeUndefined();
    });
  });

  describe.each(shapes)("%s shape", (shape) => {
    it("returns undefined when cursor sits before the first verse marker", () => {
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        para = $createParaNode("p").append(
          ...$createParaMarkerPrefixNodes(shape, "p"),
          $verseFor(shape, "1"),
        );
        $getRoot().append(para);
        para.select(0, 0);
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseKey();

        expect(result).toBeUndefined();
      });
    });

    it("returns the verse key when an element selection sits immediately after its marker", () => {
      let v1: SomeVerseNode;
      let para: ParaNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(...$createParaMarkerPrefixNodes(shape, "p"), v1);
        $getRoot().append(para);
        // Mimic placeCursorAfterEmptyVerse: drop the caret immediately after the verse marker.
        const after = v1.getIndexWithinParent() + 1;
        para.select(after, after);
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseKey();

        expect(result).toBe(v1.getKey());
      });
    });

    it("returns the verse key when the cursor sits in body text after the verse", () => {
      let v1: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        const body = $createTextNode("In the beginning");
        $getRoot().append(
          $createParaNode("p").append(...$createParaMarkerPrefixNodes(shape, "p"), v1, body),
        );
        body.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseKey();

        expect(result).toBe(v1.getKey());
      });
    });

    it("returns the second verse's key when the cursor sits in its section", () => {
      let v2: SomeVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v2 = $verseFor(shape, "2");
        const body2 = $createTextNode("body two");
        $getRoot().append(
          $createParaNode("p").append(
            ...$createParaMarkerPrefixNodes(shape, "p"),
            $verseFor(shape, "1"),
            $createTextNode("body one"),
            v2,
            body2,
          ),
        );
        body2.select();
      });

      editor.getEditorState().read(() => {
        const result = $getActiveVerseKey();

        expect(result).toBe(v2.getKey());
      });
    });
  });
});

describe("$getParaFromSelection", () => {
  it("returns undefined for an undefined selection", () => {
    expect($getParaFromSelection(undefined)).toBeUndefined();
  });

  it("returns the paragraph when cursor is in a verse paragraph (gutter-hidden shape)", () => {
    let para: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const textNode = $createTextNode("Hello world");
      para = $createParaNode("p").append(
        ...$createParaMarkerPrefixNodes("gutter-hidden", "p"),
        $verseFor("gutter-hidden", "1"),
        textNode,
      );
      $getRoot().append(para);
      textNode.select();
    });

    editor.getEditorState().read(() => {
      const result = $getParaFromSelection($getSelection() ?? undefined);

      expect(result?.getKey()).toBe(para.getKey());
    });
  });

  it("returns the paragraph when cursor is in a non-verse para (e.g. \\s heading)", () => {
    let para: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const textNode = $createTextNode("Heading");
      para = $createParaNode("s").append(
        ...$createParaMarkerPrefixNodes("gutter-hidden", "s"),
        textNode,
      );
      $getRoot().append(para);
      textNode.select();
    });

    editor.getEditorState().read(() => {
      const result = $getParaFromSelection($getSelection() ?? undefined);

      expect(result?.getKey()).toBe(para.getKey());
    });
  });
});
