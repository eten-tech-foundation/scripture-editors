/**
 * The reported log storms, as a commit bound.
 *
 * Five reports said typing certain byte patterns made the host log
 * `useEditorPdpSync: deferring an incoming PDP update…` endlessly. That host log fires once per
 * PDP update that disagrees with the editor while the editor is focused, so an endless run of them
 * needs an endless run of PDP updates — and those come from the editor saving. Endless saves mean
 * endless COMMITS. The log volume is the symptom; a commit cycle is the disease, and it is
 * measurable here without the host.
 *
 * Two other candidate causes were checked first and ruled out:
 *
 * - A non-idempotent `usj -> usx -> usj` round-trip, which the host's own damping comment names as
 *   the shape that sustains the loop. Every reported pattern was run through both converters twice:
 *   all reach a fixed point, and the only diffs are USJ key ORDER (`content` before `closed`), which
 *   the host compares structurally, not as text. Whatever ParatextData does to the USX between those
 *   two legs is not visible from this repo — that half stays a manual check.
 * - Unbounded logging in the deferral path itself. It is already bounded: one `logger.warn` at the
 *   non-convergence threshold, `logger.debug` otherwise.
 *
 * So these assert a COMMIT BOUND per gesture, never "eventually quiesces" — a test that hangs is
 * not a useful failure, and `withCommitBound` turns a regressed cascade into an assertion failure
 * by dropping the engine's deferred settles once the count has already proven the loop. The
 * collected warnings must stay empty too: the settle-cascade backstop trips BELOW the commit bound,
 * so a regression only that backstop caught would otherwise pass looking healthy.
 */

import {
  COMMIT_BOUND,
  requireDefined,
  testEnvironmentWithDisplaySyncs,
  withCommitBound,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_ENTER_COMMAND,
  TextNode,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isMarkerNode,
  $isParaNode,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

function $trailingSpace(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

/** A `\p` paragraph holding `body`, plus a second `\p` paragraph to depart the caret to. */
function $twoParagraphs(body: string): { bodyText: TextNode; otherText: TextNode } {
  const bodyText = $createTextNode(body);
  const otherText = $createTextNode("second");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), bodyText),
    $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), otherText),
  );
  return { bodyText, otherText };
}

/** The paragraph the caret departs TO — re-queried, since rebuilds detach references. */
function $departureTarget(): TextNode {
  const paragraphs = $getRoot().getChildren().filter($isParaNode);
  const last = paragraphs[paragraphs.length - 1];
  const text = last.getChildren().find((child) => $isTextNode(child) && !$isMarkerNode(child));
  return requireDefined($isTextNode(text) ? text : undefined, "departure target missing");
}

describe("reported log-storm gestures commit a bounded number of times", () => {
  /**
   * Run `$seed`, then `gesture`, then depart the caret, all under the commit bound. The departure
   * is what settles whatever pended, so it is where a cascade would run away.
   */
  async function expectBounded(
    $seed: () => void,
    gesture: (editor: EditorHandle) => Promise<void>,
  ) {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($seed, logger);
      watch(editor);
      await gesture(editor);
      await act(async () => editor.update(() => $departureTarget().select(0, 0)));
      // Let the deferred settle (and anything it cascades into) run.
      await act(async () => {
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
        await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }

  /** Type `characters` one keystroke at a time at the caret. */
  async function type(editor: EditorHandle, characters: string) {
    for (const character of characters) {
      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText(character);
        }),
      );
    }
  }

  /** Put the caret at the end of the first paragraph's body text. */
  async function caretAtBodyEnd(editor: EditorHandle, bodyText: TextNode) {
    await act(async () =>
      editor.update(() =>
        bodyText.select(bodyText.getTextContentSize(), bodyText.getTextContentSize()),
      ),
    );
  }

  it("S4: a backslash followed by a bar", async () => {
    let bodyText!: TextNode;
    await expectBounded(
      () => ({ bodyText } = $twoParagraphs("body")),
      async (editor) => {
        await caretAtBodyEnd(editor, bodyText);
        await type(editor, " \\|");
      },
    );
  });

  it("S5: a double slash (optbreak)", async () => {
    let bodyText!: TextNode;
    await expectBounded(
      () => ({ bodyText } = $twoParagraphs("body")),
      async (editor) => {
        await caretAtBodyEnd(editor, bodyText);
        await type(editor, " //");
      },
    );
  });

  it("S6: Enter, then a \\p, then typing", async () => {
    let bodyText!: TextNode;
    await expectBounded(
      () => ({ bodyText } = $twoParagraphs("body")),
      async (editor) => {
        await caretAtBodyEnd(editor, bodyText);
        await act(async () => {
          editor.dispatchCommand(KEY_ENTER_COMMAND, null);
        });
        await type(editor, "\\p more");
      },
    );
  });

  it("S7: an unsupported (grayed-out) marker", async () => {
    // `asdf` is unknown to the stylesheet — the class the report calls "grayed out".
    let bodyText!: TextNode;
    await expectBounded(
      () => ({ bodyText } = $twoParagraphs("body")),
      async (editor) => {
        await caretAtBodyEnd(editor, bodyText);
        await type(editor, " \\asdf more");
      },
    );
  });

  it("A6: \\vp typed right after a verse marker", async () => {
    let bodyText!: TextNode;
    await expectBounded(
      () => {
        const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        bodyText = $createTextNode("body");
        const otherText = $createTextNode("second");
        $getRoot().append(
          $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), verse, bodyText),
          $createParaNode("p").append($createMarkerNode("p"), $trailingSpace(), otherText),
        );
      },
      async (editor) => {
        // Caret at the very START of the body text — immediately after the verse marker.
        await act(async () => editor.update(() => bodyText.select(0, 0)));
        await type(editor, "\\vp 1a");
      },
    );
  });

  it("S8: deleting the closer of an inline marker that has content after it", async () => {
    let closer!: TextNode;
    await expectBounded(
      () => {
        const nd = $createCharNode("nd");
        closer = $createMarkerNode("nd", "closing");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p"),
            $trailingSpace(),
            nd.append($createMarkerNode("nd"), $createTextNode(`${NBSP}text`), closer),
            $createTextNode(" tail"),
          ),
          $createParaNode("p").append(
            $createMarkerNode("p"),
            $trailingSpace(),
            $createTextNode("second"),
          ),
        );
      },
      async (editor) => {
        // Delete the closing glyph with the caret left where it was — the user's Backspace.
        await act(async () =>
          editor.update(() => {
            const previous = closer.getPreviousSibling();
            closer.remove();
            if ($isTextNode(previous))
              previous.select(previous.getTextContentSize(), previous.getTextContentSize());
          }),
        );
      },
    );
  });
});

type EditorHandle = Awaited<ReturnType<typeof testEnvironmentWithDisplaySyncs>>["editor"];
