/**
 * Paste (and cut) fidelity for a selection that TOUCHES an attribute display run — a char span's
 * `|attrs` list, a milestone's attribute run, or a verse's `\va`/`\vp` run.
 *
 * Concrete example of the failure mode: with existing span `\nd asdf|who="hi"\nd*`, caret at the
 * end of the `who="hi"` run, pasting plain text `sid="things"` (which carries no NBSP) observably
 * drops the `who` attribute display AND the closing `\nd*` glyph, renders the pasted text visually
 * outside the span, and diverges the saved file from the editor. A single-line, NBSP-free,
 * flavor-free external paste like this one is already safe on its own (see the "typed
 * characterization"/"paste ≡ typed" pins below, which pin that fact rather than a corruption) — it
 * takes one of the shapes below to reach the corruption class this file exists to catch.
 *
 * What this file's "root cause" describe block reproduces and fixes is the SHAPE that corruption
 * takes whenever ANY handler declines an attribute-context paste to Lexical's default rich-paste
 * node insertion: it has no notion that an attribute run's text must stay inside its ONE tagged
 * TextNode, and merges the run, the closing glyph, and even the FOLLOWING paragraph sibling's text
 * into one plain node — destroying the attribute display, the closing marker, and the paragraph
 * boundary in one move. Regression classes pinned below, each reaching that same failure mode a
 * different way: a live native paste event that still carries a same-namespace
 * `application/x-lexical-editor` flavor; a multi-line plain-text payload (the ordinary pipeline
 * splits it via `insertParagraph()`); a marker-bearing payload (the ordinary pipeline's `\c`/`\id`
 * strip eats bytes out of an attribute VALUE that were never a chapter token); and a selection that
 * only PARTLY touches the attribute run combined with either of the first two. Fixed by always
 * routing a paste whose selection TOUCHES attribute-display text through plain-text insertion,
 * regardless of what other MIME flavors the clipboard also carries or how much of the selection
 * sits outside the run — see `$handlePasteForStandardView`'s doc comment for the full design.
 *
 * Binding design principle: paste in attribute context ≡ typing the same characters at the same
 * caret (or over the same selection). Every "paste ≡ typed" pin below proves paste and the
 * character-by-character TYPED equivalent settle to the identical USJ, not merely to
 * individually-plausible-looking results.
 *
 * That equivalence governs the insertion MECHANISM for every selection touching a run. It does NOT
 * extend to the two rules a body-content paste applies that typing does not — the `\c`/`\id` strip
 * and the positional NBSP mapping — which are skipped only for a selection that stays wholly inside
 * ONE attribute node, the only shape whose bytes end up in a node that stays tagged "attribute" and
 * therefore never re-tokenizes. The "mixed selection: the pasted bytes are BODY content" describe
 * pins that split from both directions and pins the wholly-inside boundary that keeps value-byte
 * semantics.
 */

import {
  $appendVerseAttributeRun,
  requireDefined,
  testEnvironment,
  testEnvironmentWithCharSync,
  testEnvironmentWithCharSyncAndHistory,
  testEnvironmentWithSpacing,
  viewOptions,
  pasteEvent,
  copyEvent,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { $createMarkerPrefix } from "./markerEditDeletion.utils";
import { act } from "@testing-library/react";
import { $getLexicalContent } from "@lexical/clipboard";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isTextNode,
  $setState,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isParaNode,
  $isVerseNode,
  $milestoneAttributeRunPieces,
  $verseAttributeRunPieces,
  getVisibleOpenMarkerText,
  MilestoneNode,
  NBSP,
  ParaNode,
  textTypeState,
  VerseNode,
} from "shared";
import { Usj } from "@eten-tech-foundation/scripture-utilities";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}
// jsdom implements neither `ClipboardEvent` nor `DragEvent`; Lexical's default rich-paste path
// (reached in the "root cause" block below, where the fix must NOT let it run) checks
// `instanceof`/class-name against both. Same stub as clipboardCopyFidelity.test.tsx /
// noteEnterFp.test.tsx; only defined if not already present.
const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
if (typeof globalStubs.DragEvent === "undefined")
  globalStubs.DragEvent = class DragEvent extends Event {};
if (typeof globalStubs.ClipboardEvent === "undefined")
  globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

type EditorHandle = LexicalEditor;

