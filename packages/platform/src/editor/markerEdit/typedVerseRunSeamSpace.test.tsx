/**
 * A space typed in a verse glyph's TRAILING separator run — the seam between the glyph and a
 * `\va`/`\vp` display run riding beside it — is inserted, stays visible, and leaves the caret
 * immediately after it.
 *
 * The sibling pins cover the glyph's LEADING separator run (the whitespace between `\v` and its
 * number) and the inside of a display run's value. The seam between the two was still wrong from
 * both of the caret positions that name it, and the two looked like different defects:
 *
 * - `\v 1| \va 3\va*` — the caret between the number and the trailing separator. The keystroke
 *   appeared only to move the cursor one to the right.
 * - `\v 1 |\va 3\va*` — the caret at the glyph's end, where the run's opening glyph begins.
 *   Nothing appeared to happen at all.
 *
 * They are one gesture landing two ways, and it took two fixes because the byte was lost twice
 * over — once before the engine ever saw it, and once after.
 *
 * FIRST, the byte did not reach the glyph. The verse glyph the adaptor serializes was the only
 * text node it wrote WITHOUT the text properties (`detail`/`format`/`mode`/`style`), so the node
 * the editor loaded carried `undefined` where every sibling carried `0` and `""`. Lexical will not
 * splice a typed byte into a text node whose format or style differs from the selection's, and a
 * selection built from the DOM carries `0`/`""`: at an interior caret it split the glyph and
 * inserted a separate node, at the glyph's end it put the byte in a new sibling node. The split
 * left `\v 1` behind for the next settle to re-tokenize (the cursor-only-moved face), and the
 * sibling — a lone space between a verse and its run — was deleted as an empty verse's content
 * (the nothing-happened face).
 *
 * SECOND, once the byte does reach the glyph, the engine read it as `rest`: bytes past the
 * trailing separator, which it re-homes as document content after the verse. Beside a verse
 * carrying a `\va`/`\vp` run that is a place content cannot live, so the next rebuild dropped it.
 *
 * The rule, the same one the sibling pins carry: the trailing separator is a whitespace RUN, just
 * as the leading one is. Bytes past the number that are nothing but whitespace are the glyph's own
 * separator and stay where the user typed them; only a NON-whitespace byte there is content. The
 * file is unaffected either way — the writer emits exactly one separator space whatever the screen
 * shows — which is the same licence the invariants already give a trailing space at the end of a
 * paragraph. Accepting the keystroke and discarding it is the "no silent no-ops" failure.
 */
import {
  requireDefined,
  serializedState,
  testEnvironmentWithDisplaySyncs,
  viewOptions,
} from "./markerEdit.test-helpers";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $dfs } from "@lexical/utils";
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  LexicalEditor,
  NodeKey,
  TextNode,
} from "lexical";
import { $isVerseNode, displayRunDescriptor, DisplayRunKind, NBSP } from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

/** The verse's canonical glyph bytes in every fixture below: `\v` + NBSP + `1` + one separator. */
const GLYPH = `\\v${NBSP}1 `;

/** Each run kind that can ride beside a verse, and the verse attribute that puts it there. */
const seams: readonly { kind: DisplayRunKind; attributes: string }[] = [
  { kind: "va", attributes: `altnumber="3"` },
  { kind: "vp", attributes: `pubnumber="3"` },
];

function usx(attributes: string) {
  return (
    `<usx version="3.0"><book code="RUT" style="id">T</book>` +
    `<chapter number="1" style="c" />` +
    `<para style="p"><verse number="1" style="v" ${attributes} />text</para></usx>`
  );
}

async function mountEditor(attributes: string): Promise<LexicalEditor> {
  const { editor } = await testEnvironmentWithDisplaySyncs(
    serializedState(usxStringToUsj(usx(attributes))),
  );
  // Without DOM focus on the root, Lexical never reconciles the first editor-state selection and
  // the following update reads the empty DOM selection back over it.
  editor.getRootElement()?.focus();
  return editor;
}

/** The live verse glyph — the node holding the seam under test. */
function $verseGlyph(): TextNode {
  const hit = $dfs($getRoot()).find(({ node }) => $isVerseNode(node));
  return requireDefined($isTextNode(hit?.node) ? hit?.node : undefined, "no verse glyph");
}

/** The bytes the verse glyph currently SHOWS. */
function displayedGlyph(editor: LexicalEditor): string {
  let text = "";
  editor.getEditorState().read(() => (text = $verseGlyph().getTextContent()));
  return text;
}

/** The bytes `kind`'s run should show, derived from the verse's OWN state — the stored value a
 * typed space must never reach, read through the registry rather than a per-kind getter. */
function storedValue(editor: LexicalEditor, kind: DisplayRunKind): string | undefined {
  let text: string | undefined;
  editor
    .getEditorState()
    .read(() => (text = displayRunDescriptor(kind).expectedPieces($verseGlyph()).valueText));
  return text;
}

