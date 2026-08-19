/**
 * Undo-vs-settle regression tests. Lexical performs undo/redo via
 * `editor.setEditorState(entry, { tag: HISTORIC_TAG })`, and that path NEVER runs node
 * transforms (`$applyAllTransforms` is only called from the `editor.update()` path), so a
 * literal restored by undo is invisible to the marker-edit pend/settle engine: nothing
 * re-adds it to `pendingKeys`, and caret departure has nothing to resolve — the literal
 * (e.g. `|stuff="thing"` in a closed char span, or a typed `\nd hello\nd*` run) persists
 * forever unless the user types inside it. The fix is a read-only re-pend scan on
 * historic-tagged commits (MarkerEditPlugin's update listener): pend-shaped nodes are
 * re-added to `pendingKeys` without mutating the editor state, so no history entry is
 * created (undo/redo stacks stay intact — no undo trap) and the next real commit settles
 * them exactly like any other departure.
 */

import { historyTestEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setState,
  BLUR_COMMAND,
  CLICK_COMMAND,
  LexicalNode,
  REDO_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import { COMMIT_PENDING_MARKERS_COMMAND } from "./MarkerEditPlugin";
import {
  $charAttributeDisplayNode,
  $createCharNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createParaNode,
  $createUnknownNode,
  $isCharNode,
  $isDisplayOwnerPended,
  $isMarkerNode,
  $isParaNode,
  $isUnknownNode,
  CharNode,
  ImmutableTypedTextNode,
  NBSP,
  textTypeState,
  UnknownNode,
} from "shared";

// The test environments don't implement `getBoundingClientRect`; undo/redo restore a
// collapsed selection while the editor root holds DOM focus, and Lexical's post-commit
// scroll-into-view reads a rect off the selection target (a Range or an Element). Stub
// both (zero rects nothing here asserts on) — same as markerEditLoop.test.tsx.
function zeroRect(): DOMRect {
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
}
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = zeroRect;
if (typeof Element.prototype.getBoundingClientRect !== "function")
  Element.prototype.getBoundingClientRect = zeroRect;

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefinedInTest<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Depth-first search for the first CharNode with `marker` anywhere under `root`. */
function $findFirstChar(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findFirstChar(child, marker);
    if (found) return found;
  }
  return undefined;
}

/** Every UnknownNode with the given `tag` (USJ `type`) anywhere under `root`. */
function $unknownsWithTag(root: LexicalNode, tag: string): UnknownNode[] {
  const out: UnknownNode[] = [];
  const visit = (node: LexicalNode): void => {
    if ($isUnknownNode(node) && node.getTag() === tag) out.push(node);
    if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  visit(root);
  return out;
}

/** Flush the deferred (microtask) pending-marker resolution twice, inside act. */
async function flushResolution() {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  });
}

type EditorHandle = Awaited<ReturnType<typeof historyTestEnvironment>>["editor"];

/**
 * A USER-driven caret departure after a historic restore: the mouse click ends the
 * app-placed suppression window the undo/redo branch arms (a history restore parks the
 * caret programmatically, so only a real user gesture — click or keystroke — reopens
 * settling, exactly like the scrRef-yank window), then the caret lands in the text node
 * containing `targetIncludes` and the deferred resolution settles what pended.
 */
async function userDeparture(editor: EditorHandle, targetIncludes: string, offset: number) {
  await act(async () => {
    editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
  });
  await act(async () =>
    editor.update(() => {
      const target = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent().includes(targetIncludes));
      target?.select(offset, offset);
    }),
  );
  await flushResolution();
}

/**
 * Moves the caret out of the restored literal WITHOUT settling it, for the two tests below whose
 * settle must come from blur or from the forced pre-save commit rather than from the caret.
 *
 * An undo restores the caret the entry recorded — inside the literal, because that is where the
 * user was typing when the entry closed. Both the blur handler and the forced commit deliberately
 * except the node the caret sits in, so with the caret still there neither would settle anything
 * and the test would prove nothing. The app-placed-caret window a historic restore arms is what
 * makes this move safe: while it is up no commit settles, so the caret can leave without the
 * departure clock beating blur to the punch.
 */
