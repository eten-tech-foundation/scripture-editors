import type { UsjDocumentLocation } from "@eten-tech-foundation/scripture-utilities";

/**
 * Location test data for `usj2Sa` (2 Samuel chapters 1-2).
 *
 * Adapted from paranext-core's testUSFM-2SA-1-locations.ts.
 * Each entry maps a USFM verse location (kept for reference) to a USJ document location.
 * The `usfmVerseLocation` is retained so developers can cross-reference with the original
 * USFM source and navigate the test data.
 *
 * @see https://github.com/paranext/paranext-core/blob/main/lib/platform-bible-utils/src/scripture/usj-reader-writer-test-data/testUSFM-2SA-1-locations.ts
 */

/** Location type tags matching UsjDocumentLocation subtypes. */
export type LocationType =
  | "marker"
  | "closingMarker"
  | "textContent"
  | "propertyValue"
  | "attributeKey"
  | "attributeMarker"
  | "closingAttributeMarker";

/** USFM verse reference for cross-referencing with the original USFM source. */
export interface UsfmVerseLocation {
  verseRef: { book: string; chapterNum: number; verseNum: number };
  offset: number;
}

/** A single test location entry pairing a USFM verse location with a USJ document location. */
export interface LocationEntry2Sa {
  /** Human-readable description for test output. */
  description: string;
  /** Which UsjDocumentLocation subtype this entry represents. */
  locationType: LocationType;
  /** USFM verse location for cross-referencing (not used in assertions). */
  usfmVerseLocation: UsfmVerseLocation;
  /** The USJ document location to test. */
  documentLocation: UsjDocumentLocation;
}

/**
 * All location entries for `usj2Sa` (2 Samuel chapters 1-2).
 * Covers all 7 UsjDocumentLocation subtypes with real scripture data.
 */
