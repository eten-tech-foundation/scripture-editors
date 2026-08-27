import { usfmMarkers } from "./usfmMarkers.js";
import usfmMarkersOverwrites from "./usfmMarkersOverwrites.js";
import { Marker, CategoryType } from "./usfmTypes.js";

//NOTE: We can make this reusable if we agree on a common usfmMarkers object for all editors and use the overwrites objects as a parameter for this function.
function getMarker(marker: string): Marker | undefined {
  // Own-property lookups: both tables are plain object literals, so a bare index resolves
  // Object.prototype members — a marker named `constructor`, `toString`, `__proto__`, … answered
  // with a Function, which spreads to a truthy Marker carrying no category/type/hasEndMarker.
  // Callers read a truthy result as "this marker is known", so a stray `\constructor` typed by a
  // user classified as a real marker with an undefined type. (`createMarkerLookup` in
  // styleInfo.ts guards its own table the same way.)
  const baseMarker = Object.hasOwn(usfmMarkers, marker) ? usfmMarkers[marker] : undefined;
  const overwrite = Object.hasOwn(usfmMarkersOverwrites, marker)
    ? usfmMarkersOverwrites[marker]
    : undefined;

  if (!baseMarker) {
    // The overwrites file can ADD markers the generated data lacks — but with no base to fill
    // gaps, only an overwrite carrying the FULL required Marker shape may stand alone. A partial
    // overwrite (e.g. `type` set but no category/description/hasEndMarker) is not a valid Marker,
    // so the `as Marker` cast would lie about it; refuse rather than return a malformed object.
    if (
      overwrite?.category !== undefined &&
      overwrite.type !== undefined &&
      overwrite.description !== undefined &&
      overwrite.hasEndMarker !== undefined
    )
      // A COPY: the table entry is module-level shared state, and handing it out lets any caller
      // that edits the returned Marker corrupt that marker for the whole process.
      return { ...overwrite } as Marker;
    return undefined;
  }

  if (!overwrite) {
    return baseMarker;
  }

  let mergedChildren = baseMarker.children ? { ...baseMarker.children } : undefined;

  if (overwrite.children === null) {
    mergedChildren = undefined;
  }

  if (overwrite.children) {
    mergedChildren = mergedChildren || {};
    for (const [category, modification] of Object.entries(overwrite.children)) {
      const categoryType = category as CategoryType;
      if (modification === null) {
        // Remove the entire category if it exists
        Reflect.deleteProperty(mergedChildren, categoryType);
      } else {
        // Update children for this category
        let currentChildren = mergedChildren[categoryType] || [];
        if (modification.remove) {
          currentChildren = currentChildren.filter((child) => !modification.remove.includes(child));
        }
        if (modification.add) {
          currentChildren = [...new Set([...currentChildren, ...modification.add])];
        }
        if (currentChildren.length > 0) {
          mergedChildren[categoryType] = currentChildren;
        } else {
          Reflect.deleteProperty(mergedChildren, categoryType);
        }
      }
    }

    // If mergedChildren is empty, set it to undefined
    if (Object.keys(mergedChildren).length === 0) {
      mergedChildren = undefined;
    }
  }

  return {
    ...baseMarker,
    ...overwrite,
    children: mergedChildren,
  };
}

export default getMarker;
