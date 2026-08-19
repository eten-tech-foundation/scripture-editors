/**
 * Shared harness for the settled-output suites: one Standard-view `Editor` mount behind its public
 * `EditorRef`, plus the raw Lexical editor the tests drive edits through. A plain helper module
 * rather than an export from one of the suites, so a suite that needs it does not re-register the
 * other suite's tests by importing it.
 */
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "./adaptors/usj-editor.adaptor";
import Editor from "./Editor";
import { EditorProps, EditorRef } from "./editor.model";
import { $rebuildNoteContent, $rebuildParas, Tier2Context } from "./markerEdit/tier2Rebuild.utils";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { act, render } from "@testing-library/react";
import { $getRoot, $isElementNode, LexicalEditor, LexicalNode } from "lexical";
import { createRef, ReactElement, RefObject } from "react";
import {
  $isNoteNode,
  $isParaNode,
  getMarker as bundledGetMarker,
  LoggerBasic,
  NoteNode,
  TypedMarkNode,
} from "shared";
import { getViewOptions, STANDARD_VIEW_MODE, usjReactNodes, ViewOptions } from "shared-react";
import { expect } from "vitest";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../libs/shared/src/nodes/usj/test.utils";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing asserts on), same as the marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function") {
  Range.prototype.getBoundingClientRect = function (): DOMRect {
    return {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      toJSON() {
        return this;
      },
    };
  };
}

// jsdom's `HTMLElement.focus()` unconditionally collapses the document Selection to the start of
// the focused element; a real browser PRESERVES an existing in-element selection across `focus()`.
// Lexical's `updateDOMSelection` calls `rootElement.focus({ preventScroll: true })` on its "the DOM
// selection already matches the target" branch (a cursor-visibility ensure-focus) whenever the root
// isn't `document.activeElement` — which, after a mutating update that leaves the caret unmoved
// (the marker-edit engine's deferred settle pass), is exactly the branch taken. In a browser that
// call is a no-op for the selection; in jsdom it wipes the caret the reconcile just confirmed, and
// a later deferred native `selectionchange` reads the collapsed-to-start selection back into the
// editor state — so a correctly restored caret silently becomes "start of the first block".
// Restoring the pre-focus range models the browser and keeps the caret where Lexical put it.
// (`ScriptureReferencePlugin.test.tsx` carries its own copy of this shim for the same reason.)
const originalFocus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function focus(options?: FocusOptions) {
  const selection = document.getSelection();
  const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined;
  originalFocus.call(this, options);
  if (savedRange && selection) {
    selection.removeAllRanges();
    selection.addRange(savedRange);
  }
};

/** The editor's host-facing change-notification callback type. */
type OnUsjChange = EditorProps<LoggerBasic>["onUsjChange"];

export function requireStandardViewOptions(): ViewOptions {
  const options = getViewOptions(STANDARD_VIEW_MODE);
  if (!options) throw new Error("Standard view options are required for these tests.");
  return options;
}

/** Standard view options with `noteMode: "expanded"` — see `mountExpandedNoteEditor`'s doc
 * comment for why an expanded note needs a dedicated view. */
function expandedNoteViewOptions(): ViewOptions {
  return { ...requireStandardViewOptions(), noteMode: "expanded" };
}

export const spanUsj: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["GEN"] },
    { type: "chapter", marker: "c", number: "1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "start ",
        { type: "char", marker: "nd", content: ["name"] },
        " end",
      ],
    },
    { type: "para", marker: "p", content: ["a second paragraph to depart to"] },
  ],
};

async function mountEditor(
  usj: Usj,
  view: ViewOptions,
  onUsjChange?: OnUsjChange,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  const ref = createRef<EditorRef>();
  const lexicalRef = createRef<LexicalEditor>();
  const capture: ReactElement = <EditorRefPlugin editorRef={lexicalRef} />;
  await act(async () => {
    render(
      <Editor ref={ref} defaultUsj={usj} options={{ view }} onUsjChange={onUsjChange}>
        {capture}
      </Editor>,
    );
  });
  if (!lexicalRef.current) throw new Error("lexical editor was not captured");
  return { ref, lexical: lexicalRef.current };
}

