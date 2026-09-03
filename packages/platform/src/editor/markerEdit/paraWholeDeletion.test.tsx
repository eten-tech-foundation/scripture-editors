/**
 * Whole-paragraph deletion semantics for editable marker mode.
 *
 * Deleting a paragraph's ENTIRE visible representation — glyph, separator, and content, e.g. a
 * selection across all of `\p stuff` — must remove the paragraph itself: displayed bytes are the
 * document, so deleting every byte of a construct deletes the construct (the same rule the
 * display-run registry states as deletionPolicy "remove-owner" for milestones and optbreaks).
 * Without that, the paragraph survives as an invisible empty line whose `marker` state still
 * serializes a `\p` to the file — an edit the editor accepted and then silently discarded.
 *
 * The other half is the guard this must NOT break: `$paraMarkerDeletionTransform` deliberately
 * leaves an EMPTY paragraph alone, because mid-edit emptiness is usually transient — a rebuild
 * empties a paragraph before refilling it, and reaping it mid-pass would destroy the paragraph
 * out from under the code that is about to repopulate it. The two behaviors are distinguished by
 * PROVENANCE (who emptied it), never by the emptiness itself: only a user deletion whose
 * selection covered the paragraph's whole visible representation reaps it.
 */
import {
  $appendVersePara,
  requireDefined,
  testEnvironment,
  testEnvironmentWithDisplaySyncs,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_NORMAL,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  LexicalEditor,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $isMarkerNode,
  $isParaNode,
  NBSP,
  ParaNode,
  VerseNode,
} from "shared";

/** Appends `\p one` and `\q1 two` paragraphs with their editable `[glyph, separator]` prefixes. */
function $appendTwoParas(): { first: ParaNode; second: ParaNode } {
  const first = $createParaNode("p");
  const second = $createParaNode("q1");
  $getRoot().append(
    first.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("one")),
    second.append($createMarkerNode("q1"), $createTextNode(NBSP), $createTextNode("two")),
  );
  return { first, second };
}

/** The paragraph markers present in `usj`'s top-level content, in order. */
function paraMarkersOf(usj: Usj | undefined): (string | undefined)[] {
  return (usj?.content ?? [])
    .filter((entry): entry is MarkerObject => typeof entry !== "string" && entry.type === "para")
    .map((entry) => entry.marker);
}

/** The editor's current USJ, through the production adaptor. */
function usjOf(editor: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
}

/**
 * Selects from the very start of `para` (offset 0 of its glyph text — the shape a shift-extend
 * or drag that took the visible marker produces) to the end of `para`'s last text, then presses
 * `key` through the full KEY_DOWN pipeline (Lexical routes it to its own delete handling).
 */
async function selectWholeParaAndPress(
  editor: LexicalEditor,
  para: ParaNode,
  key: "Backspace" | "Delete",
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const glyph = para.getFirstChild();
      if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
      const last = para.getLastChild();
      const selection = $createRangeSelection();
      selection.anchor.set(glyph.getKey(), 0, "text");
      if (last === null) throw new Error("expected paragraph content");
      selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
      $setSelection(selection);
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    }),
  );
}

describe("transient emptiness (the guard this work must not break)", () => {
  it("leaves a programmatically emptied paragraph in place", async () => {
    // No user delete gesture: an update that empties a paragraph (the shape a rebuild pass or
    // any non-user code path produces mid-edit) must NOT reap it — the pass that emptied it is
    // expected to repopulate it, and reaping would destroy the paragraph out from under it.
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });
    await act(async () =>
      editor.update(() => {
        second.getChildren().forEach((child) => child.remove());
      }),
    );
    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(true);
      expect(second.getMarker()).toBe("q1");
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
    });
  });

  it("keeps a paragraph that is emptied and refilled in one update", async () => {
    // The refill half of the same transient shape: empty + rebuild the canonical children inside
    // ONE update. The transform pass at the end of the update must see a healthy paragraph.
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });
    await act(async () =>
      editor.update(() => {
        second.getChildren().forEach((child) => child.remove());
        second.append($createMarkerNode("q1"), $createTextNode(NBSP), $createTextNode("rebuilt"));
      }),
    );
    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(true);
      expect(second.getMarker()).toBe("q1");
      expect(second.getTextContent()).toContain("rebuilt");
    });
  });
});

