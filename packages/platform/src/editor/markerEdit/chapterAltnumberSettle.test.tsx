/**
 * Integration regressions for the chapter settle scope and its `\ca` alternate-number display
 * run: display, edit-settle, deletion-settle, typed-literal fold, and the no-pending fixed-point
 * refusal. Chapters were the one displayed construct with NO settle scope — editable bytes with
 * nowhere to re-tokenize would have recreated the milestone edit-loss class (editable on screen,
 * silently discarded on save) — so these pins are what make displaying `\ca` safe at all.
 */

import { requireDefined, viewOptions } from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $rebuildChapter, Tier2Context } from "./tier2Rebuild.utils";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import { $getRoot, TextNode } from "lexical";
import {
  $chapterAltnumberRunPieces,
  $chapterGlyphTextNode,
  $isChapterNode,
  ChapterNode,
  getMarker as bundledGetMarker,
  getVisibleOpenMarkerText,
  NBSP,
} from "shared";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** A one-chapter doc; `chapterExtras` spreads extra chapter fields (altnumber, pubnumber, …). */
function chapterUsj(chapterExtras: { [key: string]: string } = {}): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1", ...chapterExtras },
      { type: "para", marker: "p", content: ["body text"] },
    ],
  };
}

async function renderChapterEditor(usj: Usj) {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <MarkerEditPlugin viewOptions={viewOptions} />,
  );
}

/** The single ChapterNode in the tree. */
function $findChapter(): ChapterNode {
  const chapter = $getRoot().getChildren().find($isChapterNode);
  return requireDefined(chapter, "chapter node not found");
}

/** The paragraph text node holding "body text" — a caret parking spot outside the chapter. */
function $textOutsideChapter(): TextNode {
  const text = $getRoot()
    .getAllTextNodes()
    .find((node) => node.getTextContent().includes("body text"));
  return requireDefined(text, "text outside the chapter not found");
}