/**
 * Types `text` one character at a time through `CONTROLLED_TEXT_INSERTION_COMMAND`, each in its own
 * commit — the command a real keystroke dispatches, not the `selection.insertText` primitive
 * underneath it.
 *
 * The difference is load-bearing for every "paste ≡ typed" pin here. `MarkerEditPlugin` registers a
 * NORMAL-priority listener on this command that runs `$prepareReplaceSelection`
 * (`markerEditDeletion.utils.ts`), which performs the delete half itself whenever the replaced
 * selection covers marker-glyph bytes — exactly the selections these pins use. Driving
 * `insertText` directly would skip that listener and compare the paste path against the same
 * primitive the paste path ends in, which no equivalence claim can rest on.
 */
async function typeCharByChar(editor: EditorHandle, text: string): Promise<void> {
  for (const character of text) {
    await act(async () => {
      editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, character);
    });
  }
}

/** Dispatches `PASTE_COMMAND` with `payload` as the clipboard's MIME map, in one commit — a single
 * real paste, not a per-character sequence. Flushes Tier 2's post-paste double microtask. */
async function pasteAndFlush(
  editor: EditorHandle,
  payload: { [key: string]: string },
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      editor.dispatchCommand(PASTE_COMMAND, pasteEvent(payload).event);
    }),
  );
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Moves the caret to `$select` and flushes the deferred departure-settle microtask. */
async function departAndSettle(editor: EditorHandle, $select: () => void): Promise<void> {
  await act(async () => editor.update($select));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** One `UNDO_COMMAND` dispatch, flushed the same way a paste is — matches
 * `markerPasteFidelity.test.tsx`'s `undoAndSettle`. */
async function undoAndSettle(editor: EditorHandle): Promise<void> {
  await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The current document as USJ, via the same `toJSON` -> deserialize path every sibling suite
 * reads settled state through. */
function usjOf(editor: EditorHandle): Usj {
  initializeDeserialize(undefined);
  const usj = editor
    .getEditorState()
    .read(() => deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions));
  if (!usj) throw new Error("editor state did not serialize to USJ");
  return usj;
}

// ---------------------------------------------------------------------------------------------
// Char span fixture: the shape this whole file is built around, `\nd asdf|who="hi"\nd*`, plus a
// second paragraph to depart to. Mounts BOTH CharNodePlugin (self-heal) and MarkerEditPlugin
// (pend/settle) — the real app's plugin stack — matching charAttributeDeletionSettle.test.tsx's
// idiom.
// ---------------------------------------------------------------------------------------------

function $charFixture(): void {
  const char = $createCharNode("nd");
  char.setUnknownAttributes({ who: "hi" });
  const run = $createTextNode('|who="hi"');
  $setState(run, textTypeState, "attribute");
  char.append(
    $createMarkerNode("nd"),
    $createTextNode(`${NBSP}asdf`),
    run,
    $createMarkerNode("nd", "closing"),
  );
  $getRoot().append(
    $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), char),
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("body"),
    ),
  );
}

const $firstChar = () =>
  requireDefined(
    $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
    "char missing",
  );
const $charAttributeRun = (char: ReturnType<typeof $firstChar>): TextNode =>
  requireDefined(
    char
      .getChildren()
      .find(
        (c): c is TextNode =>
          $isTextNode(c) && !$isMarkerNode(c) && $getState(c, textTypeState) === "attribute",
      ),
    "run missing",
  );
const $charCloser = (char: ReturnType<typeof $firstChar>) =>
  requireDefined(
    char.getChildren().find((c) => $isMarkerNode(c) && c.getMarkerSyntax() === "closing"),
    "closer missing",
  );
const $bodyTextNode = () => {
  const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
  if (!$isTextNode(body)) throw new Error("body text node missing");
  return body;
};

describe("typed characterization (baseline): typing at the end of a char span's attribute run", () => {
  it("does NOT reproduce the corruption class — the run, the closer, and the attributes all survive intact", async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );
    await typeCharByChar(editor, 'sid="things"');

    // Pre-departure: no escaped text, closer intact, run still tagged "attribute".
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect($charAttributeRun(char).getTextContent()).toBe('|who="hi"sid="things"');
      expect(char.getUnknownAttributes()).toEqual({ who: "hi" }); // not yet re-tokenized
    });

    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect(char.getUnknownAttributes()).toEqual({ who: "hi", sid: "things" });
    });
    expect(usjOf(editor).content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "nd", who: "hi", sid: "things", content: ["asdf"] }],
      },
      { type: "para", marker: "p", content: [" body"] },
    ]);
  });
});

