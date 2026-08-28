/**
 * Unknown-node USFM byte rendering: the single place that owns HOW an `UnknownNode`'s opening
 * marker, attribute, and closing marker bytes are computed for read-only display. Sibling of
 * attributeDisplay.utils.ts (char/verse attribute display runs), following the same owning-module
 * shape, but for a different tree: `UnknownNode`'s kinds (figure, table/table:row/table:cell,
 * sidebar, periph, ref, optbreak) carry no USFM byte representation anywhere in the tree —
 * markers and attributes are simply invisible today. The renderer that flanks a node's existing
 * content children with the bytes this module computes lives elsewhere; this module is the pure
 * byte-computation function it calls.
 *
 * ## Why these bytes carry no round-trip obligation
 *
 * Every kind here stays a Tier-2 sentinel — unlike char spans and verses (attributeDisplay.utils.ts),
 * which grew live display runs that re-tokenize on edit. These bytes only need to be CORRECT
 * USFM, not byte-identical to whatever produced the node; nothing here ever re-tokenizes back
 * into node state, so there is no cache to keep honest and no sync to register.
 *
 * ## Per-kind shapes
 *
 * All four parts are OPAQUE bytes for the consumer to concatenate around the node's content,
 * never to parse. The `attributes` part carries only bytes that belong BETWEEN the opening and
 * the content (sidebar's `\cat …\cat*` marker run, periph's marker-line pipe pairs; `""` for
 * every other kind). USFM pipe attributes on span-shaped kinds (the generic default, figure)
 * come AFTER content, directly before the closer, so those kinds populate `closingAttributes`
 * instead — kept as its own part (rather than folded into `closing`) so the consumer can style
 * the `|…` run dimmer than the closer glyph, matching PT9's attribute-run display. Concatenating
 * `closingAttributes + closing` reproduces the exact same bytes a single `closing` string used
 * to carry.
 *
 * - **Generic default** (any kind without a special case below): `\{marker} ` opening, a
 *   `closingAttributes` of {@link canonicalAttributeText} named pairs — always explicit
 *   `name="value"`, never the default-attribute collapse, because unknown kinds carry no
 *   StyleInfo default to collapse against — and a `closing` of `\{marker}*` (the char-span shape:
 *   `\zzz content|foo="bar"\zzz*`).
 * - **optbreak** — PT9 renders `\optbreak` as the literal token `//`, not a marker: the opening
 *   IS the bare text `//`, with no attributes and no closing glyph.
 * - **figure** — USFM 3.0 puts the caption first (`\fig caption|src="…"\fig*`), so the attribute
 *   bytes go in `closingAttributes`, ahead of the `closing` glyph. USX/USJ's `file` attribute is
 *   USFM's `src` (the tokenizer performs the same rename in the other direction;
 *   usfmFragmentToUsj.ts); rendering reverses it back so the bytes match what a `\fig …\fig*`
 *   span actually carries in the file.
 * - **table / table:row / table:cell** — tables have no USFM pipe-attribute syntax at all; a
 *   cell's `align`/`colspan` are ENCODED in the marker name itself (`\thc3-4`), never rendered
 *   as attribute bytes. The container contributes no bytes of its own; a row opens with `\tr `;
 *   a cell opens with its own marker, re-encoding a `colspan` back into the span suffix the
 *   tokenizer trimmed off (marker `thc3` + colspan `2` → `\thc3-4 `; see
 *   {@link tableCellMarkerWithSpan}); neither ever closes.
 * - **sidebar** — `\esb`/`\esbe` bracket the block. A `category` attribute is not a pipe
 *   attribute at all but its own char-shaped marker directly after `\esb`
 *   (`\esb \cat Missions\cat*`), mirroring how the tokenizer folds a `\cat` onto a receptive
 *   sidebar (usfmFragmentToUsj.ts).
 * - **periph** — `alt` is a text-content attribute: its value renders as literal marker content
 *   right after `\periph` (`\periph Title`) rather than a pipe attribute; any remaining
 *   attributes (e.g. `id`) are ordinary named pairs. `periph` is an open-ended division marker,
 *   so it never closes.
 * - **ref** — a generated wrapper around cross-reference target text; USJ invented this
 *   container, USFM never carried it, so it contributes no bytes at all — only its child text
 *   renders, as-is.
 *
 * ## Unterminated constructs render no closer
 *
 * Cutting across every kind above: a construct the source never terminated (`closed="false"`) has
 * no closing bytes in the file, so it displays none. Char spans already work this way — see
 * `$charClosingGlyph` (attributeDisplay.utils.ts) — and the rule is the same one for the same
 * reason: a closer shown for bytes the document does not contain is a byte the user can neither
 * edit away nor save.
 */

