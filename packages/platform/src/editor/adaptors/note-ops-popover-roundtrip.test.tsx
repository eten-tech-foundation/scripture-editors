/**
 * Note-serialization contract: in editable marker mode, note contents ops carry
 * CONTENT only (canonical, glyph-free — same shape as non-editable modes), and
 * `$applyUpdate` re-materializes the exact well-formed note shape the USJ adaptor builds.
 *
 * This drives the REAL FootnoteEditor popover flow end-to-end: a host `Editorial` in
 * Standard view (markerMode "editable", noteMode "collapsed") sources a note op via
 * `getNoteOps`, a popover `Editorial` (same options + noteMode "expanded", exactly as the
 * FootnoteEditor memo produces them) receives it via `applyUpdate`, and the popover Save
 * path writes it back into the host via `replaceEmbedUpdate`. The acceptance property is
 * IDEMPOTENCE: ops→apply→ops is a fixed point, the serialized USJ deep-equals the source,
 * and a subsequent `$rebuildNoteContent` neither refuses (sentinel mismatch) nor changes
 * anything (fixed point).
 */
import { $rebuildNoteContent, Tier2Context } from "../markerEdit/tier2Rebuild.utils";
import Editorial from "../../Editorial";
import { EditorOptions, EditorRef } from "../editor.model";
import { MarkerContent, MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { deepEqual } from "fast-equals";
import { createRef } from "react";
import { $getRoot, $isElementNode, $isTextNode, LexicalEditor, LexicalNode } from "lexical";
import { $dfs } from "@lexical/utils";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { getEmbeddedLexicalEditor } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  $isCharNode,
  $isImmutableUnmatchedNode,
  $isMarkerNode,
  $isNoteNode,
  getMarker as bundledGetMarker,
  LoggerBasic,
  NoteNode,
} from "shared";
import { DeltaOp, getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

function requireDefined<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

const hostView = requireDefined(getViewOptions(STANDARD_VIEW_MODE), "standard view options");

const hostOptions: EditorOptions = {
  hasSpellCheck: false,
  markerMenuTrigger: "\\",
  view: hostView,
  hasExternalUI: true,
};

// Options exactly as FootnoteEditor's memo produces them (spread + noteMode override).
const popoverOptions: EditorOptions = {
  ...hostOptions,
  contextMenu: undefined,
  view: { ...hostView, noteMode: "expanded" },
};

/** The popover's default document (FootnoteEditor's `PARAGRAPH_USJ`). */
const PARAGRAPH_USJ: Usj = { type: "USJ", version: "3.1", content: [{ type: "para" }] };

/**
 * Closed note with \fr/\ft spans and a \fv verse-ref char. The \fv is a SIBLING char (the
 * engine-canonical shape): valid footnote char markers render no closer glyph in editable
 * mode, so a USJ-nested \fv is not representable in display text and the Tier-2 tokenizer
 * would flatten it — for a USJ-loaded note just as much as for an ops-materialized one.
 * (The nested-char ops round-trip itself is covered by the editor-delta.adaptor unit
 * tests.)
 */
const closedNoteUsj: MarkerObject = {
  type: "note",
  marker: "f",
  caller: "+",
  // Footnote-content chars carry closed="false" in real ParatextData USJ (no explicit closers).
  content: [
    { type: "char", marker: "fr", content: ["1:1 "], closed: "false" },
    { type: "char", marker: "ft", content: ["see verse "], closed: "false" },
    { type: "char", marker: "fv", content: ["2"], closed: "false" },
  ],
};

/** Unterminated note (PT9 opennote): renders expanded inline, has no closer glyph. */
const unclosedNoteUsj: MarkerObject & { closed?: string } = {
  type: "note",
  marker: "f",
  caller: "+",
  closed: "false",
  content: [
    { type: "char", marker: "fr", content: ["1:2 "], closed: "false" },
    { type: "char", marker: "ft", content: ["unterminated"], closed: "false" },
  ],
};

const sampleUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Test Book"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "first ",
        closedNoteUsj,
        "verse text ",
        unclosedNoteUsj,
        "tail",
      ],
    },
  ],
};

const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };

function makeLogger() {
  const messages: string[] = [];
  const log = (msg: unknown) => {
    messages.push(String(msg));
  };
  const logger: LoggerBasic = { debug: log, info: log, warn: log, error: log };
  return { messages, logger };
}

async function renderEditor(options: EditorOptions, defaultUsj: Usj) {
  const ref = createRef<EditorRef>();
  let container: HTMLElement | undefined;
  await act(async () => {
    const result = render(
      <Editorial
        ref={ref}
        defaultUsj={defaultUsj}
        scrRef={scrRef}
        onScrRefChange={() => undefined}
        options={options}
      />,
    );
    container = result.container;
  });
  const editorRef = requireDefined(ref.current, "editor ref");
  // This suite runs end-to-end through the public <Editorial> wrapper, which strips `children`, so
  // the cleaner EditorRefPlugin-child handle isn't reachable — read the editor off the mounted DOM.
  const lexical = getEmbeddedLexicalEditor(container);
  return { editorRef, lexical };
}

