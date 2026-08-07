/**
 * Copy-fidelity pins for Standard-view `text/plain`: note callers (previously silently dropped),
 * source-faithful NBSP handling around a collapsed note's internal markers (previously a blanket
 * NBSP→space mapping produced phantom spaces the source USFM never had), multi-paragraph joining,
 * and the copy→paste USJ round trip. Kept separate from `whitespaceDisplay.plugin.utils.test.tsx`
 * (which already covers the NBSP display-run invariant and the plain payload-builder contract) so
 * this file can stay focused on `$selectionToUsfmText`'s USFM-shape behavior.
 */
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  $appendVerseAttributeRun,
  findOnlyNote,
  serializedState,
  testEnvironment,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import { $dfs } from "@lexical/utils";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $setSelection,
  $setState,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isNoteNode,
  getVisibleOpenMarkerText,
  NBSP,
  NoteNode,
  textTypeState,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { Usj } from "@eten-tech-foundation/scripture-utilities";

/**
 * jsdom doesn't implement `ClipboardEvent`/`DataTransfer` (see
 * `whitespaceDisplay.plugin.utils.test.tsx`'s identically-shaped `copyEvent`); the handlers under
 * test only touch `clipboardData.getData`/`setData`/`preventDefault`, so a minimal stub covers
 * both copy/cut dispatch and paste dispatch.
 */
function copyEvent(): { event: ClipboardEvent; getData: (type: string) => string } {
  const store = new Map<string, string>();
  const clipboardData = {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, data: string) => {
      store.set(type, data);
    },
  };
  return {
    event: { clipboardData, preventDefault: vi.fn() } as unknown as ClipboardEvent,
    getData: (type: string) => clipboardData.getData(type),
  };
}

// jsdom implements neither `ClipboardEvent` nor `DragEvent`, but Lexical's default (non-Standard-
// view-specific) paste path — reached once our copied text carries no NBSP for
// `$handlePasteForStandardView` to claim — checks `instanceof`/class-name against both to decide
// whether a paste carries files. Same stub as `markerEditDeletion.utils.test.tsx`'s round-trip
// paste test; only defined if not already present (a shared jsdom global, not per-file).
const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
if (typeof globalStubs.DragEvent === "undefined")
  globalStubs.DragEvent = class DragEvent extends Event {};
if (typeof globalStubs.ClipboardEvent === "undefined")
  globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

/** A `text/plain`-only paste stub (`types`/`files` present — `@lexical/clipboard`'s default
 * text/plain handling reads them — matching `markerEditDeletion.utils.test.tsx`'s
 * `plainTextPasteEvent`). */
function plainTextPasteEvent(text: string): ClipboardEvent {
  const clipboardData = {
    types: ["text/plain"],
    files: [],
    getData: (type: string) => (type === "text/plain" ? text : ""),
  };
  return { clipboardData, preventDefault: () => undefined } as unknown as ClipboardEvent;
}

/** A source-faithful (real space after the marker glyph) `marker-trailing-space` separator, the
 * shape `usj-editor.adaptor.ts`'s `createPara` builds after a paragraph's own opening marker. */
function $trailingSpaceNode(): TextNode {
  const spaceNode = $createTextNode(NBSP);
  $setState(spaceNode, textTypeState, "marker-trailing-space");
  return spaceNode;
}

/** Selects an entire (inline) node — its first descendant's start through its last descendant's
 * end — the shape needed to select a whole `NoteNode` regardless of collapsed/expanded layout. */
function $selectWholeNode(node: NoteNode): void {
  const first = node.getFirstDescendant();
  const last = node.getLastDescendant();
  if (!first || !last) throw new Error("node has no descendants to select");
  const selection = $createRangeSelection();
  selection.anchor = $createPoint(first.getKey(), 0, "text");
  selection.focus = $createPoint(last.getKey(), last.getTextContentSize(), "text");
  $setSelection(selection);
}

/** Selects the whole document (every top-level block) — used for whole-paragraph-selection pins
 * against a single-paragraph fixture. */
function $selectWholeDocument(): void {
  const root = $getRoot();
  root.select(0, root.getChildrenSize());
}

