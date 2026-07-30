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
 * - **Generic default** (any kind without a special case below): `\{marker} ` opening,
 *   {@link canonicalAttributeText} named pairs — always explicit `name="value"`, never the
 *   default-attribute collapse, because unknown kinds carry no StyleInfo default to collapse
 *   against — and `\{marker}*` closing.
 * - **optbreak** — PT9 renders `\optbreak` as the literal token `//`, not a marker: the opening
 *   IS the bare text `//`, with no attributes and no closing glyph.
 * - **figure** — USX/USJ's `file` attribute is USFM's `src` (the tokenizer performs the same
 *   rename in the other direction; usfmFragmentToUsj.ts). Rendering reverses it back so the
 *   attribute bytes match what a `\fig …\fig*` span actually carries in the file.
 * - **table / table:row / table:cell** — tables have no USFM pipe-attribute syntax at all; a
 *   cell's `align`/`colspan` are ENCODED in the marker name itself (`\thc3-4`), not rendered as
 *   attribute bytes. The container contributes no bytes of its own; a row opens with `\tr `; a
 *   cell opens with its own marker (`\tc1 `, `\th2 `); neither ever closes.
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
 */

import { canonicalAttributeText } from "../usj/attributeDisplay.utils.js";
import { UnknownAttributes } from "../usj/node-constants.js";

/** The three USFM byte spans {@link unknownDisplayParts} computes around an `UnknownNode`'s
 * existing content children: the marker-opening bytes, the attribute bytes, and the
 * marker-closing bytes — `""` for any that don't apply to the kind. */
export interface UnknownDisplayParts {
  opening: string;
  attributes: string;
  closing: string;
}

/** The USJ attribute name a figure's file reference is stored under — renamed from USFM's `src`
 * by the tokenizer (usfmFragmentToUsj.ts) on the way in; rendering reverses it back. */
const FIGURE_FILE_ATTRIBUTE = "file";
const FIGURE_SRC_ATTRIBUTE = "src";

/** The sidebar attribute that renders as its own `\cat …\cat*` marker rather than a pipe pair. */
const SIDEBAR_CATEGORY_ATTRIBUTE = "category";

/** The periph attribute that renders as literal marker content rather than a pipe pair. */
const PERIPH_TEXT_CONTENT_ATTRIBUTE = "alt";

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
 * The USFM byte strings to render immediately before and after an `UnknownNode`'s existing
 * content children — the marker opening, the attribute bytes, and the marker closing — computed
 * purely from the node's stored `tag` (USJ `type`), `marker`, and `unknownAttributes`. Pure
 * function; read-only display only (see module doc for why these bytes carry no round-trip
 * obligation).
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

  switch (tag) {
    case "optbreak":
      return { opening: "//", attributes: "", closing: "" };

    case "ref":
    case "table":
      // Generated wrapper (ref) and bare container (table): neither carries USFM bytes of its
      // own — a table's bytes live entirely on its table:row/table:cell children.
      return { opening: "", attributes: "", closing: "" };

    case "table:row":
    case "table:cell":
      // The marker itself IS the cell's shape (`\tc1`, `\thc3-4`, …); align/colspan are derived
      // from that name, not rendered again as pipe attributes.
      return { opening: `\\${marker} `, attributes: "", closing: "" };

    case "figure":
      return {
        opening: `\\${marker} `,
        attributes: canonicalAttributeText(renameFigureFileToSrc(attributes), undefined),
        closing: `\\${marker}*`,
      };

    case "sidebar": {
      const { [SIDEBAR_CATEGORY_ATTRIBUTE]: category, ...rest } = attributes;
      const categoryBytes = category === undefined ? "" : ` \\cat ${category}\\cat*`;
      return {
        opening: "\\esb",
        attributes: categoryBytes + canonicalAttributeText(rest, undefined),
        closing: "\\esbe",
      };
    }

    case "periph": {
      const { [PERIPH_TEXT_CONTENT_ATTRIBUTE]: alt, ...rest } = attributes;
      return {
        opening: `\\periph ${alt ?? ""}`,
        attributes: canonicalAttributeText(rest, undefined),
        closing: "",
      };
    }

    default:
      return {
        opening: `\\${marker} `,
        attributes: canonicalAttributeText(attributes, undefined),
        closing: `\\${marker}*`,
      };
  }
}
