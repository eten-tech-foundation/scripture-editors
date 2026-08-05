import {
  TEXT_SPACING_CLASS_NAME,
  FORMATTED_FONT_CLASS_NAME,
  MARKER_MODE_CLASS_NAME_PREFIX,
  VerseNode,
} from "shared";
import { ImmutableVerseNode } from "../nodes/usj/ImmutableVerseNode";
import {
  ViewMode,
  BLOCK_VERSE_VIEW_MODE,
  FORMATTED_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  viewModeToViewNames,
} from "./view-mode.model";
import { deepEqual } from "fast-equals";

/**
 * How USFM markers are displayed.
 *
 * @public
 */
export type MarkerMode =
  /** USFM markers are visible. */
  | "visible"
  /** USFM markers are editable. */
  | "editable"
  /** USFM markers are hidden. */
  | "hidden";

/**
 * How notes are displayed.
 *
 * @public
 */
export type NoteMode =
  /** All notes are always collapsed. Only the callers are displayed. */
  | "collapsed"
  /** A note is expanded inline when the cursor enters it via the caller and collapses on exit. */
  | "expandInline"
  /** All notes are always expanded. */
  | "expanded";

/**
 * How each verse is laid out in the document.
 *
 * @public
 */
export type VerseLayout =
  /** The verse marker is an inline milestone; verse text flows within its paragraph. */
  | "inline"
  /**
   * Each verse is a block-level element containing its own paragraphs, so it can be placed on a
   * layout row. Read-only: the editor forces read-only when this is selected, and neither USJ
   * export nor USJ-addressed selection is available, because a paragraph spanning several verses
   * is split across their blocks and no longer matches the source USJ's content indexes.
   */
  | "block";

/**
 * Configuration options for controlling the display and behavior of Scripture text views.
 *
 * @example
 * ```typescript
 * const viewOptions: ViewOptions = {
 *   markerMode: "hidden",
 *   hasSpacing: true,
 *   isFormattedFont: true
 * };
 * ```
 *
 * @public
 */
export interface ViewOptions {
  /** How USFM markers are displayed */
  markerMode: MarkerMode;
  /** How notes are displayed. */
  noteMode?: NoteMode;
  /** Does the text have spacing including indenting. */
  hasSpacing: boolean;
  /** Is the text in a formatted font. */
  isFormattedFont: boolean;
  /**
   * When false, `CharNode.createDOM` skips setting the `title=__marker` attribute on rendered
   * char spans. Useful for consumers that don't want the USFM marker name surfaced as a browser
   * tooltip. Default (undefined or true) preserves the marker hint for consumers authoring USFM.
   */
  showCharMarkerTitles?: boolean;
  /**
   * Show a fixed-width gutter at the inline-start of the editor containing paragraph-level USFM markers,
   * styled verse numbers, and decorative chapter numbers. When enabled, paragraph markers are
   * rendered as immutable typed-text nodes (so they exist in the DOM to be repositioned into the
   * gutter) regardless of `markerMode`. Inline char/verse/note markers are NOT shown.
   */
  hasGutterParaMarkers?: boolean;
  /**
   * Show an outline box around the active text section (the verse range under the cursor).
   * Can be used independently of `hasGutterParaMarkers`, though poetry-paragraph alignment of
   * the box relies on indent variables set by the gutter feature.
   */
  hasActiveTextFocusBox?: boolean;
  /**
   * How each verse is laid out. Default (undefined) is `"inline"`, which is what every view other
   * than block verse uses.
   *
   * Switching this between `"inline"` and `"block"` recreates the editor, because the node types a
   * Lexical editor can hold are fixed when it is created. That discards the undo history and any
   * annotations the host has applied since the last USJ change, so hosts should choose a layout
   * when they mount the editor rather than toggling a live one.
   */
  verseLayout?: VerseLayout;
}

let defaultViewMode: ViewMode;
let defaultViewOptions: ViewOptions;

/**
 * Sets the default view mode and options.
 *
 * @param viewMode - View mode of the editor.
 *
 * @public
 */
