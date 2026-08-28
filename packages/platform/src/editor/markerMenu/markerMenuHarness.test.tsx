/**
 * Editable-mode marker-menu harness — `UsjNodesMenuPlugin`'s editable-mode branch (the document-first `\`/
 * Enter marker menu), wired the same way `Editor.tsx` wires it in markerMode "editable":
 * `EditorRef`-equivalent methods (`$getMarkerMenuContext` / `$applyMarkerMenuSelection` /
 * `$splitParagraphWithMarker`) plus the module-level marker-item source
 * (`getMarkerMenuItems`/`getEnterMenuItems`), `defaultStyleInfo`-backed. Platform-level
 * on purpose: this composition only makes sense assembled from the platform's real
 * marker-menu machinery, not a stub.
 *
 * jsdom has no `Range.prototype.getBoundingClientRect` (confirmed against this repo's own
 * `markerMenuContext.utils.test.tsx`, which asserts `anchorRect` is `undefined` for exactly
 * this reason) - `@floating-ui/dom`'s `computePosition` rejects without it, so
 * `FloatingBoxAtCursor` never resolves coords and the menu never mounts. The harness reuses
 * that exact component (rather than rebuilding `NodeSelectionMenu`), so a scoped polyfill below
 * is what makes the menu observable at all in this environment.
 */
import {
  getEnterMenuItems,
  getMarkerMenuItems,
  MarkerMenuContext,
  MarkerMenuItem,
} from "./markerItemSource";
import {
  $applyMarkerMenuSelection,
  $commitTypedCloser,
  $splitParagraphWithMarker,
} from "./markerMenuApply.utils";
import { $getMarkerMenuContext } from "./markerMenuContext.utils";
import {
  $noteContentText,
  findOnlyNote,
  noteUsx,
  requireDefined,
  serializedState,
  viewOptions,
} from "../markerEdit/markerEdit.test-helpers";
import { MarkerEditPlugin } from "../markerEdit/MarkerEditPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { InitialEditorStateType } from "@lexical/react/LexicalComposer";
import { act, screen, waitFor } from "@testing-library/react";
import {
  $createRangeSelection,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  $setState,
  ElementNode,
  INSERT_PARAGRAPH_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import { useEffect } from "react";
import {
  $createChapterNode,
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  defaultStyleInfo,
  getVisibleOpenMarkerText,
  NBSP,
  ParaNode,
  textTypeState,
} from "shared";
import { EditableMarkerMenuHarness, UsjNodesMenuPlugin } from "shared-react";
// Reaching inside only for tests - the same deep import `markerEdit.test-helpers.tsx` uses.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom (this repo's version) has no `Range.prototype.getBoundingClientRect` - polyfilled here,
// scoped to this file only, so `@floating-ui/dom`'s `computePosition` can resolve and the
// (reused, unmodified) `FloatingBoxAtCursor`/`NodeSelectionMenu` pipeline actually mounts.
const zeroRect: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};
const originalRangeGetBoundingClientRect = Range.prototype.getBoundingClientRect;
beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => zeroRect;
});
afterAll(() => {
  Range.prototype.getBoundingClientRect = originalRangeGetBoundingClientRect;
});

const reference = { book: "GEN", chapterNum: 1, verseNum: 1 };

function getMarkerAction() {
  return { action: () => undefined, label: undefined };
}

/** Grabs the mounted editor into `onReady` - needed because the harness closures below must
 * exist (as a prop value) before the editor itself does; mirrors `baseTestEnvironment`'s own
 * internal `GrabEditor`. */
function CaptureEditor({ onReady }: { onReady: (editor: LexicalEditor) => void }): null {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    onReady(editor);
  }, [editor, onReady]);
  return null;
}

/** Builds the same `editableHarness` shape `Editor.tsx` wires up for markerMode "editable" -
 * the platform's own `$`-prefixed pieces called directly (there's no `EditorRef` object in
 * this headless test) plus the module-level marker-item source. */
function buildHarness(getEditor: () => LexicalEditor | undefined): EditableMarkerMenuHarness {
  const expandedNoteKeyRef: { current: string | undefined } = { current: undefined };
  return {
    getContext: () =>
      getEditor()
        ?.getEditorState()
        .read(() => $getMarkerMenuContext()),
    getItems: (context) => getMarkerMenuItems(defaultStyleInfo, context as MarkerMenuContext),
    getEnterItems: (context) => getEnterMenuItems(defaultStyleInfo, context as MarkerMenuContext),
    apply: (item, opts) => {
      const editor = getEditor();
      if (!editor) return;
      editor.update(() => {
        if (opts.trigger === "enter") $splitParagraphWithMarker(item.marker);
        else
          $applyMarkerMenuSelection(item as MarkerMenuItem, opts, reference, {
            expandedNoteKeyRef,
            viewOptions,
            nodeOptions: {},
          });
      });
    },
    commitTypedCloser: (typedMarker) => {
      getEditor()?.update(() => {
        $commitTypedCloser(typedMarker);
      });
    },
  };
}

/** Mounts `MarkerEditPlugin` + the editable-mode harness together - the harness composition is
 * platform-level (brief), so this is the platform-side equivalent of `Editor.tsx`'s own mount. */
