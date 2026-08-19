/**
 * Verse bridging (`\v 5-6`) end to end: nothing in the editor ever pinned a bridged verse, so a
 * transform that assumed a verse number is one integer would have broken it silently. The three
 * legs here are the three places a bridge could be lost — what the glyph SHOWS, what the verse
 * NODE stores, and what the serialized document EMITS (USJ, and the USX the save path writes).
 *
 * The note-reference leg is pinned elsewhere and deliberately not duplicated: `$createNoteChildren`
 * substitutes the project's configured verse-range separator into a bridged `\fr`/`\xo` reference,
 * asserted for both the default `-` and a custom separator in shared-react's
 * `node-react-utils.test.ts`.
 *
 * A HALF-typed bridge (`\v 5-`) is held to the same three legs as a complete one: the trailing
 * separator is a displayed byte, so it survives a save rather than being truncated away.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { requireDefined, viewOptions } from "./markerEdit.test-helpers";
import { usjToUsxString } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
import {
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $createVerseNode,
  getVisibleOpenMarkerText,
  NBSP,
  VerseNode,
} from "shared";
import { CharNodePlugin, TextSpacingPlugin } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  baseTestEnvironment,
  typeTextAtSelection,
} from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

/** The transform-registering plugin trio, matching the sibling verse suites. */
async function mount($init: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $init,
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
    </>,
  );
}

function currentUsj(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  return requireDefined(
    deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions),
    "serialized USJ",
  );
}

/** One paragraph: `\p ` + `verse` + `body`. */
function $appendVerseParaWith(verse: VerseNode, body: string): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createMarkerTrailingSeparator(),
      verse,
      $createTextNode(body),
    ),
  );
}

describe("verse bridging", () => {
  it("shows, stores and emits a loaded bridge unchanged", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("5-6", getVisibleOpenMarkerText("v", "5-6"));
      $appendVerseParaWith(verse, "bridged body");
    });

    editor.getEditorState().read(() => {
      // The displayed glyph carries the whole bridge — a number split at the `-` would show here.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getTextContent()).toBe(`\\v${NBSP}5-6 `);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getNumber()).toBe("5-6");
    });

    const usj = currentUsj(editor);
    expect(usj.content?.[0]).toEqual({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "5-6" }, "bridged body"],
    });
    // The bytes the save path writes: editor USJ -> usjToUsxString -> the host's setChapterUSX.
    expect(usjToUsxString(usj)).toContain('<verse style="v" number="5-6"/>');
  });

  it("retags the verse when the bridge is typed onto a plain number", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
      $appendVerseParaWith(verse, "body");
    });
    // `\v 5|` — the caret directly after the number, where a user turning verse 5 into a bridge
    // types. Offset 4 is `\v` (2) + the NBSP separator (1) + the number (1).
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "-6", verse!, 4);

    editor.getEditorState().read(() => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getNumber()).toBe("5-6");
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getTextContent()).toBe(`\\v${NBSP}5-6 `);
    });
    expect(currentUsj(editor).content?.[0]).toEqual({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "5-6" }, "body"],
    });
  });

  it("keeps a half-typed bridge on screen, in the node, and in the emitted document", async () => {
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
      $appendVerseParaWith(verse, "body");
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "-", verse!, 4);
    // Depart the glyph, so this is the SETTLED shape and not an edit still in progress.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "body");
        body?.select(2, 2);
      }),
    );

    editor.getEditorState().read(() => {
      // Screen and node AGREE: both carry the trailing `-` the user typed.
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getTextContent()).toBe(`\\v${NBSP}5- `);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getNumber()).toBe("5-");
    });

    // ...and so does the emitted document. `parseNumberFromMarkerText` (node.utils.ts) lets the
    // number token end on a bridge/list separator, so it no longer stops at the last COMPLETE
    // token and overrides the node's own faithful number with a truncated parse. A save taken
    // while a bridge is half typed keeps the byte the screen is showing, as "displayed bytes are
    // the document" requires, and authored `\v 5-` round-trips — our tokenizer keeps it too (a
    // verse number is the whole word, valid or not).
    const usj = currentUsj(editor);
    expect(usj.content?.[0]).toEqual({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "5-" }, "body"],
    });
    // The save leg, all the way to the bytes the host writes.
    expect(usjToUsxString(usj)).toContain('<verse style="v" number="5-"/>');
  });

  it("lands the complete bridge when the half-typed one is finished afterwards", async () => {
    // A half-typed bridge is transient by definition: keeping `5-` must not strand the verse
    // there. Typing the second number — after a settle has already run over `5-` — completes it.
    let verse: VerseNode;
    const { editor } = await mount(() => {
      verse = $createVerseNode("5", getVisibleOpenMarkerText("v", "5"));
      $appendVerseParaWith(verse, "body");
    });
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "-", verse!, 4);
    // Depart to the body and back, so the `5-` state settles before the bridge is finished.
    await act(async () =>
      editor.update(() => {
        const body = $getRoot()
          .getAllTextNodes()
          .find((node) => node.getTextContent() === "body");
        body?.select(2, 2);
      }),
    );
    // `\v 5-|` — back at the end of the number.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await typeTextAtSelection(editor, "6", verse!, 5);

    editor.getEditorState().read(() => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getTextContent()).toBe(`\\v${NBSP}5-6 `);
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(verse!.getNumber()).toBe("5-6");
    });
    const usj = currentUsj(editor);
    expect(usj.content?.[0]).toEqual({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "5-6" }, "body"],
    });
    expect(usjToUsxString(usj)).toContain('<verse style="v" number="5-6"/>');
  });
});
