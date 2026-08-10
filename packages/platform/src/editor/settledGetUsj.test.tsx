/**
 * `getUsj()` is settled, uniformly and without side effects. Uniform means there is no caret-held
 * exception: a half-typed attribute run settles to the literal content those bytes mean, even while
 * the caret sits inside it. Without side effects means the editor still shows the pending edit
 * afterwards — reading the document must never settle it under the user.
 */
import {
  expectTier2FixedPoint,
  mountExpandedNoteEditor,
  mountStandardViewEditor,
  spanUsj,
} from "./settledGetUsj.test-helpers";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $getState, $isTextNode, TextNode } from "lexical";
import {
  $isAttributeRunNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  CharNode,
  getPendedDisplayOwners,
  NoteNode,
  textTypeState,
} from "shared";

/** The `\nd` span's USJ entry in a doc shaped like `spanUsj`, or undefined when it is gone. */
function ndSpanOf(usj: Usj | undefined): MarkerObject | undefined {
  const para = usj?.content[2];
  if (!para || typeof para === "string") return undefined;
  const span = (para as MarkerObject).content?.find(
    (entry) => typeof entry !== "string" && entry.type === "char",
  );
  return span && typeof span !== "string" ? span : undefined;
}

/** The `\nd` span's own CONTENT text node — NOT its opening/closing glyphs, which are `MarkerNode`
 * (a `TextNode` subclass) and would otherwise be the first match `getAllTextNodes()` yields, since
 * they precede the content node in tree order. */
function $findSpanContentText(): TextNode {
  const node = $getRoot()
    .getAllTextNodes()
    .find(
      (candidate) =>
        $isTextNode(candidate) && !$isMarkerNode(candidate) && $isCharNode(candidate.getParent()),
    );
  if (!node || !$isTextNode(node)) throw new Error("span content text not found");
  return node;
}

/** The `\nd` span itself, found via its own content text node's parent. */
function $findNdChar(): CharNode {
  const parent = $findSpanContentText().getParent();
  if (!parent || !$isCharNode(parent)) throw new Error("nd char span not found");
  return parent;
}

/** `char`'s own attribute display run — the TextNode tagged textType "attribute" that
 * `$syncCharAttributeDisplay` (attributeDisplay.utils.ts) builds automatically once the span
 * carries real `unknownAttributes` and has a closing glyph. */
function $findAttributeRun(char: CharNode): TextNode {
  const run = char
    .getChildren()
    .find(
      (child): child is TextNode =>
        $isTextNode(child) && $getState(child, textTypeState) === "attribute",
    );
  if (!run) throw new Error("attribute run not found");
  return run;
}

/** The `\p`/renamed paragraph's own `marker` field, read live from the tree — independent of
 * `getUsj()` (the thing under test) and of the DISPLAYED bytes, which stay identical whether the
 * rename is pending or already committed (a pending literal renders the exact bytes a settle would
 * produce); only this structural field actually moves. */
function $livePara1Marker(): string {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("expected a ParaNode");
  return para.getMarker();
}

