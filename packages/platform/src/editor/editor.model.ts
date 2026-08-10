import { MarkerMenuContext, MarkerMenuItem } from "./markerMenu/markerItemSource";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { RefObject } from "react";
import {
  LoggerBasic,
  StyleInfo,
  TypedMarkOnClick,
  TypedMarkOnMouseEnter,
  TypedMarkOnMouseLeave,
  TypedMarkOnRemove,
} from "shared";
import {
  AnnotationRange,
  ContextMenuOptionConfig,
  DeltaOp,
  DeltaSource,
  SelectionRange,
  StateChangeSnapshot,
  TextDirection,
  UsjNodeOptions,
  ViewOptions,
} from "shared-react";

/**
 * In-progress input an in-editor command surface has declared to the editor. `kind` names the shape
 * of the claim so more can be added without widening the method; `run` is the exact byte sequence
 * the surface expects to find immediately before the caret.
 *
 * @public
 */
export type TransientInput = { kind: "marker-literal"; run: string };

/**
 * Forward reference for the editor.
 *
 * @public
 */
export interface EditorRef {
  /** Focus the editor. */
  focus(): void;
  /**
   * Whether this editor's content-editable root currently holds DOM focus (i.e. the user is
   * actively editing in it). Resolves the actual root element of THIS editor instance, so hosts
   * do not have to guess it from a global `document.querySelector('.editor-input')` — a query
   * coupled to the CSS class name and to the main editor being the first `.editor-input` in
   * document order (a footnote-editor popover renders its own). Returns `false` when the editor
   * is unmounted or its root is not attached.
   */
  isFocused(): boolean;
  /** Undo the last action. */
  undo(): void;
  /** Redo the last undone action. */
  redo(): void;
  /** Cut the selected text. */
  cut(): void;
  /** Copy the selected text. */
  copy(): void;
  /** Paste text at the current cursor position. */
  paste(): void;
  /** Paste text as plain text at the current cursor position. */
  pastePlainText(): void;
  /**
   * Get USJ Scripture data — always SETTLED, whatever the screen currently shows mid-edit. In
   * editable marker modes a marker rename, a typed marker literal, or an edited display run stays
   * pending in the document until the caret departs; this returns the document those bytes MEAN
   * (the same re-tokenization a departure settle performs), computed without touching the editor,
   * so the user's edit stays pending on screen and their caret and undo history are untouched.
   * Settling is uniform: a half-typed `|stuf` settles to literal content, because that is what
   * those bytes mean to anything that parses them.
   */
  getUsj(): Usj | undefined;
  /**
   * Settle pending mid-edit marker text (Standard view's marker-editing engine) IN THE DOCUMENT,
   * so the screen shows the finished structure. NOT required before reading the USJ to save —
   * {@link EditorRef.getUsj} already returns settled output — so a host that only needs canonical
   * USJ should not call this at all: it mutates the document, which pushes a history entry and can
   * re-settle content the user just undid.
   *
   * Two carve-outs: while the app-placed-caret suppression window is armed (the caret was placed
   * by a programmatic scrRef move or an undo/redo restore, with no user gesture since), NOTHING
   * settles — the whole pending set stays pending, so a save-driven commit cannot re-settle
   * content the user just undid; pending literals serialize as literal bytes, which ParatextData
   * parses. Outside the window, everything settles except the node under a live caret (only while
   * the editor holds DOM focus) — a mid-typing pause never settles under the user.
   *
   * Do NOT call while a marker-menu/palette session is open: the palette's apply must be the
   * one to consume the typed literal. No-op outside editable marker modes.
   */
  commitPendingMarkerEdits(): void;
  /**
   * Declares in-progress input that an in-editor command surface (e.g. the marker palette) will
   * consume or discard — analogous to an IME composition string. While declared,
   * {@link EditorRef.getUsj} excludes these bytes from its settled output: the containing paragraph
   * settles as if they were absent. Editor state, on-screen content, `onUsjChange`, and OT deltas
   * are untouched. One declaration at a time; calling again replaces it; `undefined` clears it.
   *
   * The declaration is ADVISORY. It is re-verified against the live caret at every `getUsj()`, and
   * ignored whenever it does not hold — the caret moved off the node, the bytes immediately before
   * the caret are not exactly `run`, the node is gone, or the caller forgot to clear. A stale
   * declaration therefore costs at most one save carrying a visible phantom marker; it can never
   * silently drop content the user typed. Callers should still clear it as soon as the input is
   * consumed or the surface closes.
   */
  setTransientInput(input: TransientInput | undefined): void;
  /** Set the USJ Scripture data. */
  setUsj(usj: Usj): void;
  /** EXPERIMENTAL: Apply Operational Transform delta update. */
  applyUpdate(ops: DeltaOp[], source?: DeltaSource): void;
  /**
   * EXPERIMENTAL: Replace an embed Operational Transform delta.
   *
   * @remarks Embed nodes are treated as atomic units. These include chapter nodes, verse nodes,
   *   milestone nodes, note nodes, and unmatched nodes.
   *
   * @param embedNodeKey - The editor key of the embed node to replace.
   * @param insertEmbedOps - The delta operations that insert the new embed node.
   */
  replaceEmbedUpdate(embedNodeKey: string, insertEmbedOps: DeltaOp[]): void;
  /**
   * Get the selection location or range.
   * @returns the selection location or range, or `undefined` if there is no selection. The
   *   json-path in the selection assumes no comment Milestone nodes are present in the USJ.
   */
  getSelection(): SelectionRange | undefined;
  /**
   * Set the selection location or range.
   * @param selection - A selection location or range. The json-path in the selection assumes no
   *   comment Milestone nodes are present in the USJ.
   */
  setSelection(selection: SelectionRange): void;
  /**
   * Set an ephemeral annotation with optional event callbacks.
   *
   * @param selection - An annotation range containing the start and end location. The json-path
   *   in an annotation location assumes no comment Milestone nodes are present in the USJ.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   * @param callbacks - Optional click / removal / hover handlers. Each is independently
   *   optional. Omit the argument entirely to register an annotation with no callbacks.
   */
  setAnnotation(
    selection: AnnotationRange,
    type: string,
    id: string,
    callbacks?: {
      onClick?: TypedMarkOnClick;
      onRemove?: TypedMarkOnRemove;
      onMouseEnter?: TypedMarkOnMouseEnter;
      onMouseLeave?: TypedMarkOnMouseLeave;
    },
  ): void;
  /**
   * Set an ephemeral annotation with positional click / remove handlers.
   *
   * @deprecated Pass a callbacks object instead. This positional form is preserved for backward
   *   compatibility and will be removed in a future release.
   *
   * @param selection - An annotation range containing the start and end location.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   * @param onClick - Optional onClick handler.
   * @param onRemove - Optional onRemove handler.
   */
  setAnnotation(
    selection: AnnotationRange,
    type: string,
    id: string,
    onClick?: TypedMarkOnClick,
    onRemove?: TypedMarkOnRemove,
  ): void;
  /**
   * Remove an ephemeral annotation.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   */
  removeAnnotation(type: string, id: string): void;
  /** Format the paragraph at the current cursor position with the given block marker. */
  formatPara(blockMarker: string): void;
  /** Get the editor element for the given node key, if any. */
  getElementByKey(nodeKey: string): HTMLElement | undefined;
  /**
   * Insert a marker at the current editor selection, replicating the behavior of the
   * built-in marker menu. Works with both collapsed (insertion point) and range selections.
   *
   * @param marker - A USFM marker string, e.g. `"wj"`, `"p"`, `"f"`, `"v"`, `"c"`.
   * @returns the freshly-inserted note's true Lexical node key when `marker` is a note marker
   *   (e.g. `"f"`, `"x"`, `"fe"`); `undefined` for every other marker kind.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if the `scrRef` prop was not provided to the editor.
   * @throws Will throw an error if the marker is not a supported para, char, note, chapter, or
   *   verse marker.
   */
  insertMarker(marker: string): string | undefined;
  /**
   * Snapshot of the marker-menu context at the current selection (standard-view marker menus).
   * Returns undefined when the editor is readonly or has no range selection.
   */
  getMarkerMenuContext():
    | (MarkerMenuContext & { anchorRect?: { x: number; y: number; width: number; height: number } })
    | undefined;
  /**
   * Apply a marker-menu selection at the current editor selection (standard-view `\`/Enter
   * marker menus). Mirrors PT9's `MarkerDropdownEditHandler`/`KeyPressEditHandler` apply step:
   * paragraph/character/note kinds run the structural insert action used by
   * {@link EditorRef.insertMarker} (optionally cleaning up a literal `\marker` trigger prefix
   * typed before the caret); `closeTag` kind closes the matching open character span instead.
   *
   * @param item - The selected marker-menu item (from {@link getMarkerMenuItems} /
   *   {@link getEnterMenuItems}).
   * @param opts - `trigger` is which UI trigger produced the menu (`"backslash"` or `"enter"`).
   *   `literalPrefixLanded` is whether a literal `\marker` trigger prefix was typed before the
   *   caret and must be deleted before applying the action; ignored for `closeTag` items.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if the `scrRef` prop was not provided to the editor.
   * @throws Will throw an error if `item.kind` is not `"closeTag"` and `item.marker` is not a
   *   supported para, char, note, chapter, or verse marker.
   *
   * @returns the created note's TRUE Lexical node key when the applied item inserted a note
   *   (hosts use it to track the note-editing session — the same contract as
   *   {@link EditorRef.insertMarker}); `undefined` for every other item kind.
   */
  applyMarkerMenuSelection(
    item: MarkerMenuItem,
    opts: { trigger: "backslash" | "enter"; literalPrefixLanded: boolean },
  ): string | undefined;
  /**
   * Splits the paragraph at the current caret, giving the new paragraph `marker` with its
   * visible prefix injected in the same update (standard-view Enter-triggered marker menu
   * apply step).
   *
   * @param marker - A USFM paragraph marker string, e.g. `"q1"`, `"p"`.
   * @throws Will throw an error if the editor is in readonly mode.
   */
  splitParagraphWithMarker(marker: string): void;
  /**
   * Insert a note at the specified selection, e.g. footnote, cross-reference, endnote.
   * @param marker - The marker type for the note.
   * @param caller - Optional note caller to override the default for the given marker.
   * @param selection - Optional selection range where the note should be inserted. By default it
   *   will use the current selection in the editor.
   * @throws Will throw an error if the marker is not a valid note marker.
   *
   * @deprecated Use {@link EditorRef.insertMarker} instead. `insertMarker` supports note markers
   *   and additionally provides readonly and scrRef guards.
   */
  insertNote(marker: string, caller?: string, selection?: SelectionRange): void;
  /**
   * EXPERIMENTAL: Select the note by editor key or at the given index in the editor, if any.
   * @param noteKeyOrIndex - The note key or index, e.g. index=1 would select the second note in the
   *   editor.
   */
  selectNote(noteKeyOrIndex: string | number): void;
  /**
   * EXPERIMENTAL: Get the note operations by editor key or at the given index in the editor, if any.
   * @param noteKeyOrIndex - The note key or index, e.g. index=1 would get the second note in the
   *   editor.
   */
  getNoteOps(noteKeyOrIndex: string | number): DeltaOp[] | undefined;
  /** Ref to the end of the toolbar - INTERNAL USE ONLY to dynamically add controls in the toolbar. */
  toolbarEndRef: RefObject<HTMLElement | null> | null;
}

