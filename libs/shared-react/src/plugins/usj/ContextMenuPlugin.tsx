/**
 * Adapted from https://github.com/facebook/lexical/blob/main/packages/lexical-playground/src/plugins/ContextMenuPlugin/index.tsx
 */

import { pasteSelection, pasteSelectionAsPlainText } from "./clipboard.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { COPY_COMMAND, CUT_COMMAND } from "lexical";
import { ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
      key={option.title}
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
            key={option.title}
            option={option}
          />
        ))}
      </ul>
    </div>
  );
}

export class ContextMenuOption {
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
    this.title = title;
    this.onSelect = options.onSelect.bind(this);
    this.isDisabled = options.isDisabled || false;
  }
}

/**
 * Checks if the given HTML element is an editor input.
 * @param element - The HTML element to check.
 * @param editorInputClassName - The class name that identifies an editor input. Defaults to "editor-input".
 * @returns `true` if the element is the editor input, `false` otherwise.
 */
function isEditorInput(
  element: HTMLElement | null | undefined,
  editorInputClassName = "editor-input",
): boolean {
  if (!element) return false;

  return element.classList.contains(editorInputClassName);
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
  const editorInputClassNameRef = useRef<string | undefined>(undefined);

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

  useEffect(() => {
    editorInputClassNameRef.current = editor.getRootElement()?.className ?? "";
  }, [editor]);

  // Register context menu event on editor root
  useEffect(() => {
    return editor.registerRootListener((rootElement) => {
      if (!rootElement) return;

      const handleContextMenu = (event: MouseEvent) => {
        const target = event.target as HTMLElement;
        if (
          isEditorInput(target, editorInputClassNameRef.current) ||
          isImmutableChapterElement(target)
        ) {
          return;
        }
        event.preventDefault();
        setMenuState({ isOpen: true, x: event.clientX, y: event.clientY });
        setSelectedIndex(undefined);
      };

      rootElement.addEventListener("contextmenu", handleContextMenu);
      return () => rootElement.removeEventListener("contextmenu", handleContextMenu);
    });
  }, [editor]);

  // Close menu on scroll
  useEffect(() => {
    const handleScroll = () => {
      closeMenu();
    };
    globalThis.addEventListener("scroll", handleScroll, true);
    return () => globalThis.removeEventListener("scroll", handleScroll, true);
  }, [closeMenu]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuState.isOpen) return;
    const handlePointerDown = () => {
      closeMenu();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuState.isOpen, closeMenu]);

  // Close menu on Escape
  useEffect(() => {
    if (!menuState.isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuState.isOpen, closeMenu]);

  useEffect(
    () =>
      editor.registerEditableListener((editable) => {
        setIsReadonly(!editable);
      }),
    [editor],
  );

  if (!menuState.isOpen) return null;

  return ReactDOM.createPortal(
    <div
      className="typeahead-popover auto-embed-menu"
      style={{
        left: menuState.x,
        position: "fixed",
        top: menuState.y,
        userSelect: "none",
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
