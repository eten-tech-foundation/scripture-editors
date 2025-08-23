import { CategoryType } from "./categoriesMap";
import { MarkersDictionary, StyleType } from "./generateMarkersDictionary";

export interface SimplifiedMarker {
  category?: CategoryType;
  type?: StyleType;
  description?: string;
  hasEndMarker?: boolean;
  children?: Partial<{ [categoryType in CategoryType]: string[] }>;
}

interface SimplifiedDictionary {
  [marker: string]: SimplifiedMarker;
}

export function simplifyMarkersDictionary(
  markersDictionary: MarkersDictionary,
  excludeCategories: CategoryType[] = [],
): SimplifiedDictionary {
  const simplifiedDictionary: SimplifiedDictionary = {};

  for (const [marker, markerData] of Object.entries(markersDictionary)) {
    if (excludeCategories.includes(markerData.category)) continue;
    simplifiedDictionary[marker] = {
      category: markerData.category,
      type: markerData.styleType,
      description: markerData.description,
      hasEndMarker: !!markerData.endMarker,
    };

    if (markerData.childrenMarkers && markerData.childrenMarkers.length > 0) {
      simplifiedDictionary[marker].children = {};
      for (const childMarker of markerData.childrenMarkers) {
        const childData = markersDictionary[childMarker];
        if (childData && !excludeCategories.includes(childData.category)) {
          const category = childData.category;
          if (category) {
            simplifiedDictionary[marker].children[category] ??= [];
            simplifiedDictionary[marker].children[category]?.push(childMarker);
          }
        }
      }
    }
  }

  return simplifiedDictionary;
}
