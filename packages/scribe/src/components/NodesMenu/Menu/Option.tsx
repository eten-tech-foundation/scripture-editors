import { ButtonHTMLAttributes, forwardRef, MouseEvent, ReactNode, useCallback } from "react";
import { useMenuContext } from "./useMenuContext";

type OptionProps = {
  index: number;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  onMouseEnter?: (event: MouseEvent<HTMLButtonElement>) => void;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export const MenuOption = forwardRef<HTMLButtonElement, OptionProps>(
  ({ index, children, onMouseEnter, onClick, ...props }, ref) => {
    const {
      state: { activeIndex },
      setActiveIndex,
      setSelectedIndex,
      select,
    } = useMenuContext();

    const handleClick = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
        select();
        setSelectedIndex(-1);
        onClick?.(event);
      },
      [onClick, select, setSelectedIndex],
    );

    const handleMouseEnter = useCallback(
      (event: MouseEvent<HTMLButtonElement>) => {
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
        aria-selected={index !== undefined && activeIndex === index}
        tabIndex={-1}
      >
        {children}
      </button>
    );
  },
);
