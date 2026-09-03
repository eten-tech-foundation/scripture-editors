/**
 * Typing a marker whose construct the editor carries opaquely — a table row, a sidebar, a
 * figure — and what the document looks like afterwards.
 *
 * The through-line is Invariant I: every byte the user can place a caret in is document text, and
 * every byte the document holds is displayed. A marker that resolves into an opaque construct and
 * then shows nothing leaves the user with a paragraph that split for no visible reason and no
 * glyph to delete to undo it.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { testEnvironment, testEnvironmentWithSheet, viewOptions } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isImmutableTableNode,
  $isImmutableTableRowNode,
  $isMarkerNode,
  $isParaNode,
  $isUnknownNode,
  createMarkerLookup,
  NBSP,
  StyleInfo,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { OpaqueBlockGuardPlugin } from "shared-react";

/**
 * A project sheet that classifies `fig` the way a real Paratext `usfm.sty` does. The bundled
 * marker table carries none of this track's markers, so without a sheet a `\fig` span takes the
 * unknown-marker path instead of the character-marker one the app actually exercises.
 */
const figureSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    fig: { marker: "fig", styleType: "character", endMarker: "fig*" },
  },
};

/** A paragraph reading "hello world" with an editable `\p` prefix, as standard view loads one. */
function $seedParagraph(): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("hello world"),
    ),
  );
}

/** Like `$seedParagraph` but with nothing after the prose, so a typed marker lands at the end. */
function $seedTail(): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("hello "),
    ),
  );
}

/** The paragraph's body text node (the one holding "hello world", NBSP prefix merged or not). */
function $bodyText() {
  const node = $getRoot()
    .getAllTextNodes()
    .find((candidate) => !$isMarkerNode(candidate) && candidate.getTextContent().includes("hello"));
  if (!$isTextNode(node)) throw new Error("seed paragraph body text not found");
  return node;
}

/**
 * Replace the paragraph's body text with `text` and park the caret at `caret` — the shape a typed
 * run leaves behind, and the one the Tier-2 trigger reads (only the bytes BEFORE the caret can
 * have just been typed, so the caret position decides whether the run counts as terminated).
 */
async function typeInBody(editor: LexicalEditor, text: string, caret: number): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const node = $bodyText();
      node.setTextContent(text);
      node.select(caret, caret);
    }),
  );
}

/** Insert `chunk` at the live caret, as a keystroke run does. */
async function typeAtCaret(editor: LexicalEditor, chunk: string): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("no caret to type at");
      selection.insertText(chunk);
    }),
  );
}

/** The one paragraph in the tree. */
function $onlyPara() {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("no paragraph");
  return para;
}

/** `testEnvironment` plus the guard, which is what the app mounts. */
async function guardedEnvironment($initialEditorState: () => void, sheet?: StyleInfo) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={viewOptions} getMarker={createMarkerLookup(sheet)} />
      <OpaqueBlockGuardPlugin />
    </>,
  );
}

/** The editor's current USJ, through the production adaptor — what a save would write. */
function usjOf(editor: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
}

describe("typing on past a construct the caret cannot enter", () => {
  it("carries on AFTER a figure the typed closer just completed, not before it", async () => {
    const { editor } = await testEnvironmentWithSheet($seedTail, figureSheet);
    await act(async () => editor.update(() => $bodyText().selectEnd()));
    await typeAtCaret(editor, '\\fig My caption|src="x.jpg"');
    // The closer terminates the run, so this keystroke is the one that folds the span into an
    // opaque figure and rebuilds the paragraph around it.
    await typeAtCaret(editor, "\\fig*");
    await typeAtCaret(editor, " world");

    editor.getEditorState().read(() => {
      const children = $onlyPara().getChildren();
      const figureIndex = children.findIndex($isUnknownNode);
      expect(figureIndex).toBeGreaterThan(-1);
      // The prose the figure was typed into is untouched — no second space absorbed into it...
      const before = children.slice(0, figureIndex).map((node) => node.getTextContent());
      expect(before.join("")).toBe(`\\p${NBSP}hello `);
      // ...and the continued typing landed past the figure, where the caret was.
      const after = children.slice(figureIndex + 1).map((node) => node.getTextContent());
      expect(after.join("")).toBe(" world");
    });
  });
});