async function leaveLiteralDuringUndoWindow(editor: EditorHandle, destination: TextNode) {
  await act(async () => editor.update(() => destination.select(0, 0)));
  await flushResolution();
}

/**
 * Departs the pending node by EDITING the paragraph the caret lands in — one commit that both
 * moves the caret and types there.
 *
 * The edit is what puts the mid-edit literal on the undo stack at all. A settle is never its own
 * history entry: it merges into the entry of the commit that provoked it. Depart with a bare caret
 * move and that commit dirties nothing, so the settle merges into the entry holding the user's own
 * typing — one Ctrl+Z takes the typing and its settle away together and lands on the pre-typing
 * document, with the literal never a state undo can reach. An edit at the destination opens its
 * own entry, so undo lands on the literal, which is the state every test below is about.
 *
 * Moving and typing in ONE commit is a test compression of "the user's next action was an edit
 * elsewhere"; the app reaches the same history shape with the caret move and the edit separated by
 * nothing that dirties a node.
 */
async function editDeparture(editor: EditorHandle, destination: TextNode) {
  await act(async () =>
    editor.update(() => {
      const end = destination.getTextContentSize();
      destination.select(end, end);
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText("!");
    }),
  );
  await flushResolution();
}

/**
 * Mount a closed `\nd` span holding "text" plus a second paragraph to depart to, then type
 * `|stuff="thing"` into the span (caret at the end of "text") and settle it by departing.
 * Returns the editor with the settle assertions already verified (positive control).
 */
async function settledPipeEnvironment() {
  let content: TextNode;
  let other: TextNode;
  const { editor } = await historyTestEnvironment(() => {
    const para = $createParaNode("p");
    const char = $createCharNode("nd");
    content = $createTextNode(`${NBSP}text`);
    para.append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
    );
    other = $createTextNode("elsewhere");
    $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
  });
  await act(async () => editor.update(() => content.select(5, 5)));
  for (const character of `|stuff="thing"`) {
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      }),
    );
  }
  // An edit in the other paragraph departs the pipe literal and settles it into the attribute.
  await editDeparture(editor, other);
  assertPipeSettled(editor);
  return { editor, other };
}

/** The settled shape: closed `nd` span carrying the parsed attribute + canonical run. */
function assertPipeSettled(editor: EditorHandle) {
  editor.getEditorState().read(() => {
    const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    expect(nd.getUnknownAttributes()).toEqual({ stuff: "thing" });
    const run = requireDefinedInTest(
      $charAttributeDisplayNode(nd),
      "attribute display run not found",
    );
    expect(run.getTextContent()).toBe('|stuff="thing"');
  });
}

/** The undone shape: literal pipe text back as plain span content, no attribute. */
function assertPipeLiteral(editor: EditorHandle) {
  editor.getEditorState().read(() => {
    const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    expect(nd.getUnknownAttributes()).toBeUndefined();
    expect($charAttributeDisplayNode(nd)).toBeUndefined();
    expect($getRoot().getTextContent()).toContain('|stuff="thing"');
  });
}

/** The pre-typing shape: no pipe bytes anywhere, span content back to plain "text". */
function assertPipePreTyping(editor: EditorHandle) {
  editor.getEditorState().read(() => {
    const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    expect(nd.getUnknownAttributes()).toBeUndefined();
    expect($getRoot().getTextContent()).not.toContain("|stuff");
    expect(nd.getTextContent()).toContain("text");
  });
}

