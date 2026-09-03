/**
 * A space typed in a display run's VALUE is inserted, stays visible, and leaves the caret
 * immediately after it — for every engine-owned run kind that shows a value behind a structural
 * separator: a verse's `\va`/`\vp`, a note's `\cat`, a chapter's `\ca`/`\cp`.
 *
 * All five behaved identically before this landed, and identically to the verse separator run the
 * sibling pins cover: with the caret at the value's end, pressing space showed `\va 12 \va*` while
 * the caret held the site, and caret departure snapped it back to `\va 12\va*` with `altnumber`
 * still `"12"`. The byte was accepted and then discarded — the "no silent no-ops" failure. It
 * happened at the separator before the value and at the value's end alike, and for two spaces as
 * readily as one.
 *
 * The rule: whitespace between an attribute marker and its value is STRUCTURAL. The writer emits
 * exactly one separator space whatever the screen shows, so a typed space never reaches the
 * document — the same licence the invariants already give a trailing space at the end of a
 * paragraph. Whitespace typed INSIDE the value is a different gesture: it respells the value, and
 * still settles onto owner state like any other value edit. Both halves are pinned here for every
 * kind, because a kind wired for one duty and not another is this codebase's recurring defect
 * shape.
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
  LexicalNode,
  NodeKey,
  TextNode,
} from "lexical";
import { displayRunDescriptor, DisplayRunKind, NBSP } from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

/** Every kind whose run shows a value behind a structural separator, and that value's spelling in
 * the fixture below. Driven off the registry — a new kind joins by adding a row, not by growing a
 * per-kind branch anywhere in this file. */
const runKinds: readonly { kind: DisplayRunKind; value: string }[] = [
  { kind: "va", value: "12" },
  { kind: "vp", value: "13" },
  { kind: "cat", value: "People" },
  { kind: "ca", value: "14" },
  { kind: "cp", value: "15" },
];

/** One paragraph carrying all five runs: a chapter and a verse with both attribute numbers each,
 * and an inline-expanded (unclosed) note with a category. */
const usx =
  `<usx version="3.0"><book code="RUT" style="id">T</book>` +
  `<chapter number="1" style="c" altnumber="14" pubnumber="15" />` +
  `<para style="p"><verse number="1" style="v" altnumber="12" pubnumber="13" />text` +
  `<note caller="+" style="f" closed="false" category="People">` +
  `<char style="ft" closed="false">A note</char></note> after</para></usx>`;

async function mountEditor(): Promise<LexicalEditor> {
  const { editor } = await testEnvironmentWithDisplaySyncs(serializedState(usxStringToUsj(usx)));
  // Without DOM focus on the root, Lexical never reconciles the first editor-state selection and
  // the following update reads the empty DOM selection back over it.
  editor.getRootElement()?.focus();
  return editor;
}

/** The owner of `kind`'s run, located through that kind's own owner predicate. */
function $ownerOf(kind: DisplayRunKind): LexicalNode {
  const { ownerPredicate } = displayRunDescriptor(kind);
  const hit = $dfs($getRoot()).find(({ node }) => ownerPredicate(node));
  return requireDefined(hit?.node, `no owner found for the ${kind} run`);
}

/** The live value node of `kind`'s run. */
function $valueOf(kind: DisplayRunKind): TextNode {
  const value = displayRunDescriptor(kind).scanPieces($ownerOf(kind)).value;
  return requireDefined($isTextNode(value) ? value : undefined, `no ${kind} value node`);
}

/** The bytes `kind`'s run currently SHOWS. */
function displayedValue(editor: LexicalEditor, kind: DisplayRunKind): string {
  let text = "";
  editor.getEditorState().read(() => (text = $valueOf(kind).getTextContent()));
  return text;
}

/** The bytes `kind`'s run should show, derived from OWNER STATE alone — the stored value under
 * test, read through the registry rather than a per-kind getter. */
function storedValue(editor: LexicalEditor, kind: DisplayRunKind): string | undefined {
  let text: string | undefined;
  editor
    .getEditorState()
    .read(() => (text = displayRunDescriptor(kind).expectedPieces($ownerOf(kind)).valueText));
  return text;
}

/** The whole document as USJ — the file side, which a typed separator space may not change. */
function documentUsj(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  return editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
}