describe("typing a marker that resolves to an opaque construct", () => {
  it("shows the row's own \\tr glyph after a mid-paragraph \\tr splits the paragraph", async () => {
    const { editor } = await testEnvironment($seedParagraph);
    await typeInBody(editor, "hello \\tr world", "hello \\tr ".length);

    editor.getEditorState().read(() => {
      const table = $getRoot().getChildren().find($isImmutableTableNode);
      if (!table) throw new Error("the typed \\tr did not resolve to a table");
      const row = table.getChildren().find($isImmutableTableRowNode);
      if (!row) throw new Error("the table has no row");
      // The row absorbed the rest of the sentence — faithful USFM (everything after `\tr` is table
      // content until the next block marker) — so the marker that caused it has to be on screen.
      expect(row.getTextContent()).toContain("world");
      expect(row.getTextContent()).toContain("\\tr");
      // And it is on screen as one editable glyph plus its separator, exactly as a cell's marker
      // is, not as literal text inside the row's content.
      const [glyph, separator] = row.getChildren();
      expect($isMarkerNode(glyph) && glyph.getMarker()).toBe("tr");
      expect($isTextNode(separator) && separator.getTextContent()).toBe(NBSP);
    });
  });

  it("shows a sidebar's \\cat bytes inside its read-only display", async () => {
    const { editor } = await testEnvironment($seedParagraph);
    const usfm = "hello \\esb \\cat History\\cat* body \\esbe";
    await typeInBody(editor, usfm, usfm.length);

    editor.getEditorState().read(() => {
      const sidebar = $getRoot().getChildren().find($isUnknownNode);
      if (!sidebar) throw new Error("the typed \\esb did not resolve to a sidebar");
      expect(sidebar.getTag()).toBe("sidebar");
      expect(sidebar.getTextContent()).toContain("\\cat History\\cat*");
    });
  });

  it("shows no \\esbe for a sidebar the document never terminated", async () => {
    const { editor } = await testEnvironment($seedParagraph);
    await typeInBody(editor, "hello \\esb world", "hello \\esb ".length);

    editor.getEditorState().read(() => {
      const sidebar = $getRoot().getChildren().find($isUnknownNode);
      if (!sidebar) throw new Error("the typed \\esb did not resolve to a sidebar");
      // The tokenizer auto-closes an unterminated sidebar and records that as closed="false"; the
      // display must not invent the `\esbe` the file does not carry.
      expect(sidebar.getUnknownAttributes()?.closed).toBe("false");
      expect(sidebar.getTextContent()).toContain("\\esb");
      expect(sidebar.getTextContent()).not.toContain("\\esbe");
    });
  });
});

/**
 * A read-only construct has to REFUSE a keystroke, not accept one and lose content to it.
 *
 * The hazard is Lexical's token mode, which the adaptor puts on an unknown block's content so the
 * block reads as one unit: inserting into a token node replaces the WHOLE node, so a single
 * character landing in a figure's caption takes the entire caption with it. Refusing is what makes
 * "read-only" true rather than "destructive on contact".
 */
