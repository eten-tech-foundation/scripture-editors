// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { removeNoteCallerOnClick } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  CHAPTER_1_INDEX,
  editorStateEmpty,
  editorStateGen1v1,
  editorStateGen1v1Editable,
  editorStateGen1v1ImpliedPara,
  editorStateGen1v1ImpliedParaEmpty,
  editorStateGen1v1Nonstandard,
  editorStateMarks,
  editorStateWithUnknownItems,
  NOTE_CALLER_INDEX,
  NOTE_INDEX,
  NOTE_PARA_INDEX,
  NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX,
  usjGen1v1,
  usjGen1v1ImpliedPara,
  usjGen1v1ImpliedParaEmpty,
  usjGen1v1Nonstandard,
  usjMarks,
  usjWithUnknownItems,
  VERSE_PARA_INDEX,
} from "../../../../utilities/src/converters/usj/converter-test.data";
import { serializeEditorState, reset, initialize } from "./usj-editor.adaptor";
import {
  EMPTY_USJ,
  MarkerObject,
  Usj,
  usxStringToUsj,
} from "@eten-tech-foundation/scripture-utilities";
import {
  $createTextNode,
  $getRoot,
  $getState,
  $isElementNode,
  $isTextNode,
  LexicalNode,
  NODE_STATE_KEY,
  SerializedElementNode,
  SerializedLexicalNode,
  SerializedTextNode,
} from "lexical";
import {
  $createImpliedParaNode,
  $createParaNode,
  $isCharNode,
  $isImmutableTypedTextNode,
  $isMarkerNode,
  $isParaNode,
  CharNode,
  closingMarkerText,
  getEditableCallerText,
  gutterMarkerState,
  isSerializedChapterNode,
  HIDDEN_NOTE_CALLER,
  ImmutableTypedTextNode,
  ImpliedParaNode,
  isSerializedAttributeRunNode,
  isSerializedBookNode,
  isSerializedCharNode,
  isSerializedImmutableChapterNode,
  isSerializedImmutableTableCellNode,
  isSerializedImmutableTableNode,
  isSerializedImmutableTableRowNode,
  isSerializedImmutableTypedTextNode,
  isSerializedMarkerNode,
  isSerializedMilestoneNode,
  isSerializedNoteNode,
  isSerializedParaNode,
  isSerializedTextNode,
  isSerializedUnknownNode,
  MARKER_TRAILING_SPACE_TEXT_TYPE,
  MarkerNode,
  NBSP,
  NoteNode,
  openingMarkerText,
  ParaNode,
  SerializedAttributeRunNode,
  SerializedCharNode,
  SerializedNoteNode,
  SerializedParaNode,
  textTypeState,
} from "shared";
import {
  $applyUpdate,
  $insertNote,
  defaultNoteCallers,
  LF,
  FORMATTED_VIEW_MODE,
  getDefaultViewOptions,
  getViewOptions,
  ImmutableNoteCallerNode,
  isSerializedImmutableNoteCallerNode,
  isSerializedImmutableVerseNode,
  isSomeSerializedVerseNode,
  SerializedImmutableNoteCallerNode,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  usjReactNodes,
  ViewOptions,
} from "shared-react";
import { MockInstance } from "vitest";

/** Whether a serialized glyph carries the gutter-marker flag ({@link gutterMarkerState}). */
function isGutterMarker(node: SerializedLexicalNode): boolean {
  const stateObject: unknown = node[NODE_STATE_KEY];
  return (
    !!stateObject &&
    typeof stateObject === "object" &&
    gutterMarkerState.key in stateObject &&
    stateObject[gutterMarkerState.key] === true
  );
}

