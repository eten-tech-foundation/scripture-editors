/**
 * The typed-byte contract for glyph-bearing display kinds, on the IDLE settle clock: a byte the
 * user types into a marker glyph or display-run value must either RESOLVE to its tokenized
 * meaning (the tokenizer over the displayed bytes is the authority) or visibly REMAIN PENDING —
 * it must never silently vanish, and the caret must stay at its byte through the settle.
 *
 * The one shape that must stay pending: a byte the re-tokenization would DROP outright — e.g. a
 * lone `|` typed into a no-attribute milestone (`\qt-s|\*` tokenizes to a milestone with NO
 * attributes, so the canonical rebuild has no `|` to restore the caret into). Settling that on
 * the idle tick while the caret holds the site is accept-then-discard, the exact failure the
 * no-silent-no-ops rule forbids. It settles per the tokenizer on genuine caret DEPARTURE, where
 * no mid-composition caret is betrayed.
 *
 * Environment note (same as milestoneAttributeSettle.test.tsx): jsdom's selection reconciliation
 * is unreliable across commits — after a splice, a follow-on selection-ONLY commit (zero dirty
 * nodes, no tags) can re-derive the selection from stale DOM and snap the caret to a paragraph
 * start. That commit is not the settle computation's doing (the restore is correct in every
 * MUTATING commit), so caret assertions for settles that splice use `trackMutatingCommits` and
 * assert the expected placement is AMONG the mutating commits' carets (a later mutating commit
 * can inherit the echo's yank); settles that hold (no splice) assert directly.
 */

import {
  $appendMilestoneRun,
  $appendVerseAttributeRun,
  findOnlyNote,
  noteUsx,
  requireDefined,
  serializedState,
  testEnvironment,
  testEnvironmentWithCharSync,
  testEnvironmentWithSpacing,
  viewOptions,
} from "./markerEdit.test-helpers";
import { IDLE_SETTLE_DELAY_MS, MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  KEY_DOWN_COMMAND,
  LexicalEditor,
  TextNode,
} from "lexical";
import {
  $chapterAltnumberRunPieces,
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createMilestoneNode,
  $createParaNode,
  $createVerseNode,
  $isChapterNode,
  $isCharNode,
  $isMarkerNode,
  $isMilestoneNode,
  $isParaNode,
  $isVerseNode,
  $milestoneAttributeRunPieces,
  $noteCategoryRunPieces,
  getVisibleOpenMarkerText,
  MilestoneNode,
  NBSP,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Type `text` one character at a time as a user gesture: a keydown (re-arms the idle clock the
 * way the plugin's KEY_DOWN handler expects) plus an `insertText` at the live selection. */
async function typeText(editor: LexicalEditor, text: string): Promise<void> {
  for (const ch of text) {
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: ch }));
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(ch);
      });
    });
  }
}

/** The caret after each MUTATING commit (non-empty dirty sets) — the settle computation's own
 * placements. jsdom's follow-on selection-only echo (ZERO dirty nodes, no tags, stale-DOM
 * re-derivation) is excluded by the dirty-set gate, but a LATER mutating commit can inherit the
 * echo's yanked selection, so callers assert the expected placement is AMONG the recorded ones
 * rather than last. See the file header. */
function trackMutatingCommits(editor: LexicalEditor): {
  includes: (expected: { text: string; offset: number }) => boolean;
  all: () => { text: string; offset: number }[];
} {
  const commits: { text: string; offset: number }[] = [];
  editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
    if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
    editorState.read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
      const node = selection.anchor.getNode();
      if (!$isTextNode(node)) return;
      commits.push({ text: node.getTextContent(), offset: selection.anchor.offset });
    });
  });
  return {
    includes: (expected) =>
      commits.some((commit) => commit.text === expected.text && commit.offset === expected.offset),
    all: () => [...commits],
  };
}

/** Two paragraphs: `\p before <ms qt-s (no attributes)> after` and a `\p body` to depart to. */
function $milestoneFixture(): MilestoneNode {
  const milestone = $createMilestoneNode("qt-s");
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createMarkerTrailingSeparator(),
      $createTextNode("before "),
      milestone,
      $createTextNode(" after"),
    ),
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createMarkerTrailingSeparator(),
      $createTextNode("body"),
    ),
  );
  $appendMilestoneRun(milestone, "");
  return milestone;
}

