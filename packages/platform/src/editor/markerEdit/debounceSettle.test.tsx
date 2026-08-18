/**
 * The SECOND settle clock: a Paratext-9-style idle debounce. The caret-departure clock (the
 * deferred microtask resolve in `MarkerEditPlugin`) never settles the node the caret is parked in
 * — its resolve passes `lastAnchorKey` as the except-key, and `$exceptKeysAround` widens that to
 * the caret's contiguous plain-text run. The debounce timer runs the SAME computation with
 * `undefined` as the except-key, which shields NOTHING (`$exceptKeysAround(undefined)` returns an
 * empty set), so once the user has been idle past `IDLE_SETTLE_DELAY_MS` even the caret-held pend
 * settles.
 *
 * Timer lifecycle, verified against `MarkerEditPlugin` rather than assumed: the timer re-arms on
 * every non-historic, non-cursor-tagged, non-suppressed commit (the update listener, where
 * `lastAnchorKey` is maintained) and on the same gestures that reset `settleCascadeDepth` — the
 * KEY_DOWN and CLICK handlers, which also release the app-placed-caret suppression window. The
 * suppressed paths (a historic restore, a `CURSOR_CHANGE_TAG` yank, and any commit inside the
 * app-placed window) never arm it — and a timer armed BEFORE the window opened must hold its fire
 * while the window is up, exactly as the departure and forced-commit clocks do: an idle expiry
 * carries no user intent over restored/yanked content.
 */

import Editor from "../Editor";
import { IDLE_SETTLE_DELAY_MS } from "./MarkerEditPlugin";
import {
  $appendCharPara,
  $appendVerseAttributeRun,
  historyTestEnvironment,
  requireDefined,
  testEnvironment,
  testEnvironmentWithCharSync,
  testEnvironmentWithSpacing,
} from "./markerEdit.test-helpers";
import { spanUsj } from "../settledGetUsj.test-helpers";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  LexicalNode,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import { createRef } from "react";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $createVerseNode,
  $isAttributeRunNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  $isVerseNode,
  $verseAttributeRunPieces,
  CURSOR_CHANGE_TAG,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  ParaNode,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

// Only the clocks the timer actually uses: `queueMicrotask` (the departure clock's deferral) must
// stay REAL so the existing settle machinery is unchanged under these tests, and `Date` is faked
// so Lexical history's time-based merge window sees the same clock the timer does.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});

afterEach(() => {
  vi.useRealTimers();
});

/** Retype the char opener `\nd` to the BARE literal `\wj` (no terminator) with the caret left
 * inside the glyph — the Tier-1 opener pend path: the transform pends the glyph, and the
 * caret-departure clock cannot settle it because the caret never leaves. */
async function $retypeOpenerBare(
  editor: LexicalEditor,
  parts: ReturnType<typeof $appendCharPara>,
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      parts.marker.setTextContent("\\wj");
      parts.marker.select(3, 3);
    }),
  );
}

/** Assert the pend has NOT settled: the span still reports `nd` under the retyped literal. */
function expectPendingLiteral(editor: LexicalEditor, parts: ReturnType<typeof $appendCharPara>) {
  editor.getEditorState().read(() => {
    expect(parts.char.getMarker()).toBe("nd");
    expect(parts.marker.getTextContent()).toBe("\\wj");
    expect(parts.closer.getTextContent()).toBe("\\nd*");
  });
}

/** Assert the settle ran: the same end state the caret-departure clock produces for this edit
 * (the Tier-1 opener rename — span renamed, closer mirrored). */
function expectSettled(editor: LexicalEditor, parts: ReturnType<typeof $appendCharPara>) {
  editor.getEditorState().read(() => {
    expect(parts.char.getMarker()).toBe("wj");
    expect(parts.marker.getTextContent()).toBe("\\wj");
    expect(parts.closer.getTextContent()).toBe("\\wj*");
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function pressArrowLeft(editor: LexicalEditor): Promise<void> {
  await act(async () =>
    editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "ArrowLeft" })),
  );
}

