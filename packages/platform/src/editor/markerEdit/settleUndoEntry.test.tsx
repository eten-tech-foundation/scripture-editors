/**
 * A settle is NEVER its own undo entry.
 *
 * Undo must undo what the USER did — a typed character, a deletion — and never a settle. The
 * engine's settle commits therefore all carry `HISTORY_MERGE_TAG`, so each one joins the history
 * entry of the edit that provoked it. One Ctrl+Z takes the user's edit and its settle away
 * together and lands on the content the user had before that edit.
 *
 * The repro these tests pin: type `\nd ` (which auto-creates the char marker inside the typing
 * commit, so nothing settles), then delete the marker's backslash and let the settle degrade the
 * span back to normal text, then retype the backslash and let it settle into a real char marker
 * again. Before the merge tag was unconditional, the first Ctrl+Z there undid the SETTLE — the
 * document went back to the literal `\nd Lord` the user had already stopped looking at, and the
 * backslash they had typed was still on screen. It took a second Ctrl+Z to undo the keystroke.
 *
 * The second property matters just as much as the first: no Ctrl+Z may be a visible no-op. A
 * settle commit that changed nothing still dirties parse orphans, so left untagged it would push
 * an undo entry that restores an identical-looking document — one dead Ctrl+Z press — and wipe
 * the redo stack.
 */

import { COMMIT_PENDING_MARKERS_COMMAND } from "./MarkerEditPlugin";
import { historyTestEnvironment } from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  LexicalEditor,
  LexicalNode,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import { $createMarkerNode, $createParaNode, $isCharNode, $isMarkerNode, NBSP } from "shared";

// The test environment doesn't implement `getBoundingClientRect`; undo/redo restore a collapsed
// selection while the editor root holds DOM focus, and Lexical's post-commit scroll-into-view
// reads a rect off the selection target (a Range or an Element). Stub both with zero rects —
// nothing here asserts on them — same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();
if (typeof Element.prototype.getBoundingClientRect !== "function")
  Element.prototype.getBoundingClientRect = () => new DOMRect();

/**
 * A structural fingerprint of the document: node types nested by depth, each with its text. Two
 * states with the same fingerprint are indistinguishable to the user, which is what "a dead
 * Ctrl+Z press" means.
 *
 * Read-only: call inside `editor.getEditorState().read()`.
 */
function $documentShape(): string {
  const parts: string[] = [];
  const visit = (node: LexicalNode, depth: number): void => {
    parts.push(`${"·".repeat(depth)}${node.getType()}:${JSON.stringify(node.getTextContent())}`);
    if ($isElementNode(node)) node.getChildren().forEach((child) => visit(child, depth + 1));
  };
  $getRoot()
    .getChildren()
    .forEach((child) => visit(child, 0));
  return parts.join("\n");
}

function documentShape(editor: LexicalEditor): string {
  return editor.getEditorState().read($documentShape);
}

/** Flush the deferred (microtask) settle twice, inside act. */
async function flushSettle() {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  });
}

/** Park the collapsed caret at `offset` in the first non-glyph text node containing `includes`. */
async function caretAt(editor: LexicalEditor, includes: string, offset: number) {
  await act(async () =>
    editor.update(() => {
      const target = $getRoot()
        .getAllTextNodes()
        .find((node) => !$isMarkerNode(node) && node.getTextContent().includes(includes));
      target?.select(offset, offset);
    }),
  );
  await flushSettle();
}

/** Type `text` at the caret, one keystroke per commit, the way real typing commits. */
async function type(editor: LexicalEditor, text: string) {
  for (const character of text) {
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      }),
    );
  }
  await flushSettle();
}

async function undo(editor: LexicalEditor) {
  await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
  await flushSettle();
}

async function redo(editor: LexicalEditor) {
  await act(async () => editor.dispatchCommand(REDO_COMMAND, undefined));
  await flushSettle();
}

/** The document's marker-name text for its one char span, or undefined when there is none. */
function charSpanMarker(editor: LexicalEditor): string | undefined {
  return editor.getEditorState().read(() => {
    const span = $getRoot()
      .getChildren()
      .flatMap((para) => ($isElementNode(para) ? para.getChildren() : []))
      .find($isCharNode);
    return span?.getMarker();
  });
}

function rootText(editor: LexicalEditor): string {
  return editor.getEditorState().read(() => $getRoot().getTextContent());
}

/** The settled char span: a real `nd` CharNode whose opener glyph carries the backslash. */
function expectSettledCharSpan(editor: LexicalEditor) {
  expect(charSpanMarker(editor)).toBe("nd");
  expect(rootText(editor)).toContain(`\\nd${NBSP}Lord`);
}

/** The literal the settle consumes: `\nd Lord` as plain paragraph text, no char span. */
function expectLiteralBackslashText(editor: LexicalEditor) {
  expect(charSpanMarker(editor)).toBeUndefined();
  expect(rootText(editor)).toContain("\\nd Lord");
}

/** The user's content before they retyped the backslash: plain `nd Lord`, no backslash anywhere. */
function expectPreEditPlainText(editor: LexicalEditor) {
  expect(charSpanMarker(editor)).toBeUndefined();
  expect(rootText(editor)).toContain("nd Lord");
  expect(rootText(editor)).not.toContain("\\nd");
}

