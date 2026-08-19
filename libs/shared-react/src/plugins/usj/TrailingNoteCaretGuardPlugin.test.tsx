// Should only be used on nodes that are initialized in the test environment.
/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { $createImmutableNoteCallerNode, $createImmutableVerseNode } from "../../nodes/usj";
import { getViewOptions } from "../../views/view-options.utils";
import { STANDARD_VIEW_MODE } from "../../views/view-mode.model";
import { ArrowNavigationPlugin } from "./ArrowNavigationPlugin";
import { EmptyVerseCaretGuardPlugin } from "./EmptyVerseCaretGuardPlugin";
import { baseTestEnvironment, pressKey, updateSelection } from "./react-test.utils";
import { TrailingNoteCaretGuardPlugin } from "./TrailingNoteCaretGuardPlugin";
import { act } from "@testing-library/react";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BLUR_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createNoteNode,
  $createParaNode,
  CURSOR_PLACEHOLDER_CHAR,
  NoteNode,
  ParaNode,
} from "shared";

/** `\p before |note|` with editable markers, so the note is fronted by its opening glyph. */
function $createTrailingNote(): NoteNode {
  return $createNoteNode("f", "+").append(
    $createMarkerNode("f", "opening"),
    $createImmutableNoteCallerNode("+", "note preview"),
    $createMarkerTrailingSeparator(),
    $createCharNode("ft").append($createMarkerNode("ft", "opening"), $createTextNode("note body")),
    $createMarkerNode("f", "closing"),
  );
}

/** Fire the selection-change command the plugin listens on, inside act. */
async function dispatchSelectionChange(editor: LexicalEditor) {
  await act(async () => {
    editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
  });
}

/** Park the caret on the paragraph's own end — the element point past a trailing note. */
async function restCaretPastNote(editor: LexicalEditor, para: ParaNode) {
  await act(async () => {
    editor.update(() => {
      para.select(para.getChildrenSize(), para.getChildrenSize());
    });
  });
  await dispatchSelectionChange(editor);
}

/** How many children the paragraph has. */
function paraChildCount(editor: LexicalEditor, para: ParaNode): number {
  return editor.getEditorState().read(() => para.getChildrenSize());
}

function hasCaretHost(editor: LexicalEditor, para: ParaNode): boolean {
  return editor
    .getEditorState()
    .read(() =>
      para
        .getChildren()
        .some(
          (child) => $isTextNode(child) && child.getTextContent().includes(CURSOR_PLACEHOLDER_CHAR),
        ),
    );
}