/** Caret at the end of the milestone's opening glyph — between the `s` and the closer's `\`. */
async function $caretAtMilestoneOpenerEnd(
  editor: LexicalEditor,
  milestone: MilestoneNode,
): Promise<void> {
  await act(async () =>
    editor.update(() => {
      const { opening } = $milestoneAttributeRunPieces(milestone);
      const opener = requireDefined(opening ?? undefined, "milestone opener glyph missing");
      opener.select(opener.getTextContentSize(), opener.getTextContentSize());
    }),
  );
}

function $firstParaText(): string {
  return $getRoot().getChildren().filter($isParaNode)[0].getTextContent();
}

describe("milestone glyph typed bytes", () => {
  it("keeps a typed `|` the tokenizer would drop PENDING on the idle tick — byte and caret", async () => {
    let milestone!: MilestoneNode;
    const { editor } = await testEnvironment(() => {
      milestone = $milestoneFixture();
    });
    await $caretAtMilestoneOpenerEnd(editor, milestone);
    await typeText(editor, "|");

    editor.getEditorState().read(() => {
      expect($firstParaText()).toContain("\\qt-s|\\*");
    });

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // The typed byte is still on screen: `\qt-s|\*` tokenizes to a milestone with NO
      // attributes, so a settle could only produce bytes with the `|` DROPPED — accept-then-
      // discard under a live caret. The site stays visibly pending instead.
      expect($firstParaText()).toContain("\\qt-s|\\*");
      // No attribute was fabricated and the milestone survived untouched.
      expect(milestone.isAttached()).toBe(true);
      expect(milestone.getUnknownAttributes()).toBeUndefined();
      // The caret has not moved: still at the typed byte inside the opener glyph.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isMarkerNode(anchorNode) && anchorNode.getTextContent()).toBe("\\qt-s|");
      expect(selection.anchor.offset).toBe(6);
    });
  });

  it("resolves the held `|` per the tokenizer on genuine caret departure — no byte survives that the tokenizer drops", async () => {
    let milestone!: MilestoneNode;
    const { editor } = await testEnvironment(() => {
      milestone = $milestoneFixture();
    });
    await $caretAtMilestoneOpenerEnd(editor, milestone);
    await typeText(editor, "|");

    // Depart to the body paragraph; the departure settle re-tokenizes the displayed bytes.
    // `\qt-s|\*` means a milestone with no attributes, so the canonical form has no `|`.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot().getChildren().filter($isParaNode)[1].getLastChild();
        if (!$isTextNode(body)) throw new Error("body text missing");
        body.select(0, 0);
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });

    editor.getEditorState().read(() => {
      expect($firstParaText()).toContain("\\qt-s\\*");
      expect($firstParaText()).not.toContain("|");
      const milestones = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .filter($isMilestoneNode);
      expect(milestones).toHaveLength(1);
      expect(milestones[0].getUnknownAttributes()).toBeUndefined();
    });
  });

  it("resolves a typed COMPLETE attribute list on the idle tick, caret kept after its byte", async () => {
    let milestone!: MilestoneNode;
    const { editor } = await testEnvironment(() => {
      milestone = $milestoneFixture();
    });
    const commits = trackMutatingCommits(editor);
    await $caretAtMilestoneOpenerEnd(editor, milestone);
    await typeText(editor, '|x="y"');

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // The displayed bytes re-tokenize to a milestone WITH the attribute — the tokenizer's
      // meaning for `\qt-s|x="y"\*` — and the run heals to its canonical form.
      const milestones = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .filter($isMilestoneNode);
      expect(milestones).toHaveLength(1);
      expect(milestones[0].getUnknownAttributes()).toEqual({ x: "y" });
      expect($firstParaText()).toContain(`\\qt-s${NBSP}|x="y"\\*`);
    });
    // The settle's own caret restore kept the caret after the last typed byte: the closing
    // quote, now the end of the canonical value text. Asserted over the MUTATING commits (see
    // trackMutatingCommits) so jsdom's stale-DOM selection echo cannot fail a correct restore.
    expect(commits.all()).not.toHaveLength(0);
    expect(commits.includes({ text: `${NBSP}|x="y"`, offset: 7 })).toBe(true);
  });

  it("resolves a typed letter to the tokenizer's paragraph split, caret kept in the renamed glyph", async () => {
    let milestone!: MilestoneNode;
    const { editor } = await testEnvironment(() => {
      milestone = $milestoneFixture();
    });
    const commits = trackMutatingCommits(editor);
    await $caretAtMilestoneOpenerEnd(editor, milestone);
    await typeText(editor, "a");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // `\qt-sa\*` is no longer a milestone: the tokenizer reads an unknown marker `qt-sa`
      // (resolved positionally as a paragraph) followed by an unmatched `\*`. The displayed
      // bytes win; the milestone dissolves.
      const paras = $getRoot().getChildren().filter($isParaNode);
      expect(paras.some((para) => para.getMarker() === "qt-sa")).toBe(true);
      const milestones = paras.flatMap((para) => para.getChildren()).filter($isMilestoneNode);
      expect(milestones).toHaveLength(0);
    });
    // The settle restored the caret into the renamed glyph at the typed byte.
    expect(commits.all()).not.toHaveLength(0);
    expect(commits.includes({ text: "\\qt-sa", offset: 6 })).toBe(true);
  });

  it("renames the milestone to ANOTHER KNOWN milestone on the idle tick, reaching node state", async () => {
    // The sibling above renames to an UNKNOWN marker, where the milestone dissolves and the
    // paragraph split makes the change impossible to miss. This one renames to a marker that is
    // still a milestone (`qt-s` → `qt1-s`, both in the stylesheet), which is the shape that was
    // silently discarded: the glyph bytes are identical on both sides of the fixed-point
    // comparison, so only the milestone's own `marker` field reveals the rebuild is not a no-op.
    // Asserted on NODE STATE, because that — not the glyph — is what the save leg serializes.
    let milestone!: MilestoneNode;
    const { editor } = await testEnvironment(() => {
      milestone = $milestoneFixture();
    });
    // Caret between `\qt` and `-s`, so the typed `1` lands mid-name.
    await act(async () =>
      editor.update(() => {
        const { opening } = $milestoneAttributeRunPieces(milestone);
        requireDefined(opening ?? undefined, "milestone opener glyph missing").select(3, 3);
      }),
    );
    await typeText(editor, "1");

    editor.getEditorState().read(() => {
      expect($firstParaText()).toContain("\\qt1-s\\*");
    });

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const milestones = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .filter($isMilestoneNode);
      // Still exactly one milestone — and it is the RENAMED one, in node state.
      expect(milestones).toHaveLength(1);
      expect(milestones[0].getMarker()).toBe("qt1-s");
      expect($firstParaText()).toContain("\\qt1-s\\*");
    });
  });
});

