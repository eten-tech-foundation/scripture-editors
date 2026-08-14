/**
 * #515: annotations applied before the editor's first content commit were silently lost.
 *
 * `LoadStatePlugin` commits USJ from inside a `queueMicrotask`, so a consumer that calls
 * `setAnnotation` right after mount — or right after `setUsj` — runs while the document is
 * still the empty initial state. Two ways that lost the annotation:
 *   a) the range cannot resolve, so `$getRangeFromUsjSelection` returns undefined and the
 *      plugin only logs "Failed to find start or end node of the annotation.";
 *   b) the range does resolve against the outgoing document, and the load's
 *      `editor.setEditorState()` then replaces the whole state, discarding the mark.
 *
 * Neither surfaces to the caller, so consumers resorted to polling the DOM for <mark> and
 * re-applying. These tests drive the real Editor through its ref, exactly as an app does.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef, useEffect, useRef } from "react";
import { AnnotationRange } from "shared-react";
import { vi } from "vitest";

const v1Text = "The heavens, the earth, and all their vast array were finished.";
const v2Text = "On the seventh day God finished his work which he had done.";

const usjGen2: Usj = {
  type: USJ_TYPE,
  version: USJ_VERSION,
  content: [
    { type: "chapter", marker: "c", number: "2" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        v1Text,
        { type: "verse", marker: "v", number: "2" },
        v2Text,
      ],
    },
  ],
};

/** A second document, to exercise the same race on a later `setUsj` load. */
const usjGen3: Usj = {
  type: USJ_TYPE,
  version: USJ_VERSION,
  content: [
    { type: "chapter", marker: "c", number: "3" },
    {
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "1" }, v1Text],
    },
  ],
};

const jsonPath = "$.content[1].content[1]";
const earthStart = v1Text.indexOf("earth");
const earthRange: AnnotationRange = {
  start: { jsonPath, offset: earthStart },
  end: { jsonPath, offset: earthStart + "earth".length },
};

function createLoggerMock() {
  return vi.fn();
}

function markTexts() {
  return [...document.querySelectorAll("mark")].map((mark) => mark.textContent);
}

/**
 * A consumer that annotates from its own mount effect — the realistic shape of this bug. The
 * effect runs right after the editor commits, while the load microtask is still pending, and it
 * is the first moment a consumer can legitimately touch the ref.
 */
function AnnotatingHost({
  annotate,
  logError,
}: {
  annotate: (editor: EditorRef) => void;
  logError: () => void;
}) {
  const ref = useRef<EditorRef>(null);
  useEffect(() => {
    if (ref.current) annotate(ref.current);
  }, [annotate]);
  return (
    <Editor
      ref={ref}
      defaultUsj={usjGen2}
      logger={{
        error: logError,
        warn: createLoggerMock(),
        info: createLoggerMock(),
        debug: createLoggerMock(),
      }}
    />
  );
}

describe("annotating before the first content commit (#515)", () => {
  it("applies an annotation requested from the consumer's mount effect", async () => {
    const logError = createLoggerMock();

    await act(async () => {
      render(
        <AnnotatingHost
          logError={logError}
          annotate={(editor) => editor.setAnnotation(earthRange, "spelling", "a1")}
        />,
      );
    });

    expect(logError).not.toHaveBeenCalled();
    expect(markTexts()).toEqual(["earth"]);
  });

  it("applies an annotation requested in the same tick as setUsj", async () => {
    const logError = createLoggerMock();
    const ref = createRef<EditorRef>();

    await act(async () => {
      render(
        <Editor
          ref={ref}
          defaultUsj={usjGen2}
          logger={{
            error: logError,
            warn: createLoggerMock(),
            info: createLoggerMock(),
            debug: createLoggerMock(),
          }}
        />,
      );
    });

    // Swap the document and annotate immediately, without awaiting the reload.
    await act(async () => {
      ref.current?.setUsj(usjGen3);
      ref.current?.setAnnotation(earthRange, "spelling", "a2");
    });

    expect(logError).not.toHaveBeenCalled();
    expect(markTexts()).toEqual(["earth"]);
  });

  it("still reports a range that can never resolve, instead of queueing it forever", async () => {
    const logError = createLoggerMock();

    await act(async () => {
      render(
        <AnnotatingHost
          logError={logError}
          annotate={(editor) =>
            editor.setAnnotation(
              {
                start: { jsonPath: "$.content[99].content[0]", offset: 0 },
                end: { jsonPath: "$.content[99].content[0]", offset: 3 },
              },
              "spelling",
              "bad",
            )
          }
        />,
      );
    });

    // Deferring must not swallow genuine failures: once the document is live the annotation is
    // attempted and fails loudly, exactly as it does today.
    expect(logError).toHaveBeenCalled();
    expect(markTexts()).toEqual([]);
  });
});
