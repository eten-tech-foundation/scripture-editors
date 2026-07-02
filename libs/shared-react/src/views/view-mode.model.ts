/**
 * Represents the available view modes for displaying content.
 *
 * @public
 */
export type ViewMode = keyof typeof viewModeToViewNames;

/**
 * Constant representing the formatted view mode.
 * Used to display content with formatting applied.
 *
 * @public
 */
export const FORMATTED_VIEW_MODE = "formatted";

/**
 * Constant representing the unformatted view mode.
 * Used to display content without formatting applied.
 *
 * @public
 */
export const UNFORMATTED_VIEW_MODE = "unformatted";

/**
 * Constant representing the paragraph structure view mode.
 * Displays formatted text with visible USFM paragraph markers in a gutter column,
 * styled verse numbers, decorative chapter numbers, and an active-text outline on
 * the focused paragraph section.
 *
 * @public
 */
export const PARAGRAPH_STRUCTURE_VIEW_MODE = "paragraph-structure";

/**
 * Constant representing the standard view mode (PT9 "Standard" equivalent).
 * Displays formatted text with USFM markers visible inline as editable text and
 * notes collapsed to callers.
 *
 * @public
 */
export const STANDARD_VIEW_MODE = "standard";

/**
 * Maps view mode keys to their human-readable display names.
 * Used for UI components that need to show view mode options to users.
 *
 * @public
 */
export const viewModeToViewNames = {
  [FORMATTED_VIEW_MODE]: "Formatted",
  [UNFORMATTED_VIEW_MODE]: "Unformatted",
  [PARAGRAPH_STRUCTURE_VIEW_MODE]: "Paragraph Structure",
  [STANDARD_VIEW_MODE]: "Standard",
};
