// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  $expectSelectionToBe,
  updateSelection,
} from "../../../../libs/shared/src/nodes/usj/test.utils";
import ScriptureReferencePlugin from "./ScriptureReferencePlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import type { BookCode } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { act, render } from "@testing-library/react";
import {
  TextNode,
  $getRoot,
  $isElementNode,
  $createPoint,
  $createRangeSelection,
  $setSelection,
  SELECTION_CHANGE_COMMAND,
  $createTextNode,
  LexicalEditor,
  $getSelection,
} from "lexical";
import type { BaseSelection } from "lexical";
import { useEffect, useState } from "react";
import {
  $createBookNode,
  $createImmutableChapterNode,
  $createParaNode,
  $isBookNode,
  getSelectionStartNode,
} from "shared";
import { $createImmutableVerseNode, usjReactNodes } from "shared-react";

beforeAll(() => {
  // jsdom has no layout engine, so it never implemented `Range.getBoundingClientRect` (unlike
  // `Element.getBoundingClientRect`, which jsdom stubs to an empty rect). Lexical's
  // updateDOMSelection reads it on the scroll-into-view path: for a collapsed selection it
  // resolves `selectionTarget` to either an element child (offset lookup) or, when the native
  // DOM selection doesn't resolve to an element boundary, `domSelection.getRangeAt(0)` - a Range
  // over a Text node, which is what the plugin's document-swap cursor placement
  // (`verseOrParaNode.select(0, 0)` in $moveCursorToVerseStart) produces here. Without this shim
  // that call throws "selectionTarget.getBoundingClientRect is not a function" from inside
  // Lexical's async $commitPendingUpdates (see node_modules/lexical/Lexical.dev.mjs:7931),
  // outside any test's promise chain, so it surfaces as an unhandled error rather than a test
  // failure. An empty DOMRect is the standard, semantically-truthful stand-in: jsdom has no real
  // layout to report.
  Range.prototype.getBoundingClientRect = () => new DOMRect();

  // jsdom's HTMLElement.focus() collapses the document Selection to the start of the focused
  // element; a real browser preserves an existing in-element selection across focus(). Lexical's
  // updateDOMSelection calls `rootElement.focus({ preventScroll: true })` on its "DOM selection
  // already matches the target" branch (a cursor-visibility ensure-focus) whenever the root isn't
  // document.activeElement - which, after a mutating editor.update that leaves the caret unmoved
  // (e.g. appending an unrelated node), is exactly the branch taken. In a real browser that call
  // is a harmless no-op for the selection; in jsdom it wipes the caret the reconcile just
  // confirmed, and a later deferred native `selectionchange` reads the corrupted (collapsed-to-
  // start) selection back into the editor state. Restoring the pre-focus range models the real
  // browser and keeps the caret where Lexical placed it.
  const originalFocus = HTMLElement.prototype.focus;
  HTMLElement.prototype.focus = function focus(options?: FocusOptions) {
    const selection = document.getSelection();
    const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
    originalFocus.call(this, options);
    if (savedRange && selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }
  };
});

let sectionTextNode: TextNode;
let firstVerseTextNode: TextNode;
let secondVerseTextNode: TextNode;
let thirdVerseTextNode: TextNode;