describe("backspacing a fresh paragraph's prefix away (collapsed-caret provenance)", () => {
  /** `\p one` plus a fresh empty `\p ` line below it — the Enter-Enter landing shape. */
  function $appendContentAndFreshParas(): { first: ParaNode; fresh: ParaNode } {
    const first = $createParaNode("p");
    const fresh = $createParaNode("p");
    $getRoot().append(
      first.append($createMarkerNode("p"), $createTextNode(NBSP), $createTextNode("one")),
      fresh.append($createMarkerNode("p"), $createTextNode(NBSP)),
    );
    return { first, fresh };
  }

  it("reaps the paragraph the user backspaced empty, caret at the previous line's end", async () => {
    // Enter Enter leaves a fresh `\p ` line; backspacing through separator and glyph until the
    // line is EMPTY is the byte-by-byte completion of the same whole-representation deletion
    // the selection arm records up front — the last displayed byte went with the last
    // Backspace, so the paragraph goes with its bytes. jsdom cannot drive element-point
    // backspaces through the native Selection.modify, so the gesture's deletions are simulated
    // directly inside the commit, with the arming KEY_DOWN dispatched exactly as the real
    // gesture would: a collapsed caret inside the paragraph when Backspace goes down.
    let first!: ParaNode, fresh!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ first, fresh } = $appendContentAndFreshParas());
    });

    // Lexical's own collapsed-backspace handling routes through the native Selection.modify,
    // which jsdom does not implement — so claim KEY_DOWN below the engine's HIGH-priority
    // arming handler and simulate the gesture's deletions directly instead (the same
    // state-level convention the whole-selection tests use for the delete half).
    const unblock = editor.registerCommand(KEY_DOWN_COMMAND, () => true, COMMAND_PRIORITY_NORMAL);
    await act(async () =>
      editor.update(() => {
        const separator = fresh.getLastChild();
        if (separator === null) throw new Error("expected the fresh paragraph's separator");
        const selection = $createRangeSelection();
        selection.anchor.set(separator.getKey(), 1, "text");
        selection.focus.set(separator.getKey(), 1, "text");
        $setSelection(selection);
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
        // The rest of the backspace chain, simulated: prefix nodes removed to empty.
        fresh.getChildren().forEach((child) => child.remove());
      }),
    );
    unblock();

    editor.getEditorState().read(() => {
      expect(fresh.isAttached()).toBe(false);
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      expect(paras[0].getKey()).toBe(first.getKey());
      // The caret returns to where it was before the Enters: the END of the previous line.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after dissolve");
      expect(selection.isCollapsed()).toBe(true);
      const { anchor } = selection;
      const atParaEnd =
        anchor.type === "element"
          ? anchor.key === first.getKey() && anchor.offset === first.getChildrenSize()
          : anchor.getNode().is(first.getLastChild()) &&
            anchor.offset === (first.getLastChild()?.getTextContentSize() ?? -1);
      expect(atParaEnd).toBe(true);
    });
    // The dissolved paragraph's marker must not survive to the file.
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("leaves the same emptying alone when no delete key armed it (caret merely inside)", async () => {
    // The twin guard, born green and staying green: identical emptying with the collapsed
    // caret in the paragraph but NO Backspace/Delete KEY_DOWN — the shape a rebuild pass
    // transiently emptying the caret's paragraph produces. The transient-emptiness contract
    // (the describe above) must keep winning: emptiness plus caret proximity is not
    // provenance, only the delete-key gesture is.
    let fresh!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ fresh } = $appendContentAndFreshParas());
    });

    await act(async () =>
      editor.update(() => {
        const separator = fresh.getLastChild();
        if (separator === null) throw new Error("expected the fresh paragraph's separator");
        const selection = $createRangeSelection();
        selection.anchor.set(separator.getKey(), 1, "text");
        selection.focus.set(separator.getKey(), 1, "text");
        $setSelection(selection);
        fresh.getChildren().forEach((child) => child.remove());
      }),
    );

    editor.getEditorState().read(() => {
      expect(fresh.isAttached()).toBe(true);
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
    });
  });
});

