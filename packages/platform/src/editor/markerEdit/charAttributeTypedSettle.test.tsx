/**
 * Typed char-attribute text must settle into real attribute state.
 *
 * The reported defect said undoing and moving off left attribute text on screen that never became
 * attribute state — the screen-vs-file divergence Invariant I forbids. That exact gesture is
 * already pinned (markerEditUndoResettle.test.tsx), but only with the marker-edit engine mounted
 * ALONE; the char attribute run is jointly owned by `CharNodePlugin`'s self-healing sync, and the
 * documented failure mode for this run kind is the two plugins interacting (see
 * charAttributeDeletionSettle.test.tsx). This suite covers the settle under the plugin stack the
 * app actually mounts, and across the shapes a user can type attributes into.
 *
 * Every assertion is checked against `usfmFragmentToUsjContent` — the tokenizer — rather than
 * against a hand-written expectation. Settle IS re-tokenization (Invariant I's corollary), so a
 * pin that hard-codes its own answer can drift away from the tokenizer without failing. That
 * matters most for the unclosed-span case, where NOT parsing the bytes as attributes is the
 * correct outcome and would otherwise look like the reported bug.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { requireDefined, viewOptions } from "./markerEdit.test-helpers";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject } from "@eten-tech-foundation/scripture-utilities";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $setState,
  CLICK_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $charAttributeDisplayNode,
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  $isParaNode,
  CharNode,
  NBSP,
  textTypeState,
  usfmFragmentToUsjContent,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  CharNodePlugin,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
} from "shared-react";

// The test environments don't implement `getBoundingClientRect`; moving the caret gives the editor
// root DOM focus and Lexical's post-commit scroll-into-view reads a rect off the selection target.
// Stub both (zero rects nothing here asserts on), same as the sibling marker-edit suites.
function zeroRect(): DOMRect {
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
}
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = zeroRect;
if (typeof Element.prototype.getBoundingClientRect !== "function")
  Element.prototype.getBoundingClientRect = zeroRect;

/**
 * The plugin set `Editor.tsx` mounts for Standard view, in its order, plus history. The narrower
 * helpers in markerEdit.test-helpers omit one sync or the other, which hides exactly the
 * cross-plugin interactions this run kind fails in.
 */
async function appStackEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <TextSpacingPlugin />
      <HistoryPlugin />
    </>,
  );
}

type EditorHandle = Awaited<ReturnType<typeof appStackEnvironment>>["editor"];

/** Flush the deferred (microtask) pending-marker resolution twice, inside act. */
async function flushResolution() {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  });
}

interface Seed {
  /** The span's plain content TextNode, the node a user types attribute bytes after. */
  content: TextNode;
  /** The span's settled attribute display run, when the seed starts with attributes. */
  run?: TextNode;
  /** A text node in a second paragraph, to depart to. */
  other: TextNode;
}

/**
 * Seed one settled char span (`marker`, content `text`, optional settled `attributes` + run) plus
 * a second paragraph to depart to. Seeding the run explicitly means the span starts SETTLED — the
 * sync has nothing to construct, so it cannot rebuild nodes in the same commit that places the
 * caret and drop the selection to the document start.
 */
function $seedSpan(
  marker: string,
  text: string,
  attributes?: Record<string, string>,
  runText?: string,
): Seed {
  const char = $createCharNode(marker, attributes);
  const content = $createTextNode(`${NBSP}${text}`);
  const children: TextNode[] = [$createMarkerNode(marker), content];
  let run: TextNode | undefined;
  if (runText !== undefined) {
    run = $createTextNode(runText);
    $setState(run, textTypeState, "attribute");
    children.push(run);
  }
  children.push($createMarkerNode(marker, "closing"));
  const other = $createTextNode("elsewhere");
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      char.append(...children),
    ),
    $createParaNode("p").append($createMarkerNode("p"), other),
  );
  return { content, run, other };
}

/** The paragraph's only char span, re-queried (Lexical rebuilds detach cross-commit references). */
function $onlySpan(): CharNode {
  return requireDefined(
    $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode),
    "char span missing",
  );
}

/** Type `characters` one keystroke at a time at the current caret, as the user does. */
async function type(editor: EditorHandle, characters: string) {
  for (const character of characters) {
    await act(async () =>
      editor.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(character);
      }),
    );
  }
}

