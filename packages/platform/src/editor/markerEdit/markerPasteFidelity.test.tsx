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
  $setState,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  getVisibleOpenMarkerText,
  NBSP,
  textTypeState,
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

/** Like `pasteAndSettle`, but takes the full clipboard payload map rather than assuming a bare
 * `text/plain` string — used by the S4 equivalence pins below to dispatch a "full" (plain+html)
 * payload and compare it against a plain-only one. */
async function pastePayloadAndSettle(
  editor: LexicalEditor,
  $select: () => void,
  payload: { [key: string]: string },
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      $select();
      editor.dispatchCommand(PASTE_COMMAND, pasteEvent(payload).event);
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

/** `[marker, textOf(paragraph)]` for every top-level paragraph in `usj`. Fails loudly (rather than
 * silently reading `undefined` off a string via an unchecked cast) if any top-level entry is a
 * bare STRING instead of a paragraph-shaped object — a chapter/verse/book token splitting the
 * enclosing paragraph and stranding plain text outside it is exactly the poisoned-save shape a
 * leaked `\c`/`\id` produces (see the `\c/\id strip on paste` describe below), and a helper that
 * masked that shape instead of erroring could hide the very regression these pins exist to catch. */
function paraMarkerText(usj: Usj): [string | undefined, string][] {
  return usj.content.map((content, index) => {
    if (typeof content === "string")
      throw new Error(
        `expected a paragraph-shaped object at usj.content[${index}], found a bare string: ${JSON.stringify(content)}`,
      );
    return [content.marker, textOf(content)];
  });
}

/** A realistic book+chapter+paragraph document (`usxStringToUsj`, not the bare single-paragraph
 * fixture `singleParaHost` builds) — needed for chapter/book-COUNT assertions, which are
 * meaningless without a real chapter/book already present for a pasted `\c`/`\id` to (not)
 * duplicate. Returns the editor and the paragraph's own text node ("before after"). */
async function bookChapterParaHost(): Promise<{ editor: LexicalEditor; text: TextNode }> {
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
  return { editor, text };
}

/** Every top-level bare STRING entry in `usj.content` — should always be empty. A non-empty
 * result means a chapter/verse/book token split the enclosing paragraph and stranded plain text
 * outside it: the poisoned-save shape a leaked `\c`/`\id` produces. */
function topLevelBareStrings(usj: Usj): string[] {
  return usj.content.filter((item): item is string => typeof item === "string");
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

  it("a pasted \\c never leaves the editor in the unsaveable state the live repro produced: exactly one chapter survives, no bare top-level string strands outside the paragraph", async () => {
    // Live repro (2026-08-07): pasting a bare `\c 2` mid-chapter put a second chapter node in a
    // real book/chapter/paragraph document, and every subsequent save failed with the PDP's
    // "Multiple chapter markers present" — the error surfaced only in the renderer log, so disk
    // and other editors silently stopped updating. Reproduced here in a realistic book+chapter+
    // paragraph document (not the bare single-paragraph fixture the pins above use) so the
    // chapter-count assertion means something.
    const { editor, text } = await bookChapterParaHost();

    await pasteAndSettle(editor, () => text.select(7, 7), "\\c 5");

    const usj = usjOf(editor);
    const chapters = usj.content.filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "chapter",
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0].number).toBe("1"); // the ORIGINAL chapter, untouched — not the pasted "5"
    // A bare top-level string is the other half of the poisoned shape: a chapter token closes the
    // enclosing paragraph the same way it does on a real load, stranding whatever text followed
    // it outside any paragraph at all.
    expect(topLevelBareStrings(usj)).toEqual([]);
  });

  it('paste "x \\c 5 y" mid-paragraph (the token is NOT at the start of its line): still exactly one chapter, no stranded top-level string', async () => {
    // The `\c`/`\id` strip is not anchored to a line's start — a token can land mid-sentence
    // (a paste that doesn't happen to fall on a line boundary), and an anchored strip would miss
    // it entirely: the unstripped shape reproduces the SAME poisoning (a second chapter node) PLUS
    // a bare top-level string for whatever followed the marker's payload, since a chapter token
    // still closes the enclosing paragraph wherever it lands.
    const { editor, text } = await bookChapterParaHost();

    await pasteAndSettle(editor, () => text.select(7, 7), "x \\c 5 y");

    const usj = usjOf(editor);
    const chapters = usj.content.filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "chapter",
    );
    expect(chapters).toHaveLength(1);
    expect(chapters[0].number).toBe("1");
    // Not asserting `not.toContain("\\c")` on the whole document here: this fixture's OWN book
    // legitimately carries a real "\c 1" glyph, unlike the bare single-paragraph fixture the
    // earlier pins use — the chapter-count and paragraph-content assertions already cover what
    // matters (the pasted "\c 5" left no trace, structural or textual, inside the paragraph).
    expect(topLevelBareStrings(usj)).toEqual([]);
    expect((usj.content[2] as MarkerObject).content).toEqual(["before x after"]);
  });

  it('paste "text \\id GEN more" mid-paragraph: still exactly one book id, one chapter, no stranded top-level string', async () => {
    const { editor, text } = await bookChapterParaHost();

    await pasteAndSettle(editor, () => text.select(7, 7), "text \\id GEN more");

    const usj = usjOf(editor);
    const books = usj.content.filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "book",
    );
    const chapters = usj.content.filter(
      (item): item is MarkerObject => typeof item !== "string" && item.type === "chapter",
    );
    expect(books).toHaveLength(1);
    expect(books[0].code).toBe("RUT"); // the ORIGINAL book, untouched — not the pasted "GEN"
    expect(chapters).toHaveLength(1);
    expect(topLevelBareStrings(usj)).toEqual([]);
    expect((usj.content[2] as MarkerObject).content).toEqual(["before text after"]);
  });
});

