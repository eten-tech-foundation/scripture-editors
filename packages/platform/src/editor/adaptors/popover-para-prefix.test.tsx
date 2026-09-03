/**
 * A host surface that scaffolds its document with a wrapper paragraph must be able to suppress
 * that paragraph's marker prefix.
 *
 * The footnote-editor popover loads a one-paragraph scaffold document — a single `{ type: "para" }`
 * carrying NO marker — and materializes the note being edited inside it. The scaffold is a
 * rendering device, not part of the footnote: the save path reads the note subtree alone, so the
 * paragraph never reaches the file. But in editable marker mode `createPara` defaults the
 * marker-less para to `\p` and injects a visible glyph + NBSP separator, so the popover shows a
 * `\p ` prefix in front of the footnote's own text.
 *
 * `showParaMarkerPrefixes: false` suppresses that prefix at the ADAPTOR level, so the glyph bytes
 * are never built. That is what keeps the "displayed bytes are the document" invariant intact:
 * hiding the glyph with CSS instead would leave editable-but-invisible bytes that the caret could
 * traverse into.
 */
import Editorial from "../../Editorial";
import { EditorOptions, EditorRef } from "../editor.model";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { act, render } from "@testing-library/react";
import { createRef } from "react";
import { $getRoot, $getSelection, $isRangeSelection, ElementNode, LexicalNode } from "lexical";
import { $dfs } from "@lexical/utils";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { getEmbeddedLexicalEditor } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import {
  $isCharNode,
  $isMarkerNode,
  $isNoteNode,
  ImmutableTypedTextNode,
  MARKER_TRAILING_SPACE_TEXT_TYPE,
  NBSP,
  NoteNode,
} from "shared";
import {
  getViewOptions,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  STANDARD_VIEW_MODE,
  ViewOptions,
} from "shared-react";

function requireDefined<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message);
  return value;
}

const standardView = requireDefined(getViewOptions(STANDARD_VIEW_MODE), "standard view options");
const paragraphStructureView = requireDefined(
  getViewOptions(PARAGRAPH_STRUCTURE_VIEW_MODE),
  "paragraph structure view options",
);

/** Options exactly as the footnote popover builds them (host options + expanded notes). */
function popoverOptions(view: ViewOptions): EditorOptions {
  return {
    hasSpellCheck: false,
    markerMenuTrigger: "\\",
    hasExternalUI: true,
    contextMenu: undefined,
    view: { ...view, noteMode: "expanded" },
  };
}

/** The popover's scaffold document — one para, deliberately carrying no marker. */
const PARAGRAPH_USJ: Usj = { type: "USJ", version: "3.1", content: [{ type: "para" }] };

const noteUsj: MarkerObject = {
  type: "note",
  marker: "f",
  caller: "+",
  content: [
    { type: "char", marker: "fr", content: ["1:1 "] },
    { type: "char", marker: "ft", content: ["the footnote body"] },
  ],
};

/** The scaffold with the edited note already inside it — the popover's loaded state. */
const PARAGRAPH_USJ_WITH_NOTE: Usj = {
  type: "USJ",
  version: "3.1",
  content: [{ type: "para", content: [noteUsj] }],
};

const scrRef = { book: "GEN", chapterNum: 1, verseNum: 1 };

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

/** The scaffold paragraph — the root's only child. */
function $scaffoldPara(): ElementNode {
  const children = $getRoot().getChildren();
  expect(children).toHaveLength(1);
  const para = children[0];
  if (!(para instanceof ElementNode)) throw new Error("expected an element scaffold paragraph");
  return para;
}

/** Nodes the adaptor builds ONLY to display a paragraph's marker: the glyph and its separator. */
function paraPrefixNodes(para: ElementNode): LexicalNode[] {
  return para
    .getChildren()
    .filter(
      (child) =>
        $isMarkerNode(child) ||
        child instanceof ImmutableTypedTextNode ||
        child.getTextContent() === NBSP,
    );
}

function $findNote(): NoteNode {
  const note = $dfs($getRoot())
    .map(({ node }) => node)
    .find($isNoteNode);
  return requireDefined(note, "note node");
}

