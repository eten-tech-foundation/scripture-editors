import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { SerializedVerseRef } from "@sillsdev/scripture";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  SELECTION_CHANGE_COMMAND,
} from "lexical";
import { MutableRefObject, useEffect, useRef } from "react";
import {
  $findChapter,
  $findNextChapter,
  $findThisChapter,
  $isBookNode,
  $isParaNode,
  BookNode,
  CURSOR_CHANGE_TAG,
  getSelectionStartNode,
  isVerseInRange,
  isVerseRange,
  removeNodeAndAfter,
  removeNodesBeforeNode,
  VerseNode,
} from "shared";
import {
  $findThisVerse,
  $findVerseOrPara,
  $getEffectiveVerseForBcv,
  $resolveVerseNode,
  ImmutableVerseNode,
} from "shared-react";

/**
 * A component (plugin) that keeps the Scripture reference updated.
 * @param scrRef - Scripture reference.
 * @param onScrRefChange - Callback function when the Scripture reference has changed.
 * @returns null, i.e. no DOM elements.
 */
export default function ScriptureReferencePlugin({
  scrRef,
  onScrRefChange,
}: {
  scrRef: SerializedVerseRef;
  onScrRefChange: (scrRef: SerializedVerseRef) => void;
}): null {
  const [editor] = useLexicalComposerContext();
  /** Prevents the cursor being moved again after a selection has changed. */
  const hasSelectionChangedRef = useRef(false);
  /** Prevents the `scrRef` updating again after the cursor has moved. */
  const hasCursorMovedRef = useRef(false);
  const { book, chapterNum, verseNum } = scrRef;
  /** Latest scrRef for book sync (avoids re-registering listeners when chapter/verse changes). */
  const scrRefRef = useRef(scrRef);
  const onScrRefChangeRef = useRef(onScrRefChange);
  useEffect(() => {
    scrRefRef.current = scrRef;
    onScrRefChangeRef.current = onScrRefChange;
  }, [scrRef, onScrRefChange]);

  // Book node created: move cursor to the verse start once a new BookNode appears after the
  // initial load (e.g. a different book's document has finished mounting). Re-registers on every
  // chapterNum/verseNum change so the closure captures the latest target position; safe to
  // re-register because skipInitialization: true means re-registering never replays existing
  // BookNodes, only genuinely new "created" mutations going forward.
  useEffect(
    () =>
      editor.registerMutationListener(
        BookNode,
        (nodeMutations) => {
          editor.update(
            () => {
              for (const [nodeKey, mutation] of nodeMutations) {
                const bookNode = $getNodeByKey<BookNode>(nodeKey);
                if (bookNode && $isBookNode(bookNode) && mutation === "created") {
                  $moveCursorToVerseStart(chapterNum, verseNum, hasCursorMovedRef);
                }
              }
            },
            { tag: CURSOR_CHANGE_TAG },
          );
        },
        { skipInitialization: true },
      ),
    [editor, chapterNum, verseNum],
  );

  // Book node sync: correct scrRef.book to match the *currently loaded document's* BookNode
  // (initial tree + later updates/replacements). Registered once per editor instance ([editor]
  // only) rather than re-registering on every chapterNum/verseNum change - scrRefRef/
  // onScrRefChangeRef already track the latest values, so re-registration isn't needed for
  // freshness, and re-registering would replay the skipInitialization: false initialization pass
  // against whatever document is currently mounted. On a chapter/verse-only navigation (or a
  // cross-book navigation still awaiting its new document to load) that document is stale, so a
  // replay would incorrectly echo the OLD book paired with the NEW chapter/verse back to the
  // host. Registering once means this only fires for genuine BookNode mutations: the initial
  // mount (skipInitialization: false's replay) and any later real document swap.
  useEffect(
    () =>
      editor.registerMutationListener(
        BookNode,
        (nodeMutations) => {
          editor.update(
            () => {
              for (const [nodeKey, mutation] of nodeMutations) {
                if (mutation === "destroyed") continue;
                const bookNode = $getNodeByKey<BookNode>(nodeKey);
                if (!bookNode || !$isBookNode(bookNode)) continue;
                const code = bookNode.getCode();
                const current = scrRefRef.current;
                if (code && code !== current.book) {
                  onScrRefChangeRef.current({ ...current, book: code });
                }
              }
            },
            { tag: CURSOR_CHANGE_TAG },
          );
        },
        { skipInitialization: false },
      ),
    [editor],
  );

  // Scripture Reference changed
  useEffect(() => {
    if (hasSelectionChangedRef.current) hasSelectionChangedRef.current = false;
    else {
      editor.update(() => $moveCursorToVerseStart(chapterNum, verseNum, hasCursorMovedRef), {
        tag: CURSOR_CHANGE_TAG,
      });
    }
  }, [editor, chapterNum, verseNum]);

  // Selection changed
  useEffect(
    () =>
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if (hasCursorMovedRef.current) hasCursorMovedRef.current = false;
          else {
            $findAndSetChapterAndVerse(
              book,
              chapterNum,
              verseNum,
              onScrRefChange,
              hasSelectionChangedRef,
            );
          }
          return false;
        },
        COMMAND_PRIORITY_LOW,
      ),
    [editor, book, chapterNum, verseNum, onScrRefChange],
  );

  // Verse node destroyed - SELECTION_CHANGE_COMMAND won't fire if the cursor position didn't
  // change (e.g. cursor was at offset 0 of the node after the verse, and stays there after
  // deletion of the non-keyboard-selectable DecoratorNode).
  useEffect(() => {
    const onVerseDestroyed = (nodeMutations: Map<string, "created" | "updated" | "destroyed">) => {
      const hasCreatedOrDestroyedVerse = [...nodeMutations.values()].some(
        (m) => m === "created" || m === "destroyed",
      );
      if (hasCreatedOrDestroyedVerse) editor.dispatchCommand(SELECTION_CHANGE_COMMAND, undefined);
    };
    return mergeRegister(
      editor.registerMutationListener(ImmutableVerseNode, onVerseDestroyed),
      editor.registerMutationListener(VerseNode, onVerseDestroyed),
    );
  }, [editor]);

  return null;
}

