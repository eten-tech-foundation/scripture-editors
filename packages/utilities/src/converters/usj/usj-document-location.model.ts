/** Serializable USJ locations relative to a specific USJ document (chapter or book) */

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Used in TSDoc @link references
import type { MarkerContent, MarkerObject, Usj } from "./usj.model.js";

/**
 * A JSONPath query to a {@link MarkerContent}, {@link Usj}, or property within a USJ document and
 * additional information that point to a specific location in that USJ document.
 *
 * This type does not include a verse reference because the JSONPath is relative to a specific USJ
 * document; that USJ document may have a book, a chapter, or something else in it. Use
 * `UsjLocation` to specify which USJ document this location is relative to, making the
 * location an absolute verse reference location. The closest equivalent concept in USFM to this
 * relative document location is a string character index in a USFM document; such an index is
 * relative to a specific USFM document rather than indicating an absolute position in a Scripture
 * text.
 *
 * This type intends to represent USFM positions (`UsfmVerseLocation`) in USJ space. However,
 * there are some USFM positions that are not currently representable with these types:
 *
 * - The second slash in `optbreak`'s USFM representation `//` (literally not representable)
 * - Nested marker prefix on opening markers like `+` for character markers (literally not
 *   representable)
 * - The bar `|` that indicates the start of closing marker attributes (no official representation)
 * - The equals sign for closing marker attributes (no official representation)
 * - The quotes around closing marker attribute values (no official representation)
 * - The space between closing marker attributes (no official representation)
 *
 * Also note that the following types do not specify a concrete location that is actually in the USJ
 * document but represent a USFM location relative to the most similar thing in USJ that there is:
 *
 * - {@link UsjClosingMarkerLocation} - there are no distinct closing objects in JSON; there is a
 *   common syntax for closing every object, but it is only one character and is on every single
 *   object as opposed to USFM closing markers which are multiple characters long and are only
 *   sometimes present.
 * - {@link UsjAttributeKeyLocation} - when the attribute whose key is being pointed to is an
 *   attribute marker in USFM, the `keyOffset` does not apply to the USJ attribute name (e.g.
 *   `altnumber`) but to the USFM attribute marker name (e.g. `ca`).
 * - {@link UsjAttributeMarkerLocation} - attribute markers are just properties in JSON; they do not
 *   have their own object such that they would have an opening that can be pointed to in the JSON
 *   like they have their own opening in USFM.
 * - {@link UsjClosingAttributeMarkerLocation} - attribute markers are just properties in JSON, plus
 *   they are in the same situation as {@link UsjClosingMarkerLocation} as detailed above.
 *
 * To see many examples of the same point represented by both USFM and USJ locations, go to
 * https://github.com/paranext/paranext-core/tree/main/lib/platform-bible-utils/src/scripture/usj-reader-writer-test-data/testUSFM-2SA-1-locations.ts
 *
 * @public
 */
export type UsjDocumentLocation =
  | UsjMarkerLocation
  | UsjClosingMarkerLocation
  | UsjTextContentLocation
  | UsjPropertyValueLocation
  | UsjAttributeKeyLocation
  | UsjAttributeMarkerLocation
  | UsjClosingAttributeMarkerLocation;

/**
 * A JSONPath query to a {@link MarkerObject} or {@link Usj} node. Indicates the very beginning of
 * that marker (at the backslash in USFM).
 *
 * @public
 */
export interface UsjMarkerLocation {
  /** JSON path to the marker object the location is pointing to. */
  jsonPath: ContentJsonPath;
}

/**
 * A JSONPath query to a specific point in the closing marker representation of a
 * {@link MarkerObject} or {@link Usj} node.
 *
 * @public
 */
export interface UsjClosingMarkerLocation {
  /**
   * JSON path to the marker object whose closing marker the location is pointing to. The offset
   * applies to the closing marker representation of that marker (for example, `\nd*` in USFM).
   */
  jsonPath: ContentJsonPath;
  /**
   * The character index in the closing marker representation where this location is pointing. The
   * location is at this offset within the closing marker representation.
   */
  closingMarkerOffset: number;
}

/**
 * A JSONPath query to a specific point in a text content string in a {@link MarkerObject.content}
 * array.
 *
 * @public
 */
export interface UsjTextContentLocation {
  /**
   * JSON path to the text content string the location is pointing to. The offset applies to this
   * text string.
   */
  jsonPath: ContentJsonPath;
  /**
   * The character index in the text content string where this location is pointing. The location is
   * at this offset within the text content string.
   */
  offset: number;
}

