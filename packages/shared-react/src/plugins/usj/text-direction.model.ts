/** Left-to-right or Right-to-left or Automatically determined from the content. "auto" is included
 * for completeness but it is not expected that "auto" will be of any use for minority languages.
 */
export type TextDirection = "ltr" | "rtl" | "auto";

/** Selection option names */
export const directionToNames: { [textDirection in TextDirection]: string } = {
  ltr: "Left-to-right",
  rtl: "Right-to-left",
  auto: "Automatic",
};