describe("paste ≡ typed (TJ's repro shape): plain-text-only paste at the end of the run", () => {
  async function typedResult(): Promise<Usj> {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );
    await typeCharByChar(editor, 'sid="things"');
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));
    return usjOf(editor);
  }

  it("settles to the byte-for-byte SAME USJ as the character-by-character typed equivalent", async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": 'sid="things"' });

    // Pre-settle: no escaped text, closer intact, attribute display present — the corruption
    // symptoms (hidden display, escaped text) must not appear even transiently.
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect($charAttributeRun(char).getTextContent()).toBe('|who="hi"sid="things"');
    });

    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    expect(usjOf(editor)).toEqual(await typedResult());
  });

  it("undo after the paste restores the exact pre-paste USJ in one step", async () => {
    const { editor } = await testEnvironmentWithCharSyncAndHistory($charFixture);
    const preUsj = usjOf(editor);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": 'sid="things"' });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });
});

describe("root cause: a native paste event carrying a same-namespace application/x-lexical-editor flavor must not corrupt the run", () => {
  it("pasting plain text ALONGSIDE a same-namespace application/x-lexical-editor payload settles identically to a plain-only paste (regression for the live corruption)", async () => {
    // Build the same-namespace rich payload the way a real same-editor Ctrl+C would: select some
    // plain text elsewhere in the SAME editor and capture $getLexicalContent, exactly as
    // copyToClipboard does. `$handlePasteForStandardView`'s same-namespace-flavor guard exists so
    // a live native paste event that still carries the flavor (a genuine same-page copy, not the
    // reconstructed-DataTransfer paste path S3's own doc comment shows can never carry it) keeps
    // Lexical's exact-node-tree fast path for ORDINARY content — but that guard must never win over
    // an attribute-context destination, so this pins the corruption that fast path would otherwise
    // cause there.
    const { editor } = await testEnvironmentWithCharSync(() => {
      $charFixture();
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode('sid="things"'),
        ),
      );
    });
    let lexicalPayload = "";
    await act(async () =>
      editor.update(() => {
        const source = $getRoot().getChildren().filter($isParaNode)[2].getLastChild();
        if (!$isTextNode(source)) throw new Error("copy source text missing");
        source.select(0, source.getTextContentSize());
        lexicalPayload = $getLexicalContent(editor) ?? "";
      }),
    );
    expect(lexicalPayload).not.toBe("");

    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );
    await pasteAndFlush(editor, {
      "text/plain": 'sid="things"',
      "application/x-lexical-editor": lexicalPayload,
    });

    // The live corruption, pinned as a MUST-NOT: the run and closer must still exist, and no
    // sibling paragraph text may have been swallowed into the char span.
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect($charAttributeRun(char).getTextContent()).toBe('|who="hi"sid="things"');
      expect(char.getTextContent()).not.toContain("body");
    });

    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect(char.getUnknownAttributes()).toEqual({ who: "hi", sid: "things" });
    });
    const usj = usjOf(editor);
    const firstPara = usj.content[0];
    if (typeof firstPara === "string")
      throw new Error("first paragraph corrupted into a bare string");
    expect(firstPara.content).toEqual([
      { type: "char", marker: "nd", who: "hi", sid: "things", content: ["asdf"] },
    ]);
  });
});

describe("leading-space payload: the well-formed case ends fully correct on disk", () => {
  it('paste " sid=\\"things\\"" (leading space already separates the pair) settles to both attributes present', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": ' sid="things"' });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    editor.getEditorState().read(() => {
      expect($firstChar().getUnknownAttributes()).toEqual({ who: "hi", sid: "things" });
    });
  });
});

describe("replace-selection paste inside the attribute value", () => {
  it('selecting "hi" inside |who="hi" and pasting "bye" settles to who="bye"', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        const text = run.getTextContent(); // '|who="hi"'
        const valueStart = text.indexOf('"') + 1;
        const valueEnd = text.lastIndexOf('"');
        run.select(valueStart, valueEnd);
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "bye" });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    editor.getEditorState().read(() => {
      expect($firstChar().getUnknownAttributes()).toEqual({ who: "bye" });
    });
  });

  it("undo after the replace-selection paste restores the exact pre-paste USJ in one step", async () => {
    const { editor } = await testEnvironmentWithCharSyncAndHistory($charFixture);
    const preUsj = usjOf(editor);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        const text = run.getTextContent();
        const valueStart = text.indexOf('"') + 1;
        const valueEnd = text.lastIndexOf('"');
        run.select(valueStart, valueEnd);
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "bye" });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });
});