/**
 * Props for the Editor component that provides Scripture editing functionality.
 *
 * @public
 */
export interface EditorProps<TLogger extends LoggerBasic> {
  /** Initial Scripture data in USJ format. */
  defaultUsj?: Usj;
  /** Scripture reference that controls the general cursor location of the Scripture. */
  scrRef?: SerializedVerseRef;
  /** Callback function when the Scripture reference has changed. */
  onScrRefChange?: (scrRef: SerializedVerseRef) => void;
  /** Callback function when the cursor selection changes. */
  onSelectionChange?: (selection: SelectionRange | undefined) => void;
  /** Callback function when USJ Scripture data has changed. */
  onUsjChange?: (usj: Usj, ops?: DeltaOp[], source?: DeltaSource, insertedNodeKey?: string) => void;
  /** Callback function when state changes. */
  onStateChange?: ({ canUndo, canRedo, blockMarker, contextMarker }: StateChangeSnapshot) => void;
  /** Options to configure the editor. */
  options?: EditorOptions;
  /** Logger instance. */
  logger?: TLogger;
}

/**
 * Options to configure the editor.
 *
 * @public
 */
export interface EditorOptions {
  /** Is the editor readonly or editable. */
  isReadonly?: boolean;
  /** When true, paragraph and verse markers cannot be changed via keyboard input. */
  isStructureProtected?: boolean;
  /** Does the editor have external UI controls so disable the built-in toolbar and marker menu. */
  hasExternalUI?: boolean;
  /** Is the editor enabled for spell checking. */
  hasSpellCheck?: boolean;
  /** Text direction: "ltr" | "rtl" | "auto". */
  textDirection?: TextDirection;
  /** Key to trigger the marker menu. Defaults to '\'. */
  markerMenuTrigger?: string;
  /** Options for some editor nodes. */
  nodes?: UsjNodeOptions;
  /** Additional items to append to the editor context menu. */
  contextMenu?: ContextMenuOptionConfig[];
  /**
   * View options of the editor. Defaults to the formatted view mode. Named modes:
   * "formatted", "unformatted", "paragraph-structure", "standard".
   */
  view?: ViewOptions;
  /**
   * Project stylesheet data (merged usfm.sty + custom.sty, serialized by the
   * host). Drives marker classification, Tier-1 kind routing, and marker
   * validation (flagging unknown or invalid markers) in editable marker modes.
   * Falls back to the bundled default stylesheet data when absent.
   */
  styleInfo?: StyleInfo;
  /** EXPERIMENTAL: Is the editor being debugged using the TreeView. */
  debug?: boolean;
}