describe("char glyph typed bytes", () => {
  it("a `|` typed at the opener glyph's end resolves to span content, caret kept after it", async () => {
    let opener!: TextNode;
    const { editor } = await testEnvironmentWithCharSync(() => {
      opener = $createMarkerNode("nd");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("x "),
          $createCharNode("nd").append(
            opener,
            $createTextNode(`${NBSP}word`),
            $createMarkerNode("nd", "closing"),
          ),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("body"),
        ),
      );
    });
    await act(async () =>
      editor.update(() => opener.select(opener.getTextContentSize(), opener.getTextContentSize())),
    );
    await typeText(editor, "|");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // `\nd| word\nd*` re-tokenized: the `|` is CONTENT of the span (the tokenizer's meaning
      // for an `nd`, which carries no attributes) — the span keeps its marker.
      const span = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .find($isCharNode);
      expect(requireDefined(span, "span missing").getMarker()).toBe("nd");
      const content = span
        ?.getChildren()
        .find((child) => $isTextNode(child) && !$isMarkerNode(child));
      expect(content?.getTextContent()).toBe(`${NBSP}| word`);
      // Caret immediately AFTER the typed `|`, which hopped the engine's NBSP separator during
      // the rebuild — the caret follows its byte, not a raw character offset.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(content ?? undefined)).toBe(true);
      expect(selection.anchor.offset).toBe(2);
    });
  });

  it("a letter typed INSIDE the opener's marker name settles without moving the caret", async () => {
    // The settle is a background event the user did not ask for, so it may not relocate the caret
    // out of the name the user is still editing. `\wj asdf\wj*` with the caret between the `w`
    // and the `j`, then `s`: the name resolves to `wsj` and the closer follows it, but the caret
    // belongs exactly where the user left it — `\ws|j` — not at the start of the content. The
    // content landing is the OTHER gesture (a name FINISHED by a typed terminator), pinned in
    // typedSeparatorSpace.test.tsx.
    let opener!: TextNode;
    const { editor } = await testEnvironmentWithCharSync(() => {
      opener = $createMarkerNode("wj");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("x "),
          $createCharNode("wj").append(
            opener,
            $createTextNode(`${NBSP}asdf`),
            $createMarkerNode("wj", "closing"),
          ),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("body"),
        ),
      );
    });
    // A user mid-word has the editor FOCUSED. Without that, Lexical's own no-op path through
    // `updateDOMSelection` calls `rootElement.focus()` (the root is not the active element), and
    // jsdom answers by collapsing the document selection to the editor start — a follow-on
    // selection-only commit then re-derives the caret from it. That is the environment, not the
    // settle: every MUTATING commit below already carries the right caret either way.
    editor.getRootElement()?.focus();
    // `\w|j` — inside the marker name, between its two characters.
    await act(async () => editor.update(() => opener.select(2, 2)));
    await typeText(editor, "s");

    editor.getEditorState().read(() => {
      expect(opener.getTextContent()).toBe("\\wsj");
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.offset).toBe(3);
    });

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const span = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .find($isCharNode);
      // The name resolved and the closer followed it — the settle did its job.
      expect(requireDefined(span, "span missing").getMarker()).toBe("wsj");
      expect(span?.getTextContent()).toBe(`\\wsj${NBSP}asdf\\wsj*`);
      // ...and the caret is still inside the name, on the same side of the typed `s`.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isMarkerNode(anchorNode) && anchorNode.getTextContent()).toBe("\\wsj");
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("a `|` typed inside the closer glyph resolves to the tokenizer's span split, caret kept after it", async () => {
    let closer!: TextNode;
    const { editor } = await testEnvironmentWithCharSync(() => {
      closer = $createMarkerNode("nd", "closing");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("x "),
          $createCharNode("nd").append(
            $createMarkerNode("nd"),
            $createTextNode(`${NBSP}word`),
            closer,
          ),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("body"),
        ),
      );
    });
    // Caret between the `d` and the `*` of `\nd*`.
    await act(async () =>
      editor.update(() =>
        closer.select(closer.getTextContentSize() - 1, closer.getTextContentSize() - 1),
      ),
    );
    await typeText(editor, "|");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      // `\nd word\nd|*` re-tokenized: the damaged closer no longer closes anything, so the
      // bytes mean TWO unclosed spans — the second holding `|*` as content.
      const spans = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((para) => para.getChildren())
        .filter($isCharNode);
      expect(spans).toHaveLength(2);
      const second = spans[1]
        .getChildren()
        .find((child) => $isTextNode(child) && !$isMarkerNode(child));
      expect(second?.getTextContent()).toBe(`${NBSP}|*`);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(second ?? undefined)).toBe(true);
      expect(selection.anchor.offset).toBe(2);
    });
  });
});