describe("idle debounce settle (the second settle clock)", () => {
  it("settles the caret-held pending edit once the user has been idle past the delay", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    });
    await $retypeOpenerBare(editor, parts);

    // Mid-edit: the caret is inside the glyph, so the departure clock holds and nothing settles.
    expectPendingLiteral(editor, parts);

    // Idle past the debounce, WITHOUT moving the caret: the second clock fires and settles even
    // the caret-held node.
    await advance(IDLE_SETTLE_DELAY_MS + 50);
    expectSettled(editor, parts);
  });

  it("a keystroke during the idle period pushes the settle back a full delay", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    });
    await $retypeOpenerBare(editor, parts);

    // Not yet idle for the full delay.
    await advance(IDLE_SETTLE_DELAY_MS - 200);
    expectPendingLiteral(editor, parts);

    // A real keystroke is a gesture: it must reset the timer, so the ORIGINAL expiry (200ms from
    // now) passes without settling.
    await pressArrowLeft(editor);
    await advance(IDLE_SETTLE_DELAY_MS - 200);
    expectPendingLiteral(editor, parts);

    // A full idle period after the keystroke settles.
    await advance(250);
    expectSettled(editor, parts);
  });

  it("one undo restores the pre-settle literal, and the historic window holds it", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await historyTestEnvironment(() => {
      parts = $appendCharPara();
    });
    await $retypeOpenerBare(editor, parts);
    await advance(IDLE_SETTLE_DELAY_MS + 500);
    expectSettled(editor, parts);

    // The idle settle keeps its own history entry (same undo contract as the departure settle):
    // ONE undo restores the pre-settle literal, not the pre-edit canonical form.
    await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
    expectPendingLiteral(editor, parts);

    // The historic restore arms the app-placed-caret window; going idle again must NOT re-settle
    // the explicitly-undone literal — that is the undo trap the window exists to prevent, and the
    // idle clock is bound by it exactly like the departure and forced-commit clocks.
    await advance(IDLE_SETTLE_DELAY_MS * 3);
    expectPendingLiteral(editor, parts);
  });

  it("holds a live timer through an app-placed caret move, then settles after the next gesture", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    });
    await $retypeOpenerBare(editor, parts);

    // A scrRef-sync yank: a CURSOR_CHANGE-tagged commit moves the caret to a different node with
    // no user input. The timer armed by the edit is still live; the window this yank opens must
    // keep it from settling the literal the suppression machinery exists to protect.
    await act(async () =>
      editor.update(
        () => {
          const lord = requireDefined(
            $getRoot()
              .getAllTextNodes()
              .find(
                (node): node is TextNode =>
                  node.getType() === TextNode.getType() && node.getTextContent().includes("Lord"),
              ),
            "span content text not found",
          );
          lord.select(2, 2);
        },
        { tag: CURSOR_CHANGE_TAG },
      ),
    );
    await advance(IDLE_SETTLE_DELAY_MS + 200);
    expectPendingLiteral(editor, parts);

    // The next real gesture releases the window and re-arms the clock; a full idle period then
    // settles normally.
    await pressArrowLeft(editor);
    await advance(IDLE_SETTLE_DELAY_MS + 50);
    expectSettled(editor, parts);
  });

  // Deliberately NO mid-IME-composition test, and no isComposing() guard in the timer: none of
  // the existing settle paths carries one (Lexical's own post-composition selection reconcile
  // commits an anchor move that hands the pend to the caret-DEPARTURE clock, which settles it
  // with composition still active — pre-existing behavior, observed under jsdom), so a
  // timer-only guard would make the clocks diverge. If mid-composition settling needs
  // suppressing, that belongs in the SHARED settle computation, decided with a real-IME repro.
});

