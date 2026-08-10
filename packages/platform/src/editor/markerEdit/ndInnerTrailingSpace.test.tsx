/**
 * A closed character span whose content ends in a space before the closer
 * (`\nd come togedda \nd*`) must survive every editor-side pipeline byte-for-byte. That inner
 * trailing space is SIGNIFICANT content: it is not at the end of a block, so the host's
 * whitespace-insensitive save comparison treats a dropped one as a real divergence, and the
 * editor↔PDP lossy warning fires on every save of the chapter that holds it.
 *
 * ParatextData is not the source: its own captured pins keep the space as content and round-trip
 * the span as a fixed point (paranext-core `c-sharp-tests/Projects/NdSpanRoundTripCaptureTests.cs`).
 * These are the editor's half of that attribution — static serialization, serialization with the
 * live plugin stack mounted (before and after an edit in the same paragraph), the Tier-2 fragment
 * tokenization every settle runs, and the settled `getUsj()` read a real host save calls, forced
 * through its `$settledUsj` path (not the cached fast path) by an unrelated pend in the same
 * paragraph.
 */
import { mountStandardViewEditor } from "../settledGetUsj.test-helpers";
import { viewOptions } from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../adaptors/usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isTextNode } from "lexical";
import {
  $isParaNode,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
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

const SPAN_TEXT = "come togedda ";

const luke4v9Usj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "LUK", content: ["LUK"] },
    { type: "chapter", marker: "c", number: "4" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "9" },
        "He led him to Jerusalem and ",
        { type: "char", marker: "nd", content: [SPAN_TEXT] },
        " and said to him.",
      ],
    },
  ],
};

/** The `\nd` span's content string in a doc shaped like `luke4v9Usj`. */
function ndSpanTextOf(usj: Usj | undefined): unknown {
  const para = usj?.content[2];
  if (!para || typeof para === "string") return undefined;
  const span = (para as MarkerObject).content?.find(
    (entry) => typeof entry !== "string" && entry.type === "char",
  );
  if (!span || typeof span === "string") return undefined;
  return span.content?.[0];
}

describe("closed \\nd span with an inner trailing space", () => {
  it("survives the static USJ -> editor state -> USJ round trip", () => {
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined);
    reset();
    const state = serializeEditorState(luke4v9Usj, viewOptions);
    expect(ndSpanTextOf(deserializeSerializedEditorState(state, viewOptions))).toBe(SPAN_TEXT);
  });

  it("survives serialization with the live plugin stack mounted, before and after an edit", async () => {
    initializeSerialize(undefined, undefined);
    initializeDeserialize(undefined);
    reset();
    const state = serializeEditorState(luke4v9Usj, viewOptions);
    const { editor } = await baseTestEnvironment(
      undefined,
      <>
        <CharNodePlugin />
        <TextSpacingPlugin />
        <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      </>,
    );
    await act(async () => {
      editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
    });
    expect(
      ndSpanTextOf(deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions)),
    ).toBe(SPAN_TEXT);

    // Edit the text AFTER the span in the same paragraph: the span's own node is dirtied by the
    // neighbouring commit, which is the shape a live typing session produces.
    await act(async () => {
      editor.update(
        () => {
          const tail = $getRoot()
            .getAllTextNodes()
            .find((node) => node.getTextContent().includes("and said to him."));
          if (!tail || !$isTextNode(tail)) throw new Error("tail text node not found");
          tail.setTextContent(" and said to him!");
        },
        { discrete: true },
      );
    });
    expect(
      ndSpanTextOf(deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions)),
    ).toBe(SPAN_TEXT);
  });

  it("survives the Tier-2 fragment tokenization every settle runs", () => {
    const content = usfmFragmentToUsjContent(
      "\\p \\v 9 He led him to Jerusalem and \\nd come togedda \\nd* and said to him.",
      { getMarker: bundledGetMarker },
    );
    expect(
      ndSpanTextOf({ type: "USJ", version: "3.1", content: [{}, {}, ...content] } as Usj),
    ).toBe(SPAN_TEXT);
  });

  it("survives the settled getUsj() read, forced through $settledUsj by an unrelated pend in the same paragraph", async () => {
    const { ref, lexical } = await mountStandardViewEditor(luke4v9Usj);

    // Rename the paragraph's own opening glyph (`\p` -> `\q1`): a structural pend whose settle
    // scope is the whole paragraph (`$settleScopeForNode`), so reading `getUsj()` while it is
    // pending routes through `$settledParaNodes`, which re-tokenizes the ENTIRE paragraph
    // fragment — including the `\nd` span — via the same Tier-2 tokenizer the previous pin
    // exercises directly. A plain text edit elsewhere would not reliably create pended state at
    // all (MarkerEditPlugin only pends marker-shaped edits), which would let `getUsj()` take its
    // `pendedKeys.size === 0` fast path and silently skip `$settledUsj` entirely.
    await act(async () => {
      lexical.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!glyph || !$isTextNode(glyph)) throw new Error("expected a prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
      await Promise.resolve();

      // Confirm the rename genuinely landed pending before reading the settled output — otherwise
      // `getUsj()` would take the cached fast path and this pin would prove nothing about
      // `$settledUsj` at all.
      const pending = getPendedDisplayOwners(lexical);
      expect(pending?.size).toBeGreaterThan(0);

      expect(ndSpanTextOf(ref.current?.getUsj())).toBe(SPAN_TEXT);
    });

    // Commit for real, so the fully materialized settle — the same one a host save reads after
    // the pend resolves — is pinned too, not just the virtual read above.
    act(() => ref.current?.commitPendingMarkerEdits());
    expect(ndSpanTextOf(ref.current?.getUsj())).toBe(SPAN_TEXT);
  });
});
