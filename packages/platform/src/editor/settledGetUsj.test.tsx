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
import { $getRoot, $getState, $isTextNode, LexicalNode, TextNode } from "lexical";
import {
  $chapterAltnumberRunPieces,
  $chapterGlyphTextNode,
  $chapterPubnumberRunPieces,
  $isAttributeRunNode,
  $isChapterNode,
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  $isParaNode,
  $isUnknownNode,
  $isVerseNode,
  $noteCategoryRunPieces,
  $noteEditableCallerNode,
  $reportDestroyedDisplayOwner,
  ChapterNode,
  CharNode,
  getPendedDisplayOwners,
  NBSP,
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
 * `$syncDisplayRun` with the char descriptor (displayRunSync.utils.ts) builds automatically once
 * the span carries real `unknownAttributes` and has a closing glyph. */
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
    // (`$caretHoldsRunSite`, displayRunSync.utils.ts) would recognize and leave alone. The
    // read-only settle grants no such grace.
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
        // The caret sits where the user's rename left it — a caret-less glyph byte edit is
        // machine drift and HEALS instead of pending (glyphDriftHeal.test.tsx).
        glyph.select(3, 3);
      });
      await Promise.resolve();
    });
    // Blur so the commit below has no live-caret exception to keep the glyph pending: an
    // abandoned (blurred) edit settles fully, per COMMIT_PENDING_MARKERS_COMMAND's contract. The
    // BLUR sweep itself excepts the caret's own node, so the pend survives the blur.
    const rootElement = lexical.getRootElement();
    if (!rootElement) throw new Error("editor root not found");
    act(() => rootElement.blur());

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

/** A two-paragraph doc whose chapter carries `altnumber="2"` (and `pubnumber` when given) — the
 * `\ca`/`\cp` run shapes' fixture. */
function chapterCaUsj(pubnumber?: string): Usj {
  const chapter: MarkerObject = { type: "chapter", marker: "c", number: "1", altnumber: "2" };
  if (pubnumber !== undefined) chapter.pubnumber = pubnumber;
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
      chapter,
      { type: "para", marker: "p", content: ["body text"] },
      { type: "para", marker: "p", content: ["depart here"] },
    ],
  };
}

/** The single editable ChapterNode in the tree. */
function $findChapterNode(): ChapterNode {
  const chapter = $getRoot().getChildren().find($isChapterNode);
  if (!chapter) throw new Error("expected a ChapterNode");
  return chapter;
}

