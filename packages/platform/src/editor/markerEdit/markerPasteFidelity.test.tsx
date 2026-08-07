/**
 * Multi-line marker-bearing paste semantics (live-verified, 2026-08-07) and the `\c`/`\id` strip.
 * A pasted line starting with its own paragraph-marker literal owns that marker instead of also
 * getting the host paragraph's cloned prefix; a marker-free line inherits the host's. `\c`/`\id`
 * never survive paste normalization — pasting either used to be able to reach an unsaveable
 * editor state (a second chapter/book-id node the PDP rejects on save). Kept separate from
 * `whitespaceDisplay.plugin.utils.test.tsx` (the NBSP/claim-policy contract) and
 * `clipboardCopyFidelity.test.tsx` (copy-side byte fidelity) so this file stays focused on the
 * paste-side STRUCTURAL outcome: which paragraphs/markers/nodes a marker-bearing paste produces.
 */
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  findOnlyNote,
  historyTestEnvironment,
  serializedState,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
// Reaching inside only for tests (same pattern as markerEdit.test-helpers).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { MarkerObject, Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { $dfs } from "@lexical/utils";
import {
  $createTextNode,
  $getRoot,
  $isTextNode,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  getVisibleOpenMarkerText,
} from "shared";

/** A `text/plain`-only paste stub — the same minimal jsdom-safe shape every sibling suite in this
 * directory defines locally (jsdom implements neither `ClipboardEvent` nor `DataTransfer`). */
function pasteEvent(payload: { [key: string]: string }): { event: ClipboardEvent } {
  const clipboardData = { getData: (type: string) => payload[type] ?? "" };
  const event = { clipboardData, preventDefault: () => undefined } as unknown as ClipboardEvent;
  return { event };
}

/** Paste `text` at the caret, then flush the double microtask Tier 2's post-paste reconciliation
 * needs to settle — the same pattern every paste-adjacent suite in this directory uses. */
async function pasteAndSettle(
  editor: LexicalEditor,
  $select: () => void,
  text: string,
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      $select();
      editor.dispatchCommand(PASTE_COMMAND, pasteEvent({ "text/plain": text }).event);
    }),
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** One UNDO_COMMAND dispatch, flushed the same way a paste is. */
async function undoAndSettle(editor: LexicalEditor): Promise<void> {
  await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The current document as USJ, via the same `toJSON` → deserialize path every sibling suite
 * reads settled state through. */
function usjOf(editor: LexicalEditor): Usj {
  const usj = editor
    .getEditorState()
    .read(() => deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions));
  if (!usj) throw new Error("editor state did not serialize to USJ");
  return usj;
}

/** All plain-text content of a top-level `MarkerObject`, joined — ignores nested objects (verses,
 * notes); sufficient for the pure-text paragraphs these pins build. */
function textOf(content: MarkerObject): string {
  return (content.content ?? [])
    .filter((item): item is string => typeof item === "string")
    .join("");
}

/** `[marker, textOf(paragraph)]` for every top-level paragraph in `usj` — the shape the brief's
 * pins assert against. */
function paraMarkerText(usj: Usj): [string | undefined, string][] {
  return (usj.content as MarkerObject[]).map((content) => [content.marker, textOf(content)]);
}

/** A fresh single-paragraph `\p A` host, with `HistoryPlugin` mounted so undo is available. */
async function singleParaHost(): Promise<{ editor: LexicalEditor; text: TextNode }> {
  initializeDeserialize(undefined);
  let text!: TextNode;
  const { editor } = await historyTestEnvironment(() => {
    const para = $createParaNode("p");
    text = $createTextNode("A");
    $getRoot().append(para.append($createMarkerNode("p"), text));
  });
  return { editor, text };
}