describe("ScriptureReferencePlugin", () => {
  const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };
  const mockOnScrRefChange = vi.fn();

  beforeEach(() => {
    mockOnScrRefChange.mockClear();
  });

  it("should load default initialEditorState (sanity check) and book loaded", async () => {
    const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toBe(
        "Test Book\n\nSection Text\n\nfirst verse text \n\nsecond verse text \n\nthird verse text ",
      );
      $expectSelectionToBe(firstVerseTextNode, 0);
    });
    expect(mockOnScrRefChange).not.toHaveBeenCalled();
  });

  describe("Book code sync (scrRef.book vs content)", () => {
    it("should call onScrRefChange with content book when scrRef.book mismatches", async () => {
      // Content has EXO, scrRef has GEN - plugin should correct book from BookNode
      const scrRefWithWrongBook = { book: "GEN", chapterNum: 1, verseNum: 1 };

      await testEnvironment(scrRefWithWrongBook, mockOnScrRefChange, () =>
        $appendScrRefPluginFixture("EXO"),
      );

      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "EXO", chapterNum: 1, verseNum: 1 }),
      );
    });

    it("should not call onScrRefChange for book sync when scrRef.book matches content", async () => {
      // Content has GEN, scrRef has GEN - no book correction needed
      await testEnvironment(scrRef, mockOnScrRefChange);

      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not call onScrRefChange when BookNode has empty code", async () => {
      const scrRefWithWrongBook = { book: "GEN", chapterNum: 1, verseNum: 1 };

      await testEnvironment(scrRefWithWrongBook, mockOnScrRefChange, () =>
        $appendScrRefPluginFixture(""),
      );

      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not echo the stale document's book when scrRef navigates to a different book while the old document is still loaded", async () => {
      // Content stays on GEN (the old document hasn't been swapped in yet - simulates the
      // window between a host navigating across books and the new book's USJ finishing its
      // async load). scrRef.book already matches the content at mount, so no sync fires yet.
      const { setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // Host navigates across books (here GEN -> EXO): scrRef now targets a different book (and
      // a verse that still exists in the stale document, isolating this test to the book-sync
      // listener rather than the separate cursor-placement/BCV path), but the editor still
      // contains the OLD book's BookNode.
      await setScrRef({ book: "EXO", chapterNum: 1, verseNum: 2 });

      // The plugin must not echo the stale document's book back to the host combined with the
      // new chapter/verse - that would corrupt the navigation (e.g. EXO 1:2 -> GEN 1:2).
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });
  });

  describe("Selection Change", () => {
    it("should move the cursor", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

      updateSelection(editor, firstVerseTextNode, 2);

      editor.getEditorState().read(() => {
        $expectSelectionToBe(firstVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });
  });

  describe("Incoming scrRef Change", () => {
    it("should move the cursor", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 2 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not move the cursor if already in verse", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      updateSelection(editor, secondVerseTextNode, 2);
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);

      await setScrRef({ ...scrRef, verseNum: 2 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).toHaveBeenCalled();
    });

    it("should move the cursor into the start of range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 3 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should move the cursor into the end of range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, firstVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 4 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 0);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should not move the cursor if already in range", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, thirdVerseTextNode, 2);

      await setScrRef({ ...scrRef, verseNum: 3 });

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 2);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("should report verse 0 when cursor is on verse 1 number (before verse content)", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);
      let verse1Key: string | undefined;
      editor.getEditorState().read(() => {
        const root = $getRoot();
        const nodeWithVerse1 = root.getChildAtIndex(3);
        if (nodeWithVerse1 && $isElementNode(nodeWithVerse1)) {
          verse1Key = nodeWithVerse1.getFirstChild()?.getKey();
        }
      });
      // First dispatch consumes the mount cursor-placement suppression in the old code and is a
      // no-op report (position == scrRef) in the new code.
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      mockOnScrRefChange.mockClear();
      await act(async () => {
        editor.update(() => {
          if (verse1Key) {
            const selection = $createRangeSelection();
            selection.anchor = $createPoint(verse1Key, 0, "element");
            selection.focus = $createPoint(verse1Key, 0, "element");
            $setSelection(selection);
          }
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
        });
      });

      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 0 }),
      );
    });
  });

  describe("Characterization (pinned behavior, old and new implementation)", () => {
    it("reports a genuine selection change in another verse", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);
      // First dispatch consumes the mount cursor-placement suppression in the old code and is a
      // no-op report (position == scrRef) in the new code.
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      mockOnScrRefChange.mockClear();

      updateSelection(editor, secondVerseTextNode, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      await flushQueuedEvents();

      expect(mockOnScrRefChange).toHaveBeenCalled();
      // Under a non-echoing test host the pre-rework implementation may report the same position a
      // second time when jsdom's queued native selectionchange replays (the host never updates the
      // prop, so the position still differs from it). Identical duplicates are tolerated by this pin;
      // any call with a DIFFERENT payload is a regression.
      mockOnScrRefChange.mock.calls.forEach(([reported]) => {
        expect(reported).toMatchObject({ book: "GEN", chapterNum: 1, verseNum: 2 });
      });
    });

    it("does not move the caret when our own report echoes back as the prop", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      updateSelection(editor, secondVerseTextNode, 5);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      expect(mockOnScrRefChange).toHaveBeenCalledWith(expect.objectContaining({ verseNum: 2 }));

      // The host reflects our report back verbatim - the caret must stay exactly where it was
      // (mid-verse, offset 5), not snap to the verse start.
      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 2 });
      await flushQueuedEvents();

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 5);
      });
    });

    it("corrects the host's book exactly once on an in-editor document swap", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

      await swapDocument(editor, () => $appendScrRefPluginFixture("EXO"));
      await flushQueuedEvents();

      expect(mockOnScrRefChange).toHaveBeenCalledTimes(1);
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "EXO", chapterNum: 1, verseNum: 1 }),
      );
    });

    it("reports 1:0 for a click in book-intro content before the first chapter", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      mockOnScrRefChange.mockClear();
      let bookTitleTextNode: TextNode | undefined;
      editor.getEditorState().read(() => {
        const bookNode = $getRoot().getFirstChild();
        if (bookNode && $isElementNode(bookNode)) {
          const child = bookNode.getFirstChild();
          if (child instanceof TextNode) bookTitleTextNode = child;
        }
      });
      if (!bookTitleTextNode) throw new Error("fixture book title not found");

      updateSelection(editor, bookTitleTextNode, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      // Content before \c 1 addresses as chapter 1 verse 0 (USFM convention).
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 0 }),
      );
    });
  });

  describe("Navigation races", () => {
    it("emits nothing while an external navigation to a not-yet-loaded chapter settles, then lands on the target", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // Host navigates to GEN 2:9; chapter 2's content has not loaded (document still chapter 1).
      await setScrRef({ book: "GEN", chapterNum: 2, verseNum: 9 });

      // The editor settles the caret somewhere in the stale content (e.g. the section head) and a
      // selectionchange fires - the pre-fix code reports this settle as a user move (verse 0 /
      // wrong chapter), corrupting the navigation.
      updateSelection(editor, sectionTextNode, 0);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      await flushQueuedEvents();
      expect(mockOnScrRefChange).not.toHaveBeenCalled();

      // Chapter 2's document arrives (full swap, like LoadStatePlugin).
      await swapDocument(editor, $chapter2State);
      await flushQueuedEvents();

      // The caret landed on the navigation target and nothing was ever echoed to the host.
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        const startNode = getSelectionStartNodeForTest(selection);
        expect(startNode?.getTextContent()).toBe("verse nine ");
      });
    });

    it("keeps the caret still when two reports echo back in order (FIFO, not a slot)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await pressEditor(editor); // ensure idle
      // Report #1: verse 2. Report #2: verse 3 (range 3-4). Both before any echo returns.
      updateSelection(editor, secondVerseTextNode, 1);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      updateSelection(editor, thirdVerseTextNode, 4);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      expect(mockOnScrRefChange).toHaveBeenCalledTimes(2);
      const [firstEcho] = mockOnScrRefChange.mock.calls[0];
      const [secondEcho] = mockOnScrRefChange.mock.calls[1];
      mockOnScrRefChange.mockClear();

      // Host echoes both, in order. Neither may move the caret off thirdVerse offset 4.
      await setScrRef(firstEcho);
      await setScrRef(secondEcho);
      await flushQueuedEvents();

      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 4);
      });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("does not report a stale settle from a superseded navigation (rapid list navigation)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // Item A: GEN 1:2 (content present, cursor placed). Item B follows before A's queued
      // selectionchange fires.
      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 2 });
      await setScrRef({ book: "GEN", chapterNum: 2, verseNum: 9 });

      // A's queued settle now fires, describing the verse-2 position - obsolete. Must be silent.
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      await flushQueuedEvents();
      expect(mockOnScrRefChange).not.toHaveBeenCalled();

      // B's chapter arrives and the caret lands on 2:9; still nothing echoed.
      await swapDocument(editor, $chapter2State);
      await flushQueuedEvents();
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("treats an echo arriving after a newer external navigation as external (documented trade-off)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await pressEditor(editor);
      updateSelection(editor, secondVerseTextNode, 1);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      const [ourReport] = mockOnScrRefChange.mock.calls[0];
      mockOnScrRefChange.mockClear();

      // A newer external navigation clears the pending-echo queue...
      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 3 });
      // ...so our old report arriving late is (deliberately) treated as a real navigation: the
      // caret moves to it. Reordered host writes are the host's statement of intent.
      await setScrRef(ourReport);
      await flushQueuedEvents();

      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 0);
      });
    });

    it("ignores a superseded book's document landing during a newer navigation", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // GEN -> EXO 3:2 -> LEV 5:1 in quick succession; then EXO's USJ lands late.
      await setScrRef({ book: "EXO", chapterNum: 3, verseNum: 2 });
      await setScrRef({ book: "LEV", chapterNum: 5, verseNum: 1 });
      await swapDocument(editor, () => $appendScrRefPluginFixture("EXO"));
      await flushQueuedEvents();

      // The late EXO arrival must not hijack the LEV navigation: no emission at all.
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("does not echo the stale book when its BookNode is edited during a cross-book navigation", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // Host navigates GEN -> EXO 1:2; GEN's document is still mounted, awaiting EXO's USJ.
      await setScrRef({ book: "EXO", chapterNum: 1, verseNum: 2 });

      // A structural edit clones GEN's BookNode ("updated" mutation) - e.g. a remote delta on the
      // \id line. Pre-fix, this re-emitted {book: GEN, chapterNum: 1, verseNum: 2}.
      await act(async () => {
        editor.update(() => {
          const bookNode = $getRoot().getChildren().find($isBookNode);
          bookNode?.append($createTextNode(" edited"));
        });
      });
      await flushQueuedEvents();

      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("syncs from the first BookNode only when a document has strays", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);

      // A stray second BookNode (malformed USJ / cross-editor paste) appears. The first (GEN)
      // matches scrRef, so nothing may be emitted - the stray EXO must not drive a correction.
      await act(async () => {
        editor.update(() => {
          $getRoot().append($createBookNode("EXO").append($createTextNode("Stray")));
        });
      });
      await flushQueuedEvents();

      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("reports the user's first click after a navigation (window closes on pointerdown)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);

      // Navigation is still settling (chapter 2 never loads - worst case).
      await setScrRef({ book: "GEN", chapterNum: 2, verseNum: 9 });
      expect(mockOnScrRefChange).not.toHaveBeenCalled();

      // The user clicks verse 2 in the (stale) document: pointerdown fires before the click's
      // selectionchange, so the window is closed by the time the position reports.
      await pressEditor(editor);
      updateSelection(editor, secondVerseTextNode, 3);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      expect(mockOnScrRefChange).toHaveBeenCalledTimes(1);
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 2 }),
      );
    });

    it("applies a navigation to verse 0 (chapter top) without echoing anything", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, secondVerseTextNode, 3);

      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 0 });
      await flushQueuedEvents();

      // Nothing echoed; the caret landed at the chapter top - verse 0 places at the start of the
      // chapter's first para (the section head).
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
      editor.getEditorState().read(() => {
        $expectSelectionToBe(sectionTextNode, 0);
      });
    });

    it("does not swallow the first user click after navigation in a read-only editor", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await act(async () => {
        editor.setEditable(false);
      });

      // Host navigates; in read-only editors Lexical skips the DOM-selection write, so no native
      // selectionchange ever consumes anything. The pre-fix one-shot flag stayed armed here.
      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 2 });

      // First real user click must report - state-based suppression cannot wedge.
      await pressEditor(editor);
      // Nested dispatch mirrors Lexical's onSelectionChange delivery (document-level selectionchange
      // is ungated by editability).
      await act(async () => {
        editor.update(() => {
          const selection = $createRangeSelection();
          selection.anchor = $createPoint(thirdVerseTextNode.getKey(), 1, "text");
          selection.focus = $createPoint(thirdVerseTextNode.getKey(), 1, "text");
          $setSelection(selection);
          editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
        });
      });

      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 3, verse: "3-4" }),
      );
    });

    it("does not move the caret into a wrong-book document arriving mid-navigation (placement gate)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      updateSelection(editor, secondVerseTextNode, 3);

      // Host navigates to LEV 1:2; GEN stays mounted (LEV's document never arrives).
      await setScrRef({ book: "LEV", chapterNum: 1, verseNum: 2 });

      // A superseded EXO document arrives - the wrong book for the in-flight LEV navigation.
      // The machine must neither emit nor place the caret at the navigation's chapter/verse
      // inside this wrong-book document (placement targets only the navigation's own book).
      await swapDocument(editor, () => $appendScrRefPluginFixture("EXO"));
      await flushQueuedEvents();

      expect(mockOnScrRefChange).not.toHaveBeenCalled();
      editor.getEditorState().read(() => {
        const startNode = getSelectionStartNodeForTest($getSelection());
        // A wrongly-fired placement would land exactly here: EXO's verse-2 text at offset 0.
        expect(startNode?.getTextContent()).not.toBe("second verse text ");
      });
    });

    it("falls back to the prop book for position reports when the document has no book code", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange, () =>
        $appendScrRefPluginFixture(""),
      );
      await flushQueuedEvents();
      mockOnScrRefChange.mockClear();
      await pressEditor(editor);

      let emptyCodeVerse2Text: TextNode | undefined;
      editor.getEditorState().read(() => {
        const para = $getRoot().getChildAtIndex(4); // book, chapter, section, verse-1 para, verse-2 para
        if (para && $isElementNode(para)) {
          const last = para.getLastChild();
          if (last instanceof TextNode) emptyCodeVerse2Text = last;
        }
      });
      if (!emptyCodeVerse2Text) throw new Error("empty-code fixture verse-2 text not found");

      updateSelection(editor, emptyCodeVerse2Text, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      // The document's BookNode has code "" - it cannot name its own book, so the report carries
      // the prop's book (I1's documented fallback) with the document's chapter/verse.
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 2 }),
      );
    });

    it("carries the host's versificationStr on position reports", async () => {
      const { editor } = await testEnvironment(
        { book: "GEN", chapterNum: 1, verseNum: 1, versificationStr: "English" },
        mockOnScrRefChange,
      );
      await pressEditor(editor);

      updateSelection(editor, secondVerseTextNode, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      // A document states no versification, so the host's must ride along - a report that strips
      // it could map to the wrong physical verse under a divergent versification.
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({
          book: "GEN",
          chapterNum: 1,
          verseNum: 2,
          versificationStr: "English",
        }),
      );
    });

    it("emits nothing for a selection in a document with no book and no chapter (unaddressable)", async () => {
      let looseTextNode: TextNode | undefined;
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange, () => {
        looseTextNode = $createTextNode("loose text outside any book or chapter");
        $getRoot().append($createParaNode().append(looseTextNode));
      });
      await flushQueuedEvents();
      mockOnScrRefChange.mockClear();
      await pressEditor(editor);
      if (!looseTextNode) throw new Error("loose fixture text not found");

      updateSelection(editor, looseTextNode, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      await flushQueuedEvents();

      // I5: a document with no BookNode and no ChapterNode cannot address any position - silence.
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("clears earlier pending echoes when a later report's echo returns (batched host)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await pressEditor(editor);
      // Two reports in flight: verse 2, then verse 3 (range 3-4).
      updateSelection(editor, secondVerseTextNode, 1);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      updateSelection(editor, thirdVerseTextNode, 4);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      expect(mockOnScrRefChange).toHaveBeenCalledTimes(2);
      const [, [secondReport]] = mockOnScrRefChange.mock.calls;
      mockOnScrRefChange.mockClear();

      // A batching host renders only the LAST state: only the second report echoes back. Consuming
      // it must splice through the queue (clearing the first report's pending echo too).
      await setScrRef(secondReport);
      await flushQueuedEvents();
      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 4);
      });

      // The first report's ref must NOT linger as a pending echo: a genuine external navigation to
      // that same ref must be APPLIED (caret moves), not swallowed as our own echo returning.
      await setScrRef({ book: "GEN", chapterNum: 1, verseNum: 2 });
      await flushQueuedEvents();
      editor.getEditorState().read(() => {
        $expectSelectionToBe(secondVerseTextNode, 0);
      });
    });

    it("does not reset the verse on an idle same-book reload (view-option toggle)", async () => {
      const { editor } = await testEnvironment(
        { book: "GEN", chapterNum: 1, verseNum: 2 },
        mockOnScrRefChange,
      );
      await pressEditor(editor); // ensure idle
      updateSelection(editor, secondVerseTextNode, 3); // user parked mid verse 2
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      mockOnScrRefChange.mockClear();

      // Same-book, same-scrRef full reload - what a view-option toggle triggers via LoadStatePlugin.
      await swapDocument(editor, $defaultInitialEditorState);
      await flushQueuedEvents();

      // The reload's transient chapter-top settle must be silenced (pre-fix: emitted verseNum 0).
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("reports the first click after an idle same-book reload (reload window does not wedge)", async () => {
      const { editor } = await testEnvironment(
        { book: "GEN", chapterNum: 1, verseNum: 2 },
        mockOnScrRefChange,
      );
      await pressEditor(editor);
      await swapDocument(editor, $defaultInitialEditorState);
      await flushQueuedEvents();
      mockOnScrRefChange.mockClear();

      await pressEditor(editor);
      updateSelection(editor, thirdVerseTextNode, 1);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 3, verse: "3-4" }),
      );
    });

    it("does not move the caret when a pasted BookNode arrives while a document is loaded", async () => {
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange);
      await pressEditor(editor);
      updateSelection(editor, thirdVerseTextNode, 2); // user editing in verse 3-4
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      mockOnScrRefChange.mockClear();

      // A pure-created BookNode lands (cross-editor paste / undo) - NOT a document replacement.
      await act(async () => {
        editor.update(() => {
          $getRoot().append($createBookNode("EXO").append($createTextNode("Pasted")));
        });
      });
      await flushQueuedEvents();

      // No placement (caret stays where the user was editing), no emission from the stray.
      editor.getEditorState().read(() => {
        $expectSelectionToBe(thirdVerseTextNode, 2);
      });
    });

    it("treats a malformed verse range as not containing the verse instead of throwing", async () => {
      let malformedVerseText: TextNode | undefined;
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange, () => {
        malformedVerseText = $createTextNode("backwards range text ");
        $getRoot().append(
          $createBookNode("GEN").append($createTextNode("Test Book")),
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("3-2"), malformedVerseText),
        );
      });
      await pressEditor(editor);
      if (!malformedVerseText) throw new Error("fixture text not found");

      updateSelection(editor, malformedVerseText, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      // No throw escaped the listener, and the position still reports (verseNum from the range's
      // first number; the malformed range string rides along).
      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 3 }),
      );
    });

    it("emits nothing when a verse number is malformed (non-numeric)", async () => {
      let malformedVerseText: TextNode | undefined;
      const { editor } = await testEnvironment(scrRef, mockOnScrRefChange, () => {
        malformedVerseText = $createTextNode("unnumbered verse text ");
        $getRoot().append(
          $createBookNode("GEN").append($createTextNode("Test Book")),
          $createImmutableChapterNode("1"),
          $createParaNode().append($createImmutableVerseNode("x"), malformedVerseText),
        );
      });
      await pressEditor(editor);
      if (!malformedVerseText) throw new Error("fixture text not found");

      updateSelection(editor, malformedVerseText, 2);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });
      await flushQueuedEvents();

      // I5: a verse whose number does not parse addresses nothing - silence, not {verseNum: NaN}.
      expect(mockOnScrRefChange).not.toHaveBeenCalled();
    });

    it("closes the navigation window on beforeinput (IME/voice/paste input paths)", async () => {
      const { editor, setScrRef } = await testEnvironment(scrRef, mockOnScrRefChange);
      await setScrRef({ book: "GEN", chapterNum: 2, verseNum: 9 }); // window open, chapter 2 never loads
      expect(mockOnScrRefChange).not.toHaveBeenCalled();

      await act(async () => {
        editor.getRootElement()?.dispatchEvent(new Event("beforeinput", { bubbles: true }));
      });
      updateSelection(editor, secondVerseTextNode, 3);
      await act(async () => {
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      });

      expect(mockOnScrRefChange).toHaveBeenCalledWith(
        expect.objectContaining({ book: "GEN", chapterNum: 1, verseNum: 2 }),
      );
    });
  });
});