function $findNotes(): NoteNode[] {
  return $dfs($getRoot())
    .map(({ node }) => node)
    .filter($isNoteNode);
}

/** All descendants of the note (excluding the note itself). */
function noteDescendants(note: NoteNode): LexicalNode[] {
  const out: LexicalNode[] = [];
  const collect = (node: LexicalNode) => {
    if ($isElementNode(node))
      for (const child of node.getChildren()) {
        out.push(child);
        collect(child);
      }
  };
  collect(note);
  return out;
}

/** Assert the note is the well-formed editable shape: one glyph per span, no unmatched nodes. */
function expectWellFormedEditableNote(lexical: LexicalEditor, noteIndex: number) {
  lexical.getEditorState().read(() => {
    const note = requireDefined($findNotes()[noteIndex], `note ${noteIndex} not found`);
    const descendants = noteDescendants(note);
    // No ImmutableUnmatchedNode materialized from a stray closing-glyph text op.
    expect(descendants.filter($isImmutableUnmatchedNode)).toEqual([]);
    // Each char span carries exactly ONE opening MarkerNode glyph (no doubling).
    descendants.filter($isCharNode).forEach((char) => {
      const glyphs = char
        .getChildren()
        .filter($isMarkerNode)
        .filter((glyph) => glyph.getMarkerSyntax() === "opening");
      expect(glyphs).toHaveLength(1);
      expect(glyphs[0].getMarker()).toBe(char.getMarker());
    });
    // The note's own opening glyph is single too.
    const directGlyphs = note
      .getChildren()
      .filter((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "opening");
    expect(directGlyphs).toHaveLength(1);
  });
}

/** Replace the `noteIndex`-th note object (document order) in the USJ with `newNote`. */
function replaceUsjNote(usj: Usj, noteIndex: number, newNote: MarkerObject): boolean {
  let seen = 0;
  const walk = (content: MarkerContent[] | undefined): boolean => {
    if (!content) return false;
    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      if (typeof item === "string") continue;
      if (item.type === "note") {
        if (seen === noteIndex) {
          content[i] = newNote;
          return true;
        }
        seen += 1;
      }
      if (walk(item.content)) return true;
    }
    return false;
  };
  return walk(usj.content);
}

/** Find the note MarkerObject in USJ content, in document order. */
function findUsjNotes(usj: Usj): MarkerObject[] {
  const notes: MarkerObject[] = [];
  const walk = (content: MarkerContent[] | undefined) => {
    for (const item of content ?? []) {
      if (typeof item === "string") continue;
      if (item.type === "note") notes.push(item);
      walk(item.content);
    }
  };
  walk(usj.content);
  return notes;
}

async function roundtripNote(noteIndex: number, sourceNoteUsj: MarkerObject) {
  const host = await renderEditor(hostOptions, sampleUsj);

  // Guard: the host USJ adaptors round-trip the source note losslessly on their own.
  const hostUsj = requireDefined(host.editorRef.getUsj(), "host USJ");
  expect(findUsjNotes(hostUsj)[noteIndex]).toEqual(sourceNoteUsj);

  const hostNoteOps = requireDefined(
    host.editorRef.getNoteOps(noteIndex),
    "host note ops",
  ) as DeltaOp[];
  expect(hostNoteOps).toHaveLength(1);

  // Popover leg: applyUpdate materializes the note (the FootnoteEditor load path).
  const popover = await renderEditor(popoverOptions, PARAGRAPH_USJ);
  await act(async () => {
    popover.editorRef.applyUpdate([hostNoteOps[0]]);
  });

  expectWellFormedEditableNote(popover.lexical, 0);

  // Idempotence at the op level: popover ops deep-equal the host ops.
  const popoverNoteOps = requireDefined(popover.editorRef.getNoteOps(0), "popover note ops");
  expect(popoverNoteOps).toEqual(hostNoteOps);

  // Idempotence at the USJ level: the popover's serialized note deep-equals the source.
  const popoverUsj = requireDefined(popover.editorRef.getUsj(), "popover USJ");
  expect(findUsjNotes(popoverUsj)[0]).toEqual(sourceNoteUsj);

  return { host, popover, hostNoteOps, popoverNoteOps };
}

/** `$rebuildNoteContent` on the popover note must be a no-op fixed point (not a refusal). */
async function expectRebuildFixedPoint(popover: { lexical: LexicalEditor }) {
  const { messages, logger } = makeLogger();
  const context: Tier2Context = {
    viewOptions: requireDefined(popoverOptions.view, "popover view options"),
    getMarker: bundledGetMarker,
    logger,
  };
  await act(async () => {
    popover.lexical.update(() => {
      const note = requireDefined($findNotes()[0], "popover note");
      expect($rebuildNoteContent(note, context)).toBe(false);
    });
  });
  expect(messages.some((m) => m.includes("no-op (fixed point)"))).toBe(true);
  expect(messages.some((m) => m.includes("sentinel/preserved-node count mismatch"))).toBe(false);
  expect(messages.some((m) => m.includes("excluded by guard rails"))).toBe(false);
}

