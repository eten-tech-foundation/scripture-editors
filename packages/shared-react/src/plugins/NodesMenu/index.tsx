import { $getSelection, $isRangeSelection } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback, useEffect, useState } from "react";
import FloatingBoxAtCursor from "../FloatingBox/FloatingBoxAtCursor";
import { NodeSelectionMenu } from "./NodeSelectionMenu";
import { OptionItem } from "./Menu";

export default function NodesMenu({ trigger, items }: { trigger: string; items?: OptionItem[] }) {
  const [editor] = useLexicalComposerContext();
  const [isOpen, setIsOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
        editor.focus();
      } else if (e.key === trigger && !isOpen) {
        e.preventDefault();
        setIsOpen(true);
      }
    },
    [editor, trigger, isOpen],
  );

  useEffect(() => {
    return editor.registerRootListener((root) => {
      if (!root) return;
      root.addEventListener("keydown", handleKeyDown);
      return () => {
        root.removeEventListener("keydown", handleKeyDown);
      };
    });
  }, [editor, handleKeyDown]);

  // Close the menu when the selection changes
  useEffect(() => {
    return editor.registerUpdateListener(({ prevEditorState, editorState }) => {
      const prevSelection = prevEditorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        return selection;
      });
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || prevSelection?.is(selection)) return;
        setIsOpen(false);
      });
    });
  }, [editor]);

  return (
    items && (
      <FloatingBoxAtCursor isOpen={isOpen}>
        {({ placement }) => (
          <NodeSelectionMenu
            options={items}
            onClose={() => setIsOpen(false)}
            inverse={placement === "top-start"}
          />
        )}
      </FloatingBoxAtCursor>
    )
  );
}
