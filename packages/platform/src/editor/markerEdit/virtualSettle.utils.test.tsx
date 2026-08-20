/**
 * The read-only settle: the USJ a Tier-2 settle WOULD produce, computed without touching the
 * editor. Each case drives a real pending edit through the mounted engine, reads the settled USJ,
 * and then asserts the editor itself is unchanged — the two halves of the contract.
 */
import { deserializeSerializedEditorState } from "../adaptors/editor-usj.adaptor";
import {
  $appendMilestoneRun,
  $pendGlyphEdit,
  testEnvironment,
  testEnvironmentExpanded,
  viewOptions,
} from "./markerEdit.test-helpers";
import { $settledUsj } from "./virtualSettle.utils";
import { Tier2Context } from "./tier2Rebuild.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, $setState, LexicalEditor } from "lexical";
import {
  $createCharNode,
  $createImmutableTypedTextNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  $createUnknownNode,
  $isAttributeRunNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  getEditableCallerText,
  getMarker as bundledGetMarker,
  getPendedDisplayOwners,
  NBSP,
  textTypeState,
} from "shared";

const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/** Read the settled USJ exactly as `Editor.tsx`'s `getUsj()` does. */
function settledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  const serializedState = editorState.toJSON();
  const pendedKeys = getPendedDisplayOwners(editor) ?? new Set<string>();
  return editorState.read(() => $settledUsj(serializedState, pendedKeys, context));
}

/**
 * The UNSETTLED USJ: a plain editor->USJ conversion of the editor's current serialized state,
 * with no settle logic involved at all — what the caller already has cached before ever calling
 * `$settledUsj` (see its `undefined` fast-path return). The reference a refusing scope's settled
 * output must match byte-for-byte, since a refusal contributes "as-is", never a partial patch.
 */
function unsettledUsjOf(editor: LexicalEditor): Usj | undefined {
  const editorState = editor.getEditorState();
  return editorState.read(() =>
    deserializeSerializedEditorState(editorState.toJSON(), viewOptions),
  );
}

/** The `marker` of the USJ content entry at `index`, or undefined when it is not a marker object. */
function markerAt(usj: Usj | undefined, index: number): string | undefined {
  const entry = usj?.content[index];
  if (!entry || typeof entry === "string") return undefined;
  return (entry as MarkerObject).marker;
}

