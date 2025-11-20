import { baseTestEnvironment } from "../react-test.utils";
import { AnnotationPlugin, AnnotationRef } from "./AnnotationPlugin";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot } from "lexical";
import { createRef } from "react";
import { $createParaNode, $createTypedMarkNode } from "shared";
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
    const grammarRange = {
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
