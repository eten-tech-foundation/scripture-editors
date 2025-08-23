import { usfmMarkers } from "./usfmMarkers.js";
import usfmMarkersOverwrites from "./usfmMarkersOverwrites.js";
import { Marker, CategoryType } from "./usfmTypes.js";

//NOTE: We can make this reusable if we agree on a common usfmMarkers object for all editors and use the overwrites objects as a parameter for this function.
function getMarker(marker: string): Marker | undefined {
  const baseMarker = usfmMarkers[marker];
  const overwrite = usfmMarkersOverwrites[marker];

  if (!baseMarker) {
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
