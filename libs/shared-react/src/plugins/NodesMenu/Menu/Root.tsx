import { HTMLAttributes, ReactNode } from "react";
import { MenuContext } from "./MenuContext";
import { useMenuCore } from "./useMenuCore";
import type { OptionItem } from "./types";

type MenuRootProps = {
  children: ReactNode;
  menuItems?: OptionItem[];
  onSelectOption?: (option: OptionItem) => void;
  autoIndex?: boolean;
} & HTMLAttributes<HTMLDivElement>;

export function MenuRoot({ children, menuItems, onSelectOption, ...divProps }: MenuRootProps) {
  const menuContext = useMenuCore(menuItems, onSelectOption);
  return (
    <MenuContext.Provider value={menuContext}>
      <div {...divProps}>{children}</div>
    </MenuContext.Provider>
  );
}