describe("USJ Editor Adaptor", () => {
  let consoleWarnSpy: MockInstance;

  beforeEach(() => {
    // Spy on console methods before each test and provide mock implementations
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Restore console methods after each test to their original implementations
    consoleWarnSpy.mockRestore();
  });

  it("should convert from undefined USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(undefined);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from empty USJ to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(EMPTY_USJ);

    expect(serializedEditorState).toEqual(editorStateEmpty);
  });

  it("should convert from USJ to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjGen1v1);

    const note = (serializedEditorState.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    expect(typeof noteCaller.onClick).toBe("function");
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateGen1v1);
  });

  it("should convert from USJ with empty implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedParaEmpty);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedParaEmpty);
  });

  it("should convert from USJ with implied para to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1ImpliedPara);

    expect(serializedEditorState).toEqual(editorStateGen1v1ImpliedPara);
  });

  it("should convert from USJ with nonstandard features to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjGen1v1Nonstandard);

    expect(serializedEditorState).toEqual(editorStateGen1v1Nonstandard);
  });

  it("should convert from USJ to Lexical editor state JSON in visible marker mode", () => {
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleView);

    // Book marker rendered as typed-text marker with code and NBSP
    const book = serializedEditorState.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const bookMarker = book.children?.[0];
    if (!isSerializedImmutableTypedTextNode(bookMarker)) throw new Error("No book marker found");
    expect(bookMarker.textType).toBe("marker");
    expect(bookMarker.text).toBe(`${openingMarkerText("id")} GEN${NBSP}`);

    // Chapter is immutable with showMarker flag
    const chapter = serializedEditorState.root.children[CHAPTER_1_INDEX];
    if (!isSerializedImmutableChapterNode(chapter)) throw new Error("No chapter node found");
    expect(chapter.showMarker).toBe(true);

    // Para 'p' begins with a typed-text marker and NBSP
    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pFirst = pPara.children?.[0];
    if (!isSerializedImmutableTypedTextNode(pFirst)) throw new Error("No para marker found");
    expect(pFirst.textType).toBe("marker");
    expect(pFirst.text).toBe(`${openingMarkerText("p")}${NBSP}`);
    // This glyph renders INLINE among the words, so it is not flagged as a gutter marker: the flag
    // is what makes a marker unclickable, and it belongs only to the glyphs in the gutter.
    expect(isGutterMarker(pFirst)).toBe(false);

    // Verse is immutable with showMarker flag
    const verse2 = pPara.children.find(
      (n: SerializedLexicalNode) => isSerializedImmutableVerseNode(n) && n.number === "2",
    );
    if (!isSerializedImmutableVerseNode(verse2)) throw new Error("Verse 2 not found");
    expect(verse2.showMarker).toBe(true);

    // Note has typed-text markers for open/close and immutable caller
    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX];
    if (!isSerializedParaNode(notePara)) throw new Error("No note para node found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    const noteChildren = note.children;
    const noteOpening = noteChildren[0];
    if (!isSerializedImmutableTypedTextNode(noteOpening)) throw new Error("No note opening marker");
    expect(noteOpening.textType).toBe("marker");
    expect(noteOpening.text).toBe(`${openingMarkerText("f")} `);
    const noteCaller = noteChildren[1];
    expect(isSerializedImmutableNoteCallerNode(noteCaller)).toBe(true);
    // Closing marker at the end with NBSP
    const noteClosing = noteChildren[noteChildren.length - 1];
    if (!isSerializedImmutableTypedTextNode(noteClosing)) throw new Error("No note closing marker");
    expect(noteClosing.textType).toBe("marker");
    expect(noteClosing.text).toBe(`${closingMarkerText("f")}`);

    // Note inner char 'fr' contains a typed marker as first child and text without NBSP
    const frChar = noteChildren.find((n) => isSerializedCharNode(n) && n.marker === "fr");
    if (!isSerializedCharNode(frChar)) throw new Error("No fr char found");
    const frFirst = frChar.children?.[0];
    expect(
      isSerializedImmutableTypedTextNode(frFirst) &&
        frFirst.textType === "marker" &&
        frFirst.text.startsWith(openingMarkerText("fr")),
    ).toBe(true);
    const frText = frChar.children?.find((n) => isSerializedTextNode(n));
    expect(isSerializedTextNode(frText) && frText.text.startsWith(NBSP)).toBe(false);
  });

  it("should add line breaks before verses when visible mode has no spacing", () => {
    const visibleCompact: ViewOptions = {
      markerMode: "visible",
      hasSpacing: false,
      isFormattedFont: false,
    };

    const serializedEditorState = serializeEditorState(usjGen1v1, visibleCompact);

    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pChildren: SerializedLexicalNode[] = pPara.children;
    const idxVerse2 = pChildren.findIndex((n) => isSomeSerializedVerseNode(n) && n.number === "2");
    expect(idxVerse2).toBeGreaterThan(0);
    expect(pChildren[idxVerse2 - 1].type).toBe("linebreak");
  });

  it("should render para markers but not inline char/verse markers in paragraph structure view", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
    );

    // Book \id begins with a typed-text marker (no book code suffix in gutter mode — the gutter
    // only shows the opening marker text, not the per-marker arguments).
    const book = serializedEditorState.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const bookMarker = book.children?.[0];
    if (!isSerializedImmutableTypedTextNode(bookMarker)) throw new Error("No book marker found");
    expect(bookMarker.textType).toBe("marker");
    expect(bookMarker.text).toBe(`${openingMarkerText("id")}${NBSP}`);
    expect(isGutterMarker(bookMarker)).toBe(true);

    // Para 'p' begins with a typed-text marker (rendered for the gutter to consume)
    const pPara = serializedEditorState.root.children[VERSE_PARA_INDEX];
    if (!isSerializedParaNode(pPara)) throw new Error("No para node found");
    const pFirst = pPara.children?.[0];
    if (!isSerializedImmutableTypedTextNode(pFirst)) throw new Error("No para marker found");
    expect(pFirst.textType).toBe("marker");
    expect(pFirst.text).toBe(`${openingMarkerText("p")}${NBSP}`);
    // Flagged as a gutter marker, which is what keeps the caret out of it
    // (ParaMarkerPrefixCursorGuardPlugin, shared-react) — the node cannot be told apart from an
    // inline glyph any other way.
    expect(isGutterMarker(pFirst)).toBe(true);

    // Verse is immutable and does NOT show its inline marker (markerMode is "hidden")
    const verse2 = pPara.children.find(
      (n: SerializedLexicalNode) => isSerializedImmutableVerseNode(n) && n.number === "2",
    );
    if (!isSerializedImmutableVerseNode(verse2)) throw new Error("Verse 2 not found");
    expect(verse2.showMarker).toBeUndefined();

    // Char nodes in notes should not have inline typed-text markers
    const notePara = serializedEditorState.root.children[NOTE_PARA_INDEX];
    if (!isSerializedParaNode(notePara)) throw new Error("No note para node found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    const frChar = note.children.find((n) => isSerializedCharNode(n) && n.marker === "fr");
    if (!isSerializedCharNode(frChar)) throw new Error("No fr char found");
    const hasInlineMarker = frChar.children?.some((n) => isSerializedImmutableTypedTextNode(n));
    expect(hasInlineMarker).toBe(false);
  });

  it("should convert from USJ to Lexical editor state JSON in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    expect(serializedEditorState).toEqual(editorStateGen1v1Editable);
  });

  it("should render editable caller text and markers in editable mode", () => {
    const serializedEditorState = serializeEditorState(
      usjGen1v1,
      getViewOptions(UNFORMATTED_VIEW_MODE),
    );

    const editableNoteParaNode = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(editableNoteParaNode)) throw new Error("Editable para not found");
    const noteNode = editableNoteParaNode.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(noteNode)) throw new Error("Editable note not found");
    const noteChildren = noteNode.children;
    // opening marker node for note
    expect(isSerializedMarkerNode(noteChildren[0])).toBe(true);
    // caller is editable text
    const callerNode = noteChildren[1];
    if (!isSerializedTextNode(callerNode)) throw new Error("Caller text not found");
    // Hard-coded display form (space + caller + NBSP separator) instead of the helper the
    // implementation itself calls, so a drift in that contract fails this test.
    expect(callerNode.text).toBe(` +${NBSP}`);
    // closing marker node for note appears later
    const hasClosingMarker = noteChildren.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(true);
  });

  it("maps NBSP to tilde in standard-view text content", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe("3~000 men");
  });

  it("maps NBSP to tilde in editable+expanded standard view (noteMode expanded)", () => {
    // Standard view with expanded notes is still standard-view text: the editable marker engine
    // runs, so the same NBSP->tilde display mapping MUST run too. Before the gating fix,
    // getViewMode returned undefined for editable+expanded, silently disabling this mapping while
    // the marker engine kept producing NBSP separators -> NBSP/tilde corruption.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const standard = getViewOptions(STANDARD_VIEW_MODE);
    if (!standard) throw new Error("standard view options not found");
    const expandedStandard = { ...standard, noteMode: "expanded" as const };
    const state = serializeEditorState(usj, expandedStandard);

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe("3~000 men");
  });

  it("maps NBSP to tilde in standard-view book id text", () => {
    // Book \id description text must be display-encoded like body text: the reverse adaptor
    // inverts display whitespace on ALL text nodes (book children included), so a stored NBSP
    // left raw here would corrupt to a plain space on save.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id">Ruth A${NBSP}B</book><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />Text</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const book = state.root.children[0];
    if (!isSerializedBookNode(book)) throw new Error("No book node found");
    const text = book.children?.find((child) => isSerializedTextNode(child));
    if (!isSerializedTextNode(text)) throw new Error("No book text found");
    expect(text.text).toBe("Ruth A~B");
  });

  it("displays a paragraph-leading space as NBSP in standard view", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"> Leading space text.</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("Leading"),
    ) as SerializedTextNode;
    expect(text.text).toBe(`${NBSP}Leading space text.`);
  });

  it("keeps a space plain when inline content precedes the first text node in standard view", () => {
    // The leading-space -> NBSP display rule is for paragraph-leading spaces only. Here the
    // first text node follows a char span, so its leading space sits mid-paragraph (after
    // \add*): it is already visible there and an NBSP would wrongly forbid line-wrap at that
    // point.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><char style="add">added text</char> plain.</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("plain"),
    ) as SerializedTextNode;
    expect(text.text).toBe(" plain.");
  });

  it("does not map NBSP in formatted view", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />3${NBSP}000 men</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(FORMATTED_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const text = para.children.find(
      (child) => isSerializedTextNode(child) && child.text.includes("000"),
    ) as SerializedTextNode;
    expect(text.text).toBe(`3${NBSP}000 men`);
  });

  it("renders an atomic note caller with editable markers in standard view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const notePara = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(notePara)) throw new Error("Note para not found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("Note not found");
    // Children: opening MarkerNode, ImmutableNoteCallerNode, NBSP text, content..., closing MarkerNode
    expect(isSerializedMarkerNode(note.children[0])).toBe(true);
    expect(isSerializedImmutableNoteCallerNode(note.children[1])).toBe(true);
    expect(isSerializedMarkerNode(note.children[note.children.length - 1])).toBe(true);
    expect(note.isCollapsed).toBe(true);
  });

  it("renders an unclosed note (closed=false) expanded even in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f" closed="false"><char style="ft">open note</char></note> after</para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(false);
    // expanded editable layout uses editable caller TEXT, not an ImmutableNoteCallerNode
    expect(note.children.some((c) => isSerializedImmutableNoteCallerNode(c))).toBe(false);
    const callerTextNode = note.children[1];
    if (!isSerializedTextNode(callerTextNode)) throw new Error("Caller text not found");
    // Hard-coded display form (space + caller + NBSP separator) instead of the helper the
    // implementation itself calls, so a drift in that contract fails this test.
    expect(callerTextNode.text).toBe(` +${NBSP}`);
    // no synthesized closing marker for an unclosed note
    const hasClosingMarker = note.children.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(false);
    // round-trips the closed flag
    expect(JSON.stringify(note)).toContain(`"closed":"false"`);
  });

  it('renders no closing glyph for an unclosed note (closed="false") in visible marker mode', () => {
    // The editable-mode unclosed-note shape is pinned above; visible mode builds its glyphs as
    // immutable typed text instead of MarkerNodes and must skip the closer the same way.
    const noteUsx = (closedAttribute: string) =>
      usxStringToUsj(
        `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f"${closedAttribute}><char style="ft">note text</char></note> after</para></usx>`,
      );
    /** Marker glyph texts (typed-text "marker" nodes) of a serialized subtree, in order. */
    const glyphTexts = (nodes: SerializedLexicalNode[]): string[] =>
      nodes.flatMap((node) => {
        const own =
          isSerializedImmutableTypedTextNode(node) && node.textType === "marker" ? [node.text] : [];
        const children = (node as Partial<SerializedElementNode>).children;
        return [...own, ...(children ? glyphTexts(children) : [])];
      });
    const noteOf = (state: ReturnType<typeof serializeEditorState>): SerializedNoteNode => {
      const para = state.root.children[2];
      if (!isSerializedParaNode(para)) throw new Error("No para node found");
      const note = para.children.find((child) => isSerializedNoteNode(child));
      if (!isSerializedNoteNode(note)) throw new Error("No note node found");
      return note;
    };
    initialize(undefined, undefined);
    reset();
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };

    // Positive control: the same note WITHOUT closed="false" carries its closing glyph. Closer
    // display keys on each span's OWN closed state, and the inner \ft is explicitly closed in the
    // source USX, so it renders `\ft*` in both shapes — the note's `\f*` is the only glyph that
    // distinguishes them.
    const closedNote = noteOf(serializeEditorState(noteUsx(""), visibleView));
    expect(glyphTexts(closedNote.children)).toEqual(["\\f ", "\\ft", "\\ft*", "\\f*"]);

    reset();
    const unclosedNote = noteOf(serializeEditorState(noteUsx(' closed="false"'), visibleView));
    // Unclosed: the opening glyph keeps its plain-space separator and no NOTE closer is
    // synthesized, while the explicitly-closed inner \ft still carries its own.
    expect(glyphTexts(unclosedNote.children)).toEqual(["\\f ", "\\ft", "\\ft*"]);
    expect(unclosedNote.isCollapsed).toBe(false);
  });

  it('renders no closing glyph for a closed="false" char span in editable mode', () => {
    // ParatextData emits closed="false" on every char span with no explicit closing marker
    // (near universal on footnote-content chars). Such spans must render WITHOUT a closing
    // glyph — mirroring the unclosed-note handling above — and round-trip the flag.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><char style="nd" closed="false">Lord</char></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const char = para.children.find((c) => isSerializedCharNode(c)) as SerializedCharNode;
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "opening"),
    ).toBe(true);
    // no synthesized closing marker for an unclosed span
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(false);
    // round-trips the closed flag
    expect(JSON.stringify(char)).toContain(`"closed":"false"`);
  });

  it("renders a closer (and no derived closed flag) for a footnote char with no closed attribute", () => {
    // Closer display keys on the span's ACTUAL closed state, never on the marker family: a footnote
    // content char (here \fr) that the source USJ did NOT mark closed="false" is an explicitly-closed
    // span, so the adaptor renders its closing glyph and derives no closed flag. Real ParatextData
    // stamps closed="false" on genuinely-unclosed \fr (pinned in the "closed=false" note case below);
    // this pins that the family alone no longer forces closer-less rendering.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><note caller="+" style="f"><char style="fr">1.1 </char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    // Editable mode renders closing glyphs for normal chars, so a present closer is meaningful.
    const state = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    const frChar = note.children.find(
      (c) => isSerializedCharNode(c) && c.marker === "fr",
    ) as SerializedCharNode;
    expect(
      frChar.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "opening"),
    ).toBe(true);
    // a closing glyph IS rendered — the source did not mark the span closed="false"
    expect(
      frChar.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(true);
    // no closed flag is synthesized onto an explicitly-closed span
    expect(frChar.unknownAttributes?.closed).toBeUndefined();
  });

  it('renders no closing glyph for a closed="false" footnote char (in-note, unchanged)', () => {
    // Item-1 pin: an in-note \fr the source marked closed="false" (what real ParatextData emits on
    // genuinely-unclosed footnote/cross-ref content) still renders closer-less — in-note rendering
    // is unchanged by keying the closer on state rather than family.
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" /><note caller="+" style="f"><char style="fr" closed="false">1.1 </char><char style="ft" closed="false">note</char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    const contentChars = note.children.filter(
      (c) => isSerializedCharNode(c) && (c.marker === "fr" || c.marker === "ft"),
    ) as SerializedCharNode[];
    expect(contentChars).toHaveLength(2);
    contentChars.forEach((char) => {
      expect(
        char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
      ).toBe(false);
      expect(char.unknownAttributes?.closed).toBe("false");
    });
  });

  it("still collapses a closed note in collapsed noteMode", () => {
    const usj = usxStringToUsj(
      `<usx version="3.0"><book code="RUT" style="id" /><chapter number="1" style="c" /><para style="p"><verse number="1" style="v" />text<note caller="+" style="f"><char style="ft">closed note</char></note></para></usx>`,
    );
    initialize(undefined, undefined);
    reset();

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[2] as SerializedParaNode;
    const note = para.children.find((c) => isSerializedNoteNode(c)) as SerializedNoteNode;
    expect(note.isCollapsed).toBe(true);
    expect(note.children.some((c) => isSerializedImmutableNoteCallerNode(c))).toBe(true);
    const hasClosingMarker = note.children.some(
      (n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing",
    );
    expect(hasClosingMarker).toBe(true);
  });

  it("still renders editable caller text in unformatted view", () => {
    const usj = usjGen1v1;
    initialize(undefined, undefined);
    reset();

    const serializedEditorState = serializeEditorState(usj, getViewOptions(UNFORMATTED_VIEW_MODE));

    const notePara = serializedEditorState.root.children.find(
      (n) => isSerializedParaNode(n) && n.marker === "q2",
    );
    if (!isSerializedParaNode(notePara)) throw new Error("Note para not found");
    const note = notePara.children.find((n) => isSerializedNoteNode(n));
    if (!isSerializedNoteNode(note)) throw new Error("Note not found");
    expect(note.children.some((child) => isSerializedImmutableNoteCallerNode(child))).toBe(false);
  });

  it("should convert from USJ to Lexical editor state JSON including the hidden caller", () => {
    // Clone USJ and ensure the note caller is '-'
    const usjGen1v1Updated = JSON.parse(JSON.stringify(usjGen1v1));
    const usjNote = (
      (usjGen1v1Updated.content[NOTE_PARA_INDEX] as MarkerObject).content as MarkerObject[]
    )[NOTE_INDEX];
    usjNote.caller = HIDDEN_NOTE_CALLER;

    const serializedEditorState = serializeEditorState(usjGen1v1Updated);

    const editorStateCallerUpdated = editorStateGen1v1;
    const note = (editorStateCallerUpdated.root.children[NOTE_PARA_INDEX] as SerializedParaNode)
      .children[NOTE_INDEX] as SerializedNoteNode;
    note.caller = HIDDEN_NOTE_CALLER;
    const noteCaller = note.children[NOTE_CALLER_INDEX] as SerializedImmutableNoteCallerNode;
    noteCaller.caller = HIDDEN_NOTE_CALLER;
    removeNoteCallerOnClick(serializedEditorState);
    expect(serializedEditorState).toEqual(editorStateCallerUpdated);
  });

  it("should convert from USJ with Marks to Lexical editor state JSON", () => {
    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
  });

  it("should call `addMissingComments` if it's set", () => {
    const mockAddMissingComments = vi.fn();
    const nodeOptions = { addMissingComments: mockAddMissingComments };
    initialize(nodeOptions, console);

    const serializedEditorState = serializeEditorState(usjMarks);

    expect(serializedEditorState).toEqual(editorStateMarks);
    expect(mockAddMissingComments.mock.calls).toHaveLength(1); // called once
    // Called with `sid` array argument from `usjMarks`.
    expect(mockAddMissingComments.mock.calls[0][0]).toEqual(["1", "1", "2", "1", "2", "1", "2"]);
  });

  it("should convert from USJ with unknown items to Lexical editor state JSON", () => {
    const nodeOptions = { noteCallers: defaultNoteCallers };
    initialize(nodeOptions, console);
    reset();

    const serializedEditorState = serializeEditorState(usjWithUnknownItems);

    removeNoteCallerOnClick(serializedEditorState, NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX);
    expect(serializedEditorState).toEqual(editorStateWithUnknownItems);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(6);
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(1, "Unknown type-marker 'wat-z'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(2, "Unknown type-marker 'optbreak-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(3, "Unknown type-marker 'ref-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(4, "Unknown type-marker 'sidebar-esb'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(5, "Unknown type-marker 'periph-undefined'!");
    expect(consoleWarnSpy).toHaveBeenNthCalledWith(6, "Unknown type-marker 'figure-fig'!");
  });

  it("warns on an unknown char marker when no extra valid markers are configured", () => {
    initialize({}, console);
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "char", marker: "qqq", content: ["x"] } as MarkerObject],
    };

    serializeEditorState(usj);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unexpected char marker 'qqq'"),
    );
  });

  it("does not warn on a char marker listed in extraValidMarkers", () => {
    initialize({ extraValidMarkers: ["qqq"] }, console);
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "char", marker: "qqq", content: ["x"] } as MarkerObject],
    };

    serializeEditorState(usj);

    expect(consoleWarnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Unexpected char marker"),
    );
  });

  it("renders a char nested inside a char with `\\+` glyphs and the serialized nested flag", () => {
    // A char span nested inside another char span carries the `+` on its glyphs (`\+nd …\+nd*`)
    // while its `marker` stays clean — ParatextData's writer rule and PT9's on-screen display
    // for USFM <=3.0, where `+` is what makes a bare char marker nest instead of closing the
    // enclosing span.
    initialize(undefined, undefined);
    reset();
    const usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [
            {
              type: "char",
              marker: "add",
              content: ["added ", { type: "char", marker: "nd", content: ["Lord"] }],
            },
          ],
        } as MarkerObject,
      ],
    };

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const outerChar = para.children.find((child) => isSerializedCharNode(child));
    if (!isSerializedCharNode(outerChar)) throw new Error("No outer char found");
    const innerChar = outerChar.children.find((child) => isSerializedCharNode(child));
    if (!isSerializedCharNode(innerChar)) throw new Error("No inner char found");

    // Positive control: the outer (top-level) char's glyphs carry no nested flag at all.
    const outerGlyphs = outerChar.children.filter((child) => isSerializedMarkerNode(child));
    expect(
      outerGlyphs.map((glyph) => ({ marker: glyph.marker, markerSyntax: glyph.markerSyntax })),
    ).toEqual([
      { marker: "add", markerSyntax: "opening" },
      { marker: "add", markerSyntax: "closing" },
    ]);
    outerGlyphs.forEach((glyph) => expect(glyph).not.toHaveProperty("nested"));

    const innerGlyphs = innerChar.children.filter((child) => isSerializedMarkerNode(child));
    expect(
      innerGlyphs.map((glyph) => ({
        marker: glyph.marker,
        markerSyntax: glyph.markerSyntax,
        nested: glyph.nested,
      })),
    ).toEqual([
      { marker: "nd", markerSyntax: "opening", nested: true },
      { marker: "nd", markerSyntax: "closing", nested: true },
    ]);

    // The editable glyph TEXT itself carries the `+`: the serialized glyph text is empty and
    // derived at import from (marker, syntax, nested), so read it off a parsed live tree.
    const { editor } = createBasicTestEnvironment(usjReactNodes);
    editor.parseEditorState(state).read(() => {
      const livePara = $getRoot().getFirstChild();
      if (!$isElementNode(livePara)) throw new Error("No live para node found");
      const liveOuter = livePara.getChildren().find($isCharNode);
      if (!liveOuter) throw new Error("No live outer char found");
      const liveInner = liveOuter.getChildren().find($isCharNode);
      if (!liveInner) throw new Error("No live inner char found");
      expect(
        liveInner
          .getChildren()
          .filter($isMarkerNode)
          .map((glyph) => glyph.getTextContent()),
      ).toEqual(["\\+nd", "\\+nd*"]);
      expect(liveInner.getTextContent()).toBe(`\\+nd${NBSP}Lord\\+nd*`);
      // Positive control: the outer span's glyph texts stay bare.
      expect(
        liveOuter
          .getChildren()
          .filter($isMarkerNode)
          .map((glyph) => glyph.getTextContent()),
      ).toEqual(["\\add", "\\add*"]);
    });
  });

  it("renders a milestone as an opening glyph plus the bare `\\*` self-closing terminator", () => {
    // A milestone's terminator is the shared self-closing form `\*` — it carries no marker name
    // of its own, so its glyph node has an empty marker and the selfClosing syntax.
    initialize(undefined, undefined);
    reset();
    const usj = {
      ...EMPTY_USJ,
      content: [
        {
          type: "para",
          marker: "p",
          content: [{ type: "ms", marker: "ts-s" }, "after milestone"],
        } as MarkerObject,
      ],
    };

    const state = serializeEditorState(usj, getViewOptions(STANDARD_VIEW_MODE));

    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const milestoneIndex = para.children.findIndex((child) => isSerializedMilestoneNode(child));
    const milestone = para.children[milestoneIndex];
    if (!isSerializedMilestoneNode(milestone)) throw new Error("No milestone node found");
    expect(milestone.marker).toBe("ts-s");
    // In editable marker modes the milestone's display pieces ride in ONE attribute-run wrapper
    // that follows the milestone node, rather than as loose siblings — even when the milestone
    // carries no attributes, as here.
    const wrapper = para.children[milestoneIndex + 1];
    if (!isSerializedAttributeRunNode(wrapper)) throw new Error("No milestone wrapper found");
    expect(wrapper.runKind).toBe("milestone");
    const [openingGlyph, terminatorGlyph] = wrapper.children;
    if (!isSerializedMarkerNode(openingGlyph)) throw new Error("No milestone opening glyph found");
    expect(openingGlyph.marker).toBe("ts-s");
    expect(openingGlyph.markerSyntax).toBe("opening");
    if (!isSerializedMarkerNode(terminatorGlyph)) throw new Error("No terminator glyph found");
    expect(terminatorGlyph.marker).toBe("");
    expect(terminatorGlyph.markerSyntax).toBe("selfClosing");

    // The terminator's editable glyph text is the bare `\*` (derived at import). Collected by
    // descent, since the milestone's glyphs now sit one level down inside the wrapper.
    const { editor } = createBasicTestEnvironment(usjReactNodes);
    editor.parseEditorState(state).read(() => {
      const livePara = $getRoot().getFirstChild();
      if (!$isElementNode(livePara)) throw new Error("No live para node found");
      const glyphTextsOf = (node: LexicalNode): string[] => {
        if ($isMarkerNode(node)) return [node.getTextContent()];
        return $isElementNode(node) ? node.getChildren().flatMap(glyphTextsOf) : [];
      };
      expect(livePara.getChildren().flatMap(glyphTextsOf)).toEqual(["\\p", "\\ts-s", "\\*"]);
    });
  });
});