/** Move the caret to the second paragraph — the departure that settles what pended. */
async function depart(editor: EditorHandle, other: TextNode) {
  await act(async () => editor.update(() => other.select(0, 0)));
  await flushResolution();
}

/** The first paragraph's USJ — the FILE side of the screen-vs-file comparison. */
function paraUsj(editor: EditorHandle): MarkerObject {
  initializeDeserialize(undefined);
  const usj = editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), viewOptions);
  return usj?.content?.[0] as MarkerObject;
}

/**
 * Assert the settled paragraph equals what the tokenizer makes of the same bytes. `usfm` is the
 * paragraph as the user sees it on screen, with a plain space for the display NBSP the editor uses
 * after a marker glyph.
 */
function expectSettlesLikeTokenizer(editor: EditorHandle, usfm: string) {
  const [expected] = usfmFragmentToUsjContent(usfm) as MarkerObject[];
  expect(paraUsj(editor)).toEqual(expected);
}

describe("typed char attribute text settles into real attribute state (A2)", () => {
  it("settles a named attribute typed at a closed span's content end", async () => {
    let seed!: Seed;
    const { editor } = await appStackEnvironment(() => (seed = $seedSpan("nd", "text")));
    await act(async () => editor.update(() => seed.content.select(5, 5)));
    await type(editor, `|stuff="thing"`);
    await depart(editor, seed.other);

    editor.getEditorState().read(() => {
      expect($onlySpan().getUnknownAttributes()).toEqual({ stuff: "thing" });
      expect($charAttributeDisplayNode($onlySpan())?.getTextContent()).toBe('|stuff="thing"');
    });
    expectSettlesLikeTokenizer(editor, `\\p \\nd text|stuff="thing"\\nd*`);
  });

  it("settles a BARE default attribute on \\w into its declared name", async () => {
    // `w`'s default attribute is `lemma`, so `|G5485` means lemma="G5485" — the shorthand a user
    // is most likely to type, and the one place the attribute NAME is not in the typed bytes.
    let seed!: Seed;
    const { editor } = await appStackEnvironment(() => (seed = $seedSpan("w", "grace")));
    await act(async () => editor.update(() => seed.content.select(6, 6)));
    await type(editor, `|G5485`);
    await depart(editor, seed.other);

    editor
      .getEditorState()
      .read(() => expect($onlySpan().getUnknownAttributes()).toEqual({ lemma: "G5485" }));
    expectSettlesLikeTokenizer(editor, `\\p \\w grace|G5485\\w*`);
  });

  it("settles a SECOND attribute typed at the end of an existing run", async () => {
    let seed!: Seed;
    const { editor } = await appStackEnvironment(
      () => (seed = $seedSpan("nd", "text", { stuff: "thing" }, '|stuff="thing"')),
    );
    const run = requireDefined(seed.run, "seeded run missing");
    await act(async () =>
      editor.update(() => run.select(run.getTextContentSize(), run.getTextContentSize())),
    );
    await type(editor, ` more="bits"`);
    await depart(editor, seed.other);

    editor
      .getEditorState()
      .read(() =>
        expect($onlySpan().getUnknownAttributes()).toEqual({ stuff: "thing", more: "bits" }),
      );
    expectSettlesLikeTokenizer(editor, `\\p \\nd text|stuff="thing" more="bits"\\nd*`);
  });

  it("leaves the bytes as CONTENT on an UNCLOSED span, matching the tokenizer", async () => {
    // Not the reported bug, and the distinction is worth a pin: with no closing marker there is no
    // attribute position, so `|stuff="thing"` is literal text. The tokenizer says so, and a settle
    // that "helpfully" parsed it would invent attributes the file never had. Unclosed spans are
    // ordinary here — a Space palette commit builds one, and note content is unclosed throughout.
    let seed!: Seed;
    const { editor } = await appStackEnvironment(() => {
      const char = $createCharNode("nd", { closed: "false" });
      const content = $createTextNode(`${NBSP}text`);
      const other = $createTextNode("elsewhere");
      seed = { content, other };
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append($createMarkerNode("nd"), content),
        ),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });
    await act(async () => editor.update(() => seed.content.select(5, 5)));
    await type(editor, `|stuff="thing"`);
    await depart(editor, seed.other);

    editor
      .getEditorState()
      .read(() => expect($onlySpan().getUnknownAttributes()).toEqual({ closed: "false" }));
    expectSettlesLikeTokenizer(editor, `\\p \\nd text|stuff="thing"`);
  });
});