describe("undo → departure → re-settle (pipe attribute in a closed span)", () => {
  it("re-settles the attribute after settle → undo → caret departure (TJ's repro)", async () => {
    const { editor } = await settledPipeEnvironment();
    // UNDO restores the literal (that part is the undo working as intended)…
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    // …and a subsequent user caret departure must RE-settle it. Pre-fix, undo's
    // setEditorState path ran no transforms, nothing re-pended the restored literal, and
    // this departure resolved nothing — the literal persisted forever.
    await userDeparture(editor, "elsewhere", 4);
    assertPipeSettled(editor);
  });

  it("does not trap the user: undo then an immediate second undo reaches the pre-typing state", async () => {
    const { editor } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    // The re-pend must be read-only bookkeeping: no history entry, no intercepting settle.
    // The second undo must pop the TYPING entry and reach the pre-typing state directly.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipePreTyping(editor);
  });

  it("keeps history sound across a re-settle: undo → depart → re-settle → undo reaches pre-typing", async () => {
    const { editor } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    // Departure re-settles. The re-settle adds NO history entry of its own — a settle never
    // does — and the departure that provoked it dirtied nothing, so it merges into the entry
    // holding the restored literal.
    await userDeparture(editor, "elsewhere", 4);
    assertPipeSettled(editor);
    // ONE undo therefore reaches the pre-typing state: the re-settle rode along with the
    // literal's own entry instead of burying it under an extra press.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipePreTyping(editor);
  });

  it("redo parity: redo restoring the literal re-settles on the next departure", async () => {
    const { editor } = await settledPipeEnvironment();
    // Undo twice: settle → literal → pre-typing.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipePreTyping(editor);
    // Redo restores the typed literal — a historic commit just like undo, so the same
    // read-only re-pend must arm it for the departure settle.
    await act(async () => {
      editor.dispatchCommand(REDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    await userDeparture(editor, "elsewhere", 4);
    assertPipeSettled(editor);
  });
});

describe("blur vs the historic suppression window", () => {
  it("blur during the undo window does NOT re-settle the undone literal (no phantom entry either)", async () => {
    // Clicking ANOTHER PANEL right after an undo blurs the editor with no in-editor
    // gesture: that is not user intent over the restored content, so the explicitly-undone
    // literal must stay literal (it serializes as literal bytes — ParatextData parses
    // them). Pre-fix, the BLUR handler resolved pendings unconditionally and the undone
    // literal re-settled behind the user's back.
    const { editor } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    await flushResolution();
    assertPipeLiteral(editor); // literal survives the blur
    // No phantom history entry rode the gated blur: one more undo reaches pre-typing
    // directly (a phantom would make this undo revert nothing visible instead).
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipePreTyping(editor);
  });

  it("an in-editor gesture releases the window; blur then settles normally", async () => {
    const { editor, other } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    await leaveLiteralDuringUndoWindow(editor, other);
    assertPipeLiteral(editor); // still armed: the caret move alone settled nothing
    // The user interacts INSIDE the editor (a mouse click — same signal that ends the
    // scrRef-yank window), then focus leaves: blur-settles-pendings applies as always.
    await act(async () => {
      editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
    });
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    await flushResolution();
    assertPipeSettled(editor);
  });
});

describe("commitPendingMarkerEdits vs the historic suppression window", () => {
  it("the forced pre-save commit during the undo window does NOT re-settle the undone literal", async () => {
    // The host's 700ms debounced PDP save calls commitPendingMarkerEdits() (dispatching
    // COMMIT_PENDING_MARKERS_COMMAND) to settle half-typed markers before serializing. Firing
    // ~700ms after an undo — with the caret parked away from the literal (an ArrowUp departed it
    // before the undo) — it must NOT re-settle the explicitly-undone literal: the caret-node
    // exception cannot protect a node the caret already left, and the app-placed-caret window from
    // the historic restore is still armed. Same contract the BLUR handler already honors. The
    // literal stays literal (it serializes as literal bytes ParatextData parses). Pre-fix the
    // forced commit resolved the re-pended literal and it re-settled with NO user input ~1s later.
    const { editor } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor); // literal survives the forced pre-save commit
  });

  it("an in-editor gesture releases the window; the forced commit then settles normally", async () => {
    const { editor, other } = await settledPipeEnvironment();
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    await leaveLiteralDuringUndoWindow(editor, other);
    assertPipeLiteral(editor); // still armed: the caret move alone settled nothing
    // A real in-editor click ends the window (same signal that releases the scrRef-yank window);
    // now the forced pre-save commit settles as always — an abandoned mid-edit still serializes
    // its on-screen form, so the guard is narrow, not a blanket suppression.
    await act(async () => {
      editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
    });
    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeSettled(editor);
  });

  it("with TWO pendings, the armed commit resolves NEITHER; release resolves only the non-caret one", async () => {
    // Pins the breadth of the window guard: during an armed window the ENTIRE pending set stays
    // pending (the guard is a full stop, not a caret exception), and after release the normal
    // rule returns — everything resolves EXCEPT the node under the live caret. Two independent
    // pendings: the undone nd literal (elsewhere) and a wj literal typed under the caret while
    // the window is still armed (programmatic select+insertText dispatches no KEY_DOWN/CLICK,
    // so it does not release the window).
    let content: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}text`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
      );
      const para2 = $createParaNode("p");
      const wj = $createCharNode("wj");
      para2.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        wj.append(
          $createMarkerNode("wj"),
          $createTextNode(`${NBSP}other`),
          $createMarkerNode("wj", "closing"),
        ),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, para2, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    const assertWjLiteral = () =>
      editor.getEditorState().read(() => {
        const wj = requireDefinedInTest($findFirstChar($getRoot(), "wj"), "wj span not found");
        expect(wj.getUnknownAttributes()).toBeUndefined();
        expect($charAttributeDisplayNode(wj)).toBeUndefined();
        expect(wj.getTextContent()).toContain('|foo="bar"');
      });
    // Type + settle the nd pipe literal (same flow as settledPipeEnvironment).
    await act(async () => editor.update(() => content.select(5, 5)));
    for (const character of `|stuff="thing"`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await editDeparture(editor, other);
    assertPipeSettled(editor);
    // Undo: nd literal restored; the historic re-pend scan re-pends it and arms the window.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    // While STILL armed, land a second pending under the caret: a wj pipe literal.
    await act(async () =>
      editor.update(() => {
        const wj = requireDefinedInTest($findFirstChar($getRoot(), "wj"), "wj span not found");
        const wjContent = requireDefinedInTest(
          wj.getChildren().find((c): c is TextNode => !$isMarkerNode(c) && $isTextNode(c)),
          "wj content text not found",
        );
        const length = wjContent.getTextContent().length;
        wjContent.select(length, length);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(`|foo="bar"`);
      }),
    );
    await flushResolution();
    assertWjLiteral();
    // Armed window + forced commit: NEITHER pending resolves.
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeLiteral(editor);
    assertWjLiteral();
    // Release the window (real in-editor click; the caret stays in the wj literal), then commit:
    // the unrelated nd literal settles, the caret's own wj node stays pending (live-caret
    // exception).
    await act(async () => {
      editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
    });
    await act(async () => {
      editor.getRootElement()?.focus();
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    await flushResolution();
    assertPipeSettled(editor);
    assertWjLiteral();
  }, 15000);
});

describe("undo → departure → re-settle (typed `\\nd hello\\nd*` char span — the class case)", () => {
  it("re-settles the span after settle → undo → caret departure", async () => {
    let content: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      content = $createTextNode(`${NBSP}body`);
      para.append($createMarkerNode("p"), content);
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    // The literal lands with the caret parked mid-run (right after `\nd`), so the
    // caret-bounded termination check sees an UNTERMINATED run: it pends rather than
    // rebuilding immediately, and the settle rides the DEPARTURE — a separate history
    // entry from the typing, which is what makes it undoable back to the literal.
    await act(async () =>
      editor.update(() => {
        content.setTextContent(`${NBSP}body \\nd hello\\nd*`);
        content.select(9, 9);
      }),
    );
    editor.getEditorState().read(() => {
      // Pended, not yet settled.
      expect($findFirstChar($getRoot(), "nd")).toBeUndefined();
    });
    await editDeparture(editor, other);
    const assertSettled = () =>
      editor.getEditorState().read(() => {
        const nd = requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd span not found");
        expect(nd.getTextContent()).toContain("hello");
        expect(
          nd.getChildren().some((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
        ).toBe(true);
        expect($getRoot().getTextContent()).not.toContain("\\nd hello");
      });
    assertSettled(); // positive control: the departure settle worked
    // Undo restores the literal…
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      expect($findFirstChar($getRoot(), "nd")).toBeUndefined();
      expect($getRoot().getTextContent()).toContain("\\nd hello\\nd*");
    });
    // …and a user departure must re-settle it (pre-fix: nothing pended, nothing settled).
    await userDeparture(editor, "elsewhere", 4);
    assertSettled();
  });
});

describe("undo → departure → re-settle (typed `//` optbreak — the same divergence class)", () => {
  it("re-settles the optbreak after settle → undo → caret departure", async () => {
    // An undone optbreak settle restores the literal `//` text, which is the same
    // divergence class as a restored `\nd`/`|attrs` literal: the historic re-pend scan must
    // re-pend it so the next user departure re-settles it. Pre-fix, undo's setEditorState path
    // ran no transforms, nothing re-pended the restored `//`, and the departure resolved nothing.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      content = $createTextNode(`${NBSP}one // two`);
      para.append($createMarkerNode("p"), content);
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });
    // `//` pends on commit (no immediate rebuild) — the settle rides the DEPARTURE, a separate
    // history entry from the edit, which is what makes it undoable back to the literal.
    editor.getEditorState().read(() => {
      expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(0);
    });
    await editDeparture(editor, other);
    const assertOptbreakSettled = () =>
      editor.getEditorState().read(() => {
        // Exactly one optbreak display node — the `//` became the discretionary line break, and
        // no plain TextNode still carries a literal `//`.
        expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(1);
        const literalSlashes = $getRoot()
          .getAllTextNodes()
          .filter((node) => node.getType() === TextNode.getType())
          .some((node) => node.getTextContent().includes("//"));
        expect(literalSlashes).toBe(false);
      });
    assertOptbreakSettled(); // positive control: the departure settle worked
    // Undo restores the literal `//` (no optbreak display node, the `//` back as plain text)…
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      expect($unknownsWithTag($getRoot(), "optbreak")).toHaveLength(0);
      expect($getRoot().getTextContent()).toContain("one // two");
    });
    // …and a user departure must re-settle it (pre-fix: nothing pended, nothing settled).
    await userDeparture(editor, "elsewhere", 4);
    assertOptbreakSettled();
  });
});

