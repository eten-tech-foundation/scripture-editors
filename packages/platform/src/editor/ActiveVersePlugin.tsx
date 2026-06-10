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
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  useEffect(() => {
    /** Switches the active verse para, updating CSS classes and ResizeObserver. */
    function setActivePara(key: string | null): void {
      if (activeKeyRef.current) {
        editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
      }
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;

      if (key) {
        const paraEl = editor.getElementByKey(key) as HTMLElement | null;
        if (paraEl) {
          updateVerseOffset(paraEl);
          paraEl.classList.add(ACTIVE_CLASS);
          // Re-measure whenever the paragraph resizes (window resize, font load, etc.)
          resizeObserverRef.current = new ResizeObserver(() => updateVerseOffset(paraEl));
          resizeObserverRef.current.observe(paraEl);
          activeKeyRef.current = key;
        } else {
          activeKeyRef.current = null;
        }
      } else {
        activeKeyRef.current = null;
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
        setActivePara(newActiveKey);
      } else if (newActiveKey) {
        // Key unchanged — re-measure in case font loading or layout changed.
        const paraEl = editor.getElementByKey(newActiveKey) as HTMLElement | null;
        if (paraEl) {
          updateVerseOffset(paraEl);
        } else {
          // Element gone without key change (node removed without selection change).
          setActivePara(null);
        }
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
      resizeObserverRef.current?.disconnect();
    };
  }, [editor]);

  return null;
}
