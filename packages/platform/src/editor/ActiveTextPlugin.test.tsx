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
import { $createImmutableVerseNode, ImmutableVerseNode } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";
import { $getEmptyVerseStatus, $getParaFromSelection } from "./ActiveTextPlugin";

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

describe("$getEmptyVerseStatus", () => {
  const shapes: ParaShape[] = ["editable", "gutter-hidden", "plain-hidden"];

  describe.each(shapes)("%s shape", (shape) => {
    it("marks the verse empty when it has no body text", () => {
      let para: ParaNode;
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(...$paraMarkerPrefix(shape, "p"), v1);
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
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
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
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
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
      let v1: VerseNode | ImmutableVerseNode;
      let v2: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        v2 = $verseFor(shape, "2");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
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
      let v1: VerseNode | ImmutableVerseNode;
      let v2: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        v2 = $verseFor(shape, "2");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
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
          ...$paraMarkerPrefix(shape, "q2"),
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
      let v1: VerseNode | ImmutableVerseNode;
      const { editor } = createBasicTestEnvironment(nodes, () => {
        v1 = $verseFor(shape, "1");
        para = $createParaNode("p").append(
          ...$paraMarkerPrefix(shape, "p"),
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

describe("$getParaFromSelection", () => {
  it("returns undefined for an undefined selection", () => {
    expect($getParaFromSelection(undefined)).toBeUndefined();
  });

  it("returns the paragraph when cursor is in a verse paragraph (gutter-hidden shape)", () => {
    let para: ParaNode;
    const { editor } = createBasicTestEnvironment(nodes, () => {
      const textNode = $createTextNode("Hello world");
      para = $createParaNode("p").append(
        ...$paraMarkerPrefix("gutter-hidden", "p"),
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
      para = $createParaNode("s").append(...$paraMarkerPrefix("gutter-hidden", "s"), textNode);
      $getRoot().append(para);
      textNode.select();
    });

    editor.getEditorState().read(() => {
      const result = $getParaFromSelection($getSelection() ?? undefined);

      expect(result?.getKey()).toBe(para.getKey());
    });
  });
});
