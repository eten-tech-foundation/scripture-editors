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
 * The third test pins a DIVERGENCE, not desired behavior — see its own comment.
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

  it("keeps a half-typed bridge on screen and in the node, but drops it from the emitted document", async () => {
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

    // ...and the emitted document does NOT. `parseNumberFromMarkerText` (node.utils.ts) matches a
    // COMPLETE verse-number token and stops, so the trailing bridge separator is truncated away —
    // and the truncated parse then overrides the node's own faithful number. A document saved
    // while a bridge is half typed silently loses the byte the screen is showing, which
    // "displayed bytes are the document" forbids. Our own tokenizer keeps it (a verse number is
    // the whole word, valid or not), so this is also a round-trip loss for authored `\v 5-`.
    //
    // Pinned as the divergence it is, NOT as desired behavior: fixing it means deciding what a
    // verse number may contain. The narrowest candidate is to let the token end on a trailing
    // `-`/`,` separator, which leaves the shapes the sibling suites pin untouched (`\v 7 5` is
    // verse 7 plus body text `5`; `\v 2\ Da` is verse 2 plus the literal). When that lands, this
    // assertion flips to `"5-"` on both sides.
    expect(currentUsj(editor).content?.[0]).toEqual({
      type: "para",
      marker: "p",
      content: [{ type: "verse", marker: "v", number: "5" }, "body"],
    });
  });
});