describe("backspacing an Enter-Enter split back together (content bytes survive the merges)", () => {
  /**
   * One collapsed Backspace press: dispatch the arming KEY_DOWN, then mirror Lexical's own
   * collapsed-backspace semantics for the shapes this gesture produces — jsdom cannot drive
   * Lexical's native Selection.modify path, so the deletion half is simulated at state level,
   * exactly like the other delete-half simulations in this file. Shapes covered: a token
   * previous sibling deletes whole; a normal text previous sibling (or the caret's own node)
   * loses one character, removing the node when it empties.
   */
  function $simulateCollapsedBackspaceDeletion(): void {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) || !selection.isCollapsed())
      throw new Error("expected a collapsed caret");
    const { anchor } = selection;
    const node = anchor.getNode();
    const deleteLastCharOf = (target: import("lexical").TextNode): void => {
      const text = target.getTextContent();
      target.setTextContent(text.slice(0, -1));
      if (target.getTextContent() === "") target.remove();
      else target.select(text.length - 1, text.length - 1);
    };
    if (anchor.type === "text" && $isTextNode(node)) {
      if (anchor.offset === 0) {
        const previous = node.getPreviousSibling();
        if (!$isTextNode(previous)) throw new Error("unsupported backspace shape (previous)");
        if (previous.getMode() === "token") previous.remove();
        else deleteLastCharOf(previous);
        return;
      }
      if (anchor.offset === node.getTextContentSize() && node.getTextContentSize() === 1) {
        deleteLastCharOf(node);
        return;
      }
      const text = node.getTextContent();
      node.setTextContent(text.slice(0, anchor.offset - 1) + text.slice(anchor.offset));
      node.select(anchor.offset - 1, anchor.offset - 1);
      return;
    }
    if (anchor.type === "element" && $isElementNode(node)) {
      const child = node.getChildAtIndex(anchor.offset - 1);
      if (!$isTextNode(child)) throw new Error("unsupported backspace shape (element point)");
      if (child.getMode() === "token") child.remove();
      else deleteLastCharOf(child);
      return;
    }
    throw new Error("unsupported selection shape");
  }

  async function pressBackspace(editor: LexicalEditor): Promise<void> {
    await act(async () =>
      editor.update(() => {
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
        $simulateCollapsedBackspaceDeletion();
      }),
    );
    // Flush the deferred caret-departure resolve between presses, as real typing cadence would.
    await act(async () => Promise.resolve());
  }

  /**
   * Asserts the collapsed caret sits right BEFORE the preserved space (the junction). The
   * boundary can be hosted by either flanking text node — Lexical normalizes a text point at
   * offset 0 onto the previous sibling's end — so both the byte after and the bytes before the
   * caret are resolved across the node boundary.
   */
  function $expectCaretAtJunction(): void {
    const selection = $getSelection();
    if (!$isRangeSelection(selection)) throw new Error("no range selection");
    expect(selection.isCollapsed()).toBe(true);
    const { anchor } = selection;
    const anchorNode = anchor.getNode();
    if (!$isTextNode(anchorNode)) throw new Error("caret is not on text");
    const text = anchorNode.getTextContent();
    // The byte AFTER the caret is the preserved space...
    const after =
      anchor.offset < text.length
        ? text.charAt(anchor.offset)
        : (anchorNode.getNextSibling()?.getTextContent().charAt(0) ?? "");
    expect(after).toBe(" ");
    // ...and the bytes before it (in this node or the previous sibling) are the prose "asdf" or
    // the prefix separator it merged against — never the marker glyph or the paragraph end.
    const before =
      anchor.offset > 0
        ? text.slice(0, anchor.offset)
        : (anchorNode.getPreviousSibling()?.getTextContent() ?? "");
    expect(before.endsWith("asdf") || before.endsWith(NBSP)).toBe(true);
  }

  it("preserves the space and the junction caret through the whole backspace chain", async () => {
    // TJ's repro: `\p asdf| \nd asdf\nd*` -> Enter, Enter (a fresh `\p ` line between the halves)
    // -> backspace the injected representation away again. Expected: the document returns
    // byte-exactly to its pre-Enter state — in particular the space BEFORE `\nd` (real content)
    // survives — with the caret at the junction after "asdf". Today the first backspace's heal
    // absorbs that space into the engine's prefix separator, the later merge drops it as
    // "orphaned", and the caret is flung to the merged paragraph's end.
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("asdf "),
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}asdf`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });
    const before = usjOf(editor);

    // Enter twice with the caret after "asdf" (before the space), through the real pipeline.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "asdf ");
        if (!body) throw new Error("body text not found");
        body.select(4, 4);
        editor.dispatchCommand(KEY_ENTER_COMMAND, null);
      }),
    );
    await act(async () => editor.update(() => editor.dispatchCommand(KEY_ENTER_COMMAND, null)));
    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(3);
    });

    const unblock = editor.registerCommand(KEY_DOWN_COMMAND, () => true, COMMAND_PRIORITY_NORMAL);
    // Three presses delete the third paragraph's injected `\p ` representation byte by byte;
    // its content then merges into the fresh middle paragraph.
    for (let press = 0; press < 3; press++) await pressBackspace(editor);
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(2);
      // The space is CONTENT and survives the merge; the caret rests at the junction before it.
      expect(paras[1].getTextContent()).toContain(" \\nd");
      $expectCaretAtJunction();
    });

    // Three more presses delete the fresh paragraph's own `\p ` representation; everything
    // merges back into the original paragraph.
    for (let press = 0; press < 3; press++) await pressBackspace(editor);
    unblock();

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
      $expectCaretAtJunction();
    });
    // Byte-exact round trip: the serialized document equals its pre-Enter self, space included.
    expect(usjOf(editor)).toEqual(before);
  });

  it("lands an ORPHANED caret at the junction, not past the moved content", async () => {
    // A backspace chain can leave the collapsed caret as an ELEMENT point on the dissolving
    // paragraph itself (deleting the last prefix glyph byte destroys the caret's node; real
    // browsers relocate to the paragraph). The merge must place that caret at the JUNCTION —
    // the boundary before the first moved child — not let removal fling it past the content.
    // The moved content here is a char span with no leading text, so nothing hosts a text
    // point and the orphan handling is what decides the outcome.
    let first!: ParaNode, second!: ParaNode;
    const { editor } = await testEnvironmentWithDisplaySyncs(() => {
      first = $createParaNode("p");
      second = $createParaNode("p");
      $getRoot().append(
        first.append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("one"),
        ),
        second.append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}asdf`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
      );
    });

    const unblock = editor.registerCommand(KEY_DOWN_COMMAND, () => true, COMMAND_PRIORITY_NORMAL);
    await act(async () =>
      editor.update(() => {
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
        // The tail of the backspace chain, simulated: the prefix is gone and the caret was
        // left as an element point on the paragraph (its text node hosts are destroyed).
        second
          .getChildren()
          .slice(0, 2)
          .forEach((child) => child.remove());
        const selection = $createRangeSelection();
        selection.anchor.set(second.getKey(), 0, "element");
        selection.focus.set(second.getKey(), 0, "element");
        $setSelection(selection);
      }),
    );
    unblock();

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false); // merged into the previous paragraph
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after merge");
      expect(selection.isCollapsed()).toBe(true);
      const { anchor } = selection;
      // The junction: the boundary BEFORE the moved char span — the caret must not end up
      // past it (typing continues where the deleted representation was).
      expect(anchor.type).toBe("element");
      expect(anchor.key).toBe(first.getKey());
      const char = first.getChildren().findIndex((child) => !$isTextNode(child));
      expect(anchor.offset).toBe(char);
    });
  });
});

