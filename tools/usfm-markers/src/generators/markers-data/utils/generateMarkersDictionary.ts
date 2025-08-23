// This file contains utility functions and type definitions for getting usfm markers data.
// It includes functions to parse marker strings, convert marker styles to CSS styles, and type definitions for various marker properties.

import categoriesMap, { CategoryType } from "./categoriesMap";

export enum TextType {
  ChapterNumber = "ChapterNumber",
  VerseNumber = "VerseNumber",
  VerseText = "VerseText",
  Section = "Section",
  Title = "Title",
  NoteText = "NoteText",
  Other = "Other",
}

export enum StyleType {
  Paragraph = "Paragraph",
  Character = "Character",
  Note = "Note",
}

export enum Justification {
  Left = "Left",
  Center = "Center",
  Right = "Right",
}

export enum TextProperty {
  Paragraph = "paragraph",
  Publishable = "publishable",
  Vernacular = "vernacular",
  Nonvernacular = "nonvernacular",
  Poetic = "poetic",
  Chapter = "chapter",
  Verse = "verse",
  Note = "note",
  Crossreference = "crossreference",
  Nonpublishable = "nonpublishable",
  Book = "book",
  Level_1 = "level_1",
  Level_2 = "level_2",
  Level_3 = "level_3",
  Level_4 = "level_4",
}

export interface MarkersDictionary {
  [marker: string]: {
    marker: string;
    name: string;
    description: string;
    occursUnder?: string[];
    childrenMarkers?: string[];
    rank?: number;
    textType: TextType;
    textProperties: TextProperty[];
    styleType: StyleType;
    endMarker?: string;
    styles: {
      fontSize?: number;
      bold?: boolean;
      italic?: boolean;
      underline?: boolean;
      smallcaps?: boolean;
      justification?: Justification;
      spaceBefore?: number;
      spaceAfter?: number;
      leftMargin?: number;
      rightMargin?: number;
      firstLineIndent?: number;
      color?: number;
      superscript?: boolean;
    };
    category: CategoryType;
  };
}

export interface MarkersChildrenMap {
  [marker: string]: Partial<{ [key in CategoryType]: string[] }>;
}

/**
 * Creates a markers dictionary object from a string.
 * @param markersString - The usfm.sty string containing marker definitions
 * @returns The markers json dictionary.
 */