function $moveCursorToVerseStart(
  chapterNum: number,
  verseNum: number,
  hasCursorMovedRef: MutableRefObject<boolean>,
) {
  const startNode = getSelectionStartNode($getSelection());
  const selectedVerse = $findThisVerse(startNode)?.getNumber();
  if (isVerseRange(selectedVerse) && isVerseInRange(verseNum, selectedVerse)) return;

  const children = $getRoot().getChildren();
  const chapterNode = $findChapter(children, chapterNum);
  const nodesInChapter = removeNodesBeforeNode(children, chapterNode);
  const nextChapterNode = $findNextChapter(nodesInChapter, !!chapterNode);
  if ((nextChapterNode && !chapterNode) || !chapterNode) return;

  removeNodeAndAfter(nodesInChapter, nextChapterNode);
  const verseOrParaNode = $findVerseOrPara(nodesInChapter, verseNum);
  if (!verseOrParaNode) return;

  if ($isParaNode(verseOrParaNode)) {
    const firstChild = verseOrParaNode.getFirstChild();
    if ($isTextNode(firstChild)) firstChild.select(0, 0);
    else verseOrParaNode.select(0, 0);
  } else verseOrParaNode.selectNext(0, 0);
  hasCursorMovedRef.current = true;
}

function $findAndSetChapterAndVerse(
  book: string,
  chapterNum: number,
  verseNum: number,
  onScrRefChange: (scrRef: SerializedVerseRef) => void,
  hasSelectionChangedRef: MutableRefObject<boolean>,
) {
  const selection = $getSelection();
  const startNode = getSelectionStartNode(selection);
  if (!startNode) return;

  const chapterNode = $findThisChapter(startNode);
  const selectedChapterNum = parseInt(chapterNode?.getNumber() ?? "1", 10);
  const verseNode = $resolveVerseNode(startNode, selection);

  const { verseNum: effectiveVerseNum, verse: effectiveVerse } = $getEffectiveVerseForBcv(
    verseNode ?? undefined,
    selection,
  );
  const isVerseInCurrentRange = effectiveVerse
    ? isVerseInRange(verseNum, effectiveVerse)
    : verseNum === effectiveVerseNum;

  const hasChapterChanged = chapterNode && selectedChapterNum !== chapterNum;
  const hasVerseChanged = !isVerseInCurrentRange;
  hasSelectionChangedRef.current = !!(hasChapterChanged || hasVerseChanged);

  if (hasSelectionChangedRef.current) {
    const scrRef: SerializedVerseRef = {
      book,
      chapterNum: selectedChapterNum,
      verseNum: effectiveVerseNum,
    };
    if (effectiveVerse != null && effectiveVerseNum.toString() !== effectiveVerse) {
      scrRef.verse = effectiveVerse;
    }
    onScrRefChange(scrRef);
  }
}
