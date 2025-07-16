import { useMemo } from "react";
import { filterAndRankItems, Item, FilterAndRankItems } from "./filterAndRankItems";

// Overload 1: Using filterBy as a string
export function useFilteredItems<T extends Item>(
  props: Omit<FilterAndRankItems<T>, "filter"> & { filterBy: keyof Pick<T, string> },
): T[];

// Overload 2: Using filter as a function
export function useFilteredItems<T extends Item>(
  props: Omit<FilterAndRankItems<T>, "filterBy"> & {
    filter: (item: T, query: string) => boolean;
  },
): T[];

// Implementation
export function useFilteredItems<T extends Item>({
  query,
  items,
  filterBy,
  filter,
  sortBy,
  sortingOptions,
}: FilterAndRankItems<T>) {
  const filteredItems = useMemo(() => {
    return filterAndRankItems({
      query,
      items,
      filterBy,
      filter,
      sortBy,
      sortingOptions,
    });
  }, [query, items, filterBy, filter, sortBy, sortingOptions]);

  return filteredItems;
}