async function harnessTestEnvironment($initialEditorState: InitialEditorStateType) {
  let editor: LexicalEditor | undefined;
  const harness = buildHarness(() => editor);
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <CaptureEditor onReady={(mounted) => (editor = mounted)} />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <UsjNodesMenuPlugin
        trigger={"\\"}
        scrRef={reference}
        contextMarker={undefined}
        getMarkerAction={getMarkerAction}
        editableHarness={harness}
      />
    </>,
  );
}

/** Dispatches a real `KEY_DOWN_COMMAND` keydown for `key`, returning the event so callers can
 * inspect `.defaultPrevented` - like `react-test.utils`'s own `pressKey`, but returns the event
 * instead of discarding it. */
async function dispatchKeyDown(editor: LexicalEditor, key: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    editor.dispatchCommand(KEY_DOWN_COMMAND, event);
  });
  return event;
}

/** Dispatches `KEY_ENTER_COMMAND` with a real KeyboardEvent — the user's Enter keystroke. The
 * event must be non-null: the menu opens only for the user's own keystroke, and a null payload
 * is the programmatic-dispatch shape it deliberately declines. */
async function pressEnterCommand(editor: LexicalEditor): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, event);
  });
  return event;
}

function countParagraphs(root: ElementNode): number {
  return root.getChildren().filter($isParaNode).length;
}

async function waitForMenu(): Promise<HTMLElement[]> {
  await waitFor(() => expect(screen.getAllByRole("menuitem").length).toBeGreaterThan(0));
  return screen.getAllByRole("menuitem");
}

function menuItemLabel(menuitem: HTMLElement): string | undefined {
  return menuitem.querySelector(".label")?.textContent ?? undefined;
}

/** A paragraph's visible marker prefix's trailing NBSP separator, tagged so Lexical's TextNode
 * normalization won't merge it into the adjacent plain content TextNode (an untagged content
 * node's `NodeState` would otherwise be indistinguishable from this one's, and stock Lexical
 * merges adjacent same-state plain TextNodes - losing the content node's identity/key). */
function $createTrailingSpaceNode(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

/** A `\p` paragraph with plain text, caret to be placed collapsed at the END of `text` (i.e.
 * NOT paragraph-content-start → character source; nothing follows the caret, so a literal
 * trigger character typed there stays unterminated - `MarkerEditPlugin`'s Tier 2 leaves an
 * unterminated backslash sequence alone, exactly like a real user mid-keystroke). */
function $buildBackslashMenuFixture(): { text: TextNode } {
  const text = $createTextNode("hello");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), $createTrailingSpaceNode(), text),
  );
  return { text };
}

/** A `\p` paragraph whose plain text holds a word to select (`say |holy| words`), so the `\`
 * trigger arrives with a NON-collapsed selection - the wrap case, where nothing lands in the
 * document and the palette's typed filter is the only record of what the user typed. */
function $buildWrapMenuFixture(): { text: TextNode } {
  const text = $createTextNode("say holy words");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), $createTrailingSpaceNode(), text),
  );
  return { text };
}

/**
 * A `\p` paragraph with text on BOTH sides of the caret. Every other `\`-palette fixture here
 * places the caret at the very end of the document, where nothing follows it — which is exactly
 * the position in which a materialized literal has no tail to absorb, and therefore the position
 * in which the note-marker hazard cannot show itself.
 */
function $buildMidTextBackslashFixture(): { text: TextNode } {
  const text = $createTextNode("hello world and more");
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), $createTrailingSpaceNode(), text),
  );
  return { text };
}

/** `[c, p]` then a second `\p` paragraph whose caret triggers Enter - `previousParaMarkers`
 * for the caret's own paragraph is `["c", "p"]`, the exact fixture `getEnterMenuItems`'s own
 * unit test (`markerItemSource.test.ts`) confirms picks `p` over `ip` as the SmartEnter choice. */
function $buildEnterMenuFixture(): { caretText: TextNode } {
  const chapter = $createChapterNode("1");
  const caretText = $createTextNode("second para text");
  $getRoot().append(
    chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTrailingSpaceNode(),
      $createTextNode("first para text"),
    ),
    $createParaNode("p").append($createMarkerNode("p"), $createTrailingSpaceNode(), caretText),
  );
  return { caretText };
}

