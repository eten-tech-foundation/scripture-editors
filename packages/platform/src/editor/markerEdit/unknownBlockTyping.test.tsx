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
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_DOWN_COMMAND,
  LexicalEditor,
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
  /** `testEnvironmentWithSheet` plus the guard, which is what the app mounts. */
  async function guardedEnvironment($initialEditorState: () => void) {
    initializeSerialize(undefined, undefined);
    reset();
    return baseTestEnvironment(
      $initialEditorState,
      <>
        <MarkerEditPlugin viewOptions={viewOptions} getMarker={createMarkerLookup(figureSheet)} />
        <OpaqueBlockGuardPlugin />
      </>,
    );
  }

  /** Build `\p hello \fig My caption|src="x.jpg"\fig*` by typing, and return the editor. */
  async function editorWithFigure() {
    const { editor } = await guardedEnvironment($seedTail);
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
