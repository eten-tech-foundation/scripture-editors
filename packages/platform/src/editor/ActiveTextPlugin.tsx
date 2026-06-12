import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
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
  LexicalEditor,
  LexicalNode,
} from "lexical";
import { useEffect, useRef } from "react";
import { $isSomeVerseNode } from "shared-react";

/** Returns the top-level paragraph for the cursor, or null if no range selection. */
export function $getVerseParaFromSelection(selection: BaseSelection | null): ElementNode | null {
  if (!$isRangeSelection(selection)) return null;
  const topLevel = selection.anchor.getNode().getTopLevelElement();
  if (!topLevel) return null;
  return topLevel;
}

/** Returns true if the paragraph's only content beyond verse number nodes is whitespace. */
export function $isParaBodyEmpty(para: ElementNode): boolean {
  const nonVerseText = para
    .getChildren()
    .filter((child) => !$isSomeVerseNode(child))
    .map((child) => child.getTextContent())
    .join("");
  return nonVerseText.replace(/​/g, "").trim() === "";
}

function $paraHasVerse(para: ElementNode): boolean {
  return para.getChildren().some((c) => $isSomeVerseNode(c));
}

/**
 * Returns the key of the verse node (VerseNode or ImmutableVerseNode) immediately before
 * the cursor within `para`, plus the key of the verse node that follows it.
 *
 * Used to restrict the active-text outline box to a single verse section within paragraphs
 * that contain multiple \v markers (e.g. Matthew 1's \p paragraphs).
 *
 * - `activeVerseKey`: the last verse node at or before the cursor; null if no verse precedes
 *   the cursor position.
 * - `nextVerseKey`: the first verse node after the active one; when `activeVerseKey` is null
 *   (cursor before any verse), the first verse in the paragraph so the pre-verse intro section
 *   is bounded correctly; null when no subsequent verse exists in the paragraph.
 */
export function $getActiveVerseSiblings(
  para: ElementNode,
  selection: BaseSelection | null,
): { activeVerseKey: string | null; nextVerseKey: string | null } {
  if (!$isRangeSelection(selection)) return { activeVerseKey: null, nextVerseKey: null };

  const anchorNode = selection.anchor.getNode();

  // Walk up from the anchor to find its direct child of `para` (handles CharNode nesting etc.).
  let directChild: LexicalNode = anchorNode;
  for (;;) {
    const parent = directChild.getParent();
    if (parent === null || parent.is(para)) break;
    directChild = parent;
  }

  const children = para.getChildren();
  const directChildIndex = children.findIndex((c) => c.is(directChild));
  if (directChildIndex === -1) return { activeVerseKey: null, nextVerseKey: null };

  // Last verse node AT OR BEFORE the cursor position (inclusive of the cursor's own node).
  let activeVerseIndex = -1;
  let activeVerseKey: string | null = null;
  for (let i = directChildIndex; i >= 0; i--) {
    if ($isSomeVerseNode(children[i])) {
      activeVerseKey = children[i].getKey();
      activeVerseIndex = i;
      break;
    }
  }

  // First verse node AFTER the active verse.  When there is no active verse (cursor before any
  // \v), scan from the start so pre-verse intro content is bounded by the first verse.
  const searchFrom = activeVerseIndex === -1 ? 0 : activeVerseIndex + 1;
  let nextVerseKey: string | null = null;
  for (let i = searchFrom; i < children.length; i++) {
    if ($isSomeVerseNode(children[i])) {
      nextVerseKey = children[i].getKey();
      break;
    }
  }

  return { activeVerseKey, nextVerseKey };
}

/**
 * Sets `--active-verse-top` and `--active-verse-bottom` on the paragraph element so the
 * CSS `::before` outline covers only the active text section, not the whole paragraph.
 *
 * When `activeVerseKey` is null (paragraph with no verse node, e.g. a \q2 continuation),
 * both properties default to -2px, which produces the same full-paragraph box as before.
 */
function updateTextOutlineBounds(
  editor: LexicalEditor,
  paraKey: string,
  activeVerseKey: string | null,
  nextVerseKey: string | null,
): void {
  const paraEl = editor.getElementByKey(paraKey);
  if (!paraEl) return;

  const verseEl = activeVerseKey ? editor.getElementByKey(activeVerseKey) : null;
  const nextVerseEl = nextVerseKey ? editor.getElementByKey(nextVerseKey) : null;

  // top: 2px above the first line of the active verse span (or 2px above the paragraph top).
  const topOffset = verseEl ? verseEl.offsetTop - 2 : -2;

  // bottom: expressed as CSS `bottom: Xpx` (distance from the paragraph's bottom edge).
  // We want the box to extend 2px below the top edge of the next verse span.
  const paraHeight = paraEl.clientHeight;
  const bottomCSS = nextVerseEl ? Math.max(0, paraHeight - nextVerseEl.offsetTop - 2) : -2;

  paraEl.style.setProperty("--active-verse-top", `${topOffset}px`);
  paraEl.style.setProperty("--active-verse-bottom", `${bottomCSS}px`);
}