describe("re-pend scan does not destabilize settle-refused literals", () => {
  it("after undo, a degradation literal elsewhere stays literal (fixed-point damping intact)", async () => {
    // Paragraph P holds an unterminated milestone run — one of the tokenizer's genuine
    // literal-degradation cases: its rebuild is a fixed point that must REFUSE (mutate
    // nothing), never loop (markerEditLoop.test.tsx pins this for the direct path). The
    // historic re-pend scan sweeps the WHOLE document, so after an undo it also re-pends
    // this literal; the departure resolve must hit the same fixed-point refusal and
    // terminate with the literal intact — the original damping property, now exercised
    // through the undo path.
    let content: TextNode;
    let refused: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      content = $createTextNode(`${NBSP}text`);
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, $createMarkerNode("nd", "closing")),
      );
      refused = $createTextNode('body \\ts-s |sid="x"');
      other = $createTextNode("elsewhere");
      $getRoot().append(
        para,
        $createParaNode("p").append($createMarkerNode("p"), refused),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    const refusedParaCount = () =>
      editor.getEditorState().read(() => $getRoot().getChildren().filter($isParaNode).length);
    expect(refusedParaCount()).toBe(3);
    // Type + settle the pipe attribute in the first paragraph's span.
    await act(async () => editor.update(() => content.select(5, 5)));
    for (const character of `|stuff="thing"`) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
    await editDeparture(editor, other);
    assertPipeSettled(editor);
    // Undo, then depart: the pipe literal re-settles; the milestone literal is re-pended
    // by the same scan but its resolve refuses at the fixed point — still literal, still
    // three paragraphs, and the test RETURNING proves no resolve/rebuild loop.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    await userDeparture(editor, "elsewhere", 4);
    assertPipeSettled(editor);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain('\\ts-s |sid="x"');
    });
    expect(refusedParaCount()).toBe(3);
  }, 15000);
});

