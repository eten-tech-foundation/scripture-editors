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
  $createRangeSelectionFromDom,
  $createTextNode,
  $getRoot,
  $getSelection,
  $hasAncestor,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  BLUR_COMMAND,
  LexicalEditor,
  LexicalNode,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import {
  $isNoteNode,
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createNoteNode,
  $createParaNode,
  CURSOR_PLACEHOLDER_CHAR,
  NoteNode,
  ParaNode,
} from "shared";
import { ReactNode } from "react";

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

/**
 * The rendered DOM of the one paragraph, its note, and its note caller.
 *
 * These are the elements a hit test has to choose between when the user clicks in the whitespace
 * past a collapsed note at the end of a line.
 */
function noteParagraphDom(editor: LexicalEditor): {
  paraDom: Element;
  noteDom: Element;
  callerDom: Element;
} {
  const root = editor.getRootElement();
  const paraDom = root?.firstElementChild;
  const noteDom = paraDom?.querySelector(".note");
  const callerDom = noteDom?.querySelector(".immutable-note-caller");
  if (!paraDom || !noteDom || !callerDom) throw new Error("the note paragraph did not render");
  return { paraDom, noteDom, callerDom };
}

/**
 * Bring the caret in the way a click does — from a DOM position — rather than by naming tree
 * nodes: build the DOM range, let Lexical resolve it with the same entry point its own
 * selectionchange handler uses, then fire the selection-change command the browser fires after it.
 *
 * jsdom has neither layout nor hit testing, so WHICH DOM position a click at given coordinates
 * produces cannot be measured here and is not claimed. What these tests do supply is every position
 * the collapsed note's rendered DOM makes available to a hit test, so what Lexical resolves each one
 * to — and what the guard then does about it — is measured rather than assumed.
 */
function putDomCaret(container: Node, offset: number): Selection {
  const domSelection = document.getSelection();
  if (!domSelection) throw new Error("no DOM selection");
  const range = document.createRange();
  range.setStart(container, offset);
  range.collapse(true);
  domSelection.removeAllRanges();
  domSelection.addRange(range);
  return domSelection;
}

async function resolveDomPosition(
  editor: LexicalEditor,
  container: Node,
  offset: number,
): Promise<void> {
  await act(async () => {
    const domSelection = putDomCaret(container, offset);
    editor.update(() => {
      $setSelection($createRangeSelectionFromDom(domSelection, editor));
    });
  });
  await dispatchSelectionChange(editor);
}

/**
 * A browser writes the repaired selection back out to the DOM once the update commits, so the
 * position fed in stops being what the DOM says. jsdom does no such reconciliation unless the root
 * has focus, and focusing it makes every commit throw on `Range.getBoundingClientRect`, which jsdom
 * does not implement. Dropping the DOM range is the faithful stand-in: it leaves the editor state
 * authoritative for whatever the test does next, exactly as reconciliation would.
 */
function releaseDomSelection(): void {
  document.getSelection()?.removeAllRanges();
}

/** {@link resolveDomPosition}, then hand the editor state back the way a browser would. */
async function caretFromDomPosition(
  editor: LexicalEditor,
  container: Node,
  offset: number,
): Promise<void> {
  await resolveDomPosition(editor, container, offset);
  releaseDomSelection();
}

/**
 * A whole click: the DOM position the browser resolved it to, then the click event itself, which
 * Lexical's own root listener turns into `CLICK_COMMAND`. Dispatching a real event rather than the
 * command directly is what gives the handler a `target` to read the DOM selection from.
 */