describe("multi-line marker-bearing paste semantics (live-verified 2026-08-07)", () => {
  it('paste "\\p one\\n\\p two" at end of "\\p A": no doubled markers, no empty stray paragraph', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "\\p one\n\\p two");

    expect(paraMarkerText(usjOf(editor))).toEqual([
      ["p", "A"],
      ["p", "one"],
      ["p", "two"],
    ]);
  });

  it('undo after "\\p one\\n\\p two" restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await singleParaHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(1, 1), "\\p one\n\\p two");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  it('paste marker-free "one\\ntwo" at end of "\\p A": both lines inherit the host marker (existing behavior, re-pinned)', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "one\ntwo");

    expect(paraMarkerText(usjOf(editor))).toEqual([
      ["p", "Aone"],
      ["p", "two"],
    ]);
  });

  it('undo after marker-free "one\\ntwo" restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await singleParaHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(1, 1), "one\ntwo");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  it('paste "tail\\n\\q1 line" at end of "\\p A": first line merges into the host, second owns its own marker', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "tail\n\\q1 line");

    expect(paraMarkerText(usjOf(editor))).toEqual([
      ["p", "Atail"],
      ["q1", "line"],
    ]);
  });

  it('undo after "tail\\n\\q1 line" restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await singleParaHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(1, 1), "tail\n\\q1 line");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  /** A `\p` host with a verse, for the note/verse-materialization pins below. */
  async function versedHost(): Promise<{ editor: LexicalEditor; text: TextNode }> {
    initializeDeserialize(undefined);
    let text!: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
      text = $createTextNode("In the beginning God created");
      $getRoot().append(para.append($createMarkerNode("p"), verse, text));
    });
    return { editor, text };
  }

  it('paste "\\f + \\ft note\\f*" mid-verse: a collapsed NoteNode materializes with USJ caller "+"', async () => {
    const { editor, text } = await versedHost();
    await pasteAndSettle(editor, () => text.select(9, 9), "\\f + \\ft note\\f*"); // "In the be|ginning..."

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getMarker()).toBe("f");
      expect(note.getCaller()).toBe("+");
      expect(note.getIsCollapsed()).toBe(true);
    });
    const para = (usjOf(editor).content as MarkerObject[])[0];
    const note = para.content?.find(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "note",
    );
    expect(note).toBeDefined();
    expect(note?.marker).toBe("f");
    expect(note?.caller).toBe("+");
  });

  it('undo after "\\f + \\ft note\\f*" mid-verse restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await versedHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(9, 9), "\\f + \\ft note\\f*");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  it('paste "\\v 2 rest" at paragraph end: a real VerseNode is created, the verse sequence stays sane', async () => {
    const { editor, text } = await versedHost();
    const end = "In the beginning God created".length;
    await pasteAndSettle(editor, () => text.select(end, end), "\\v 2 rest");

    const para = (usjOf(editor).content as MarkerObject[])[0];
    const verses = (para.content ?? []).filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "verse",
    );
    expect(verses.map((verse) => verse.number)).toEqual(["1", "2"]);
  });

  it('undo after "\\v 2 rest" restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await versedHost();
    const preUsj = usjOf(editor);
    const end = "In the beginning God created".length;

    await pasteAndSettle(editor, () => text.select(end, end), "\\v 2 rest");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });
});

describe("\\c/\\id strip on paste", () => {
  it('paste "\\c 5" on its own line mid-chapter: no chapter node created, no "\\c" survives, content unchanged', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "\\c 5");

    const usj = usjOf(editor);
    expect(paraMarkerText(usj)).toEqual([["p", "A"]]);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain("\\c");
    });
  });

  it('undo after pasting bare "\\c 5" (a no-op paste) leaves the USJ unchanged', async () => {
    const { editor, text } = await singleParaHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(1, 1), "\\c 5");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  it('paste "\\id GEN" is stripped the same way as "\\c"', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "\\id GEN");

    const usj = usjOf(editor);
    expect(paraMarkerText(usj)).toEqual([["p", "A"]]);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain("\\id");
    });
  });

  it('paste "before\\n\\c 5\\nafter": the "\\c" line vanishes, "before"/"after" paste per the normal multi-line rules', async () => {
    const { editor, text } = await singleParaHost();
    await pasteAndSettle(editor, () => text.select(1, 1), "before\n\\c 5\nafter");

    expect(paraMarkerText(usjOf(editor))).toEqual([
      ["p", "Abefore"],
      ["p", "after"],
    ]);
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain("\\c");
    });
  });

  it('undo after "before\\n\\c 5\\nafter" restores the exact pre-paste USJ in one step', async () => {
    const { editor, text } = await singleParaHost();
    const preUsj = usjOf(editor);

    await pasteAndSettle(editor, () => text.select(1, 1), "before\n\\c 5\nafter");
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });

  it("a pasted \\c never leaves the editor in the unsaveable state the live repro produced: exactly one chapter survives, and the document still deserializes cleanly", async () => {
    // Live repro (2026-08-07): pasting a bare `\c 2` mid-chapter put a second chapter node in a
    // real book/chapter/paragraph document, and every subsequent save failed with the PDP's
    // "Multiple chapter markers present" — the error surfaced only in the renderer log, so disk
    // and other editors silently stopped updating. Reproduced here in a realistic book+chapter+
    // paragraph document (not the bare single-paragraph fixture the pins above use) so the
    // chapter-count assertion means something.
    initializeDeserialize(undefined);
    const usx = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id">Ruth</book><chapter number="1" style="c" />` +
        `<para style="p">before after</para></usx>`,
    );
    const { editor } = await baseTestEnvironment(
      serializedState(usx),
      <MarkerEditPlugin viewOptions={viewOptions} />,
    );
    let text: TextNode | undefined;
    editor.getEditorState().read(() => {
      text = $dfs($getRoot())
        .map(({ node }) => node)
        .filter($isTextNode)
        .find((node) => node.getTextContent().includes("before"));
    });
    if (!text) throw new Error("host text node not found in the book/chapter/paragraph fixture");
    const hostText = text;

    await pasteAndSettle(editor, () => hostText.select(7, 7), "\\c 5");

    const usj = usjOf(editor);
    const chapters = usj.content.filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "chapter",
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0].number).toBe("1"); // the ORIGINAL chapter, untouched — not the pasted "5"
    // A saveable USJ is one that deserializes back through the same adaptor cleanly — re-running
    // it here is the same "read the settled state" step an onUsjChange-style save path takes.
    expect(() => usjOf(editor)).not.toThrow();
  });
});