describe("undo of a settled run deletion (charAttributeDeletionSettle.test.tsx's flow) restores the run without a spurious pend", () => {
  it("settle a run deletion, undo restores it, and it stays restored across a subsequent unrelated commit", async () => {
    // The inverse direction of this file's other suites: those undo a SETTLE (a typed literal
    // resolved to structure) and re-pend the restored LITERAL for re-settling. Here undo reverses
    // a DELETION SETTLE (charAttributeDeletionSettle.test.tsx's flow) — the restored state is
    // already fully canonical (attributes + display run both back), so the historic re-pend scan
    // ($rependPendShapedNodes) must recognize it as NOT pend-shaped and leave it alone: pending an
    // already-canonical owner would needlessly exempt it from healing (attributeDisplay.utils.ts's
    // `$isDisplayOwnerPended` guard) until an unrelated caret departure, and — if that departure's
    // resolve ever mistakenly treated the pend as "still needs settling" — could re-clear the
    // attributes the undo just restored.
    let content: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      const char = $createCharNode("nd");
      char.setUnknownAttributes({ stuff: "thing" });
      content = $createTextNode(`${NBSP}text`);
      const run = $createTextNode('|stuff="thing"');
      $setState(run, textTypeState, "attribute");
      para.append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        char.append($createMarkerNode("nd"), content, run, $createMarkerNode("nd", "closing")),
      );
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });

    const $findChar = () =>
      requireDefinedInTest($findFirstChar($getRoot(), "nd"), "nd char span not found");
    const $findRun = (char: CharNode) =>
      char
        .getChildren()
        .find(
          (c): c is TextNode =>
            $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
        );

    // Delete the run and depart: the deletion settles (charAttributeDeletionSettle.test.tsx's
    // flow) — attributes clear, the run is gone.
    await act(async () =>
      editor.update(() => {
        const char = $findChar();
        const run = requireDefinedInTest($findRun(char), "run missing");
        const index = run.getIndexWithinParent();
        run.remove();
        char.select(index, index);
      }),
    );
    await editDeparture(editor, other);
    editor.getEditorState().read(() => {
      expect($findChar().getUnknownAttributes()?.stuff).toBeUndefined();
    });

    // The deletion and its settle are TWO SEPARATE history entries (removing the run does not
    // itself clear the attributes; that happens only in the deferred Tier-2 settle the departure
    // triggers), so undoing back to the fully pre-deletion state — run present, attributes set —
    // takes two undos: the first reverses the settle (attributes come back, but the run is still
    // absent — an intermediate state, since Tier-2's clearing is the only thing it undoes), the
    // second reverses the deletion itself (the run comes back too).
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      expect($findChar().getUnknownAttributes()?.stuff).toBe("thing");
    });
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      const char = $findChar();
      expect(char.getUnknownAttributes()?.stuff).toBe("thing");
      expect($charAttributeDisplayNode(char)?.getTextContent()).toBe('|stuff="thing"');
    });
    // The historic commit must not have pended the restored (already-canonical) owner.
    editor.read(() => {
      expect($isDisplayOwnerPended($findChar())).toBe(false);
    });

    // A subsequent UNRELATED user departure (into the OTHER paragraph, nowhere near the restored
    // span) must not disturb it. `userDeparture` — not a raw `editor.update()` — is required here:
    // the second undo above armed the app-placed-caret suppression window (the historic branch
    // always arms it), and that window is released ONLY by a real in-editor gesture
    // (CLICK_COMMAND/KEY_DOWN_COMMAND). A raw content edit with no such gesture leaves the window
    // armed, and the update listener's `if (appPlacedCaret) return;` would then skip queuing the
    // deferred resolution entirely — making this assertion pass whether or not a spurious pend
    // exists, since nothing would ever be resolved either way. `userDeparture` dispatches
    // CLICK_COMMAND first (releasing the window, exactly like the file's other post-undo departures
    // above), so the deferred resolution genuinely runs: a spurious pend from the historic commit
    // would let it resolve the owner and re-clear the just-restored attributes.
    await userDeparture(editor, "elsewhere", 4);
    editor.getEditorState().read(() => {
      const char = $findChar();
      expect(char.getUnknownAttributes()?.stuff).toBe("thing");
      expect($charAttributeDisplayNode(char)?.getTextContent()).toBe('|stuff="thing"');
    });
  });
});