export const createMarkersDictionaryFromUsfmSty = (markersString: string): MarkersDictionary => {
  const markers: MarkersDictionary = {};
  const lines = markersString.split("\n");
  let currentMarker: string | null = null;
  let currentMarkerData: Partial<MarkersDictionary[string]> = {};

  /**
   * Parses text properties from a string.
   * @param props - The string containing text properties.
   * @returns An array of text properties.
   */
  const parseTextProperties = (props: string): TextProperty[] => {
    return props.split(" ").map((prop) => prop as TextProperty);
  };

  for (const _line of lines) {
    const line = _line.trim();
    if (line.startsWith("\\Marker ")) {
      if (currentMarker) {
        markers[currentMarker] = currentMarkerData as MarkersDictionary[string];
      }
      currentMarker = line.split(" ")[1];
      const category = categoriesMap[currentMarker] || CategoryType.Uncategorized;
      currentMarkerData = { marker: currentMarker, category };
    } else if (line.startsWith("\\")) {
      const [key, ...valueParts] = line.slice(1).split(" ");
      const value = valueParts.join(" ");

      if (!currentMarkerData.styles) currentMarkerData.styles = {};
      switch (key) {
        case "Name":
          currentMarkerData.name = value;
          break;
        case "Description":
          currentMarkerData.description = value;
          break;
        case "OccursUnder":
          currentMarkerData.occursUnder = value.split(" ");
          // Add this marker as a child to its parent markers

          value.split(" ").forEach((parent) => {
            if (markers[parent] && currentMarker) {
              markers[parent].childrenMarkers ??= [];
              markers[parent].childrenMarkers?.push(currentMarker);
            }
          });
          break;
        case "Rank":
          currentMarkerData.rank = parseInt(value);
          break;
        case "TextType":
          currentMarkerData.textType = value as TextType;
          break;
        case "TextProperties":
          currentMarkerData.textProperties = parseTextProperties(value);
          break;
        case "StyleType":
          currentMarkerData.styleType = value as StyleType;
          break;
        case "Endmarker":
          currentMarkerData.endMarker = value;
          break;
        case "FontSize":
          currentMarkerData.styles.fontSize = parseInt(value);
          break;
        case "SpaceBefore":
          currentMarkerData.styles.spaceBefore = parseInt(value);
          break;
        case "SpaceAfter":
          currentMarkerData.styles.spaceAfter = parseInt(value);
          break;
        case "LeftMargin":
          currentMarkerData.styles.leftMargin = parseFloat(value);
          break;
        case "RightMargin":
          currentMarkerData.styles.rightMargin = parseFloat(value);
          break;
        case "FirstLineIndent":
          currentMarkerData.styles.firstLineIndent = parseFloat(value);
          break;
        case "Bold":
          currentMarkerData.styles.bold = true;
          break;
        case "Italic":
          currentMarkerData.styles.italic = true;
          break;
        case "Underline":
          currentMarkerData.styles.underline = true;
          break;
        case "Smallcaps":
          currentMarkerData.styles.smallcaps = true;
          break;
        case "Superscript":
          currentMarkerData.styles.superscript = true;
          break;
        case "Justification":
          currentMarkerData.styles.justification = value as Justification;
          break;
        case "Color":
          currentMarkerData.styles.color = parseInt(value);
          break;
      }
    }
  }

  if (currentMarker) {
    markers[currentMarker] = currentMarkerData as MarkersDictionary[string];
  }

  return markers;
};

/**
 * Converts marker styles to CSS styles.
 * @param styles - The styles object from the markers dictionary.
 * @returns A partial CSS style object.
 */
export const toCssStyle = (
  styles: MarkersDictionary[string]["styles"],
): Partial<HTMLElement["style"]> => ({
  fontSize: styles.fontSize ? `${styles.fontSize}pt` : undefined,
  fontWeight: styles.bold ? "bold" : undefined,
  fontStyle: styles.italic ? "italic" : undefined,
  textDecoration: styles.underline ? "underline" : undefined,
  fontVariant: styles.smallcaps ? "small-caps" : undefined,
  textAlign: styles.justification?.toLowerCase(),
  marginTop: styles.spaceBefore ? `${styles.spaceBefore}pt` : undefined,
  marginBottom: styles.spaceAfter ? `${styles.spaceAfter}pt` : undefined,
  marginLeft: styles.leftMargin ? `${styles.leftMargin}pt` : undefined,
  marginRight: styles.rightMargin ? `${styles.rightMargin}pt` : undefined,
  textIndent: styles.firstLineIndent ? `${styles.firstLineIndent}pt` : undefined,
  color: styles.color ? `#${styles.color.toString(16).padStart(6, "0")}` : undefined,
  verticalAlign: styles.superscript ? "super" : undefined,
});

/**
 * Generates a MarkersChildrenMap from a given MarkersDictionary.
 * @param markersDictionary - The dictionary containing marker definitions.
 * @returns The markers children map.
 */
export const generateMarkersChildrenMap = (
  markersDictionary: MarkersDictionary,
): MarkersChildrenMap => {
  const markersChildrenMap: MarkersChildrenMap = {};

  for (const marker in markersDictionary) {
    const markerData = markersDictionary[marker];
    if (markerData.childrenMarkers) {
      markersChildrenMap[marker] = markersChildrenMap[marker] || {};
      markerData.childrenMarkers.forEach((childMarker) => {
        const category = markersDictionary[childMarker].category;
        if (category) {
          markersChildrenMap[marker][category] = markersChildrenMap[marker][category] || [];
          markersChildrenMap[marker][category]?.push(childMarker);
        }
      });
    }
  }

  return markersChildrenMap;
};
