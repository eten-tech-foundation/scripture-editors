import { createContext, useContext } from "react";
import { useMenuCore } from "./useMenuCore";

type MenuContextType = ReturnType<typeof useMenuCore>;

const MenuContext = createContext<MenuContextType | undefined>(undefined);

export function useMenuContext() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("useMenuContext must be used within a MenuProvider");
  }
  return context;
}

export { MenuContext };
