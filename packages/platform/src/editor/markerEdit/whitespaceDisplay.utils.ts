/**
 * Standard-view whitespace display/data mapping (PT9 `AllowInvisibleChars=false` semantics) — the
 * PURE string half of the whitespace feature; the live-editing half is
 * `whitespaceDisplay.plugin.utils.ts` beside this file.
 *
 * The whole feature in one map. Three representations:
 *
 * - USFM bytes (host side): `~` means NBSP; ParatextData collapses space runs on reformat.
 * - USJ: a real NBSP (U+00A0) for `~`; plain spaces for spaces.
 * - Standard-view editor DOM: DISPLAY text — a stored NBSP renders as a literal `~` (visible and
 *   editable), and spaces inside a run of 2+ render as NBSP so they stay visible while typing
 *   instead of HTML-collapsing. Runs exist transiently: normalization is an event (serialization,
 *   Tier-2 rebuilds — matching PT9's on-reformat timing), not an invariant.
 *
 * Five boundaries, and who owns each:
 *
 * 1. Document LOAD (data → display): the forward adaptor calls {@link usjTextToDisplay} on text
 *    content. A paragraph-leading single space is special-cased in `createPara`
 *    (usj-editor.adaptor.ts), where "first in the paragraph" is actually known.
 * 2. Live TYPING: `$displayWhitespaceTransform` (plugin utils) keeps a run's spaces displayed as
 *    NBSP incrementally and length-preservingly, so the caret stays valid mid-keystroke.
 * 3. COPY/CUT: display-NBSP → plain space in the clipboard payload — wholesale in `text/plain`,
 *    collapse-aware in `text/html`, which keeps NBSP only where a rich-text consumer would
 *    destroy the plain space (runs of 2+, fragment edges) (plugin utils).
 * 4. PASTE: external NBSP (including `&nbsp;` in text/html) → display `~` (plugin utils).
 * 5. SERIALIZATION (display → data): the reverse adaptor strips a char span's structural leading
 *    NBSP separator, then inverts via {@link displayTextToUsj}, then collapses runs via
 *    {@link normalizeSpaceRuns}.
 *
 * The split between the two files: these functions are pure whole-string transforms for the
 * load/serialize boundaries; the plugin utils are `$`-prefixed tree/clipboard-event code for the
 * typing/copy/paste boundaries. Both are gated to Standard view by their callers via the
 * `hasStandardViewWhitespace` capability fingerprint (never the named mode). Not to be confused
 * with the fragment tokenizer's own `~` → NBSP handling (usfmFragmentToUsj.ts) — that is USFM
 * BYTE semantics during tokenization, not display mapping.
 */

import { NBSP } from "shared";

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