describe("user deletes a paragraph's entire visible representation", () => {
  it("removes the paragraph, and no marker survives to the serialized output (Backspace)", async () => {
    let first!: ParaNode, second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ first, second } = $appendTwoParas());
    });

    await selectWholeParaAndPress(editor, second, "Backspace");

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      expect(paras[0].getKey()).toBe(first.getKey());
      expect(first.getTextContent()).toContain("one");
      // The caret lands at the END of the previous line — the deleted line's whole
      // representation is gone, so the nearest surviving position is where typing continues.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after delete");
      expect(selection.isCollapsed()).toBe(true);
      const { anchor } = selection;
      const atParaEnd =
        anchor.type === "element"
          ? anchor.key === first.getKey() && anchor.offset === first.getChildrenSize()
          : anchor.getNode().is(first.getLastChild()) &&
            anchor.offset === (first.getLastChild()?.getTextContentSize() ?? -1);
      expect(atParaEnd).toBe(true);
    });
    // The deleted paragraph's marker must not reappear in the file.
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("removes the paragraph on forward Delete too", async () => {
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });

    await selectWholeParaAndPress(editor, second, "Delete");

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("removes a fully covered paragraph whose content includes an atom (a verse)", async () => {
    // The end edge of the selection is the paragraph's element end (the last child is plain
    // text here, but the para also holds a VerseNode atom mid-content) — full coverage must be
    // judged by position, not by "all children are text".
    let versePara!: ParaNode, verse!: VerseNode;
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("intro"),
        ),
      );
      ({ verse } = $appendVersePara());
      versePara = requireDefined(
        verse.getParent<ParaNode>() ?? undefined,
        "verse paragraph missing",
      );
    });

    await selectWholeParaAndPress(editor, versePara, "Backspace");

    editor.getEditorState().read(() => {
      expect(versePara.isAttached()).toBe(false);
      expect(verse.isAttached()).toBe(false);
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("keeps ONE paragraph when the deletion covered every paragraph (select-all shape)", async () => {
    // The document cannot be left with no paragraph at all: the survivor resets to the default
    // marker with its visible prefix, ready to type into — the same fallback the marker-deleted
    // branch uses when there is no previous paragraph to merge into.
    let first!: ParaNode, second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ first, second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const glyph = first.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected the first paragraph's glyph");
        const last = second.getLastChild();
        if (last === null) throw new Error("expected second paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(glyph.getKey(), 0, "text");
        selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
        $setSelection(selection);
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
      }),
    );

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      // The survivor is visibly a default paragraph again — not an invisible husk.
      expect(paras[0].getMarker()).toBe("p");
      expect($isMarkerNode(paras[0].getFirstChild())).toBe(true);
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("still merges (not removes) when the selection left the marker glyph intact", async () => {
    // Content-only coverage: the selection starts AFTER the glyph+separator, so deleting it
    // deletes content, not the paragraph — the paragraph survives with its prefix, empty.
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const content = second.getLastChild();
        if (content === null) throw new Error("expected paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(content.getKey(), 0, "text");
        selection.focus.set(content.getKey(), content.getTextContentSize(), "text");
        $setSelection(selection);
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(true);
      expect(second.getMarker()).toBe("q1");
      expect($isMarkerNode(second.getFirstChild())).toBe(true);
      expect(second.getTextContent()).not.toContain("two");
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p", "q1"]);
  });

  it("removes the paragraph when it is CUT whole (same whole-representation deletion)", async () => {
    // jsdom implements no ClipboardEvent; the standard-view cut handler duck-types
    // `clipboardData` off the payload, so a plain object exercises the same path a real
    // browser event takes.
    const written = new Map<string, string>();
    const cutEvent = {
      clipboardData: {
        setData: (type: string, value: string) => void written.set(type, value),
        getData: () => "",
        types: [],
        files: [],
      },
      preventDefault: () => undefined,
    } as unknown as ClipboardEvent;

    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const glyph = second.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
        const last = second.getLastChild();
        if (last === null) throw new Error("expected paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(glyph.getKey(), 0, "text");
        selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
        $setSelection(selection);
        editor.dispatchCommand(CUT_COMMAND, cutEvent);
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1);
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
    expect(written.get("text/plain")).toContain("two"); // the cut content reached the clipboard
  });

  it("lands the caret at the JUNCTION when deleting only the visible prefix merges the para", async () => {
    // Select just the `\q1 ` prefix — glyph start through content start — and delete. The
    // marker-deleted branch merges the paragraph's content into the previous paragraph; the
    // caret must come to rest at the junction (the start of the moved content), not be flung
    // to the merged paragraph's end.
    let first!: ParaNode, second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ first, second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const glyph = second.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
        const content = second.getLastChild();
        if (content === null) throw new Error("expected paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(glyph.getKey(), 0, "text");
        selection.focus.set(content.getKey(), 0, "text");
        $setSelection(selection);
        editor.dispatchCommand(
          KEY_DOWN_COMMAND,
          new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true }),
        );
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false); // merged into the previous paragraph
      expect(first.getTextContent()).toContain("one");
      expect(first.getTextContent()).toContain("two");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after merge");
      expect(selection.isCollapsed()).toBe(true);
      const { anchor } = selection;
      const anchorNode = anchor.getNode();
      // The junction: offset 0 of the moved content ("two"), inside the surviving paragraph.
      expect(anchorNode.getParent()?.getKey()).toBe(first.getKey());
      expect(anchor.type).toBe("text");
      const text = anchorNode.getTextContent();
      expect(text.slice(anchor.offset)).toContain("two");
      expect(text.slice(anchor.offset)).not.toContain("one");
    });
  });

  it("typing over a whole selected line replaces it: the character becomes previous-line content", async () => {
    // Typing over a selection IS delete-the-selection-then-type. Covering all of `\q1 two` and
    // typing `x` therefore removes the line's marker with the rest, so `x` has no paragraph of
    // its own — it lands as plain content at the end of the previous line (`\p onex`). Without
    // this, Lexical re-used the emptied marker-glyph node for the typed text and the engine
    // read the replacement as a marker rename in progress.
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const glyph = second.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
        const last = second.getLastChild();
        if (last === null) throw new Error("expected paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(glyph.getKey(), 0, "text");
        selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
        $setSelection(selection);
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(false);
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras).toHaveLength(1);
      const text = paras[0].getTextContent();
      expect(text).toContain("one");
      expect(text).toContain("x");
      expect(text.indexOf("one")).toBeLessThan(text.indexOf("x"));
      // No node still carries the deleted line's marker.
      expect(
        paras[0]
          .getChildren()
          .filter($isMarkerNode)
          .map((glyphNode) => glyphNode.getMarker()),
      ).toEqual(["p"]);
      // The caret sits right after the typed character, ready to keep typing.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after typing");
      expect(selection.isCollapsed()).toBe(true);
      const anchorNode = selection.anchor.getNode();
      expect(
        $isTextNode(anchorNode)
          ? anchorNode.getTextContent().charAt(selection.anchor.offset - 1)
          : undefined,
      ).toBe("x");
    });
    expect(paraMarkersOf(usjOf(editor))).toEqual(["p"]);
  });

  it("typing over a selection that spared the backslash joins the character to it", async () => {
    // Selecting `q1 two` — everything but the marker's backslash — and typing `x` deletes the
    // selection and adds the character: the surviving `\` and the typed `x` make the bytes
    // `\p one` + `\x`, a mid-edit marker literal for the resolution machinery to settle later.
    // This pins only the delete-then-type byte outcome and the caret, not the settle.
    let second!: ParaNode;
    const { editor } = await testEnvironment(() => {
      ({ second } = $appendTwoParas());
    });

    await act(async () =>
      editor.update(() => {
        const glyph = second.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected the paragraph's marker glyph");
        const last = second.getLastChild();
        if (last === null) throw new Error("expected paragraph content");
        const selection = $createRangeSelection();
        selection.anchor.set(glyph.getKey(), 1, "text"); // after the `\`
        selection.focus.set(last.getKey(), last.getTextContentSize(), "text");
        $setSelection(selection);
        editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "x");
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(true);
      const glyph = second.getFirstChild();
      expect($isMarkerNode(glyph) ? glyph.getTextContent() : undefined).toBe("\\x");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no range selection after typing");
      expect(selection.isCollapsed()).toBe(true);
      expect(
        selection.anchor
          .getNode()
          .getTextContent()
          .charAt(selection.anchor.offset - 1),
      ).toBe("x");
    });
  });
});
