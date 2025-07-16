export type ViewMode = keyof typeof viewModeToViewNames;

export const FORMATTED_VIEW_MODE = "formatted";
export const UNFORMATTED_VIEW_MODE = "unformatted";
export const viewModeToViewNames = {
  [FORMATTED_VIEW_MODE]: "Formatted",
  [UNFORMATTED_VIEW_MODE]: "Unformatted",
};
