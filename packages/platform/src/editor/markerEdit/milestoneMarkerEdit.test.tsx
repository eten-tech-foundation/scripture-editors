/**
 * Three reported Standard-view milestone-editing defects, pinned end to end through the public
 * `Editor` so both settle legs are exercised the way a host actually sees them:
 *
 * 1. **A milestone MARKER rename must reach the file.** Editing the opening glyph's name
 *    (`\qt-s` → `\qt1-s`) changes displayed bytes, so by Invariant I it changes the document.
 *    Both legs must agree: the editor→USJ path (`deserializeSerializedEditorState`) and the
 *    read-only save path (`getUsj()` / `$settledUsj`).
 * 2. **A named attribute keeps whatever spelling the document round-trips to.** `\qt-s`'s default
 *    attribute is `who`, so `|who="stuff"` and `|stuff` are the SAME USJ — see the suite header
 *    below for what that does and does not license.
 * 3. **A departure settle must not move a caret the user just placed.** Pressing Down puts the
 *    caret somewhere deliberate; the settle that fires afterwards must leave it there.
 *
 * All three are asserted against the TOKENIZER over the displayed bytes
 * (`usfmFragmentToUsjContent`), the mandated authority — never against hand-written USJ that could
 * drift from what the bytes actually mean.
 */

import { initialize as initializeDeserialize } from "../adaptors/editor-usj.adaptor";
import { deserializeSerializedEditorState } from "../adaptors/editor-usj.adaptor";
import { mountStandardViewEditor, requireStandardViewOptions } from "../settledGetUsj.test-helpers";
import { requireDefined } from "./markerEdit.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $dfs } from "@lexical/utils";
import { $getRoot, $getSelection, $isRangeSelection, LexicalEditor, TextNode } from "lexical";
import { $isMarkerNode, $isMilestoneNode, NBSP, usfmFragmentToUsjContent } from "shared";

const viewOptions = requireStandardViewOptions();

/** A two-paragraph doc whose first paragraph carries the milestone `content` describes. */
function milestoneUsj(milestone: MarkerObject): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      { type: "chapter", marker: "c", number: "1" },
      { type: "para", marker: "p", content: ["before ", milestone, " after"] },
      { type: "para", marker: "p", content: ["depart here"] },
    ],
  };
}

/** The editor's USJ through the editor→USJ adaptor (the tree leg). */
function treeUsj(lexical: LexicalEditor): Usj | undefined {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(lexical.getEditorState().toJSON(), viewOptions);
}

/**
 * A milestone's own attribute keys. `who`/`sid` are ordinary keys of the USJ marker object but are
 * not part of the published `MarkerObject` shape, so they are typed locally — the same pattern
 * `usfmFragmentToUsj.ts` uses for `closed` and `colspan`.
 */
type MilestoneMarkerObject = MarkerObject & { who?: string; sid?: string };

/** The single `ms` marker object anywhere in `usj`, or undefined. */
function msOf(usj: Usj | undefined): MilestoneMarkerObject | undefined {
  const found: MarkerObject[] = [];
  const walk = (content: MarkerObject["content"]): void => {
    content?.forEach((entry) => {
      if (typeof entry === "string") return;
      if (entry.type === "ms") found.push(entry);
      walk(entry.content);
    });
  };
  walk(usj?.content);
  return found.length === 1 ? found[0] : undefined;
}

/**
 * The milestone's opening glyph — the `MarkerNode` the user types a marker name into. Matched by
 * MARKER NAME, not by syntax: a paragraph's own `\p` prefix is an "opening" `MarkerNode` too and
 * comes first in tree order, so a syntax-only search silently renames the paragraph instead.
 */
function $milestoneOpeningGlyph(marker: string): TextNode {
  const glyph = $getRoot()
    .getAllTextNodes()
    .find((node) => $isMarkerNode(node) && node.getMarker() === marker);
  return requireDefined(glyph, `milestone opening glyph \\${marker} not found`);
}

/** The milestone's attribute display run (the `|…` text between the glyphs). */
function $attributeRunText(): TextNode {
  const run = $getRoot()
    .getAllTextNodes()
    .find((node) => !$isMarkerNode(node) && node.getTextContent().startsWith(NBSP + "|"));
  return requireDefined(run, "milestone attribute run not found");
}

