import { useState, useCallback, useMemo } from "react";
import { OptionItem } from "./types";

export interface State {
  menuItems: OptionItem[];
  activeIndex: number;
  selectedIndex: number;
  onSelectOption: (option: OptionItem) => void;
}

export function useMenuCore(
  initialMenuItems?: OptionItem[],
  onSelectOption?: (option: OptionItem) => void,
) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const menuItems = useMemo(() => initialMenuItems ?? [], [initialMenuItems]);

  const state: State = {
    menuItems,
    activeIndex,
    selectedIndex,
    onSelectOption: onSelectOption ?? (() => undefined),
  };

  const moveUp = useCallback(() => {
    setActiveIndex((prev) => {
      const optionsCount = menuItems.length;
      return optionsCount ? (prev - 1 + optionsCount) % optionsCount : 0;
    });
  }, [menuItems.length]);

  const moveDown = useCallback(() => {
    setActiveIndex((prev) => {
      const optionsCount = menuItems.length;
      return optionsCount ? (prev + 1) % optionsCount : 0;
    });
  }, [menuItems.length]);

  const select = useCallback(() => {
    const optionsCount = menuItems.length;
    if (activeIndex >= 0 && activeIndex < optionsCount) {
      const selectedOption = menuItems[activeIndex];
      onSelectOption?.(selectedOption);
      setSelectedIndex(activeIndex);
    }
  }, [activeIndex, menuItems, onSelectOption]);

  return {
    state,
    moveUp,
    moveDown,
    select,
    setActiveIndex,
    setSelectedIndex,
  };
}