import { canonicalAttributeText } from "../usj/attributeDisplay.utils.js";
import { UnknownAttributes } from "../usj/node-constants.js";

/** The four USFM byte spans {@link unknownDisplayParts} computes around an `UnknownNode`'s
 * existing content children, in render order: the marker-opening bytes, the between-opening-
 * and-content bytes (sidebar's `\cat` run, periph's marker-line pipe pairs), the after-content
 * pipe-attribute bytes (span-shaped kinds' `|foo="bar"` run, kept separate from `closing` so the
 * consumer can style it as a dimmer attribute run rather than a marker glyph), and the closing
 * glyph itself — `""` for any part that doesn't apply to the kind. */
export interface UnknownDisplayParts {
  opening: string;
  attributes: string;
  closingAttributes: string;
  closing: string;
}

/** The USJ attribute name a figure's file reference is stored under — renamed from USFM's `src`
 * by the tokenizer (usfmFragmentToUsj.ts) on the way in; rendering reverses it back. */
const FIGURE_FILE_ATTRIBUTE = "file";
const FIGURE_SRC_ATTRIBUTE = "src";

/** The cell attribute holding the span COUNT the tokenizer derived from the marker's trimmed
 * span suffix; re-encoded back into the opening marker rather than rendered as a pipe pair. */
const TABLE_CELL_COLSPAN_ATTRIBUTE = "colspan";

/** The sidebar attribute that renders as its own `\cat …\cat*` marker rather than a pipe pair. */
const SIDEBAR_CATEGORY_ATTRIBUTE = "category";

/** The periph attribute that renders as literal marker content rather than a pipe pair. */
const PERIPH_TEXT_CONTENT_ATTRIBUTE = "alt";

/** The USJ metadata flagging a construct the source never terminated. */
const IMPLICITLY_CLOSED_ATTRIBUTE = "closed";
const IMPLICITLY_CLOSED_VALUE = "false";

/**
 * Whether the source terminated this construct with its own closing bytes. An implicitly closed
 * one (`closed="false"` — the tokenizer's mark for a sidebar the fragment or chapter boundary
 * auto-closed, and USX's same flag read back) has no closing bytes in the file, so it must display
 * none: char spans already follow exactly this rule (`$charClosingGlyph`,
 * attributeDisplay.utils.ts — `createChar` builds no closing glyph for such a span and the display
 * sync must not fabricate one). A closer shown for bytes the document does not contain is one the
 * user can neither edit away nor save.
 */
function isExplicitlyClosed(attributes: UnknownAttributes): boolean {
  return attributes[IMPLICITLY_CLOSED_ATTRIBUTE] !== IMPLICITLY_CLOSED_VALUE;
}

/** `attributes` with `file` renamed to `src` in place — the USX/USJ naming reversed back to the
 * byte name a figure's file attribute is actually written with in USFM. Key order is preserved
 * (a `Object.entries` map, not a delete-then-add) so a renamed `file` renders wherever it
 * originally sat among the figure's other attributes. */
function renameFigureFileToSrc(attributes: UnknownAttributes): UnknownAttributes {
  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name === FIGURE_FILE_ATTRIBUTE ? FIGURE_SRC_ATTRIBUTE : name,
      value,
    ]),
  );
}

/**
 * The cell's opening marker with its span suffix re-encoded from `colspan`. The tokenizer
 * (usfmFragmentToUsj.ts, table-cell assembly) splits a spanning cell marker apart on the way in —
 * `\thc3-4` becomes marker `thc3` (span suffix trimmed off after the start column) plus colspan
 * `"2"` (the COUNT of columns spanned, end − start + 1) — so rendering the stored marker bare
 * would silently narrow the cell to a single column. Re-encoding reverses the split: end column =
 * start + count − 1. A `colspan` that is not a real span (absent, non-numeric, or below 2) or a
 * marker with no trailing start column to count from yields the bare marker rather than a garbage
 * suffix.
 */
