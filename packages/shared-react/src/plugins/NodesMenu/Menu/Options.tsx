import React, {
  useEffect,
  useMemo,
  Children,
  cloneElement,
  isValidElement,
  ReactElement,
  useRef,
} from "react";
import { useMenuContext } from "./MenuContext";
import { MenuOption } from "./Option";
import { OptionItem } from "./types";

type OptionElement = ReactElement<React.ComponentProps<typeof MenuOption>, typeof MenuOption>;

type MenuOptionsProps = Omit<React.HTMLAttributes<HTMLDivElement>, "children"> & {
  children:
    | OptionElement
    | OptionElement[]
    | ((menuItems: OptionItem[]) => OptionElement | OptionElement[]);
  autoIndex?: boolean;
};

export function MenuOptions({ children, autoIndex = true, ...divProps }: MenuOptionsProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    state: { activeIndex, menuItems },
  } = useMenuContext();

  const renderChildren = useMemo(
    () => (menuItems ? (typeof children === "function" ? children : () => children) : () => null),
    [children, menuItems],
  );

  const mappedChildren = useMemo(() => {
    const children = renderChildren(menuItems);
    if (!autoIndex) return children;

    return Children.map(children, (child, index) => {
      if (
        isValidElement<React.ComponentProps<typeof MenuOption>>(child) &&
        child.type === MenuOption &&
        child.props.index === undefined
      ) {
        return cloneElement(child, { index });
      }
      return child;
    });
  }, [renderChildren, autoIndex, menuItems]);

  useEffect(() => {
    if (menuRef.current) {
      const menuElement = menuRef.current;
      const selectedElement = menuElement.children[activeIndex] as HTMLElement;
      if (selectedElement) {
        const menuRect = menuElement.getBoundingClientRect();
        const selectedRect = selectedElement.getBoundingClientRect();

        if (selectedRect.bottom > menuRect.bottom) {
          menuElement.scrollTop += selectedRect.bottom - menuRect.bottom;
        } else if (selectedRect.top < menuRect.top) {
          menuElement.scrollTop -= menuRect.top - selectedRect.top;
        }
      }
    }
  }, [activeIndex]);

  return (
    <div ref={menuRef} role="menu" {...divProps}>
      {mappedChildren}
    </div>
  );
}