describe("load/insert note drift pins", () => {
  // Marker glyph nodes are presentation-only (they never serialize to USJ), so every document
  // shows the LOAD path's glyph shapes after a save/reload. The insert path ($insertNote →
  // $createWholeNote / note-content chars) must build the identical shapes, or a freshly
  // inserted note is visibly different from the same note reloaded. These pins make that
  // agreement a test failure instead of a "keep in sync" comment.

  /** Note node classes needed to build a note via the insert path in a headless editor. */
  const insertPathNodes = [
    ParaNode,
    NoteNode,
    CharNode,
    ImmutableNoteCallerNode,
    ImmutableTypedTextNode,
    MarkerNode,
  ];

  /** USJ note equivalent to what `$insertNote("f", "+", …, GEN 1:5)` builds (fr + empty ft). The
   * content chars carry closed="false" — the shape `$createNoteContentChar` stamps and real
   * ParatextData emits on genuinely-unclosed footnote content — so the loaded span renders
   * closer-less on the state rule and stays identical to the inserted one. */
  const usjWithFootnote = {
    ...EMPTY_USJ,
    content: [
      {
        type: "para",
        marker: "p",
        content: [
          "text",
          {
            type: "note",
            marker: "f",
            caller: "+",
            content: [
              { type: "char", marker: "fr", closed: "false", content: ["1:5 "] },
              { type: "char", marker: "ft", closed: "false" },
            ],
          },
          " after",
        ],
      } as MarkerObject,
    ],
  };

  /** Marker glyph texts (typed-text "marker" nodes) of a serialized note subtree, in order. */
  function serializedGlyphTexts(nodes: SerializedLexicalNode[]): string[] {
    const texts: string[] = [];
    const walk = (node: SerializedLexicalNode) => {
      if (isSerializedImmutableTypedTextNode(node) && node.textType === "marker")
        texts.push(node.text);
      const children = (node as Partial<SerializedElementNode>).children;
      children?.forEach(walk);
    };
    nodes.forEach(walk);
    return texts;
  }

  /** Marker glyph texts (typed-text "marker" nodes) of a live note subtree, in order. */
  function $liveGlyphTexts(node: LexicalNode): string[] {
    const texts: string[] = [];
    const $walk = (current: LexicalNode) => {
      if ($isImmutableTypedTextNode(current) && current.getTextType() === "marker")
        texts.push(current.getTextContent());
      if ($isElementNode(current)) current.getChildren().forEach($walk);
    };
    $walk(node);
    return texts;
  }

  /** The serialized note inside `usjWithFootnote`'s single para. */
  function serializedNote(state: ReturnType<typeof serializeEditorState>): SerializedNoteNode {
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const note = para.children.find((node) => isSerializedNoteNode(node));
    if (!isSerializedNoteNode(note)) throw new Error("No note node found");
    return note;
  }

  /** Build the same footnote through the INSERT path and read a result off the live note. */
  function withInsertedFootnote<T>(viewOptions: ViewOptions, $read: (note: NoteNode) => T): T {
    const { editor } = createBasicTestEnvironment(insertPathNodes);
    editor.update(
      () => {
        const text = $createTextNode("text after");
        $getRoot().append($createParaNode("p").append(text));
        text.select(4, 4);
      },
      { discrete: true },
    );
    let result: { value: T } | undefined;
    editor.update(
      () => {
        const note = $insertNote(
          "f",
          "+",
          undefined,
          { book: "GEN", chapterNum: 1, verseNum: 5 },
          viewOptions,
          {},
          undefined,
        );
        if (!note) throw new Error("Note was not inserted");
        result = { value: $read(note) };
      },
      { discrete: true },
    );
    if (!result) throw new Error("Note was not read");
    return result.value;
  }

  it("visible mode: an inserted footnote carries the same marker glyphs as a loaded one", () => {
    const visibleView: ViewOptions = { ...getDefaultViewOptions(), markerMode: "visible" };
    initialize({}, console);
    reset();

    const loadedGlyphTexts = serializedGlyphTexts(
      serializedNote(serializeEditorState(usjWithFootnote, visibleView)).children,
    );

    // The load path's shape (pinned above in "visible marker mode"): opening glyph with a plain
    // space, bare char glyphs, closer without trailing space.
    expect(loadedGlyphTexts).toEqual([
      `${openingMarkerText("f")} `,
      openingMarkerText("fr"),
      openingMarkerText("ft"),
      closingMarkerText("f"),
    ]);

    expect(withInsertedFootnote(visibleView, $liveGlyphTexts)).toEqual(loadedGlyphTexts);
  });

  /** Comparable shape of a serialized note's char spans: marker, closed flag, child layout. */
  function serializedCharShapes(note: SerializedNoteNode): unknown[] {
    return note.children.filter(isSerializedCharNode).map((char) => ({
      marker: char.marker,
      closed: char.unknownAttributes?.closed,
      children: char.children.map((child) =>
        isSerializedMarkerNode(child)
          ? { glyphMarker: child.marker, markerSyntax: child.markerSyntax }
          : { text: (child as SerializedTextNode).text },
      ),
    }));
  }

  /** Comparable shape of a live note's char spans: marker, closed flag, child layout. */
  function $liveCharShapes(note: NoteNode): unknown[] {
    return note
      .getChildren()
      .filter($isCharNode)
      .map((char) => ({
        marker: char.getMarker(),
        closed: char.getUnknownAttributes()?.closed,
        children: char
          .getChildren()
          .map((child) =>
            $isMarkerNode(child)
              ? { glyphMarker: child.getMarker(), markerSyntax: child.getMarkerSyntax() }
              : { text: child.getTextContent() },
          ),
      }));
  }

  it("editable mode: an inserted footnote's char spans match a loaded one's (glyph + NBSP prefix)", () => {
    const standardView = getViewOptions(STANDARD_VIEW_MODE);
    if (!standardView) throw new Error("Standard view options are required");
    initialize({}, console);
    reset();

    const loadedCharShapes = serializedCharShapes(
      serializedNote(serializeEditorState(usjWithFootnote, standardView)),
    );

    // The load path's shape: each char span opens with its MarkerNode glyph; real content
    // carries the structural NBSP prefix; an empty span holds the lone-NBSP placeholder; the
    // implicitly-closed note-content chars carry closed="false" and no closing glyph.
    expect(loadedCharShapes).toEqual([
      {
        marker: "fr",
        closed: "false",
        children: [{ glyphMarker: "fr", markerSyntax: "opening" }, { text: `${NBSP}1:5 ` }],
      },
      {
        marker: "ft",
        closed: "false",
        children: [{ glyphMarker: "ft", markerSyntax: "opening" }, { text: NBSP }],
      },
    ]);

    expect(withInsertedFootnote(standardView, $liveCharShapes)).toEqual(loadedCharShapes);
  });
});