function tableCellMarkerWithSpan(
  marker: string | undefined,
  colspan: string | undefined,
): string | undefined {
  if (marker === undefined) return undefined;
  const spanCount = Number(colspan);
  if (!Number.isInteger(spanCount) || spanCount < 2) return marker;
  // The trailing start column is found by a manual backward scan rather than `/(\d+)$/`: an
  // end-anchored greedy digit run makes the regex engine retry the match from every position of a
  // long digit run (quadratic on adversarial markers like "000…0X"), while the scan is linear.
  // Byte-identical to the regex for every input — a marker that is ALL digits contributes the
  // whole string as its start column, exactly as `(\d+)$` would match it.
  let digitsStart = marker.length;
  while (digitsStart > 0) {
    const charCode = marker.charCodeAt(digitsStart - 1);
    if (charCode < 0x30 || charCode > 0x39) break; // outside '0'..'9'
    digitsStart -= 1;
  }
  if (digitsStart === marker.length) return marker;
  return `${marker}-${Number(marker.slice(digitsStart)) + spanCount - 1}`;
}

/**
 * The USFM byte strings to render around an `UnknownNode`'s existing content children —
 * `opening` and `attributes` before the content, `closingAttributes` then `closing` after it (see
 * {@link UnknownDisplayParts} for what each part carries per kind) — computed purely from the
 * node's stored `tag` (USJ `type`), `marker`, and `unknownAttributes`. Pure function; read-only
 * display only (see module doc for why these bytes carry no round-trip obligation).
 *
 * @param tag - The `UnknownNode`'s USJ type (e.g. "figure", "table:row", "optbreak").
 * @param marker - The node's stored USFM marker, when the USJ shape carries one.
 * @param unknownAttributes - The node's stored attribute bag, when the USJ shape carries one.
 */
export function unknownDisplayParts(
  tag: string,
  marker: string | undefined,
  unknownAttributes: UnknownAttributes | undefined,
): UnknownDisplayParts {
  const attributes = unknownAttributes ?? {};
  const closed = isExplicitlyClosed(attributes);

  switch (tag) {
    case "optbreak":
      return { opening: "//", attributes: "", closingAttributes: "", closing: "" };

    case "ref":
    case "table":
      // Generated wrapper (ref) and bare container (table): neither carries USFM bytes of its
      // own — a table's bytes live entirely on its table:row/table:cell children.
      return { opening: "", attributes: "", closingAttributes: "", closing: "" };

    case "table:row":
      return { opening: `\\${marker} `, attributes: "", closingAttributes: "", closing: "" };

    case "table:cell":
      // The marker name itself IS the cell's shape (`\tc1`, `\thc3-4`, …): `align` is already
      // encoded in it, and a `colspan` re-encodes into its span suffix (see
      // tableCellMarkerWithSpan) — neither ever renders as pipe-attribute bytes, which USFM
      // tables do not have.
      return {
        opening: `\\${tableCellMarkerWithSpan(marker, attributes[TABLE_CELL_COLSPAN_ATTRIBUTE])} `,
        attributes: "",
        closingAttributes: "",
        closing: "",
      };

    case "figure":
      // USFM 3.0 figures put the caption FIRST (`\fig caption|src="…"\fig*`), so the attribute
      // bytes go in closingAttributes, ahead of the closing glyph — rendering them between the
      // opening and the caption would strand the caption after the attribute list, which is
      // invalid USFM. Kept as its own part (rather than folded into `closing`) so the caller can
      // style the `|…` run dimmer than the `\fig*` glyph, matching PT9's attribute-run display.
      return {
        opening: `\\${marker} `,
        attributes: "",
        closingAttributes: canonicalAttributeText(renameFigureFileToSrc(attributes), undefined),
        closing: closed ? `\\${marker}*` : "",
      };

    case "sidebar": {
      const { [SIDEBAR_CATEGORY_ATTRIBUTE]: category, ...rest } = attributes;
      const categoryBytes = category === undefined ? "" : ` \\cat ${category}\\cat*`;
      return {
        opening: "\\esb",
        attributes: categoryBytes + canonicalAttributeText(rest, undefined),
        closingAttributes: "",
        closing: closed ? "\\esbe" : "",
      };
    }

    case "periph": {
      const { [PERIPH_TEXT_CONTENT_ATTRIBUTE]: alt, ...rest } = attributes;
      return {
        opening: `\\periph ${alt ?? ""}`,
        attributes: canonicalAttributeText(rest, undefined),
        closingAttributes: "",
        closing: "",
      };
    }

    default:
      // Char-span shape is the natural default for an attributed unknown span: content first,
      // pipe attributes directly before the closer (`\zzz content|foo="bar"\zzz*`) — kept as its
      // own closingAttributes part (rather than folded into `closing`) so the caller can style
      // the `|…` run dimmer than the `\zzz*` glyph, matching PT9's attribute-run display.
      return {
        opening: `\\${marker} `,
        attributes: "",
        closingAttributes: canonicalAttributeText(attributes, undefined),
        closing: closed ? `\\${marker}*` : "",
      };
  }
}
