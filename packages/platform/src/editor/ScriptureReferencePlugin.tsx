import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { SerializedVerseRef } from "@sillsdev/scripture";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
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
  isSelectionStartNodeExpectedError,
  isVerseInRange,
  isVerseRange,
  removeNodeAndAfter,
  removeNodesBeforeNode,
  VerseNode,
} from "shared";
import {
  $findPreviousVerseInSiblings,
  $findThisVerse,
  $findVerseOrPara,
  $getEffectiveVerseForBcv,
  $isSomeVerseNode,
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

  // Book loaded or changed
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
            // Command handler runs outside any Lexical read/update context; read() gives $getSelection() etc. a valid state.
            editor.getEditorState().read(() => {
              $findAndSetChapterAndVerse(
                book,
                chapterNum,
                verseNum,
                onScrRefChange,
                hasSelectionChangedRef,
              );
            });
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
  let startNode: ReturnType<typeof getSelectionStartNode>;

  // Avoid getSelectionStartNode when anchor points at a node that would cause getNodes() to throw
  // (e.g. DecoratorNode like ImmutableVerseNode). Lexical throws when anchor.type expects
  // ElementNode/TextNode but the node is neither.
  if (selection && $isRangeSelection(selection)) {
    const anchorNode = $getNodeByKey(selection.anchor.key);
    const wouldThrow =
      anchorNode &&
      ((selection.anchor.type === "element" && !$isElementNode(anchorNode)) ||
        (selection.anchor.type === "text" && !$isTextNode(anchorNode)));
    if (wouldThrow) {
      startNode = anchorNode ?? undefined;
    }
  }
  if (startNode === undefined) {
    try {
      startNode = getSelectionStartNode(selection);
    } catch (err) {
      if (isSelectionStartNodeExpectedError(err)) startNode = undefined;
      else throw err;
    }
    if (!startNode && selection && $isRangeSelection(selection)) {
      startNode = $getNodeByKey(selection.anchor.key) ?? undefined;
    }
  }
  if (!startNode) return;

  const chapterNode = $findThisChapter(startNode);
  const selectedChapterNum = parseInt(chapterNode?.getNumber() ?? "1", 10);
  let verseNode = $findThisVerse(startNode);
  if (
    !verseNode &&
    $isElementNode(startNode) &&
    selection &&
    $isRangeSelection(selection) &&
    selection.anchor.key === startNode.getKey()
  ) {
    const childAtOffset = startNode.getChildAtIndex(selection.anchor.offset);
    if (childAtOffset && $isSomeVerseNode(childAtOffset)) {
      verseNode = childAtOffset;
    } else if (childAtOffset) {
      // Anchor points to non-verse child (e.g. TypedMarkNode); walk backward for previous verse
      verseNode = $findPreviousVerseInSiblings(startNode, selection.anchor.offset);
    }
  }
  const { verseNum: effectiveVerseNum, verse: effectiveVerse } = $getEffectiveVerseForBcv(
    verseNode ?? undefined,
    selection,
  );
  const isVerseInCurrentRange = effectiveVerse
    ? isVerseInRange(verseNum, effectiveVerse)
    : verseNum === effectiveVerseNum;
  hasSelectionChangedRef.current = !!(
    (chapterNode && selectedChapterNum !== chapterNum) ||
    !isVerseInCurrentRange
  );
  if (hasSelectionChangedRef.current) {
    const scrRef: SerializedVerseRef = {
      book,
      chapterNum: selectedChapterNum,
      verseNum: effectiveVerseNum,
    };
    if (effectiveVerse != null && effectiveVerseNum.toString() !== effectiveVerse)
      scrRef.verse = effectiveVerse;
    onScrRefChange(scrRef);
  }
}
