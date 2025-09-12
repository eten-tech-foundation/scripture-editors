import {
  TEXT_SPACING_CLASS_NAME,
  FORMATTED_FONT_CLASS_NAME,
  MARKER_MODE_CLASS_NAME_PREFIX,
  VerseNode,
} from "shared";
import { ImmutableVerseNode } from "../nodes/usj/ImmutableVerseNode";
import { ViewMode, FORMATTED_VIEW_MODE, UNFORMATTED_VIEW_MODE } from "./view-mode.model";

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
    default:
      break;
  }
  return viewOptions;
}

/**
 * Convert view options to view mode if the view exists.
 *
 * @param viewOptions - View options of the editor.
 * @returns the view mode if the view is defined, `undefined` otherwise.
 *
 * @public
 */
export function getViewMode(viewOptions: ViewOptions | undefined): ViewMode | undefined {
  if (!viewOptions) return undefined;

  const { markerMode, hasSpacing, isFormattedFont } = viewOptions;
  if (markerMode === "hidden" && hasSpacing && isFormattedFont) return FORMATTED_VIEW_MODE;
  if (markerMode === "editable" && !hasSpacing && !isFormattedFont) return UNFORMATTED_VIEW_MODE;
  return undefined;
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
