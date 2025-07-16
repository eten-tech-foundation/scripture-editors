import { useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useMenuActions } from "./useMenuActions";
import { COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND } from "lexical";

export const useLexicalMenuNavigation = () => {
  const menu = useMenuActions();
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const handleEvent = (event: KeyboardEvent) => {
      const actions: { [key: string]: () => void } = {
        ArrowDown: () => menu?.moveDown(),
        ArrowUp: () => menu?.moveUp(),
        Enter: () => menu?.select(),
        Tab: () => menu?.select(),
      };

      const action = actions[event.key];
      if (action) {
        action();
        event.preventDefault();
        event.stopPropagation();
        return true;
      }

      return false;
    };

    return editor.registerCommand(KEY_DOWN_COMMAND, handleEvent, COMMAND_PRIORITY_HIGH);
  }, [editor, menu]);
};
