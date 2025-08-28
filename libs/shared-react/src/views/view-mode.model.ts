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
 * Maps view mode keys to their human-readable display names.
 * Used for UI components that need to show view mode options to users.
 *
 * @public
 */
export const viewModeToViewNames = {
  [FORMATTED_VIEW_MODE]: "Formatted",
  [UNFORMATTED_VIEW_MODE]: "Unformatted",
};
