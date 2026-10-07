import { IDLE_SETTLE_DELAY_MS, MarkerEditPlugin } from "./markerEdit/MarkerEditPlugin";
import { $appendCharPara } from "./markerEdit/markerEdit.test-helpers";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot } from "lexical";
import { createRef } from "react";
import { $createMarkerNode, $createParaNode } from "shared";
import { AnnotationPlugin, AnnotationRef, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

it("does not treat an annotation refresh as undo while a marker edit is pending", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  const rangeRect = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");
  Object.defineProperty(Range.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => new DOMRect(),
  });
  try {
    const ref = createRef<AnnotationRef>();
    let parts: ReturnType<typeof $appendCharPara> | undefined;
    const { editor } = await baseTestEnvironment(
      () => {
        parts = $appendCharPara();
        $getRoot().append(
          $createParaNode("p").append($createMarkerNode("p"), $createTextNode("word")),
        );
      },
      <>
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
        <AnnotationPlugin ref={ref} />
      </>,
    );
    const nodes = parts;
    if (!nodes) throw new Error("Expected a character span");
    await act(async () =>
      editor.update(() => {
        nodes.marker.setTextContent("\\wj");
        nodes.marker.select(3, 3);
      }),
    );
    expect(editor.getEditorState().read(() => nodes.char.getMarker())).toBe("nd");
    await act(async () =>
      ref.current?.setAnnotations([
        {
          selection: {
            start: { jsonPath: "$.content[1].content[0]", offset: 0 },
            end: { jsonPath: "$.content[1].content[0]", offset: 4 },
          },
          type: "spelling",
          id: "s1",
        },
      ]),
    );
    expect(editor.getRootElement()?.querySelector("mark")?.textContent).toBe("word");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(IDLE_SETTLE_DELAY_MS + 50);
    });
    expect(editor.getEditorState().read(() => nodes.char.getMarker())).toBe("wj");
  } finally {
    vi.useRealTimers();
    if (rangeRect) Object.defineProperty(Range.prototype, "getBoundingClientRect", rangeRect);
    else Reflect.deleteProperty(Range.prototype, "getBoundingClientRect");
  }
});