describe("undo → departure → re-settle (an emptied optbreak husk, reachable via ONE Ctrl+Z)", () => {
  it("re-derives the husk pend after undoing its own removal, and stays sound across a re-settle", async () => {
    // An optbreak's `//` token IS its entire USFM byte representation (unknownUsfm.utils.ts): once
    // it is destroyed the empty UnknownNode left behind is undead scaffolding with nothing left to
    // display — `$settlePendedDisplayOwner`'s optbreak arm removes it outright on the next settle
    // pass. The husk is an INTERMEDIATE state: the deletion pends the owner via the mutation
    // listener, and the husk removal happens only on the LATER deferred-resolve commit. A settle
    // carries no history entry of its own, so the husk is undo-reachable only when some other
    // commit closed the entry first (below) — an ATTACHED, EMPTY optbreak UnknownNode rather than
    // the original pre-deletion content. Pre-fix, `$rependPendShapedNodes` returned early on ANY UnknownNode
    // without checking for this shape, so nothing re-pended the restored husk and it serialized an
    // optbreak with no visible bytes forever.
    let optbreakToken: ImmutableTypedTextNode;
    let optbreak: UnknownNode;
    let before: TextNode;
    let other: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      before = $createTextNode(`${NBSP}First `);
      optbreak = $createUnknownNode("optbreak");
      optbreakToken = $createImmutableTypedTextNode("marker", "//");
      optbreak.append(optbreakToken);
      para.append($createMarkerNode("p"), before, optbreak, $createTextNode(" second"));
      other = $createTextNode("elsewhere");
      $getRoot().append(para, $createParaNode("p").append($createMarkerNode("p"), other));
    });

    const $optbreaks = () => $unknownsWithTag($getRoot(), "optbreak");

    // Delete the optbreak's own `//` token, caret parked right at the deletion site (mirrors
    // verseAttributeSettle.test.tsx's deletion pattern) — this is the FIRST history entry.
    await act(async () => {
      // `discrete` so this lands as its own commit: Lexical otherwise batches both updates below
      // into one, and the whole point here is that they are two.
      editor.update(
        () => {
          optbreakToken.remove();
          before.select(before.getTextContentSize(), before.getTextContentSize());
        },
        { discrete: true },
      );
      // A second commit lands in the same tick, BEFORE the deferred settle's microtask runs.
      // That is what makes the husk a state Ctrl+Z can reach at all: with nothing between the
      // deletion and the settle the two share one entry, and a single undo goes straight back to
      // the intact `//`. In the app any other plugin committing in the same tick (a collab apply,
      // an annotation sync) closes the entry the same way.
      editor.update(
        () => {
          const end = other.getTextContentSize();
          other.select(end, end);
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("!");
        },
        { discrete: true },
      );
    });
    await flushResolution();
    // The optbreak arm has no caret-held grace to wait out (there is no partial-edit state for a
    // construct whose display IS its entire byte representation), so the husk is already removed
    // by the deferred resolve — the SECOND, separate history entry.
    editor.getEditorState().read(() => {
      expect($optbreaks()).toHaveLength(0);
    });

    // Undo ONCE lands on the husk shape: an attached, EMPTY optbreak UnknownNode — not yet
    // removed, not yet the original `//` content either. The entry it reverses belongs to the
    // second commit; the settle rode along inside that entry rather than owning one.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      const husks = $optbreaks();
      expect(husks).toHaveLength(1);
      expect(husks[0].getChildrenSize()).toBe(0);
    });

    // A subsequent user departure must re-settle it: the husk is statically re-derivable from its
    // own shape (tag "optbreak", zero children) regardless of caret state, so the fix pends it
    // directly in the re-pend scan and this departure removes it again — merging into the entry
    // holding the restored husk, since the departure itself dirtied nothing.
    await userDeparture(editor, "elsewhere", 4);
    editor.getEditorState().read(() => {
      expect($optbreaks()).toHaveLength(0);
    });

    // History stays sound across the re-settle: it added no entry of its own, so the next undo
    // reverses the DELETION and reaches the true pre-deletion state directly — the optbreak with
    // its `//` token restored, not a husk. (Pre-ruling this took two presses, the first landing
    // back on the husk.)
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      const restored = $optbreaks();
      expect(restored).toHaveLength(1);
      expect(restored[0].getChildrenSize()).toBe(1);
      expect(restored[0].getTextContent()).toBe("//");
    });
    // A canonical, non-empty optbreak is not a husk — the fix's shape check (zero children) must
    // not spuriously pend it, so this departure is a stable no-op: the restored `//` survives.
    await userDeparture(editor, "elsewhere", 4);
    editor.getEditorState().read(() => {
      const stable = $optbreaks();
      expect(stable).toHaveLength(1);
      expect(stable[0].getChildrenSize()).toBe(1);
      expect(stable[0].getTextContent()).toBe("//");
    });
  });
});