/** Number of `NoteNode`s currently in the tree — used to pin cut's removal without asserting on
 * node-tree shape. */
function $countNotes(): number {
  return $dfs($getRoot()).filter(({ node }) => $isNoteNode(node)).length;
}

/** A `\p` paragraph: `\v 1 In the beginning` + a collapsed note with `caller` + ` God created.`,
 * parameterized on the note's USJ caller. */
function noteUsj(caller: string): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      {
        type: "para",
        marker: "p",
        content: [
          { type: "verse", marker: "v", number: "1" },
          "In the beginning",
          {
            type: "note",
            marker: "f",
            caller,
            content: [
              { type: "char", marker: "fr", content: ["1.1 "] },
              { type: "char", marker: "ft", content: ["A note."] },
            ],
          },
          " God created.",
        ],
      },
    ],
  } as unknown as Usj;
}

/**
 * The 2026-08-07 live-repro footnote: `\f - \fr 1:1 \ft Caller test.\f*` — content chars carry
 * `closed: "false"` (ParatextData's real shape for footnote content — `\fr`/`\ft` never get their
 * own closer), matching the exact bytes the repro pinned.
 */
function footnoteReproUsj(): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "note",
            marker: "f",
            caller: "-",
            content: [
              { type: "char", marker: "fr", content: ["1:1 "], closed: "false" },
              { type: "char", marker: "ft", content: ["Caller test."], closed: "false" },
            ],
          },
        ],
      },
    ],
  } as unknown as Usj;
}

/**
 * The 2026-08-07 live-repro cross-reference: `\x - \xo 1:3: \xo*\xt 2Cor 4:6\xt*\x*` — content
 * chars carry no `closed` flag (explicitly closed, real cross-reference shape), matching the exact
 * bytes the repro pinned.
 */
function xrefReproUsj(): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      {
        type: "para",
        marker: "p",
        content: [
          {
            type: "note",
            marker: "x",
            caller: "-",
            content: [
              { type: "char", marker: "xo", content: ["1:3: "] },
              { type: "char", marker: "xt", content: ["2Cor 4:6"] },
            ],
          },
        ],
      },
    ],
  } as unknown as Usj;
}

/** Mounts a headless Standard-view editor (`MarkerEditPlugin`) with `usj` loaded. */
async function renderUsjEditor(usj: Usj): Promise<{ editor: LexicalEditor }> {
  return baseTestEnvironment(serializedState(usj), <MarkerEditPlugin viewOptions={viewOptions} />);
}

describe("note caller fidelity", () => {
  it.each([
    ["+", "\\f + "],
    ["a", "\\f a "],
    ["-", "\\f - "],
  ])(
    "copies a collapsed note's %s caller into text/plain, correctly placed",
    async (caller, expectedOpen) => {
      const { editor } = await renderUsjEditor(noteUsj(caller));
      await act(async () => editor.update($selectWholeDocument));
      const { event, getData } = copyEvent();
      await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
      const textPlain = getData("text/plain");
      expect(textPlain).toContain(expectedOpen);
      expect(textPlain).toContain("\\f*");
    },
  );

  it("places the caller correctly relative to the surrounding verse text and the note's own closer", async () => {
    const { editor } = await renderUsjEditor(noteUsj("+"));
    await act(async () => editor.update($selectWholeDocument));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    expect(getData("text/plain")).toMatch(/^\\p \\v 1 In the beginning\\f \+ /);
  });
});

describe("phantom-space live-repro pins (2026-08-07) — collapsed note, byte-identical to source", () => {
  it("copies an unclosed footnote's internal markers with no phantom spaces (caller included)", async () => {
    const { editor } = await renderUsjEditor(footnoteReproUsj());
    let note!: NoteNode;
    editor.getEditorState().read(() => {
      note = findOnlyNote($getRoot());
    });
    await act(async () => editor.update(() => $selectWholeNode(note)));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    // "What you copy" > "what you see": a COLLAPSED note's full hidden bytes are the payload.
    expect(getData("text/plain")).toBe("\\f - \\fr 1:1 \\ft Caller test.\\f*");
  });

  it("copies a closed cross-reference's internal markers with no phantom spaces after each closer", async () => {
    const { editor } = await renderUsjEditor(xrefReproUsj());
    let note!: NoteNode;
    editor.getEditorState().read(() => {
      note = findOnlyNote($getRoot());
    });
    await act(async () => editor.update(() => $selectWholeNode(note)));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    expect(getData("text/plain")).toBe("\\x - \\xo 1:3: \\xo*\\xt 2Cor 4:6\\xt*\\x*");
  });
});