describe("idle expiry overrides caret-position grace", () => {
  // PT9's debounced reformat settles GLOBALLY when its tick fires: once the user has genuinely
  // idled, the caret's position grants no grace. The departure clock's caret-position grace arms
  // — the para-prefix separator re-pend and the display-owner run-site grace, both of which
  // re-pend based on where the caret SITS rather than on the settle's except-key — therefore
  // yield to an idle expiry: the held sites settle per the tokenize-identity rules, without
  // moving the caret.

  /** `\p x \wj ⍽asdf\wj*` + a `\p second` paragraph after it; returns the span's content text
   * (whose leading NBSP is the opener separator). */
  function $wjSeparatorFixture(): { contentText: TextNode } {
    const contentText = $createTextNode(`${NBSP}asdf`);
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createMarkerTrailingSeparator(),
        $createTextNode("x "),
        $createCharNode("wj").append(
          $createMarkerNode("wj"),
          contentText,
          $createMarkerNode("wj", "closing"),
        ),
      ),
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createMarkerTrailingSeparator(),
        $createTextNode("second"),
      ),
    );
    return { contentText };
  }

  /** Delete `contentText`'s leading NBSP separator, caret left AT the deletion point — the shape
   * whose settle the run-site grace defers while the caret holds it. */
  async function deleteSeparatorCaretHeld(editor: LexicalEditor, contentText: TextNode) {
    await act(async () =>
      editor.update(() => {
        contentText.setTextContent(contentText.getTextContent().slice(1));
        contentText.select(0, 0);
      }),
    );
  }

  it("settles a caret-held deleted opener separator on the idle tick — the marker renames", async () => {
    let parts!: ReturnType<typeof $wjSeparatorFixture>;
    const { editor } = await testEnvironmentWithCharSync(() => {
      parts = $wjSeparatorFixture();
    });
    await deleteSeparatorCaretHeld(editor, parts.contentText);

    // Caret-held: the deletion sticks (mid-edit grace), nothing settles synchronously.
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\wjasdf");
    });

    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      // `\wjasdf\wj*` re-tokenized: the name scan runs through `asdf`, so the marker IS
      // `wjasdf` — unknown to the stylesheet, resolved positionally as a paragraph, exactly the
      // end state the caret-DEPARTURE settle produces for this same edit.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "wjasdf")).toBe(true);
      // The settle must not move the caret: it was between `\wj` and `asdf` (the deleted
      // separator's site), and those bytes are now one glyph — the equivalent position is
      // INSIDE `\wjasdf` after its third character, where a half-typed opener keeps the caret.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isMarkerNode(anchorNode) && anchorNode.getTextContent()).toBe("\\wjasdf");
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("typing during the idle period is a gesture: the held site does NOT settle mid-gesture", async () => {
    let parts!: ReturnType<typeof $wjSeparatorFixture>;
    const { editor } = await testEnvironmentWithCharSync(() => {
      parts = $wjSeparatorFixture();
    });
    await deleteSeparatorCaretHeld(editor, parts.contentText);

    // Not yet idle for the full delay; keep typing at the held site. The keystroke and its
    // commit both push the clock back a full delay.
    await advance(IDLE_SETTLE_DELAY_MS - 200);
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "z" }));
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText("z");
      });
    });

    // The ORIGINAL expiry (200ms out) passes — and then some — without settling: total elapsed
    // time is now well past one full delay, so anything but a reset clock would have fired.
    await advance(IDLE_SETTLE_DELAY_MS - 200);
    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      // The literal (now `\wjzasdf` — the typed `z` landed at the caret) is still pending: the
      // span still reports `wj` and no rename has happened.
      expect($getRoot().getTextContent()).toContain("\\wjzasdf");
      const spans = paras.flatMap((para) => para.getChildren()).filter($isCharNode);
      expect(spans.some((span) => span.getMarker() === "wj")).toBe(true);
      expect(paras.some((para) => para.getMarker().startsWith("wj"))).toBe(false);
    });
  });

  it("keeps the emptied-husk grace even on the idle tick (the caret would not survive the settle)", async () => {
    // TJ's live \vp repro shape, on the idle clock: select every piece of `\vp 11 vp\vp*` and
    // delete. The caret collapses onto the emptied `AttributeRunNode` husk — an ELEMENT point on
    // the caret's own node. This is the ONE caret-position grace that holds even on an idle
    // expiry (see SettleReason's carve-out in markerEditTier1.utils.ts): settling would destroy
    // the caret's node, and every caret-preservation strategy tried for that shape lost the
    // caret to the paragraph start. The husk stays graced through idle and settles fully on
    // genuine departure, exactly as the departure twins in verseAttributeSettle.test.tsx pin.
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode(
        "11",
        getVisibleOpenMarkerText("v", "11"),
        undefined,
        "11 va",
        "11 vp",
      );
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode(" This verse."),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
      $appendVerseAttributeRun(verse, "va", "11 va");
      $appendVerseAttributeRun(verse, "vp", "11 vp");
    });
    const $firstPara = () => $getRoot().getChildren().filter($isParaNode)[0];
    const $firstVerse = () =>
      requireDefined($firstPara().getChildren().find($isVerseNode), "verse missing");

    // Delete the whole `\vp` run by selection; the caret collapses onto the emptied husk.
    await act(async () =>
      editor.update(() => {
        const vaWrapper = requireDefined(
          $verseAttributeRunPieces($firstVerse(), "va").wrapper,
          "\\va wrapper missing",
        );
        const { opener, closer } = $verseAttributeRunPieces(vaWrapper, "vp");
        if (!opener || !closer) throw new Error("\\vp glyphs missing");
        const selection = $createRangeSelection();
        selection.anchor.set(opener.getKey(), 0, "text");
        selection.focus.set(closer.getKey(), closer.getTextContentSize(), "text");
        $setSelection(selection);
        selection.removeText();
      }),
    );

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // Still graced: the husk survives under the caret, the caret has not moved off it, and
      // the deletion itself sticks (no resurrected `\vp` bytes).
      const vpHusks = $firstPara()
        .getChildren()
        .filter($isAttributeRunNode)
        .filter((wrapper) => wrapper.getRunKind() === "vp");
      expect(vpHusks).toHaveLength(1);
      expect($firstPara().getTextContent()).not.toContain("\\vp");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(vpHusks[0])).toBe(true);
    });

    // Grace deferred the settle, it did not cancel it: genuine caret departure settles fully —
    // husk gone, pubnumber cleared.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
        if (!$isTextNode(body)) throw new Error("body text node missing");
        body.select(0, 0);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    editor.getEditorState().read(() => {
      expect($firstVerse().getPubnumber()).toBeUndefined();
      const vpWrappers = $firstPara()
        .getChildren()
        .filter($isAttributeRunNode)
        .filter((wrapper) => wrapper.getRunKind() === "vp");
      expect(vpWrappers).toHaveLength(0);
    });
  });

  it("settles a caret-held deleted para-prefix separator on the idle tick — the paragraph renames", async () => {
    let pPara!: ParaNode;
    let pMarker!: MarkerNode;
    let separator!: TextNode;
    const { editor } = await testEnvironment(() => {
      pPara = $createParaNode("q2");
      pMarker = $createMarkerNode("q2");
      separator = $createMarkerTrailingSeparator();
      $getRoot().append(
        pPara.append(pMarker, separator, $createTextNode("body text")),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("second"),
        ),
      );
    });

    // Delete the prefix separator; backspace leaves the caret at the glyph end.
    await act(async () =>
      editor.update(() => {
        separator.remove();
        pMarker.select(pMarker.getTextContentSize(), pMarker.getTextContentSize());
      }),
    );
    // Caret-held: the deletion sticks (the deletion transform's grace pends the para).
    editor.getEditorState().read(() => {
      expect(pPara.getTextContent()).toBe("\\q2body text");
    });

    await advance(IDLE_SETTLE_DELAY_MS + 50);

    editor.getEditorState().read(() => {
      // `\q2body text` re-tokenized: the marker IS `q2body` with content `text` — the same end
      // state the departure settle produces for this edit.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "q2body")).toBe(true);
      expect(paras.some((para) => para.getMarker() === "q2")).toBe(false);
      // No caret move: it sat at the old glyph's end (after `\q2`), so the equivalent position
      // is inside the rebuilt `\q2body` glyph after its third character.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isMarkerNode(anchorNode) && anchorNode.getTextContent()).toBe("\\q2body");
      expect(selection.anchor.offset).toBe(3);
    });
  });
});

