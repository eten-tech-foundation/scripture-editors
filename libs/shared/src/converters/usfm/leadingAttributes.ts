/**
 * The markers map's `leadingAttributes` relation — which markers take a value written directly
 * after the marker, separated only by whitespace, and stored as an attribute rather than as
 * text: `\v`/`\c`'s number, the note-marker family's caller, `\id`'s code.
 *
 * ONE rule follows from the declaration, with no per-marker exceptions: whitespace between the
 * marker and its leading-attribute value is structural and collapses to one, so `\v  5` is
 * verse 5, `\f  +` has caller `+`, and `\id  MAT` has code `MAT`. The fragment tokenizer's own
 * word scan (`getNextWord`, usfmFragmentToUsj.ts) already implements the collapse; this module
 * is the declarative side, so Tier-1 glyph arms (platform's marker-edit engine) can consume the
 * same marker/attribute knowledge instead of hardcoding per-marker lists.
 *
 * The table is a VENDORED SLICE of paranext-core's
 * `lib/platform-bible-utils/src/scripture/markers-maps/markers-map-3.0.model.ts`
 * (`USFM_MARKERS_MAP.markers`, every `leadingAttributes` field verbatim; 3.1 declares the
 * identical set) — the source of truth lives there; re-copy when it changes (the same
 * convention as `attributeMarkersMapAgreement.test.ts`'s slice and the vendored
 * `testUsfmCorpus` fixtures). scripture-editors has no dependency on `platform-bible-utils`,
 * so a live import is not available.
 */

/** Vendored from `USFM_MARKERS_MAP.markers`: every marker with a `leadingAttributes` field,
 * verbatim, ORDERED by the order the values must appear in after the marker. */
const LEADING_ATTRIBUTES: { readonly [marker: string]: readonly string[] } = {
  c: ["number"],
  ef: ["caller"],
  efe: ["caller"],
  ex: ["caller"],
  f: ["caller"],
  fe: ["caller"],
  id: ["code"],
  v: ["number"],
  x: ["caller"],
};

/**
 * The ordered leading-attribute names the markers map declares for `marker`, or `undefined`
 * for a marker that declares none. Read-only map data — callable from any context.
 */
export function leadingAttributeNames(marker: string): readonly string[] | undefined {
  return LEADING_ATTRIBUTES[marker];
}
