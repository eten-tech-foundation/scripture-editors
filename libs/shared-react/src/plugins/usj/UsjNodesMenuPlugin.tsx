import { ImmutableVerseNode } from "../../nodes/usj/ImmutableVerseNode";
import { $isSomeVerseNode, SomeVerseNode, wasNodeCreated } from "../../nodes/usj/node-react.utils";
import UsfmNodesMenuPlugin from "../UsfmNodesMenuPlugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import { $getNodeByKey, $hasUpdateTag, LexicalEditor, NodeKey, NodeMutation } from "lexical";
import { useEffect, useMemo } from "react";
import {
  $findThisChapter,
  EXTERNAL_USJ_MUTATION_TAG,
  GetMarkerAction,
  getNextVerse,
  ScriptureReference,
  VerseNode,
} from "shared";

interface NodeKeysByChapter {
  [chapter: string]: NodeKey[];
}
interface ChapterByNodeKey {
  [nodeKey: string]: string;
}

export interface UsjNodesMenuPluginProps {
  trigger: string;
  scrRef: ScriptureReference;
  contextMarker: string | undefined;
  getMarkerAction: GetMarkerAction;
}

export function UsjNodesMenuPlugin({
  trigger,
  scrRef,
  contextMarker,
  getMarkerAction,
}: UsjNodesMenuPluginProps) {
  const { book, chapterNum, verseNum, verse, versificationStr } = scrRef;
  // Recompute when individual fields change without relying on scrRef identity.
  const scriptureReference = useMemo<ScriptureReference>(
    () => ({ book, chapterNum, verseNum, verse, versificationStr }),
    [book, chapterNum, verseNum, verse, versificationStr],
  );

  const [editor] = useLexicalComposerContext();
  useVerseCreated(editor);

  return (
    <UsfmNodesMenuPlugin
      trigger={trigger}
      scriptureReference={scriptureReference}
      contextMarker={contextMarker}
      getMarkerAction={getMarkerAction}
    />
  );
}

function useVerseCreated(editor: LexicalEditor) {
  useEffect(() => {
    if (!editor.hasNodes([VerseNode, ImmutableVerseNode])) {
      throw new Error(
        "UsjNodesMenuPlugin: VerseNode or ImmutableVerseNode not registered on editor!",
      );
    }

    const verseNodeKeysByChapter: NodeKeysByChapter = {};
    const chapterByNodeKey: ChapterByNodeKey = {};

    // Re-generate following verse numbers when a verse is added.
    return mergeRegister(
      editor.registerNodeTransform(ImmutableVerseNode, (node) =>
        $verseNodeInsertedTransform(node, editor, verseNodeKeysByChapter),
      ),
      editor.registerNodeTransform(VerseNode, (node) =>
        $verseNodeInsertedTransform(node, editor, verseNodeKeysByChapter),
      ),

      editor.registerMutationListener(ImmutableVerseNode, (nodeMutations) =>
        $trackMutatedVerses(nodeMutations, editor, verseNodeKeysByChapter, chapterByNodeKey),
      ),
      editor.registerMutationListener(VerseNode, (nodeMutations) =>
        $trackMutatedVerses(nodeMutations, editor, verseNodeKeysByChapter, chapterByNodeKey),
      ),
    );
  }, [editor]);
}

function $verseNodeInsertedTransform(
  node: SomeVerseNode,
  editor: LexicalEditor,
  verseNodeKeysByChapter: NodeKeysByChapter,
) {
  if ($hasUpdateTag(EXTERNAL_USJ_MUTATION_TAG)) return;

  const nodeWasCreated = wasNodeCreated(editor, node.getKey());
  if (nodeWasCreated) $renumberFollowingVerses(node, verseNodeKeysByChapter);
}

// See the Regex in the `getVerseRangeSegment` function.
const START_VERSE_SEGMENT_INDEX = 2;
const VERSE_RANGE_INDEX = 3;
const END_VERSE_NUMBER_INDEX = 4;
const END_VERSE_SEGMENT_INDEX = 5;

/**
 * Renumber all the verse numbers after the inserted verse to keep them sequential.
 * @param insertedNode - Inserted verse node.
 */