describe("undo then departure re-settles the attribute under the app's full plugin stack (A2)", () => {
  /**
   * The reported gesture. `markerEditUndoResettle.test.tsx` pins it with the engine mounted alone;
   * this runs it with both display syncs around the engine, because a historic restore re-derives
   * pends caret-lessly and the char sync re-derives the run from the span's attribute state — the
   * two could each undo the other's work without either being wrong on its own.
   */
  it("re-settles after settle → undo → user caret departure", async () => {
    let seed!: Seed;
    const { editor } = await appStackEnvironment(() => (seed = $seedSpan("nd", "text")));
    await act(async () => editor.update(() => seed.content.select(5, 5)));
    await type(editor, `|stuff="thing"`);
    await depart(editor, seed.other);
    editor
      .getEditorState()
      .read(() => expect($onlySpan().getUnknownAttributes()).toEqual({ stuff: "thing" }));

    // Undo restores the pre-settle literal: bytes on screen, no attribute state.
    await act(async () => {
      editor.dispatchCommand(UNDO_COMMAND, undefined);
    });
    await flushResolution();
    editor.getEditorState().read(() => {
      expect($onlySpan().getUnknownAttributes()).toBeUndefined();
      expect($charAttributeDisplayNode($onlySpan())).toBeUndefined();
      expect($getRoot().getTextContent()).toContain('|stuff="thing"');
    });

    // A real user gesture ends the app-placed-caret suppression window a historic restore arms;
    // the departure that follows must settle the restored literal rather than leave it forever.
    await act(async () => {
      editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
    });
    await act(async () =>
      editor.update(() => {
        const target = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent().includes("elsewhere"));
        target?.select(4, 4);
      }),
    );
    await flushResolution();

    editor
      .getEditorState()
      .read(() => expect($onlySpan().getUnknownAttributes()).toEqual({ stuff: "thing" }));
    expectSettlesLikeTokenizer(editor, `\\p \\nd text|stuff="thing"\\nd*`);
  });
});

/**
 * Forward pin for the report that typing a closing marker destroys a span's default attribute.
 *
 * Checked at the Phase-3 branch point and at the standard-view tip before it: GREEN at both, so
 * nothing here fixed it and it was never broken at either base. Recorded rather than dropped,
 * because the shape is the one most likely to break silently — `\w`'s default attribute is spelled
 * BARE (`|G5485`), so the attribute NAME appears nowhere in the bytes and a settle that lost it
 * would leave a span that still looks right on screen.
 */
describe("typing a closing marker keeps the span's default attribute (A1)", () => {
  it("turns |G5485 into lemma when the closer bytes are typed at an unclosed \\w span's end", async () => {
    // Unclosed is the Space-palette commit's shape, and while unclosed the `|…` bytes are content
    // (charAttributeTypedSettle's unclosed-span pin above). Typing the closer is exactly what
    // promotes them to a real attribute, so this is the moment the value is most at risk.
    let seed!: Seed;
    const { editor } = await appStackEnvironment(() => {
      const char = $createCharNode("w", { closed: "false" });
      const content = $createTextNode(`${NBSP}grace|G5485`);
      const other = $createTextNode("elsewhere");
      seed = { content, other };
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          char.append($createMarkerNode("w"), content),
        ),
        $createParaNode("p").append($createMarkerNode("p"), other),
      );
    });

    // The typed closer arrives as literal bytes with the caret on them — the shape Tier 2
    // re-tokenizes. (Typing `\` itself now opens the palette, so the keystroke path differs by
    // revision; the BYTES the document ends up holding do not, which is what settle reads.)
    await act(async () =>
      editor.update(() => {
        const typed = `${seed.content.getTextContent()}\\w*`;
        seed.content.setTextContent(typed);
        seed.content.select(typed.length, typed.length);
      }),
    );
    await depart(editor, seed.other);

    editor
      .getEditorState()
      .read(() => expect($onlySpan().getUnknownAttributes()).toEqual({ lemma: "G5485" }));
    expectSettlesLikeTokenizer(editor, `\\p \\w grace|G5485\\w*`);
  });
});
