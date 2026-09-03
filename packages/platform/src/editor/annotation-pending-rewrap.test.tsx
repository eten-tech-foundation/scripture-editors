/**
 * PT-3835 follow-up (Gen 2 repro): re-applying a comment annotation to the SAME range after a
 * pending-annotation wrap/unwrap cycle must resolve. Mirrors paranext-core's Insert Comment
 * save flow exactly: setAnnotation(pending) → save → removeAnnotation(pending) →
 * setAnnotation(threadId, same range). Confirmed failing in the app at the last step with
 * "Failed to find start or end node of the annotation."
 *
 * Reproduces ONLY with: real platform Editor + formatted view + `hasGutterParaMarkers: true`.
 * Does NOT reproduce with:
 *   - a minimal LexicalComposer mounting only AnnotationPlugin (even with identical view options)
 *   - the real Editor without the gutter option
 *   - `showCharMarkerTitles` / `hasActiveTextFocusBox` alone (see the passing control)
 *
 * Detail: gutter mode renders paragraph markers as extra immutable typed-text nodes in the
 * tree, and the failure needs the full plugin stack driven through the Editor's ref API like
 * paranext does. Same-tick and separate-act sequencing fail identically at the re-apply step;
 * the pending annotation and its removal both work.
 *
 * The suite covers both failing-mode variants (gutter-only minimal config, and
 * titles/gutter/focus-box all on — the original app configuration) plus the all-off passing
 * control.
 */
import {
  allRange,
  createLogMock,
  createRealEditor,
  earthRange,
  expectDomMarkOver,
  expectNoDomMarks,
} from "./annotation.test-helpers";
import { act } from "@testing-library/react";
import { getViewOptions, ViewOptions } from "shared-react";

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
      const editor = await createRealEditor(createLogMock(), viewOptions);

      await act(async () => {
        editor.setSelection({ start: earthRange.start, end: earthRange.end });
      });
      const reported = editor.getSelection();

      // If THIS fails the fixture/jsonPath assumptions are wrong — fix the test, not the code.
      expect(reported?.start).toEqual(earthRange.start);
      expect(reported?.end).toEqual(earthRange.end);
    });

    it("re-applies the same range after a pending wrap/unwrap cycle", async () => {
      const logError = createLogMock();
      const editor = await createRealEditor(logError, viewOptions);

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
      const logError = createLogMock();
      const editor = await createRealEditor(logError, viewOptions);

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
    const logError = createLogMock();
    const editor = await createRealEditor(logError, formattedViewOptions);

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
