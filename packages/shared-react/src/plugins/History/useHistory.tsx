/*
 * This code is adapted from the Lexical project at Facebook's GitHub repository.
 * Original source: https://github.com/facebook/lexical
 */

import type { HistoryMergeListener } from "shared/plugins/History";
import type { LexicalEditor } from "lexical";

import { createEmptyHistoryState, registerHistory } from "shared/plugins/History";
import { useEffect, useMemo } from "react";
import { HistoryState } from "shared/plugins/History/HistoryManager";

export function useHistory(
  editor: LexicalEditor,
  externalHistoryState?: HistoryState,
  onChange?: HistoryMergeListener,
  delay = 1000,
): void {
  const historyState: HistoryState = useMemo(
    () => externalHistoryState || createEmptyHistoryState(),
    [externalHistoryState],
  );

  useEffect(() => {
    return registerHistory(editor, historyState, onChange, delay);
  }, [delay, editor, onChange, historyState]);
}
