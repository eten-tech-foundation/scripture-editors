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
  $isRangeSelection,
  $setSelection,
  CUT_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
} from "lexical";
import {
  $createMarkerNode,
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

  it("does not reap when a typed character replaces the selection instead of a delete key", async () => {
    // Typing over a whole-paragraph selection is a REPLACEMENT, not a whole-representation
    // delete: Lexical lands the typed text in the selection's anchor node — the marker glyph —
    // so the engine reads it as a marker rename in progress (Tier 1's territory), and the
    // paragraph must survive. The remove-owner path is delete keys only.
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
        const live = $getSelection();
        if (!$isRangeSelection(live)) throw new Error("no range selection");
        live.insertText("x");
      }),
    );

    editor.getEditorState().read(() => {
      expect(second.isAttached()).toBe(true); // a replacement is not a whole-representation delete
      expect(second.getTextContent()).toContain("x");
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
    });
  });
});