describe("a keystroke inside a read-only block is refused", () => {
  /** Build `\p hello \fig My caption|src="x.jpg"\fig*` by typing, and return the editor. */
  async function editorWithFigure() {
    const { editor } = await guardedEnvironment($seedTail, figureSheet);
    await act(async () => editor.update(() => $bodyText().selectEnd()));
    await typeAtCaret(editor, '\\fig My caption|src="x.jpg"\\fig*');
    return editor;
  }

  /** Park a collapsed caret inside the figure's caption, two characters in. */
  async function caretInCaption(editor: LexicalEditor) {
    await act(async () =>
      editor.update(() => {
        const caption = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "My caption");
        if (!caption) throw new Error("figure caption not found");
        caption.select(2, 2);
      }),
    );
  }

  /** The figure's full byte string, which is what a refusal has to leave untouched. */
  function figureBytes(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => {
      const figure = $onlyPara().getChildren().find($isUnknownNode);
      if (!figure) throw new Error("no figure");
      return figure.getTextContent();
    });
  }

  it("leaves the caption whole when a character is typed into it", async () => {
    const editor = await editorWithFigure();
    const before = figureBytes(editor);
    await caretInCaption(editor);

    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "Z" }));
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "Z");
    });

    expect(figureBytes(editor)).toBe(before);
    expect(figureBytes(editor)).toContain("My caption");
  });

  it("leaves the caption whole on Backspace inside it", async () => {
    const editor = await editorWithFigure();
    const before = figureBytes(editor);
    await caretInCaption(editor);

    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "Backspace" }));
    });

    expect(figureBytes(editor)).toBe(before);
  });

  it("still accepts typing OUTSIDE the block", async () => {
    // The control: the guard refuses a keystroke aimed INTO an opaque construct, and nothing else.
    // Without this, "refuses everything" would pass the two tests above.
    const editor = await editorWithFigure();
    await act(async () => editor.update(() => $bodyText().selectEnd()));

    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "Z" }));
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "Z");
    });

    editor.getEditorState().read(() => {
      expect($bodyText().getTextContent()).toContain("hello Z");
    });
  });
});

/**
 * Which constructs get the subdued read-only affordance, stated as a rule rather than a list.
 *
 * The affordance follows the NODE KIND the adaptor builds, which follows the USJ `type` the
 * parser produced — never the marker name. Kinds the editor models structurally (paragraphs, char
 * spans, verses) render as ordinary editable text; kinds it carries opaquely render subdued and
 * read-only. That is the whole rule, and it is why one marker can land on either side of it: a
 * `\fig` span becomes an opaque `figure` only once it carries parseable attributes and its own
 * closer, and is an ordinary char span or paragraph until then.
 */
describe("the read-only affordance follows the node kind, not the marker", () => {
  /** Type `usfm` into the seed paragraph and report which kind the marker resolved to. */
  async function resolvedKind(usfm: string, caret: number): Promise<string> {
    const { editor } = await testEnvironment($seedParagraph);
    await typeInBody(editor, usfm, caret);
    return editor.getEditorState().read(() => {
      const opaque = $getRoot()
        .getChildren()
        .flatMap((child) => ($isElementNode(child) ? [child, ...child.getChildren()] : [child]))
        .find((node) => $isUnknownNode(node) || $isImmutableTableNode(node));
      if ($isUnknownNode(opaque)) return `opaque:${opaque.getTag()}`;
      if (opaque) return "opaque:table";
      const paras = $getRoot().getChildren();
      return `modelled:${paras[paras.length - 1].getType()}`;
    });
  }

  const cases: { usfm: string; caret: number; kind: string }[] = [
    { usfm: "hello \\tr world", caret: "hello \\tr ".length, kind: "opaque:table" },
    { usfm: "hello \\esb world", caret: "hello \\esb ".length, kind: "opaque:sidebar" },
    {
      usfm: 'hello \\fig cap|src="x.jpg"\\fig* world',
      caret: 'hello \\fig cap|src="x.jpg"\\fig*'.length,
      kind: "opaque:figure",
    },
    // Same marker, one attribute short of foldable: still a construct the editor models, so still
    // ordinary editable text. This is the affordance flip the graying rule has to explain rather
    // than paper over.
    {
      usfm: "hello \\fig cap\\fig* world",
      caret: "hello \\fig cap\\fig*".length,
      kind: "modelled:para",
    },
    { usfm: "hello \\fig world", caret: "hello \\fig ".length, kind: "modelled:para" },
    { usfm: "hello \\zz world", caret: "hello \\zz ".length, kind: "modelled:para" },
  ];

  it.each(cases)("$usfm resolves to $kind", async ({ usfm, caret, kind }) => {
    expect(await resolvedKind(usfm, caret)).toBe(kind);
  });
});

