import type { UsjDocumentLocation } from "@eten-tech-foundation/scripture-utilities";

/**
 * Represents a specific location within a USJ document.
 *
 * @remarks
 * The `UsjLocation` interface is used to identify a position in a USJ document,
 * typically for annotation or selection purposes.
 *
 * @param jsonPath - The JSONPath string that points to a specific element in the USJ structure.
 * @param offset - The character offset within the targeted element.
 *
 * @deprecated Use {@link @eten-tech-foundation/scripture-utilities#UsjDocumentLocation} instead.
 * @public
 */
export interface UsjLocation {
  /** The JSONPath string that points to a specific element in the USJ structure. */
  jsonPath: string;
  /** The character offset within the targeted element. */
  offset: number;
}

/**
 * Represents the range of a selection within a USJ document, defined by a start and end location.
 *
 * @remarks
 * The `SelectionRange` is used to specify the span of text or content that a selection covers. If
 * only the start location is specified, the end location will default to the start location
 * indicating a cursor location rather than a range selection.
 *
 * @param start - The starting location of the selection range.
 * @param end - The ending location of the selection range.
 *
 * @public
 */
export interface SelectionRange {
  /** The starting location of the selection range. */
  start: UsjDocumentLocation;
  /** Optional ending location of the selection range. */
  end?: UsjDocumentLocation;
}

/**
 * Represents the range of an annotation within a USJ document, defined by a start and end location.
 *
 * @remarks
 * The `AnnotationRange` is used to specify the span of text or content that an annotation covers.
 *
 * @param start - The starting location of the annotation range.
 * @param end - The ending location of the annotation range.
 *
 * @public
 */
export interface AnnotationRange {
  /** The starting location of the annotation range. */
  start: UsjDocumentLocation;
  /** The ending location of the annotation range. */
  end: UsjDocumentLocation;
}