describe("editable-mode marker menu harness", () => {
  describe("`\\` trigger", () => {
    it("preventDefaults for a collapsed selection too - the active palette's trigger never lands - and opens the menu", async () => {
      // ACTIVE palette (owner-directed): the trigger byte must not reach the document in ANY
      // selection shape. This inverts the old passive pin ("the literal `\` lands as text"),
      // which described the retired passive palette.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      const event = await dispatchKeyDown(editor, "\\");
      expect(event.defaultPrevented).toBe(true);

      const menuItems = await waitForMenu();
      expect(menuItems.length).toBeGreaterThan(0);

      editor.getEditorState().read(() => {
        // The caret's own text node is byte-identical - no trigger literal landed. (The
        // paragraph's visible `\p` prefix glyph legitimately contains a backslash, so the
        // assertion targets the content node, not the whole tree's text.)
        expect(requireDefined(text, "text").getTextContent()).toBe("hello");
      });
    });

    it("preventDefaults for a non-collapsed selection (wrap case - no literal trigger text)", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(0, 5)));

      const event = await dispatchKeyDown(editor, "\\");
      expect(event.defaultPrevented).toBe(true);
      await waitForMenu();
    });

    it("Escape closes the menu leaving the document unchanged - nothing typed ever landed", async () => {
      // Under the ACTIVE palette no literal lands in the document in the first place, so
      // Escape's contract here is "document untouched" — not the passive palette's "the typed
      // literal stays".
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");

      await dispatchKeyDown(editor, "Escape");

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        expect(requireDefined(text, "text").getTextContent()).toBe("hello");
      });
    });

    it("selecting a menu item inserts it structurally - no literal trigger prefix ever lands to clean up", async () => {
      // Under the active palette the Enter commit is the SAME apply the passive palette made,
      // minus the literal-prefix cleanup: nothing landed, so the apply arrives with
      // `literalPrefixLanded: false` and the end state is byte-identical to the old
      // "landed-then-removed" flow.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      const menuItems = await waitForMenu();

      const chosenMarker = requireDefined(menuItemLabel(menuItems[0]), "menu item label");
      const textKey = requireDefined(text, "text").getKey();

      await dispatchKeyDown(editor, "Enter"); // selects the active (first) item

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        // Checked on the ORIGINAL "hello" TextNode specifically (not the whole document's
        // concatenated text) - the chosen item may itself be a note whose OWN visible marker
        // glyphs (e.g. "\f ... \f*") legitimately contain backslashes immediately adjacent to
        // "hello" in the flattened text, which a blanket substring check can't tell apart from
        // a stray literal trigger prefix.
        const helloNode = requireDefined(
          $getNodeByKey(textKey) ?? undefined,
          'original "hello" text node',
        );
        expect(helloNode.getTextContent()).toBe("hello");
      });
      const json = JSON.stringify(editor.getEditorState().toJSON());
      expect(json).toContain(`"marker":"${chosenMarker}"`);
    });
  });

  describe("Space over a non-collapsed selection", () => {
    it("wraps the selection in the typed marker's closed span and closes the menu", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      const filtered = await waitForMenu();
      expect(menuItemLabel(filtered[0])).toBe("nd");

      await dispatchKeyDown(editor, " ");

      // The CONTAINER, not just the menuitems: a Space swallowed into the filter query also
      // renders zero menuitems while leaving the overlay itself mounted (the orphan shape).
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("nd");
        expect(chars[0].getTextContent()).toContain("holy");
        // Closed span: opener AND closer glyphs, the same shape the Enter commit produces.
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(2);
        // Nothing deleted around the wrapped word.
        expect(para.getTextContent()).toContain("say");
        expect(para.getTextContent()).toContain("words");
      });
    });

    it("refuses visibly when the typed marker is not offered - selection intact, palette gone", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "z");
      await dispatchKeyDown(editor, "z");

      const event = await dispatchKeyDown(editor, " ");

      // Prevented: with a selection live, an un-prevented space would REPLACE the selected word.
      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        // Nothing wrapped, nothing typed into the document, selection's text untouched.
        expect(para.getChildren().filter($isCharNode)).toHaveLength(0);
        expect(para.getTextContent()).toContain("say holy words");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection after the refusal");
        expect(selection.isCollapsed()).toBe(false);
        expect(selection.getTextContent()).toBe("holy");
      });
    });
  });

  describe("selection-wrap matrix - typed vs highlighted", () => {
    it("refuses a NEAR-MISS prefix - `n` does not wrap in `nd`, the exact match is the full code", async () => {
      // The other half of the refusal contract: not just unknown markers, but a typed prefix of
      // a marker that IS offered. Space commits what was TYPED, and `n` was not offered, so
      // wrapping in `nd` would be the palette guessing on the user's behalf.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      // `nd` is offered and ranked first, so the highlighted item WOULD commit under Enter.
      const filtered = await waitForMenu();
      expect(menuItemLabel(filtered[0])).toBe("nd");

      const event = await dispatchKeyDown(editor, " ");

      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        expect(para.getChildren().filter($isCharNode)).toHaveLength(0);
        expect(para.getTextContent()).toContain("say holy words");
      });
    });

    it("Enter over a selection wraps in the HIGHLIGHTED item - the other half of the matrix", async () => {
      // Space commits what was TYPED (exact only); Enter commits what is HIGHLIGHTED, and so
      // still commits where Space refuses. Pinning both against one near-miss query is what
      // makes the distinction unambiguous.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      const filtered = await waitForMenu();
      const highlighted = menuItemLabel(filtered[0]);
      expect(highlighted).toBe("nd");

      await dispatchKeyDown(editor, "Enter");

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe(highlighted);
        expect(chars[0].getTextContent()).toContain("holy");
        // Closed span, same shape the exact-match Space wrap produces.
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(2);
      });
    });
  });

  describe("commit with zero candidates", () => {
    // P9 parity (owner-directed, revising the earlier zero-candidate dismiss): Enter over a
    // zero-match palette does NOTHING - the palette stays open so the user can Backspace the
    // filter wider, Space-commit the typed marker, or Escape out. Only Escape (or a real
    // commit) tears the overlay down.
    it("Enter is a no-op - the palette stays open, document unchanged, and Escape still closes it", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      // Filter down to nothing: no offered marker contains "qqqq".
      for (const key of "qqqq") await dispatchKeyDown(editor, key);
      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      expect(document.querySelector(".autocomplete-menu-container")).not.toBeNull();

      const enterEvent = await dispatchKeyDown(editor, "Enter");

      // Stays open over the empty list; the claimed Enter must not fall through to the editor
      // (an unclaimed Enter would split the paragraph under the open palette).
      expect(enterEvent.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).not.toBeNull();
      editor.getEditorState().read(() => {
        expect(requireDefined(text, "text").getTextContent()).toBe("hello");
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no range selection after the no-op");
        expect(selection.isCollapsed()).toBe(true);
      });

      // The way out is still there: Escape closes, document untouched.
      await dispatchKeyDown(editor, "Escape");
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        expect(requireDefined(text, "text").getTextContent()).toBe("hello");
      });
    });

    it("Enter menu: zero-match Enter stays open and still splits nothing; Escape cancels outright", async () => {
      let caretText: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        caretText = $buildEnterMenuFixture().caretText;
      });
      await act(async () =>
        editor.update(() => requireDefined(caretText, "caretText").select(6, 6)),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);
      await waitForMenu();
      for (const key of "qqqq") await dispatchKeyDown(editor, key);

      await dispatchKeyDown(editor, "Enter");

      // Same P9 no-op as the `\` palette: the menu stays open over the empty list and the
      // suppressed split stays suppressed.
      expect(document.querySelector(".autocomplete-menu-container")).not.toBeNull();
      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore);
      });

      await dispatchKeyDown(editor, "Escape");

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        // The Enter trigger suppressed the split when it opened the menu; Escape cancels
        // outright - it never happened.
        expect(countParagraphs($getRoot())).toBe(parasBefore);
      });
    });
  });

  describe("`\\` commits the typed marker and reopens the palette", () => {
    // Owner-directed. `\` is a THIRD commit key: it commits what was typed exactly as Space does,
    // but emits no terminating space byte, and then opens a fresh palette for the backslash the
    // user just pressed — so `\qt-s\qt-e` can be typed as one flow. With an EMPTY filter there is
    // nothing to commit, so `\` keeps its old meaning: a literal backslash lands and no new
    // palette opens.
    it("commits the typed marker with NO trailing space and opens a fresh palette", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      const event = await dispatchKeyDown(editor, "\\");

      // Claimed: the trigger never lands under the active palette, this one included.
      expect(event.defaultPrevented).toBe(true);
      // A FRESH palette is open for the backslash just pressed.
      await waitForMenu();
      expect(document.querySelector(".autocomplete-menu-container")).not.toBeNull();

      // The bytes land immediately; with no terminating separator they settle on the engine's
      // DEFERRED clock rather than inside the commit update (invariant IV — settle has two
      // clocks), so the end state is awaited rather than read synchronously.
      await waitFor(() =>
        editor.getEditorState().read(() => {
          const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
          const chars = para.getChildren().filter($isCharNode);
          expect(chars).toHaveLength(1);
          expect(chars[0].getMarker()).toBe("nd");
          // Same passive-Space end state: open span, one glyph, no auto-closer.
          expect(chars[0].getUnknownAttributes()?.closed).toBe("false");
          expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(1);
          // No terminating space byte — that is the whole difference from Space.
          expect(para.getTextContent()).not.toContain("\\nd ");
        }),
      );
    });

    it("the reopened palette commits normally, giving two markers from one flow", async () => {
      // The owner's `\qt-s\qt-e` gesture, run with markers this fixture's sheet actually offers:
      // the second session must rank, filter and commit exactly like a first one.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "w");
      await dispatchKeyDown(editor, "j");
      await dispatchKeyDown(editor, " ");

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const markers = para
          .getChildren()
          .filter($isCharNode)
          .map((char) => char.getMarker());
        expect(markers).toContain("nd");
        expect(markers).toContain("wj");
      });
    });

    it("with an EMPTY filter, `\\` lands a literal backslash and does NOT reopen", async () => {
      // Today's behavior, which the owner explicitly wants preserved: `\` then `\` types a
      // backslash. There is nothing typed to commit, so the second one is just a character.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "\\");

      // No new palette, and the backslash reached the document as an ordinary character.
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        expect(para.getChildren().filter($isCharNode)).toHaveLength(0);
        const plainText = para
          .getAllTextNodes()
          .filter((node) => !$isMarkerNode(node))
          .map((node) => node.getTextContent())
          .join("");
        expect(plainText).toContain("\\");
      });
    });
  });

  describe("Space over a collapsed caret", () => {
    // The active palette's Space commit: the typed query is materialized as the SAME literal
    // bytes the passive palette would have accumulated in the document (`\` + typed + space),
    // in one update, and Tier 2 resolves them exactly as it resolved passive typing - so the
    // Space end states (closed="false" span, unknown-settles-as-typed, `\f` commits like
    // Enter) hold byte-for-byte without the palette re-implementing any of them.
    it('commits the typed marker as an open span (closed="false") and closes the palette', async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");

      const event = await dispatchKeyDown(editor, " ");

      // Prevented: nothing may land beyond the materialized literal - an un-prevented space
      // would ALSO insert a real browser space after it (a double space).
      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("nd");
        // Passive-Space semantics: NO closing marker - the span records closed="false" and
        // carries only the opening glyph.
        expect(chars[0].getUnknownAttributes()?.closed).toBe("false");
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(1);
        // The pre-existing content stays put; no literal backslash text remains anywhere in
        // the paragraph's PLAIN text nodes (glyphs legitimately carry them).
        expect(para.getTextContent()).toContain("hello");
      });
    });

    it("`\\f` + Space commits like Enter - the tokenizer materializes the full note", async () => {
      // Emergent from the fragment tokenizer, not a palette branch: a space-terminated `\f `
      // tokenizes to a complete note with the default `+` caller - the same structure the
      // Enter commit produces. Pinned through the ACTIVE flow so the emergence survives it.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "f");

      await dispatchKeyDown(editor, " ");

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        expect(note.getMarker()).toBe("f");
      });
    });

    /**
     * Mid-text, where the materialized literal has a paragraph tail to eat.
     *
     * A note is a CONTAINER: `\f ` opens one and, being unterminated, it runs to the end of the
     * paragraph. The tokenizer's leading-attribute rule then takes the first word after it as the
     * note's CALLER and the rest becomes the note's content, so a `\f ` typed mid-sentence takes
     * the whole rest of the sentence off the page and into a collapsed note. At the end of a
     * paragraph — where every other fixture in this file puts the caret — there is no tail, so the
     * literal produces an empty note — the same thing the item commit produces — and the
     * hazard is invisible.
     *
     * The literal path itself is the tokenizer's and stays exactly as it is (a fixed point); what
     * changes is that the palette stops ROUTING note markers through it, which is what the host's
     * own palette already does.
     */
    it("the raw `\\f ` literal mid-text pulls the paragraph tail into the note", async () => {
      // Evidence, not a regression pin: this is the tokenizer behavior the palette rule exists to
      // route around, and it must keep working exactly like this for anyone who types the bytes.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildMidTextBackslashFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(6, 6)));

      await act(async () =>
        editor.update(() => {
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("\\f ");
        }),
      );

      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        expect(note.getMarker()).toBe("f");
        // The word after the caret became the note's caller, and the rest of the sentence its
        // content: nothing of the tail is left in the paragraph.
        expect(note.getTextContent()).toContain("and more");
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const outsideTheNote = para
          .getChildren()
          .filter((child) => !$isNoteNode(child))
          .map((child) => child.getTextContent())
          .join("");
        expect(outsideTheNote).not.toContain("and more");
      });
    });

    it("`\\f` + Space mid-text leaves the paragraph tail alone", async () => {
      // The palette routes a NOTE marker through the item commit — the same commit Enter uses —
      // rather than materializing the literal, so the note arrives empty and the sentence the user
      // was in the middle of writing stays where they wrote it.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildMidTextBackslashFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(6, 6)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "f");

      const event = await dispatchKeyDown(editor, " ");

      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        expect(note.getMarker()).toBe("f");
        // The tail is still the paragraph's, outside the note.
        expect(note.getTextContent()).not.toContain("and more");
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const outsideTheNote = para
          .getChildren()
          .filter((child) => !$isNoteNode(child))
          .map((child) => child.getTextContent())
          .join("");
        expect(outsideTheNote).toContain("world and more");
      });
    });

    it("at the end of a paragraph the reroute leaves the end state unchanged", async () => {
      // The reroute must not change what `\f` + Space produces — it must make that outcome true
      // in more positions. At the end of a paragraph the literal and the item commit produced
      // the same thing all along (an empty note with the default `+` caller), and they still do.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "f");

      await dispatchKeyDown(editor, " ");

      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        expect(note.getMarker()).toBe("f");
        expect(note.getCaller()).toBe("+");
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        expect(para.getTextContent()).toContain("hello");
      });
    });

    it("`\\nd` + Space mid-text still materializes the literal — only NOTES are rerouted", async () => {
      // The control: a character marker's Space commit is unchanged, still an open span
      // (closed="false") produced by the literal, tail and all.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildMidTextBackslashFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(6, 6)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");

      await dispatchKeyDown(editor, " ");

      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("nd");
        expect(chars[0].getUnknownAttributes()?.closed).toBe("false");
      });
    });

    it("an unknown typed marker settles as typed (`\\zz` + Space)", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "z");
      await dispatchKeyDown(editor, "z");

      await dispatchKeyDown(editor, " ");

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      // Tier 2 settles the unknown literal AS TYPED - the marker byte sequence survives into
      // the settled state (as an unknown-marker structure, not silently dropped).
      const json = JSON.stringify(editor.getEditorState().toJSON());
      expect(json).toContain(`"marker":"zz"`);
    });

    it("`\\` + immediate Space materializes just the trigger byte - the passive end state, byte-identical", async () => {
      // First-key ordering pin: the space is the FIRST key after the menu opened, the one spot
      // where `NodeSelectionMenu`'s query capture registers ahead of the harness handler. The
      // capture must decline the passive palette's commit key (passthrough), not swallow it as
      // a filter character.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();

      const event = await dispatchKeyDown(editor, " ");

      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        // Byte-identical to passive: `\` + space landed and nothing terminated, so the literal
        // stays (an unterminated bare backslash is not a marker).
        expect(requireDefined(text, "text").getTextContent()).toBe("hello\\ ");
      });
    });
  });

  describe("`*` over a collapsed caret", () => {
    // The palette's CLOSING-marker commit, the counterpart to Space's opening one: `*` commits
    // `\typed*` at the caret with no terminating space and no opening glyph, and closes the
    // palette. `*` is therefore a commit key here, not a filter character — typing it can no
    // longer narrow the list to a `closeTag` entry, because pressing it commits the same end
    // state that entry would have applied.
    it("commits the typed marker as a CLOSING marker and closes the palette", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      // Open an `nd` span first so there is something for the closer to close.
      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      await dispatchKeyDown(editor, " ");

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      const event = await dispatchKeyDown(editor, "*");

      // Claimed: an un-prevented `*` would land a literal asterisk on top of the commit.
      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const chars = para.getChildren().filter($isCharNode);
        expect(chars).toHaveLength(1);
        expect(chars[0].getMarker()).toBe("nd");
        // The span is CLOSED now: both glyphs present, and the open-span flag gone.
        expect(chars[0].getChildren().filter($isMarkerNode)).toHaveLength(2);
        expect(chars[0].getUnknownAttributes()?.closed).toBeUndefined();
        // No terminating space of its own — that is Space's job.
        expect(para.getTextContent().endsWith("\\nd*")).toBe(true);
      });
    });

    it("lands the typed closer literally when nothing matching is open", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      const event = await dispatchKeyDown(editor, "*");

      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      // Not a silent no-op: the typed bytes land and the engine flags them unmatched.
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        expect(para.getTextContent()).toContain("\\nd*");
      });
    });

    it("`*` over a NON-COLLAPSED selection DELETES the selection and commits the closer", async () => {
      // Owner-directed (Paratext 9 parity): typing `\nd*` with text selected replaces that text
      // with the literal closer. It does NOT wrap the selection (that is Space's commit) and it
      // no longer merely filters — `*` is a commit key in every selection shape.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      // "say holy words" — select "holy".
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "n");
      await dispatchKeyDown(editor, "d");
      const event = await dispatchKeyDown(editor, "*");

      // Claimed and committed: the palette closes, and nothing lands on top of the closer.
      expect(event.defaultPrevented).toBe(true);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        const para = requireDefined($getRoot().getChildren().filter($isParaNode)[0], "para");
        const paraText = para.getTextContent();
        expect(paraText).not.toContain("holy");
        expect(paraText).toContain("\\nd*");
        // Only the selection was replaced — the text on either side survives.
        expect(paraText).toContain("say ");
        expect(paraText).toContain(" words");
      });
    });
  });

  describe("filter ranking with a selection", () => {
    // TJ's report: with a word selected the palette showed the UNFILTERED context list (typed
    // characters never reached the query). Under the active palette the query capture is the
    // palette's own in every context, so a selection filters exactly like a collapsed caret,
    // exact match first (filterAndRankItems' exact > startsWith > contains ordering).
    it("filters the typed query with a selection in the main editor - exact match first", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildWrapMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(4, 8)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await dispatchKeyDown(editor, "w");

      const filtered = await waitForMenu();
      expect(menuItemLabel(filtered[0])).toBe("w");
      // Still a filtered list, not the unfiltered context order: every offered marker matches.
      filtered.forEach((item) => expect(menuItemLabel(item)).toContain("w"));
    });

    it("filters the typed query with a selection in note content - exact match first", async () => {
      const { editor } = await harnessTestEnvironment(serializedState(noteUsx(`closed="false"`)));

      let ftText: TextNode | undefined;
      editor.getEditorState().read(() => {
        ftText = $noteContentText(findOnlyNote($getRoot()));
      });
      // Select "note" inside "A note" - the footnote editor's wrap shape.
      await act(async () =>
        editor.update(() => {
          const text = requireDefined(ftText, "\\ft content text not found");
          const start = text.getTextContent().indexOf("note");
          text.select(start, start + 4);
        }),
      );

      await dispatchKeyDown(editor, "\\");
      const unfiltered = await waitForMenu();
      // Note-context list: the unfiltered offer includes note-internal markers like `fq`.
      expect(unfiltered.map(menuItemLabel)).toContain("fq");

      await dispatchKeyDown(editor, "w");

      const filtered = await waitForMenu();
      expect(menuItemLabel(filtered[0])).toBe("w");
      filtered.forEach((item) => expect(menuItemLabel(item)).toContain("w"));
    });
  });

  describe("Enter trigger", () => {
    it("opens the paragraph menu with SmartEnter `p` first, and Escape cancels the split (document unchanged)", async () => {
      let caretText: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        caretText = $buildEnterMenuFixture().caretText;
      });
      await act(async () =>
        editor.update(() => requireDefined(caretText, "caretText").select(6, 6)),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);

      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore); // split suppressed
      });

      const menuItems = await waitForMenu();
      expect(menuItemLabel(menuItems[0])).toBe("p");

      await dispatchKeyDown(editor, "Escape");

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        // Still unchanged - the split never happened in the first place.
        expect(countParagraphs($getRoot())).toBe(parasBefore);
      });
    });

    it("selecting the Enter-menu item splits the paragraph with the chosen marker", async () => {
      let caretText: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        caretText = $buildEnterMenuFixture().caretText;
      });
      await act(async () =>
        editor.update(() => requireDefined(caretText, "caretText").select(6, 6)),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);
      const menuItems = await waitForMenu();
      const chosenMarker = requireDefined(menuItemLabel(menuItems[0]), "menu item label");

      await dispatchKeyDown(editor, "Enter"); // selects the active (first, SmartEnter) item

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(parasBefore + 1);
        expect(paras[paras.length - 1].getMarker()).toBe(chosenMarker);
      });
    });

    /** `[c, p]`, then a `\p` paragraph whose LAST child is a closed `\nd` char span — the two
     * caret shapes Enter-at-paragraph-end takes when the paragraph ends in an inline marker:
     * a text point at the closer glyph's trailing edge (where arrows and clicks park the
     * caret), and the paragraph-end element point. */
    function $buildCharEndingEnterFixture(): { closer: TextNode; para: ParaNode } {
      const chapter = $createChapterNode("1");
      const closer = $createMarkerNode("nd", "closing");
      const para = $createParaNode("p");
      $getRoot().append(
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        para.append(
          $createMarkerNode("p"),
          $createTrailingSpaceNode(),
          $createTextNode("text "),
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}word`),
            closer,
          ),
        ),
      );
      return { closer, para };
    }

    it("opens the paragraph menu at the trailing edge of a paragraph-final closer glyph", async () => {
      let closer!: TextNode;
      const { editor } = await harnessTestEnvironment(() => {
        ({ closer } = $buildCharEndingEnterFixture());
      });
      // The caret AFTER `\nd*` — the position ArrowRight/click resolve to at the end of a
      // paragraph whose last child is an inline char span.
      await act(async () =>
        editor.update(() =>
          closer.select(closer.getTextContentSize(), closer.getTextContentSize()),
        ),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);

      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore); // split suppressed
      });
      const menuItems = await waitForMenu();
      expect(menuItemLabel(menuItems[0])).toBe("p");
    });

    it("opens the paragraph menu at the paragraph-end ELEMENT point after a char span", async () => {
      let para!: ParaNode;
      const { editor } = await harnessTestEnvironment(() => {
        ({ para } = $buildCharEndingEnterFixture());
      });
      await act(async () =>
        editor.update(() => {
          const selection = $createRangeSelection();
          selection.anchor.set(para.getKey(), para.getChildrenSize(), "element");
          selection.focus.set(para.getKey(), para.getChildrenSize(), "element");
          $setSelection(selection);
        }),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);

      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore); // split suppressed
      });
      const menuItems = await waitForMenu();
      expect(menuItemLabel(menuItems[0])).toBe("p");
    });

    it("commits the Enter-menu item from the closer's trailing edge: the split lands AFTER the intact span", async () => {
      let closer!: TextNode;
      let para!: ParaNode;
      const { editor } = await harnessTestEnvironment(() => {
        ({ closer, para } = $buildCharEndingEnterFixture());
      });
      await act(async () =>
        editor.update(() =>
          closer.select(closer.getTextContentSize(), closer.getTextContentSize()),
        ),
      );

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));

      await pressEnterCommand(editor);
      const menuItems = await waitForMenu();
      const chosenMarker = requireDefined(menuItemLabel(menuItems[0]), "menu item label");

      await dispatchKeyDown(editor, "Enter"); // selects the active (first, SmartEnter) item

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        const paras = $getRoot().getChildren().filter($isParaNode);
        expect(paras).toHaveLength(parasBefore + 1);
        // The ORIGINAL paragraph keeps its span intact — closer glyph still the span's last
        // child, nothing split inside the char.
        expect(paras[0].getKey()).toBe(para.getKey());
        const span = paras[0].getChildren().find($isCharNode);
        expect(requireDefined(span, "span missing").getTextContent()).toBe(`\\nd${NBSP}word\\nd*`);
        // The NEW paragraph carries the chosen marker and NO char-span husk.
        const fresh = paras[1];
        expect(fresh.getMarker()).toBe(chosenMarker);
        expect(fresh.getChildren().filter($isCharNode)).toHaveLength(0);
        // The caret continues in the new paragraph.
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
        let inFresh = false;
        for (
          let node = selection.anchor.getNode();
          node;
          node = node.getParent() as ReturnType<typeof selection.anchor.getNode>
        )
          if (node.is(fresh)) {
            inFresh = true;
            break;
          }
        expect(inFresh).toBe(true);
      });
    });

    it("passes through untouched inside an expanded note - Enter still inserts \\fp", async () => {
      const { editor } = await harnessTestEnvironment(serializedState(noteUsx(`closed="false"`)));

      let ftText: TextNode | undefined;
      editor.getEditorState().read(() => {
        ftText = $noteContentText(findOnlyNote($getRoot()));
      });
      editor.update(
        () => {
          const text = requireDefined(ftText, "\\ft content text not found");
          text.select(text.getTextContentSize(), text.getTextContentSize());
        },
        { discrete: true },
      );

      await pressEnterCommand(editor);

      // Our harness never intercepted - no paragraph menu ever opened.
      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        const note = findOnlyNote($getRoot());
        const markers = note
          .getChildren()
          .filter($isCharNode)
          .map((c) => c.getMarker());
        expect(markers).toContain("fp");
      });
    });

    it("never opens the menu for a programmatic INSERT_PARAGRAPH_COMMAND dispatch — the split happens", async () => {
      // The menu listens on the user's KEY_ENTER keystroke, NOT on INSERT_PARAGRAPH_COMMAND:
      // programmatic dispatches of the command (multi-line paste replays, MarkerEditPlugin's
      // needs-plain-split re-dispatch) must reach their real split path. A command-level claim
      // intercepted those too — each pasted line popped this menu and lost its split. The caret
      // sits at the same unguarded body position where a real Enter DOES open the menu (the
      // Enter-trigger tests above are the positive control for that route).
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(2, 2)));

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));
      let handled = false;
      await act(async () => {
        handled = editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      // No menu — not even an empty container — and the split went through downstream.
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      expect(handled).toBe(true);
      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
      });
    });

    it("declines a programmatic KEY_ENTER_COMMAND dispatch with a null event (no menu)", async () => {
      // A null payload is the programmatic shape of KEY_ENTER; only the user's own keystroke
      // (a real KeyboardEvent) opens the menu. With the menu declining, the dispatch falls
      // through to rich-text, whose fallback performs the ordinary split.
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(2, 2)));

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));
      await act(async () => {
        editor.dispatchCommand(KEY_ENTER_COMMAND, null);
      });

      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => {
        expect(countParagraphs($getRoot())).toBe(parasBefore + 1);
      });
    });
  });

  describe("editable-menu guards", () => {
    it("passes `\\` and Enter through when getContext() returns undefined (no selection)", async () => {
      // With no range selection at all, $getMarkerMenuContext — and so harness.getContext —
      // returns undefined; both handlers must decline before touching the context. Were the
      // guard dropped, they would read fields off `undefined` (a loud crash) or open a menu —
      // the surrounding tests are the positive controls proving these same keystrokes DO open
      // the menu once a caret exists.
      const { editor } = await harnessTestEnvironment(() => {
        $buildBackslashMenuFixture();
      });
      await act(async () => editor.update(() => $setSelection(null)));

      // The dispatch's return value is not asserted for `\`: Lexical CORE routes every KEY_DOWN
      // at EDITOR priority, so it reads handled either way. Pass-through shows in the
      // event and the DOM: not preventDefaulted, and no menu (not even an empty container).
      const keyEvent = new KeyboardEvent("keydown", { key: "\\", bubbles: true, cancelable: true });
      await act(async () => {
        editor.dispatchCommand(KEY_DOWN_COMMAND, keyEvent);
      });
      expect(keyEvent.defaultPrevented).toBe(false);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();

      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));
      // A real Enter keystroke with no selection: the menu's guard declines before touching the
      // context, and downstream rich-text also declines without a selection — nothing splits and
      // no menu (not even an empty container) appears.
      const enterEvent = await pressEnterCommand(editor);
      expect(enterEvent.defaultPrevented).toBe(false);
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      editor.getEditorState().read(() => expect(countParagraphs($getRoot())).toBe(parasBefore));
    });

    it("ignores a second trigger while the menu is already open (re-entrancy guard)", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      const itemsBefore = await waitForMenu();
      const firstLabelBefore = menuItemLabel(itemsBefore[0]);

      // Second `\` while open with an EMPTY filter (owner-directed, revising the earlier
      // "menu stays open" pin): there is nothing typed to commit, so the backslash is an
      // ordinary character — it lands and the palette CLOSES without a replacement opening.
      // The re-entrancy property this guards is unchanged: the trigger branch never rebuilds
      // menu state mid-session.
      await dispatchKeyDown(editor, "\\");
      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      expect(itemsBefore.length).toBeGreaterThan(0);
      expect(firstLabelBefore).toBeDefined();

      // Reopen so the INSERT_PARAGRAPH half below still runs against an OPEN menu.
      await dispatchKeyDown(editor, "\\");
      await waitForMenu();

      // INSERT_PARAGRAPH while open passes through to the stock split (paragraph count grows)
      // instead of being swallowed into a replacement Enter menu — the menu listens on the
      // user's KEY_ENTER keystroke, never on the command, so a programmatic dispatch cannot
      // suppress the split or replace the open palette with the SmartEnter paragraph choice.
      let parasBefore = 0;
      editor.getEditorState().read(() => (parasBefore = countParagraphs($getRoot())));
      await act(async () => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });
      editor.getEditorState().read(() => expect(countParagraphs($getRoot())).toBe(parasBefore + 1));
      const itemsFinal = screen.getAllByRole("menuitem");
      expect(menuItemLabel(itemsFinal[0])).toBe(firstLabelBefore);
    });
  });
});