async function clickAtDomPosition(
  editor: LexicalEditor,
  target: Element,
  container: Node,
  offset: number,
): Promise<void> {
  await resolveDomPosition(editor, container, offset);
  await act(async () => {
    // The DOM selection at click time is the click's own landing. Re-stating it matters because a
    // commit in between rewrites the DOM selection from the editor state, which in jsdom can leave
    // it somewhere the click never was.
    putDomCaret(container, offset);
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  releaseDomSelection();
}

/**
 * The whole sequence a click into an editor that does NOT yet have focus produces, in the order a
 * browser produces it. Measured in Chromium against the rendered standard view, because jsdom has
 * no layout and no hit testing and can supply none of it on its own:
 *
 * 1. focus reaches the editor;
 * 2. the browser's hit test writes its landing into the DOM selection — and for the blank stretch
 *    at the end of a line that a collapsed note ends, that landing is the note's caller, at every
 *    distance from the text measured;
 * 3. Lexical resolves that DOM position to no point at all, so the editor-state selection becomes
 *    `null`, and `SELECTION_CHANGE_COMMAND` is dispatched inside that same update;
 * 4. committing a null selection over a selection the editor already had makes Lexical's reconciler
 *    call `removeAllRanges()`, after which the browser reports the caret at the start of the
 *    editable instead;
 * 5. only then does `click` fire.
 *
 * Step 4 is the whole difficulty: by the time the click arrives, neither the caret nor the DOM
 * selection says anything about where the click came down. Step 3 is the last moment that does.
 *
 * What is supplied here is that ORDER and those POSITIONS; which position a real click at given
 * coordinates produces is the browser's answer, quoted above, not this test's.
 */
async function clickIntoUnfocusedEditor(
  editor: LexicalEditor,
  target: Element,
  container: Node,
  offset: number,
): Promise<void> {
  const hadCaret = editor.getEditorState().read(() => $getSelection() !== null);
  await act(async () => {
    const domSelection = putDomCaret(container, offset);
    editor.update(() => {
      $setSelection($createRangeSelectionFromDom(domSelection, editor));
      editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    });
  });

  const stillUnresolved = editor.getEditorState().read(() => $getSelection() === null);
  const rootElement = editor.getRootElement();
  if (hadCaret && stillUnresolved && rootElement) {
    // Step 4. The reconciler only clears the DOM range when the editor had a selection to lose, so
    // a first-ever click into a never-used editor keeps the landing the hit test gave it.
    putDomCaret(rootElement, 0);
  } else if (!stillUnresolved) {
    // A repaired selection is written back out to the DOM by a browser; jsdom does no such
    // reconciliation, and releasing the range is the faithful stand-in. See `releaseDomSelection`.
    releaseDomSelection();
  }

  await act(async () => {
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  releaseDomSelection();
}

/** Every placeholder-bearing text node in the document, wherever it sits. */
function allHosts(editor: LexicalEditor): TextNode[] {
  return editor.getEditorState().read(() =>
    $getRoot()
      .getAllTextNodes()
      .filter((node) => node.getTextContent().includes(CURSOR_PLACEHOLDER_CHAR)),
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

  // The caret arriving from a DOM position is the click's route, and it is the one the guard used to
  // miss entirely: the report was that clicking past a footnote at a paragraph's end does nothing at
  // all while the arrow keys reach the same position fine. jsdom has no hit testing, so no click is
  // performed here; what is supplied instead is each DOM position a hit test could resolve to, which
  // is the input the browser hands Lexical. See `caretFromDomPosition`.
  describe("a caret arriving from a DOM position, the way a click's does", () => {
    async function noteParagraphEnvironment(children?: ReactNode) {
      let para: ParaNode;
      let note: NoteNode;
      const { editor } = await baseTestEnvironment(() => {
        note = $createTrailingNote();
        para = $createParaNode("p");
        $getRoot().append(para.append($createTextNode("before "), note));
      }, children);
      return { editor, para: para!, note: note! };
    }

    /** Whether `key`'s node is the note itself or sits inside it. */
    function $isAtOrInsideNote(node: LexicalNode, note: NoteNode): boolean {
      return note.is(node) || $hasAncestor(node, note);
    }

    it("resolves every position past the caller to somewhere INSIDE the note", async () => {
      // No guard mounted: this is the raw resolution, and it is why a rule keyed on the element
      // point past the note never fired for a click. Lexical descends the paragraph's own end into
      // its last child — the note's hidden closing glyph — so not one DOM position at the end of
      // that line resolves to the boundary the arrow keys land on.
      const { editor, note } = await noteParagraphEnvironment();
      const { paraDom, noteDom } = noteParagraphDom(editor);

      for (const [label, container, offset] of [
        ["the paragraph's own end", paraDom, paraDom.childNodes.length],
        ["just past the note's caller", noteDom, 2],
        ["the note span's own end", noteDom, noteDom.childNodes.length],
      ] as const) {
        await caretFromDomPosition(editor, container, offset);
        editor.getEditorState().read(() => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) throw new Error(`no selection from ${label}`);
          expect({ label, inside: $isAtOrInsideNote(selection.anchor.getNode(), note) }).toEqual({
            label,
            inside: true,
          });
        });
      }
    });

    it("resolves a position on the note's caller to no selection at all", async () => {
      // No guard mounted: the raw resolution again. The caller is a decorator, so Lexical resolves
      // no point inside it and the editor is left with no selection — the same measured behavior
      // the gutter-marker click guard documents. That is the landing a real hit test produces for
      // the blank stretch at the end of the line, and having no caret is what makes it a position
      // no rule about the caret's RESTING PLACE can read. With the guard mounted this same arrival
      // is repaired; the "a click that arrives with focus" tests pin that.
      const { editor } = await noteParagraphEnvironment();
      const { callerDom } = noteParagraphDom(editor);

      await caretFromDomPosition(editor, callerDom, 0);

      editor.getEditorState().read(() => {
        expect($getSelection()).toBe(null);
      });
    });

    it("repairs a click whose position resolved to no caret at all", async () => {
      const { editor, para, note } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
      );
      const { callerDom } = noteParagraphDom(editor);

      await clickAtDomPosition(editor, callerDom, callerDom, 0);

      editor.getEditorState().read(() => {
        const host = para.getLastChild();
        if (!$isTextNode(host)) throw new Error("expected a text host past the note");
        expect(host.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(host.getKey());
        expect(note.getTextContent()).not.toContain(CURSOR_PLACEHOLDER_CHAR);
      });
    });

    it("leaves a click that resolved to an ordinary caret alone", async () => {
      // The fallback answers only a click Lexical could make nothing of. A click in the text is a
      // caret like any other, and no position past a note is involved.
      const { editor, para } = await noteParagraphEnvironment(<TrailingNoteCaretGuardPlugin />);
      const { paraDom } = noteParagraphDom(editor);
      const beforeText = paraDom.firstChild?.firstChild;
      if (!beforeText) throw new Error("the text before the note did not render");

      await clickAtDomPosition(editor, paraDom, beforeText, 2);

      expect(allHosts(editor).length).toBe(0);
      expect(paraChildCount(editor, para)).toBe(2);
    });

    it.each([
      [
        "the paragraph's own end",
        (dom: ReturnType<typeof noteParagraphDom>) =>
          [dom.paraDom, dom.paraDom.childNodes.length] as const,
      ],
      [
        "just past the note's caller",
        (dom: ReturnType<typeof noteParagraphDom>) => [dom.noteDom, 2] as const,
      ],
      [
        "the note span's own end",
        (dom: ReturnType<typeof noteParagraphDom>) =>
          [dom.noteDom, dom.noteDom.childNodes.length] as const,
      ],
    ])("takes the caret out of the note and into a host, from %s", async (_label, positionOf) => {
      const { editor, para, note } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
      );
      const dom = noteParagraphDom(editor);
      const [container, offset] = positionOf(dom);

      await clickAtDomPosition(editor, dom.paraDom, container, offset);

      editor.getEditorState().read(() => {
        const host = para.getLastChild();
        if (!$isTextNode(host)) throw new Error("expected a text host past the note");
        expect(host.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(host.getKey());
        // Out of the hidden content, and nothing left behind in it.
        expect($isAtOrInsideNote(selection.anchor.getNode(), note)).toBe(false);
        expect(note.getTextContent()).not.toContain(CURSOR_PLACEHOLDER_CHAR);
      });
    });

    it("reuses a host already at the boundary rather than stacking a second", async () => {
      // A host can already be there when the click arrives — an earlier arrival left one, and the
      // caret has not moved far enough for the selection-change path to have taken it away yet.
      // Nothing renders past a bare host, so the rule still fires, and the repair has to land the
      // caret in the host that is there instead of adding another.
      let para: ParaNode;
      const { editor } = await baseTestEnvironment(
        () => {
          para = $createParaNode("p");
          $getRoot().append(
            para.append(
              $createTextNode("before "),
              $createTrailingNote(),
              $createTextNode(CURSOR_PLACEHOLDER_CHAR),
            ),
          );
        },
        <TrailingNoteCaretGuardPlugin />,
      );
      const dom = noteParagraphDom(editor);

      await clickAtDomPosition(editor, dom.paraDom, dom.noteDom, 2);

      expect(allHosts(editor).length).toBe(1);
      expect(paraChildCount(editor, para!)).toBe(3);
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(para.getLastChild()?.getKey());
      });
    });

    it("leaves a caret put inside the note by anything but a click alone", async () => {
      // The marker menu puts a caret inside a collapsed footnote on purpose, to insert a char
      // marker into it. Only the click is a bid for the end of the line; a caret that arrived any
      // other way is somebody's deliberate placement and is not second-guessed here.
      let noteText: TextNode;
      const { editor, para } = await noteParagraphEnvironment(<TrailingNoteCaretGuardPlugin />);
      await act(async () => {
        editor.update(() => {
          const note = para.getLastChild();
          if (!$isNoteNode(note)) throw new Error("expected a trailing note");
          const text = note.getAllTextNodes().at(-1);
          if (!$isTextNode(text)) throw new Error("expected text inside the note");
          noteText = text;
          text.select(1, 1);
        });
      });
      await dispatchSelectionChange(editor);

      expect(allHosts(editor).length).toBe(0);
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(noteText.getKey());
      });
    });

    it("lands typed text after the note rather than in its hidden body", async () => {
      const { editor, para, note } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
      );
      const { paraDom } = noteParagraphDom(editor);

      await clickAtDomPosition(editor, paraDom, paraDom, paraDom.childNodes.length);
      await act(async () => {
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("X");
        });
      });

      editor.getEditorState().read(() => {
        const last = para.getLastChild();
        expect($isTextNode(last) && last.getTextContent()).toBe("X");
        expect(note.getTextContent()).not.toContain("X");
      });
    });
  });

  // A click that also has to deliver focus. The reported symptom is that it takes two: the first
  // one leaves the caret somewhere other than where it was aimed. See `clickIntoUnfocusedEditor`
  // for the measured order of events, which is what makes this case different from a click into an
  // editor that already has focus.
  describe("a click that arrives with focus", () => {
    async function noteParagraphEnvironment(children?: ReactNode, textAfterNote?: string) {
      let para: ParaNode;
      let before: TextNode;
      let note: NoteNode;
      const { editor } = await baseTestEnvironment(() => {
        before = $createTextNode("before ");
        note = $createTrailingNote();
        para = $createParaNode("p");
        $getRoot().append(
          para.append(
            ...(textAfterNote === undefined
              ? [before, note]
              : [before, note, $createTextNode(textAfterNote)]),
          ),
        );
      }, children);
      return { editor, para: para!, before: before!, note: note! };
    }

    /** The caret the user left behind before clicking away — the ordinary starting state. */
    async function giveEditorACaret(editor: LexicalEditor, before: TextNode) {
      await act(async () => {
        editor.update(() => {
          before.select(1, 1);
        });
      });
      await dispatchSelectionChange(editor);
    }

    it("lands past the note on the FIRST click, from an editor that already had a caret", async () => {
      const { editor, para, before, note } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
      );
      await giveEditorACaret(editor, before);
      const { paraDom, callerDom } = noteParagraphDom(editor);

      await clickIntoUnfocusedEditor(editor, paraDom, callerDom, 0);

      editor.getEditorState().read(() => {
        const host = para.getLastChild();
        if (!$isTextNode(host)) throw new Error("expected a text host past the note");
        expect(host.getTextContent()).toBe(CURSOR_PLACEHOLDER_CHAR);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(host.getKey());
        expect(note.getTextContent()).not.toContain(CURSOR_PLACEHOLDER_CHAR);
      });
      expect(allHosts(editor).length).toBe(1);
    });

    it("lands past the note on the first click into an editor nobody had used yet", async () => {
      // No caret to lose, so Lexical never clears the DOM range and the click still knows its own
      // landing. Both routes have to end in the same place, or the fix would only work every other
      // time the user visits the editor.
      const { editor, para, note } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
      );
      const { paraDom, callerDom } = noteParagraphDom(editor);

      await clickIntoUnfocusedEditor(editor, paraDom, callerDom, 0);

      editor.getEditorState().read(() => {
        const host = para.getLastChild();
        if (!$isTextNode(host)) throw new Error("expected a text host past the note");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        expect(selection.anchor.key).toBe(host.getKey());
        expect(note.getTextContent()).not.toContain(CURSOR_PLACEHOLDER_CHAR);
      });
      expect(allHosts(editor).length).toBe(1);
    });

    it("leaves a note that something in its block renders past alone", async () => {
      // The rule is about the position at the END of a line, which is the only one with nothing to
      // render a caret in. A caller with text after it has a caret position either side already.
      const { editor, before } = await noteParagraphEnvironment(
        <TrailingNoteCaretGuardPlugin />,
        " after",
      );
      await giveEditorACaret(editor, before);
      const { paraDom, callerDom } = noteParagraphDom(editor);

      await clickIntoUnfocusedEditor(editor, paraDom, callerDom, 0);

      expect(allHosts(editor).length).toBe(0);
    });
  });
});