/**
 * Mount `Editor` in Standard view and hand back its public ref plus the raw Lexical editor.
 *
 * `onUsjChange` is optional and wires the editor's host-facing change notification — the callback a
 * host (paranext-core's Scripture editor web view) subscribes to in order to schedule a save. Pass
 * it when a test needs to observe that a document change actually REACHED the host, as distinct
 * from merely being true of the editor's own state.
 */
export async function mountStandardViewEditor(
  usj: Usj,
  onUsjChange?: OnUsjChange,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  return mountEditor(usj, requireStandardViewOptions(), onUsjChange);
}

/**
 * Like `mountStandardViewEditor`, but with `noteMode: "expanded"` — needed for any shape whose
 * pend targets a note's own glyph or its inline-editable content, both of which require the
 * note's content to be genuinely inline-editable in the mounted editor (the default Standard view
 * collapses notes to a caller preview, never inline-editable).
 */
export async function mountExpandedNoteEditor(
  usj: Usj,
): Promise<{ ref: RefObject<EditorRef | null>; lexical: LexicalEditor }> {
  return mountEditor(usj, expandedNoteViewOptions());
}

/** Load `usj` into a fresh headless editor under `viewOptions`; mirrors
 * tier2Rebuild.corpus.test.tsx's `loadEditor`. */
function loadHeadless(usj: Usj, viewOptions: ViewOptions): LexicalEditor {
  initializeSerialize(undefined, undefined);
  reset();
  const state = serializeEditorState(usj, viewOptions);
  const { editor } = createBasicTestEnvironment([TypedMarkNode, ...usjReactNodes]);
  editor.setEditorState(editor.parseEditorState(JSON.stringify({ root: state.root })));
  return editor;
}

/** Every NoteNode under `nodes`, depth-first — mirrors tier2Rebuild.corpus.test.tsx's
 * `$collectParas` collection style, for the note-scope half of `expectTier2FixedPoint`. */
function $collectNotes(nodes: LexicalNode[], out: NoteNode[] = []): NoteNode[] {
  for (const node of nodes) {
    if ($isNoteNode(node)) out.push(node);
    if ($isElementNode(node)) $collectNotes(node.getChildren(), out);
  }
  return out;
}

/**
 * Assert `usj` is a Tier-2 fixed point: re-loaded on its own, every paragraph REFUSES a
 * `$rebuildParas` rebuild (returns false) and mutates nothing. Anything else means a consumer was
 * handed USJ that still had settling left in it, which is the standing acceptance for settled
 * output.
 *
 * `$rebuildParas` alone is not the whole property: it treats a NoteNode as one opaque sentinel and
 * never looks inside it (`$isRebuildSentinel`, tier2Rebuild.utils.ts), so a note's own CONTENT is a
 * separate re-tokenization scope with no fixed-point coverage from the paragraph walk alone. Every
 * EXPANDED note in the reloaded tree is additionally driven through `$rebuildNoteContent`
 * (mirroring `$rebuildParas`'s own refusal expectation) to close that gap. A COLLAPSED note is
 * skipped, not asserted on: `$buildNoteFragment` always refuses a collapsed note regardless of
 * content, so calling `$rebuildNoteContent` on one would only prove that guard rail exists, not
 * anything about settled output.
 *
 * `expandedNotes` must match how `usj` would actually be displayed for any note it carries — the
 * same flag `PendingShape.expandedNotes` (settledGetUsj.test.tsx) already threads into
 * `mountStandardViewEditor`/`mountExpandedNoteEditor` for the live mount this settled output came
 * from, so this reload sees the SAME note layout the original edit did.
 */
export function expectTier2FixedPoint(usj: Usj, expandedNotes = false): void {
  const viewOptions = expandedNotes ? expandedNoteViewOptions() : requireStandardViewOptions();
  const headless = loadHeadless(usj, viewOptions);
  const context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };
  const changed: string[] = [];
  headless.update(
    () => {
      $getRoot()
        .getChildren()
        .filter($isParaNode)
        .forEach((para, index) => {
          if ($rebuildParas([para], context)) changed.push(`#${index} \\${para.getMarker()}`);
        });
      $collectNotes($getRoot().getChildren())
        .filter((note) => note.getIsCollapsed() === false)
        .forEach((note, index) => {
          if ($rebuildNoteContent(note, context))
            changed.push(`note#${index} \\${note.getMarker()}`);
        });
    },
    { discrete: true },
  );
  expect(changed).toEqual([]);
}