describe("popover note ops round-trip (canonical glyph-free contract)", () => {
  it("is idempotent for a standard-view note with \\fr/\\ft spans and a \\fv verse-ref char", async () => {
    const { popover } = await roundtripNote(0, closedNoteUsj);
    await expectRebuildFixedPoint(popover);
  }, 30000);

  it('is idempotent for an unclosed note (closed="false")', async () => {
    const { popover } = await roundtripNote(1, unclosedNoteUsj);

    // An unterminated note has no closer glyph in the popover either.
    popover.lexical.getEditorState().read(() => {
      const note = requireDefined($findNotes()[0], "popover note");
      expect(
        note
          .getChildren()
          .some((child) => $isMarkerNode(child) && child.getMarkerSyntax() === "closing"),
      ).toBe(false);
    });
    await expectRebuildFixedPoint(popover);
  }, 30000);

  it("writes a clean note back into the host via replaceEmbedUpdate (popover Save path)", async () => {
    const { host, popover } = await roundtripNote(0, closedNoteUsj);

    // Mutate the popover note BEFORE saving (mirrors the in-app QA: type into the \ft span),
    // so the assertion below can only be satisfied by a write that actually happened — an
    // unmodified save would leave the host indistinguishable from its pre-save state.
    const sentinel = "task14-review-sentinel";
    await act(async () => {
      popover.lexical.update(() => {
        const note = requireDefined($findNotes()[0], "popover note");
        const ftChar = note
          .getChildren()
          .filter($isCharNode)
          .find((char) => char.getMarker() === "ft");
        const contentText = requireDefined(ftChar, "popover ft char")
          .getChildren()
          .filter($isTextNode)
          .find((child) => !$isMarkerNode(child));
        requireDefined(contentText, "popover ft content text").setTextContent(
          `${requireDefined(contentText, "popover ft content text").getTextContent()}${sentinel}`,
        );
      });
    });
    const popoverNoteOps = requireDefined(popover.editorRef.getNoteOps(0), "popover note ops");
    expect(JSON.stringify(popoverNoteOps)).toContain(sentinel);

    const hostNoteKey = host.lexical.getEditorState().read(() => {
      return requireDefined($findNotes()[0], "host note").getKey();
    });
    const preSaveNoteCount = host.lexical.getEditorState().read(() => $findNotes().length);
    const preSaveUsj = requireDefined(host.editorRef.getUsj(), "host USJ before save");
    await act(async () => {
      host.editorRef.replaceEmbedUpdate(hostNoteKey, popoverNoteOps);
    });

    // Contract-owned invariants: the sentinel-carrying note WAS written into the host, its
    // USJ deep-equals the popover's serialized note, and every note in the host document is
    // CLEAN — no doubled glyphs, no unmatched nodes.
    const popoverUsj = requireDefined(popover.editorRef.getUsj(), "popover USJ after edit");
    const popoverNoteUsj = requireDefined(findUsjNotes(popoverUsj)[0], "popover note USJ");
    expect(JSON.stringify(popoverNoteUsj)).toContain(sentinel);

    const hostUsj = requireDefined(host.editorRef.getUsj(), "host USJ after save");
    const hostNotes = findUsjNotes(hostUsj);
    const writtenNote = hostNotes.find((note) => JSON.stringify(note).includes(sentinel));
    expect(writtenNote).toBeDefined();
    expect(deepEqual(writtenNote, popoverNoteUsj)).toBe(true);

    const noteCount = host.lexical.getEditorState().read(() => $findNotes().length);
    for (let i = 0; i < noteCount; i++) expectWellFormedEditableNote(host.lexical, i);

    // Replace POSITION: `$getReplaceEmbedOps` computes its retain in "apply"
    // coordinates — the coordinate system `$applyUpdate`'s insert/delete traversals use,
    // where an editable chapter is an opaque embed (1 unit, glyph text child not counted).
    // The replacement therefore lands exactly where the old note was:
    // - the note count is unchanged (old note deleted, new note inserted — not appended);
    expect(noteCount).toBe(preSaveNoteCount);
    // - the sentinel note sits AT the original note's position (note index 0);
    expect(JSON.stringify(hostNotes[0])).toContain(sentinel);
    // - and the whole document deep-equals the pre-save document with ONLY note 0 swapped
    //   for the popover's note — no character eaten from adjacent text, nothing displaced.
    const expectedUsj = JSON.parse(JSON.stringify(preSaveUsj)) as Usj;
    expect(replaceUsjNote(expectedUsj, 0, popoverNoteUsj)).toBe(true);
    expect(hostUsj).toEqual(expectedUsj);
  }, 30000);
});