describe("multi-line payload collapses to a single space, per newline (attribute values are single-line)", () => {
  it('paste "a\\nb" into the attribute run: the raw display text becomes "...a b...", not two paragraphs', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "a\nb" });

    editor.getEditorState().read(() => {
      // Still exactly one paragraph, one char span — a newline in an attribute payload must never
      // split the document the way it would in body content.
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who="hi"a b');
    });
  });

  it('paste "a\\n\\nb" (two consecutive newlines): each `\\n` becomes its OWN space — "...a  b..." with TWO spaces, not one collapsed space', async () => {
    // Pins that the replacement is per-newline (`text.replace(/\n/g, " ")`), not a run-collapsing
    // one — there is no "multiple blank lines" concept to collapse INTO for a single-line
    // attribute value; two newlines are two individually-typed line breaks, so they become two
    // individually-typed spaces.
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "a\n\nb" });

    editor.getEditorState().read(() => {
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who="hi"a  b');
    });
  });

  it("undo after the multi-line paste restores the exact pre-paste USJ in one step", async () => {
    const { editor } = await testEnvironmentWithCharSyncAndHistory($charFixture);
    const preUsj = usjOf(editor);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "a\nb" });
    await undoAndSettle(editor);

    expect(usjOf(editor)).toEqual(preUsj);
  });
});

describe("marker-bearing payload: literal value text, no strip — and what the settle then does with it", () => {
  /** The run-end caret this whole attribute-context path was built for. */
  function $selectRunEnd(): void {
    const run = $charAttributeRun($firstChar());
    run.select(run.getTextContentSize(), run.getTextContentSize());
  }

  it('paste "\\c 5" at the run\'s end: the bytes survive the paste literally, un-stripped', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () => editor.update($selectRunEnd));

    await pasteAndFlush(editor, { "text/plain": "\\c 5" });

    editor.getEditorState().read(() => {
      // Literal bytes intact in the run — the chapter/book-id strip
      // (stripPastedChapterAndBookId) must never run against attribute-context text.
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who="hi"\\c 5');
    });
    const usj = usjOf(editor);
    expect(
      usj.content.filter((item) => typeof item !== "string" && item.type === "chapter"),
    ).toEqual([]);
    expect(usj.content.filter((item): item is string => typeof item === "string")).toEqual([]);
  });

  it("and at the settle those bytes DO re-tokenize — identically to the same bytes typed there", async () => {
    // The value-byte carve-out is justified by paste ≡ TYPING, not by "these bytes never
    // re-tokenize": the attribute tag survives the insertion, but the caret-departure settle
    // re-tokenizes the whole paragraph and reads `\c 5` as the chapter marker it spells. Recorded
    // here rather than left invisible behind an unsettled assertion. The residual — marker bytes
    // reaching a value at all — is the TYPED `\c` hole, which paste reaches through a different
    // door rather than introducing; closing it for paste alone would eat bytes out of an
    // attribute value that were never a chapter token, and would break the equivalence below.
    const pasted = await testEnvironmentWithCharSync($charFixture);
    await act(async () => pasted.editor.update($selectRunEnd));
    await pasteAndFlush(pasted.editor, { "text/plain": "\\c 5" });
    await departAndSettle(pasted.editor, () => $bodyTextNode().select(0, 0));

    const typed = await testEnvironmentWithCharSync($charFixture);
    await act(async () => typed.editor.update($selectRunEnd));
    await typeCharByChar(typed.editor, "\\c 5");
    await departAndSettle(typed.editor, () => $bodyTextNode().select(0, 0));

    // Asserted as the concrete settled shape, so the residual is visible in the suite rather than
    // hidden inside an equivalence that would also pass if both arms were clean.
    expect(usjOf(pasted.editor).content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [{ type: "char", marker: "nd", closed: "false", content: ['asdf|who="hi"'] }],
      },
      { type: "chapter", marker: "c", number: "5" },
      { type: "unmatched", marker: "nd*" },
      { type: "para", marker: "p", content: [" body"] },
    ]);
    expect(usjOf(pasted.editor)).toEqual(usjOf(typed.editor));
  });
});

describe("CUT of a selection inside the attribute value", () => {
  it('cutting "hi" out of |who="hi" removes the value text, keeps the structure, and the clipboard holds "hi"', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    const { event, getData } = copyEvent();
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        const text = run.getTextContent();
        const valueStart = text.indexOf('"') + 1;
        const valueEnd = text.lastIndexOf('"');
        run.select(valueStart, valueEnd);
        editor.dispatchCommand(CUT_COMMAND, event);
      }),
    );

    expect(getData("text/plain")).toBe("hi");
    editor.getEditorState().read(() => {
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who=""');
    });

    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));
    editor.getEditorState().read(() => {
      // An EMPTY attribute value refuses the whole list and stays literal, matching Paratext 9 —
      // `|who=""` is not a reading Paratext will ever agree with, so the engine does not invent an
      // attribute the rest of the pipeline would disagree about. What the cut must guarantee is
      // that the bytes the user did not remove survive: the span keeps its own marker and closer,
      // and the emptied list rides on as ordinary content rather than being silently dropped.
      expect($firstChar().getUnknownAttributes()).toBeUndefined();
      expect($firstChar().getTextContent().replaceAll(NBSP, " ")).toBe('\\nd asdf|who=""\\nd*');
    });
  });
});