/** The collapsed caret's committed landing, so a caret that fell to the document start cannot
 * pass as success. */
function caretOf(editor: LexicalEditor): { key: NodeKey; offset: number } {
  let where = { key: "none", offset: -1 };
  editor.getEditorState().read(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection) && selection.isCollapsed())
      where = { key: selection.anchor.getNode().getKey(), offset: selection.anchor.offset };
  });
  return where;
}

/** Put the caret at `offset` of `kind`'s value node and report that node's key. */
async function placeCaret(editor: LexicalEditor, kind: DisplayRunKind, offset: number) {
  let key = "none";
  await act(async () =>
    editor.update(() => {
      const value = $valueOf(kind);
      key = value.getKey();
      value.select(offset, offset);
    }),
  );
  return key;
}

/** Type one space at the caret, as a keystroke does. */
async function typeSpace(editor: LexicalEditor) {
  await act(async () =>
    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(" ");
    }),
  );
}

/** Move the caret to the paragraph text after the note — outside every run under test — and let
 * the departure settle run. */
async function departCaret(editor: LexicalEditor) {
  await act(async () =>
    editor.update(() => {
      const hit = $dfs($getRoot()).find(
        ({ node }) => $isTextNode(node) && node.getTextContent().includes("after"),
      );
      const text = requireDefined(hit?.node, "the text after the note is missing");
      if ($isTextNode(text)) text.select(0, 0);
    }),
  );
  await act(async () => undefined);
}

describe.each(runKinds)("a space typed in a $kind run's value", ({ kind, value }) => {
  /** Where the fixture's run starts: the structural separator, then the value. */
  const canonical = `${NBSP}${value}`;

  it("survives the settle when typed in the separator, before the value", async () => {
    const editor = await mountEditor();
    const before = documentUsj(editor);
    expect(displayedValue(editor, kind)).toBe(canonical);

    const key = await placeCaret(editor, kind, 1);
    await typeSpace(editor);

    // Visible while the caret holds the site, with the caret immediately after the typed byte.
    expect(displayedValue(editor, kind)).toBe(`${NBSP} ${value}`);
    expect(caretOf(editor)).toEqual({ key, offset: 2 });

    await departCaret(editor);

    // Still there after the settle, and nothing about the stored value moved.
    expect(displayedValue(editor, kind)).toBe(`${NBSP} ${value}`);
    expect(storedValue(editor, kind)).toBe(canonical);
    expect(documentUsj(editor)).toEqual(before);
  });

  it("survives the settle when typed at the value's end", async () => {
    const editor = await mountEditor();
    const before = documentUsj(editor);

    const key = await placeCaret(editor, kind, canonical.length);
    await typeSpace(editor);

    expect(displayedValue(editor, kind)).toBe(`${canonical} `);
    expect(caretOf(editor)).toEqual({ key, offset: canonical.length + 1 });

    await departCaret(editor);

    expect(displayedValue(editor, kind)).toBe(`${canonical} `);
    expect(storedValue(editor, kind)).toBe(canonical);
    expect(documentUsj(editor)).toEqual(before);
  });

  it("survives the settle for two spaces, the same as one", async () => {
    const editor = await mountEditor();
    const before = documentUsj(editor);

    const key = await placeCaret(editor, kind, canonical.length);
    await typeSpace(editor);
    await typeSpace(editor);

    expect(caretOf(editor)).toEqual({ key, offset: canonical.length + 2 });

    await departCaret(editor);

    expect(displayedValue(editor, kind)).toBe(`${canonical}  `);
    expect(storedValue(editor, kind)).toBe(canonical);
    expect(documentUsj(editor)).toEqual(before);
  });

  it("still folds a space typed INSIDE the value onto owner state", async () => {
    // The gesture the licence must not swallow: whitespace between two characters of the value
    // respells it, so it settles onto owner state exactly like any other value edit.
    const editor = await mountEditor();

    const key = await placeCaret(editor, kind, 2);
    await typeSpace(editor);
    expect(caretOf(editor)).toEqual({ key, offset: 3 });

    await departCaret(editor);

    const respelled = `${NBSP}${value[0]} ${value.slice(1)}`;
    expect(storedValue(editor, kind)).toBe(respelled);
    expect(displayedValue(editor, kind)).toBe(respelled);
  });
});