function $defaultInitialEditorState() {
  sectionTextNode = $createTextNode("Section Text");
  firstVerseTextNode = $createTextNode("first verse text ");
  secondVerseTextNode = $createTextNode("second verse text ");
  thirdVerseTextNode = $createTextNode("third verse text ");

  $getRoot().append(
    $createBookNode("GEN").append($createTextNode("Test Book")),
    $createImmutableChapterNode("1"),
    $createParaNode("s1").append(sectionTextNode),
    $createParaNode().append($createImmutableVerseNode("1"), firstVerseTextNode),
    $createParaNode().append($createImmutableVerseNode("2"), secondVerseTextNode),
    $createParaNode().append($createImmutableVerseNode("3-4"), thirdVerseTextNode),
  );
}

/** Same outline as `$defaultInitialEditorState` but with a parameterized book code (for book-sync tests). */
function $appendScrRefPluginFixture(bookCode: BookCode | "") {
  $getRoot().append(
    $createBookNode(bookCode).append($createTextNode("Test Book")),
    $createImmutableChapterNode("1"),
    $createParaNode("s1").append($createTextNode("Section Text")),
    $createParaNode().append($createImmutableVerseNode("1"), $createTextNode("first verse text ")),
    $createParaNode().append($createImmutableVerseNode("2"), $createTextNode("second verse text ")),
    $createParaNode().append(
      $createImmutableVerseNode("3-4"),
      $createTextNode("third verse text "),
    ),
  );
}