describe("mixed selection: spans BOTH attribute and non-attribute content", () => {
  // Design choice: a selection that only PARTLY sits inside attribute-display text TAKES the
  // attribute-context path rather than declining it — under paste ≡ typing, a user typing a
  // character over this exact selection gets `selection.insertText`'s own removeText-then-insert
  // behavior regardless of which node the selection's OTHER end sits on, so paste must take the
  // identical path instead of falling through to a branch (the ordinary pipeline's
  // `insertParagraph()` for a multi-line payload, or Lexical's rich-node paste for a
  // same-namespace-flavored one) that CAN corrupt the attribute-run end of the range — reproduced
  // in the two pins below this one, each of which reaches exactly one of those two branches.
  function $selectRunThroughCloserStart(): void {
    const char = $firstChar();
    const run = $charAttributeRun(char);
    const closer = $charCloser(char);
    run.select(0, 0); // anchor: start of the run (attribute context)...
    const selection = $getSelection();
    if ($isRangeSelection(selection)) selection.focus.set(closer.getKey(), 0, "text"); // ...focus: start of the closer (NOT attribute-tagged) — spans the run's full text
  }

  it("plain single-line payload: claims the attribute path, replacing the selected range with the pasted text", async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () => editor.update($selectRunThroughCloserStart));

    await pasteAndFlush(editor, { "text/plain": "X" });

    // No crash, and the document stays structurally sane: still 2 paragraphs, closer still present
    // (the mixed range covered only the run's own text, never reaching into the closer glyph).
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
    });
  });

  it("mixed selection + same-namespace application/x-lexical-editor flavor: does not reach Lexical's rich-paste node insertion (regression for the corruption class this closes)", async () => {
    // This exact shape (one end in attribute context, one end not) must also take the
    // attribute-context path: were the same-namespace-flavor decline above to run unconditionally
    // here, it would hand the paste to Lexical's default rich-paste node insertion — the SAME
    // corruption class as the "root cause" describe block above, reached via a mixed selection
    // instead of a fully-inside one.
    const { editor } = await testEnvironmentWithCharSync(() => {
      $charFixture();
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode('sid="things"'),
        ),
      );
    });
    let lexicalPayload = "";
    await act(async () =>
      editor.update(() => {
        const source = $getRoot().getChildren().filter($isParaNode)[2].getLastChild();
        if (!$isTextNode(source)) throw new Error("copy source text missing");
        source.select(0, source.getTextContentSize());
        lexicalPayload = $getLexicalContent(editor) ?? "";
      }),
    );
    expect(lexicalPayload).not.toBe("");

    await act(async () => editor.update($selectRunThroughCloserStart));
    await pasteAndFlush(editor, {
      "text/plain": 'sid="things"',
      "application/x-lexical-editor": lexicalPayload,
    });

    // MUST-NOT: the closer must still exist, and no sibling paragraph text may have been swallowed
    // into the char span — the exact corruption shape a decline into Lexical's rich-paste path
    // produces.
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(3);
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect(char.getTextContent()).not.toContain("body");
    });
  });

  it('mixed selection + multi-line plain payload ("a\\nb"): collapses to a single space instead of splitting the paragraph', async () => {
    // Before the OR-widening, this exact shape fell through to the ordinary external-paste
    // pipeline, whose line replay dispatches INSERT_PARAGRAPH_COMMAND per newline — splitting the
    // paragraph with the selection still anchored inside the char span's own attribute run,
    // corrupting its structure.
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () => editor.update($selectRunThroughCloserStart));

    await pasteAndFlush(editor, { "text/plain": "a\nb" });

    editor.getEditorState().read(() => {
      // Still exactly 2 paragraphs — no paragraph split — and the closer survived.
      const char = $firstChar();
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Single-paragraph mixed-selection fixture: `\p before \nd asdf|who="hi"\nd* after`, with body
// text on BOTH sides of the span in the SAME paragraph, plus a second paragraph to depart to. A
// mixed selection needs ordinary content and attribute-display text in one range, and a
// cross-paragraph range does not hold in jsdom — within one paragraph it does.
// ---------------------------------------------------------------------------------------------

function $inlineCharFixture(): void {
  const char = $createCharNode("nd");
  char.setUnknownAttributes({ who: "hi" });
  const run = $createTextNode('|who="hi"');
  $setState(run, textTypeState, "attribute");
  char.append(
    $createMarkerNode("nd"),
    $createTextNode(`${NBSP}asdf`),
    run,
    $createMarkerNode("nd", "closing"),
  );
  const [glyph, separator] = $createMarkerPrefix("p");
  const [glyph2, separator2] = $createMarkerPrefix("p");
  $getRoot().append(
    $createParaNode("p").append(
      glyph,
      separator,
      $createTextNode("before "),
      char,
      $createTextNode(" after"),
    ),
    $createParaNode("p").append(glyph2, separator2, $createTextNode("body")),
  );
}

const $leadingBodyText = (): TextNode => {
  const node = $firstPara().getChildren()[2];
  if (!$isTextNode(node)) throw new Error("leading body text missing");
  return node;
};
const $trailingBodyText = (): TextNode => {
  const node = $firstPara().getLastChild();
  if (!$isTextNode(node)) throw new Error("trailing body text missing");
  return node;
};

/** anchor in the leading BODY text, focus inside the attribute run — the range crosses the span's
 * opening glyph on its way in. */
function $selectBodyIntoRun(): void {
  $leadingBodyText().select(3, 3);
  const selection = $getSelection();
  if ($isRangeSelection(selection))
    selection.focus.set($charAttributeRun($firstChar()).getKey(), 5, "text");
}

/** anchor inside the attribute run, focus in the trailing BODY text — the range covers the span's
 * CLOSING glyph, so removing it leaves the span unterminated. */
function $selectRunPastCloser(): void {
  const run = $charAttributeRun($firstChar());
  run.select(1, 1);
  const selection = $getSelection();
  if ($isRangeSelection(selection)) selection.focus.set($trailingBodyText().getKey(), 3, "text");
}

describe("mixed selection: the pasted bytes are BODY content, not attribute-value bytes", () => {
  // Attribute-value semantics (no `\c`/`\id` strip, no positional NBSP mapping) are earned by one
  // fact: the bytes land in a node that stays tagged "attribute", which `$textNodeTier2Transform`
  // skips, so they never re-tokenize as markers. Only a selection wholly inside ONE such node has
  // that property. A selection that merely TOUCHES one loses it — removing the range takes the
  // bytes out of the run (and, when the range covers the span's closing glyph, deletes the closer
  // so the whole span re-tokenizes around them) — so the bytes are ordinary body content and get
  // body content's paste rules. The INSERTION MECHANISM is unchanged either way: one
  // `selection.insertText`, never the paragraph-splitting line replay and never Lexical's
  // rich-paste node insertion, both of which corrupt the attribute-run end of the range.

  it("does not create a chapter node when the range starts in body text — the \\c strip applies", async () => {
    const { editor } = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => editor.update($selectBodyIntoRun));

    await pasteAndFlush(editor, { "text/plain": "\\c 5 X" });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    const content = usjOf(editor).content;
    expect(content.filter((item) => typeof item !== "string" && item.type === "chapter")).toEqual(
      [],
    );
    // The paragraph also stays whole: a chapter token closes the enclosing paragraph, stranding
    // everything after it as bare top-level USJ.
    expect(content.every((item) => typeof item !== "string" && item.type === "para")).toBe(true);
  });

  it("does not create a chapter node when the range STARTS inside the run and reaches past the closing glyph", async () => {
    // The bytes land at the run's own offset, yet still re-tokenize: the range took the closer with
    // it, so the span is no longer a span with an attribute run to be inside of.
    const { editor } = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => editor.update($selectRunPastCloser));

    await pasteAndFlush(editor, { "text/plain": "\\c 5" });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    const content = usjOf(editor).content;
    expect(content.filter((item) => typeof item !== "string" && item.type === "chapter")).toEqual(
      [],
    );
    expect(content.every((item) => typeof item !== "string" && item.type === "para")).toBe(true);
  });

  it("keeps a pasted interior NBSP as DATA — the positional rule applies to body-bound bytes", async () => {
    // Body rule: every NBSP that is not a marker-adjacent display separator is user data and
    // becomes `~`, which the tokenizer reads back as a real NBSP. Inserted raw instead, the same
    // byte is read as display whitespace and saves as a plain space — the data is gone.
    const { editor } = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => editor.update($selectBodyIntoRun));

    await pasteAndFlush(editor, { "text/plain": `X${NBSP}Y` });
    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    expect(JSON.stringify(usjOf(editor).content)).toContain(`X${NBSP}Y`);
  });

  it("still settles a plain payload identically to the same character typed over the same range", async () => {
    // The strip and the NBSP rule are the only two places body paste diverges from typing; a
    // payload carrying neither must still land exactly where a keystroke would. This also answers
    // the recorded suspicion that a range reaching past the closing glyph corrupts on replacement:
    // it does not, and typed input over the same range produces the identical bytes — the span
    // losing its closer is the arithmetic of a range that covered the closer, not a paste defect.
    const typed = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => typed.editor.update($selectRunPastCloser));
    await typeCharByChar(typed.editor, "Z");
    await departAndSettle(typed.editor, () => $bodyTextNode().select(0, 0));

    const pasted = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => pasted.editor.update($selectRunPastCloser));
    await pasteAndFlush(pasted.editor, { "text/plain": "Z" });
    await departAndSettle(pasted.editor, () => $bodyTextNode().select(0, 0));

    expect(usjOf(pasted.editor)).toEqual(usjOf(typed.editor));
  });

  it("leaves a range wholly INSIDE the run on attribute-value semantics — a pasted \\c stays literal there, and settles as typing it would", async () => {
    // The boundary of the rule above, in its non-collapsed form (the collapsed-caret form is pinned
    // in the "marker-bearing payload" describe). The strip must not touch these bytes: they are
    // value text at insertion time, and paste must put them where typing them would.
    //
    // Settled deliberately, and the settled shape asserted concretely: the attribute tag survives
    // the insertion but not the caret-departure re-tokenization, so `\c 5` DOES become a chapter
    // marker here — the typed `\c` hole, reached through a different door rather than
    // introduced by paste. An assertion that stopped before the settle would read "safe" over a corrupt
    // document, which is the shape this suite exists to refuse.
    function $selectValueInterior(): void {
      const run = $charAttributeRun($firstChar());
      const text = run.getTextContent(); // '|who="hi"'
      run.select(text.indexOf('"') + 1, text.lastIndexOf('"'));
    }

    const pasted = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => pasted.editor.update($selectValueInterior));
    await pasteAndFlush(pasted.editor, { "text/plain": "\\c 5" });

    pasted.editor.getEditorState().read(() => {
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who="\\c 5"');
    });

    await departAndSettle(pasted.editor, () => $bodyTextNode().select(0, 0));

    const typed = await testEnvironmentWithCharSync($inlineCharFixture);
    await act(async () => typed.editor.update($selectValueInterior));
    await typeCharByChar(typed.editor, "\\c 5");
    await departAndSettle(typed.editor, () => $bodyTextNode().select(0, 0));

    expect(usjOf(pasted.editor).content).toEqual([
      {
        type: "para",
        marker: "p",
        content: [
          "before ",
          { type: "char", marker: "nd", closed: "false", content: ['asdf|who="'] },
        ],
      },
      { type: "chapter", marker: "c", number: '5"' },
      { type: "unmatched", marker: "nd*" },
      " after",
      { type: "para", marker: "p", content: ["body"] },
    ]);
    expect(usjOf(pasted.editor)).toEqual(usjOf(typed.editor));
  });

  it.each([
    ["a range ending at the trailing text's start", "runEndToTrailingStart"],
    ["a BACKWARD range from the trailing text into the run", "backwardTrailingToRun"],
    ["a range covering the run, the closer and all the trailing text", "runStartToTrailingEnd"],
  ] as const)(
    "strips a pasted \\c for %s too — the rule is about touching, not about which end touches",
    async (_name, shape) => {
      // All four mixed-selection shapes are covered: the rule is about whether the selection
      // touches attribute-value context, not about which end of the range does the touching.
      const { editor } = await testEnvironmentWithCharSync($inlineCharFixture);
      await act(async () =>
        editor.update(() => {
          const run = $charAttributeRun($firstChar());
          const trailing = $trailingBodyText();
          if (shape === "backwardTrailingToRun") {
            trailing.select(3, 3);
            const selection = $getSelection();
            if ($isRangeSelection(selection)) selection.focus.set(run.getKey(), 1, "text");
            return;
          }
          const start = shape === "runStartToTrailingEnd" ? 0 : run.getTextContentSize();
          run.select(start, start);
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            selection.focus.set(
              trailing.getKey(),
              shape === "runStartToTrailingEnd" ? trailing.getTextContentSize() : 0,
              "text",
            );
        }),
      );

      await pasteAndFlush(editor, { "text/plain": "\\c 5" });
      await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

      const content = usjOf(editor).content;
      expect(content.filter((item) => typeof item !== "string" && item.type === "chapter")).toEqual(
        [],
      );
      // A chapter token also closes its paragraph, stranding the rest as bare top-level strings —
      // asserted so the pin cannot pass on a document that merely renamed the damage.
      expect(content.filter((item): item is string => typeof item === "string")).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------------------------
// Milestone attribute run: one paste case, matching milestoneAttributeSettle.test.tsx's idiom.
// ---------------------------------------------------------------------------------------------

function $milestoneFixture(): void {
  const [glyph, separator] = $createMarkerPrefix("p");
  const [glyph2, separator2] = $createMarkerPrefix("p");
  $getRoot().append(
    $createParaNode("p").append(
      glyph,
      separator,
      $createTextNode("before "),
      $createMilestoneNode("qt-s", "q1"),
      $createTextNode(" after"),
    ),
    $createParaNode("p").append(glyph2, separator2, $createTextNode("body")),
  );
}

function $firstPara(): ParaNode {
  return $getRoot().getChildren().filter($isParaNode)[0];
}
function $milestoneInFirstPara(): MilestoneNode {
  return requireDefined($firstPara().getChildren().find($isMilestoneNode), "milestone missing");
}
function $milestoneAttributeRun(): TextNode {
  const { attribute } = $milestoneAttributeRunPieces($milestoneInFirstPara());
  return requireDefined(attribute, "milestone attribute run missing");
}
function $milestoneBodyText(): TextNode {
  const body = $getRoot().getChildren().filter($isParaNode)[1]?.getLastChild();
  if (!$isTextNode(body)) throw new Error("body text node missing");
  return body;
}

describe("milestone attribute run paste", () => {
  it('paste \'who="ed"\' at the end of a \\qt-s sid="q1" run settles with sid unchanged and who added', async () => {
    const { editor } = await testEnvironment($milestoneFixture);
    await act(async () =>
      editor.update(() => {
        const run = $milestoneAttributeRun();
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": 'who="ed"' });
    await departAndSettle(editor, () => $milestoneBodyText().select(0, 0));

    editor.getEditorState().read(() => {
      const milestone = $milestoneInFirstPara();
      expect(milestone.getSid()).toBe("q1");
      expect(milestone.getUnknownAttributes()).toEqual({ who: "ed" });
    });
  });

  it("a mixed selection reaching into the milestone's run takes body rules too — the rule is not char-span-specific", async () => {
    // `$isNodeInAttributeContext` covers all three run kinds through one predicate, so the
    // wholly-inside-versus-touching distinction is pinned on a second kind rather than left
    // inferred from the char span that surfaced it.
    const { editor } = await testEnvironmentWithSpacing($milestoneFixture);
    await act(async () =>
      editor.update(() => {
        const leading = $firstPara().getChildren()[2];
        if (!$isTextNode(leading)) throw new Error("leading body text missing");
        leading.select(3, 3);
        const selection = $getSelection();
        if ($isRangeSelection(selection))
          selection.focus.set($milestoneAttributeRun().getKey(), 2, "text");
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "\\c 5" });
    await departAndSettle(editor, () => $milestoneBodyText().select(0, 0));

    const content = usjOf(editor).content;
    expect(content.filter((item) => typeof item !== "string" && item.type === "chapter")).toEqual(
      [],
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Verse \va run: one paste case, matching verseAttributeSettle.test.tsx's idiom.
// ---------------------------------------------------------------------------------------------

function $verseFixture(): void {
  const verse = $createVerseNode(
    "1",
    getVisibleOpenMarkerText("v", "1"),
    undefined,
    "2",
    undefined,
  );
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      verse,
      $createTextNode("In the beginning"),
    ),
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createTextNode("body"),
    ),
  );
  $appendVerseAttributeRun(verse, "va", "2");
}

function $firstVerse(): VerseNode {
  return requireDefined(
    $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
    "verse missing",
  );
}
function $verseBodyText(): TextNode {
  const body = $getRoot().getChildren().filter($isParaNode)[1]?.getLastChild();
  if (!$isTextNode(body)) throw new Error("body text node missing");
  return body;
}

describe("verse \\va run paste", () => {
  it('paste "3" at the end of a \\va 2 run settles altnumber to "23"', async () => {
    const { editor } = await testEnvironmentWithSpacing($verseFixture);
    await act(async () =>
      editor.update(() => {
        const { value } = $verseAttributeRunPieces($firstVerse(), "va");
        const valueNode = requireDefined(value, "\\va value missing");
        valueNode.select(valueNode.getTextContentSize(), valueNode.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "3" });
    await departAndSettle(editor, () => $verseBodyText().select(0, 0));

    editor.getEditorState().read(() => {
      expect($firstVerse().getAltnumber()).toBe("23");
    });
  });
});
