/**
 * Composed-plugin tests (batch item 6 + Task 9b): MarkerEditPlugin mounted TOGETHER with
 * other production plugins, as in the real editor.
 *
 * With TextSpacingPlugin: it removes lone space-only TextNodes that don't precede a
 * verse — so it could, in principle, eat the plain-space separator MarkerEditPlugin's
 * Ctrl+Space inserts between the two split spans. It does NOT: that transform returns
 * early when the next sibling is a CharNode, and $displayWhitespaceTransform only maps
 * spaces adjacent to other spaces/NBSP within one node, so a lone separator preceding a
 * styled span is left untouched. The composed at-rest truth is therefore: two styled
 * spans with a surviving plain-space separator between them, honoring PT9's
 * caret-lands-unstyled guarantee.
 *
 * With OnSelectionChangePlugin (Task 9b regression): its SELECTION_CHANGE handler calls
 * `editor.read()`, which force-flushes `$commitPendingUpdates` MID-dispatch — the
 * in-flight update's pending editor state becomes the committed (dev-frozen) state while
 * the dispatch is still on the stack. Any marker-resolution mutation triggered from that
 * context (pre-fix: MarkerEditPlugin's update listener synchronously self-dispatching
 * SELECTION_CHANGE_COMMAND) then writes into a frozen selection/node map and throws
 * (`Cannot assign to read only property '_cachedNodes'` / `Cannot call set() on a frozen
 * Lexical node map`) — Task 9 browser-QA bugs A and B.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $appendCharPara } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setState,
  KEY_DOWN_COMMAND,
  SELECTION_CHANGE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  MarkerNode,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  getViewOptions,
  OnSelectionChangePlugin,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
} from "shared-react";

/** Mounts MarkerEditPlugin AND TextSpacingPlugin in Standard view (editable markers). */
async function composedEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <TextSpacingPlugin />
    </>,
  );
}

/** The char span's plain (non-marker) content text node. */
function $charContent(char: CharNode): TextNode {
  const node = char
    .getChildren()
    .filter($isTextNode)
    .find((n) => !$isMarkerNode(n));
  if (!node) throw new Error("char span has no content text node");
  return node;
}

describe("MarkerEditPlugin + TextSpacingPlugin composed", () => {
  it("Ctrl+Space mid-span keeps two spans and the plain-space separator survives", async () => {
    let char: CharNode;
    const { editor } = await composedEnvironment(() => (char = $appendCharPara().char));
    // caret between "Lo" and "rd" (content text is NBSP + "Lord")
    await act(async () => editor.update(() => $charContent(char).select(3, 3)));
    await act(async () => {
      editor.dispatchCommand(
        KEY_DOWN_COMMAND,
        new KeyboardEvent("keydown", { key: " ", ctrlKey: true }),
      );
    });
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const chars = para.getChildren().filter($isCharNode);
      expect(chars).toHaveLength(2); // split into two styled spans
      const between = chars[0].getNextSibling();
      // The separator survived TextSpacingPlugin (it precedes a CharNode) as a lone plain space.
      expect($isTextNode(between) && !$isMarkerNode(between)).toBe(true);
      expect(between?.getTextContent()).toBe(" ");
      expect(between?.is(chars[1].getPreviousSibling())).toBe(true);
      // Caret rests in the plain separator, not inside either styled span (PT9 parity).
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if ($isRangeSelection(selection)) expect(selection.anchor.getNode().is(between)).toBe(true);
    });
  });
});

/**
 * Mounts MarkerEditPlugin AND OnSelectionChangePlugin in production order
 * (OnSelectionChangePlugin registers its SELECTION_CHANGE handler first, as in Editor.tsx).
 */
async function selectionComposedEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <OnSelectionChangePlugin onChange={() => undefined} />
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
    </>,
  );
}

/** Two paragraphs, each `[marker, trailing NBSP, content text]`; returns key parts. */
function $twoParasWithMarkers(): {
  pPara: ParaNode;
  pMarker: MarkerNode;
  pText: TextNode;
  qText: TextNode;
} {
  const pPara = $createParaNode("q2");
  const pMarker = $createMarkerNode("q2");
  const pTrailing = $createTextNode(NBSP);
  $setState(pTrailing, textTypeState, "marker-trailing-space");
  const pText = $createTextNode("body text");
  const qTrailing = $createTextNode(NBSP);
  $setState(qTrailing, textTypeState, "marker-trailing-space");
  const qText = $createTextNode("second");
  $getRoot().append(
    pPara.append(pMarker, pTrailing, pText),
    $createParaNode("p").append($createMarkerNode("p"), qTrailing, qText),
  );
  return { pPara, pMarker, pText, qText };
}

describe("MarkerEditPlugin + OnSelectionChangePlugin composed (frozen-commit regression)", () => {
  it("resolves a paragraph opener rename on caret departure (bug A: frozen _cachedNodes)", async () => {
    let parts: ReturnType<typeof $twoParasWithMarkers>;
    const { editor } = await selectionComposedEnvironment(() => (parts = $twoParasWithMarkers()));

    // Rename the opener glyph in place; the caret stays inside it, so it only pends.
    await act(async () =>
      editor.update(() => {
        parts.pMarker.setTextContent("\\s2");
        parts.pMarker.select(3, 3);
      }),
    );
    editor.getEditorState().read(() => expect(parts.pPara.getMarker()).toBe("q2")); // pending

    // Depart the way the browser does: ONE update moves the caret AND dispatches
    // SELECTION_CHANGE within it (the shape of Lexical's own native-selectionchange
    // handling). OnSelectionChangePlugin's handler calls editor.read(), force-committing
    // the in-flight update mid-dispatch; pre-fix the resolution then ran against the
    // frozen committed state and threw instead of renaming.
    await act(async () =>
      editor.update(() => {
        parts.qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );

    editor.getEditorState().read(() => {
      expect(parts.pPara.getMarker()).toBe("s2"); // rename applied (paragraph restyles)
      expect(parts.pMarker.getTextContent()).toBe("\\s2"); // glyph canonical
    });
  });

  it("re-tokenizes pending literal marker text on caret departure (bug B: frozen node map)", async () => {
    let parts: ReturnType<typeof $twoParasWithMarkers>;
    const { editor } = await selectionComposedEnvironment(() => (parts = $twoParasWithMarkers()));

    // An unterminated unknown marker in body text; caret stays inside it, so it only
    // pends. Departure routes it to $rebuildParas, whose $parseSerializedNode creates
    // nodes — pre-fix into the frozen committed node map ("Cannot call set() ...").
    await act(async () =>
      editor.update(() => {
        parts.pText.setTextContent("body \\zz");
        parts.pText.select(parts.pText.getTextContentSize(), parts.pText.getTextContentSize());
      }),
    );

    await act(async () =>
      editor.update(() => {
        parts.qText.select(0, 0);
        editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
      }),
    );

    editor.getEditorState().read(() => {
      // "zz" resolves structurally (PT9 DetermineUnknownTokenType): a real paragraph split.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "zz")).toBe(true);
    });
  });
});
