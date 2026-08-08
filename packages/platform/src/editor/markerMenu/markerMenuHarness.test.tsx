/**
 * Editable-mode marker-menu harness — `UsjNodesMenuPlugin`'s editable-mode branch (the document-first `\`/
 * Enter marker menu), wired the same way `Editor.tsx` wires it in markerMode "editable":
 * `EditorRef`-equivalent methods (`$getMarkerMenuContext` / `$applyMarkerMenuSelection` /
 * `$splitParagraphWithMarker`) plus the module-level marker-item source
 * (`getMarkerMenuItems`/`getEnterMenuItems`), `defaultStyleInfo`-backed. Platform-level
 * per the brief: this composition only makes sense assembled from the platform's real
 * marker-menu machinery, not a stub.
 *
 * jsdom has no `Range.prototype.getBoundingClientRect` (confirmed against this repo's own
 * `markerMenuContext.utils.test.tsx`, which asserts `anchorRect` is `undefined` for exactly
 * this reason) - `@floating-ui/dom`'s `computePosition` rejects without it, so
 * `FloatingBoxAtCursor` never resolves coords and the menu never mounts. The harness reuses
 * that exact component (brief: don't rebuild `NodeSelectionMenu`), so a scoped polyfill below
 * is what makes the menu observable at all in this environment.
 */
import {
  getEnterMenuItems,
  getMarkerMenuItems,
  MarkerMenuContext,
  MarkerMenuItem,
} from "./markerItemSource";
import { $applyMarkerMenuSelection, $splitParagraphWithMarker } from "./markerMenuApply.utils";
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
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
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
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  defaultStyleInfo,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
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

async function pressEnterCommand(editor: LexicalEditor): Promise<void> {
  await act(async () => {
    editor.dispatchCommand(KEY_ENTER_COMMAND, null);
  });
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

/** Simulates the browser's own (un-prevented) literal character insertion at the caret - jsdom
 * doesn't do this on an unprevented keydown the way a real browser would. */
async function simulateLiteralInsert(editor: LexicalEditor, text: string): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    }),
  );
}

describe("editable-mode marker menu harness", () => {
  describe("`\\` trigger", () => {
    it("does not preventDefault for a collapsed selection - the literal `\\` lands as text - and opens the menu", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      const event = await dispatchKeyDown(editor, "\\");
      expect(event.defaultPrevented).toBe(false);

      const menuItems = await waitForMenu();
      expect(menuItems.length).toBeGreaterThan(0);

      await simulateLiteralInsert(editor, "\\");
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toContain("hello\\");
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

    it("Escape closes the menu without altering the document (the literal `\\` stays)", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      await waitForMenu();
      await simulateLiteralInsert(editor, "\\");

      await dispatchKeyDown(editor, "Escape");

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        expect($getRoot().getTextContent()).toContain("hello\\");
      });
    });

    it("selecting a menu item inserts it structurally and removes the literal `\\`", async () => {
      let text: TextNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        text = $buildBackslashMenuFixture().text;
      });
      await act(async () => editor.update(() => requireDefined(text, "text").select(5, 5)));

      await dispatchKeyDown(editor, "\\");
      const menuItems = await waitForMenu();
      await simulateLiteralInsert(editor, "\\");

      const chosenMarker = requireDefined(menuItemLabel(menuItems[0]), "menu item label");
      const textKey = requireDefined(text, "text").getKey();

      await dispatchKeyDown(editor, "Enter"); // selects the active (first) item

      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      editor.getEditorState().read(() => {
        // Checked on the ORIGINAL "hello" TextNode specifically (not the whole document's
        // concatenated text) - the chosen item may itself be a note whose OWN visible marker
        // glyphs (e.g. "\f ... \f*") legitimately contain backslashes immediately adjacent to
        // "hello" in the flattened text, which a blanket substring check can't tell apart from
        // an unremoved literal trigger prefix.
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

    // The two guard tests below dispatch INSERT_PARAGRAPH_COMMAND DIRECTLY (a public Lexical
    // command - hosts/paste/IME paths can dispatch it with no keydown), because via keyboard
    // these guard branches are unreachable today: MarkerEditPlugin's KEY_ENTER_COMMAND handler
    // (HIGH) swallows Enter first for both states ($handleEnterInNote /
    // $isSelectionInMarkerNode), so rich-text's KEY_ENTER fallback never dispatches
    // INSERT_PARAGRAPH from typing there - the \fp test above exercises THAT upstream swallow,
    // not the harness's own guards. RED isn't demonstrable for a pass-through without mutating
    // the guard itself; instead the glyph test below embeds a positive control proving the
    // same direct dispatch DOES open the menu at an unguarded caret, so "no menu" here can
    // only mean the guard branch was taken.
    it("guards a directly dispatched INSERT_PARAGRAPH_COMMAND when the caret is in note content (noteMarker)", async () => {
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

      let handled = false;
      await act(async () => {
        handled = editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      // Guard branch taken: the harness passed through (returned false) - no menu opened. The
      // CONTAINER is asserted on, not just menuitems: inside a note `getEnterItems` returns []
      // (paragraph source is empty in notes), so a guard regression would open an EMPTY menu
      // that a menuitem-count check cannot distinguish from no menu at all (verified RED: with
      // the guard disabled, the container check below fails while a menuitem check passes).
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      // The dispatch was still handled downstream (rich-text's default), not swallowed here.
      expect(handled).toBe(true);
      editor.getEditorState().read(() => {
        // No split-with-menu artifacts: exactly one note survives whatever the downstream
        // default did with the in-note split.
        findOnlyNote($getRoot());
      });
    });

    it("guards a directly dispatched INSERT_PARAGRAPH_COMMAND when the caret is in marker glyph text (inMarkerText) - while the same dispatch opens the menu at an unguarded caret", async () => {
      let prefix: MarkerNode | undefined;
      const { editor } = await harnessTestEnvironment(() => {
        const para = $createParaNode("p");
        prefix = $createMarkerNode("p");
        $getRoot().append(
          para.append(prefix, $createTrailingSpaceNode(), $createTextNode("hello")),
        );
      });
      // Caret inside the "\p" glyph (between "\" and "p") - inMarkerText true.
      await act(async () => editor.update(() => requireDefined(prefix, "prefix").select(1, 1)));

      let handled = false;
      await act(async () => {
        handled = editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });

      // Guard branch taken: pass-through (no menu, not even an empty container); still
      // handled downstream.
      expect(document.querySelector(".autocomplete-menu-container")).toBeNull();
      expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
      expect(handled).toBe(true);

      // Positive control - same dispatch mechanism, unguarded caret: the menu DOES open, so
      // the guard assertions above can't be passing merely because a direct dispatch never
      // reaches the harness. The text node is re-found by content (not a captured reference):
      // the guarded dispatch above split through the glyph and the marker-edit transforms may
      // have rebuilt the paragraph, destroying original node identities.
      await act(async () =>
        editor.update(() => {
          const hello = $getRoot()
            .getAllTextNodes()
            .find((node) => node.getTextContent().includes("hello"));
          requireDefined(hello, "hello text").select(2, 2);
        }),
      );
      await act(async () => {
        editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });
      await waitForMenu();
    });
  });
});
