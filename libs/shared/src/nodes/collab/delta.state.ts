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
 * and its content (the `[glyph, separator, ...content]` prefix layout). The runtime creator and
 * reader key on this constant — `$createMarkerTrailingSeparator` and
 * `$isMarkerTrailingSeparator` (node.utils.ts) — as does the forward adaptor building the
 * serialized twin for a paragraph's own prefix.
 *
 * It is NOT the only spelling in the codebase: four sites write the tag as a raw string, so
 * changing this value means changing them too. One is a CREATOR — the forward adaptor's table-cell
 * separator (usj-editor.adaptor.ts), whose sibling paragraph-prefix creator a few lines away does
 * use the constant. The other three are readers: the two collab paths that keep the separator's
 * text out of content ops (editor-delta.adaptor.ts and delta-common.utils.ts), and the settled-note
 * unwrap that reads the tag off a SERIALIZED node's `$.textType` (virtualSettle.utils.ts).
 */
export const MARKER_TRAILING_SPACE_TEXT_TYPE = "marker-trailing-space";
