/**
 * PT-3835 follow-up (Gen 2 repro): re-applying a comment annotation to the SAME range after a
 * pending-annotation wrap/unwrap cycle must resolve. Mirrors paranext-core's Insert Comment
 * save flow exactly: setAnnotation(pending) → save → removeAnnotation(pending) →
 * setAnnotation(threadId, same range). Confirmed failing in the app at the last step with
 * "Failed to find start or end node of the annotation."
 *
 * MINIMAL FAILING CONFIGURATION: the failure needs the REAL platform Editor (full plugin
 * stack, driven through its ref API like paranext does) with formatted view options plus
 * `hasGutterParaMarkers: true` — gutter mode renders paragraph markers as extra immutable
 * typed-text nodes in the tree. It does NOT reproduce in a minimal LexicalComposer harness
 * mounting only the AnnotationPlugin (even with identical view options passed to the USJ
 * adaptor), nor in the real Editor without the gutter option
 * (`showCharMarkerTitles`/`hasActiveTextFocusBox` alone don't trigger it either — see the
 * passing control below). Same-tick and separate-act sequencing fail identically at the
 * re-apply step; the pending annotation and its removal both work.
 *
 * The suite covers both failing-mode variants (gutter-only minimal config, and
 * titles/gutter/focus-box all on — the original app configuration) plus the all-off passing
 * control.
 */
import Editor from "./Editor";
import { EditorRef } from "./editor.model";
import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { AnnotationRange, getViewOptions, ViewOptions } from "shared-react";
import { vi } from "vitest";

// Genesis 2:1-3 (WEB). In verse 1: "earth" = 17..22, "all" = 28..31.
const v1Text = "The heavens, the earth, and all their vast array were finished.";

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
        "On the seventh day God finished his work which he had done; and he rested on the seventh" +
          " day from all his work which he had done.",
        { type: "verse", marker: "v", number: "3" },
        "God blessed the seventh day, and made it holy, because he rested in it from all his work" +
          " of creation which he had done.",
      ],
    },
  ],
};

// USJ content: [0]=chapter, [1]=para. Para content items: [0]=verse 1 marker, [1]=v1 text, ...
const jsonPath = "$.content[1].content[1]";
const earthStart = v1Text.indexOf("earth");
const earthRange: AnnotationRange = {
  start: { jsonPath, offset: earthStart },
  end: { jsonPath, offset: earthStart + "earth".length },
};

// Used to pin the original defect's step 5: after the rewrap, every reported selection in that
// paragraph (not just the annotated range itself) must still resolve to correct USJ coordinates.
const allStart = v1Text.indexOf("all");
const allRange: AnnotationRange = {
  start: { jsonPath, offset: allStart },
  end: { jsonPath, offset: allStart + "all".length },
};

const formattedViewOptions = getViewOptions("formatted");
if (!formattedViewOptions) throw new Error("Expected formatted view options to exist");

/**
 * Both failing-mode variants: the minimal failing configuration (gutter only) and the original
 * app configuration (`showCharMarkerTitles`/`hasGutterParaMarkers`/`hasActiveTextFocusBox` all
 * on). The all-off configuration is the passing control below.
 */
const failingModeVariants: { name: string; viewOptions: ViewOptions }[] = [
  {
    name: "gutter only (minimal failing config)",
    viewOptions: { ...formattedViewOptions, hasGutterParaMarkers: true },
  },
  {
    name: "titles/gutter/focus-box all on",
    viewOptions: {
      ...formattedViewOptions,
      showCharMarkerTitles: true,
      hasGutterParaMarkers: true,
      hasActiveTextFocusBox: true,
    },
  },
];

