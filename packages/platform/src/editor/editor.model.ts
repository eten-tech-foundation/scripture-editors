import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { RefObject } from "react";
import {
  LoggerBasic,
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
  StructureProtectionMode,
  TextDirection,
  UsjNodeOptions,
  ViewOptions,
} from "shared-react";

/**
 * Forward reference for the editor.
 *
 * @public
 */
export interface EditorRef {
  /** Focus the editor. */
  focus(): void;
  /** Undo the last action. */
  undo(): void;
  /** Redo the last undone action. */
  redo(): void;
  /**
   * Cut the selected text.
   * @throws Will throw an error if the editor is in readonly mode or uses the block verse layout
   *   (`ViewOptions.verseLayout: "block"`), which is read-only by construction.
   */
  cut(): void;
  /** Copy the selected text. */
  copy(): void;
  /**
   * Paste text at the current cursor position.
   * @throws Will throw an error if the editor is in readonly mode or uses the block verse layout
   *   (`ViewOptions.verseLayout: "block"`), which is read-only by construction.
   */
  paste(): void;
  /**
   * Paste text as plain text at the current cursor position.
   * @throws Will throw an error if the editor is in readonly mode or uses the block verse layout
   *   (`ViewOptions.verseLayout: "block"`), which is read-only by construction.
   */
  pastePlainText(): void;
  /** Get USJ Scripture data. */
  getUsj(): Usj | undefined;
  /** Set the USJ Scripture data. */
  setUsj(usj: Usj): void;
  /**
   * EXPERIMENTAL: Apply Operational Transform delta update.
   *
   * @remarks
   * Delta ops address content by its position in the USJ, which the block verse layout
   * (`ViewOptions.verseLayout: "block"`) regroups, so they cannot be applied there. A `"remote"`
   * update is reported through the logger and dropped rather than thrown, so a collaborator's op
   * loop is not torn down; refresh such a view by handing it new USJ instead.
   *
   * @throws Will throw an error if the editor uses the block verse layout and `source` is
   *   `"local"`.
   */
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
   *
   * @remarks
   * Always returns `undefined` in the block verse layout (`ViewOptions.verseLayout: "block"`):
   * it splits a paragraph spanning verses across their blocks, so the editor's content indexes no
   * longer match the source USJ's and no location can be expressed. The editor reports this once
   * through its logger.
   *
   * @returns the selection location or range, or `undefined` if there is no selection. The
   *   json-path in the selection assumes no comment Milestone nodes are present in the USJ.
   */
  getSelection(): SelectionRange | undefined;
  /**
   * Set the selection location or range.
   *
   * @remarks
   * Does nothing in the block verse layout, for the reason given on
   * {@link EditorRef.getSelection}.
   *
   * @param selection - A selection location or range. The json-path in the selection assumes no
   *   comment Milestone nodes are present in the USJ.
   */
  setSelection(selection: SelectionRange): void;
  /**
   * Set an ephemeral annotation with optional event callbacks.
   *
   * @remarks
   * Does nothing in the block verse layout (`ViewOptions.verseLayout: "block"`): an annotation is
   * addressed by USJ location, which that layout cannot express - see
   * {@link EditorRef.getSelection}. The failure is reported through the logger.
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
  /**
   * Format the paragraph at the current cursor position with the given block marker.
   * @throws Will throw an error if the editor is in readonly mode or uses the block verse layout
   *   (`ViewOptions.verseLayout: "block"`), which is read-only by construction.
   */
  formatPara(blockMarker: string): void;
  /** Get the editor element for the given node key, if any. */
  getElementByKey(nodeKey: string): HTMLElement | undefined;
  /**
   * Remove a character marker from the current editor selection, keeping its text content.
   *
   * Returns whether a marker was actually removed, so a caller can tell a real removal from a
   * refused or unmatched one. Works with both collapsed (removes the marker from the whole
   * enclosing marker) and range (splits the marker, leaving the uncovered text marked) selections.
   *
   * Returns `false` and does nothing, without throwing, when there is no matching character marker
   * enclosing the selection, when the selection is inside a note, when the removal could not be
   * confined to the selection (see below), or when there is no active selection at all. In every
   * one of those cases the document and the selection are left untouched — no undo entry is added.
   *
   * @remarks
   * Two narrowed edge cases, both preserving every character of the document's text content:
   *
   * - Nested markers: text left uncovered by the selection keeps its marker. Inner and outer
   *   markers of a nested pair can each be removed independently while the selection covers them
   *   fully. When a range selection covers only *part* of a nested character marker's text and the
   *   *outer* marker is the one being removed, the request is refused and the document is left
   *   unchanged: recursive splitting of a nested marker's text is not implemented, so the marker
   *   could only be removed from that nested marker's entire span, including text the caller never
   *   selected. Refusing keeps the guarantee that removal never alters unselected text.
   * - Marker display modes (paragraph structure and unformatted views): the marker's own visible
   *   representation is stripped from the span the marker is removed from, but when a range
   *   selection leaves unselected text between a marker's boundary and the selection, the marked
   *   sibling that keeps that unselected text is left with an unpaired marker half — a literal
   *   opening or closing marker (e.g. `\nd` or `\nd*`) stays visible in the editor. This is a
   *   presentation artifact only: it is excluded from USJ export and self-corrects the next time
   *   the document is loaded from USJ.
   *
   * @param marker - A USFM character marker string, e.g. `"nd"`, `"wj"`. Omit to remove the
   *   innermost character marker enclosing the selection. Footnote and cross-reference character
   *   markers (e.g. `"ft"`, `"xt"`) are not supported: they only occur inside notes, which removal
   *   skips, so they throw rather than silently doing nothing.
   * @returns `true` if a character marker was removed, `false` if the request was a no-op.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if `marker` is given and is not a supported character marker.
   */
  removeCharacterMarker(marker?: string): boolean;
  /**
   * Replace the character marker on the current editor selection, keeping its text content.
   *
   * Returns whether a marker was actually changed, so a caller can tell a real replacement from a
   * refused or unmatched one. Works with both collapsed (changes the whole enclosing marker) and
   * range (splits the marker, leaving the uncovered text with its original marker) selections.
   *
   * Returns `false` and does nothing, without throwing, when there is no matching character marker
   * enclosing the selection, when that marker is already `toMarker`, when the selection is inside a
   * note, when the change could not be confined to the selection (see below), or when there is no
   * active selection at all. In every one of those cases the document and the selection are left
   * untouched — no undo entry is added.
   *
   * @remarks
   * Nested markers: text left uncovered by the selection keeps its original marker, and the inner
   * and outer markers of a nested pair can each be changed independently while the selection covers
   * them fully. When a range selection covers only *part* of a nested character marker's text and
   * the *outer* marker is the one being changed, the request is refused and the document is left
   * unchanged: recursive splitting of a nested marker's text is not implemented, so the marker
   * could only be changed across that nested marker's entire span, including text the caller never
   * selected. Refusing keeps the guarantee that replacement never alters unselected text.
   *
   * A replaced marker that ends up matching an adjacent sibling's is merged into it automatically.
   * That merge is clean in the default marker mode. In the marker-visible modes (`"editable"` and
   * `"visible"`), the merge can leave each side's synthesized marker text sitting side by side in
   * the interior of the merged node (e.g. `\bd Lord\bd*\bd God\bd*` on screen instead of
   * `\bd Lord God\bd*`). That stray interior marker text is excluded from USJ export and
   * self-corrects the next time the document is loaded from USJ.
   *
   * Also in the marker-visible modes (`"editable"` and `"visible"`): a range selection strictly
   * interior to a marker's text — touching neither its opening nor its closing boundary — leaves the
   * changed run with no visible marker at all, while the unselected text on either side keeps the
   * original marker (e.g. `\nd Lord\nd*` with the middle word changed renders as
   * `\nd Lo\nd*rd\nd \nd*` rather than showing the new marker around the middle). The synthesized
   * marker text lives at the boundaries, so the interior span that the split produces has none to
   * retarget. Like the merge artifact above, this is presentation only: the change is correct in USJ
   * export and self-corrects the next time the document is loaded from USJ.
   *
   * @param toMarker - The USFM character marker to change to, e.g. `"nd"`, `"wj"`. Footnote and
   *   cross-reference character markers (e.g. `"ft"`, `"xt"`) are not supported: they only occur
   *   inside notes, which replacement skips, so they throw rather than silently doing nothing.
   * @param fromMarker - A USFM character marker to match. Omit to change the innermost character
   *   marker enclosing the selection. Subject to the same footnote and cross-reference restriction
   *   as `toMarker`.
   * @returns `true` if a character marker was changed, `false` if the request was a no-op.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if `toMarker` is not a supported character marker.
   * @throws Will throw an error if `fromMarker` is given and is not a supported character marker.
   */
  replaceCharacterMarker(toMarker: string, fromMarker?: string): boolean;
  /**
   * Extend a character marker to cover the whole current editor selection, keeping its text
   * content.
   *
   * "Extend" means *make the whole selection carry `marker`*, however much of it already does —
   * the mutation behind a toolbar's partial → all step. Only the parts of the selection not already
   * carrying `marker` are wrapped, so no nested identical markers are produced: a selection of
   * `kolo ` followed by a bold `Mulu`, extended with `"bd"`, becomes one bold run over the whole
   * thing. A selection with no existing run of `marker` is wrapped in full.
   *
   * Returns whether the document was changed, so a caller can tell a real mutation from a no-op.
   *
   * Returns `false` and does nothing, without throwing, when the selection is collapsed, when it is
   * already fully covered by `marker` and no conflicting marker is present, when it resolves to no
   * editable text (for example inside a note), or when there is no active selection at all. In
   * every one of those cases the document and the selection are left untouched — no undo entry is
   * added.
   *
   * @remarks
   * Text inside a *different* character marker is wrapped where it sits, nesting the new marker
   * inside the existing one. Unlike {@link EditorRef.removeCharacterMarker} and
   * {@link EditorRef.replaceCharacterMarker}, extension never rewrites the markup of text outside
   * the selection, so it has no partial-coverage refusal.
   *
   * A leading space is moved out of a new marker, matching the behavior of
   * {@link EditorRef.insertMarker}; trailing whitespace is left where the selection put it.
   *
   * Newly covered text is merged into an adjacent run carrying the same marker automatically. In
   * the marker-visible modes (`"editable"` and `"visible"`) a newly created run has no visible
   * marker text of its own until the document is reloaded from USJ. That is a presentation artifact
   * only: it is excluded from USJ export and self-corrects on reload. In those same modes, a new
   * wrapper can also absorb a neighboring run's synthesized marker text: the gap filter that finds
   * uncovered text does not exclude a neighbor's opening/closing marker nodes, so extending `"bd"`
   * over `\nd Mulu\nd*` can produce a `bd` run containing `\nd `, `Mulu`, `\nd*` rather than just
   * `Mulu`. Also presentation-only, for the same reason: excluded from USJ export and self-corrects
   * on reload.
   *
   * @param marker - The USFM character marker to extend, e.g. `"bd"`, `"nd"`, `"wj"`. Footnote and
   *   cross-reference character markers (e.g. `"ft"`, `"xt"`) are not supported: they only occur
   *   inside notes, which extension skips, so they throw rather than silently doing nothing.
   * @param conflictingMarkers - Character markers that cannot coexist with `marker`; each is
   *   removed from the selection before it is extended. Omit when nothing conflicts. Supplied by
   *   the caller rather than defined here — which markers are mutually exclusive is a project
   *   decision, not an editor one. Subject to the same footnote and cross-reference restriction as
   *   `marker`. An entry equal to `marker` itself is ignored, since removing and re-wrapping the
   *   same run would only lose that run's identity (e.g. its cid in a collab document) for no
   *   effect.
   * @returns `true` if the document was changed, `false` if the request was a no-op.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if `marker` is not a supported character marker.
   * @throws Will throw an error if any entry of `conflictingMarkers` is not a supported character
   *   marker.
   */
  extendCharacterMarker(marker: string, conflictingMarkers?: readonly string[]): boolean;
  /**
   * Insert a marker at the current editor selection, replicating the behavior of the
   * built-in marker menu. Works with both collapsed (insertion point) and range selections.
   *
   * @param marker - A USFM marker string, e.g. `"wj"`, `"p"`, `"f"`, `"v"`, `"c"`.
   * @throws Will throw an error if the editor is in readonly mode.
   * @throws Will throw an error if the `scrRef` prop was not provided to the editor.
   * @throws Will throw an error if the marker is not a supported para, char, note, chapter, or
   *   verse marker.
   */
  insertMarker(marker: string): void;
  /**
   * Insert a note at the specified selection, e.g. footnote, cross-reference, endnote.
   * @param marker - The marker type for the note.
   * @param caller - Optional note caller to override the default for the given marker.
   * @param selection - Optional selection range where the note should be inserted. By default it
   *   will use the current selection in the editor.
   * @throws Will throw an error if the marker is not a valid note marker.
   * @throws Will throw an error if the editor is in readonly mode or uses the block verse layout
   *   (`ViewOptions.verseLayout: "block"`), which is read-only by construction.
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
  /**
   * Is the editor readonly or editable.
   *
   * Forced to `true` when `view.verseLayout` is `"block"`: that layout regroups verses into blocks
   * and so has no source USJ an edit could be written back to. Passing `false` alongside it is
   * reported through the logger and ignored.
   */
  isReadonly?: boolean;
  /**
   * Structure-protection mode for paragraph/verse markers via keyboard, paste, and drop.
   * - "off": fully native editing, no protection or delete confirmation.
   * - "guarded": two-step intentional delete (first press arms the marker, second press deletes
   *   it); no hard blocking of paste/drop/typing.
   * - "protected": structural keystrokes and paste/drop of structural markers are blocked
   *   outright.
   * Defaults to "off".
   */
  structureProtectionMode?: StructureProtectionMode;
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
   * EXPERIMENTAL: View options. Defaults to the formatted view mode which is currently the only
   * functional option.
   */
  view?: ViewOptions;
  /** EXPERIMENTAL: Is the editor being debugged using the TreeView. */
  debug?: boolean;
}