/** {@link noteUsj} with `category="People"` on the note — the `\cat` run shapes' fixture. */
function categoryNoteUsj(...noteContent: NonNullable<MarkerObject["content"]>): Usj {
  const usj = noteUsj(noteContent.length > 0 ? noteContent : ["note body"]);
  const para = usj.content?.[2] as MarkerObject;
  const note = para.content?.[1] as MarkerObject;
  note.category = "People";
  return usj;
}

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
      // The caret sits where the user's rename keystroke left it. A byte edit with NO caret at
      // the glyph is machine drift, which the engine now HEALS instead of pending
      // (glyphDriftHeal.test.tsx) — a pending user rename requires the user's caret.
      glyph.select(3, 3);
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
      // has a chance to sit pending — any terminated literal needs its caret anchored the same way
      // to stay pending instead of resolving inline.
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
      // Caret at the run's insertion point (the verse's own end) — the exact shape the verse
      // descriptor's `graceSite` (displayRunRegistry.ts, via `$caretHoldsRunSite`,
      // displayRunSync.utils.ts) recognizes as "held" for a run deleted in its ENTIRETY. Without
      // it, the self-healing sync ($syncDisplayRun, driven by MarkerEditPlugin's AttributeRunNode
      // transform re-firing on the wrapper's own removal) resurrects the run from the verse's
      // still-set altnumber in the SAME commit, before the deletion ever has a chance to sit
      // pending — confirmed empirically: without this caret placement the live text still reads
      // "\va 2\va*" immediately after this edit.
      verse.select(verse.getTextContentSize(), verse.getTextContentSize());
    },
  },
  {
    // The wrap-migration-only divergence (displayRunSync.utils.ts's
    // `$runNeedsOnlyWrapMigration`): the run's bytes are already canonical, only its
    // `AttributeRunNode` wrapper is missing. The real settle delivers this by calling the shared
    // sync directly (markerEditTier1.utils.ts's verse arm) rather than re-tokenizing — there are
    // no displayed bytes for a rebuild to read back into state. The virtual settle never
    // represents wrapped-vs-loose at all (USJ has no such concept — both shapes read back to the
    // identical `altnumber`), so both halves must agree on `altnumber: "2"` regardless of which
    // one actually performs a wrap.
    name: "verse va run left loose (wrap-migration-only divergence)",
    usj: twoParaUsj([{ type: "verse", marker: "v", number: "1", altnumber: "2" }, "verse body"]),
    $edit: () => {
      const para = $getRoot().getChildren().find($isParaNode);
      if (!para) throw new Error("expected a ParaNode");
      const verse = para.getChildren().find($isVerseNode);
      if (!verse) throw new Error("expected a VerseNode");
      const wrapper = para.getChildren().find($isAttributeRunNode);
      if (!wrapper) throw new Error("expected an AttributeRunNode");
      // Unwrap the \va run back to loose siblings (mimics an undo-restored pre-flip state) —
      // byte-exact, only the wrapper is gone.
      let anchor: LexicalNode = verse;
      const pieces = wrapper.getChildren();
      for (const piece of pieces) {
        anchor.insertAfter(piece);
        anchor = piece;
      }
      wrapper.remove();
      const value = pieces[1]; // opener, value, closer — the value rides in the middle
      if (!$isTextNode(value)) throw new Error("expected the \\va value TextNode");
      // Caret parked on the loose (but byte-exact) value: mid-edit grace blocks this commit's own
      // healing attempt, and — the migration-pend behavior — also pends the verse.
      value.select(value.getTextContentSize(), value.getTextContentSize());
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
    $edit: () => {
      // Caret at the rename site — a caret-less byte edit is machine drift and heals
      // (glyphDriftHeal.test.tsx).
      const glyph = $findNoteOpeningGlyph();
      glyph.setTextContent("\\fe");
      glyph.select(3, 3);
    },
  },
  {
    // Both halves must fold the edited `\ca` value back onto the chapter's `altnumber` — the
    // chapter settle scope's virtual mirror ($settledChapter) against the real $rebuildChapter.
    name: "chapter alternate-number run value edited",
    usj: chapterCaUsj(),
    $edit: () => {
      const value = $chapterAltnumberRunPieces($findChapterNode()).value;
      if (!value) throw new Error("expected the \\ca value TextNode");
      value.setTextContent(`${NBSP}9`);
      value.select(value.getTextContentSize(), value.getTextContentSize());
    },
  },
  {
    // Deleting the whole `\ca` run clears `altnumber` in both halves — no resurrection.
    name: "chapter alternate-number run deleted",
    usj: chapterCaUsj(),
    $edit: () => {
      const chapter = $findChapterNode();
      const pieces = $chapterAltnumberRunPieces(chapter);
      if (!pieces.wrapper) throw new Error("expected the \\ca wrapper");
      pieces.wrapper.remove();
      const glyph = $chapterGlyphTextNode(chapter);
      if (!glyph) throw new Error("expected the chapter glyph text");
      glyph.select(glyph.getTextContentSize(), glyph.getTextContentSize());
    },
  },
  {
    // The closer-less `\cp` run: both halves must fold the edited value back onto `pubnumber`.
    name: "chapter published-number run value edited",
    usj: chapterCaUsj("A"),
    $edit: () => {
      const value = $chapterPubnumberRunPieces($findChapterNode()).value;
      if (!value) throw new Error("expected the \\cp value TextNode");
      value.setTextContent(`${NBSP}B`);
      value.select(value.getTextContentSize(), value.getTextContentSize());
    },
  },
  {
    // Deleting the whole `\cp` run clears `pubnumber` in both halves — no resurrection.
    name: "chapter published-number run deleted",
    usj: chapterCaUsj("A"),
    $edit: () => {
      const chapter = $findChapterNode();
      const pieces = $chapterPubnumberRunPieces(chapter);
      if (!pieces.wrapper) throw new Error("expected the \\cp wrapper");
      pieces.wrapper.remove();
      // The realistic collapse point for this deletion: the end of the \ca run's closer glyph,
      // the last text before where the \cp run stood.
      const caCloser = $chapterAltnumberRunPieces(chapter).closer;
      if (!caCloser) throw new Error("expected the \\ca closer glyph");
      caCloser.select(caCloser.getTextContentSize(), caCloser.getTextContentSize());
    },
  },
  {
    // A FIRST-CLASS `char ca` at root directly after its chapter (the transient pre-fold shape) —
    // an edit inside it settles through the CHAPTER scope, and both halves must fold the span
    // back onto the chapter's `altnumber` rather than leaving it beside a stale chapter.
    name: "first-class ca char adjacent to its chapter, value edited",
    usj: {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        { type: "char", marker: "ca", content: ["3"] },
        { type: "para", marker: "p", content: ["body text"] },
        { type: "para", marker: "p", content: ["depart here"] },
      ],
    },
    $edit: () => {
      const char = $getRoot().getChildren().find($isCharNode);
      if (!char) throw new Error("expected the root-level ca char");
      const value = char
        .getChildren()
        .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
      if (!value) throw new Error("expected the char's value text");
      value.setTextContent(`${NBSP}4`);
      value.select(value.getTextContentSize(), value.getTextContentSize());
    },
  },
  {
    // A REAL `\cp` PARAGRAPH directly after its chapter — the shape a `\cp` takes when its fold
    // refused. An edit inside it settles through the CHAPTER scope, so both halves must fold the
    // whole PARAGRAPH away onto `pubnumber`. This is the only shape whose chapter region spans a
    // block, so it is also the one that pins the virtual splice removing more than the chapter's
    // own slot.
    name: "cp paragraph adjacent to its chapter, value edited",
    usj: {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        { type: "para", marker: "cp", content: ["A"] },
        { type: "para", marker: "p", content: ["body text"] },
        { type: "para", marker: "p", content: ["depart here"] },
      ],
    },
    $edit: () => {
      const cpPara = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .find((para) => para.getMarker() === "cp");
      if (!cpPara) throw new Error("expected the cp ParaNode");
      const value = cpPara
        .getChildren()
        .find((child): child is TextNode => $isTextNode(child) && !$isMarkerNode(child));
      if (!value) throw new Error("expected the cp paragraph's value text");
      value.setTextContent(`${NBSP}B`);
      value.select(value.getTextContentSize(), value.getTextContentSize());
    },
  },
  {
    // The typed-literal artifact after a chapter: `$rebuildChapter` strands non-chapter residue
    // as a root-level STRING, which the adaptor wraps in an implied paragraph — no ParaNode, no
    // marker byte. One whose content re-tokenizes to only `\ca`/`\cp` material settles through
    // the CHAPTER scope (the region arm), so both halves must fold the literal onto `altnumber`
    // and splice the implied paragraph's whole slot away — the second region shape (after the
    // `\cp` paragraph) whose virtual splice removes more than the chapter's own slot.
    name: "typed ca literal in a chapter-adjacent implied paragraph",
    usj: {
      type: "USJ",
      version: "3.1",
      content: [
        { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
        { type: "chapter", marker: "c", number: "1" },
        "seed literal",
        { type: "para", marker: "p", content: ["body text"] },
        { type: "para", marker: "p", content: ["depart here"] },
      ],
    },
    $edit: () => {
      // Caret anchored at offset 0 so the termination check sees no just-typed terminator and
      // the literal stays PENDING (the same anchoring note as "marker literal typed
      // mid-paragraph" above).
      const text = $textContaining("seed literal");
      text.setTextContent("\\ca 3 \\ca*");
      text.select(0, 0);
    },
  },
  {
    // Both halves must fold the edited `\cat` value back onto the note's `category` — the run's
    // displayed bytes win, and the serialized note field must follow them in the virtual output
    // exactly as the real settle's `setCategory` does.
    name: "note category run value edited",
    usj: categoryNoteUsj(),
    expandedNotes: true,
    $edit: () => {
      const value = $noteCategoryRunPieces($findNote()).value;
      if (!value) throw new Error("expected the \\cat value TextNode");
      value.setTextContent(`${NBSP}Places`);
      value.select(value.getTextContentSize(), value.getTextContentSize());
    },
  },
  {
    // Deleting the whole run clears `category` in both halves — no resurrection from the note's
    // still-set state on either path. The note's content is a `\ft` char span (the shape real
    // notes have) rather than plain text: with PLAIN text directly after the run, Lexical's
    // adjacent-text normalization merges the note body into the editable caller the moment the
    // wrapper between them is removed, dissolving the caller anchor — the rebuild then refuses
    // (preserve-or-refuse on the caller check) and the deletion sits unresolved.
    name: "note category run deleted",
    usj: categoryNoteUsj({ type: "char", marker: "ft", content: ["note body"], closed: "false" }),
    expandedNotes: true,
    $edit: () => {
      const note = $findNote();
      const pieces = $noteCategoryRunPieces(note);
      if (!pieces.wrapper) throw new Error("expected the \\cat wrapper");
      pieces.wrapper.remove();
      const caller = $noteEditableCallerNode(note);
      if (!caller) throw new Error("expected the editable caller");
      caller.select(caller.getTextContentSize(), caller.getTextContentSize());
    },
  },
  {
    // Edge pin: an INVALID target marker routes `$applyOpenerRename` to Tier 2
    // (`$requestTier2ForNode` -> `$rebuildNoteContent`), which only ever rebuilds CONTENT and — with
    // no content edited here — refuses as a fixed point, leaving the note's `marker` untouched. Both
    // halves must agree on that "untouched" outcome, not just on the valid-target rename above.
    name: "note's own opening glyph renamed to an invalid marker",
    usj: noteUsj(["note body"]),
    expandedNotes: true,
    $edit: () => {
      // Caret at the rename site — a caret-less byte edit is machine drift and heals
      // (glyphDriftHeal.test.tsx).
      const glyph = $findNoteOpeningGlyph();
      glyph.setTextContent("\\qq");
      glyph.select(3, 3);
    },
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
      // TWO glyph literals pending at once is reachable in production only through a HISTORIC
      // restore: live typing settles the first pend the moment the caret departs to make the
      // second, but an undo re-derives every restored literal's pend at once, caret-less, via
      // `$rependPendShapedNodes`'s read-only scan. Seed the ledger the same way here — through
      // `$reportDestroyedDisplayOwner`, the sync's public write channel into the SAME Set — so
      // the engine's heal (which fires on caret-less byte damage that is NOT in the ledger —
      // glyphDriftHeal.test.tsx) recognizes both literals as recorded user edits and leaves
      // them pending, exactly as it does after a real undo.
      const noteGlyph = $findNoteOpeningGlyph();
      noteGlyph.setTextContent("\\fe");
      $reportDestroyedDisplayOwner(noteGlyph);
      const boldChar = $findNote().getChildren().find($isCharNode);
      if (!boldChar) throw new Error("expected a char span inside the note");
      const boldGlyph = boldChar.getFirstChild();
      if (!$isMarkerNode(boldGlyph)) throw new Error("expected the char span's opening glyph");
      boldGlyph.setTextContent("\\it");
      $reportDestroyedDisplayOwner(boldGlyph);
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