/**
 * The owner's corrected repro, up to the second settle. Returns the editor plus the document
 * shapes at the two states one Ctrl+Z could plausibly land on.
 */
async function retypedBackslashEnvironment() {
  const { editor } = await historyTestEnvironment(() => {
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createTextNode("Lord"),
      ),
      // Somewhere for the caret to depart to, which is what runs the departure settle clock.
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createTextNode("elsewhere"),
      ),
    );
  });
  const pristine = documentShape(editor);

  // Typing `\nd ` terminates the marker, so Tier 2 re-tokenizes inside the typing commit —
  // nothing pends and nothing settles. This is the starting state, not the defect. Offset 1 is
  // just past the paragraph prefix's separator, where the caret sits at content start.
  await caretAt(editor, "Lord", 1);
  await type(editor, `\\nd `);
  expectSettledCharSpan(editor);

  // Delete the opener glyph's backslash, leaving the caret where the byte was (as Backspace
  // does), then depart: the settle degrades the span back to normal text.
  await act(async () =>
    editor.update(() => {
      const opener = $getRoot()
        .getAllTextNodes()
        .find((node) => $isMarkerNode(node) && node.getTextContent() === "\\nd");
      opener?.spliceText(0, 1, "", true);
      opener?.select(0, 0);
    }),
  );
  await flushSettle();
  await caretAt(editor, "elsewhere", 0);
  expectPreEditPlainText(editor);
  const beforeRetype = documentShape(editor);

  // Retype the backslash and depart again: this settle rebuilds the real char marker.
  await caretAt(editor, "nd Lord", 0);
  await type(editor, "\\");
  expectLiteralBackslashText(editor);
  const literal = documentShape(editor);
  await caretAt(editor, "elsewhere", 0);
  expectSettledCharSpan(editor);

  return { editor, pristine, beforeRetype, literal };
}

describe("a settle is never its own undo entry", () => {
  it("one Ctrl+Z after the settle lands on the content the user had before the keystroke", async () => {
    const { editor, beforeRetype, literal } = await retypedBackslashEnvironment();

    await undo(editor);

    // The defect: this landed on `literal` — the settle undone, the typed backslash still on
    // screen — and needed a second Ctrl+Z to take the keystroke back.
    expectPreEditPlainText(editor);
    expect(documentShape(editor)).toBe(beforeRetype);
    expect(documentShape(editor)).not.toBe(literal);
  });

  it("the previous edit's settle merged too: the second Ctrl+Z restores the undamaged glyph", async () => {
    const { editor } = await retypedBackslashEnvironment();

    await undo(editor);
    await undo(editor);

    // The backslash DELETION and the settle that degraded the span are one entry as well, so
    // this lands on the intact span rather than on the damaged `nd` glyph mid-settle.
    expectSettledCharSpan(editor);
  });

  it("the stack holds one entry per user edit and no dead Ctrl+Z press", async () => {
    const { editor, pristine } = await retypedBackslashEnvironment();

    // Press Ctrl+Z until the document stops changing. Stopping early on an unchanged document
    // IS the dead-press failure: the loop would then end somewhere short of pristine.
    let shape = documentShape(editor);
    const waypoints: string[] = [];
    for (let press = 0; press < 12; press += 1) {
      await undo(editor);
      const next = documentShape(editor);
      if (next === shape) break; // stack exhausted
      waypoints.push(next);
      shape = next;
    }

    // Four user edits reached the settled span, and the stack holds exactly those four: the
    // backslash retype, the backslash deletion, the typed space that terminated the marker
    // (Lexical's typing coalescence breaks at the Tier-2 rebuild it triggers), and the typed
    // `\nd` before it. The two settles those edits provoked add no entries of their own —
    // pre-ruling there were six.
    expect(waypoints.length).toBe(4);
    expect(waypoints[waypoints.length - 1]).toBe(pristine);
  });

  it("the host's forced pre-save settle is not an undo entry either", async () => {
    // `commitPendingMarkerEdits()` fires on the host's debounced save timer, not on anything the
    // user did. If it kept its own entry, a background timer would silently eat the user's next
    // Ctrl+Z. It runs the same resolve through the same `$settleWithoutOwnUndoEntry` wrapper the
    // two clocks and the blur handler use, so one press still lands on the pre-edit content.
    const { editor } = await historyTestEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("nd Lord"),
        ),
      );
    });
    const pristine = documentShape(editor);

    // Offset 1 is just past the paragraph prefix's separator — content start.
    await caretAt(editor, "nd Lord", 1);
    await type(editor, "\\");
    expectLiteralBackslashText(editor);

    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    await flushSettle();
    expectSettledCharSpan(editor);

    await undo(editor);
    expect(documentShape(editor)).toBe(pristine);
  });

  it("redo stays coherent: it replays the user's edit and its settle together", async () => {
    const { editor, beforeRetype } = await retypedBackslashEnvironment();
    const settled = documentShape(editor);

    await undo(editor);
    expect(documentShape(editor)).toBe(beforeRetype);

    // One redo must return the whole gesture — keystroke and settle — not just the keystroke.
    await redo(editor);
    expect(documentShape(editor)).toBe(settled);
    expectSettledCharSpan(editor);

    // And the stacks still round-trip after that.
    await undo(editor);
    expect(documentShape(editor)).toBe(beforeRetype);
    await redo(editor);
    expect(documentShape(editor)).toBe(settled);
  });
});