export function setDefaultView(viewMode: ViewMode) {
  const _viewOptions = getViewOptions(viewMode);
  if (!_viewOptions) throw new Error(`Invalid view mode: ${viewMode}`);
  defaultViewMode = viewMode;
  defaultViewOptions = _viewOptions;
}

setDefaultView(FORMATTED_VIEW_MODE);

/**
 * Gets the default view mode.
 *
 * @returns the default view mode.
 *
 * @public
 */
export const getDefaultViewMode = () => defaultViewMode;

/**
 * Gets the default view options.
 *
 * @returns the default view options.
 *
 * @public
 */
export const getDefaultViewOptions = () => defaultViewOptions;

/**
 * Get view option properties based on the view mode.
 *
 * @param viewMode - View mode of the editor.
 * @returns the view options if the view exists, the default options if the viewMode is undefined,
 *   `undefined` otherwise.
 *
 * @public
 */
export function getViewOptions(viewMode?: string | undefined): ViewOptions | undefined {
  let viewOptions: ViewOptions | undefined;
  switch (viewMode ?? defaultViewMode) {
    case FORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
      };
      break;
    case UNFORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "editable",
        noteMode: "expanded",
        hasSpacing: false,
        isFormattedFont: false,
      };
      break;
    case PARAGRAPH_STRUCTURE_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
        hasGutterParaMarkers: true,
        hasActiveTextFocusBox: true,
      };
      break;
    case BLOCK_VERSE_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        noteMode: "collapsed",
        hasSpacing: true,
        isFormattedFont: true,
        verseLayout: "block",
      };
      break;
    default:
      break;
  }
  return viewOptions;
}

/**
 * Convert view options to view mode if the view exists.
 *
 * This inverts {@link getViewOptions} by comparison rather than by matching fields one at a time,
 * so a view option added in the future cannot be forgotten here and silently make two modes
 * indistinguishable.
 *
 * The comparison is exact: options must deep-equal what `getViewOptions` produces for a mode.
 * Options that were derived from a mode and then tweaked - say a formatted view with `noteMode`
 * changed to `"expanded"` - describe a view that is not one of the named modes, so they yield
 * `undefined` rather than the mode they started from.
 *
 * @param viewOptions - View options of the editor.
 * @returns the view mode if the view is defined, `undefined` otherwise.
 *
 * @public
 */
export function getViewMode(viewOptions: ViewOptions | undefined): ViewMode | undefined {
  if (!viewOptions) return undefined;

  return (Object.keys(viewModeToViewNames) as ViewMode[]).find((viewMode) =>
    deepEqual(getViewOptions(viewMode), viewOptions),
  );
}

/**
 * Get the verse node class for the given view options.
 *
 * @param viewOptions - View options of the editor.
 * @returns the verse node class if the view is defined, `undefined` otherwise.
 *
 * @public
 */
export function getVerseNodeClass(viewOptions: ViewOptions | undefined) {
  if (!viewOptions) return;

  // Block verse is read-only, so its marker is never the editable `VerseNode`. Today the marker
  // mode below would reach the same answer - block verse hides markers - but dispatching on the
  // layout first keeps that independent of how markers happen to be configured.
  if (viewOptions.verseLayout === "block") return ImmutableVerseNode;

  return viewOptions.markerMode === "editable" ? VerseNode : ImmutableVerseNode;
}

/**
 * Get the class name list for the given view options.
 *
 * @param viewOptions - View options of the editor.
 * @returns the element class name list based on view options.
 *
 * @public
 */
export function getViewClassList(viewOptions: ViewOptions | undefined) {
  const classList: string[] = [];
  const _viewOptions = viewOptions ?? defaultViewOptions;
  if (_viewOptions) {
    classList.push(`${MARKER_MODE_CLASS_NAME_PREFIX}${_viewOptions.markerMode}`);
    if (_viewOptions.hasSpacing) classList.push(TEXT_SPACING_CLASS_NAME);
    if (_viewOptions.isFormattedFont) classList.push(FORMATTED_FONT_CLASS_NAME);
  }
  return classList;
}