describe("para glyph typed bytes", () => {
  it("a letter typed INSIDE the paragraph marker's name settles without moving the caret", async () => {
    // The char twin's other arm: `$applyOpenerRename` renames the ParaNode in place here, and the
    // same rule holds — a settle the user did not ask for may not lift the caret out of the name
    // they are still typing.
    let opener!: TextNode;
    const { editor } = await testEnvironment(() => {
      opener = $createMarkerNode("q2");
      $getRoot().append(
        $createParaNode("q2").append(
          opener,
          $createMarkerTrailingSeparator(),
          $createTextNode("body text"),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("second"),
        ),
      );
    });
    // Focused, as a user mid-word is — see the char twin for what jsdom does otherwise.
    editor.getRootElement()?.focus();
    // `\q|2` — between the name's two characters.
    await act(async () => editor.update(() => opener.select(2, 2)));
    await typeText(editor, "a");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const paras = $getRoot().getChildren().filter($isParaNode);
      // The paragraph took the typed name.
      expect(paras.some((para) => para.getMarker() === "qa2")).toBe(true);
      expect(paras.some((para) => para.getMarker() === "q2")).toBe(false);
      // The caret never left the name it was typed into.
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const anchorNode = selection.anchor.getNode();
      expect($isMarkerNode(anchorNode) && anchorNode.getTextContent()).toBe("\\qa2");
      expect(selection.anchor.offset).toBe(3);
    });
  });
});