describe("TrailingNoteCaretGuardPlugin", () => {
  it("hosts the caret past a collapsed note that ends its paragraph", async () => {
    let para: ParaNode;
    let note: NoteNode;
    const { editor } = await baseTestEnvironment(
      () => {
        note = $createTrailingNote();
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), note));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);

    editor.getEditorState().read(() => {
      const children = para.getChildren();
      // A zero-width-space host now follows the note, giving the position something to render in.
      expect(children.length).toBe(3);
      expect(note.is(children[1])).toBe(true);
      expect($isTextNode(children[2])).toBe(true);
      expect(children[2].getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
      // The caret rests inside that host.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.isCollapsed()).toBe(true);
      expect(selection.anchor.key).toBe(children[2].getKey());
      expect(selection.anchor.offset).toBe(0);
    });
  });

  it("does not host when a text node already follows the note", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(
      () => {
        para = $createParaNode("p");
        $getRoot().append(
          para.append($createTextNode("before "), $createTrailingNote(), $createTextNode(" after")),
        );
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);

    expect(hasCaretHost(editor, para!)).toBe(false);
  });

  it("does not host past an EXPANDED note, whose own end is rendered text", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(
      () => {
        const note = $createTrailingNote().setIsCollapsed(false);
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), note));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);

    expect(hasCaretHost(editor, para!)).toBe(false);
  });

  it("does not host in a paragraph nobody put a caret in", async () => {
    let firstPara: ParaNode;
    let secondText: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        firstPara = $createParaNode("p");
        secondText = $createTextNode("second para");
        $getRoot().append(
          firstPara.append($createTextNode("before "), $createTrailingNote()),
          $createParaNode("p").append(secondText),
        );
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await act(async () => {
      editor.update(() => {
        secondText.select(0, 0);
      });
    });
    await dispatchSelectionChange(editor);

    expect(hasCaretHost(editor, firstPara!)).toBe(false);
  });

  it("removes the host when the caret leaves the paragraph end", async () => {
    let para: ParaNode;
    let before: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        before = $createTextNode("before ");
        para = $createParaNode("p");
        $getRoot().append(para.append(before, $createTrailingNote()));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);
    expect(hasCaretHost(editor, para!)).toBe(true);

    // Back to the text before the note — the position one backward press already reaches.
    await act(async () => {
      editor.update(() => {
        before.select(0, 0);
      });
    });
    await dispatchSelectionChange(editor);

    expect(hasCaretHost(editor, para!)).toBe(false);
    expect(paraChildCount(editor, para!)).toBe(2);
  });

  it("removes the host on blur", async () => {
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(
      () => {
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), $createTrailingNote()));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);
    expect(hasCaretHost(editor, para!)).toBe(true);

    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, new FocusEvent("blur"));
    });

    expect(hasCaretHost(editor, para!)).toBe(false);
  });

  it("removes the host once a range selection spans the note (so copy/cut can't include it)", async () => {
    // The clipboard path serializes the node tree, not USJ, so it has no placeholder awareness.
    let para: ParaNode;
    let before: TextNode;
    const { editor } = await baseTestEnvironment(
      () => {
        before = $createTextNode("before ");
        para = $createParaNode("p");
        $getRoot().append(para.append(before, $createTrailingNote()));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);
    expect(hasCaretHost(editor, para!)).toBe(true);

    await act(async () => {
      editor.update(() => {
        const range = $createRangeSelection();
        range.anchor.set(before.getKey(), 0, "text");
        range.focus.set(para.getKey(), para.getChildrenSize(), "element");
        $setSelection(range);
      });
    });
    await dispatchSelectionChange(editor);

    expect(hasCaretHost(editor, para!)).toBe(false);
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection) ? selection.getTextContent() : "").not.toContain(
        CURSOR_PLACEHOLDER_CHAR,
      );
    });
  });

  it("puts typed text after the note and strips the placeholder", async () => {
    let para: ParaNode;
    let note: NoteNode;
    const { editor } = await baseTestEnvironment(
      () => {
        note = $createTrailingNote();
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), note));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);
    expect(hasCaretHost(editor, para!)).toBe(true);

    await act(async () => {
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("X");
      });
    });

    editor.getEditorState().read(() => {
      const lastChild = para.getLastChild();
      expect($isTextNode(lastChild) && lastChild.getTextContent()).toBe("X");
      expect(note.getTextContent()).not.toContain("X");
      // The caret follows the typed character rather than staying behind the stripped placeholder.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.offset).toBe(1);
    });
  });

  // With the arrow plugin mounted too — the combination the app runs. The arrow rules decide WHERE
  // the caret goes (the paragraph's own end, outside the note); the guard decides what renders
  // there. Neither is changed to accommodate the other, so this pins that they compose.
  describe("with arrow navigation", () => {
    async function arrowEnvironment() {
      let para: ParaNode;
      let before: TextNode;
      let note: NoteNode;
      const { editor } = await baseTestEnvironment(
        () => {
          before = $createTextNode("before ");
          note = $createTrailingNote();
          para = $createParaNode("p");
          $getRoot().append(para.append(before, note));
        },
        <>
          <ArrowNavigationPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
          <TrailingNoteCaretGuardPlugin />
        </>,
      );
      const beforeEnd = editor.getEditorState().read(() => before.getTextContentSize());
      return { editor, para: para!, before: before!, beforeEnd, note: note! };
    }

    it("gives the forward press past the note a text position to land in", async () => {
      const { editor, para, before, beforeEnd, note } = await arrowEnvironment();
      updateSelection(editor, before, beforeEnd);

      await pressKey(editor, "ArrowRight");
      await dispatchSelectionChange(editor);

      editor.getEditorState().read(() => {
        const host = para.getLastChild();
        if (!$isTextNode(host)) throw new Error("expected a text host past the note");
        expect(host.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        // A text point, in the paragraph — not an element point, and not inside the note.
        expect(selection.anchor.type).toBe("text");
        expect(selection.anchor.key).toBe(host.getKey());
        expect(note.getTextContent()).not.toContain(CURSOR_PLACEHOLDER_CHAR);
      });
    });

    it("takes the host away again on the backward press that leaves it", async () => {
      const { editor, para, before, beforeEnd } = await arrowEnvironment();
      updateSelection(editor, before, beforeEnd);
      await pressKey(editor, "ArrowRight");
      await dispatchSelectionChange(editor);
      expect(hasCaretHost(editor, para)).toBe(true);

      // The press itself lands at the end of the text before the note; where a backward press goes
      // is ArrowNavigationPlugin's business and is pinned there. What matters here is that the host
      // does not linger once the caret is no longer in it.
      await pressKey(editor, "ArrowLeft");
      await dispatchSelectionChange(editor);

      expect(hasCaretHost(editor, para)).toBe(false);
      expect(paraChildCount(editor, para)).toBe(2);
    });
  });

  // Both caret-host guards run in the app, over the same document, on the same command. They share
  // one lifecycle but track their own host by node key, so the risk is a host outliving the caret
  // because the other guard's insert moved it. At most one host may exist at a time.
  describe("with the empty-verse guard also mounted", () => {
    async function bothGuardsEnvironment() {
      let versePara: ParaNode;
      let notePara: ParaNode;
      const { editor } = await baseTestEnvironment(
        () => {
          versePara = $createParaNode("p");
          notePara = $createParaNode("p");
          $getRoot().append(
            versePara.append(
              $createImmutableVerseNode("1"),
              $createImmutableVerseNode("2"),
              $createTextNode("two"),
            ),
            notePara.append($createTextNode("before "), $createTrailingNote()),
          );
        },
        <>
          <EmptyVerseCaretGuardPlugin />
          <TrailingNoteCaretGuardPlugin />
        </>,
      );
      return { editor, versePara: versePara!, notePara: notePara! };
    }

    /** Every placeholder-bearing text node in the whole document. */
    function countHosts(editor: LexicalEditor): number {
      return editor.getEditorState().read(
        () =>
          $getRoot()
            .getAllTextNodes()
            .filter((node) => node.getTextContent().includes(CURSOR_PLACEHOLDER_CHAR)).length,
      );
    }

    it("hands the host over when the caret moves from an emptied verse to past a trailing note", async () => {
      const { editor, versePara, notePara } = await bothGuardsEnvironment();

      // Verse 1 has no text of its own: the boundary after its marker is the empty-verse case.
      await act(async () => {
        editor.update(() => {
          versePara.select(1, 1);
        });
      });
      await dispatchSelectionChange(editor);
      expect(countHosts(editor)).toBe(1);
      expect(hasCaretHost(editor, versePara)).toBe(true);

      await restCaretPastNote(editor, notePara);

      expect(countHosts(editor)).toBe(1);
      expect(hasCaretHost(editor, notePara)).toBe(true);
      expect(hasCaretHost(editor, versePara)).toBe(false);
    });

    it("hands it back the other way", async () => {
      const { editor, versePara, notePara } = await bothGuardsEnvironment();
      await restCaretPastNote(editor, notePara);
      expect(hasCaretHost(editor, notePara)).toBe(true);

      await act(async () => {
        editor.update(() => {
          versePara.select(1, 1);
        });
      });
      await dispatchSelectionChange(editor);

      expect(countHosts(editor)).toBe(1);
      expect(hasCaretHost(editor, versePara)).toBe(true);
      expect(hasCaretHost(editor, notePara)).toBe(false);
    });
  });

  it("leaves the host alone while the caret is still in it", async () => {
    // Convergence: the plugin runs on every selection change, so a repeat must not stack hosts.
    let para: ParaNode;
    const { editor } = await baseTestEnvironment(
      () => {
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), $createTrailingNote()));
      },
      <TrailingNoteCaretGuardPlugin />,
    );

    await restCaretPastNote(editor, para!);
    await dispatchSelectionChange(editor);
    await dispatchSelectionChange(editor);

    expect(paraChildCount(editor, para!)).toBe(3);
  });
});
