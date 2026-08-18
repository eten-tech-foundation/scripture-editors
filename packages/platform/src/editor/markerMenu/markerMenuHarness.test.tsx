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
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isMarkerNode,
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
      // Owner-directed divergence from the OLD ratified row "Escape leaves the typed literal":
      // under the active palette no literal lands in the first place, so Escape's contract is
      // "document untouched", not "literal stays".
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

  describe("Space over a collapsed caret", () => {
    // The active palette's Space commit: the typed query is materialized as the SAME literal
    // bytes the passive palette would have accumulated in the document (`\` + typed + space),
    // in one update, and Tier 2 resolves them exactly as it resolved passive typing - so the
    // ratified Space end states (closed="false" span, unknown-settles-as-typed, `\f` commits
    // like Enter) hold byte-for-byte without the palette re-implementing any of them.
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

  describe("editable-menu guards", () => {
    it("passes `\\` and INSERT_PARAGRAPH through when getContext() returns undefined (no selection)", async () => {
      // With no range selection at all, $getMarkerMenuContext — and so harness.getContext —
      // returns undefined; both handlers must decline before touching the context. Were the
      // guard dropped, they would read fields off `undefined` (a loud crash) or open a menu —
      // the surrounding tests are the positive controls proving these same dispatches DO open
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
      let enterHandled = false;
      await act(async () => {
        enterHandled = editor.dispatchCommand(INSERT_PARAGRAPH_COMMAND, undefined);
      });
      // INSERT_PARAGRAPH has no core router: the guard's decline falls all the way through
      // (downstream rich-text also declines without a selection), so nothing splits and no
      // menu — not even an empty container — appears.
      expect(enterHandled).toBe(false);
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

      // Second `\` while open: the harness handler passes it through and the open menu's own
      // query capture claims it instead (preventDefault). Had the harness re-handled the
      // collapsed-caret trigger — which never preventDefaults — the event would NOT be
      // prevented and the menu state would have been rebuilt mid-session.
      const second = await dispatchKeyDown(editor, "\\");
      expect(second.defaultPrevented).toBe(true);
      const itemsAfter = screen.getAllByRole("menuitem");
      expect(itemsAfter).toHaveLength(itemsBefore.length);
      expect(menuItemLabel(itemsAfter[0])).toBe(firstLabelBefore);

      // INSERT_PARAGRAPH while open is equally guarded: it passes through to the stock split
      // (paragraph count grows) instead of being swallowed into a replacement Enter menu —
      // which would have suppressed the split and put the SmartEnter paragraph choice first.
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
