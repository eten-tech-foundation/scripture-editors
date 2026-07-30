import { createState } from "lexical";

/** Should only be used with CharNodes. */
export const charIdState = createState("cid", {
  parse: (v) => (typeof v === "string" ? v : undefined),
});

/** Can be used on any standard USJ node. */
export const segmentState = createState("segment", {
  parse: (v) => (typeof v === "string" ? v : undefined),
});

/** Should be used with TextNodes. */
export const textTypeState = createState("textType", {
  parse: (v) => (typeof v === "string" ? v : undefined),
});

/**
 * `textTypeState` value tagging the engine-owned NBSP separator between an editable marker glyph
 * and its content (the `[glyph, separator, ...content]` prefix layout). Every creator and reader
 * of that separator keys on this ONE constant — runtime creators via
 * `$createMarkerTrailingSeparator` (node.utils.ts); the forward adaptor builds the serialized
 * twin with the same tag.
 */
export const MARKER_TRAILING_SPACE_TEXT_TYPE = "marker-trailing-space";
