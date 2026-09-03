/**
 * Shared fixture and harness for the annotation suites (`annotation-pending-rewrap.test.tsx` and
 * `annotation-before-load.test.tsx`): one Genesis 2 document, the ranges the suites annotate, the
 * logger mocks they assert on, and the DOM readers for the marks that result. A plain helper
 * module rather than an export from one of the suites, so a suite that needs it does not
 * re-register the other suite's tests by importing it.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { AnnotationRange, ViewOptions } from "shared-react";
import { expect, vi } from "vitest";

// Genesis 2:1-3 (WEB). In verse 1: "earth" = 17..22, "all" = 28..31.
export const v1Text = "The heavens, the earth, and all their vast array were finished.";
const v2Text =
  "On the seventh day God finished his work which he had done; and he rested on the seventh" +
  " day from all his work which he had done.";
const v3Text =
  "God blessed the seventh day, and made it holy, because he rested in it from all his work" +
  " of creation which he had done.";

export const usjGen2: Usj = {
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
        { type: "verse", marker: "v", number: "3" },
        v3Text,
      ],
    },
  ],
};

// USJ content: [0]=chapter, [1]=para. Para content items: [0]=verse 1 marker, [1]=v1 text, ...
const jsonPath = "$.content[1].content[1]";
const earthStart = v1Text.indexOf("earth");
export const earthRange: AnnotationRange = {
  start: { jsonPath, offset: earthStart },
  end: { jsonPath, offset: earthStart + "earth".length },
};

// Used to pin the original defect's step 5: after the rewrap, every reported selection in that
// paragraph (not just the annotated range itself) must still resolve to correct USJ coordinates.
const allStart = v1Text.indexOf("all");
export const allRange: AnnotationRange = {
  start: { jsonPath, offset: allStart },
  end: { jsonPath, offset: allStart + "all".length },
};

/** A `vi.fn()` typed to satisfy `LoggerBasic`'s `(...params: unknown[]) => void` methods. */
export type LogMock = ReturnType<typeof vi.fn<(...params: unknown[]) => void>>;

/** One mocked log method. */
export function createLogMock(): LogMock {
  return vi.fn<(...params: unknown[]) => void>();
}

/**
 * A whole `LoggerBasic` of mocks. Pass the `error` mock when the test asserts on it; the rest are
 * fresh mocks nobody looks at.
 */
export function createLoggerMock(error: LogMock = createLogMock()) {
  return { error, warn: createLogMock(), info: createLogMock(), debug: createLogMock() };
}

/**
 * Mount the REAL platform Editor (full plugin stack) and return its ref API — the same surface
 * paranext-core drives.
 */
export async function createRealEditor(
  logError: LogMock,
  viewOptions?: ViewOptions,
): Promise<EditorRef> {
  const ref = createRef<EditorRef>();
  await act(async () => {
    render(
      <Editor
        ref={ref}
        defaultUsj={usjGen2}
        options={viewOptions ? { view: viewOptions } : undefined}
        logger={createLoggerMock(logError)}
      />,
    );
  });
  if (!ref.current) throw new Error("EditorRef did not mount");
  return ref.current;
}

/** The text of every rendered `<mark>` element, in document order. */
export function markTexts(): (string | null)[] {
  return [...document.querySelectorAll("mark")].map((mark) => mark.textContent);
}

/** The number of every rendered chapter, in document order — i.e. which document is live. */
export function chapterNumbers(): (string | null)[] {
  return [...document.querySelectorAll("[data-marker='c']")].map((chapter) =>
    chapter.getAttribute("data-number"),
  );
}

/** Asserts exactly one rendered `<mark>` element exists and it wraps the expected text. */
export function expectDomMarkOver(expectedText: string) {
  expect(markTexts()).toEqual([expectedText]);
}

/** Asserts no rendered `<mark>` elements remain (annotation fully removed). */
export function expectNoDomMarks() {
  expect(markTexts()).toEqual([]);
}