describe("chapter \\ca alternate-number run", () => {
  it("loads with the run directly after the \\c glyph text, canonical bytes", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));
    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("2");
      const pieces = $chapterAltnumberRunPieces(chapter);
      expect(pieces.wrapper).toBeDefined();
      expect(pieces.opener?.getTextContent()).toBe("\\ca");
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}2`);
      expect(pieces.closer?.getTextContent()).toBe("\\ca*");
      const anchor = requireDefined($chapterGlyphTextNode(chapter), "chapter glyph not found");
      expect(anchor.getNextSibling()?.is(pieces.wrapper)).toBe(true);
    });
  });

  it("editing the value settles onto altnumber on caret departure", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));

    await act(async () =>
      editor.update(() => {
        const value = requireDefined(
          $chapterAltnumberRunPieces($findChapter()).value,
          "ca value not found",
        );
        value.setTextContent(`${NBSP}3`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits in the value: node state still has the OLD altnumber.
    editor.getEditorState().read(() => {
      expect($findChapter().getAltnumber()).toBe("2");
    });

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("3");
      const pieces = $chapterAltnumberRunPieces(chapter);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}3`);
      expect(pieces.opener?.getTextContent()).toBe("\\ca");
      expect(pieces.closer?.getTextContent()).toBe("\\ca*");
    });
  });

  it("deleting the whole run clears altnumber on caret departure with no resurrection", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));

    // No mid-state grace assertion here: jsdom's reconcile drops the post-deletion selection to
    // null (the caret's node survives, but the DOM selection is never re-established without
    // real focus), and a null selection is a legitimate "caret departed" to the engine — the
    // deletion settles on the deferred pass instead of waiting. The grace half of this behavior
    // is covered by the edit-value test above, whose caret survives inside the still-live value
    // node. What THIS test pins is the deletion's outcome: cleared state, no resurrection.
    let openerResurrected: boolean | undefined;
    await act(async () => {
      editor.update(() => {
        const chapter = $findChapter();
        const wrapper = requireDefined(
          $chapterAltnumberRunPieces(chapter).wrapper,
          "wrapper not found",
        );
        wrapper.remove();
        const anchor = requireDefined($chapterGlyphTextNode(chapter), "glyph not found");
        anchor.select(anchor.getTextContentSize(), anchor.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
      editor.getEditorState().read(() => {
        openerResurrected = $chapterAltnumberRunPieces($findChapter()).opener !== undefined;
      });
    });
    // Whether the deletion is still pending or already settled at this point, the run must not
    // have been re-derived from the still-set altnumber.
    expect(openerResurrected).toBe(false);

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBeUndefined();
      expect($chapterAltnumberRunPieces(chapter).opener).toBeUndefined();
      expect($chapterAltnumberRunPieces(chapter).wrapper).toBeUndefined();
    });
  });

  it("typing \\ca bytes into a bare chapter folds to altnumber on caret departure", async () => {
    const { editor } = await renderChapterEditor(chapterUsj());

    // Type the literal ` \ca 5\ca*` at the end of the chapter's `\c 1` glyph text — the caret
    // stays in the glyph node, so the typed literal pends instead of resolving inline.
    await act(async () =>
      editor.update(() => {
        const glyph = requireDefined($chapterGlyphTextNode($findChapter()), "glyph not found");
        glyph.setTextContent(`${glyph.getTextContent()}\\ca 5\\ca*`);
        glyph.select(glyph.getTextContentSize(), glyph.getTextContentSize());
      }),
    );

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("5");
      expect(chapter.getNumber()).toBe("1");
      // The settled display is the canonical glyph + run, not the typed literal.
      const glyph = requireDefined($chapterGlyphTextNode(chapter), "glyph not found");
      expect(glyph.getTextContent()).toBe(getVisibleOpenMarkerText("c", "1"));
      const pieces = $chapterAltnumberRunPieces(chapter);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}5`);
    });
  });

  it("a chapter with no pending edits refuses a rebuild (fixed point)", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));
    await act(async () =>
      editor.update(() => {
        const chapter = $findChapter();
        expect($rebuildChapter(chapter, context)).toBe(false);
        // Same expectation with no run at all: the bare `\c 1` shape is its own fixed point.
      }),
    );
    const { editor: bare } = await renderChapterEditor(chapterUsj());
    await act(async () =>
      bare.update(() => {
        expect($rebuildChapter($findChapter(), context)).toBe(false);
      }),
    );
  });

  it("a rebuild carries sid and an undisplayed pubnumber over, and derives altnumber from bytes", async () => {
    const { editor } = await renderChapterEditor(
      chapterUsj({ altnumber: "2", pubnumber: "II", sid: "GEN 1" }),
    );
    await act(async () =>
      editor.update(() => {
        const chapter = $findChapter();
        // Force a real rebuild by editing the run's value directly (no caret involvement, so no
        // grace: the rebuild is invoked explicitly).
        const value = requireDefined($chapterAltnumberRunPieces(chapter).value, "value not found");
        value.setTextContent(`${NBSP}4`);
        expect($rebuildChapter(chapter, context)).toBe(true);
      }),
    );
    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("4");
      // sid never derives from bytes; pubnumber has no display yet — both must survive.
      expect(chapter.getSid()).toBe("GEN 1");
      expect(chapter.getPubnumber()).toBe("II");
    });
  });

  it("refuses a rebuild whose bytes no longer tokenize as a chapter (kind change)", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));
    await act(async () =>
      editor.update(() => {
        const chapter = $findChapter();
        const glyph = requireDefined($chapterGlyphTextNode(chapter), "glyph not found");
        glyph.setTextContent("\\q1 1");
        expect($rebuildChapter(chapter, context)).toBe(false);
        // Preserve-or-refuse: the chapter and its state survive untouched.
        expect($isChapterNode($findChapter())).toBe(true);
        expect($findChapter().getAltnumber()).toBe("2");
      }),
    );
  });
});
