/**
 * Unformatted-view content NBSP preservation across a settle. In unformatted view the display
 * shows a data NBSP as the NBSP byte itself (no `~` display mapping), so when a settle rebuilds a
 * paragraph, the fragment layer must spell those content NBSPs the tokenizer's way (`~`, which
 * `usjText` maps back to NBSP) instead of flattening them to plain spaces — the flattening that
 * silently corrupted data NBSPs whenever a settle rewrote the text. Structural NBSPs (glyph
 * separators, the char span's leading prefix) still flatten to " " (see `contentFragmentText`,
 * tier2Rebuild.utils.ts).
 */
import editorUsjAdaptor, {
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { $pendGlyphEdit } from "./markerEdit.test-helpers";
import { COMMIT_PENDING_MARKERS_COMMAND, MarkerEditPlugin } from "./MarkerEditPlugin";
import { Tier2Context } from "./tier2Rebuild.utils";
import { $settledUsj } from "./virtualSettle.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isElementNode, LexicalEditor, LexicalNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $isCharNode,
  CharNode,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, UNFORMATTED_VIEW_MODE } from "shared-react";

// jsdom implements no layout, so `Range.prototype.getBoundingClientRect` is absent — same shim as
// markerEditTier2Trigger.utils.test.tsx (a settle can place the caret and trip Lexical's
// post-commit scroll-into-view).
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

const unformattedViewOptions = getViewOptions(UNFORMATTED_VIEW_MODE);
if (!unformattedViewOptions) throw new Error("Unformatted view options are required.");

const context: Tier2Context = { viewOptions: unformattedViewOptions, getMarker: bundledGetMarker };

/** Mounts a headless editor with `MarkerEditPlugin` active in UNFORMATTED view. */
async function unformattedTestEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={unformattedViewOptions} />,
  );
}

/** The current editor state as USJ through the unformatted reverse adaptor. */
function usjOf(editor: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return editorUsjAdaptor.deserializeEditorState(editor.getEditorState(), unformattedViewOptions);
}

/** Depth-first search for the first CharNode with `marker` anywhere under `root`. */
function $findFirstChar(root: LexicalNode, marker: string): CharNode | undefined {
  if ($isCharNode(root) && root.getMarker() === marker) return root;
  if (!$isElementNode(root)) return undefined;
  for (const child of root.getChildren()) {
    const found = $findFirstChar(child, marker);
    if (found) return found;
  }
  return undefined;
}

describe("unformatted view: content NBSP across a settle", () => {
  it("preserves a body-text data NBSP when a typed literal settles in the same paragraph", async () => {
    const { editor } = await unformattedTestEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode("alpha")),
      );
    });
    // One commit: the paragraph now holds a data NBSP AND a terminated literal, which triggers
    // the immediate rebuild — the settle rewrites the whole paragraph's text.
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "alpha");
        text?.setTextContent(`one${NBSP}two \\nd Lord\\nd* end`);
      }),
    );
    editor.getEditorState().read(() => {
      const rootText = $getRoot().getTextContent();
      expect(rootText).toContain(`one${NBSP}two`);
      expect(rootText).not.toContain("one two");
      expect($findFirstChar($getRoot(), "nd")).toBeDefined();
    });
    // The NBSP is a DATA byte: it must reach the USJ, not just the display.
    expect(JSON.stringify(usjOf(editor))).toContain(`one${NBSP}two`);
  });

  it("settles a typed `~` into a data NBSP (the tokenizer's input convention)", async () => {
    const { editor } = await unformattedTestEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode("alpha")),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "alpha");
        text?.setTextContent(`one~two \\nd Lord\\nd* end`);
      }),
    );
    editor.getEditorState().read(() => {
      const rootText = $getRoot().getTextContent();
      expect(rootText).toContain(`one${NBSP}two`);
      expect(rootText).not.toContain("one~two");
    });
    expect(JSON.stringify(usjOf(editor))).toContain(`one${NBSP}two`);
  });

  it("preserves a char-span interior data NBSP while the structural lead stays structural", async () => {
    const { editor } = await unformattedTestEnvironment(() => {
      const char = $createCharNode("nd");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          char.append(
            $createMarkerNode("nd"),
            // Structural lead (the display separator the adaptor fuses onto the first content
            // child) + content whose interior NBSP is DATA.
            $createTextNode(`${NBSP}Lo${NBSP}rd`),
            $createMarkerNode("nd", "closing"),
          ),
          $createTextNode(" tail"),
        ),
      );
    });
    // Force the paragraph to settle by typing a terminated literal after the span.
    await act(async () =>
      editor.update(() => {
        const text = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === " tail");
        text?.setTextContent(" tail \\wj glow\\wj* end");
      }),
    );
    const usjText = JSON.stringify(usjOf(editor));
    // Interior NBSP survives as data; the structural lead was NOT doubled into the content
    // (the reverse adaptor strips exactly one leading NBSP from the span's first string).
    expect(usjText).toContain(`Lo${NBSP}rd`);
    expect(usjText).not.toContain(`${NBSP}Lo${NBSP}rd`);
    expect(usjText).toContain('"marker":"wj"');
  });

  it("read-only settle (getUsj while pending) and the live settle agree on the NBSP byte", async () => {
    let glyph!: ReturnType<typeof $createMarkerNode>;
    const { editor } = await unformattedTestEnvironment(() => {
      glyph = $createMarkerNode("p");
      $getRoot().append($createParaNode("p").append(glyph, $createTextNode(`one${NBSP}two`)));
    });
    // A caret-less pending glyph rename (the undo/blur shape) makes the paragraph pending
    // without settling it, so the read-only settle actually has work to do.
    await act(async () =>
      editor.update(() => {
        $pendGlyphEdit(glyph, "\\q1");
      }),
    );
    const serializedState = editor.getEditorState().toJSON();
    const pendedKeys = getPendedDisplayOwners(editor) ?? new Set<string>();
    const mirror = editor
      .getEditorState()
      .read(() => $settledUsj(serializedState, pendedKeys, context));
    expect(mirror).toBeDefined();
    const mirrorPara = mirror?.content[0] as MarkerObject;
    expect(mirrorPara.marker).toBe("q1");
    expect(JSON.stringify(mirrorPara.content)).toContain(`one${NBSP}two`);

    // The live settle must produce byte-identically what the mirror predicted.
    await act(async () => {
      editor.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
    });
    expect(usjOf(editor)).toEqual(mirror);
  });
});
