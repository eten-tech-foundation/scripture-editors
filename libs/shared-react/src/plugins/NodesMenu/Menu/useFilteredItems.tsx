import { useMemo } from "react";
import { filterAndRankItems, Item, FilterAndRankItems } from "./filterAndRankItems";

export function useFilteredItems<T extends Item>(
  props:
    | (Omit<FilterAndRankItems<T>, "filter"> & { filterBy: keyof Pick<T, string> })
    | (Omit<FilterAndRankItems<T>, "filterBy"> & {
        filter: (item: T, query: string) => boolean;
      }),
): T[] {
  const { query, items, filterBy, filter, sortBy, sortingOptions } = props as FilterAndRankItems<T>;

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
