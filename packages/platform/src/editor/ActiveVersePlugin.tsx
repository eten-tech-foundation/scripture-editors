import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  BaseSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  ElementNode,
  FOCUS_COMMAND,
} from "lexical";
import { useEffect, useRef } from "react";
import { $isVerseNode } from "shared";
import { $isImmutableVerseNode } from "shared-react";

/** Returns the top-level paragraph for the cursor, or null if no range selection. */
export function $getVerseParaFromSelection(selection: BaseSelection | null): ElementNode | null {
  if (!$isRangeSelection(selection)) return null;
  const topLevel = selection.anchor.getNode().getTopLevelElement();
  if (!topLevel) return null;
  return topLevel;
}

/** Returns true if the paragraph's only content beyond verse number nodes is whitespace. */
export function $isVerseParaEmpty(para: ElementNode): boolean {
  const nonVerseText = para
    .getChildren()
    .filter((child) => !$isVerseNode(child) && !$isImmutableVerseNode(child))
    .map((child) => child.getTextContent())
    .join("");
  return nonVerseText.replace(/​/g, "").trim() === "";
}

function $paraHasVerse(para: ElementNode): boolean {
  return para.getChildren().some((c) => $isVerseNode(c) || $isImmutableVerseNode(c));
}

const ACTIVE_CLASS = "psc-active-verse";
const EMPTY_CLASS = "psc-empty-verse";

export function ActiveVersePlugin(): null {
  const [editor] = useLexicalComposerContext();
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    function setActivePara(key: string | null): void {
      if (activeKeyRef.current) {
        editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
      }
      activeKeyRef.current = key;
      if (key) {
        editor.getElementByKey(key)?.classList.add(ACTIVE_CLASS);
      }
    }

    const unsubscribeListener = editor.registerUpdateListener(({ editorState }) => {
      const { newActiveKey, emptyKeys, nonEmptyKeys } = editorState.read(() => {
        const newActiveKey = $getVerseParaFromSelection($getSelection())?.getKey() ?? null;

        const emptyKeys: string[] = [];
        const nonEmptyKeys: string[] = [];

        $getRoot()
          .getChildren()
          .forEach((child) => {
            if (!$isElementNode(child)) return;
            if (!$paraHasVerse(child)) return;
            if ($isVerseParaEmpty(child)) {
              emptyKeys.push(child.getKey());
            } else {
              nonEmptyKeys.push(child.getKey());
            }
          });

        return { newActiveKey, emptyKeys, nonEmptyKeys };
      });

      if (newActiveKey !== activeKeyRef.current) {
        setActivePara(newActiveKey);
      }

      emptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.add(EMPTY_CLASS));
      nonEmptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.remove(EMPTY_CLASS));
    });

    const unsubscribeBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        setActivePara(null);
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    const unsubscribeFocus = editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        const newActiveKey =
          editor
            .getEditorState()
            .read(() => $getVerseParaFromSelection($getSelection())?.getKey() ?? null) ?? null;
        if (newActiveKey !== activeKeyRef.current) {
          setActivePara(newActiveKey);
        }
        return false;
      },
      COMMAND_PRIORITY_LOW,
    );

    return () => {
      unsubscribeListener();
      unsubscribeBlur();
      unsubscribeFocus();
    };
  }, [editor]);

  return null;
}