function $renumberFollowingVerses(
  insertedNode: SomeVerseNode,
  verseNodeKeysByChapter: NodeKeysByChapter,
) {
  const chapterNode = $findThisChapter(insertedNode);
  const chapter = chapterNode?.getNumber();
  if (!chapter) return;

  const verseNodeKeys = verseNodeKeysByChapter[chapter];
  if (!verseNodeKeys) return;

  // renumber for each verse
  let verseNum = parseInt(insertedNode.getNumber());
  let verseSegment =
    getVerseRangeSegment(insertedNode.getNumber())?.[START_VERSE_SEGMENT_INDEX] ?? "";
  verseNodeKeys.forEach((nodeKey) => {
    const node = $getNodeByKey<SomeVerseNode>(nodeKey);
    if (!node) return;

    const nodeVerse = node.getNumber();
    const startVerseNum = parseInt(nodeVerse);
    const nodeVerseParts = getVerseRangeSegment(nodeVerse);
    const isRange = !!nodeVerseParts?.[VERSE_RANGE_INDEX];
    const endVerseNum = isRange ? parseInt(nodeVerseParts[END_VERSE_NUMBER_INDEX]) : startVerseNum;
    if (
      endVerseNum < verseNum ||
      // e.g. insert 3b before 4 => 4
      startVerseNum > verseNum ||
      // e.g. insert 3 before 3a => 4a
      (endVerseNum === verseNum && verseSegment)
    )
      return;

    const startVerseSegment = nodeVerseParts?.[START_VERSE_SEGMENT_INDEX] ?? "";
    const endVerseSegment = nodeVerseParts?.[END_VERSE_SEGMENT_INDEX] ?? "";
    const nextEndVerse = isRange
      ? getNextVerse(parseInt(nodeVerseParts[END_VERSE_NUMBER_INDEX]), undefined)
      : "";
    let tail = `${startVerseSegment}`;
    tail += isRange ? `-${nextEndVerse}${endVerseSegment}` : "";
    const nextStartVerse = getNextVerse(startVerseNum, undefined);
    node.setNumber(`${nextStartVerse}${tail}`);
    verseNum = parseInt(isRange ? nextEndVerse : nextStartVerse);
    verseSegment = isRange ? endVerseSegment : startVerseSegment;
  });
}

/**
 * Extracts the verse range and/or segments from a given verse string.
 *
 * The verse string can be in the format:
 * - "1" (single verse)
 * - "1a" (single verse segment)
 * - "1-2" (verse range)
 * - "1a-2b" (verse range with segments)
 *
 * @param verse - The verse string to extract the range from.
 * @returns An array containing the matched groups or null if no match is found.
 */
function getVerseRangeSegment(verse: string) {
  return RegExp(/(\d+)([a-zA-Z]+)?(-(\d+)([a-zA-Z]+)?)?/).exec(verse);
}

function $trackMutatedVerses(
  nodeMutations: Map<string, NodeMutation>,
  editor: LexicalEditor,
  verseNodeKeysByChapter: NodeKeysByChapter,
  chapterByNodeKey: ChapterByNodeKey,
) {
  editor.getEditorState().read(() => {
    for (const [nodeKey, mutation] of nodeMutations) {
      const node = $getNodeByKey<SomeVerseNode>(nodeKey);
      if (!$isSomeVerseNode(node)) continue;

      if (mutation === "created") {
        const chapterNode = $findThisChapter(node);
        if (!chapterNode) continue;

        const chapter = chapterNode.getNumber();
        if (!verseNodeKeysByChapter[chapter]) verseNodeKeysByChapter[chapter] = [];
        verseNodeKeysByChapter[chapter].push(nodeKey);
        chapterByNodeKey[nodeKey] = chapter;
      } else if (mutation === "destroyed") {
        const chapter = chapterByNodeKey[nodeKey];
        const verseNodeKeys = verseNodeKeysByChapter[chapter];
        if (!verseNodeKeys) continue;

        const index = verseNodeKeys.findIndex((verseNodeKey) => verseNodeKey === nodeKey);
        if (index === -1) continue;

        verseNodeKeys.splice(index, 1);
        Reflect.deleteProperty(chapterByNodeKey, nodeKey);
      }
    }
  });
}