/**
 * A JSONPath query to a specific point in a property (`marker` or an attribute) value string in a
 * {@link MarkerObject} or {@link Usj}. The property cannot be `type` because `type`'s value has no
 * representation in USFM.
 *
 * To represent a location in an attribute's key, use {@link UsjAttributeKeyLocation}.
 *
 * @public
 */
export interface UsjPropertyValueLocation {
  /**
   * JSON path to the property the location is pointing to. The offset applies to this property's
   * value string.
   */
  jsonPath: PropertyJsonPath;
  /**
   * The character index in the property's value string where this location is pointing. The
   * location is at this offset within the property's value string.
   */
  propertyOffset: number;
}

/**
 * A JSONPath query to a specific point in an attribute key string in a {@link MarkerObject} or
 * {@link Usj}. The property cannot be `type` or `marker` because these properties' keys have no
 * representation in USFM. The property also cannot be any special attribute whose key doesn't have
 * a text representation in USFM like default attribute, leading attribute, text content attribute
 *
 * To represent a location in an attribute's value, use {@link UsjPropertyValueLocation}.
 *
 * @public
 */
export interface UsjAttributeKeyLocation {
  /**
   * JSON path to the marker whose attribute key the location is pointing to. The offset applies to
   * this attribute's key string unless the attribute is an attribute marker in USFM.
   */
  jsonPath: ContentJsonPath;
  /** Attribute name on the marker object whose key this location is pointing to. */
  keyName: string;
  /**
   * The character index in the attribute's key string where this location is pointing.
   *
   * If the attribute is an attribute marker in USFM, the location is at this offset within the
   * marker name for this attribute marker (for example, `c`'s `altnumber` attribute has attribute
   * marker `ca`, so its `keyOffset` applies to `ca`).
   *
   * If the attribute is not an attribute marker in USFM, the location is at this offset within the
   * attribute's key string.
   */
  keyOffset: number;
}

/**
 * A JSONPath query to an attribute marker derived from an attribute on a {@link MarkerObject} or
 * {@link Usj}. Indicates the very beginning of that marker (at the backslash in USFM).
 *
 * @public
 */
export interface UsjAttributeMarkerLocation {
  /** JSON path to the marker whose attribute marker the location is pointing to. */
  jsonPath: ContentJsonPath;
  /**
   * Attribute name on the marker object whose key this location is pointing to. This attribute is
   * an attribute marker in USFM.
   */
  keyName: string;
}

/**
 * A JSONPath query to a specific point in the closing marker representation of an attribute marker
 * derived from an attribute on a {@link MarkerObject} or {@link Usj}.
 *
 * @public
 */
export interface UsjClosingAttributeMarkerLocation {
  /**
   * JSON path to the marker whose attribute marker's closing marker the location is pointing to.
   * The offset applies to the closing marker representation of that attribute marker (for example,
   * `\ca*` in USFM).
   */
  jsonPath: ContentJsonPath;
  /**
   * Attribute name on the marker object whose key this location is pointing to. This attribute is
   * an attribute marker in USFM.
   */
  keyName: string;
  /**
   * The character index in the closing marker representation where this location is pointing. The
   * location is at this offset within the closing marker representation of the attribute marker.
   */
  keyClosingMarkerOffset: number;
}

/**
 * JSON path to a {@link MarkerObject}, {@link Usj}, or text content string in the current USJ
 * document.
 *
 * This could actually have more content clauses at the end, but TS types are limited
 *
 * @public
 */
export type ContentJsonPath =
  | ""
  | `$`
  | `$.content[${number}]`
  | `$.content[${number}].content[${number}]`
  | `$.content[${number}].content[${number}].content[${number}]`
  | `$.content[${number}].content[${number}].content[${number}].content[${number}]`;

/**
 * JSON path to the `marker` or an attribute on a {@link MarkerObject} or {@link Usj} in the current
 * USJ document. Note that it seems you must use `['bracket notation']` rather than `.dot` notation
 * if there are symbols other than underscore in the property name
 *
 * This could actually have more content clauses at the end, but TS types are limited
 *
 * @public
 */
export type PropertyJsonPath =
  | ""
  | `$.${string}`
  | `$['${string}']`
  | `$.content[${number}].${string}`
  | `$.content[${number}]['${string}']`
  | `$.content[${number}].content[${number}].${string}`
  | `$.content[${number}].content[${number}]['${string}']`
  | `$.content[${number}].content[${number}].content[${number}].${string}`
  | `$.content[${number}].content[${number}].content[${number}]['${string}']`
  | `$.content[${number}].content[${number}].content[${number}].content[${number}].${string}`
  | `$.content[${number}].content[${number}].content[${number}].content[${number}]['${string}']`;
