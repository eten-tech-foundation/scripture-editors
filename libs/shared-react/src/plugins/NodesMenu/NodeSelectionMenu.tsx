import { useEffect, useState } from "react";
import Menu, { OptionItem } from "./Menu";
import { useFilteredItems } from "./Menu/useFilteredItems";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import LexicalMenuNavigation from "./LexicalMenuNavigation";

/**
 * Keys that are a modifier's OWN keydown rather than input. A modifier fires its own keydown
 * before the chord (or the shifted character) it is part of arrives, so the menu must sit still
 * for it: closing here would end the menu mid-chord, e.g. on the Shift of a `\+w` nested marker.
 */
const MODIFIER_KEYS: readonly string[] = ["Shift", "Control", "Alt", "Meta"];

interface NodeSelectionMenuProps {
  options: OptionItem[];
  onSelectOption?: (option: OptionItem) => void;
  onClose?: () => void;
  inverse?: boolean;
  query?: string;
  menuOpenKey?: string;
  /**
   * Reports the live filter state to the owner: the typed query and the options surviving it.
   * Menus whose owner needs to act on what was TYPED (rather than on what is highlighted) read
   * it from here instead of re-deriving it, so this component stays the single place the filter
   * rule lives. Fires on mount and after every query change.
   */
  onFilterChange?: (query: string, filteredOptions: OptionItem[]) => void;
  /**
   * Keys the query capture must DECLINE (return `false`, no preventDefault) so the owner's own
   * key handling can claim them, wherever it sits in the same command-priority chain. Needed
   * because within one Lexical priority tier the handler order follows registration order,
   * which React effect timing can put in either arrangement — an owner cannot otherwise
   * guarantee it sees a key before this capture swallows it as a filter character (the active
   * `\` palette's Space commit is the motivating case).
   */
  passthroughKeys?: readonly string[];
}

export function NodeSelectionMenu(props: NodeSelectionMenuProps) {
  const {
    options,
    onSelectOption,
    onClose,
    inverse,
    query: controlledQuery,
    menuOpenKey,
    onFilterChange,
    passthroughKeys,
  } = props;
  const [editor] = useLexicalComposerContext();
  const isControlled = controlledQuery !== undefined;
  const [query, setQuery] = useState("");
  const localQuery: string = isControlled ? (controlledQuery ?? "") : query;

  const filteredOptions = useFilteredItems({ query: localQuery, items: options, filterBy: "name" });

  const handleOptionSelection = (option: OptionItem) => {
    onClose?.();
    if (onSelectOption) onSelectOption(option);
    else option.action(editor);
  };

  useEffect(() => {
    onFilterChange?.(localQuery, filteredOptions);
  }, [onFilterChange, localQuery, filteredOptions]);

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (isControlled) return false;
        if (passthroughKeys?.includes(event.key)) return false;
        if (MODIFIER_KEYS.includes(event.key)) return false;
        if (
          (event.ctrlKey || event.metaKey || event.altKey) &&
          !event.getModifierState("AltGraph")
        ) {
          // A real chord (Ctrl+Z, Ctrl+C, Cmd+V, Ctrl+A, …) is never query input: ingesting it
          // would append its letter to the filter, and claiming it would leave undo, copy, paste
          // and select-all dead for as long as the menu is open. Close the menu — the marker it
          // was offering is not what the user is reaching for — and let the chord through
          // unclaimed, to whatever handles it. Shift is deliberately absent from the check: a
          // shifted character is still a character, and capitalized markers filter with it —
          // and so is AltGr, which Windows/Linux layouts dispatch as Ctrl+Alt: `@` on a German
          // layout or `ł` on Polish is ordinary character input, not a command chord.
          onClose?.();
          return false;
        }
        const actions: { [key: string]: () => void } = {
          Escape: () => onClose?.(),
          Backspace: () => {
            if (localQuery.length === 0) {
              onClose?.();
            } else {
              setQuery((prev) => prev.slice(0, -1));
            }
          },
        };
        const action = actions[event.key];
        if (action) {
          event.stopPropagation();
          event.preventDefault();
          action();
          return true;
        } else if (event.key.length === 1) {
          event.stopPropagation();
          event.preventDefault();
          if (event.key !== menuOpenKey) setQuery((prev) => prev + event.key);
          return true;
        }
        return false;
      },
      COMMAND_PRIORITY_HIGH,
    );
  }, [editor, isControlled, localQuery, menuOpenKey, onClose, passthroughKeys]);

  return (
    <Menu.Root
      className={`autocomplete-menu-container ${inverse ? "inverse" : ""}`}
      menuItems={filteredOptions}
      onSelectOption={(item) => handleOptionSelection(item)}
    >
      {!isControlled && <input value={localQuery} type="text" disabled />}
      <LexicalMenuNavigation />
      <Menu.Options className="autocomplete-menu-options" autoIndex={false}>
        {(options) => {
          const mappedOptions = options.map((option, index) => (
            <Menu.Option index={index} key={option.name}>
              <span className="label">{option.label ?? option.name}</span>
              <span className="description">{option.description}</span>
            </Menu.Option>
          ));
          return mappedOptions;
        }}
      </Menu.Options>
    </Menu.Root>
  );
}