const ACTIVE_CLASS = "psc-active-text";
const EMPTY_CLASS = "psc-empty-text";

/**
 * Plugin that shows an outline box around the active text section (the verse range under the
 * cursor) and marks paragraphs with no body content as empty. Activated when
 * `viewOptions.hasActiveTextFocusBox` is true.
 *
 * @public
 */
export function ActiveTextPlugin(): null {
  const [editor] = useLexicalComposerContext();
  const activeKeyRef = useRef<string | null>(null);
  const activeVerseKeyRef = useRef<string | null>(null);
  const nextVerseKeyRef = useRef<string | null>(null);

  useEffect(() => {
    // Re-measures verse section bounds when the active paragraph's height changes due to
    // text reflow (window resize, content edits that change line count, etc.).
    const resizeObserver = new ResizeObserver(() => {
      if (activeKeyRef.current) {
        updateTextOutlineBounds(
          editor,
          activeKeyRef.current,
          activeVerseKeyRef.current,
          nextVerseKeyRef.current,
        );
      }
    });

    function setActivePara(
      key: string | null,
      verseKey: string | null,
      nextVerseKey: string | null,
    ): void {
      if (activeKeyRef.current) {
        const oldEl = editor.getElementByKey(activeKeyRef.current);
        if (oldEl) {
          oldEl.classList.remove(ACTIVE_CLASS);
          oldEl.style.removeProperty("--active-verse-top");
          oldEl.style.removeProperty("--active-verse-bottom");
          resizeObserver.unobserve(oldEl);
        }
      }
      activeKeyRef.current = key;
      activeVerseKeyRef.current = verseKey;
      nextVerseKeyRef.current = nextVerseKey;
      if (key) {
        const el = editor.getElementByKey(key);
        if (el) {
          el.classList.add(ACTIVE_CLASS);
          updateTextOutlineBounds(editor, key, verseKey, nextVerseKey);
          resizeObserver.observe(el);
        }
      }
    }

    function readActiveState(): {
      newActiveKey: string | null;
      newActiveVerseKey: string | null;
      newNextVerseKey: string | null;
    } {
      const selection = $getSelection();
      const activePara = $getVerseParaFromSelection(selection);
      const newActiveKey = activePara?.getKey() ?? null;
      let newActiveVerseKey: string | null = null;
      let newNextVerseKey: string | null = null;
      if (activePara) {
        const siblings = $getActiveVerseSiblings(activePara, selection);
        newActiveVerseKey = siblings.activeVerseKey;
        newNextVerseKey = siblings.nextVerseKey;
      }
      return { newActiveKey, newActiveVerseKey, newNextVerseKey };
    }

    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        const { newActiveKey, newActiveVerseKey, newNextVerseKey, emptyKeys, nonEmptyKeys } =
          editorState.read(() => {
            const { newActiveKey, newActiveVerseKey, newNextVerseKey } = readActiveState();

            const emptyKeys: string[] = [];
            const nonEmptyKeys: string[] = [];
            $getRoot()
              .getChildren()
              .forEach((child) => {
                if (!$isElementNode(child)) return;
                if (!$paraHasVerse(child)) return;
                if ($isParaBodyEmpty(child)) {
                  emptyKeys.push(child.getKey());
                } else {
                  nonEmptyKeys.push(child.getKey());
                }
              });

            return { newActiveKey, newActiveVerseKey, newNextVerseKey, emptyKeys, nonEmptyKeys };
          });

        if (newActiveKey !== activeKeyRef.current) {
          setActivePara(newActiveKey, newActiveVerseKey, newNextVerseKey);
        } else if (
          newActiveVerseKey !== activeVerseKeyRef.current ||
          newNextVerseKey !== nextVerseKeyRef.current
        ) {
          // Same paragraph, cursor moved to a different verse section — re-measure bounds only.
          activeVerseKeyRef.current = newActiveVerseKey;
          nextVerseKeyRef.current = newNextVerseKey;
          if (newActiveKey)
            updateTextOutlineBounds(editor, newActiveKey, newActiveVerseKey, newNextVerseKey);
        }

        emptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.add(EMPTY_CLASS));
        nonEmptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.remove(EMPTY_CLASS));
      }),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setActivePara(null, null, null);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          const { newActiveKey, newActiveVerseKey, newNextVerseKey } = editor
            .getEditorState()
            .read(readActiveState);
          if (
            newActiveKey !== activeKeyRef.current ||
            newActiveVerseKey !== activeVerseKeyRef.current
          ) {
            setActivePara(newActiveKey, newActiveVerseKey, newNextVerseKey);
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      () => resizeObserver.disconnect(),
    );
  }, [editor]);

  return null;
}
