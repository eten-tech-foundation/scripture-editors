import { generateFiles, Tree } from "@nx/devkit";
import * as path from "path";
import { MarkersDataGeneratorSchema } from "./schema";

import axios from "axios";
import { createMarkersDictionaryFromUsfmSty } from "./utils/generateMarkersDictionary";
import { simplifyMarkersDictionary } from "./utils/simplifyMarkersDictionary";
import { CategoryType } from "./utils/categoriesMap";

export async function markersDataGenerator(tree: Tree, options: MarkersDataGeneratorSchema) {
  const projectRoot = options.outputPath;

  // URL (legacy) or workspace-relative file path (vendored snapshot — deterministic regeneration).
  let usfmStyleContent: string;
  if (options.usfmStyleUrl.startsWith("http")) {
    const response = await axios.get(options.usfmStyleUrl);
    usfmStyleContent = response.data;
  } else {
    const buffer = tree.read(options.usfmStyleUrl);
    if (!buffer) throw new Error(`Cannot read stylesheet file: ${options.usfmStyleUrl}`);
    usfmStyleContent = buffer.toString();
  }

  const markersDictionary = createMarkersDictionaryFromUsfmSty(usfmStyleContent);
  const simplifiedDictionary = simplifyMarkersDictionary(markersDictionary, [
    //Unsupported categories
    CategoryType.Uncategorized,
    CategoryType.CenterTables,
    CategoryType.SpecialFeatures,
    CategoryType.Tables,
    CategoryType.RightTables,
    CategoryType.PeripheralMaterials,
    CategoryType.PeripheralReferences,
  ]);

  /** Function to capitalize the first letter of a string */
  function capitalizeFirstLetter(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  const simplifiedDictionaryString = Object.entries(simplifiedDictionary)
    .map(([key, value]) => {
      return `  "${key}": {
    category: CategoryType.${value.category ? capitalizeFirstLetter(value.category) : CategoryType.Uncategorized},
    type: MarkerType.${value.type ? capitalizeFirstLetter(value.type) : "Unknown"},
    description: "${value.description ? value.description.replaceAll(`"`, `'`) : ""}",
    hasEndMarker: ${value.hasEndMarker},
    children: ${JSON.stringify(value.children, null, 4)}
  }`;
    })
    .join(",\n");

  // Rich StyleInfo table: ALL markers (no category exclusion), full validation +
  // presentation fields. Entries without a StyleType are skipped — PT9 treats
  // them as scUnknownStyle, i.e. the same as absent from the sheet.
  /** .sty Color ints are Windows COLORREF (0x00BBGGRR); 0/absent = black = omitted (PT9 skips black). */
  function toHexColor(color: number | undefined): string | undefined {
    if (!color) return undefined;
    const r = color & 0xff;
    const g = (color >> 8) & 0xff;
    const b = (color >> 16) & 0xff;
    return `#${[r, g, b]
      .map((c) => c.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()}`;
  }
  const styleInfoMarkers: { [marker: string]: object } = {};
  for (const [key, value] of Object.entries(markersDictionary)) {
    if (!value.styleType) continue;
    const styles = value.styles ?? {};
    const rawEntry: { [field: string]: unknown } = {
      marker: key,
      styleType: value.styleType.toLowerCase(),
      endMarker: value.endMarker,
      occursUnder: value.occursUnder,
      rank: value.rank,
      textType: value.textType,
      textProperties: value.textProperties,
      notRepeatable: value.notRepeatable,
      description: value.description,
      fontName: styles.fontName,
      fontSize: styles.fontSize,
      bold: styles.bold,
      italic: styles.italic,
      underline: styles.underline,
      smallCaps: styles.smallcaps,
      subscript: styles.subscript,
      superscript: styles.superscript,
      color: toHexColor(styles.color),
      justification: styles.justification ? styles.justification.toLowerCase() : undefined,
      firstLineIndent: styles.firstLineIndent,
      leftMargin: styles.leftMargin,
      rightMargin: styles.rightMargin,
      spaceBefore: styles.spaceBefore,
      spaceAfter: styles.spaceAfter,
      lineSpacing: styles.lineSpacing,
    };
    // Object.fromEntries + filter (rather than looping with a dynamic `delete`) drops
    // undefined fields without mutating a dynamically-keyed object (banned by
    // @typescript-eslint/no-dynamic-delete). JSON.stringify would omit them anyway;
    // this keeps the in-memory entry itself free of undefined-valued keys too.
    const entry = Object.fromEntries(
      Object.entries(rawEntry).filter(([, fieldValue]) => fieldValue !== undefined),
    );
    styleInfoMarkers[key] = entry;
  }
  const styleInfoJson = JSON.stringify({ markers: styleInfoMarkers }, undefined, 2);

  generateFiles(tree, path.join(__dirname, "files"), projectRoot, {
    ...options,
    simplifiedDictionaryString: String.raw`${simplifiedDictionaryString}`,
    styleInfoJson,
  });
}

export default markersDataGenerator;
