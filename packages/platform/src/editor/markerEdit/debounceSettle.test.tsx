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

import { IDLE_SETTLE_DELAY_MS } from "./MarkerEditPlugin";
import {
  $appendCharPara,
  historyTestEnvironment,
  requireDefined,
  testEnvironment,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $getRoot,
  $setCompositionKey,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import { CURSOR_CHANGE_TAG } from "shared";

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

  it("defers an expiry that lands mid-IME-composition until the composition ends", async () => {
    let parts!: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => {
      parts = $appendCharPara();
    });
    await $retypeOpenerBare(editor, parts);

    // Composition starts (IME session over the pending glyph). The caret is re-pinned inside the
    // glyph in the same update because that is what a real IME session looks like — the caret
    // rides the composed text (a bare `$setCompositionKey` in jsdom drifts the observed anchor,
    // which would hand this pend to the caret-DEPARTURE clock and prove nothing about the timer).
    // An idle expiry now must not re-tokenize the node out from under the IME.
    await act(async () =>
      editor.update(() => {
        $setCompositionKey(parts.marker.getKey());
        parts.marker.select(3, 3);
      }),
    );
    await advance(IDLE_SETTLE_DELAY_MS * 3);
    expectPendingLiteral(editor, parts);

    // Composition ends; the next full idle period settles.
    await act(async () =>
      editor.update(() => {
        $setCompositionKey(null);
        parts.marker.select(3, 3);
      }),
    );
    await advance(IDLE_SETTLE_DELAY_MS + 50);
    expectSettled(editor, parts);
  });
});