/** A GEN document holding only chapter 2 (verses 8-10), as a chapter-level load would produce. */
function $chapter2State() {
  $getRoot().append(
    $createBookNode("GEN").append($createTextNode("Test Book")),
    $createImmutableChapterNode("2"),
    $createParaNode().append($createImmutableVerseNode("8"), $createTextNode("verse eight ")),
    $createParaNode().append($createImmutableVerseNode("9"), $createTextNode("verse nine ")),
    $createParaNode().append($createImmutableVerseNode("10"), $createTextNode("verse ten ")),
  );
}

async function testEnvironment(
  scrRef: SerializedVerseRef = { book: "GEN", chapterNum: 1, verseNum: 1 },
  onScrRefChange: (scrRef: SerializedVerseRef) => void = () => undefined,
  $initialEditorState: () => void = $defaultInitialEditorState,
) {
  let editor: LexicalEditor | undefined;
  const setScrRefRef: { current: ((scrRef: SerializedVerseRef) => void) | undefined } = {
    current: undefined,
  };

  function GrabEditor() {
    const [composerEditor] = useLexicalComposerContext();

    useEffect(() => {
      editor = composerEditor;
    }, [composerEditor]);

    return null;
  }

  function App() {
    const [internalScrRef, setInternalScrRef] = useState<SerializedVerseRef>(scrRef);

    useEffect(() => {
      setScrRefRef.current = setInternalScrRef;
    }, [setInternalScrRef]);

    return (
      <LexicalComposer
        initialConfig={{
          editorState: $initialEditorState,
          namespace: "TestEditor",
          nodes: usjReactNodes,
          onError: (error) => {
            throw error;
          },
          theme: {},
        }}
      >
        <GrabEditor />
        <RichTextPlugin
          contentEditable={<ContentEditable />}
          placeholder={null}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ScriptureReferencePlugin scrRef={internalScrRef} onScrRefChange={onScrRefChange} />
      </LexicalComposer>
    );
  }

  async function setScrRef(newScrRef: SerializedVerseRef) {
    await act(async () => {
      setScrRefRef.current?.(newScrRef);
    });
  }

  await act(async () => {
    render(<App />);
  });

  // `editor` is defined on React render.
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return { editor: editor!, setScrRef };
}

