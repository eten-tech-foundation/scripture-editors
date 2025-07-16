import { LexicalEditor, $getSelection, $isRangeSelection, $isTextNode } from "lexical";
import { SuggestionsTextMatch } from "shared/plugins/Typeahead";
import { OptionItem } from "../NodesMenu/Menu";

export function executeSelectedItem(
  editor: LexicalEditor,
  selectedItem: OptionItem,
  typeaheadMatch: SuggestionsTextMatch,
) {
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const { replaceableString } = typeaheadMatch;
      const start = selection.anchor.offset - replaceableString.length;
      const end = selection.anchor.offset;
      const anchorNode = selection.anchor.getNode();
      if (!$isTextNode(anchorNode)) return;
      selection.setTextNodeRange(anchorNode, start, anchorNode, end);
      selection.removeText();
    }
    selectedItem.action(editor);
  });
}