describe("scaffolding paragraph marker prefix", () => {
  it("renders the `\\p` prefix by default in editable marker mode (the current behavior)", async () => {
    const { lexical } = await renderEditor(popoverOptions(standardView), PARAGRAPH_USJ);

    lexical.getEditorState().read(() => {
      const para = $scaffoldPara();
      // The glyph plus its NBSP separator token.
      expect(paraPrefixNodes(para)).toHaveLength(2);
      expect(para.getTextContent()).toBe(`\\p${NBSP}`);
    });
  });

  it("renders no prefix nodes for the scaffold paragraph when para marker prefixes are off", async () => {
    const { lexical } = await renderEditor(
      popoverOptions({ ...standardView, showParaMarkerPrefixes: false }),
      PARAGRAPH_USJ,
    );

    lexical.getEditorState().read(() => {
      const para = $scaffoldPara();
      expect(paraPrefixNodes(para)).toEqual([]);
      expect(para.getChildren()).toEqual([]);
      expect(para.getTextContent()).toBe("");
    });
  });

  it("starts the popover text with the footnote's own glyph, not `\\p`", async () => {
    const { lexical } = await renderEditor(
      popoverOptions({ ...standardView, showParaMarkerPrefixes: false }),
      PARAGRAPH_USJ_WITH_NOTE,
    );

    lexical.getEditorState().read(() => {
      const para = $scaffoldPara();
      expect(para.getTextContent().startsWith("\\p")).toBe(false);
      expect(para.getTextContent().startsWith("\\f")).toBe(true);
      // The note is the paragraph's first child — nothing precedes it.
      expect($isNoteNode(para.getFirstChildOrThrow())).toBe(true);
    });
  });

  it("leaves the caret nowhere to sit outside the note (no invisible bytes to traverse)", async () => {
    const { lexical } = await renderEditor(
      popoverOptions({ ...standardView, showParaMarkerPrefixes: false }),
      PARAGRAPH_USJ_WITH_NOTE,
    );

    // Every text node in the document belongs to the note: there is no separator token and no
    // marker glyph at paragraph level for the caret to land in.
    lexical.getEditorState().read(() => {
      const note = $findNote();
      const strays = $getRoot()
        .getAllTextNodes()
        .filter((text) => !note.isParentOf(text));
      expect(strays).toEqual([]);
      // Nothing is left carrying the engine's marker-separator token type.
      expect(
        $getRoot()
          .getAllTextNodes()
          .filter((text) => text.getType() === MARKER_TRAILING_SPACE_TEXT_TYPE),
      ).toEqual([]);
    });

    // Moving the caret to the very start of the paragraph puts it inside the note.
    await act(async () => {
      lexical.update(() => {
        $scaffoldPara().selectStart();
      });
    });
    lexical.getEditorState().read(() => {
      const note = $findNote();
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      const focusNode = selection.focus.getNode();
      expect(focusNode === note || note.isParentOf(focusNode)).toBe(true);
    });
  });

  it("stays prefix-less through the applyUpdate load path and later edits (no re-materialization)", async () => {
    // The popover's REAL load path is not `defaultUsj` — the host sources a note op and the
    // popover materializes it via `applyUpdate` into the empty scaffold. That update dirties the
    // scaffold paragraph, and the marker-edit engine's paragraph transform treats a prefix-less
    // paragraph as "the user deleted the marker glyph" and re-injects a fresh `\p` prefix — so
    // suppressing the prefix at the adaptor alone is not enough: the engine must also stand down.
    const optionsOff = popoverOptions({ ...standardView, showParaMarkerPrefixes: false });
    const source = await renderEditor(optionsOff, PARAGRAPH_USJ_WITH_NOTE);
    const noteOps = requireDefined(source.editorRef.getNoteOps(0), "source note ops");
    expect(noteOps).toHaveLength(1);

    const popover = await renderEditor(optionsOff, PARAGRAPH_USJ);
    await act(async () => {
      popover.editorRef.applyUpdate([noteOps[0]]);
    });

    popover.lexical.getEditorState().read(() => {
      const para = $scaffoldPara();
      expect(paraPrefixNodes(para)).toEqual([]);
      // The note is the paragraph's ONLY child — nothing was re-materialized around it.
      expect(para.getChildren().filter((child) => !$isNoteNode(child))).toEqual([]);
      expect(para.getTextContent().startsWith("\\f")).toBe(true);
    });

    // A later edit inside the note dirties the paragraph again (ancestors of a dirty leaf are
    // dirty elements) and re-runs the paragraph transform — the prefix must stay suppressed.
    await act(async () => {
      popover.lexical.update(() => {
        const note = $findNote();
        const ftChar = note
          .getChildren()
          .filter($isCharNode)
          .find((char) => char.getMarker() === "ft");
        const contentText = requireDefined(ftChar, "ft char")
          .getAllTextNodes()
          .find((child) => !$isMarkerNode(child));
        const text = requireDefined(contentText, "ft content text");
        text.setTextContent(`${text.getTextContent()} edited`);
      });
    });
    popover.lexical.getEditorState().read(() => {
      const para = $scaffoldPara();
      expect(paraPrefixNodes(para)).toEqual([]);
      expect(para.getChildren().filter((child) => !$isNoteNode(child))).toEqual([]);
    });
  });

  it("suppresses the gutter paragraph marker too, so no surface renders the scaffold marker", async () => {
    const { lexical } = await renderEditor(
      popoverOptions({ ...paragraphStructureView, showParaMarkerPrefixes: false }),
      PARAGRAPH_USJ,
    );

    lexical.getEditorState().read(() => {
      expect(paraPrefixNodes($scaffoldPara())).toEqual([]);
    });
  });

  it("still renders prefixes for real paragraphs when the option is absent", async () => {
    const realUsj: Usj = {
      type: "USJ",
      version: "3.1",
      content: [{ type: "para", marker: "q1", content: ["poetry"] }],
    };
    const { lexical } = await renderEditor(popoverOptions(standardView), realUsj);

    lexical.getEditorState().read(() => {
      expect($scaffoldPara().getTextContent()).toBe(`\\q1${NBSP}poetry`);
    });
  });
});