describe("load/delta para prefix drift pin", () => {
  // The adaptor's `createPara` (load), the marker-edit engine's `$createMarkerPrefix` (pinned
  // against the adaptor in markerEditDeletion.utils.test.tsx), and the collab delta path's
  // paragraph materialization (`$applyUpdate` handling a remote insert-paragraph op) all build
  // the editable `[glyph, separator]` paragraph prefix. Every layout and caret computation
  // assumes the shapes are identical — most critically the separator's exact-NBSP text, token
  // mode, and marker-trailing-space tag, which keep typed text out of the separator and out of
  // serialized USJ. This pin makes disagreement a test failure instead of a "keep in sync"
  // comment.
  it("a delta-inserted paragraph carries the same [glyph, separator] prefix the adaptor loads", () => {
    interface PrefixShape {
      glyphMarker?: string;
      glyphSyntax?: string;
      separatorText?: string;
      separatorMode?: string;
      separatorTextType?: unknown;
    }
    const standardView = getViewOptions(STANDARD_VIEW_MODE);
    if (!standardView) throw new Error("Standard view options are required");

    // Delta side: a remote insert-paragraph op materialized into a live tree.
    const { editor } = createBasicTestEnvironment([ParaNode, ImpliedParaNode, MarkerNode], () => {
      $getRoot().append($createImpliedParaNode());
    });
    let delta: PrefixShape = {};
    editor.update(
      () => {
        $applyUpdate([{ insert: LF, attributes: { para: { style: "q1" } } }], standardView, {});
        const para = $getRoot().getFirstChild();
        if (!$isParaNode(para)) throw new Error("No para node materialized");
        const [glyphNode, separatorNode] = para.getChildren();
        if ($isMarkerNode(glyphNode))
          delta = { glyphMarker: glyphNode.getMarker(), glyphSyntax: glyphNode.getMarkerSyntax() };
        if ($isTextNode(separatorNode) && !$isMarkerNode(separatorNode))
          delta = {
            ...delta,
            separatorText: separatorNode.getTextContent(),
            separatorMode: separatorNode.getMode(),
            separatorTextType: $getState(separatorNode, textTypeState),
          };
      },
      { discrete: true },
    );

    // Load side: the same `\q1` paragraph serialized by the adaptor under identical options.
    initialize({}, console);
    reset();
    const usj = {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "q1", content: ["hi"] } as MarkerObject],
    };
    const state = serializeEditorState(usj, standardView);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const [glyph, separator] = para.children;
    if (!isSerializedMarkerNode(glyph)) throw new Error("No para marker glyph found");
    if (!isSerializedTextNode(separator)) throw new Error("No separator found");
    const stateObject: unknown = separator[NODE_STATE_KEY];
    const loaded: PrefixShape = {
      glyphMarker: glyph.marker,
      glyphSyntax: glyph.markerSyntax,
      separatorText: separator.text,
      separatorMode: separator.mode,
      separatorTextType:
        stateObject && typeof stateObject === "object" && "textType" in stateObject
          ? stateObject.textType
          : undefined,
    };

    // Sanity-pin the load shape itself so both sides drifting together still fails loudly.
    expect(loaded).toEqual({
      glyphMarker: "q1",
      glyphSyntax: "opening",
      separatorText: NBSP,
      separatorMode: "token",
      separatorTextType: "marker-trailing-space",
    });

    expect(delta).toEqual(loaded);
  });
});

