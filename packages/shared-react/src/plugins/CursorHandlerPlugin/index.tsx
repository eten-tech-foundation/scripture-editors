import { registerCursorHandlers } from "shared/plugins/CursorHandler";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useEffect } from "react";
import { LexicalNode } from "lexical";

export function CursorHandlerPlugin({
  canContainPlaceHolder,
  updateTags,
}: {
  canContainPlaceHolder?: (node: LexicalNode) => boolean;
  updateTags?: string[];
}) {
  const [editor] = useLexicalComposerContext();
  useEffect(() => {
    return registerCursorHandlers(editor, canContainPlaceHolder, updateTags);
  }, [canContainPlaceHolder, editor, updateTags]);
  return null;
}
