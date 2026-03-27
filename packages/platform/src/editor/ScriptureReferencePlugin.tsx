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
  EditorState,
  LexicalNode,
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

  // Book loaded - detect book code from editor content when document loads
  useEffect(
    () =>
      editor.registerUpdateListener(({ editorState }) => {
        $getBookCode(editorState, onScrRefChange, scrRef);
      }),
    [editor, onScrRefChange, scrRef],
  );

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

/**
 * Resolves the verse node for the given start node. When the cursor is on an element
 * (e.g. para) rather than inside a verse, looks at the child at offset or walks backward.
 */
function $resolveVerseNode(startNode: LexicalNode, selection: ReturnType<typeof $getSelection>) {
  const verseNode = $findThisVerse(startNode);

  if (verseNode) return verseNode;

  const isCursorOnElement =
    $isElementNode(startNode) &&
    selection &&
    $isRangeSelection(selection) &&
    selection.anchor.key === startNode.getKey();

  if (!isCursorOnElement) return undefined;

  const childAtOffset = startNode.getChildAtIndex(selection.anchor.offset);
  if (childAtOffset && $isSomeVerseNode(childAtOffset)) {
    return childAtOffset;
  }
  return $findPreviousVerseInSiblings(startNode, selection.anchor.offset);
}

function $getBookCode(
  editorState: EditorState,
  onScrRefChange: (scrRef: SerializedVerseRef) => void,
  currentScrRef: SerializedVerseRef,
) {
  editorState.read(() => {
    let node = $getRoot().getFirstChild();

    while (node !== null) {
      if ($isBookNode(node)) {
        const bookNode = node;
        if (bookNode.__code !== currentScrRef.book) {
          onScrRefChange({
            ...currentScrRef,
            book: bookNode.__code,
          });
        }
        break;
      }
      node = node.getNextSibling();
    }
  });
}