/**
 * A row's `\tr ` glyph is engine-owned display for a marker the FILE carries, and a table has no
 * settle scope — `$settleScopeForNode` returns undefined inside one, so nothing re-tokenizes a
 * table after an edit. A deletion that reaches those bytes therefore takes them off the screen and
 * leaves the row in the document: a silent screen/file divergence that no later pass repairs, and
 * exactly the accepted-then-discarded shape the no-silent-no-ops rule forbids. So the deletion is
 * refused, the way typing into a cell already is.
 *
 * The gestures below are the ones that reach the glyph. A collapsed caret ON it was already
 * refused; the two that were not are a selection reaching IN from the paragraph outside (the guard
 * required BOTH ends inside one construct) and any delete chord, which Lexical routes past
 * `KEY_DOWN` straight to `DELETE_WORD_COMMAND`/`DELETE_LINE_COMMAND` — the guard's key filter
 * treats a modifier chord as a command rather than as typing, which is right for Ctrl+C and wrong
 * for Ctrl+Backspace.
 *
 * Copy and navigation stay untouched, and so does the machine-drift HEAL: a refused user gesture
 * never reaches the tree, so provenance — machine drift heals, a user edit pends — is decided
 * exactly as before.
 */
describe("a deletion aimed at a table row's \\tr glyph is refused", () => {
  /** `\p hello ` followed by a table whose row absorbed `world`, with the guard mounted. */
  async function editorWithRow() {
    const { editor } = await guardedEnvironment($seedParagraph);
    await typeInBody(editor, "hello \\tr world", "hello \\tr ".length);
    return editor;
  }

  /** The row's opening `\tr` glyph. */
  function $rowGlyph(): TextNode {
    const table = $getRoot().getChildren().find($isImmutableTableNode);
    const row = table?.getChildren().find($isImmutableTableRowNode);
    const glyph = row?.getChildren()[0];
    if (!$isTextNode(glyph)) throw new Error("the row has no glyph");
    return glyph;
  }

  /** The NBSP separator between the row's glyph and its content. */
  function $rowSeparator(): TextNode {
    const separator = $rowGlyph().getNextSibling();
    if (!$isTextNode(separator)) throw new Error("the row has no separator");
    return separator;
  }

  /** What the row shows, which is what a refusal has to leave untouched. */
  function rowBytes(editor: LexicalEditor): string {
    return editor.getEditorState().read(() => {
      const table = $getRoot().getChildren().find($isImmutableTableNode);
      if (!table) throw new Error("no table");
      return table.getTextContent();
    });
  }

  /**
   * Presses `key` the way the browser does: ONE `KEY_DOWN_COMMAND` dispatch. Lexical's own
   * `KEY_DOWN` listener (registered by the editor core at `COMMAND_PRIORITY_EDITOR`) is what
   * routes it onward — to `KEY_BACKSPACE_COMMAND` for a bare Backspace, and straight to
   * `DELETE_WORD_COMMAND` for a modifier chord. A handler that claims `KEY_DOWN` at a higher
   * priority therefore stops the routing before any delete is dispatched, which is how the
   * refusal works and why nothing here dispatches a delete command itself.
   */
  async function pressKey(
    editor: LexicalEditor,
    key: string,
    modifiers: { ctrlKey?: boolean; altKey?: boolean } = {},
  ): Promise<void> {
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key, ...modifiers }));
    });
  }

  /** Selects from `anchor`'s offset to `focus`'s, across block boundaries. */
  async function selectAcross(
    editor: LexicalEditor,
    $anchor: () => [TextNode, number],
    $focus: () => [TextNode, number],
  ): Promise<void> {
    await act(async () =>
      editor.update(() => {
        const [anchorNode, anchorOffset] = $anchor();
        const [focusNode, focusOffset] = $focus();
        const selection = $createRangeSelection();
        selection.anchor.set(anchorNode.getKey(), anchorOffset, "text");
        selection.focus.set(focusNode.getKey(), focusOffset, "text");
        $setSelection(selection);
      }),
    );
  }

  it("leaves the glyph whole on a Backspace with the caret in it", async () => {
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await act(async () => editor.update(() => $rowGlyph().select(3, 3)));

    await pressKey(editor, "Backspace");

    expect(rowBytes(editor)).toContain("\\tr");
    expect(usjOf(editor)).toEqual(before);
  });

  it("leaves the glyph whole when a selection reaches into it from the paragraph", async () => {
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await selectAcross(
      editor,
      () => [$bodyText(), $bodyText().getTextContentSize()],
      () => [$rowGlyph(), 3],
    );

    await pressKey(editor, "Backspace");

    expect(rowBytes(editor)).toContain("\\tr");
    expect(usjOf(editor)).toEqual(before);
  });

  it("leaves the separator whole when a selection reaches into it", async () => {
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await selectAcross(
      editor,
      () => [$bodyText(), $bodyText().getTextContentSize()],
      () => [$rowSeparator(), 1],
    );

    await pressKey(editor, "Backspace");

    expect(rowBytes(editor)).toContain(`\\tr${NBSP}`);
    expect(usjOf(editor)).toEqual(before);
  });

  it("leaves the glyph whole on a word-delete chord aimed at it", async () => {
    // Pre-fix this reached Lexical's `deleteWord`, which in jsdom throws out of the unimplemented
    // `domSelection.modify` rather than visibly wiping the glyph — the same harness artefact the
    // figure's Backspace pin has. Either way the gesture must never get that far.
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await act(async () => editor.update(() => $rowGlyph().select(3, 3)));

    await pressKey(editor, "Backspace", { ctrlKey: true });

    expect(rowBytes(editor)).toContain("\\tr");
    expect(usjOf(editor)).toEqual(before);
  });

  it("leaves the glyph whole when a selection reaching into it is typed over", async () => {
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await selectAcross(
      editor,
      () => [$bodyText(), $bodyText().getTextContentSize()],
      () => [$rowGlyph(), 3],
    );

    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "Z" }));
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, "Z");
    });

    expect(rowBytes(editor)).toContain("\\tr");
    expect(usjOf(editor)).toEqual(before);
  });

  it("refuses a cut whose selection reaches into the glyph", async () => {
    const editor = await editorWithRow();
    const before = usjOf(editor);
    await selectAcross(
      editor,
      () => [$bodyText(), $bodyText().getTextContentSize()],
      () => [$rowGlyph(), 3],
    );

    await act(async () => {
      editor.dispatchCommand(CUT_COMMAND, new KeyboardEvent("keydown", { key: "x" }));
    });

    expect(rowBytes(editor)).toContain("\\tr");
    expect(usjOf(editor)).toEqual(before);
  });

  it("still deletes a selection that stays outside the table", async () => {
    // The control. Without it, "refuses every deletion" would pass every test above.
    const editor = await editorWithRow();
    await selectAcross(
      editor,
      () => [$bodyText(), 0],
      () => [$bodyText(), "hello".length],
    );

    await pressKey(editor, "Backspace");

    editor.getEditorState().read(() => {
      expect($onlyPara().getTextContent()).toBe(`\\p${NBSP} `);
    });
    expect(rowBytes(editor)).toContain("\\tr");
  });

  it("heals machine drift on the row glyph, with no user gesture anywhere near it", async () => {
    // The heal half of the lifecycle, on the row glyph specifically: the refusal above governs
    // USER deletions only, so drift from a non-user code path must still be restored in place
    // rather than settled into the document. `$markerNodeTransform`'s heal arm reaches the row's
    // glyph because it is an ordinary `MarkerNode`; the guard, which only ever refuses commands,
    // cannot and must not intercept a programmatic write.
    const { editor } = await testEnvironment($seedParagraph);
    await typeInBody(editor, "hello \\tr world", "hello \\tr ".length);
    // The user is working elsewhere — the caret is parked back in the paragraph.
    await act(async () => editor.update(() => $bodyText().select(0, 0)));

    await act(async () => editor.update(() => $rowGlyph().setTextContent("\\t")));

    editor.getEditorState().read(() => {
      expect($rowGlyph().getTextContent()).toBe("\\tr");
      const table = $getRoot().getChildren().find($isImmutableTableNode);
      const row = table?.getChildren().find($isImmutableTableRowNode);
      expect(row?.getMarker()).toBe("tr");
    });
  });
});