/** Depart the caret to the second paragraph and let the settle run, then force any residue. */
async function departAndSettle(
  lexical: LexicalEditor,
  ref: { current: { commitPendingMarkerEdits?: () => void } | null },
): Promise<void> {
  await act(async () => {
    lexical.update(() => {
      const target = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent().includes("depart here"));
      requireDefined(target, "departure target not found").select(0, 0);
    });
    await Promise.resolve();
    await Promise.resolve();
  });
  act(() => ref.current?.commitPendingMarkerEdits?.());
}

describe("a milestone MARKER rename reaches the file", () => {
  // The glyph is a display byte the user can place a caret in, so editing it edits the document
  // (Invariant I). The rename must survive into node state — the save leg reads the milestone's
  // OWN `marker` field (`createMilestoneMarker`, editor-usj.adaptor.ts), never the glyph bytes —
  // and both settle legs must produce the same answer (Invariant IV).
  it("renaming the opening glyph reaches BOTH settle legs identically", async () => {
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
    );

    await act(async () => {
      lexical.update(() => {
        const glyph = $milestoneOpeningGlyph("qt-s");
        glyph.setTextContent("\\qt1-s");
        glyph.select(6, 6);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await departAndSettle(lexical, ref);

    // The tokenizer over the displayed bytes is the authority for what those bytes MEAN.
    const oracle = msOf({
      type: "USJ",
      version: "3.1",
      content: usfmFragmentToUsjContent('\\p \\qt1-s |sid="q1"\\*', {}),
    } as Usj);
    expect(oracle?.marker).toBe("qt1-s");

    // Leg 1: the tree (editor→USJ).
    expect(msOf(treeUsj(lexical))?.marker).toBe("qt1-s");
    // Leg 2: the read-only save path.
    expect(msOf(ref.current?.getUsj())?.marker).toBe("qt1-s");
    // And the two legs agree on the whole milestone, not just its name.
    expect(msOf(treeUsj(lexical))).toEqual(msOf(ref.current?.getUsj()));
  });

  it("the renamed milestone's node state carries the new marker, not just its glyph", async () => {
    // The behavioral pin above would also pass if the glyph bytes leaked into USJ some other way.
    // This one names the actual mechanism: the MilestoneNode's own field must move, because that
    // field is what the save leg serializes.
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
    );

    await act(async () => {
      lexical.update(() => {
        const glyph = $milestoneOpeningGlyph("qt-s");
        glyph.setTextContent("\\qt1-s");
        glyph.select(6, 6);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await departAndSettle(lexical, ref);

    lexical.getEditorState().read(() => {
      const milestone = requireDefined(
        $dfs()
          .map(({ node }) => node)
          .find($isMilestoneNode),
        "milestone not found",
      );
      expect(milestone.getMarker()).toBe("qt1-s");
    });
  });
});

describe("a milestone's default attribute spelling", () => {
  // `milestoneDefaultAttribute("qt-s")` is `who`, and the markers map agrees
  // (paranext-core `markers-map-3.0.model.ts`, `'qt-s': { defaultAttribute: 'who' }`). USFM's
  // parse rule is that a NAMED attribute is read by its name and an UNNAMED value takes the
  // default name — which means `|who="stuff"` and `|stuff` are two spellings of ONE document.
  // This pin records that equivalence at the tokenizer, so the display fold's choice of spelling
  // is measured against what the bytes mean rather than against a guess.
  it('the tokenizer reads |who="stuff" and |stuff as the SAME milestone', () => {
    const named = usfmFragmentToUsjContent('\\qt-s |who="stuff"\\*', {});
    const bare = usfmFragmentToUsjContent("\\qt-s |stuff\\*", {});
    expect(msOf({ type: "USJ", version: "3.1", content: named } as Usj)).toEqual({
      type: "ms",
      marker: "qt-s",
      who: "stuff",
    });
    expect(JSON.stringify(bare)).toBe(JSON.stringify(named));
  });

  it('typing |who="stuff" settles to who="stuff" and re-spells the run as |stuff', async () => {
    // Two assertions with very different standing.
    //
    // The DOCUMENT half is a correctness pin: whatever the run displays, the milestone must carry
    // the attribute under its proper name, and the typed bytes must win over the loaded `sid`.
    //
    // The DISPLAY half RECORDS today's behavior — the surprise TJ reported ("it changes into the
    // default attribute |stuff") — and it is recorded rather than fixed because it is correct:
    //   * both spellings tokenize to the identical USJ (the pin above), so nothing is lost;
    //   * `qt-s`'s default attribute is `who` in the markers map, so `|stuff` MEANS who="stuff";
    //   * the canonical USJ-to-USFM writer applies the same collapse (paranext-core
    //     `usj-reader-writer.ts`, "Default attribute syntax if it is the only attribute present"),
    //     so the displayed bytes match what the file gets rather than diverging from it.
    // Preserving the typed spelling would need node state that neither USJ nor USX can carry, so
    // it would survive editing and then silently change on the next reload — a worse divergence
    // than the one it fixes. If this pin ever flips, that is a deliberate decision, not a drift.
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
    );

    await act(async () => {
      lexical.update(() => {
        const run = $attributeRunText();
        run.setTextContent(`${NBSP}|who="stuff"`);
        run.select(run.getTextContentSize(), run.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    await departAndSettle(lexical, ref);

    // Document: the typed attribute landed under its own name, and the old `sid` is gone.
    expect(msOf(ref.current?.getUsj())?.who).toBe("stuff");
    expect(msOf(treeUsj(lexical))?.who).toBe("stuff");
    expect(msOf(ref.current?.getUsj())?.sid).toBeUndefined();
    // …and equals what the tokenizer makes of the displayed bytes.
    expect(msOf(ref.current?.getUsj())).toEqual(
      msOf({
        type: "USJ",
        version: "3.1",
        content: usfmFragmentToUsjContent("\\p \\qt-s |stuff\\*", {}),
      } as Usj),
    );

    // Display: the run re-spells to the bare default form. Recorded, not endorsed as ideal UX.
    lexical.getEditorState().read(() => {
      expect($attributeRunText().getTextContent()).toBe(`${NBSP}|stuff`);
    });
  });
});

describe("a departure settle leaves the caret where the user put it", () => {
  // TJ's gesture: edit the attribute run, then press Down to move into a LATER PART OF THE SAME
  // PARAGRAPH. The arrow's caret move commits first; the settle runs afterwards in a deferred
  // microtask. Because the caret is still inside the rebuilt paragraph, the Tier-2 restore treats
  // it as a caret needing re-anchoring and re-derives its position by counting bytes — so a run
  // that SHRANK on settle drags the caret forward. The caret the user placed is the intent; the
  // settle must not overrule it.
  it("does not move a caret that the user placed outside the settled run", async () => {
    const { ref, lexical } = await mountStandardViewEditor(
      milestoneUsj({ type: "ms", marker: "qt-s", sid: "q1" }),
    );

    // Edit the attribute run so the settle genuinely has something to rebuild, and leave the
    // caret inside it (the mid-edit shape).
    await act(async () => {
      lexical.update(() => {
        const run = $attributeRunText();
        run.setTextContent(`${NBSP}|who="stuff"`);
        run.select(run.getTextContentSize(), run.getTextContentSize());
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // "Press Down": move the caret into the trailing text of the SAME paragraph, offset 3 of
    // " after". This is the position the user chose; nothing after this point may move it.
    await act(async () => {
      lexical.update(() => {
        const trailing = requireDefined(
          $getRoot()
            .getAllTextNodes()
            .find((node) => node.getTextContent().includes("after")),
          "trailing text not found",
        );
        trailing.select(3, 3);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Let the deferred departure settle run to completion.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    lexical.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const node = selection.focus.getNode();
      // The caret is still in the trailing text, at the offset the user left it at — NOT dragged
      // forward by the run's re-spelling.
      expect(node.getTextContent()).toContain("after");
      expect(selection.focus.offset).toBe(3);
    });

    // And the run really did settle — otherwise this pin would pass vacuously by never rebuilding.
    expect(msOf(ref.current?.getUsj())?.who).toBe("stuff");
  });
});
