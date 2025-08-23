import {
  TEXT_SPACING_CLASS_NAME,
  FORMATTED_FONT_CLASS_NAME,
  MARKER_MODE_CLASS_NAME_PREFIX,
  VerseNode,
} from "shared";
import { ImmutableVerseNode } from "../nodes/usj/ImmutableVerseNode";
import { ViewMode, FORMATTED_VIEW_MODE, UNFORMATTED_VIEW_MODE } from "./view-mode.model";

export interface ViewOptions {
  /** USFM markers are visible, editable or hidden */
  markerMode: "visible" | "editable" | "hidden";
  /** does the text have spacing including indenting */
  hasSpacing: boolean;
  /** is the text in a formatted font */
  isFormattedFont: boolean;
}

let defaultViewMode: ViewMode;
let defaultViewOptions: ViewOptions;

/**
 * Sets the default view mode and options.
 * @param viewMode - View mode of the editor.
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
 * @returns the default view mode.
 */
export const getDefaultViewMode = () => defaultViewMode;

/**
 * Gets the default view options.
 * @returns the default view options.
 */
export const getDefaultViewOptions = () => defaultViewOptions;

/**
 * Get view option properties based on the view mode.
 * @param viewMode - View mode of the editor.
 * @returns the view options if the view exists, the default options if the viewMode is undefined,
 *   `undefined` otherwise.
 */
export function getViewOptions(viewMode?: string | undefined): ViewOptions | undefined {
  let viewOptions: ViewOptions | undefined;
  switch (viewMode ?? defaultViewMode) {
    case FORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "hidden",
        hasSpacing: true,
        isFormattedFont: true,
      };
      break;
    case UNFORMATTED_VIEW_MODE:
      viewOptions = {
        markerMode: "editable",
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
 * @param viewOptions - View options of the editor.
 * @returns the view mode if the view is defined, `undefined` otherwise.
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
 * @param viewOptions - View options of the editor.
 * @returns the verse node class if the view is defined, `undefined` otherwise.
 */
export function getVerseNodeClass(viewOptions: ViewOptions | undefined) {
  if (!viewOptions) return;

  return viewOptions.markerMode === "editable" ? VerseNode : ImmutableVerseNode;
}

/**
 * Get the class list for an element node.
 * @param viewOptions - View options of the editor.
 * @returns the element class list based on view options.
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