// UsjDocumentLocation type assertion needed because ContentJsonPath and PropertyJsonPath
// template literal types don't allow arbitrary depth or property name patterns.
export const usjLocations2Sa: LocationEntry2Sa[] = [
  // First example of the beginning of a marker (the backslash `\`)
  {
    description: "marker at $.content[0]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 0 },
    documentLocation: { jsonPath: "$.content[0]" },
  },
  // First example of the beginning of the opening marker name (`id`)
  {
    description: "propertyValue at $.content[0]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 1 },
    documentLocation: { jsonPath: "$.content[0]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[0]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 2 },
    documentLocation: { jsonPath: "$.content[0]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[0]['marker'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 3 },
    documentLocation: { jsonPath: "$.content[0]['marker']", propertyOffset: 2 },
  },
  // First example of a leading attribute e.g. `\id 2SA Stuff` - `2SA` is `code`. `Stuff` is just text content
  {
    description: "propertyValue at $.content[0]['code'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 4 },
    documentLocation: { jsonPath: "$.content[0]['code']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[0]['code'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 5 },
    documentLocation: { jsonPath: "$.content[0]['code']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[0]['code'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 6 },
    documentLocation: { jsonPath: "$.content[0]['code']", propertyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[0]['code'] offset 3",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 7 },
    documentLocation: { jsonPath: "$.content[0]['code']", propertyOffset: 3 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 8 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 0 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 1",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 9 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 1 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 2",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 10 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 2 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 3",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 11 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 3 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 4",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 12 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 4 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 5",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 13 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 5 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 6",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 14 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 6 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 7",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 15 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 7 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 8",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 16 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 8 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 9",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 17 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 9 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 10",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 18 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 10 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 11",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 19 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 11 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 12",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 20 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 12 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 13",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 21 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 13 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 14",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 22 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 14 },
  },
  {
    description: "textContent at $.content[0].content[0] offset 15",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 23 },
    documentLocation: { jsonPath: "$.content[0].content[0]", offset: 15 },
  },
  {
    description: "marker at $.content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 24 },
    documentLocation: { jsonPath: "$.content[1]" },
  },
  {
    description: "propertyValue at $.content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 25 },
    documentLocation: { jsonPath: "$.content[1]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[1]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 26 },
    documentLocation: { jsonPath: "$.content[1]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[1]['marker'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 27 },
    documentLocation: { jsonPath: "$.content[1]['marker']", propertyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[1]['marker'] offset 3",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 28 },
    documentLocation: { jsonPath: "$.content[1]['marker']", propertyOffset: 3 },
  },
  {
    description: "propertyValue at $.content[1]['marker'] offset 4",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 29 },
    documentLocation: { jsonPath: "$.content[1]['marker']", propertyOffset: 4 },
  },
  {
    description: "textContent at $.content[1].content[0] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 30 },
    documentLocation: { jsonPath: "$.content[1].content[0]", offset: 0 },
  },
  {
    description: "textContent at $.content[1].content[0] offset 1",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 31 },
    documentLocation: { jsonPath: "$.content[1].content[0]", offset: 1 },
  },
  {
    description: "textContent at $.content[1].content[0] offset 2",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 32 },
    documentLocation: { jsonPath: "$.content[1].content[0]", offset: 2 },
  },
  {
    description: "textContent at $.content[1].content[0] offset 3",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 33 },
    documentLocation: { jsonPath: "$.content[1].content[0]", offset: 3 },
  },
  {
    description: "textContent at $.content[1].content[0] offset 4",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 34 },
    documentLocation: { jsonPath: "$.content[1].content[0]", offset: 4 },
  },
  // Skip to chapter 1 marker
  {
    description: "marker at $.content[4]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 62 },
    documentLocation: { jsonPath: "$.content[4]" },
  },
  {
    description: "propertyValue at $.content[4]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 63 },
    documentLocation: { jsonPath: "$.content[4]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[4]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 64 },
    documentLocation: { jsonPath: "$.content[4]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[4]['number'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 65 },
    documentLocation: { jsonPath: "$.content[4]['number']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[4]['number'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 66 },
    documentLocation: { jsonPath: "$.content[4]['number']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[4]['number'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 67 },
    documentLocation: { jsonPath: "$.content[4]['number']", propertyOffset: 2 },
  },
  // begin altnumber - first example of an attribute marker
  {
    description: "attributeMarker at $.content[4] key 'altnumber'",
    locationType: "attributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 68 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber" },
  },
  {
    description: "attributeKey at $.content[4] key 'altnumber' offset 0",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 69 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyOffset: 0 },
  },
  {
    description: "attributeKey at $.content[4] key 'altnumber' offset 1",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 70 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyOffset: 1 },
  },
  {
    description: "attributeKey at $.content[4] key 'altnumber' offset 2",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 71 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[4]['altnumber'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 72 },
    documentLocation: { jsonPath: "$.content[4]['altnumber']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[4]['altnumber'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 73 },
    documentLocation: { jsonPath: "$.content[4]['altnumber']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[4]['altnumber'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 74 },
    documentLocation: { jsonPath: "$.content[4]['altnumber']", propertyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[4]['altnumber'] offset 3",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 75 },
    documentLocation: { jsonPath: "$.content[4]['altnumber']", propertyOffset: 3 },
  },
  {
    description: "closingAttributeMarker at $.content[4] key 'altnumber' offset 0",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 76 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyClosingMarkerOffset: 0 },
  },
  {
    description: "closingAttributeMarker at $.content[4] key 'altnumber' offset 1",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 77 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyClosingMarkerOffset: 1 },
  },
  {
    description: "closingAttributeMarker at $.content[4] key 'altnumber' offset 2",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 78 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyClosingMarkerOffset: 2 },
  },
  {
    description: "closingAttributeMarker at $.content[4] key 'altnumber' offset 3",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 79 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyClosingMarkerOffset: 3 },
  },
  {
    description: "closingAttributeMarker at $.content[4] key 'altnumber' offset 4",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 80 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "altnumber", keyClosingMarkerOffset: 4 },
  },
  // Finished altnumber. Now to next attribute marker pubnumber
  {
    description: "attributeMarker at $.content[4] key 'pubnumber'",
    locationType: "attributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 81 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "pubnumber" },
  },
  {
    description: "attributeKey at $.content[4] key 'pubnumber' offset 0",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 82 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "pubnumber", keyOffset: 0 },
  },
  {
    description: "attributeKey at $.content[4] key 'pubnumber' offset 1",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 83 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "pubnumber", keyOffset: 1 },
  },
  {
    description: "attributeKey at $.content[4] key 'pubnumber' offset 2",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 84 },
    documentLocation: { jsonPath: "$.content[4]", keyName: "pubnumber", keyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[4]['pubnumber'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 85 },
    documentLocation: { jsonPath: "$.content[4]['pubnumber']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[4]['pubnumber'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 86 },
    documentLocation: { jsonPath: "$.content[4]['pubnumber']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[4]['pubnumber'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 87 },
    documentLocation: { jsonPath: "$.content[4]['pubnumber']", propertyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[4]['pubnumber'] offset 3",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 88 },
    documentLocation: { jsonPath: "$.content[4]['pubnumber']", propertyOffset: 3 },
  },
  {
    description: "propertyValue at $.content[4]['pubnumber'] offset 4",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 89 },
    documentLocation: { jsonPath: "$.content[4]['pubnumber']", propertyOffset: 4 },
  },
  // Finished pubnumber. Continue with normal markers again
  {
    description: "marker at $.content[5]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 90 },
    documentLocation: { jsonPath: "$.content[5]" },
  },
  // Skip to end of para before verse 1
  {
    description: "propertyValue at $.content[6]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 0 }, offset: 196 },
    documentLocation: { jsonPath: "$.content[6]['marker']", propertyOffset: 1 },
  },
  // First example of a verse marker
  {
    description: "marker at $.content[6].content[0]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 0 },
    documentLocation: { jsonPath: "$.content[6].content[0]" },
  },
  {
    description: "propertyValue at $.content[6].content[0]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 1 },
    documentLocation: { jsonPath: "$.content[6].content[0]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[6].content[0]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 2 },
    documentLocation: { jsonPath: "$.content[6].content[0]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[6].content[0]['number'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 3 },
    documentLocation: { jsonPath: "$.content[6].content[0]['number']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[6].content[0]['number'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 4 },
    documentLocation: { jsonPath: "$.content[6].content[0]['number']", propertyOffset: 1 },
  },
  // First example of an unclosed character marker
  {
    description: "marker at $.content[6].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 5 },
    documentLocation: { jsonPath: "$.content[6].content[1]" },
  },
  {
    description: "propertyValue at $.content[6].content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 6 },
    documentLocation: { jsonPath: "$.content[6].content[1]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[6].content[1]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 7 },
    documentLocation: { jsonPath: "$.content[6].content[1]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[6].content[1]['marker'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 8 },
    documentLocation: { jsonPath: "$.content[6].content[1]['marker']", propertyOffset: 2 },
  },
  {
    description: "textContent at $.content[6].content[1].content[0] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 1 }, offset: 9 },
    documentLocation: { jsonPath: "$.content[6].content[1].content[0]", offset: 0 },
  },
  // Skip to footnote
  {
    description: "marker at $.content[10].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 160 },
    documentLocation: { jsonPath: "$.content[10].content[1]" },
  },
  {
    description: "propertyValue at $.content[10].content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 161 },
    documentLocation: { jsonPath: "$.content[10].content[1]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[10].content[1]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 162 },
    documentLocation: { jsonPath: "$.content[10].content[1]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[10].content[1]['caller'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 163 },
    documentLocation: { jsonPath: "$.content[10].content[1]['caller']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[10].content[1]['caller'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 164 },
    documentLocation: { jsonPath: "$.content[10].content[1]['caller']", propertyOffset: 1 },
  },
  {
    description: "attributeMarker at $.content[10].content[1] key 'category'",
    locationType: "attributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 2 }, offset: 165 },
    documentLocation: { jsonPath: "$.content[10].content[1]", keyName: "category" },
  },
  // Skip to first example of closed character marker
  {
    description: "marker at $.content[16].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 33 },
    documentLocation: { jsonPath: "$.content[16].content[1]" },
  },
  {
    description: "propertyValue at $.content[16].content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 34 },
    documentLocation: { jsonPath: "$.content[16].content[1]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[16].content[1]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 35 },
    documentLocation: { jsonPath: "$.content[16].content[1]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[16].content[1]['marker'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 36 },
    documentLocation: { jsonPath: "$.content[16].content[1]['marker']", propertyOffset: 2 },
  },
  {
    description: "textContent at $.content[16].content[1].content[0] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 37 },
    documentLocation: { jsonPath: "$.content[16].content[1].content[0]", offset: 0 },
  },
  {
    description: "textContent at $.content[16].content[1].content[0] offset 1",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 38 },
    documentLocation: { jsonPath: "$.content[16].content[1].content[0]", offset: 1 },
  },
  {
    description: "closingMarker at $.content[16].content[1] offset 0",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 39 },
    documentLocation: { jsonPath: "$.content[16].content[1]", closingMarkerOffset: 0 },
  },
  {
    description: "closingMarker at $.content[16].content[1] offset 1",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 40 },
    documentLocation: { jsonPath: "$.content[16].content[1]", closingMarkerOffset: 1 },
  },
  {
    description: "closingMarker at $.content[16].content[1] offset 2",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 41 },
    documentLocation: { jsonPath: "$.content[16].content[1]", closingMarkerOffset: 2 },
  },
  {
    description: "closingMarker at $.content[16].content[1] offset 3",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 42 },
    documentLocation: { jsonPath: "$.content[16].content[1]", closingMarkerOffset: 3 },
  },
  {
    description: "textContent at $.content[16].content[2] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 43 },
    documentLocation: { jsonPath: "$.content[16].content[2]", offset: 0 },
  },
  // Skip to first example of marker with default attribute
  {
    description: "marker at $.content[18].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 156 },
    documentLocation: { jsonPath: "$.content[18].content[1]" },
  },
  {
    description: "propertyValue at $.content[18].content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 157 },
    documentLocation: { jsonPath: "$.content[18].content[1]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[18].content[1]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 158 },
    documentLocation: { jsonPath: "$.content[18].content[1]['marker']", propertyOffset: 1 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 0",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 159 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 0 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 1",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 160 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 1 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 2",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 161 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 2 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 3",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 162 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 3 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 4",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 163 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 4 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 5",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 164 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 5 },
  },
  {
    description: "textContent at $.content[18].content[1].content[0] offset 6",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 165 },
    documentLocation: { jsonPath: "$.content[18].content[1].content[0]", offset: 6 },
  },
  {
    description: "propertyValue at $.content[18].content[1]['lemma'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 166 },
    documentLocation: { jsonPath: "$.content[18].content[1]['lemma']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[18].content[1]['lemma'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 167 },
    documentLocation: { jsonPath: "$.content[18].content[1]['lemma']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[18].content[1]['lemma'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 168 },
    documentLocation: { jsonPath: "$.content[18].content[1]['lemma']", propertyOffset: 2 },
  },
  // Skip to first example of non-default closing marker attribute
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 0",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 532 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 0 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 1",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 533 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 1 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 2",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 534 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 2 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 3",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 535 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 3 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 4",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 536 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 4 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 5",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 537 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 5 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 6",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 538 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 6 },
  },
  {
    description: "attributeKey at $.content[20].content[1] key 'strong' offset 7",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 539 },
    documentLocation: { jsonPath: "$.content[20].content[1]", keyName: "strong", keyOffset: 7 },
  },
  {
    description: "propertyValue at $.content[20].content[1]['strong'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 540 },
    documentLocation: { jsonPath: "$.content[20].content[1]['strong']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[20].content[1]['strong'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 541 },
    documentLocation: { jsonPath: "$.content[20].content[1]['strong']", propertyOffset: 1 },
  },
  // Skip to first example of nested marker
  {
    description: "marker at $.content[34].content[1].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 2513 },
    documentLocation: { jsonPath: "$.content[34].content[1].content[1]" },
  },
  // The USFM offset for the + prefix (2514) for the nested character marker goes to the same location in USJ because there actually is no specification for how to represent this location in USJ. Not including here because it is not the same when translating locations in both directions
  {
    description: "propertyValue at $.content[34].content[1].content[1]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 3 }, offset: 2515 },
    documentLocation: {
      jsonPath: "$.content[34].content[1].content[1]['marker']",
      propertyOffset: 0,
    },
  },
  // Skip to first example of custom attribute on closing marker
  {
    description: "attributeKey at $.content[65].content[1] key 'x-custom-attribute-1' offset 0",
    locationType: "attributeKey",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 8 }, offset: 56 },
    documentLocation: {
      jsonPath: "$.content[65].content[1]",
      keyName: "x-custom-attribute-1",
      keyOffset: 0,
    },
  },
  // Skip to first example of optbreak
  {
    description: "marker at $.content[85].content[1]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 16 }, offset: 121 },
    documentLocation: { jsonPath: "$.content[85].content[1]" },
  },
  // The USFM offset for the second slash in optbreak (122) goes to the same location in USJ because there actually is no specification for how to represent this location in USJ. Not including here because it is not the same when translating locations in both directions Skip to first example of closed sidebar
  {
    description: "marker at $.content[140]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 370 },
    documentLocation: { jsonPath: "$.content[140]" },
  },
  {
    description: "propertyValue at $.content[140]['marker'] offset 0",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 371 },
    documentLocation: { jsonPath: "$.content[140]['marker']", propertyOffset: 0 },
  },
  {
    description: "propertyValue at $.content[140]['marker'] offset 1",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 372 },
    documentLocation: { jsonPath: "$.content[140]['marker']", propertyOffset: 1 },
  },
  {
    description: "propertyValue at $.content[140]['marker'] offset 2",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 373 },
    documentLocation: { jsonPath: "$.content[140]['marker']", propertyOffset: 2 },
  },
  {
    description: "propertyValue at $.content[140]['marker'] offset 3",
    locationType: "propertyValue",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 374 },
    documentLocation: { jsonPath: "$.content[140]['marker']", propertyOffset: 3 },
  },
  {
    description: "attributeMarker at $.content[140] key 'category'",
    locationType: "attributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 375 },
    documentLocation: { jsonPath: "$.content[140]", keyName: "category" },
  },
  // Skip to last character of `\cat*` closing attribute marker
  {
    description: "closingAttributeMarker at $.content[140] key 'category' offset 5",
    locationType: "closingAttributeMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 398 },
    documentLocation: {
      jsonPath: "$.content[140]",
      keyName: "category",
      keyClosingMarkerOffset: 5,
    },
  },
  {
    description: "marker at $.content[140].content[0]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 399 },
    documentLocation: { jsonPath: "$.content[140].content[0]" },
  },
  // Skip to second to last character before first example of closing marker for sidebar
  {
    description: "textContent at $.content[140].content[1].content[0] offset 78",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 636 },
    documentLocation: { jsonPath: "$.content[140].content[1].content[0]", offset: 78 },
  },
  {
    description: "textContent at $.content[140].content[1].content[0] offset 79",
    locationType: "textContent",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 637 },
    documentLocation: { jsonPath: "$.content[140].content[1].content[0]", offset: 79 },
  },
  // First example of closing marker for sidebar
  {
    description: "closingMarker at $.content[140] offset 0",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 638 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 0 },
  },
  {
    description: "closingMarker at $.content[140] offset 1",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 639 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 1 },
  },
  {
    description: "closingMarker at $.content[140] offset 2",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 640 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 2 },
  },
  {
    description: "closingMarker at $.content[140] offset 3",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 641 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 3 },
  },
  {
    description: "closingMarker at $.content[140] offset 4",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 642 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 4 },
  },
  {
    description: "closingMarker at $.content[140] offset 5",
    locationType: "closingMarker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 643 },
    documentLocation: { jsonPath: "$.content[140]", closingMarkerOffset: 5 },
  },
  // Skip to first example of a non-closed sidebar
  {
    description: "marker at $.content[142]",
    locationType: "marker",
    usfmVerseLocation: { verseRef: { book: "2SA", chapterNum: 1, verseNum: 26 }, offset: 826 },
    documentLocation: { jsonPath: "$.content[142]" },
  },
] as LocationEntry2Sa[];