/**
 * Placing the caret on the row's `\tr ` glyph must not throw.
 *
 * Deletion there is refused (above), but a caret can still ARRIVE there — a click lands one, and
 * so does arrowing in from the paragraph before the table. Every plugin that reacts to a caret
 * move starts the same way: take `selection.anchor.getNode()` and walk it up to its top-level
 * element. `ScriptureReferencePlugin`'s selection listener does it through `$findThisChapter`,
 * `ActiveTextPlugin`'s update listener through `$getActiveVerseKey` and `$getParaFromSelection`,
 * `ArrowNavigationPlugin`'s vertical arrows through `$selectNextVerse`/`$selectPreviousVerse`, and
 * the marker menu through `$collectPreviousParaMarkers`.
 *
 * That walk stops at the first node whose PARENT is a root or shadow root and asserts the node it
 * stopped on is an element or a decorator. The row used to declare itself a shadow root — harmless
 * while its children were all cells, fatal once it grew a `MarkerNode` glyph and an NBSP separator
 * as direct children, because the walk then stopped on one of THOSE. Every caret move on the glyph
 * threw "Children of root nodes must be elements or decorators" out of Lexical.
 */
describe("a caret on a table row's \\tr glyph survives the selection-derived walk", () => {
  /** `\p hello ` followed by a table whose row absorbed `world`. */
  async function editorWithRow() {
    const { editor } = await guardedEnvironment($seedParagraph);
    await typeInBody(editor, "hello \\tr world", "hello \\tr ".length);
    return editor;
  }

  /** The row's `\tr` glyph and its NBSP separator, in the tree the adaptor actually built. */
  function $rowDisplayBytes(): [TextNode, TextNode] {
    const table = $getRoot().getChildren().find($isImmutableTableNode);
    const row = table?.getChildren().find($isImmutableTableRowNode);
    const [glyph, separator] = row?.getChildren() ?? [];
    if (!$isTextNode(glyph) || !$isTextNode(separator))
      throw new Error("the row has no glyph and separator");
    return [glyph, separator];
  }

  it.each([
    ["glyph", 0],
    ["separator", 1],
  ])("resolves a top-level ELEMENT for a caret in the row's %s", async (_which, index) => {
    const editor = await editorWithRow();

    // Placed and walked inside ONE update, the way the real listeners run: they are dispatched
    // from within the selection change itself. Splitting it across two updates let the engine's
    // idle-settle clock re-place the caret in between, which made the assertion measure a caret
    // somewhere else entirely.
    await act(async () =>
      editor.update(() => {
        $rowDisplayBytes()[index].select(1, 1);
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) throw new Error("no caret");
        const anchorNode = selection.anchor.getNode();
        // The walk itself, as every listener above performs it.
        expect(() => anchorNode.getTopLevelElement()).not.toThrow();
        const top = anchorNode.getTopLevelElement();
        expect($isElementNode(top)).toBe(true);
        // And it lands on the row, the nearest element inside the table's boundary.
        expect($isImmutableTableRowNode(top)).toBe(true);
      }),
    );
  });
});
