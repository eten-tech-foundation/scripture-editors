/**
 * Left-to-right or Right-to-left or Automatically determined from the content. "auto" is included
 * for completeness but it is not expected that "auto" will be of any use for minority languages.
 *
 * @public
 */
export type TextDirection = "ltr" | "rtl" | "auto";

/**
 * Maps text direction to their human-readable display names.
 * Used for UI components that need to show text direction options to users.
 *
 * @public
 */
export const directionToNames: { [textDirection in TextDirection]: string } = {
  ltr: "Left-to-right",
  rtl: "Right-to-left",
  auto: "Automatic",
};