describe("own-marker-prefix dedup: unknown/custom.sty markers", () => {
  it('paste "\\zz one two" into an EMPTY "\\p" host: the unrecognized marker still owns the paragraph — no stray empty leading paragraph', async () => {
    // The dedup's embedded-literal check must classify markers the SAME way `$buildParaFragment`'s
    // own guard does (stylesheet-first, unknown-as-paragraph) — a narrower `type ===
    // MarkerType.Paragraph` comparison rejected every unknown/custom.sty marker and left this
    // exact shape (a paste starting with its own marker literal into an already-prefixed empty
    // paragraph) producing a stray empty host paragraph for any marker the bundled sheet doesn't
    // recognize.
    initializeDeserialize(undefined);
    let sep!: TextNode;
    const { editor } = await historyTestEnvironment(() => {
      const para = $createParaNode("p");
      sep = $createTextNode(NBSP);
      $setState(sep, textTypeState, "marker-trailing-space");
      $getRoot().append(para.append($createMarkerNode("p"), sep));
    });

    await pasteAndSettle(
      editor,
      () => sep.select(sep.getTextContentSize(), sep.getTextContentSize()),
      "\\zz one two",
    );

    expect(paraMarkerText(usjOf(editor))).toEqual([["zz", "one two"]]);
  });
});

describe("paste-as-plain-text equivalence (S4): no literal mode, plain always wins", () => {
  // S4 (docs/superpowers/specs/2026-08-06-clipboard-semantics.md): Ctrl+Shift+V / "paste as plain
  // text" narrows the clipboard payload down to `text/plain` only, but `$handlePasteForStandardView`
  // reads `text/plain` unconditionally whenever it is present — the `text/html` leg only comes into
  // play when `text/plain` is ABSENT (`htmlPasteText(html)` fallback). So a full (plain+html) paste
  // and a plain-only paste of the SAME `text/plain` bytes must produce byte-identical final USJ: by
  // construction, not by coincidence. Each pin below dispatches the same paste text twice, on two
  // fresh hosts — once with a DELIBERATELY mismatched `text/html` alongside it (proving html is
  // ignored outright, not merely equivalent to plain here) and once with `text/plain` alone — then
  // asserts the two final documents are identical. There is no separate "paste literally, don't
  // tokenize markers" code path in Standard view (matching P9, which has no Paste Special either):
  // the second pin below additionally asserts a plain-only paste still tokenizes a marker pair into
  // a real CharNode rather than leaving it as literal `\marker` text.
  const MISMATCHED_HTML = "<p>this text must never appear in the pasted result</p>";

  it('"\\p one\\n\\p two" (multi-line paragraph split): full (plain+html) payload and plain-only payload paste identically', async () => {
    const hostA = await singleParaHost();
    const hostB = await singleParaHost();
    const text = "\\p one\n\\p two";

    await pastePayloadAndSettle(hostA.editor, () => hostA.text.select(1, 1), {
      "text/plain": text,
      "text/html": MISMATCHED_HTML,
    });
    await pastePayloadAndSettle(hostB.editor, () => hostB.text.select(1, 1), {
      "text/plain": text,
    });

    const usjA = usjOf(hostA.editor);
    const usjB = usjOf(hostB.editor);
    expect(usjA).toEqual(usjB);
    // Matches the multi-line marker-bearing paste pin above for this exact fixture: no doubled
    // markers, no stray empty paragraph.
    expect(paraMarkerText(usjA)).toEqual([
      ["p", "A"],
      ["p", "one"],
      ["p", "two"],
    ]);
    hostA.editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain("must never appear");
    });
  });

  it('"\\nd Lord\\nd* " (marker-bearing inline span): full (plain+html) payload and plain-only payload paste identically, and the plain-only payload still tokenizes — there is no literal mode', async () => {
    const hostA = await singleParaHost();
    const hostB = await singleParaHost();
    const text = "\\nd Lord\\nd* ";

    await pastePayloadAndSettle(hostA.editor, () => hostA.text.select(1, 1), {
      "text/plain": text,
      "text/html": MISMATCHED_HTML,
    });
    await pastePayloadAndSettle(hostB.editor, () => hostB.text.select(1, 1), {
      "text/plain": text,
    });

    const usjA = usjOf(hostA.editor);
    const usjB = usjOf(hostB.editor);
    expect(usjA).toEqual(usjB);
    hostA.editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).not.toContain("must never appear");
    });
    // "No literal mode": the plain-only payload's `\nd`…`\nd*` pair must be recognized by Tier 2
    // and rebuilt as a real CharNode, not survive as unrecognized literal marker text.
    hostB.editor.getEditorState().read(() => {
      const chars = $dfs($getRoot())
        .map(({ node }) => node)
        .filter($isCharNode);
      const ndChars = chars.filter((char) => char.getMarker() === "nd");
      expect(ndChars).toHaveLength(1);
      expect(ndChars[0].getTextContent()).toContain("Lord");
    });
  });
});