describe("configurable idle settle delay (markerSettleDelayMs)", () => {
  it("a custom delay replaces the default: no settle before it, settle after it", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    }, 250);
    await $retypeOpenerBare(editor, parts);

    // Just short of the custom delay: still pending.
    await advance(200);
    expectPendingLiteral(editor, parts);

    // Past 250ms (but far short of the 1000ms default): the custom clock fires.
    await advance(100);
    expectSettled(editor, parts);
  });

  it("0 settles commit-adjacent: the very next timer tick, no idle wait", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    }, 0);
    await $retypeOpenerBare(editor, parts);

    // Zero delay arms a zero-delay timer off the editing commit itself — the same
    // commit-adjacent cadence as the departure settle's microtask, just on the timer clock.
    // Advancing time by NOTHING runs it.
    await advance(0);
    expectSettled(editor, parts);
  });

  it("-1 disables the idle clock entirely; caret departure still settles", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    }, -1);
    await $retypeOpenerBare(editor, parts);

    // Idle for many default periods: with the idle clock off, nothing settles.
    await advance(IDLE_SETTLE_DELAY_MS * 3);
    expectPendingLiteral(editor, parts);

    // The FIRST clock (caret departure) is untouched: leaving the glyph settles as before the
    // idle timer existed.
    await act(async () =>
      editor.update(() => {
        const lord = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find(
              (node): node is TextNode =>
                node.getType() === TextNode.getType() && node.getTextContent().includes("Lord"),
            ),
          "span content text not found",
        );
        lord.select(2, 2);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expectSettled(editor, parts);
  });

  it("Editor options plumb the delay through to the engine", async () => {
    // Mount the real `<Editor>` (not the bare plugin) with `options.markerSettleDelayMs: -1`;
    // if the option were dropped anywhere between `EditorOptions` and `MarkerEditPlugin`, the
    // default 1000ms clock would settle the caret-held literal below and this test would fail.
    const lexicalRef = createRef<LexicalEditor>();
    const view = requireDefined(
      getViewOptions(STANDARD_VIEW_MODE),
      "Standard view options are required for this test.",
    );
    await act(async () => {
      render(
        <Editor defaultUsj={spanUsj} options={{ view, markerSettleDelayMs: -1 }}>
          <EditorRefPlugin editorRef={lexicalRef} />
        </Editor>,
      );
    });
    const editor = requireDefined(lexicalRef.current ?? undefined, "lexical editor not captured");

    // Retype the `\nd` opener to the bare literal `\wj`, caret left inside the glyph.
    await act(async () =>
      editor.update(() => {
        const opener = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((node) => $isMarkerNode(node) && node.getTextContent() === "\\nd"),
          "nd opener glyph not found",
        );
        opener.setTextContent("\\wj");
        opener.select(3, 3);
      }),
    );

    // Idle far past the default delay: the plumbed -1 keeps the idle clock off, so the span
    // still reports `nd` under the retyped literal.
    await advance(IDLE_SETTLE_DELAY_MS * 3);
    editor.getEditorState().read(() => {
      const span = $getRoot()
        .getChildren()
        .flatMap((child) => ($isElementNode(child) ? child.getChildren() : []))
        .find($isCharNode);
      expect(requireDefined(span, "char span not found").getMarker()).toBe("nd");
    });
  });
});
