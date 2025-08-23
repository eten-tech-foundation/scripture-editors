import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useCallback, useEffect, useState } from "react";
import { registerTypeAheadListener, SuggestionsTextMatch, TriggerFn } from "shared";

export interface TypeaheadData {
  match: SuggestionsTextMatch;
  range: Range;
}

export function useTypeaheadData(trigger?: string | TriggerFn) {
  const [editor] = useLexicalComposerContext();
  const [typeaheadData, setTypeaheadData] = useState<TypeaheadData>();

  const onTypeahead = useCallback(
    (response: { match: SuggestionsTextMatch; range: Range } | null) => {
      setTypeaheadData(response ?? undefined);
    },
    [],
  );

  useEffect(() => {
    return registerTypeAheadListener(editor, trigger, onTypeahead);
  }, [editor, trigger, onTypeahead]);

  return typeaheadData;
}
