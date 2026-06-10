import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  BaseSelection,
  ElementNode,
} from "lexical";
import { useEffect, useRef } from "react";
import { $isVerseNode } from "shared";
import { $isImmutableVerseNode } from "shared-react";

/**
 * Returns the top-level verse-containing paragraph for the given selection,
 * or null if the cursor is not inside a verse paragraph.
 */
export function $getVerseParaFromSelection(selection: BaseSelection | null): ElementNode | null {
  if (!$isRangeSelection(selection)) return null;
  const topLevel = selection.anchor.getNode().getTopLevelElement();
  if (!topLevel) return null;
  const hasVerse = topLevel
    .getChildren()
    .some((child) => $isVerseNode(child) || $isImmutableVerseNode(child));
  return hasVerse ? topLevel : null;
}

/**
 * Returns true if the paragraph has no text content beyond its verse number node.
 * Strips zero-width spaces (U+200B) that ImmutableVerseNode injects around the number.
 */
export function $isVerseParaEmpty(para: ElementNode): boolean {
  const nonVerseText = para
    .getChildren()
    .filter((child) => !$isVerseNode(child) && !$isImmutableVerseNode(child))
    .map((child) => child.getTextContent())
    .join("");
  return nonVerseText.replace(/​/g, "").trim() === "";
}

const ACTIVE_CLASS = "psc-active-verse";
const EMPTY_CLASS = "psc-empty-verse";

export function ActiveVersePlugin(): null {
  const [editor] = useLexicalComposerContext();
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      const { newActiveKey, emptyKeys, nonEmptyKeys } = editorState.read(() => {
        const newActiveKey = $getVerseParaFromSelection($getSelection())?.getKey() ?? null;

        const emptyKeys: string[] = [];
        const nonEmptyKeys: string[] = [];

        $getRoot()
          .getChildren()
          .forEach((child) => {
            if (!$isElementNode(child)) return;
            const hasVerse = child
              .getChildren()
              .some((c) => $isVerseNode(c) || $isImmutableVerseNode(c));
            if (!hasVerse) return;
            if ($isVerseParaEmpty(child)) {
              emptyKeys.push(child.getKey());
            } else {
              nonEmptyKeys.push(child.getKey());
            }
          });

        return { newActiveKey, emptyKeys, nonEmptyKeys };
      });

      if (newActiveKey !== activeKeyRef.current) {
        if (activeKeyRef.current) {
          editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
        }
        if (newActiveKey) {
          editor.getElementByKey(newActiveKey)?.classList.add(ACTIVE_CLASS);
        }
        activeKeyRef.current = newActiveKey;
      }

      emptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.add(EMPTY_CLASS));
      nonEmptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.remove(EMPTY_CLASS));
    });
  }, [editor]);

  return null;
}
