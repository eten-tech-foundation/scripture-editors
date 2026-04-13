/**
 * Adapted from https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/ContextMenuPlugin/index.tsx
 */

import { pasteSelection, pasteSelectionAsPlainText } from "./clipboard.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COPY_COMMAND, CUT_COMMAND } from "lexical";
import {
  ReactElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as ReactDOM from "react-dom";
import { isImmutableChapterElement } from "shared";

/**
 * A context menu option to add to the editor context menu.
 *
 * @public
 */
export interface ContextMenuOptionConfig {
  /** Display title of the menu item. */
  title: string;
  /** Callback invoked when the menu item is selected. */
  onSelect: () => void;
  /** Whether the menu item is disabled. */
  isDisabled?: boolean;
}

function ContextMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  option: ContextMenuOption;
}) {
  let className = "item";
  if (isSelected) {
    className += " selected";
  }
  if (option.isDisabled) {
    className += " disabled";
  }
  return (
    <li
      tabIndex={-1}
      className={className}
      role="option"
      aria-selected={isSelected}
      aria-disabled={option.isDisabled}
      id={"typeahead-item-" + index}
      onMouseEnter={onMouseEnter}
      onClick={option.isDisabled ? undefined : onClick}
    >
      <span className="text">{option.title}</span>
    </li>
  );
}

function ContextMenu({
  options,
  selectedItemIndex,
  onOptionClick,
  onOptionMouseEnter,
}: {
  selectedItemIndex: number | undefined;
  onOptionClick: (option: ContextMenuOption, index: number) => void;
  onOptionMouseEnter: (index: number) => void;
  options: ContextMenuOption[];
}) {
  return (
    <div className="typeahead-popover">
      <ul>
        {options.map((option: ContextMenuOption, i: number) => (
          <ContextMenuItem
            index={i}
            isSelected={selectedItemIndex === i}
            onClick={() => onOptionClick(option, i)}
            onMouseEnter={() => onOptionMouseEnter(i)}
            key={option.key}
            option={option}
          />
        ))}
      </ul>
    </div>
  );
}

let optionKeyCounter = 0;

export class ContextMenuOption {
  key: string;
  title: string;
  onSelect: () => void;
  isDisabled: boolean;

  constructor(
    title: string,
    options: {
      onSelect: () => void;
      isDisabled?: boolean;
    },
  ) {
    this.key = `context-menu-option-${optionKeyCounter++}`;
    this.title = title;
    this.onSelect = options.onSelect.bind(this);
    this.isDisabled = options.isDisabled || false;
  }
}

export function ContextMenuPlugin({
  options: extraOptions,
}: {
  options?: ContextMenuOptionConfig[];
} = {}): ReactElement | null {
  const [editor] = useLexicalComposerContext();
  const [isReadonly, setIsReadonly] = useState(() => !editor.isEditable());
  const [menuState, setMenuState] = useState<{ isOpen: boolean; x: number; y: number }>({
    isOpen: false,
    x: 0,
    y: 0,
  });
  const [selectedIndex, setSelectedIndex] = useState<number | undefined>(undefined);

  const options = useMemo(() => {
    const builtIn = [
      new ContextMenuOption(`Cut`, {
        onSelect: () => {
          editor.dispatchCommand(CUT_COMMAND, null);
        },
        isDisabled: isReadonly,
      }),
      new ContextMenuOption(`Copy`, {
        onSelect: () => {
          editor.dispatchCommand(COPY_COMMAND, null);
        },
      }),
      new ContextMenuOption(`Paste`, {
        onSelect: () => {
          pasteSelection(editor);
        },
        isDisabled: isReadonly,
      }),
      new ContextMenuOption(`Paste as Plain Text`, {
        onSelect: () => {
          pasteSelectionAsPlainText(editor);
        },
        isDisabled: isReadonly,
      }),
    ];
    const extra = (extraOptions ?? []).map(
      (opt) =>
        new ContextMenuOption(opt.title, { onSelect: opt.onSelect, isDisabled: opt.isDisabled }),
    );
    return [...builtIn, ...extra];
  }, [editor, isReadonly, extraOptions]);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, isOpen: false }));
    setSelectedIndex(undefined);
  }, []);

  // Register context menu event on editor root
  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (editor.getRootElement() === target || isImmutableChapterElement(target)) {
        return;
      }
      event.preventDefault();
      setMenuState({ isOpen: true, x: event.clientX, y: event.clientY });
      setSelectedIndex(undefined);
    };

    return editor.registerRootListener((rootElement, prevRootElement) => {
      prevRootElement?.removeEventListener("contextmenu", handleContextMenu);
      if (!rootElement) return;
      rootElement.addEventListener("contextmenu", handleContextMenu);
    });
  }, [editor]);

  // Close menu on scroll
  useEffect(() => {
    if (!menuState.isOpen) return;
    const handleScroll = () => {
      closeMenu();
    };
    globalThis.addEventListener("scroll", handleScroll, true);
    return () => globalThis.removeEventListener("scroll", handleScroll, true);
  }, [menuState.isOpen, closeMenu]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuState.isOpen) return;
    const handlePointerDown = () => {
      closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuState.isOpen, closeMenu]);

  // Keyboard navigation and close on Escape
  useEffect(() => {
    if (!menuState.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((prev) => (prev === undefined ? 0 : (prev + 1) % options.length));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        setSelectedIndex((prev) =>
          prev === undefined ? options.length - 1 : (prev - 1 + options.length) % options.length,
        );
      } else if (event.key === "Enter" && selectedIndex !== undefined) {
        event.preventDefault();
        event.stopPropagation();
        const option = options[selectedIndex];
        if (option && !option.isDisabled) {
          editor.update(() => {
            option.onSelect();
          });
          closeMenu();
        }
      }
    };
    // Use capture phase so this fires before Lexical's own keydown handler,
    // which would otherwise consume arrow keys and move the editor cursor.
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [menuState.isOpen, closeMenu, options, selectedIndex, editor]);

  useEffect(
    () =>
      editor.registerEditableListener((editable) => {
        setIsReadonly(!editable);
      }),
    [editor],
  );

  const menuRef = useRef<HTMLDivElement>(null);

  // Clamp menu position to viewport bounds before first paint to prevent off-screen rendering.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    const clampedLeft = Math.max(0, Math.min(menuState.x, globalThis.innerWidth - width));
    const clampedTop = Math.max(0, Math.min(menuState.y, globalThis.innerHeight - height));
    menu.style.left = `${clampedLeft}px`;
    menu.style.top = `${clampedTop}px`;
    menu.style.visibility = "visible";
  }, [menuState.isOpen, menuState.x, menuState.y]);

  if (!menuState.isOpen) return null;

  return ReactDOM.createPortal(
    <div
      ref={menuRef}
      className="typeahead-popover auto-embed-menu"
      style={{
        left: menuState.x,
        position: "fixed",
        top: menuState.y,
        userSelect: "none",
        visibility: "hidden",
        width: 200,
        zIndex: 9999,
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <ContextMenu
        options={options}
        selectedItemIndex={selectedIndex}
        onOptionClick={(option: ContextMenuOption) => {
          if (!option.isDisabled) {
            editor.update(() => {
              option.onSelect();
            });
            closeMenu();
          }
        }}
        onOptionMouseEnter={(index: number) => {
          setSelectedIndex(index);
        }}
      />
    </div>,
    document.body,
  );
}
