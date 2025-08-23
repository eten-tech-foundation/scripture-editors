import { useEffect, useState } from "react";
import Menu, { OptionItem } from "./Menu";
import { useFilteredItems } from "./Menu/useFilteredItems";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import LexicalMenuNavigation from "./LexicalMenuNavigation";

interface NodeSelectionMenuProps {
  options: OptionItem[];
  onSelectOption?: (option: OptionItem) => void;
  onClose?: () => void;
  inverse?: boolean;
  query?: string;
  menuOpenKey?: string;
}

export function NodeSelectionMenu(props: NodeSelectionMenuProps) {
  const { options, onSelectOption, onClose, inverse, query: controlledQuery, menuOpenKey } = props;
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
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (isControlled) return false;
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
  }, [editor, isControlled, localQuery, menuOpenKey, onClose]);

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
