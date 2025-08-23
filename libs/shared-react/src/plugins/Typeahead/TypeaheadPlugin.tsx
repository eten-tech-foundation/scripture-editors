import FloatingBoxAtCursor from "../FloatingBox/FloatingBoxAtCursor";
import { useTypeaheadData } from "./useTypeaheadData";
import { NodeSelectionMenu } from "../NodesMenu/NodeSelectionMenu";
import { executeSelectedItem } from "./executeSelectedItem";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OptionItem } from "../NodesMenu/Menu";

interface TypeaheadPluginProps {
  /** the string that will trigger the floatingMenu */
  trigger: string;
  items?: OptionItem[];
}

/**
 * A plugin that renders an autocomplete floating menu when the user triggers it
 * by typing in a trigger character or phrase
 *
 * @param trigger the string that will trigger the typeahead menu when typed into the editor
 * @param items an array of option items to be placed inside the menu
 * @returns
 */
export default function TypeaheadPlugin({ trigger, items }: TypeaheadPluginProps) {
  const [editor] = useLexicalComposerContext();
  const typeaheadData = useTypeaheadData(trigger);
  return (
    <FloatingBoxAtCursor isOpen={!!typeaheadData && !!items}>
      {({ placement }) => {
        return (
          items && (
            <NodeSelectionMenu
              query={typeaheadData?.match.matchingString}
              onSelectOption={(item) =>
                typeaheadData?.match && executeSelectedItem(editor, item, typeaheadData?.match)
              }
              options={items}
              inverse={placement === "top-start"}
            />
          )
        );
      }}
    </FloatingBoxAtCursor>
  );
}
