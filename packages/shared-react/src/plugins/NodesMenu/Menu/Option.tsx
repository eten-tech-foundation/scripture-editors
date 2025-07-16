import React, { useCallback, forwardRef } from "react";
import { useMenuContext } from "./MenuContext";

type OptionProps = {
  index: number;
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export const MenuOption = forwardRef<HTMLButtonElement, OptionProps>(
  ({ index, children, onMouseEnter, onClick, ...props }, ref) => {
    const {
      state: { activeIndex },
      setActiveIndex,
      setSelectedIndex,
      select,
    } = useMenuContext();

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        select();
        setSelectedIndex(-1);
        onClick?.(event);
      },
      [onClick, select, setSelectedIndex],
    );

    const handleMouseEnter = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        setActiveIndex(index);
        onMouseEnter?.(event);
      },
      [index, setActiveIndex, onMouseEnter],
    );
    return (
      <button
        ref={ref}
        role="menuitem"
        {...props}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        aria-selected={index !== undefined && activeIndex === index ? "true" : undefined}
        tabIndex={-1}
      >
        {children}
      </button>
    );
  },
);
