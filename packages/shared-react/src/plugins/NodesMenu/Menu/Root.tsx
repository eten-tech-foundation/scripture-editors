import React from "react";
import { MenuContext } from "./MenuContext";
import { useMenuCore } from "./useMenuCore";
import { OptionItem } from "./types";

type MenuRootProps = {
  children: React.ReactNode;
  menuItems?: OptionItem[];
  onSelectOption?: (option: OptionItem) => void;
  autoIndex?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

export function MenuRoot({ children, menuItems, onSelectOption, ...divProps }: MenuRootProps) {
  const menuContext = useMenuCore(menuItems, onSelectOption);
  return (
    <MenuContext.Provider value={menuContext}>
      <div {...divProps}>{children}</div>
    </MenuContext.Provider>
  );
}