describe("multi-paragraph selections", () => {
  it("joins a full multi-paragraph selection with a single \\n, each paragraph keeping its own \\marker", async () => {
    let secondText: TextNode;
    const { editor } = await testEnvironment(() => {
      const firstText = $createTextNode("one");
      secondText = $createTextNode("two");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpaceNode(), firstText),
        $createParaNode("q1").append($createMarkerNode("q1"), $trailingSpaceNode(), secondText),
      );
    });
    await act(async () =>
      editor.update(() => {
        // A "full paragraph" selection anchors at the PARAGRAPH's own element start (before its
        // \marker glyph), not at the first content TextNode — anchoring directly on the text
        // node would exclude the marker/trailing-space siblings that precede it, exactly like
        // the "starts mid-paragraph" test below (deliberately) does.
        const firstPara = $getRoot().getFirstChildOrThrow();
        const selection = $createRangeSelection();
        selection.anchor = $createPoint(firstPara.getKey(), 0, "element");
        selection.focus = $createPoint(
          secondText.getKey(),
          secondText.getTextContentSize(),
          "text",
        );
        $setSelection(selection);
      }),
    );
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    expect(getData("text/plain")).toBe("\\p one\n\\q1 two");
  });

  it("omits the first paragraph's own \\marker glyph when the selection starts mid-paragraph", async () => {
    let firstText: TextNode;
    let secondText: TextNode;
    const { editor } = await testEnvironment(() => {
      firstText = $createTextNode("before tail");
      secondText = $createTextNode("two");
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $trailingSpaceNode(), firstText),
        $createParaNode("q1").append($createMarkerNode("q1"), $trailingSpaceNode(), secondText),
      );
    });
    await act(async () =>
      editor.update(() => {
        const selection = $createRangeSelection();
        selection.anchor = $createPoint(firstText.getKey(), "before ".length, "text");
        selection.focus = $createPoint(
          secondText.getKey(),
          secondText.getTextContentSize(),
          "text",
        );
        $setSelection(selection);
      }),
    );
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    expect(getData("text/plain")).toBe("tail\n\\q1 two");
  });
});

describe("AttributeRunNode traversal", () => {
  // The wrapper contributes no bytes of its own (`usj-editor.adaptor.ts`'s `addVerseAttributeRun`
  // wraps a verse's `\va`/`\vp` triplet in one `AttributeRunNode`, the same "run lives inside a
  // container" shape a milestone's attribute run gets) — a selection spanning it must still carry
  // the wrapped opening marker, NBSP-prefixed value, and closing marker, with no extra separator
  // contributed by the wrapper itself, and the plain text on either side must not be disturbed.
  it("copies a selection spanning a wrapped verse \\va attribute run transparently, byte-exact", async () => {
    const { editor } = await testEnvironment(() => {
      // The verse's own `altnumber` must match the manually-built display run below (mirroring
      // `attributeClass.utils.test.tsx`'s working pattern for this same helper): without it, the
      // marker-edit engine's pend/settle machinery (active even in plain `testEnvironment`,
      // registered on every `AttributeRunNode` mutation) treats the just-built wrapper as an
      // unbacked run and clears its children, since nothing here re-derives them from `altnumber`
      // the way `TextSpacingPlugin`'s self-healing sync would.
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode("In the beginning"),
        ),
      );
      $appendVerseAttributeRun(verse, "va", "2");
    });
    await act(async () => editor.update($selectWholeDocument));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    // "\p " + "\v 1 " (the verse's own baked-in glyph+number+space) + the wrapped "\va 2\va*" run
    // (opening glyph, NBSP-prefixed value inverted to a plain space, closing glyph — no bytes from
    // the AttributeRunNode wrapper itself) + the surrounding "In the beginning" text, undisturbed.
    expect(getData("text/plain")).toBe("\\p \\v 1 \\va 2\\va*In the beginning");
  });
});