describe("attribute-run value typed bytes (regression pins)", () => {
  it("a `|` typed into a \\va value resolves into altnumber on the idle tick, bytes and caret kept", async () => {
    const { editor } = await testEnvironmentWithSpacing(() => {
      const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "1 va");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          verse,
          $createTextNode(" This verse."),
        ),
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("body"),
        ),
      );
      $appendVerseAttributeRun(verse, "va", "1 va");
    });
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const verse = requireDefined(para.getChildren().find($isVerseNode), "verse missing");
        const wrapper = verse.getNextSibling();
        if (!$isElementNode(wrapper)) throw new Error("va wrapper missing");
        const value = wrapper.getChildAtIndex(1);
        if (!$isTextNode(value)) throw new Error("va value missing");
        value.select(2, 2);
      }),
    );
    await typeText(editor, "|");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().filter($isParaNode)[0];
      const verse = requireDefined(para.getChildren().find($isVerseNode), "verse missing");
      // The byte resolved to its tokenized meaning: it is part of the altnumber now.
      expect(verse.getAltnumber()).toBe("1| va");
      // The displayed bytes are exactly what was typed, and the caret never moved.
      const wrapper = verse.getNextSibling();
      if (!$isElementNode(wrapper)) throw new Error("va wrapper missing");
      const value = wrapper.getChildAtIndex(1);
      expect($isTextNode(value) && value.getTextContent()).toBe(`${NBSP}1| va`);
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.getNode().is(value ?? undefined)).toBe(true);
      expect(selection.anchor.offset).toBe(3);
    });
  });

  it("a `|` typed into the chapter \\ca value resolves into altnumber on the idle tick", async () => {
    initializeSerialize(undefined, undefined);
    reset();
    const chapterUsj: Usj = {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1", altnumber: "2" },
        { type: "para", marker: "p", content: ["body text"] },
      ],
    };
    const state = serializeEditorState(chapterUsj, viewOptions);
    const { editor } = await baseTestEnvironment(
      JSON.stringify({ root: state.root }),
      <MarkerEditPlugin viewOptions={viewOptions} />,
    );
    await act(async () =>
      editor.update(() => {
        const chapter = requireDefined(
          $getRoot().getChildren().find($isChapterNode),
          "chapter missing",
        );
        const value = requireDefined($chapterAltnumberRunPieces(chapter).value, "ca value missing");
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await typeText(editor, "|");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const chapter = requireDefined(
        $getRoot().getChildren().find($isChapterNode),
        "chapter missing",
      );
      // Resolved, not discarded: the typed byte is part of the altnumber and stays displayed.
      expect(chapter.getAltnumber()).toBe("2|");
      expect($chapterAltnumberRunPieces(chapter).value?.getTextContent()).toBe(`${NBSP}2|`);
    });
  });

  it("a `|` typed into the note \\cat value resolves into category on the idle tick", async () => {
    const { editor } = await baseTestEnvironment(
      serializedState(noteUsx(`closed="false" category="People"`)),
      <MarkerEditPlugin viewOptions={viewOptions} />,
    );
    await act(async () =>
      editor.update(() => {
        const note = findOnlyNote($getRoot());
        const value = requireDefined($noteCategoryRunPieces(note).value, "cat value missing");
        value.select(value.getTextContentSize(), value.getTextContentSize());
      }),
    );
    await typeText(editor, "|");

    await advance(IDLE_SETTLE_DELAY_MS * 2);

    editor.getEditorState().read(() => {
      const note = findOnlyNote($getRoot());
      expect(note.getCategory()).toBe("People|");
      expect($noteCategoryRunPieces(note).value?.getTextContent()).toBe(`${NBSP}People|`);
    });
  });
});
