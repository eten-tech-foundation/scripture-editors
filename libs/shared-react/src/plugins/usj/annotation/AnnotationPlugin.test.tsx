// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { updateSelection } from "../../../../../../libs/shared/src/nodes/usj/test.utils";
import { baseTestEnvironment } from "../react-test.utils";
import { AnnotationPlugin, AnnotationRef } from "./AnnotationPlugin";
import { AnnotationRange } from "./selection.model";
import { $getUsjSelectionFromEditor } from "./selection.utils";
import { isUsjTextContentLocation } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $isElementNode,
  $isTextNode,
  LexicalEditor,
  LexicalNode,
  TextNode,
} from "lexical";
import { createRef } from "react";
import {
  $createParaNode,
  $createTypedMarkNode,
  $isParaNode,
  $isTypedMarkNode,
  TypedMarkNode,
} from "shared";
import { vi } from "vitest";

describe("AnnotationPlugin", () => {
  it("does not dispatch onRemove when marks are internally rewrapped", async () => {
    const spellingOnRemove = vi.fn();
    const text = "man who";
    const { annotationPlugin } = await testEnvironment(() => {
      const mark = $createTypedMarkNode();
      mark.addID("spelling", "spell-1", undefined, spellingOnRemove);
      $getRoot().append($createParaNode().append(mark.append($createTextNode(text))));
    });
    const jsonPath = "$.content[0].content[0]";
    const grammarRange: AnnotationRange = {
      start: { jsonPath, offset: 0 },
      end: { jsonPath, offset: text.length },
    };

    // SUT: add overlapping grammar annotation (internal rewrap).
    await act(async () => {
      annotationPlugin.setAnnotation(grammarRange, "grammar", "grammar-1");
    });

    // Check: spelling removal callback should not fire during internal rewrap.
    expect(spellingOnRemove).not.toHaveBeenCalled();
  });

  it("correctly handles adding a second annotation at the same start position as the first", async () => {
    // Initial state: "the " + "man" (spelling annotation) + " who stands"
    const { annotationPlugin, editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode().append(
          $createTextNode("the "),
          $createTypedMarkNode({ spelling: ["spell-1"] }).append($createTextNode("man")),
          $createTextNode(" who stands"),
        ),
      );
    });
    const jsonPath = "$.content[0].content[0]";
    // Second annotation: "man who" (starts at same position as first but extends further)
    const secondAnnotationRange: AnnotationRange = {
      start: { jsonPath, offset: 4 },
      end: { jsonPath, offset: 11 },
    };

    // SUT: add second annotation that starts at the same position as the first
    await act(async () => {
      annotationPlugin.setAnnotation(secondAnnotationRange, "grammar", "grammar-1");
    });

    // Verify the structure: both annotations should start at the same position
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isParaNode(para)) throw new Error("Expected a ParaNode");

      // First child should be plain text "the "
      const firstChild = para.getFirstChild();
      if (!$isTextNode(firstChild)) throw new Error("Expected a TextNode");
      expect(firstChild.getTextContent()).toBe("the ");

      // Second child should be a TypedMarkNode with both spelling AND grammar at "man"
      const secondChild = firstChild.getNextSibling();
      if (!$isTypedMarkNode(secondChild)) throw new Error("Expected a TypedMarkNode");
      const secondTypedIDs = secondChild.getTypedIDs();
      expect(secondTypedIDs.spelling).toContain("spell-1");
      expect(secondTypedIDs.grammar).toContain("grammar-1");
      expect(secondChild.getTextContent()).toBe("man");

      // Third child should be a TypedMarkNode with only grammar for " who"
      const thirdChild = secondChild.getNextSibling();
      if (!$isTypedMarkNode(thirdChild)) throw new Error("Expected a TypedMarkNode");
      const thirdTypedIDs = thirdChild.getTypedIDs();
      expect(thirdTypedIDs.spelling).toBeUndefined();
      expect(thirdTypedIDs.grammar).toContain("grammar-1");
      expect(thirdChild.getTextContent()).toBe(" who");

      // Fourth child should be plain text " stands"
      const fourthChild = thirdChild.getNextSibling();
      if (!$isTextNode(fourthChild)) throw new Error("Expected a TextNode");
      expect(fourthChild.getTextContent()).toBe(" stands");
    });
  });

  describe("hover callbacks survive nested-mark resolution", () => {
    it("preserves onMouseEnter when a second annotation is added to a range already inside a TypedMarkNode", async () => {
      // Initial state: "the man who stands" with no marks - we'll add the first via setAnnotation
      // so the AnnotationPlugin runs end-to-end (mirroring the consumer flow).
      const onMouseEnter = vi.fn();
      const onMouseLeave = vi.fn();
      const text = "the man who stands";
      const { annotationPlugin, editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });

      const jsonPath = "$.content[0].content[0]";
      const wordRange: AnnotationRange = {
        // "man" - chars 4..7
        start: { jsonPath, offset: 4 },
        end: { jsonPath, offset: 7 },
      };

      // Annotation #1: a highlight mark with hover callbacks attached.
      await act(async () => {
        annotationPlugin.setAnnotation(
          wordRange,
          "highlight",
          "hl-A",
          undefined,
          undefined,
          onMouseEnter,
          onMouseLeave,
        );
      });

      // Annotation #2: a second annotation type ("dim") over the SAME range, no callbacks.
      // This exercises the nested-element resolver path: the second setAnnotation lands on a
      // range already wrapped by the first TypedMarkNode, and merge logic must preserve the
      // hover callbacks registered on the first annotation.
      await act(async () => {
        annotationPlugin.setAnnotation(wordRange, "dim", "dim-A");
      });

      // After merge, find the surviving TypedMarkNode covering "man" and assert the hover
      // callbacks survived the merge.
      editor.getEditorState().read(() => {
        const merged = $findMergedTypedMarkNode("man");
        if (merged === null) throw new Error("Expected merged TypedMarkNode covering 'man'");

        const typedIDs = merged.getTypedIDs();
        expect(typedIDs["highlight"]).toContain("hl-A");
        expect(typedIDs["dim"]).toContain("dim-A");

        const onMouseEnters = merged.getTypedOnMouseEnters();
        const onMouseLeaves = merged.getTypedOnMouseLeaves();
        expect(onMouseEnters["highlight"]?.["hl-A"]).toBe(onMouseEnter);
        expect(onMouseLeaves["highlight"]?.["hl-A"]).toBe(onMouseLeave);

        const element = editor.getElementByKey(merged.getKey());
        if (!(element instanceof HTMLElement)) {
          throw new Error("Expected DOM element for merged mark node");
        }
        element.dispatchEvent(new window.MouseEvent("mouseenter"));
      });

      expect(onMouseEnter).toHaveBeenCalledTimes(1);
      expect(onMouseEnter).toHaveBeenCalledWith(expect.anything(), "highlight", "hl-A", "man");
    });

    it("preserves the original mark and its IDs after applying a second annotation to the same range", async () => {
      const text = "the man who stands";
      const { annotationPlugin, editor } = await testEnvironment(() => {
        $getRoot().append($createParaNode().append($createTextNode(text)));
      });

      const jsonPath = "$.content[0].content[0]";
      const wordRange: AnnotationRange = {
        start: { jsonPath, offset: 4 },
        end: { jsonPath, offset: 7 },
      };

      await act(async () => {
        annotationPlugin.setAnnotation(
          wordRange,
          "highlight",
          "hl-A",
          undefined,
          undefined,
          vi.fn(),
          vi.fn(),
        );
      });

      await act(async () => {
        annotationPlugin.setAnnotation(wordRange, "dim", "dim-A");
      });

      // Editor should still contain at least one TypedMarkNode covering the word, and that mark
      // should carry both type+id pairs after the second-annotation cascade resolves.
      editor.getEditorState().read(() => {
        const allMarks: TypedMarkNode[] = [];
        $getRoot()
          .getAllTextNodes()
          .forEach((tn) => {
            for (let p = tn.getParent(); p !== null; p = p.getParent()) {
              if ($isTypedMarkNode(p) && !allMarks.includes(p)) allMarks.push(p);
            }
          });
        expect(allMarks.length).toBeGreaterThan(0);

        const carryingBoth = allMarks.find((m) => {
          const ids = m.getTypedIDs();
          return ids["highlight"]?.includes("hl-A") && ids["dim"]?.includes("dim-A");
        });
        expect(carryingBoth).toBeDefined();
      });
    });
  });
});