describe.each(failingModeVariants)(
  "pending-comment rewrap in the real Editor, $name",
  ({ viewOptions }) => {
    it("fixture sanity: 'earth' USJ coordinates round-trip through the Editor selection API", async () => {
      const editor = await createRealEditor(viewOptions, createLoggerMock());

      await act(async () => {
        editor.setSelection({ start: earthRange.start, end: earthRange.end });
      });
      const reported = editor.getSelection();

      // If THIS fails the fixture/jsonPath assumptions are wrong — fix the test, not the code.
      expect(reported?.start).toEqual(earthRange.start);
      expect(reported?.end).toEqual(earthRange.end);
    });

    it("re-applies the same range after a pending wrap/unwrap cycle", async () => {
      const logError = createLoggerMock();
      const editor = await createRealEditor(viewOptions, logError);

      // 1. Pending highlight (works in the app too).
      await act(async () => {
        editor.setAnnotation(earthRange, "translator-comment", "pending-comment");
      });
      expect(logError).not.toHaveBeenCalled();
      expectDomMarkOver("earth");

      // 2. Save removes the pending annotation (works in the app too).
      await act(async () => {
        editor.removeAnnotation("translator-comment", "pending-comment");
      });
      expectNoDomMarks();

      // 3. Thread annotation with the SAME captured range. Did FAIL HERE, exactly like the app:
      //    logger.error("Failed to find start or end node of the annotation.") and no mark is
      //    created.
      await act(async () => {
        editor.setAnnotation(earthRange, "translator-comment", "thread-1");
      });
      expect(logError).not.toHaveBeenCalled();
      expectDomMarkOver("earth");

      // 4. Post-rewrap: selection reporting elsewhere in the same paragraph must still resolve to
      //    correct, coalesced USJ coordinates. This pins step 5 of the original defect: after the
      //    rewrap, every reported selection in that paragraph was wrong.
      await act(async () => {
        editor.setSelection({ start: allRange.start, end: allRange.end });
      });
      const reportedAfterRewrap = editor.getSelection();
      expect(reportedAfterRewrap?.start).toEqual(allRange.start);
      expect(reportedAfterRewrap?.end).toEqual(allRange.end);
    });

    it("re-applies when remove and set happen back-to-back in one update cycle", async () => {
      // The app calls removeAnnotation + setAnnotation in ONE event handler, so cover the
      // same-tick sequencing as its own case. Fails identically to the separate-act variant.
      const logError = createLoggerMock();
      const editor = await createRealEditor(viewOptions, logError);

      await act(async () => {
        editor.setAnnotation(earthRange, "translator-comment", "pending-comment");
      });
      await act(async () => {
        editor.removeAnnotation("translator-comment", "pending-comment");
        editor.setAnnotation(earthRange, "translator-comment", "thread-1");
      });

      expect(logError).not.toHaveBeenCalled();
      expectDomMarkOver("earth");
    });
  },
);

describe("control: same lifecycle in the real Editor WITHOUT gutter para markers", () => {
  it("re-applies the same range after a pending wrap/unwrap cycle (plain formatted view)", async () => {
    // Passing control documenting the boundary: identical lifecycle, identical Editor, only
    // `hasGutterParaMarkers` differs. (`showCharMarkerTitles: true` or
    // `hasActiveTextFocusBox: true` alone also pass — verified during narrowing.)
    const logError = createLoggerMock();
    const editor = await createRealEditor(formattedViewOptions, logError);

    await act(async () => {
      editor.setAnnotation(earthRange, "translator-comment", "pending-comment");
    });
    await act(async () => {
      editor.removeAnnotation("translator-comment", "pending-comment");
    });
    await act(async () => {
      editor.setAnnotation(earthRange, "translator-comment", "thread-1");
    });

    expect(logError).not.toHaveBeenCalled();
    expectDomMarkOver("earth");
  });
});

// ---------------------------------------------------------------------------
// Helpers (after the tests; function declarations hoist)
// ---------------------------------------------------------------------------

/** A `vi.fn()` typed to satisfy `LoggerBasic`'s `(...params: unknown[]) => void` methods. */
type LoggerMock = ReturnType<typeof vi.fn<(...params: unknown[]) => void>>;

function createLoggerMock(): LoggerMock {
  return vi.fn<(...params: unknown[]) => void>();
}

/**
 * Mount the REAL platform Editor (full plugin stack) with the given view options and return its
 * ref API — the same surface paranext-core drives.
 */
async function createRealEditor(
  viewOptions: ViewOptions,
  logError: LoggerMock,
): Promise<EditorRef> {
  const logger = {
    error: logError,
    warn: createLoggerMock(),
    info: createLoggerMock(),
    debug: createLoggerMock(),
  };
  const ref = createRef<EditorRef>();
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={usjGen2} options={{ view: viewOptions }} logger={logger} />,
    );
  });
  if (!ref.current) throw new Error("EditorRef did not mount");
  return ref.current;
}

/** Asserts exactly one rendered <mark> element exists and it wraps the expected text. */
function expectDomMarkOver(expectedText: string) {
  const markTexts = [...document.querySelectorAll("mark")].map((mark) => mark.textContent);
  expect(markTexts).toEqual([expectedText]);
}

/** Asserts no rendered <mark> elements remain (annotation fully removed). */
function expectNoDomMarks() {
  expect(document.querySelectorAll("mark")).toHaveLength(0);
}