describe("$settledUsj — paragraph scopes", () => {
  it("returns undefined when nothing is pending, so the caller keeps its cached USJ", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });
    expect(settledUsjOf(editor)).toBeUndefined();
  });

  it("settles an abandoned in-place marker rename in the OUTPUT without mutating the editor", async () => {
    const { editor } = await testEnvironment(() => {
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(`${NBSP}body`)),
      );
    });

    // Rename the `\p` glyph to `\q1` in place and leave it pending (no caret departure).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        $pendGlyphEdit(glyph, "\\q1");
      });
      await Promise.resolve();
    });

    expect(markerAt(settledUsjOf(editor), 0)).toBe("q1");

    // The editor is untouched: the paragraph is still `\p` with the pending literal on screen.
    editor.getEditorState().read(() => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      expect(para.getMarker()).toBe("p");
      expect(para.getTextContent()).toContain("\\q1");
    });
  });

  it("keeps a preserved node's own USJ in place where its U+FFFC placeholder stood", async () => {
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}before `),
        $createUnknownNode("optbreak", "optbreak"),
        $createTextNode(" after"),
      );
      $getRoot().append(para);
    });

    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        $pendGlyphEdit(glyph, "\\q1");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    expect(markerAt(settled, 0)).toBe("q1");
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const optbreakIndex = (para as MarkerObject).content?.findIndex(
      (entry) => typeof entry !== "string" && entry.type === "optbreak",
    );
    // The sentinel serialized IN PLACE: between the two text runs, not moved to an end.
    expect(optbreakIndex).toBe(1);
  });

  it("emits ONE milestone for a byte-damaged milestone glyph, never the preserved node AND its re-tokenized twin", async () => {
    // A milestone's display run is its ONLY USFM representation, and the run rides in an
    // `AttributeRunNode` wrapper occupying one sibling slot. While the user's typed byte is
    // pending in the opening glyph the glyph is no longer canonical, so a run scan keyed on
    // canonicality reports "no run" — and a milestone with no run degrades to a preserved
    // sentinel. Its wrapper's bytes then flow into the fragment separately, as ordinary text, so
    // the tokenizer builds a SECOND milestone out of them while the sentinel restores the first:
    // one milestone on screen, two in the settled output a consumer saves.
    const { editor } = await testEnvironment(() => {
      const milestone = $createMilestoneNode("qt-s");
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(`${NBSP}before `),
          milestone,
          $createTextNode(" after"),
        ),
      );
      $appendMilestoneRun(milestone, "");
    });

    await act(async () => {
      editor.update(() => {
        const wrapper = $getRoot()
          .getChildren()
          .filter($isParaNode)[0]
          ?.getChildren()
          .find($isAttributeRunNode);
        const opening = wrapper?.getFirstChild();
        if (!$isMarkerNode(opening)) throw new Error("expected the milestone's opening glyph");
        $pendGlyphEdit(opening, "\\qt-s|");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const content = (para as MarkerObject).content ?? [];
    expect(
      content.filter((entry) => typeof entry !== "string" && entry.type === "ms"),
    ).toHaveLength(1);
    // …and the glyph bytes never survive as literal text beside it.
    expect(content.filter((entry) => typeof entry === "string").join("")).not.toContain("\\qt-s");
  });

  it("refuses a guard-railed scope AS-IS while an unrelated pended scope still settles (per-scope refusal, not whole-document)", async () => {
    const { editor } = await testEnvironment(() => {
      const refusingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}refuses`),
      );
      // `$buildParaFragment`'s guard rail refuses any paragraph carrying unknownAttributes,
      // regardless of what is pending inside it — set directly on the live node, since
      // unrecognized USFM attributes have no display representation of their own to type.
      refusingPara.setUnknownAttributes({ custom: "x" });
      const settlingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}settles`),
      );
      $getRoot().append(refusingPara, settlingPara);
    });

    // Rename BOTH paragraphs' glyphs in place and leave both pending — so both scopes land in
    // the engine's live pended-owner set, proving the refusal below is a per-scope decision made
    // inside `$settledParaNodes`, not a short-circuit that abandons the whole document.
    await act(async () => {
      editor.update(() => {
        const [firstPara, secondPara] = $getRoot().getChildren().filter($isParaNode);
        const firstGlyph = firstPara?.getFirstChild();
        const secondGlyph = secondPara?.getFirstChild();
        if (!$isMarkerNode(firstGlyph) || !$isMarkerNode(secondGlyph))
          throw new Error("expected MarkerNode prefix glyphs on both paragraphs");
        $pendGlyphEdit(firstGlyph, "\\q1");
        $pendGlyphEdit(secondGlyph, "\\q2");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The unrelated scope genuinely re-tokenized.
    expect(markerAt(settled, 1)).toBe("q2");
    // The refusing scope did NOT re-tokenize: still `\p`, not `\q1`.
    expect(markerAt(settled, 0)).toBe("p");

    // Byte-identical to the unsettled serialization for the refusing paragraph specifically —
    // the "refusal contributes the UNSETTLED serialization, never an error, never a partial
    // patch" invariant, verified structurally rather than just by the marker check above.
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });

  it("does not resurrect an emptied optbreak husk when its own paragraph ALSO settles for an unrelated pend (co-settling husk regression)", async () => {
    const { editor } = await testEnvironment(() => {
      // The husk's own token child, matching what usj-editor.adaptor.ts's `createUnknown` builds
      // for a live `\\optbreak` — an ImmutableTypedTextNode, not a plain TextNode (see
      // displayRunRegistry.ts's `optbreakDescriptor.ownerOf` on why both shapes must be
      // recognized).
      const optbreakToken = $createImmutableTypedTextNode("marker", "//");
      const optbreak = $createUnknownNode("optbreak", "optbreak").append(optbreakToken);
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(`${NBSP}before `),
          optbreak,
          $createTextNode(" after"),
        ),
      );
    });

    // Two INDEPENDENT pends in the SAME paragraph, in the SAME update: the husk's own token
    // deleted (pends the UnknownNode via $pendOwnersOfDestroyed, displayRunOwner.utils.ts's
    // $ownerOfRunPiece), and a bare rename on the paragraph's own prefix glyph (Tier 1's
    // unconditional "stays pending" shape). The rename routes this paragraph through
    // $settledParaNodes, which rebuilds it from the LIVE tree — where the husk is STILL physically
    // attached, since this settle never mutates the editor.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!$isMarkerNode(glyph)) throw new Error("expected a MarkerNode prefix glyph");
        $pendGlyphEdit(glyph, "\\q1");

        const liveOptbreak = para.getChildren().find($isUnknownNode);
        if (!liveOptbreak) throw new Error("expected an UnknownNode");
        liveOptbreak.getChildren().forEach((child) => child.remove());
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    // The unrelated rename genuinely re-tokenized.
    expect((para as MarkerObject).marker).toBe("q1");
    // The husk did NOT come back: no optbreak entry anywhere in the co-settled paragraph, even
    // though the paragraph rebuild's OWN fragment (built from the still-attached live husk)
    // sentinel-izes it and would otherwise splice its preserved JSON right back in.
    expect(
      (para as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "optbreak",
      ),
    ).toBe(false);
  });

  it("does not falsely refuse (and silently revert) a bare char-span rename that comes AFTER a note sentinel in the same paragraph (structural-marker-walk truncation)", async () => {
    const { editor } = await testEnvironment(() => {
      // A collapsed note is sufficient as a PRESERVED SENTINEL here — $isRebuildSentinel treats
      // ANY NoteNode as opaque regardless of collapsed state, and this note is never itself
      // edited — it exists purely to sit BETWEEN two plain-text runs, so the rebuilt fragment's
      // JSON collapses "text1 " + sentinel + " text2 " into ONE merged text node (pre-
      // replaceSerializedSentinels), shrinking the JSON side relative to the live side.
      const note = $createNoteNode("f", "+");
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(`${NBSP}text1 `),
          note,
          $createTextNode(" text2 "),
          boldChar,
        ),
      );
    });

    // A single, bare (no trailing space) rename on the char span AFTER the note — Tier 1's
    // unconditional "stays pending" shape, needing no live caret. Live paragraph children:
    // [glyph, "text1 ", NoteNode, " text2 ", CharNode] — 5 items; the freshly rebuilt JSON
    // (pre-sentinel-replacement) has only 4 — [glyph, trailing-space, MERGED-text, CharNode].
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const boldChar = para.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        $pendGlyphEdit(boldGlyph, "\\it");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    // The rename genuinely settled: a "char" entry with marker "it" exists in the output. Before
    // the fix, a raw-positional, Math.min-bounded walk paired the live NoteNode against the
    // json CharNode (both arrays shifted out of alignment by the merge) and never reached the
    // live CharNode at all — both halves of isFixedPoint passed, and the rename was silently
    // reverted in the settled output (the char entry stayed "bd").
    expect(
      (para as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "it",
      ),
    ).toBe(true);

    // The editor itself stays untouched (read-only settle).
    editor.getEditorState().read(() => {
      const liveChar = $getRoot().getChildren().find($isParaNode)?.getChildren().find($isCharNode);
      if (!liveChar) throw new Error("expected a char span");
      expect(liveChar.getMarker()).toBe("bd");
    });
  });

  it("still refuses a genuine fixed point when an unrelated, un-edited co-resident note carries its own nested char span (opacity gate for $liveStructuralMarkers)", async () => {
    const { editor } = await testEnvironment(() => {
      // An unrelated, NEVER-EDITED note sitting between two plain-text runs — its OWN nested
      // "bd" char span must NOT be visible to the live structural-marker walk, mirroring how
      // $appendSignature's own dispatch collapses the WHOLE note to one opaque sentinel
      // character before ever reaching a branch that would recurse into it.
      const note = $createNoteNode("f", "+");
      const noteBoldChar = $createCharNode("bd");
      noteBoldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append(noteBoldChar);

      // A CLOSED char span with PLAIN content (no pre-existing attribute) — the genuine Tier-2
      // fixed point shape (matching settledGetUsj.test.tsx's "half-typed attribute run appended
      // to a char span" corpus entry): `nd` has no default attribute, so typing an incomplete
      // `|stuf` onto it degrades to literal content, byte-for-byte the SAME thing $rebuildParas's
      // own fixed-point check would already produce — a genuine no-op that must NOT be spliced
      // over. The content child carries its OWN structural leading NBSP up front (matching what
      // `createChar`, usj-editor.adaptor.ts, actually builds for a real "name" char span) — the
      // edit below appends onto it rather than overwriting the whole node, so this separator
      // survives untouched, exactly like a real char span's own structural NBSP would (as opposed
      // to a literal typed space landing in that position, which is a DIFFERENT, non-fixed-point
      // shape — see settledGetUsj.test.tsx's own "half-typed attribute run appended" corpus entry
      // and $charOwnChildSignatureText's doc comment, tier2Rebuild.utils.ts).
      const ndChar = $createCharNode("nd");
      ndChar.append(
        $createMarkerNode("nd"),
        $createTextNode(`${NBSP}name`),
        $createMarkerNode("nd", "closing"),
      );

      // The paragraph's own dedicated trailing-space separator, as its own node (matching
      // markerEditLoop.test.tsx's `$twoParas` convention) — not glued onto "text1 " itself: with
      // no separate separator node, a live transform inserts one anyway (self-healing), and an
      // un-tagged leading NBSP glued onto plain content is read differently than the canonical
      // separator by the fragment/signature machinery, which would fail this test for reasons
      // unrelated to the opacity gate under test.
      const pTrailing = $createTextNode(NBSP);
      $setState(pTrailing, textTypeState, "marker-trailing-space");

      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          pTrailing,
          $createTextNode("text1 "),
          note,
          $createTextNode(" text2 "),
          ndChar,
        ),
      );
    });

    // Half-type over the char span's plain content — the ONLY pend in this update. The
    // unrelated note (and its own nested "bd" char span) is never touched. Appends onto the
    // existing text (leaving its own leading structural NBSP untouched), not a wholesale
    // overwrite — see the fixture's own doc comment for why that distinction matters here.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const ndChar = para.getChildren().find($isCharNode);
        if (!ndChar) throw new Error("expected the nd char span");
        const content = ndChar
          .getChildren()
          .find((child) => $isTextNode(child) && !$isMarkerNode(child));
        if (!content || !$isTextNode(content))
          throw new Error("expected the char span's content text");
        content.setTextContent(`${content.getTextContent()}|stuf`);
      });
      await Promise.resolve();
    });

    // The genuine fixed point is REFUSED: the settled output is byte-identical to the unsettled
    // serialization for this paragraph — not dropped by a spuriously "not a fixed point" verdict
    // caused by the unrelated note's own nested marker leaking into the live sequence (before the
    // opacity gate: live sequence ["p","bd","nd"] vs. JSON sequence ["p","nd"] — a length
    // mismatch that made a genuine fixed point look like a structural change).
    const settled = settledUsjOf(editor);
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });
});

describe("$settledUsj — expanded note scopes", () => {
  it("settles a typed marker literal inside expanded note content", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      // The caller must be the exact bytes `$buildNoteFragment` expects
      // (`getEditableCallerText`, not the bare caller symbol) or its caller-slot check refuses the
      // whole note. It also needs a NodeState distinct from the plain body TextNode that follows —
      // otherwise Lexical's own adjacent-simple-TextNode merge (unrelated to this engine) coalesces
      // the two into one node on mount, and the merged text no longer matches the caller check
      // either. `"note-caller-boundary"` carries no meaning to any transform (unlike the recognized
      // `"attribute"`/`"marker-trailing-space"` tags), so it blocks the merge without side effects.
      const callerNode = $createTextNode(getEditableCallerText("+"));
      $setState(callerNode, textTypeState, "note-caller-boundary");
      note.append(
        $createMarkerNode("f"),
        callerNode,
        $createTextNode("note body"),
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });

    // Type a complete char-span literal into the note content and leave it pending. A caret
    // anchored right after the just-typed "\nd" (before its terminating space) is required: with no
    // caret in the node, the engine's own termination check tests the WHOLE text, and a complete
    // `\nd body\nd*` span always matches it somewhere — settling for real instead of staying
    // pending, defeating the point of this test.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const body = note
          .getChildren()
          .find(
            (child) =>
              $isTextNode(child) && !$isMarkerNode(child) && child.getTextContent() === "note body",
          );
        if (!body || !$isTextNode(body)) throw new Error("expected note body text");
        body.setTextContent("note \\nd body\\nd*");
        body.select(8, 8);
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The literal became a real char span in the OUTPUT; the note node, marker and caller survive.
    expect((note as MarkerObject).marker).toBe("f");
    expect((note as MarkerObject).caller).toBe("+");
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "nd",
      ),
    ).toBe(true);

    // The editor still holds the literal.
    editor.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("\\nd body\\nd*");
    });
  });

  it("refuses a collapsed note AS-IS while an unrelated pended scope still settles (per-scope refusal, not whole-document)", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      // `$createNoteNode`'s default `isCollapsed` is `true` — a collapsed note is exactly the
      // shape `$buildNoteFragment` refuses ("only inline-expanded notes are re-tokenizable"),
      // so `setIsCollapsed(false)` is deliberately NOT called here.
      const note = $createNoteNode("f", "+");
      const callerNode = $createTextNode(getEditableCallerText("+"));
      // An implicitly-closed char span (no closing MarkerNode child, matching the
      // `closed="false"` footnote-content convention elsewhere in this test suite) — its own
      // opening glyph gets renamed below, mirroring the settling note test, except this time the
      // enclosing note stays collapsed, so the rename must never reach the tokenizer.
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append($createMarkerNode("f"), callerNode, boldChar, $createMarkerNode("f", "closing"));
      const refusingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        note,
      );
      const settlingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}settles`),
      );
      $getRoot().append(refusingPara, settlingPara);
    });

    // Rename the char span's opening glyph inside the collapsed note, and the unrelated
    // paragraph's own opening glyph, in the SAME update — both bare (no trailing space), which
    // Tier 1 unconditionally pends without ever needing a live caret/selection. Both scopes land
    // in the engine's live pended-owner set, proving the refusal below is a per-scope decision
    // made inside `$settledNoteContent`, not a short-circuit that abandons the whole document.
    await act(async () => {
      editor.update(() => {
        const [refusingPara, settlingPara] = $getRoot().getChildren().filter($isParaNode);
        const note = refusingPara?.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        $pendGlyphEdit(boldGlyph, "\\it");

        const settlingGlyph = settlingPara?.getFirstChild();
        if (!$isMarkerNode(settlingGlyph)) throw new Error("expected settlingPara's prefix glyph");
        $pendGlyphEdit(settlingGlyph, "\\q2");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The unrelated scope genuinely re-tokenized.
    expect(markerAt(settled, 1)).toBe("q2");

    // The collapsed note's paragraph did NOT re-tokenize: byte-identical to the unsettled
    // serialization — the "refusal contributes the UNSETTLED serialization, never an error,
    // never a partial patch" invariant, mirroring the paragraph-scope refusal test above.
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });

  it("settles an independently pending paragraph edit and an independently pending note edit in one call, with the note's already-settled content riding through the paragraph's settled result", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      const callerNode = $createTextNode(getEditableCallerText("+"));
      // Implicitly closed (no closing MarkerNode child), same shape as the refusal test above —
      // sidesteps any question of a mismatched opener/closer pair while the rename below is
      // still pending (the closer, if there were one, would not get renamed until the pend
      // actually resolves).
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append($createMarkerNode("f"), callerNode, boldChar, $createMarkerNode("f", "closing"));
      $getRoot().append(
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), note),
      );
    });

    // Two INDEPENDENT bare (no trailing space) marker renames in the SAME update: the
    // paragraph's own opening glyph, and the opening glyph of a char span living inside the
    // paragraph's expanded note. Neither needs a live caret — both are Tier 1's unconditional
    // "bare opener rename, stays pending until Enter/blur/departure" shape — so neither risks the
    // caret-departure listener's queued resolve pass settling the OTHER one for real before this
    // test ever reads `$settledUsj` (a live caret anchored on just one of them would leave the
    // other exposed to that departure sweep).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const paraGlyph = para.getFirstChild();
        if (!$isMarkerNode(paraGlyph)) throw new Error("expected a ParaNode prefix glyph");
        $pendGlyphEdit(paraGlyph, "\\q1");

        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        $pendGlyphEdit(boldGlyph, "\\it");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The paragraph genuinely re-tokenized.
    expect(markerAt(settled, 0)).toBe("q1");

    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The note's content ALSO genuinely re-tokenized, and rides through INSIDE the paragraph's
    // own settled result — the mechanism the notes-first ordering in `$settledUsj` exists for:
    // by the time the paragraph pass substitutes the note's serialized subtree in place of its
    // sentinel placeholder, the notes pass has already rewritten that subtree to this settled
    // shape.
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "it",
      ),
    ).toBe(true);

    // Both edits are unmutated in the live editor.
    editor.getEditorState().read(() => {
      const livePara = $getRoot().getChildren().find($isParaNode);
      if (!livePara) throw new Error("expected a ParaNode");
      expect(livePara.getMarker()).toBe("p");
      const liveNote = livePara.getChildren().find($isNoteNode);
      if (!liveNote) throw new Error("expected a NoteNode");
      const liveChar = liveNote.getChildren().find($isCharNode);
      if (!liveChar) throw new Error("expected a char span inside the note");
      expect(liveChar.getMarker()).toBe("bd");
    });
  });

  it("does not resurrect an emptied optbreak husk living INSIDE a note's content when that note ALSO settles for an unrelated pend (note-interior co-settling husk regression)", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      const callerNode = $createTextNode(getEditableCallerText("+"));
      $setState(callerNode, textTypeState, "note-caller-boundary");
      const optbreakToken = $createImmutableTypedTextNode("marker", "//");
      const optbreak = $createUnknownNode("optbreak", "optbreak").append(optbreakToken);
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append(
        $createMarkerNode("f"),
        callerNode,
        optbreak,
        boldChar,
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });

    // Two INDEPENDENT pends INSIDE THE SAME NOTE, in the SAME update: the husk's own token
    // deleted, and a bare rename on an unrelated char span's opening glyph living in the same
    // note's content — the shape that routes the note through $settledNoteContent, which
    // rebuilds it from the LIVE tree, where the husk is STILL physically attached.
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");

        const liveOptbreak = note.getChildren().find($isUnknownNode);
        if (!liveOptbreak) throw new Error("expected an UnknownNode inside the note");
        liveOptbreak.getChildren().forEach((child) => child.remove());

        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        $pendGlyphEdit(boldGlyph, "\\it");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The unrelated rename genuinely re-tokenized inside the note's own settled content.
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "it",
      ),
    ).toBe(true);
    // The husk did NOT come back: no optbreak entry anywhere in the note's co-settled content.
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "optbreak",
      ),
    ).toBe(false);
  });

  it("does not falsely refuse (and silently revert) a bare char-span rename that comes AFTER a sentinel INSIDE a note's own content (note-content variant of the structural-marker-walk truncation)", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      const callerNode = $createTextNode(getEditableCallerText("+"));
      $setState(callerNode, textTypeState, "note-caller-boundary");
      // An UnknownNode is a preserved sentinel regardless of whether it is emptied or not — this
      // one is left fully intact (its own token child untouched, never itself edited) purely to
      // sit BETWEEN two plain-text runs, reproducing the SAME "merged JSON text node" shrink the
      // paragraph-scope variant above exercises, this time inside a note's own content.
      const optbreakToken = $createImmutableTypedTextNode("marker", "//");
      const optbreak = $createUnknownNode("optbreak", "optbreak").append(optbreakToken);
      const boldChar = $createCharNode("bd");
      boldChar.append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold text`));
      note.append(
        $createMarkerNode("f"),
        callerNode,
        $createTextNode("text1 "),
        optbreak,
        $createTextNode(" text2 "),
        boldChar,
        $createMarkerNode("f", "closing"),
      );
      $getRoot().append($createParaNode("p").append($createMarkerNode("p"), note));
    });

    // A single, bare rename on the char span AFTER the sentinel — the ONLY pend in this update,
    // routing the note through $settledNoteContent alone (no co-settling husk this time).
    await act(async () => {
      editor.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const note = para.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const boldChar = note.getChildren().find($isCharNode);
        if (!boldChar) throw new Error("expected a char span inside the note");
        const boldGlyph = boldChar.getFirstChild();
        if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
        $pendGlyphEdit(boldGlyph, "\\it");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    const para = settled?.content[0];
    if (!para || typeof para === "string") throw new Error("expected a para marker object");
    const note = (para as MarkerObject).content?.find(
      (entry) => typeof entry !== "string" && entry.type === "note",
    );
    if (!note || typeof note === "string") throw new Error("expected a note marker object");
    // The rename genuinely settled inside the note's own content — not silently reverted by a
    // truncated structural-marker walk that never reached the char span.
    expect(
      (note as MarkerObject).content?.some(
        (entry) => typeof entry !== "string" && entry.type === "char" && entry.marker === "it",
      ),
    ).toBe(true);
  });

  it("refuses a half-typed attribute run appended to a char span INSIDE an expanded note AS-IS (genuine Tier-2 fixed point, not a partial drop of the user's own bytes)", async () => {
    const { editor } = await testEnvironmentExpanded(() => {
      const note = $createNoteNode("f", "+");
      note.setIsCollapsed(false);
      const callerNode = $createTextNode(getEditableCallerText("+"));
      $setState(callerNode, textTypeState, "note-caller-boundary");
      // A CLOSED char span with PLAIN content (no pre-existing attribute) — the exact shape
      // settledGetUsj.test.tsx's "half-typed attribute run appended to a char span" corpus entry
      // uses at the paragraph level, reproduced here inside note content: `nd` has no default
      // attribute, so typing an incomplete `|stuf` onto it degrades to literal content,
      // byte-for-byte the SAME thing $rebuildNoteContent's own fixed-point check would already
      // produce — a genuine no-op, not a settleable edit. The content child carries its OWN
      // structural leading NBSP up front (matching what `createChar`, usj-editor.adaptor.ts,
      // actually builds for a real "name" char span) — the edit below appends onto it rather than
      // overwriting the whole node, so this separator survives untouched, exactly like a real char
      // span's own structural NBSP would (as opposed to a literal typed space landing in that
      // position, which is a DIFFERENT, non-fixed-point shape — see settledGetUsj.test.tsx's own
      // "half-typed attribute run appended" corpus entry and $charOwnChildSignatureText's doc
      // comment, tier2Rebuild.utils.ts).
      const ndChar = $createCharNode("nd");
      ndChar.append(
        $createMarkerNode("nd"),
        $createTextNode(`${NBSP}name`),
        $createMarkerNode("nd", "closing"),
      );
      note.append($createMarkerNode("f"), callerNode, ndChar, $createMarkerNode("f", "closing"));
      const refusingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        note,
      );
      const settlingPara = $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(`${NBSP}settles`),
      );
      $getRoot().append(refusingPara, settlingPara);
    });

    // Half-type over the char span's plain content, and rename an UNRELATED paragraph's own
    // opening glyph, in the SAME update — both bare/pending, proving the refusal below is a
    // per-scope decision made inside `$settledNoteContent`, not a short-circuit that abandons the
    // whole document (mirroring the collapsed-note refusal test above). Appends onto the existing
    // text (leaving its own leading structural NBSP untouched), not a wholesale overwrite — see
    // the fixture's own doc comment for why that distinction matters here.
    await act(async () => {
      editor.update(() => {
        const [refusingPara, settlingPara] = $getRoot().getChildren().filter($isParaNode);
        const note = refusingPara?.getChildren().find($isNoteNode);
        if (!note) throw new Error("expected a NoteNode");
        const ndChar = note.getChildren().find($isCharNode);
        if (!ndChar) throw new Error("expected a char span inside the note");
        const content = ndChar
          .getChildren()
          .find((child) => $isTextNode(child) && !$isMarkerNode(child));
        if (!content || !$isTextNode(content))
          throw new Error("expected the char span's content text");
        content.setTextContent(`${content.getTextContent()}|stuf`);

        const settlingGlyph = settlingPara?.getFirstChild();
        if (!$isMarkerNode(settlingGlyph)) throw new Error("expected settlingPara's prefix glyph");
        $pendGlyphEdit(settlingGlyph, "\\q2");
      });
      await Promise.resolve();
    });

    const settled = settledUsjOf(editor);
    // The unrelated scope genuinely re-tokenized.
    expect(markerAt(settled, 1)).toBe("q2");

    // The note's char-span edit did NOT re-tokenize: byte-identical to the unsettled
    // serialization for the refusing paragraph — a genuine Tier-2 fixed point
    // ($rebuildNoteContent would also refuse this).
    const unsettled = unsettledUsjOf(editor);
    expect(settled?.content[0]).toEqual(unsettled?.content[0]);
  });
});