describe("PT-3835: inserting annotations from reported selections", () => {
  const text = "the neva word and the sleep word";
  // indexOf: "neva" = 4, "sleep" = 22

  it("annotates front-to-back (the PT-3835 failure direction)", async () => {
    const { annotationPlugin, editor } = await testEnvironment(() => {
      $getRoot().append($createParaNode().append($createTextNode(text)));
    });

    await annotateWordViaReportedSelection(annotationPlugin, editor, "neva", "c-1");
    await annotateWordViaReportedSelection(annotationPlugin, editor, "sleep", "c-2");

    editor.getEditorState().read(() => $expectAnnotatedWords(["neva", "sleep"]));
  });

  it("annotates back-to-front (regression guard)", async () => {
    const { annotationPlugin, editor } = await testEnvironment(() => {
      $getRoot().append($createParaNode().append($createTextNode(text)));
    });

    await annotateWordViaReportedSelection(annotationPlugin, editor, "sleep", "c-2");
    await annotateWordViaReportedSelection(annotationPlugin, editor, "neva", "c-1");

    editor.getEditorState().read(() => $expectAnnotatedWords(["neva", "sleep"]));
  });

  /**
   * Select a word in the editor, verify the reported USJ selection is in coalesced-USJ
   * coordinates (annotation-independent), then insert an annotation with exactly that
   * reported selection — the paranext-core "Insert Comment" flow.
   */
  async function annotateWordViaReportedSelection(
    annotationPlugin: AnnotationRef,
    editor: LexicalEditor,
    word: string,
    id: string,
  ) {
    let target: TextNode | undefined;
    let localOffset = 0;
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isElementNode(para)) throw new Error("Expected a para node");
      target = para.getAllTextNodes().find((node) => node.getTextContent().includes(word));
      if (!target) throw new Error(`No text node contains '${word}'`);
      localOffset = target.getTextContent().indexOf(word);
    });
    if (!target) throw new Error(`No text node contains '${word}'`);
    updateSelection(editor, target, localOffset, target, localOffset + word.length);

    const reported = editor.getEditorState().read($getUsjSelectionFromEditor);
    const start = reported?.start;
    const end = reported?.end;
    if (!start || !end || !isUsjTextContentLocation(start) || !isUsjTextContentLocation(end)) {
      throw new Error(`Expected a reported text selection for '${word}'`);
    }
    // The reported location must be in actual-USJ coordinates regardless of annotations.
    expect(start).toEqual({
      jsonPath: "$.content[0].content[0]",
      offset: text.indexOf(word),
    });
    expect(end).toEqual({
      jsonPath: "$.content[0].content[0]",
      offset: text.indexOf(word) + word.length,
    });

    await act(async () => {
      annotationPlugin.setAnnotation({ start, end }, "review", id);
    });
  }

  function $expectAnnotatedWords(words: string[]) {
    const para = $getRoot().getFirstChild();
    if (!$isElementNode(para)) throw new Error("Expected a para node");
    const markTexts = para
      .getChildren()
      .filter($isTypedMarkNode)
      .map((node) => node.getTextContent());
    expect(markTexts).toEqual(words);
    expect(para.getTextContent()).toBe(text);
  }
});

/**
 * Find the TypedMarkNode whose text content is exactly `expectedText` after merge.
 */
function $findMergedTypedMarkNode(expectedText: string): TypedMarkNode | null {
  const stack: LexicalNode[] = $getRoot().getChildren();
  while (stack.length > 0) {
    const node = stack.shift();
    if (node === undefined) break;
    if ($isTypedMarkNode(node) && node.getTextContent() === expectedText) {
      return node;
    }
    if ($isElementNode(node)) {
      stack.push(...node.getChildren());
    }
  }
  return null;
}

async function testEnvironment($initialEditorState: () => void) {
  const annotationPluginRef = createRef<AnnotationRef>();
  const result = await baseTestEnvironment(
    $initialEditorState,
    <AnnotationPlugin ref={annotationPluginRef} />,
  );
  const annotationPlugin = annotationPluginRef.current;
  if (!annotationPlugin) throw new Error("AnnotationPlugin did not mount");
  return { ...result, annotationPlugin };
}
