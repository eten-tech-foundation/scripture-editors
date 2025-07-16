export const ZERO_WIDTH_SPACE = "\u200B";
export const CARET = "\u2038";

export const CURSOR_PLACEHOLDER_CHAR = ZERO_WIDTH_SPACE;

export enum CursorMovementDirection {
  LEFT = "left",
  RIGHT = "right",
}

export enum CharSelectionOffset {
  BEFORE = 0,
  AFTER = 1,
}