describe("cut = copy + removeText", () => {
  // Two independent editors (rather than one editor dispatching COPY then CUT in sequence): a
  // second command dispatch on the same editor lets Lexical's own DOM-selection reconciliation
  // (unrelated to this plugin) collapse the just-set programmatic selection under jsdom before the
  // handler runs, which would make this a test of that reconciliation quirk instead of cut/copy
  // parity. Each editor here does exactly one selection-set + one dispatch, matching every other
  // test in this file.
  it("cuts a collapsed note: clipboard matches copy's bytes, and the note is removed from the tree", async () => {
    const usj = noteUsj("+");

    const { editor: copyEditor } = await renderUsjEditor(usj);
    let copyNote!: NoteNode;
    copyEditor.getEditorState().read(() => {
      copyNote = findOnlyNote($getRoot());
    });
    await act(async () => copyEditor.update(() => $selectWholeNode(copyNote)));
    const copyStub = copyEvent();
    await act(async () => copyEditor.dispatchCommand(COPY_COMMAND, copyStub.event));
    const copiedText = copyStub.getData("text/plain");
    expect(copiedText).toContain("\\f + ");

    const { editor: cutEditor } = await renderUsjEditor(usj);
    let cutNote!: NoteNode;
    cutEditor.getEditorState().read(() => {
      cutNote = findOnlyNote($getRoot());
    });
    await act(async () => cutEditor.update(() => $selectWholeNode(cutNote)));
    const cutStub = copyEvent();
    await act(async () => cutEditor.dispatchCommand(CUT_COMMAND, cutStub.event));
    expect(cutStub.getData("text/plain")).toBe(copiedText);

    let notesRemaining = -1;
    cutEditor.getEditorState().read(() => {
      notesRemaining = $countNotes();
    });
    expect(notesRemaining).toBe(0);
  });
});

describe("copy → paste USJ round trip", () => {
  // A whole-paragraph copy starts with its own "\p " literal (the paragraph's own marker rides
  // along with a whole-block selection). Pasted at an existing "\p" host's content start, the
  // fragment Tier 2 rebuilds from would otherwise carry BOTH the host's own glyph and the pasted
  // literal's — two paragraph-marker occurrences with nothing between them, tokenizing into a
  // stray empty leading paragraph (the host's, now with nothing to show for it) ahead of the real
  // one. `$buildParaFragment`'s own-marker-wins rule (tier2Rebuild.utils.ts) drops the host's
  // redundant glyph from the fragment in exactly this shape, closing that gap.
  it("re-tokenizes a whole-paragraph copy back to the source USJ when pasted into a fresh editor", async () => {
    initializeDeserialize(undefined);
    const usj = noteUsj("+");
    const { editor: sourceEditor } = await renderUsjEditor(usj);
    await act(async () => sourceEditor.update($selectWholeDocument));
    const { event, getData } = copyEvent();
    await act(async () => sourceEditor.dispatchCommand(COPY_COMMAND, event));
    const copiedText = getData("text/plain");

    let trailing: TextNode;
    const { editor: targetEditor } = await testEnvironment(() => {
      trailing = $trailingSpaceNode();
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), trailing));
    });
    await act(async () =>
      targetEditor.update(() => {
        trailing.select(trailing.getTextContentSize(), trailing.getTextContentSize());
        targetEditor.dispatchCommand(PASTE_COMMAND, plainTextPasteEvent(copiedText));
      }),
    );
    // Settle: flush any reconciliation the paste-triggered Tier 2 re-tokenization schedules
    // beyond the synchronous update above.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const pastedUsj = deserializeSerializedEditorState(
      targetEditor.getEditorState().toJSON(),
      viewOptions,
    );
    expect(pastedUsj).toEqual(usj);
  });
});