describe("settled getUsj — uniform settling", () => {
  it("settles a half-typed attribute run to literal content while the caret is still inside it", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    // Give the `\nd` span a real attribute first, so its canonical `|mykey="myval"` display run
    // exists (built automatically by the char-attribute sync). Plain content with no display run
    // at all round-trips identically whether or not the paragraph is re-tokenized — it cannot tell
    // settled output apart from the cached one — so an attribute RUN is the shape this pin needs.
    await act(async () => {
      lexical.update(() => {
        $findNdChar().setUnknownAttributes({ mykey: "myval" });
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Half-type over the attribute run: replace its canonical bytes with an incomplete `|stuf`,
    // and leave the caret inside it — the exact caret shape the MUTATING sync's mid-edit grace
    // (`$isCaretAtAttributeRunBoundary`, attributeDisplay.utils.ts) would recognize and leave
    // alone. The read-only settle grants no such grace.
    await act(async () => {
      lexical.update(() => {
        const run = $findAttributeRun($findNdChar());
        run.setTextContent("|stuf");
        run.select(5, 5);
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    // Settled: `nd` has no default attribute, so PT9 cannot promote the incomplete run to a real
    // attribute — the bytes degrade to literal CONTENT, and the STALE `mykey` attribute the run
    // used to represent is gone along with it (those bytes now mean something else entirely).
    const span = ndSpanOf(ref.current?.getUsj());
    expect(span?.content?.[0]).toContain("|stuf");
    expect(Object.keys(span ?? {}).sort()).toEqual(["content", "marker", "type"]);

    // Still pending on screen: the editor holds the typed bytes and the stale attribute, untouched.
    lexical.getEditorState().read(() => {
      expect($getRoot().getTextContent()).toContain("|stuf");
      expect($findNdChar().getUnknownAttributes()).toEqual({ mykey: "myval" });
    });
  });

  it("leaves the document pending after a read, so a later commit still has work to do", async () => {
    const { ref, lexical } = await mountStandardViewEditor(spanUsj);

    await act(async () => {
      lexical.update(() => {
        const para = $getRoot().getChildren().find($isParaNode);
        if (!para) throw new Error("expected a ParaNode");
        const glyph = para.getFirstChild();
        if (!glyph || !$isTextNode(glyph)) throw new Error("expected a prefix glyph");
        glyph.setTextContent("\\q1");
      });
      await Promise.resolve();
    });

    const before = ref.current?.getUsj();
    const beforeMarker = lexical.getEditorState().read($livePara1Marker);
    // Still pending: the internal marker field hasn't moved, even though the DISPLAYED bytes
    // already read "\q1" (that display IS the pending literal).
    expect(beforeMarker).toBe("p");
    // Reading twice must be idempotent AND side-effect free.
    expect(ref.current?.getUsj()).toEqual(before);
    expect(lexical.getEditorState().read($livePara1Marker)).toBe(beforeMarker);

    act(() => ref.current?.commitPendingMarkerEdits());
    // The commit is what actually changes the DOCUMENT: the marker field moves for real.
    expect(lexical.getEditorState().read($livePara1Marker)).not.toBe(beforeMarker);
  });
});

/** One pending-edit shape: how to create it, from a document the harness loads. */
interface PendingShape {
  readonly name: string;
  readonly usj: Usj;
  readonly $edit: () => void;
  /**
   * Mount with `noteMode: "expanded"` instead of the default Standard-view collapsed notes.
   * Needed for any shape whose pend targets a note's own glyph or its inline content — a
   * collapsed note's content is a caller preview, never inline-editable.
   */
  readonly expandedNotes?: boolean;
}

const twoParaUsj = (first: MarkerObject["content"]): Usj => ({
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    { type: "para", marker: "p", content: first },
    { type: "para", marker: "p", content: ["depart here"] },
  ],
});

/** A two-paragraph doc whose first paragraph carries an expanded, closed note (marker "f",
 * caller "+") wrapping `noteContent` — the fixture the note-glyph-rename shapes below share. */
const noteUsj = (noteContent: MarkerObject["content"]): Usj => ({
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        "before ",
        { type: "note", marker: "f", caller: "+", content: noteContent },
        " after",
      ],
    },
    { type: "para", marker: "p", content: ["depart here"] },
  ],
});

/** The first paragraph's text node whose content includes `needle`. */
function $textContaining(needle: string) {
  const node = $getRoot()
    .getAllTextNodes()
    .find((text) => text.getTextContent().includes(needle));
  if (!node) throw new Error(`no text node containing ${JSON.stringify(needle)}`);
  return node;
}

/** The single note in the first paragraph. */
function $findNote(): NoteNode {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("expected a ParaNode");
  const note = para.getChildren().find($isNoteNode);
  if (!note) throw new Error("expected a NoteNode");
  return note;
}

/** The note's own opening glyph — its first child, per `usj-editor.adaptor.ts`'s `createNote`. */
function $findNoteOpeningGlyph() {
  const glyph = $findNote().getFirstChild();
  if (!glyph || !$isTextNode(glyph)) throw new Error("expected the note's opening glyph");
  return glyph;
}

const pendingShapes: PendingShape[] = [
  {
    name: "para marker renamed in place",
    usj: twoParaUsj(["body text"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const glyph = para.getFirstChild();
      if (!glyph || !$isTextNode(glyph)) throw new Error("expected a prefix glyph");
      glyph.setTextContent("\\q1");
    },
  },
  {
    name: "half-typed attribute run appended to a char span",
    usj: twoParaUsj(["start ", { type: "char", marker: "nd", content: ["name"] }, " end"]),
    $edit: () => $textContaining("name").setTextContent(" name|stuf"),
  },
  {
    name: "settled attribute run deleted from a char span",
    usj: twoParaUsj([
      "start ",
      { type: "char", marker: "nd", content: ["name"], stuff: "thing" } as MarkerObject,
      " end",
    ]),
    $edit: () => $textContaining('|stuff="thing"').remove(),
  },
  {
    name: "marker literal typed mid-paragraph",
    usj: twoParaUsj(["plain body"]),
    $edit: () => {
      // A collapsed caret must be anchored in THIS node before typing, or
      // `$textNodeTier2Transform`'s whole-text termination check sees the already-complete
      // `\nd body\nd*` span and re-tokenizes it inline, in this same commit, before the edit ever
      // has a chance to sit pending — the same caret-anchoring requirement Task 5's report
      // documents for a terminated literal.
      const text = $textContaining("plain body");
      text.setTextContent("plain \\nd body\\nd* tail");
      text.select(0, 0);
    },
  },
  {
    name: "verse alt-number run deleted",
    usj: twoParaUsj([{ type: "verse", marker: "v", number: "1", altnumber: "2" }, "verse body"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const verse = para.getChildren().find($isVerseNode);
      if (!verse) throw new Error("expected a VerseNode");
      const wrapper = para.getChildren().find($isAttributeRunNode);
      if (!wrapper) throw new Error("expected an AttributeRunNode");
      wrapper.remove();
      // Caret at the run's insertion point (the verse's own end) — the exact shape
      // `$isCaretAtVerseAttributeSite` (attributeDisplay.utils.ts) recognizes as "held" for a run
      // deleted in its ENTIRETY. Without it, the self-healing sync ($syncVerseAttributeRun, driven
      // by MarkerEditPlugin's AttributeRunNode transform re-firing on the wrapper's own removal)
      // resurrects the run from the verse's still-set altnumber in the SAME commit, before the
      // deletion ever has a chance to sit pending — confirmed empirically: without this caret
      // placement the live text still reads "\va 2\va*" immediately after this edit.
      verse.select(verse.getTextContentSize(), verse.getTextContentSize());
    },
  },
  {
    name: "optbreak display text deleted",
    usj: twoParaUsj(["before ", { type: "optbreak" }, " after"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const optbreak = para.getChildren().find($isUnknownNode);
      if (!optbreak) throw new Error("expected an UnknownNode");
      optbreak.getChildren().forEach((child) => child.remove());
    },
  },
  {
    // The gap this shape pins: a NOTE's own opening-glyph rename is applied by the real settle
    // through `$applyOpenerRename`'s `$isNoteNode(parent)` branch (markerEditTier1.utils.ts), but
    // `$settledNoteContent` (virtualSettle.utils.ts) only ever rebuilds a note's CONTENT — the
    // note's own glyphs sit outside that fragment — so before the fix the virtual half leaves the
    // note's `marker` field stale while the real half moves it.
    name: "note's own opening glyph renamed to a valid marker",
    usj: noteUsj(["note body"]),
    expandedNotes: true,
    $edit: () => $findNoteOpeningGlyph().setTextContent("\\fe"),
  },
  {
    // Edge pin: an INVALID target marker routes `$applyOpenerRename` to Tier 2
    // (`$requestTier2ForNode` -> `$rebuildNoteContent`), which only ever rebuilds CONTENT and — with
    // no content edited here — refuses as a fixed point, leaving the note's `marker` untouched. Both
    // halves must agree on that "untouched" outcome, not just on the valid-target rename above.
    name: "note's own opening glyph renamed to an invalid marker",
    usj: noteUsj(["note body"]),
    expandedNotes: true,
    $edit: () => $findNoteOpeningGlyph().setTextContent("\\qq"),
  },
  {
    // Edge pin: the note's own glyph rename co-resident with an unrelated, independently pending
    // content edit in the SAME note (a bare char-span rename) — both must settle, proving the
    // glyph-rename patch and the note's own content rebuild compose rather than clobber each other.
    // The char span is UNCLOSED (`closed: "false"`, no closing glyph created — usj-editor.adaptor's
    // `createChar`): a CLOSED span's own closer stays literal ("\bd*") while only the opener is
    // pended, and re-tokenizing that mismatched opener/closer pair is a genuine, unrelated
    // tokenizer divergence (an "unmatched" entry) neither settle path is being pinned on here.
    name: "note's own opening glyph rename co-resident with a content pend in the same note",
    usj: noteUsj([
      { type: "char", marker: "bd", content: ["bold text"], closed: "false" } as MarkerObject,
    ]),
    expandedNotes: true,
    $edit: () => {
      $findNoteOpeningGlyph().setTextContent("\\fe");
      const boldChar = $findNote().getChildren().find($isCharNode);
      if (!boldChar) throw new Error("expected a char span inside the note");
      const boldGlyph = boldChar.getFirstChild();
      if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
      boldGlyph.setTextContent("\\it");
    },
  },
];

describe("settled getUsj — virtual settle equals the real settle", () => {
  it.each(pendingShapes)("$name", async ({ usj, $edit, expandedNotes }) => {
    const { ref, lexical } = await (
      expandedNotes ? mountExpandedNoteEditor : mountStandardViewEditor
    )(usj);

    // The virtual settle is read INSIDE this same `act()`, right after the edit — not after it
    // returns. A shape whose pend depends on a live caret residency (e.g. a syntactically COMPLETE
    // typed literal) only stays pending up to this act() call's own commit; RTL's `act()` performs
    // an additional effect flush on return that can itself count as the caret "moving on" (the
    // selection is gone by the time control returns to the test body), materializing the edit for
    // real via the ordinary caret-departure machinery before this test ever gets another chance to
    // call `getUsj()` — reading the virtual settle any later would just read the already-
    // materialized real output back at itself, proving nothing about `$settledUsj` at all.
    let virtualUsj: Usj | undefined;
    await act(async () => {
      lexical.update($edit);
      await Promise.resolve();
      await Promise.resolve();

      // Confirm the edit genuinely landed pending before reading the virtual settle — a shape
      // whose edit already resolved inline (nothing left pending) would make `getUsj()` take its
      // `pendedKeys.size === 0` fast path and never reach `$settledUsj` at all, silently proving
      // nothing.
      const pendingAfterEdit = getPendedDisplayOwners(lexical);
      expect(pendingAfterEdit?.size).toBeGreaterThan(0);

      virtualUsj = ref.current?.getUsj();
    });

    // Depart: park the caret in the SECOND paragraph, then blur, so the real settle below has no
    // caret-held grace arm to take and both halves are settling the same thing.
    await act(async () => {
      lexical.update(() => {
        $textContaining("depart here").select(0, 0);
      });
      await Promise.resolve();
    });
    const root = lexical.getRootElement();
    if (!root) throw new Error("editor root not found");
    act(() => root.blur());

    // Backstop for the abandonment window (COMMIT_PENDING_MARKERS_COMMAND's own doc comment):
    // belt-and-suspenders with the depart step above, which already resolves everything for most
    // shapes on its own.
    act(() => ref.current?.commitPendingMarkerEdits());
    const realUsj = ref.current?.getUsj();

    // Closes the last vacuity hole: if `ref.current` were ever null (a stale ref after some
    // future refactor), BOTH sides above would silently be `undefined` and `toEqual` would pass
    // trivially, proving nothing about the equivalence this suite exists to pin.
    expect(virtualUsj).toBeDefined();
    expect(virtualUsj).toEqual(realUsj);
  });
});

describe("settled getUsj — output is always a Tier-2 fixed point", () => {
  it.each(pendingShapes)("$name", async ({ usj, $edit, expandedNotes }) => {
    const { ref, lexical } = await (
      expandedNotes ? mountExpandedNoteEditor : mountStandardViewEditor
    )(usj);
    await act(async () => {
      lexical.update($edit);
      await Promise.resolve();
      await Promise.resolve();
    });

    const settled = ref.current?.getUsj();
    if (!settled) throw new Error("expected settled USJ");
    expectTier2FixedPoint(settled, expandedNotes);
  });
});
