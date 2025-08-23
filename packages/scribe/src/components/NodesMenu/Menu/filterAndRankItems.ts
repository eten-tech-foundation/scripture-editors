export interface Item {
  [key: string]: unknown;
}

// Default filter function
const defaultFilter = <T extends Item>(item: T, query: string, filterBy: string): boolean => {
  return getSafeValue(item, filterBy).toLowerCase().includes(query.toLowerCase());
};

// Helper function to get the first string key of an object
const getFirstStringKey = <T extends Item>(obj: T): string => {
  return Object.keys(obj).find((key) => typeof obj[key] === "string") || "";
};

// Helper function to safely get a string value from an item
const getSafeValue = <T extends Item>(item: T, key: string): string => {
  const value = item[key];
  return typeof value === "string" ? value : String(value);
};

export interface SortingOptions {
  caseSensitive?: boolean;
  priorityOrder?: ("exact" | "startsWith" | "contains")[];
}

export interface FilterAndRankItems<T extends Item> {
  query: string;
  items: T[];
  filterBy?: keyof Pick<T, string>;
  filter?: (item: T, query: string) => boolean;
  sortBy?: keyof Pick<T, string>;
  sortingOptions?: SortingOptions;
}

export function filterAndRankItems<T extends Item>(
  options:
    | (Omit<FilterAndRankItems<T>, "filter"> & { filterBy: keyof Pick<T, string> })
    | (Omit<FilterAndRankItems<T>, "filterBy"> & {
        filter: (item: T, query: string) => boolean;
      })
    | FilterAndRankItems<T>,
): T[] {
  const { query, items, filterBy, filter, sortBy, sortingOptions } =
    options as FilterAndRankItems<T>;
  const { caseSensitive = false, priorityOrder = ["exact", "startsWith", "contains"] } =
    sortingOptions || {};

  const compareQuery = caseSensitive ? query : query.toLowerCase();

  let actualFilterBy: string;
  let actualFilter: (item: T, query: string) => boolean;

  if (filter) {
    actualFilter = filter;
    actualFilterBy = items.length > 0 ? getFirstStringKey(items[0]) : "";
  } else {
    actualFilterBy = filterBy || (items.length > 0 ? getFirstStringKey(items[0]) : "");
    actualFilter = (item: T, query: string) => defaultFilter(item, query, actualFilterBy);
  }

  const actualSortBy = sortBy || actualFilterBy;

  // Create a Map to cache lowercase versions of sortBy values
  const sortByCache = new Map<T, string>();

  return items
    .filter((item) => {
      try {
        return actualFilter(item, query);
      } catch (error) {
        console.warn(`Error filtering item:`, item, error);
        return false;
      }
    })
    .sort((a, b) => {
      const getTextLower = (item: T) => {
        if (!sortByCache.has(item)) {
          sortByCache.set(item, getSafeValue(item, actualSortBy).toLowerCase());
        }
        return sortByCache.get(item) ?? "";
      };

      const textA = caseSensitive ? getSafeValue(a, actualSortBy) : getTextLower(a);
      const textB = caseSensitive ? getSafeValue(b, actualSortBy) : getTextLower(b);

      for (const priority of priorityOrder) {
        switch (priority) {
          case "exact":
            if (textA === compareQuery && textB !== compareQuery) return -1;
            if (textB === compareQuery && textA !== compareQuery) return 1;
            break;
          case "startsWith":
            if (textA.startsWith(compareQuery) && !textB.startsWith(compareQuery)) return -1;
            if (textB.startsWith(compareQuery) && !textA.startsWith(compareQuery)) return 1;
            break;
          case "contains": {
            const indexA = textA.indexOf(compareQuery);
            const indexB = textB.indexOf(compareQuery);
            if (indexA !== -1 && indexB === -1) return -1;
            if (indexB !== -1 && indexA === -1) return 1;
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            break;
          }
        }
      }

      return textA.localeCompare(textB);
    });
}
