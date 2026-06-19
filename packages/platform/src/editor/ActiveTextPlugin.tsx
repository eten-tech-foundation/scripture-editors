import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getNearestNodeFromDOMNode,
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
import { $isImmutableTypedTextNode, $isMarkerNode, ZWSP } from "shared";
import { $isSomeVerseNode, ViewOptions } from "shared-react";

const ACTIVE_CLASS = "psc-active-text";
const EMPTY_CLASS = "psc-empty-text";

/**
 * Plugin that outlines the paragraph under the cursor and marks individual verses with no
 * body content as empty. No-op unless `viewOptions.hasActiveTextFocusBox` is true.
 */
export function ActiveTextPlugin({ viewOptions }: { viewOptions: ViewOptions | undefined }): null {
  const [editor] = useLexicalComposerContext();
  const activeKeyRef = useRef<string>(undefined);
  const isEnabled = viewOptions?.hasActiveTextFocusBox ?? false;

  useEffect(() => {
    if (!isEnabled) return;

    function setActivePara(key: string | undefined): void {
      if (activeKeyRef.current) {
        editor.getElementByKey(activeKeyRef.current)?.classList.remove(ACTIVE_CLASS);
      }
      activeKeyRef.current = key;
      if (key) {
        editor.getElementByKey(key)?.classList.add(ACTIVE_CLASS);
      }
    }

    // Clicking the ellipsis placeholder (rendered as ::after on the empty verse span) hits the
    // verse element itself, which is a decorator node — Lexical's default cursor placement leaves
    // the user with no obvious caret inside the empty verse's section. Move the caret to the slot
    // immediately after the verse in its paragraph so typing extends the empty verse.
    function placeCursorAfterEmptyVerse(event: MouseEvent): void {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const verseEl = target.closest(`.${EMPTY_CLASS}`);
      if (!verseEl) return;
      editor.update(() => {
        const node = $getNearestNodeFromDOMNode(verseEl);
        if (!$isSomeVerseNode(node)) return;
        const para = node.getParent();
        if (!$isElementNode(para)) return;
        const after = node.getIndexWithinParent() + 1;
        para.select(after, after);
      });
    }

    const unsubscribers = [
      editor.registerRootListener((rootElement, prevRootElement) => {
        prevRootElement?.removeEventListener("click", placeCursorAfterEmptyVerse);
        rootElement?.addEventListener("click", placeCursorAfterEmptyVerse);
      }),
      editor.registerUpdateListener(({ editorState }) => {
        const { newActiveKey, emptyKeys, nonEmptyKeys } = editorState.read(() => {
          const newActiveKey = $getActiveParaKey();
          const emptyKeys: string[] = [];
          const nonEmptyKeys: string[] = [];
          $getRoot()
            .getChildren()
            .forEach((child) => {
              if (!$isElementNode(child)) return;
              const { emptyKeys: e, nonEmptyKeys: n } = $getEmptyVerseStatus(child);
              emptyKeys.push(...e);
              nonEmptyKeys.push(...n);
            });
          return { newActiveKey, emptyKeys, nonEmptyKeys };
        });

        if (newActiveKey !== activeKeyRef.current) setActivePara(newActiveKey);

        emptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.add(EMPTY_CLASS));
        nonEmptyKeys.forEach((key) => editor.getElementByKey(key)?.classList.remove(EMPTY_CLASS));
      }),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          setActivePara(undefined);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          const newActiveKey = editor.getEditorState().read($getActiveParaKey);
          if (newActiveKey !== activeKeyRef.current) setActivePara(newActiveKey);
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    ];

    // Initial sync: registerUpdateListener does not fire on registration, so a mount with an
    // already-focused editor (route reload, focus restored by browser) would otherwise leave the
    // active outline missing until the user moves the cursor.
    setActivePara(editor.getEditorState().read($getActiveParaKey));

    return mergeRegister(...unsubscribers);
  }, [editor, isEnabled]);

  return null;
}

/** Reads the active paragraph's key from the current selection. Must run inside an editor read. */
function $getActiveParaKey(): string | undefined {
  return $getParaFromSelection($getSelection() ?? undefined)?.getKey();
}

/**
 * Returns the top-level paragraph for the cursor, or undefined if no range selection. This is any
 * paragraph the cursor lands in — verse-bearing paragraphs, section headings, book code paragraph,
 * empty paragraphs, etc.
 */
export function $getParaFromSelection(
  selection: BaseSelection | undefined,
): ElementNode | undefined {
  if (!$isRangeSelection(selection)) return undefined;
  return selection.anchor.getNode().getTopLevelElement() ?? undefined;
}

/**
 * Classifies each verse in the paragraph by whether its "section" — the children between this
 * verse marker and the next verse marker (or end of paragraph) — has any non-whitespace body text.
 * Marker-prefix nodes (the paragraph's leading `\p` marker / immutable typed text) and ZWSPs are
 * ignored. Used to apply `psc-empty-text` per verse so the ellipsis placeholder renders next to
 * every empty verse number, not just verses that occupy their own paragraph.
 */
export function $getEmptyVerseStatus(para: ElementNode): {
  emptyKeys: string[];
  nonEmptyKeys: string[];
} {
  const children = para.getChildren();
  const emptyKeys: string[] = [];
  const nonEmptyKeys: string[] = [];
  for (let i = 0; i < children.length; i++) {
    const verse = children[i];
    if (!$isSomeVerseNode(verse)) continue;
    let sectionHasBody = false;
    for (let j = i + 1; j < children.length; j++) {
      const sibling = children[j];
      if ($isSomeVerseNode(sibling)) break;
      if ($isImmutableTypedTextNode(sibling) || $isMarkerNode(sibling)) continue;
      if (sibling.getTextContent().replaceAll(ZWSP, "").trim() !== "") {
        sectionHasBody = true;
        break;
      }
    }
    (sectionHasBody ? nonEmptyKeys : emptyKeys).push(verse.getKey());
  }
  return { emptyKeys, nonEmptyKeys };
}