/** The whole document as USJ — the file side, which a typed separator space may not change. */
function documentUsj(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  return editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
}

/** The collapsed caret's committed landing, so a caret that fell to the seam (or to the document
 * start) cannot pass as success. */
function caretOf(editor: LexicalEditor): { key: NodeKey; offset: number } {
  let where = { key: "none", offset: -1 };
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && selection.isCollapsed())
      where = { key: selection.anchor.getNode().getKey(), offset: selection.anchor.offset };
  });
  return where;
}

/**
 * Put the caret at `offset` of the verse glyph and report that node's key, asserting the landing
 * before anything is typed. A caret that never took (Lexical reconciles an editor-state selection
 * only against a focused root) sends the keystroke somewhere else entirely and leaves the glyph
 * canonical — which is indistinguishable from the defect these tests pin, so it is ruled out here
 * rather than misread below.
 */
async function placeCaret(editor: LexicalEditor, offset: number) {
  let key = "none";
  await act(async () =>
    editor.update(() => {
      const glyph = $verseGlyph();
      key = glyph.getKey();
      glyph.select(offset, offset);
    }),
  );
  expect(caretOf(editor)).toEqual({ key, offset });
  return key;
}

/** Type `text` at the caret, as a keystroke does. */
async function type(editor: LexicalEditor, text: string) {
  await act(async () =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    }),
  );
}

/** Move the caret to the paragraph text after the run — outside the glyph — and let the departure
 * settle run. */
async function departCaret(editor: LexicalEditor) {
  await act(async () =>
    editor.update(() => {
      const hit = $dfs($getRoot()).find(
        ({ node }) => $isTextNode(node) && node.getTextContent() === "text",
      );
      const body = requireDefined(hit?.node, "the paragraph text is missing");
      if ($isTextNode(body)) body.select(0, 0);
    }),
  );
  await act(async () => undefined);
}

describe.each(seams)(
  "a space typed at a verse glyph's seam with its $kind run",
  ({ kind, attributes }) => {
    it("is inserted when typed between the number and the separator", async () => {
      const editor = await mountEditor(attributes);
      const before = documentUsj(editor);
      expect(displayedGlyph(editor)).toBe(GLYPH);

      // `\v` + NBSP + `1|` + separator — one before the glyph's end.
      const key = await placeCaret(editor, GLYPH.length - 1);
      await type(editor, " ");

      expect(displayedGlyph(editor)).toBe(`\\v${NBSP}1  `);
      expect(caretOf(editor)).toEqual({ key, offset: GLYPH.length });
      expect(storedValue(editor, kind)).toBe(`${NBSP}3`);
      expect(documentUsj(editor)).toEqual(before);
    });

    it("is inserted when typed at the glyph's end, where the run's opening glyph begins", async () => {
      const editor = await mountEditor(attributes);
      const before = documentUsj(editor);

      const key = await placeCaret(editor, GLYPH.length);
      await type(editor, " ");

      expect(displayedGlyph(editor)).toBe(`\\v${NBSP}1  `);
      expect(caretOf(editor)).toEqual({ key, offset: GLYPH.length + 1 });
      expect(storedValue(editor, kind)).toBe(`${NBSP}3`);
      expect(documentUsj(editor)).toEqual(before);
    });

    it("survives the caret's departure, for two spaces as readily as one", async () => {
      const editor = await mountEditor(attributes);
      const before = documentUsj(editor);

      const key = await placeCaret(editor, GLYPH.length);
      await type(editor, " ");
      await type(editor, " ");
      expect(caretOf(editor)).toEqual({ key, offset: GLYPH.length + 2 });

      await departCaret(editor);

      expect(displayedGlyph(editor)).toBe(`\\v${NBSP}1   `);
      expect(storedValue(editor, kind)).toBe(`${NBSP}3`);
      expect(documentUsj(editor)).toEqual(before);
    });

    it("still re-tokenizes a NON-whitespace byte typed there", async () => {
      // The gesture the licence must not swallow. Only whitespace past the number is the glyph's own
      // separator run; a real character there is document bytes, and the document those bytes spell
      // is a different one — `\\v 1 x\\va 3\\va*` is verse 1, text `x`, then a `\\va` span, because the
      // number no longer abuts its attribute run. The glyph stays canonical and the byte survives:
      // Invariant I working as intended, not the silent discard above.
      const editor = await mountEditor(attributes);

      await placeCaret(editor, GLYPH.length);
      await type(editor, "x");

      expect(displayedGlyph(editor)).toBe(GLYPH);
      const para = documentUsj(editor)?.content?.[2];
      expect(typeof para === "object" && para.content).toEqual([
        { type: "verse", marker: "v", number: "1" },
        "x",
        { type: "char", marker: kind, content: ["3"] },
        "text",
      ]);
    });
  },
);
