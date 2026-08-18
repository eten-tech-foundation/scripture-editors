/**
 * Integration regressions for the chapter settle scope and its `\ca`/`\cp` display runs:
 * display, edit-settle, deletion-settle, typed-literal folds, the block unfold, and the
 * no-pending fixed-point refusal. Chapters were the one displayed construct with NO settle
 * scope — editable bytes with nowhere to re-tokenize would have recreated the milestone
 * edit-loss class (editable on screen, silently discarded on save) — so these pins are what
 * make displaying either run safe at all.
 */

import { requireDefined, viewOptions } from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $rebuildChapter, Tier2Context } from "./tier2Rebuild.utils";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setSelection,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $chapterAltnumberRunPieces,
  $chapterGlyphTextNode,
  $chapterPubnumberRunPieces,
  $isChapterNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  ChapterNode,
  CharNode,
  getMarker as bundledGetMarker,
  getVisibleOpenMarkerText,
  NBSP,
} from "shared";
import { MarkerContent, Usj } from "@eten-tech-foundation/scripture-utilities";
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

/** `renderChapterEditor` plus `HistoryPlugin`, for the undo pins. */
async function renderChapterEditorWithHistory(usj: Usj) {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  return baseTestEnvironment(
    JSON.stringify({ root: state.root }),
    <>
      <MarkerEditPlugin viewOptions={viewOptions} />
      <HistoryPlugin />
    </>,
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
    let wrapperKey: string | undefined;
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
      wrapperKey = pieces.wrapper?.getKey();
    });
    // The wrapper's DOM carries `usfm_ca` — the stylesheet hook that keys BOTH the
    // standalone-char styling (non-bold green, identical in either state) and the
    // own-line placement rule (`.usfm_c .usfm_ca` in usj-nodes.css).
    const wrapperElement = editor.getElementByKey(requireDefined(wrapperKey, "wrapper key"));
    expect(wrapperElement?.classList.contains("attribute-run")).toBe(true);
    expect(wrapperElement?.classList.contains("usfm_ca")).toBe(true);
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

  it("emptying the value settles to a first-class char ca at root, altnumber cleared", async () => {
    // The editor-side twin of the captured ParatextData pin (EmptyCaAlone/EmptyCaThenCp in
    // paranext-core's VerseAttributeFoldRoundTripCaptureTests): an EMPTY \ca span never folds —
    // it degrades to a first-class char element sitting after the chapter at ROOT level, the
    // same shape the 2SA-2 corpus fixture loads to.
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));

    await act(async () => {
      editor.update(() => {
        const value = requireDefined(
          $chapterAltnumberRunPieces($findChapter()).value,
          "ca value not found",
        );
        value.setTextContent(NBSP);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBeUndefined();
      expect(
        $getRoot()
          .getChildren()
          .map((child) => child.getType()),
      ).toEqual(["book", "chapter", "char", "para"]);
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

  it("a rebuild carries sid over, and derives altnumber AND pubnumber from bytes", async () => {
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
      // sid never derives from bytes and is carried; pubnumber now rides its own displayed
      // `\cp` run, whose bytes flow through the same fragment — it survives BY re-tokenizing.
      expect(chapter.getSid()).toBe("GEN 1");
      expect(chapter.getPubnumber()).toBe("II");
    });
  });

  it("a chapter with both runs and no pending edits refuses a rebuild (fixed point)", async () => {
    // Canonical parity for the closer-less \cp shape: the adaptor's built runs must re-tokenize
    // and re-serialize to the identical structure, or every unrelated settle would churn.
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));
    await act(async () =>
      editor.update(() => {
        expect($rebuildChapter($findChapter(), context)).toBe(false);
      }),
    );
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

describe("chapter \\cp published-number run", () => {
  it("loads closer-less after the \\ca run, canonical bytes", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));
    let wrapperKey: string | undefined;
    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBe("A");
      const pieces = $chapterPubnumberRunPieces(chapter);
      expect(pieces.wrapper).toBeDefined();
      expect(pieces.opener?.getTextContent()).toBe("\\cp");
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}A`);
      // \cp has NO closing glyph — its span closes implicitly at the next block boundary in the
      // file, so the wrapper alone bounds the value.
      expect(pieces.closer).toBeUndefined();
      // Anchored directly after \ca's wrapper — the alt-before-pub document order.
      const caWrapper = requireDefined(
        $chapterAltnumberRunPieces(chapter).wrapper,
        "ca wrapper not found",
      );
      expect(caWrapper.getNextSibling()?.is(pieces.wrapper)).toBe(true);
      wrapperKey = pieces.wrapper?.getKey();
    });
    // The wrapper's DOM carries `usfm_cp` — the stylesheet hook keying the standalone-cp
    // styling (bold blue, identical in either state).
    const wrapperElement = editor.getElementByKey(requireDefined(wrapperKey, "wrapper key"));
    expect(wrapperElement?.classList.contains("usfm_cp")).toBe(true);
  });

  it("editing the value settles onto pubnumber on caret departure", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));

    await act(async () =>
      editor.update(() => {
        const value = requireDefined(
          $chapterPubnumberRunPieces($findChapter()).value,
          "cp value not found",
        );
        value.setTextContent(`${NBSP}B`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );

    // Grace holds while the caret sits in the value.
    editor.getEditorState().read(() => {
      expect($findChapter().getPubnumber()).toBe("A");
    });

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBe("B");
      expect(chapter.getAltnumber()).toBe("2");
      const pieces = $chapterPubnumberRunPieces(chapter);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}B`);
      expect(pieces.opener?.getTextContent()).toBe("\\cp");
    });
  });

  it("deleting the whole run clears pubnumber on caret departure with no resurrection", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));

    let openerResurrected: boolean | undefined;
    await act(async () => {
      editor.update(() => {
        const chapter = $findChapter();
        const wrapper = requireDefined(
          $chapterPubnumberRunPieces(chapter).wrapper,
          "cp wrapper not found",
        );
        wrapper.remove();
        const glyph = requireDefined($chapterGlyphTextNode(chapter), "glyph not found");
        glyph.select(glyph.getTextContentSize(), glyph.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
      editor.getEditorState().read(() => {
        openerResurrected = $chapterPubnumberRunPieces($findChapter()).opener !== undefined;
      });
    });
    expect(openerResurrected).toBe(false);

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBeUndefined();
      // The untouched \ca run survives the sibling run's deletion.
      expect(chapter.getAltnumber()).toBe("2");
      expect($chapterPubnumberRunPieces(chapter).opener).toBeUndefined();
      expect($chapterPubnumberRunPieces(chapter).wrapper).toBeUndefined();
    });
  });

  it("typing \\cp bytes at the end of the chapter line folds to pubnumber on departure", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2" }));

    // Simulate typed text landing as a fresh plain TextNode at the end of the chapter's line —
    // after the \ca run — the shape typing at the line end produces.
    await act(async () =>
      editor.update(() => {
        const chapter = $findChapter();
        const typed = $createTextNode("\\cp B");
        chapter.append(typed);
        typed.select(typed.getTextContentSize(), typed.getTextContentSize());
      }),
    );

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBe("B");
      expect(chapter.getAltnumber()).toBe("2");
      const pieces = $chapterPubnumberRunPieces(chapter);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}B`);
    });
  });

  it("markup typed into the value unfolds to a real cp paragraph below the chapter", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));

    await act(async () =>
      editor.update(() => {
        const value = requireDefined(
          $chapterPubnumberRunPieces($findChapter()).value,
          "cp value not found",
        );
        value.setTextContent(`${NBSP}A \\nd x\\nd*`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      // Markup in the span aborts the fold, exactly as ParatextData keeps a \cp with markers as
      // its own marker: pubnumber clears and a REAL cp paragraph materializes below the chapter.
      expect(chapter.getPubnumber()).toBeUndefined();
      expect(chapter.getAltnumber()).toBe("2");
      const next = chapter.getNextSibling();
      if (!$isParaNode(next)) throw new Error("expected a cp ParaNode after the chapter");
      expect(next.getMarker()).toBe("cp");
    });
  });

  it("emptying the value settles to an empty first-class cp paragraph, pubnumber cleared", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));

    await act(async () => {
      editor.update(() => {
        const value = requireDefined(
          $chapterPubnumberRunPieces($findChapter()).value,
          "cp value not found",
        );
        value.setTextContent(NBSP);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      // ParatextData never yields an empty pubnumber: the empty span stays a first-class
      // (empty) cp paragraph.
      expect(chapter.getPubnumber()).toBeUndefined();
      const next = chapter.getNextSibling();
      if (!$isParaNode(next)) throw new Error("expected a cp ParaNode after the chapter");
      expect(next.getMarker()).toBe("cp");
    });
  });

  it("editing BOTH runs' values settles both in one departure", async () => {
    const { editor } = await renderChapterEditor(chapterUsj({ altnumber: "2", pubnumber: "A" }));

    await act(async () =>
      editor.update(() => {
        const chapter = $findChapter();
        const caValue = requireDefined(
          $chapterAltnumberRunPieces(chapter).value,
          "ca value not found",
        );
        const cpValue = requireDefined(
          $chapterPubnumberRunPieces(chapter).value,
          "cp value not found",
        );
        caValue.setTextContent(`${NBSP}3`);
        cpValue.setTextContent(`${NBSP}B`);
        cpValue.select(cpValue.getTextContentSize(), cpValue.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("3");
      expect(chapter.getPubnumber()).toBe("B");
    });
  });
});

describe("first-class \\ca char span adjacent to its chapter", () => {
  /** A one-chapter doc with a FIRST-CLASS `char ca` at root directly after the chapter — the
   * transient pre-fold shape ParatextData folds back onto the chapter on reload. `caContent`
   * spreads the char's own fields (content, closed, ...). */
  function adjacentCaCharUsj(caContent: MarkerContent[]): Usj {
    return {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        { type: "char", marker: "ca", content: caContent },
        { type: "para", marker: "p", content: ["body text"] },
      ],
    };
  }

  /** The single root-level CharNode (the first-class `\ca` span). */
  function $findRootChar(): CharNode {
    const char = $getRoot().getChildren().find($isCharNode);
    return requireDefined(char, "root-level char not found");
  }

  /** The char's value TextNode — its one non-glyph text child. */
  function $rootCharValue(): TextNode {
    const value = $findRootChar()
      .getChildren()
      .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
    return requireDefined(value, "char value text not found");
  }

  it("editing the value folds onto the chapter on caret departure, byte-identical with a reload", async () => {
    const { editor } = await renderChapterEditor(adjacentCaCharUsj(["3"]));

    await act(async () =>
      editor.update(() => {
        const value = $rootCharValue();
        value.setTextContent(`${NBSP}34`);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("34");
      expect(chapter.getNumber()).toBe("1");
      // The first-class char is GONE — folded onto the chapter, not left beside the new run.
      expect(
        $getRoot()
          .getChildren()
          .map((child) => child.getType()),
      ).toEqual(["book", "chapter", "para"]);
      const pieces = $chapterAltnumberRunPieces(chapter);
      expect(pieces.value?.getTextContent()).toBe(`${NBSP}34`);
      expect(pieces.opener?.getTextContent()).toBe("\\ca");
      expect(pieces.closer?.getTextContent()).toBe("\\ca*");
    });

    // Byte-identity with a reload of the same USFM (`\c 1 \ca 34\ca*`): the settled document
    // must BE the folded USJ, not merely converge to it on the next load.
    initializeDeserialize(undefined);
    const settledUsj = deserializeSerializedEditorState(editor.getEditorState().toJSON());
    expect(settledUsj?.content).toEqual([
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1", altnumber: "34" },
      { type: "para", marker: "p", content: ["body text"] },
    ]);
  });

  it("typing a value and closer literal into a settled unclosed \\ca char folds on settle", async () => {
    // TJ's observed sequence: `\ca ` settled to a first-class UNCLOSED char (no closing glyph,
    // closed="false" — the shape the palette's Space flow records); then `3\ca*` typed into
    // that span must fold onto the chapter when it settles — not wait for a reload.
    const { editor } = await renderChapterEditor({
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        { type: "char", marker: "ca", closed: "false" },
        { type: "para", marker: "p", content: ["body text"] },
      ],
    });

    await act(async () =>
      editor.update(() => {
        const typed = $createTextNode(`${NBSP}3\\ca*`);
        $findRootChar().append(typed);
        typed.select(typed.getTextContentSize(), typed.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBe("3");
      expect(
        $getRoot()
          .getChildren()
          .map((child) => child.getType()),
      ).toEqual(["book", "chapter", "para"]);
    });
  });

  it("keeps a markup-bearing adjacent char first-class (fold refused, fixed point)", async () => {
    // Markup inside the span aborts the fold (ParatextData keeps such a `\ca` first-class), so
    // the chapter-scoped settle must land on a fixed point — no restructure, no altnumber.
    const { editor } = await renderChapterEditor(
      adjacentCaCharUsj(["3 ", { type: "char", marker: "nd", content: ["x"] }]),
    );

    await act(async () =>
      editor.update(() => {
        const value = $rootCharValue();
        value.setTextContent(`${NBSP}4 `);
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getAltnumber()).toBeUndefined();
      expect(
        $getRoot()
          .getChildren()
          .map((child) => child.getType()),
      ).toEqual(["book", "chapter", "char", "para"]);
    });
  });
});

/**
 * The other direction of the `\cp` unfold, and the piece the attribute-markers track left open.
 *
 * Typing markup into a chapter's `\cp` value correctly materializes a REAL `\cp` ParaNode below
 * the chapter — Paratext keeps a marker-bearing `cp` first-class, and the two tests above pin
 * that. Deleting the markup again has to put it back, and could not: a `\cp` paragraph is a
 * root-level ParaNode, so its own scope is a PARAGRAPH, and re-tokenizing `\cp 1` alone can only
 * ever produce a `\cp` paragraph. Only a re-tokenize that sees `\c 1` and `\cp 1` TOGETHER can
 * fold, so the paragraph stayed on screen until a reload while the file had already converged.
 *
 * The chapter settle REGION is what carries the fix: it already spans the chapter plus any
 * adjacent first-class `\ca`/`\cp` chars, and a directly-following `\cp` PARAGRAPH joins it on
 * the same terms. The tokenizer stays the single fold authority — plain-text `cp` folds to
 * pubnumber, a marker-bearing one re-tokenizes to the identical paragraph and refuses at the
 * fixed point.
 */
describe("a real \\cp paragraph folds back onto its chapter", () => {
  /** A doc whose chapter is followed by a REAL `\cp` paragraph carrying `cpContent`. */
  function cpParaUsj(cpContent: MarkerContent[], between: MarkerContent[] = []): Usj {
    return {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        ...between,
        { type: "para", marker: "cp", content: cpContent },
        { type: "para", marker: "p", content: ["body text"] },
      ],
    };
  }

  /** The `\cp` ParaNode, or undefined once it has folded away. */
  function $findCpPara() {
    return $getRoot()
      .getChildren()
      .filter($isParaNode)
      .find((para) => para.getMarker() === "cp");
  }

  /** The `\cp` paragraph's value TextNode — its first non-glyph, non-separator text child. */
  function $cpParaValue(): TextNode {
    const para = requireDefined($findCpPara(), "cp paragraph not found");
    const value = para
      .getChildren()
      .find(
        (child): child is TextNode =>
          $isTextNode(child) && !$isMarkerNode(child) && child.getTextContent().trim() !== "",
      );
    return requireDefined(value, "cp paragraph value text not found");
  }

  /**
   * Deletes the `\nd x\nd*` span from the `\cp` paragraph the way a user does — a selection from
   * the end of the plain value through the end of the span, removed — leaving the caret where
   * the deletion ended.
   */
  function $deleteMarkupFromCpPara(): void {
    const value = $cpParaValue();
    const span = requireDefined(
      requireDefined($findCpPara(), "cp paragraph not found").getChildren().find($isCharNode),
      "cp paragraph markup span not found",
    );
    const spanEnd = requireDefined(
      span.getAllTextNodes().at(-1),
      "cp paragraph markup span has no text",
    );
    const selection = $createRangeSelection();
    selection.anchor.set(value.getKey(), value.getTextContentSize(), "text");
    selection.focus.set(spanEnd.getKey(), spanEnd.getTextContentSize(), "text");
    $setSelection(selection);
    selection.removeText();
  }

  it("deleting the markup folds it onto the chapter, byte-identical with a reload", async () => {
    const { editor } = await renderChapterEditor(
      cpParaUsj(["1 ", { type: "char", marker: "nd", content: ["x"] }]),
    );

    await act(async () => {
      editor.update($deleteMarkupFromCpPara);
      await Promise.resolve();
      await Promise.resolve();
    });
    // Deleting a whole span destroys its glyphs, which the deletion transform routes to Tier 2
    // IMMEDIATELY rather than pending — so this fold lands on the keystroke, strictly earlier
    // than a departure settle would. Departing below changes nothing and is asserted anyway:
    // "settled by departure at the latest" is the contract, and a future re-routing of the
    // deletion arm through the pend ledger must keep this test green.
    editor.getEditorState().read(() => {
      expect($findCpPara()).toBeUndefined();
    });

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBe("1");
      // The paragraph is GONE — folded onto the chapter, not left beside the new run.
      expect($findCpPara()).toBeUndefined();
      expect($chapterPubnumberRunPieces(chapter).value?.getTextContent()).toBe(`${NBSP}1`);
    });

    // Byte-identity with a reload of the same USFM (`\c 1 \cp 1`): the settled document must BE
    // the folded USJ, not merely converge to it on the next load.
    initializeDeserialize(undefined);
    const settledUsj = deserializeSerializedEditorState(editor.getEditorState().toJSON());
    expect(settledUsj?.content).toEqual([
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1", pubnumber: "1" },
      { type: "para", marker: "p", content: ["body text"] },
    ]);
  });

  it("typing a value into an EMPTY \\cp paragraph folds it onto the chapter", async () => {
    // The other half of the round trip: an emptied `\cp` is a first-class empty paragraph
    // (ParatextData never yields an empty pubnumber), and giving it a value again makes it
    // foldable. Departure is asserted because that is the contract — settled by the time the
    // caret leaves — not because the fold waits for it; measured, this one also lands at the
    // gesture.
    const { editor } = await renderChapterEditor(cpParaUsj([]));

    await act(async () =>
      editor.update(() => {
        const para = requireDefined($findCpPara(), "cp paragraph not found");
        const typed = $createTextNode("B");
        para.append(typed);
        typed.select(typed.getTextContentSize(), typed.getTextContentSize());
      }),
    );

    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      expect($findChapter().getPubnumber()).toBe("B");
      expect($findCpPara()).toBeUndefined();
    });
  });

  it("does not fold a \\cp paragraph a real paragraph separates from its chapter", async () => {
    const { editor } = await renderChapterEditor(
      cpParaUsj(
        ["1 ", { type: "char", marker: "nd", content: ["x"] }],
        [{ type: "para", marker: "p", content: ["intervening"] }],
      ),
    );

    await act(async () => {
      editor.update($deleteMarkupFromCpPara);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      // Adjacency is the whole rule: a `\cp` further down the document is an ordinary paragraph
      // that happens to carry the marker, and in the file it is not the chapter's attribute.
      expect($findChapter().getPubnumber()).toBeUndefined();
      expect($findCpPara()).toBeDefined();
    });
  });

  it("does not fold a \\cp paragraph that still carries markup", async () => {
    const { editor } = await renderChapterEditor(
      cpParaUsj(["1 ", { type: "char", marker: "nd", content: ["x"] }]),
    );

    // Edit the plain part of the value; the `\nd x\nd*` span stays.
    await act(async () =>
      editor.update(() => {
        const value = $cpParaValue();
        value.setTextContent("2 ");
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );

    editor.getEditorState().read(() => {
      // ParatextData keeps a marker-bearing `cp` first-class, and so does the tokenizer: the
      // widened scope re-tokenizes to the identical paragraph and refuses at the fixed point.
      const chapter = $findChapter();
      expect(chapter.getPubnumber()).toBeUndefined();
      const para = requireDefined($findCpPara(), "cp paragraph not found");
      expect(para.getTextContent()).toContain("2 ");
      expect(para.getChildren().filter($isCharNode)).toHaveLength(1);
    });
  });

  it("undo restores the paragraph the fold removed", async () => {
    const { editor } = await renderChapterEditorWithHistory(
      cpParaUsj(["1 ", { type: "char", marker: "nd", content: ["x"] }]),
    );

    await act(async () => {
      editor.update($deleteMarkupFromCpPara);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () =>
      editor.update(() => {
        $textOutsideChapter().select(0, 0);
      }),
    );
    editor.getEditorState().read(() => {
      expect($findCpPara()).toBeUndefined();
    });

    // The fold is a settle, so it is its own history step (the ratified multi-step-undo rule):
    // one undo puts the paragraph back.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
      await Promise.resolve();
    });

    editor.getEditorState().read(() => {
      expect($findChapter().getPubnumber()).toBeUndefined();
      expect($findCpPara()).toBeDefined();
    });
  });
});
