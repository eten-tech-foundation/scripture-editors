/**
 * Standard-view whitespace display/data mapping (PT9
 * `AllowInvisibleChars=false` semantics). In Standard view the editor model holds
 * DISPLAY text: a stored NBSP renders as `~` and spaces in runs render as NBSP so
 * they are visible while typing. Serialization inverts the mapping and collapses
 * space runs (PT9 `UsfmToken.NormalizeUsfm`). These functions are pure; the
 * adaptors and MarkerEditPlugin gate them to Standard view.
 */

import { NBSP } from "../../nodes/usj/node-constants.js";

/**
 * Data → display: NBSP → `~`; spaces in runs of 2+ → NBSP. Paragraph-leading single-space
 * display is NOT handled here — `createPara` (usj-editor.adaptor.ts) applies it to the first
 * content text node directly, where "first in the paragraph" is actually known.
 */
export function usjTextToDisplay(text: string): string {
  const result = text.replaceAll(NBSP, "~");
  return result.replace(/ {2,}/g, (run) => NBSP.repeat(run.length));
}

/** Display → data: `~` → NBSP; display-NBSP → plain space. Does not collapse runs. */
export function displayTextToUsj(text: string): string {
  return text.replaceAll(NBSP, " ").replaceAll("~", NBSP);
}

/** Collapse runs of 2+ plain spaces to one (normalization; NBSP is never collapsed). */
export function normalizeSpaceRuns(text: string): string {
  return text.replace(/ {2,}/g, " ");
}