/**
 * Flush queued macrotasks + microtasks inside act(). jsdom fires native `selectionchange` via
 * setTimeout(0), and the plugin defers cursor placement by a microtask, so tests that assert
 * "nothing further happens" must flush both before asserting quiescence.
 */
async function flushQueuedEvents() {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  });
}

/**
 * Replace the whole document in one update - the same shape LoadStatePlugin's setEditorState
 * swap produces (old BookNode destroyed + new BookNode created in a single mutation batch).
 */
async function swapDocument(editor: LexicalEditor, $newState: () => void) {
  await act(async () => {
    editor.update(() => {
      $getRoot().clear();
      $newState();
    });
  });
}

/** Simulate genuine user input on the editor root (what ends a navigation window). Flushes first:
 * a real click can never race an *earlier, already-completed* DOM write's own native
 * `selectionchange` notification - in a real browser that notification is effectively immediate,
 * long before a human could physically click. jsdom instead defers it via `setTimeout(0)` (see
 * `flushQueuedEvents`), so without this flush a still-pending echo of an earlier programmatic
 * placement can arrive after this press has already closed the window and be misread as the
 * user's settle. */
async function pressEditor(editor: LexicalEditor) {
  await flushQueuedEvents();
  await act(async () => {
    editor.getRootElement()?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
}

function getSelectionStartNodeForTest(selection: BaseSelection | null) {
  return getSelectionStartNode(selection);
}
