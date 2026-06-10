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
  return nonVerseText.replace(/\u200B/g, "").trim() === "";
}

const ACTIVE_CLASS = "psc-active-verse";
const EMPTY_CLASS = "psc-empty-verse";

/** Measures the verse number span's right edge and stores it as --verse-end on the para element.
 *  The ::before pseudo-element uses this to start the outline box just after the verse number,
 *  regardless of text-indent or verse number digit count. */
function updateVerseOffset(paraEl: HTMLElement): void {
  const verseSpan = paraEl.querySelector<HTMLElement>(".usfm_v, .verse");
  if (!verseSpan) return;
  const paraRect = paraEl.getBoundingClientRect();
  const verseRect = verseSpan.getBoundingClientRect();
  const offset = Math.round(verseRect.right - paraRect.left) + 4;
  paraEl.style.setProperty("--verse-end", `${offset}px`);
}

export function ActiveVersePlugin(): null {
  const [editor] = useLexicalComposerContext();
  const activeKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribeListener = editor.registerUpdateListener(({ editorState }) => {
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
          const paraEl = editor.getElementByKey(newActiveKey);
          if (paraEl) {
            updateVerseOffset(paraEl as HTMLElement);
            paraEl.classList.add(ACTIVE_CLASS);
          }
        }
        activeKeyRef.current = newActiveKey;
      } else if (newActiveKey) {
        // Re-measure on every update in case font loading or resize changed the layout.
        const paraEl = editor.getElementByKey(newActiveKey);
        if (paraEl) updateVerseOffset(paraEl as HTMLElement);
      }

      emptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.add(EMPTY_CLASS));
      nonEmptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.remove(EMPTY_CLASS));
    });

    const unsubscribeBlur = editor.registerCommand(
      BLUR_COMMAND,
      () => {
        if (activeKeyRef.current) {
          editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
          activeKeyRef.current = null;
        }
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
          if (activeKeyRef.current) {
            editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
          }
          if (newActiveKey) {
            const paraEl = editor.getElementByKey(newActiveKey);
            if (paraEl) {
              updateVerseOffset(paraEl as HTMLElement);
              paraEl.classList.add(ACTIVE_CLASS);
            }
          }
          activeKeyRef.current = newActiveKey;
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