describe("char-span attribute display (editable mode)", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** A one-paragraph USJ document wrapping a single char span. */
  function usjWithChar(charObject: MarkerObject): Usj {
    return {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "p", content: [charObject] } as MarkerObject],
    };
  }

  /** Serializes `usj` and returns its paragraph's single char span. */
  function firstChar(usj: Usj, viewOptions?: ViewOptions): SerializedCharNode {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, viewOptions);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const char = para.children.find((c) => isSerializedCharNode(c));
    if (!isSerializedCharNode(char)) throw new Error("No char node found");
    return char;
  }

  it("renders a lone default attribute collapsed, between content and closer", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "w",
        lemma: "grace",
        content: ["word"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children).toHaveLength(4);
    const [opening, content, attribute, closing] = char.children;
    expect(isSerializedMarkerNode(opening) && opening.markerSyntax === "opening").toBe(true);
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe(`${NBSP}word`);
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe("|grace");
    expect(textTypeOf(attribute)).toBe("attribute");
    expect(isSerializedMarkerNode(closing) && closing.markerSyntax === "closing").toBe(true);
  });

  it("renders multiple attributes named, insertion order", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "w",
        lemma: "grace",
        strong: "G5485",
        content: ["word"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = char.children.find((n) => textTypeOf(n) === "attribute");
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe('|lemma="grace" strong="G5485"');
  });

  it("renders named form for a non-default lone attribute", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "nd",
        "x-custom": "y",
        content: ["Lord"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = char.children.find((n) => textTypeOf(n) === "attribute");
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe('|x-custom="y"');
  });

  it("builds no run for closed-only unknownAttributes (footnote content chars)", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "ft",
        closed: "false",
        content: ["note"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
    expect(
      char.children.some((n) => isSerializedMarkerNode(n) && n.markerSyntax === "closing"),
    ).toBe(false);
  });

  it("builds no run on an unclosed span", () => {
    const char = firstChar(
      usjWithChar({
        type: "char",
        marker: "nd",
        closed: "false",
        lemma: "x",
        content: ["a"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(char.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
  });

  it("builds no run in visible/hidden marker modes", () => {
    const usj = usjWithChar({
      type: "char",
      marker: "w",
      lemma: "grace",
      content: ["word"],
    } as MarkerObject);

    const visibleChar = firstChar(usj, { ...getDefaultViewOptions(), markerMode: "visible" });
    expect(visibleChar.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);

    const hiddenChar = firstChar(usj, { ...getDefaultViewOptions(), markerMode: "hidden" });
    expect(hiddenChar.children.some((n) => textTypeOf(n) === "attribute")).toBe(false);
  });
});

describe("milestone attribute display", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** A one-paragraph USJ document wrapping a single milestone. */
  function usjWithMilestone(msObject: MarkerObject): Usj {
    return {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "p", content: [msObject] } as MarkerObject],
    };
  }

  /** Serializes `usj` and returns the paragraph's children: a milestone's glyphs and attribute
   * text ride alongside it as siblings, not inside it (a milestone has no children of its own). */
  function paraChildren(usj: Usj, viewOptions?: ViewOptions): SerializedLexicalNode[] {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, viewOptions);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    return para.children;
  }

  /** The single `attribute-run` wrapper (runKind "milestone") among `children`, if any. */
  function milestoneWrapper(children: SerializedLexicalNode[]): SerializedAttributeRunNode {
    const wrapper = children.find(
      (n) => isSerializedAttributeRunNode(n) && n.runKind === "milestone",
    );
    if (!isSerializedAttributeRunNode(wrapper)) throw new Error("No milestone wrapper found");
    return wrapper;
  }

  it("collapses a lone default `who` attribute on a `qt*-s` milestone (editable mode)", () => {
    const children = paraChildren(
      usjWithMilestone({ type: "ms", marker: "qt-s", who: "Jesus" } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = milestoneWrapper(children).children.find(
      (n) => textTypeOf(n) === "attribute",
    );
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe(`${NBSP}|Jesus`);
  });

  it("renders named form, sid first, when sid and who are both present (editable mode)", () => {
    const children = paraChildren(
      usjWithMilestone({ type: "ms", marker: "qt-s", sid: "x", who: "Jesus" } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    const attribute = milestoneWrapper(children).children.find(
      (n) => textTypeOf(n) === "attribute",
    );
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe(`${NBSP}|sid="x" who="Jesus"`);
  });

  it("wraps the opening glyph, attribute text, and self-closing glyph in ONE attribute-run node (editable mode)", () => {
    const children = paraChildren(
      usjWithMilestone({ type: "ms", marker: "qt-s", sid: "x", who: "Jesus" } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    // The milestone itself contributes no children of its own — the wrapper rides as its ONE
    // following sibling, not the three loose pieces a pre-flip adaptor built.
    const wrapper = milestoneWrapper(children);
    expect(wrapper.children).toHaveLength(3);
    const [opening, attribute, closing] = wrapper.children;
    expect(isSerializedMarkerNode(opening) && opening.markerSyntax === "opening").toBe(true);
    if (!isSerializedMarkerNode(opening)) throw new Error("No opening marker found");
    expect(opening.marker).toBe("qt-s");
    if (!isSerializedTextNode(attribute)) throw new Error("No attribute text node found");
    expect(attribute.text).toBe(`${NBSP}|sid="x" who="Jesus"`);
    expect(textTypeOf(attribute)).toBe("attribute");
    expect(isSerializedMarkerNode(closing) && closing.markerSyntax === "selfClosing").toBe(true);
  });

  it("visible mode: milestone output is UNCHANGED — loose ImmutableTypedTextNode pieces, no wrapper", () => {
    const children = paraChildren(
      usjWithMilestone({ type: "ms", marker: "qt-s", sid: "x", who: "Jesus" } as MarkerObject),
      { ...getDefaultViewOptions(), markerMode: "visible" },
    );

    // No attribute-run wrapper at all in visible mode — the three pieces (opening glyph,
    // attribute text, self-closing glyph) ride loose, exactly as before the flip.
    expect(children.some((n) => isSerializedAttributeRunNode(n))).toBe(false);
    const attribute = children.find(
      (n) => isSerializedImmutableTypedTextNode(n) && n.textType === "attribute",
    );
    if (!isSerializedImmutableTypedTextNode(attribute))
      throw new Error("No attribute typed-text node found");
    expect(attribute.text).toBe(`${NBSP}|sid="x" who="Jesus"`);
  });
});

describe("verse attribute display (\\va/\\vp runs)", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** A one-paragraph USJ document wrapping a single verse. */
  function usjWithVerse(verseObject: MarkerObject): Usj {
    return {
      ...EMPTY_USJ,
      content: [{ type: "para", marker: "p", content: [verseObject] } as MarkerObject],
    };
  }

  /** Serializes `usj` and returns the paragraph's children: a verse's display runs ride
   * alongside it as siblings, not inside it (a verse has no children of its own). */
  function paraChildren(usj: Usj, viewOptions?: ViewOptions): SerializedLexicalNode[] {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, viewOptions);
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    return para.children;
  }

  /** The verse node and everything from it onward — skips the paragraph's own opening glyphs
   * (editable mode prepends its own `\p` marker + separator ahead of any content). */
  function versesFrom(children: SerializedLexicalNode[]): SerializedLexicalNode[] {
    const index = children.findIndex((n) => isSomeSerializedVerseNode(n));
    if (index < 0) throw new Error("No verse node found");
    return children.slice(index);
  }

  /** Unwraps a serialized `attribute-run` node's 3 children (opener, value, closer), asserting
   * `runKind` matches `marker`. */
  function unwrapRun(
    node: SerializedLexicalNode | undefined,
    marker: "va" | "vp",
  ): [SerializedLexicalNode, SerializedLexicalNode, SerializedLexicalNode] {
    if (!isSerializedAttributeRunNode(node) || node.runKind !== marker)
      throw new Error(`No ${marker} attribute-run wrapper found`);
    expect(node.children).toHaveLength(3);
    const [opener, value, closer] = node.children;
    return [opener, value, closer];
  }

  it("serializes both runs after the verse node, EACH wrapped in its own attribute-run node, in \\va-then-\\vp order, exact glyph bytes", () => {
    const children = versesFrom(
      paraChildren(
        usjWithVerse({
          type: "verse",
          marker: "v",
          number: "1",
          altnumber: "2",
          pubnumber: "1b",
        } as MarkerObject),
        getViewOptions(STANDARD_VIEW_MODE),
      ),
    );

    // ONE sibling slot per marker (the wrapper), not 3 loose pieces each — the verse plus two
    // attribute-run wrappers.
    expect(children).toHaveLength(3);
    const [verse, vaWrapper, vpWrapper] = children;
    expect(isSomeSerializedVerseNode(verse)).toBe(true);

    const [vaOpen, vaValue, vaClose] = unwrapRun(vaWrapper, "va");
    expect(isSerializedMarkerNode(vaOpen) && vaOpen.markerSyntax === "opening").toBe(true);
    if (!isSerializedMarkerNode(vaOpen)) throw new Error("No \\va opening marker found");
    expect(vaOpen.marker).toBe("va");
    if (!isSerializedTextNode(vaValue)) throw new Error("No \\va value text node found");
    expect(vaValue.text).toBe(`${NBSP}2`);
    expect(textTypeOf(vaValue)).toBe("attribute");
    if (!isSerializedMarkerNode(vaClose)) throw new Error("No \\va closing marker found");
    expect(vaClose.marker).toBe("va");
    expect(vaClose.markerSyntax).toBe("closing");

    const [vpOpen, vpValue, vpClose] = unwrapRun(vpWrapper, "vp");
    if (!isSerializedMarkerNode(vpOpen)) throw new Error("No \\vp opening marker found");
    expect(vpOpen.marker).toBe("vp");
    expect(vpOpen.markerSyntax).toBe("opening");
    if (!isSerializedTextNode(vpValue)) throw new Error("No \\vp value text node found");
    expect(vpValue.text).toBe(`${NBSP}1b`);
    expect(textTypeOf(vpValue)).toBe("attribute");
    if (!isSerializedMarkerNode(vpClose)) throw new Error("No \\vp closing marker found");
    expect(vpClose.marker).toBe("vp");
    expect(vpClose.markerSyntax).toBe("closing");
  });

  it("builds only the \\va run when pubnumber is absent", () => {
    const children = versesFrom(
      paraChildren(
        usjWithVerse({ type: "verse", marker: "v", number: "1", altnumber: "2" } as MarkerObject),
        getViewOptions(STANDARD_VIEW_MODE),
      ),
    );

    expect(children).toHaveLength(2);
    const [vaOpen] = unwrapRun(children[1], "va");
    expect(isSerializedMarkerNode(vaOpen) && vaOpen.marker === "va").toBe(true);
    expect(children.some((n) => isSerializedAttributeRunNode(n) && n.runKind === "vp")).toBe(false);
  });

  it("builds only the \\vp run when altnumber is absent", () => {
    const children = versesFrom(
      paraChildren(
        usjWithVerse({ type: "verse", marker: "v", number: "1", pubnumber: "1b" } as MarkerObject),
        getViewOptions(STANDARD_VIEW_MODE),
      ),
    );

    expect(children).toHaveLength(2);
    const [vpOpen] = unwrapRun(children[1], "vp");
    expect(isSerializedMarkerNode(vpOpen) && vpOpen.marker === "vp").toBe(true);
    expect(children.some((n) => isSerializedAttributeRunNode(n) && n.runKind === "va")).toBe(false);
  });

  it("serializes a plain verse (no altnumber/pubnumber) unchanged", () => {
    const children = versesFrom(
      paraChildren(
        usjWithVerse({ type: "verse", marker: "v", number: "1" } as MarkerObject),
        getViewOptions(STANDARD_VIEW_MODE),
      ),
    );

    expect(children).toHaveLength(1);
    expect(isSomeSerializedVerseNode(children[0])).toBe(true);
  });

  it("builds no runs in visible/hidden marker modes", () => {
    const usj = usjWithVerse({
      type: "verse",
      marker: "v",
      number: "1",
      altnumber: "2",
      pubnumber: "1b",
    } as MarkerObject);

    const visibleChildren = versesFrom(
      paraChildren(usj, { ...getDefaultViewOptions(), markerMode: "visible" }),
    );
    expect(visibleChildren).toHaveLength(1);
    expect(visibleChildren.some((n) => textTypeOf(n) === "attribute")).toBe(false);

    const hiddenChildren = versesFrom(
      paraChildren(usj, { ...getDefaultViewOptions(), markerMode: "hidden" }),
    );
    expect(hiddenChildren).toHaveLength(1);
    expect(hiddenChildren.some((n) => textTypeOf(n) === "attribute")).toBe(false);
  });
});

describe("chapter alternate-number display (\\ca run)", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** Serializes a USJ whose content is [chapterObject, one para] and returns the CHAPTER node. */
  function serializedChapter(chapterObject: MarkerObject, viewOptions?: ViewOptions) {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(
      {
        ...EMPTY_USJ,
        content: [chapterObject, { type: "para", marker: "p", content: ["text"] } as MarkerObject],
      },
      viewOptions,
    );
    return state.root.children[0];
  }

  const chapterWithAltnumber = {
    type: "chapter",
    marker: "c",
    number: "1",
    altnumber: "2",
  } as MarkerObject;

  it("wraps \\ca glyphs and the NBSP-prefixed value directly after the \\c glyph text (editable)", () => {
    const chapter = serializedChapter(chapterWithAltnumber, getViewOptions(STANDARD_VIEW_MODE));
    if (!isSerializedChapterNode(chapter)) throw new Error("No editable chapter node found");
    // [glyph text "\c 1"][ca run] — the same-line file position `\c 1 \ca 2\ca*`.
    expect(chapter.children).toHaveLength(2);
    const [glyph, run] = chapter.children;
    if (!isSerializedTextNode(glyph)) throw new Error("No chapter glyph text found");
    if (!isSerializedAttributeRunNode(run) || run.runKind !== "ca")
      throw new Error("No ca attribute-run wrapper after the chapter glyph");
    expect(run.children).toHaveLength(3);
    const [opener, value, closer] = run.children;
    if (!isSerializedMarkerNode(opener)) throw new Error("No \\ca opening marker found");
    expect(opener.marker).toBe("ca");
    expect(opener.markerSyntax).toBe("opening");
    if (!isSerializedTextNode(value)) throw new Error("No \\ca value text node found");
    expect(value.text).toBe(`${NBSP}2`);
    expect(textTypeOf(value)).toBe("attribute");
    if (!isSerializedMarkerNode(closer)) throw new Error("No \\ca closing marker found");
    expect(closer.marker).toBe("ca");
    expect(closer.markerSyntax).toBe("closing");
  });

  it("builds no run when the chapter has no altnumber", () => {
    const chapter = serializedChapter(
      { type: "chapter", marker: "c", number: "1" } as MarkerObject,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    if (!isSerializedChapterNode(chapter)) throw new Error("No editable chapter node found");
    expect(chapter.children.some((child) => isSerializedAttributeRunNode(child))).toBe(false);
  });

  it("builds the closer-less \\cp run after the \\ca run, in document order (editable)", () => {
    const chapter = serializedChapter(
      {
        type: "chapter",
        marker: "c",
        number: "1",
        altnumber: "2",
        pubnumber: "A",
      } as MarkerObject,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    if (!isSerializedChapterNode(chapter)) throw new Error("No editable chapter node found");
    // [glyph text "\c 1 "][ca run][cp run] — the alt-before-pub document order ParatextData
    // preserves on disk, all on the chapter's own line.
    expect(chapter.children).toHaveLength(3);
    const [, caRun, cpRun] = chapter.children;
    if (!isSerializedAttributeRunNode(caRun) || caRun.runKind !== "ca")
      throw new Error("No ca attribute-run wrapper found");
    if (!isSerializedAttributeRunNode(cpRun) || cpRun.runKind !== "cp")
      throw new Error("No cp attribute-run wrapper found");
    // \cp has NO closing marker — its span closes implicitly at the next block boundary in the
    // file, so the run is opener + value only, bounded by its wrapper.
    expect(cpRun.children).toHaveLength(2);
    const [opener, value] = cpRun.children;
    if (!isSerializedMarkerNode(opener)) throw new Error("No \\cp opening marker found");
    expect(opener.marker).toBe("cp");
    expect(opener.markerSyntax).toBe("opening");
    if (!isSerializedTextNode(value)) throw new Error("No \\cp value text node found");
    expect(value.text).toBe(`${NBSP}A`);
  });

  it("builds only the \\cp run when altnumber is absent, directly after the glyph text", () => {
    const chapter = serializedChapter(
      { type: "chapter", marker: "c", number: "1", pubnumber: "A" } as MarkerObject,
      getViewOptions(STANDARD_VIEW_MODE),
    );
    if (!isSerializedChapterNode(chapter)) throw new Error("No editable chapter node found");
    expect(chapter.children).toHaveLength(2);
    const [, cpRun] = chapter.children;
    if (!isSerializedAttributeRunNode(cpRun) || cpRun.runKind !== "cp")
      throw new Error("No cp attribute-run wrapper found");
    expect(
      chapter.children.some(
        (child) => isSerializedAttributeRunNode(child) && child.runKind === "ca",
      ),
    ).toBe(false);
  });

  it("builds no run in visible/hidden marker modes (immutable chapters carry state only)", () => {
    for (const markerMode of ["visible", "hidden"] as const) {
      const chapter = serializedChapter(chapterWithAltnumber, {
        ...getDefaultViewOptions(),
        markerMode,
      });
      expect(isSerializedImmutableChapterNode(chapter)).toBe(true);
    }
  });
});

describe("note category display (\\cat run)", () => {
  /** The node-state `textType` tag of a serialized text node, or `undefined` for anything else. */
  function textTypeOf(node: SerializedLexicalNode): unknown {
    if (!isSerializedTextNode(node)) return undefined;
    const stateObject: unknown = node[NODE_STATE_KEY];
    return stateObject && typeof stateObject === "object" && "textType" in stateObject
      ? stateObject.textType
      : undefined;
  }

  /** Standard-view options, asserted present so overrides can spread a definite base. */
  function standardViewOptions(): ViewOptions {
    const options = getViewOptions(STANDARD_VIEW_MODE);
    if (!options) throw new Error("Standard view options are required for these tests.");
    return options;
  }

  /** Serializes a one-paragraph USJ wrapping `noteObject` and returns the NOTE's children. */
  function noteChildren(noteObject: MarkerObject, viewOptions?: ViewOptions) {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(
      {
        ...EMPTY_USJ,
        content: [{ type: "para", marker: "p", content: ["Text ", noteObject] } as MarkerObject],
      },
      viewOptions,
    );
    const para = state.root.children[0];
    if (!isSerializedParaNode(para)) throw new Error("No para node found");
    const note = para.children.find((child) => isSerializedNoteNode(child));
    if (!note || !isSerializedNoteNode(note)) throw new Error("No note node found");
    return note.children;
  }

  const noteWithCategory = {
    type: "note",
    marker: "f",
    caller: "+",
    category: "People",
    content: [{ type: "char", marker: "ft", content: ["A footnote."] }],
  } as MarkerObject;

  it("wraps \\cat glyphs and the NBSP-prefixed value directly after the caller (editable expanded)", () => {
    const children = noteChildren(noteWithCategory, {
      ...standardViewOptions(),
      noteMode: "expanded",
    });
    // [opening \f glyph][editable caller][cat run][content ft span][closing \f* glyph]
    const callerIndex = children.findIndex(
      (child) => isSerializedTextNode(child) && child.text === getEditableCallerText("+"),
    );
    expect(callerIndex).toBeGreaterThan(0);
    const run = children[callerIndex + 1];
    if (!isSerializedAttributeRunNode(run) || run.runKind !== "cat")
      throw new Error("No cat attribute-run wrapper directly after the caller");
    expect(run.children).toHaveLength(3);
    const [opener, value, closer] = run.children;
    if (!isSerializedMarkerNode(opener)) throw new Error("No \\cat opening marker found");
    expect(opener.marker).toBe("cat");
    expect(opener.markerSyntax).toBe("opening");
    if (!isSerializedTextNode(value)) throw new Error("No \\cat value text node found");
    expect(value.text).toBe(`${NBSP}People`);
    expect(textTypeOf(value)).toBe("attribute");
    if (!isSerializedMarkerNode(closer)) throw new Error("No \\cat closing marker found");
    expect(closer.marker).toBe("cat");
    expect(closer.markerSyntax).toBe("closing");
  });

  it("builds no run when the note has no category", () => {
    const children = noteChildren({ ...noteWithCategory, category: undefined } as MarkerObject, {
      ...standardViewOptions(),
      noteMode: "expanded",
    });
    expect(children.some((child) => isSerializedAttributeRunNode(child))).toBe(false);
  });

  it("builds no run in collapsed notes — the category is deliberately not shown there", () => {
    const children = noteChildren(noteWithCategory, getViewOptions(STANDARD_VIEW_MODE));
    expect(children.some((child) => isSerializedAttributeRunNode(child))).toBe(false);
    // The category still rides the note's own serialized state, so nothing is lost.
  });

  it("builds no run in visible marker mode, matching the \\va/\\vp editable-only rule", () => {
    const children = noteChildren(noteWithCategory, {
      ...getDefaultViewOptions(),
      markerMode: "visible",
      noteMode: "expanded",
    });
    expect(children.some((child) => isSerializedAttributeRunNode(child))).toBe(false);
    expect(children.some((child) => textTypeOf(child) === "attribute")).toBe(false);
  });
});

describe("unknown-node display (USFM byte runs, editable mode)", () => {
  /** A one-item USJ document; `createUnknown` doesn't look at its parent, so top-level content
   * exercises the same code path a nested unknown construct would. */
  function usjWithUnknown(markerObject: MarkerObject): Usj {
    return { ...EMPTY_USJ, content: [markerObject] };
  }

  /** Serializes `usj` and returns the first (only) top-level node's children. */
  function unknownChildren(usj: Usj, viewOptions?: ViewOptions): SerializedLexicalNode[] {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(usj, viewOptions);
    const node = state.root.children[0];
    if (!isSerializedUnknownNode(node)) throw new Error("No unknown node found");
    return node.children;
  }

  it("figure: opening marker, caption content, then a dimmer attribute run before the closing marker — byte-exact", () => {
    // USFM 3.0 figure syntax is `\fig caption|src="…"\fig*` — caption FIRST. The attribute
    // bytes ride in their own "attribute"-typed node directly before the "marker"-typed closer
    // (unknownDisplayParts' closingAttributes + closing), so PT9's dimmer `.attribute` styling
    // applies to the `|…` run while the closer glyph keeps `.marker` styling — and concatenating
    // the two nodes' text still reproduces the exact same USFM bytes.
    const children = unknownChildren(
      usjWithUnknown({
        type: "figure",
        marker: "fig",
        file: "image.jpg",
        size: "span",
        ref: "1.18",
        content: ["figure content"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(children).toHaveLength(4);
    const [opening, content, attribute, closing] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.textType).toBe("marker");
    expect(opening.text).toBe("\\fig ");
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe("figure content");
    expect(content.mode).toBe("token");
    if (!isSerializedImmutableTypedTextNode(attribute)) throw new Error("No attribute run found");
    expect(attribute.textType).toBe("attribute");
    expect(attribute.text).toBe('|src="image.jpg" size="span" ref="1.18"');
    if (!isSerializedImmutableTypedTextNode(closing)) throw new Error("No closing marker found");
    expect(closing.textType).toBe("marker");
    expect(closing.text).toBe("\\fig*");
  });

  it("generic unknown kind: opening marker, content, then a dimmer attribute run before the closing marker — byte-exact", () => {
    // Same split as figure, for the char-span default shape (`\zzz content|foo="bar"\zzz*`):
    // the attribute run gets its own "attribute"-typed node, not folded into the "marker"-typed
    // closer.
    const children = unknownChildren(
      usjWithUnknown({
        type: "unknown-para",
        marker: "zzz",
        foo: "bar",
        baz: "qux",
        content: ["zzz content"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(children).toHaveLength(4);
    const [opening, content, attribute, closing] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.textType).toBe("marker");
    expect(opening.text).toBe("\\zzz ");
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe("zzz content");
    if (!isSerializedImmutableTypedTextNode(attribute)) throw new Error("No attribute run found");
    expect(attribute.textType).toBe("attribute");
    expect(attribute.text).toBe('|foo="bar" baz="qux"');
    if (!isSerializedImmutableTypedTextNode(closing)) throw new Error("No closing marker found");
    expect(closing.textType).toBe("marker");
    expect(closing.text).toBe("\\zzz*");
  });

  it("sidebar: opening carries no separator space; a category attribute rides as its own \\cat run", () => {
    const children = unknownChildren(
      usjWithUnknown({
        type: "sidebar",
        marker: "esb",
        category: "History",
        content: ["Sidebar text"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(children).toHaveLength(4);
    const [opening, attributes, , closing] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.text).toBe("\\esb");
    if (!isSerializedImmutableTypedTextNode(attributes)) throw new Error("No attribute run found");
    expect(attributes.text).toBe(" \\cat History\\cat*");
    if (!isSerializedImmutableTypedTextNode(closing)) throw new Error("No closing marker found");
    expect(closing.text).toBe("\\esbe");
  });

  it("periph: alt renders as opening marker content; periph never closes, so there is no closing run", () => {
    const children = unknownChildren(
      usjWithUnknown({
        type: "periph",
        alt: "Title Page",
        id: "titlepage",
        content: ["The Title"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(children).toHaveLength(3);
    const [opening, attributes, content] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.text).toBe("\\periph Title Page");
    if (!isSerializedImmutableTypedTextNode(attributes)) throw new Error("No attribute run found");
    expect(attributes.text).toBe('|id="titlepage"');
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe("The Title");
  });

  // This pinned the never-closes rule on table/table:row/table:cell until paranext-core#2487
  // taught the adaptor to build real ImmutableTable* nodes for those three types: they no longer
  // reach `createUnknown`, so the table arm of `unknownDisplayParts` (including
  // `tableCellMarkerWithSpan`) is unreachable from the adaptor. `periph` is the other open-ended
  // division marker, so the same contract is pinned through it here. Whether that dead table arm
  // should go, and how tables/figures/sidebars reconcile overall, is PT-4198.
  it("periph opens with its marker and alt text, keeps other attributes, and never closes", () => {
    const children = unknownChildren(
      usjWithUnknown({
        type: "periph",
        marker: "periph",
        alt: "Title Page",
        id: "title",
        content: ["periph content"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    // Opening marker (carrying the alt as literal content) + attribute run + content; no closer.
    expect(children).toHaveLength(3);
    const [opening, attribute, content] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.textType).toBe("marker");
    expect(opening.text).toBe("\\periph Title Page");
    if (!isSerializedImmutableTypedTextNode(attribute)) throw new Error("No attribute run found");
    expect(attribute.textType).toBe("attribute");
    expect(attribute.text).toBe('|id="title"');
    if (!isSerializedTextNode(content)) throw new Error("No content text node found");
    expect(content.text).toBe("periph content");
    // An open-ended division marker never closes: exactly one "marker"-typed run, the opener.
    expect(
      children.filter((c) => isSerializedImmutableTypedTextNode(c) && c.textType === "marker"),
    ).toHaveLength(1);
  });

  it("optbreak renders the real '//' token as its only child — no attribute or closing run", () => {
    const children = unknownChildren(
      usjWithUnknown({ type: "optbreak" } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );

    expect(children).toHaveLength(1);
    const [opening] = children;
    if (!isSerializedImmutableTypedTextNode(opening)) throw new Error("No opening marker found");
    expect(opening.textType).toBe("marker");
    expect(opening.text).toBe("//");
  });

  // `table` used to be the second case here; it now builds a real ImmutableTableNode instead of
  // an UnknownNode (paranext-core#2487), leaving `ref` — a wrapper USJ invented that USFM never
  // carried — as the only kind that contributes no bytes at all. See the periph test above.
  it("ref carries no USFM bytes of its own — no display children at all", () => {
    const refChildren = unknownChildren(
      usjWithUnknown({
        type: "ref",
        loc: "MRK 9:50",
        content: ["Mk 9.50"],
      } as MarkerObject),
      getViewOptions(STANDARD_VIEW_MODE),
    );
    expect(refChildren).toHaveLength(1);
    expect(refChildren.some(isSerializedImmutableTypedTextNode)).toBe(false);
  });

  it("builds no display children in visible or hidden marker modes", () => {
    const usj = usjWithUnknown({
      type: "figure",
      marker: "fig",
      file: "image.jpg",
      content: ["figure content"],
    } as MarkerObject);

    const visibleChildren = unknownChildren(usj, {
      ...getDefaultViewOptions(),
      markerMode: "visible",
    });
    expect(visibleChildren).toHaveLength(1);
    expect(visibleChildren.some(isSerializedImmutableTypedTextNode)).toBe(false);

    const hiddenChildren = unknownChildren(usj, {
      ...getDefaultViewOptions(),
      markerMode: "hidden",
    });
    expect(hiddenChildren).toHaveLength(1);
    expect(hiddenChildren.some(isSerializedImmutableTypedTextNode)).toBe(false);
  });
});

/**
 * Twin pin for the three editable marker-prefix separators: a paragraph's, a table row's, and a
 * table cell's. All three are the same thing — the structural NBSP after a block marker's glyph —
 * so all three must serialize with the same node shape.
 *
 * The shape is load-bearing, not cosmetic. A separator that is not tagged
 * `marker-trailing-space` is indistinguishable in `NodeState` from an ordinary content text node,
 * and Lexical's first normalization pass merges adjacent simple text nodes with equal state: the
 * separator fuses into the neighboring content, serialization's exact-NBSP drop can no longer see
 * it, and a display byte leaks into USJ as a data space. That is how collapsed notes gained a
 * spurious space. Token mode is the second half — it makes the separator atomic, so a caret steps
 * over it and a delete removes it whole rather than editing inside a byte the user does not own.
 */
describe("editable marker-prefix separators are one shape", () => {
  /** A paragraph plus a one-row, one-cell table, as the adaptor receives them. */
  const tableUsj: Usj = {
    ...EMPTY_USJ,
    content: [
      { type: "para", marker: "p", content: ["body"] },
      {
        type: "table",
        content: [
          {
            type: "table:row",
            marker: "tr",
            content: [{ type: "table:cell", marker: "tc1", content: ["cell"] }],
          },
        ],
      },
    ] as MarkerObject[],
  };

  /** The separator directly after a block node's opening marker glyph (its second child). */
  function separatorOf(children: SerializedLexicalNode[]): SerializedTextNode {
    const separator = children[1];
    if (!isSerializedTextNode(separator)) throw new Error("no separator text node found");
    return separator;
  }

  it("gives the para, row, and cell separators the same tag and token mode", () => {
    initialize(undefined, undefined);
    reset();
    const state = serializeEditorState(tableUsj, getViewOptions(STANDARD_VIEW_MODE));

    const [para, table] = state.root.children;
    if (!isSerializedParaNode(para)) throw new Error("no para node found");
    if (!isSerializedImmutableTableNode(table)) throw new Error("no table node found");
    const row = table.children[0];
    if (!isSerializedImmutableTableRowNode(row)) throw new Error("no table row found");
    const cell = row.children.find(isSerializedImmutableTableCellNode);
    if (!cell) throw new Error("no table cell found");

    // The para prefix is the reference shape the other two must match.
    const paraSeparator = separatorOf(para.children);
    expect(paraSeparator.text).toBe(NBSP);
    expect(paraSeparator.mode).toBe("token");
    expect(paraSeparator[NODE_STATE_KEY]).toEqual({ textType: MARKER_TRAILING_SPACE_TEXT_TYPE });

    // Labelled so a failure names which of the two diverged.
    const shapes = [
      ["row", separatorOf(row.children)],
      ["cell", separatorOf(cell.children)],
    ] as const;
    expect(
      shapes.map(([name, separator]) => [
        name,
        separator.text,
        separator.mode,
        separator[NODE_STATE_KEY],
      ]),
    ).toEqual([
      ["row", NBSP, "token", { textType: MARKER_TRAILING_SPACE_TEXT_TYPE }],
      ["cell", NBSP, "token", { textType: MARKER_TRAILING_SPACE_TEXT_TYPE }],
    ]);
  });
});
