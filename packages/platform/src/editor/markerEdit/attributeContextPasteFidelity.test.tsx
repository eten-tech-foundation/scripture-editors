/**
 * Paste (and cut) fidelity for a selection sitting inside an attribute display run — a char span's
 * `|attrs` list, a milestone's attribute run, or a verse's `\va`/`\vp` run. Live repro (TJ,
 * 2026-08-11): existing span `\nd asdf|who="hi"\nd*`, caret inside/after the `who="hi"` run, paste
 * plain text `sid="things"`. Observed: the `who` attribute display AND the closing `\nd*` glyph
 * disappeared from the editor, the pasted text rendered visually outside the span, and the saved
 * file diverged from the editor (`\nd asdf|who="hi"\nd*sid="things"` — the pasted bytes landed
 * after the closer, in body text).
 *
 * Root cause: `$handlePasteForStandardView` (whitespaceDisplay.plugin.utils.ts) declined the paste
 * whenever the clipboard also carried a same-namespace `application/x-lexical-editor` MIME flavor
 * (the guard that keeps a same-editor rich copy on its exact-node-tree fast path everywhere else),
 * handing off to Lexical's own default rich-paste node insertion. That default path has no notion
 * that an attribute run's text must stay inside its ONE tagged TextNode — it merged the run, the
 * char's own closing glyph, and even the FOLLOWING paragraph sibling's text into a single plain
 * node, destroying the attribute display, the closing marker, and the paragraph boundary in one
 * move. Reproduced directly below (see "root cause" describe block) and fixed by never declining a
 * paste whose selection sits inside attribute-display text, regardless of what other MIME flavors
 * the clipboard also carries — see `$handlePasteForStandardView`'s doc comment for the full design.
 *
 * Binding design principle: paste in attribute context ≡ typing the same characters at the same
 * caret. Every "paste ≡ typed" pin below proves paste and the character-by-character TYPED
 * equivalent settle to the identical USJ, not merely to individually-plausible-looking results.
 */

import {
  $appendVerseAttributeRun,
  requireDefined,
  testEnvironment,
  testEnvironmentWithCharSync,
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
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
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

/** Types `text` one character at a time via `selection.insertText`, each in its own commit — the
 * same update path a real keystroke takes (matches the idiom in markerEditTier2Trigger.utils.test.tsx). */
async function typeCharByChar(editor: EditorHandle, text: string): Promise<void> {
  for (const character of text) {
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      }),
    );
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
// Char span fixture: TJ's exact repro shape, `\nd asdf|who="hi"\nd*`, plus a second paragraph to
// depart to. Mounts BOTH CharNodePlugin (self-heal) and MarkerEditPlugin (pend/settle) — the real
// app's plugin stack — matching charAttributeDeletionSettle.test.tsx's idiom.
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

    // Pre-settle: no escaped text, closer intact, attribute display present (the exact live-repro
    // symptoms — hidden display, escaped text — must not appear even transiently).
    editor.getEditorState().read(() => {
      const char = $firstChar();
      expect($charCloser(char).getTextContent()).toBe("\\nd*");
      expect($charAttributeRun(char).getTextContent()).toBe('|who="hi"sid="things"');
    });

    await departAndSettle(editor, () => $bodyTextNode().select(0, 0));

    expect(usjOf(editor)).toEqual(await typedResult());
  });
});

describe("root cause: an internal same-editor copy on the clipboard must not corrupt the run", () => {
  it("pasting plain text ALONGSIDE a same-namespace application/x-lexical-editor payload settles identically to a plain-only paste (regression for the live corruption)", async () => {
    // Build the same-namespace rich payload the way a real same-editor Ctrl+C would: select some
    // plain text elsewhere in the SAME editor and capture $getLexicalContent, exactly as
    // copyToClipboard does. `$handlePasteForStandardView`'s same-namespace-flavor guard exists so
    // an internal copy elsewhere in the document keeps its exact-node-tree fast path — but that
    // guard must never win over an attribute-context destination; this reproduces the corruption
    // the guard used to cause there.
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
});

describe("multi-line payload collapses to a single space (attribute values are single-line)", () => {
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
});

describe("marker-bearing payload: literal value text, no strip, no chapter node", () => {
  it('paste "\\c 5" into the attribute run: the bytes survive literally, no chapter node is created', async () => {
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const run = $charAttributeRun($firstChar());
        run.select(run.getTextContentSize(), run.getTextContentSize());
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "\\c 5" });

    editor.getEditorState().read(() => {
      // Literal bytes intact in the run — the chapter/book-id strip
      // ($stripPastedChapterAndBookId) must never run against attribute-context text.
      expect($charAttributeRun($firstChar()).getTextContent()).toBe('|who="hi"\\c 5');
    });
    const usj = usjOf(editor);
    expect(
      usj.content.filter((item) => typeof item !== "string" && item.type === "chapter"),
    ).toEqual([]);
    expect(usj.content.filter((item): item is string => typeof item === "string")).toEqual([]);
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
      expect($firstChar().getUnknownAttributes()).toEqual({ who: "" });
    });
  });
});

describe("mixed selection: spans BOTH attribute and non-attribute content", () => {
  it("declines the attribute-context path (selection anchor is in-run, focus is on the closing glyph) — falls through to the ordinary paste path unchanged", async () => {
    // Design choice (brief-permitted either way): a selection that only PARTLY sits inside
    // attribute-display text is declined here rather than collapsed to attribute-side behavior —
    // the ordinary paste path already inserts via plain `selection.insertText` for a payload with
    // no newline/tab, so it cannot reproduce the node-insertion corruption class this file's
    // "root cause" pin fixes; specializing a case this rare (and structurally ambiguous — should a
    // paste spanning INTO the closing glyph reformat the marker too?) is not worth the complexity.
    const { editor } = await testEnvironmentWithCharSync($charFixture);
    await act(async () =>
      editor.update(() => {
        const char = $firstChar();
        const run = $charAttributeRun(char);
        const closer = $charCloser(char);
        run.select(0, 0); // start inside the run...
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.focus.set(closer.getKey(), 0, "text"); // ...end on the closer, NOT attribute-tagged
      }),
    );

    await pasteAndFlush(editor, { "text/plain": "X" });

    // No crash, and no attribute-context special-casing applied: the ordinary path's plain
    // `insertText` replaced the selected range (the whole run) with "X", consuming the run text
    // node's content but leaving the rest of the document structurally sane.
    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(2);
    });
  });
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
