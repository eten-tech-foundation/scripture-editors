import { baseTestEnvironment } from "../react-test.utils";
import { AnnotationPlugin, AnnotationRef } from "./AnnotationPlugin";
import { AnnotationRange } from "./selection.model";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode } from "lexical";
import { createRef } from "react";
import { $createParaNode, $createTypedMarkNode, $isParaNode, $isTypedMarkNode } from "shared";
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
});

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
