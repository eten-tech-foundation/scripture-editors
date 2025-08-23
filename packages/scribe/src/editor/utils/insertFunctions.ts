import {
  LexicalEditor,
  $getSelection,
  $isRangeSelection,
  $createTextNode,
  RangeSelection,
  TextNode,
  $insertNodes,
  $applyNodeReplacement,
  $parseSerializedNode,
  SerializedLexicalNode,
  $isRootOrShadowRoot,
  $createParagraphNode,
} from "lexical";
import { recurseNodes as recurseSerializedNodes } from "../adaptors/editor-usj.adaptor";
import { recurseNodes as recurseEditorNodes } from "../adaptors/usj-editor.adaptor";
import { emptyFootnote, Footnote, Char } from "../nodes/emptyFootNote";
import { $wrapNodeInElement } from "@lexical/utils";
import { $createChapterNode, $createVerseNode } from "shared";

function moveToEndOfNode(selection: RangeSelection, node: TextNode) {
  const anchorOffset = node.getTextContentSize();
  selection.anchor.set(node.getKey(), anchorOffset, "text");
  selection.focus.set(node.getKey(), anchorOffset, "text");
}
export const $createNodeFromSerializedNode = (serializedNode: SerializedLexicalNode) => {
  return $applyNodeReplacement($parseSerializedNode(serializedNode));
};
export const $insertUsfmNode = (serializedNode: SerializedLexicalNode) => {
  const newNode = $createNodeFromSerializedNode(serializedNode);
  console.log("===>", { newNode });
  $insertNodes([newNode]);

  if ($isRootOrShadowRoot(newNode.getParentOrThrow())) {
    $wrapNodeInElement(newNode, $createParagraphNode).selectEnd();
  }

  return newNode;
};
export function insertChapterNode({
  editor,
  inputValues: { chapter },
}: {
  editor: LexicalEditor;
  inputValues: { chapter: string };
}): void {
  console.log({ chapter });
  const sid = "xx",
    altnumber = "xx",
    pubnumber = "xx",
    text: string = chapter;
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const chapterNode = $createChapterNode(chapter, sid, altnumber, pubnumber);
      const textNode = $createTextNode(text);
      chapterNode.append(textNode);
      const spaceNode = $createTextNode(" ");
      selection.insertNodes([chapterNode, spaceNode]);
      moveToEndOfNode(selection, spaceNode);
    }
  });
}

export function insertVerseNode({
  editor,
  inputValues: { verse },
}: {
  editor: LexicalEditor;
  inputValues: { verse: string };
}): void {
  const sid = "xx",
    altnumber = "xx",
    pubnumber = "xx",
    text: string = verse;
  editor.update(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      const verseNode = $createVerseNode(verse, text, sid, altnumber, pubnumber);

      const spaceNode = $createTextNode(" ");
      selection.insertNodes([verseNode, spaceNode]);
      moveToEndOfNode(selection, spaceNode);
    }
  });
}
export interface InsertNoteNodeParams {
  editor: LexicalEditor;
  inputValues: {
    fr?: string;
    fqa?: string;
    fq?: string;
    ft?: string;
  };
}
type InputValues = InsertNoteNodeParams["inputValues"];

function deepCopy<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
function updateOrAddNodes(footnote: Footnote, values: InputValues): Footnote {
  const modifiedFootnote = deepCopy(footnote);
  const newNodes: Char[] = [];
  const note = modifiedFootnote.children[0].children.find((child) => child.type === "note");
  if (!note) return modifiedFootnote;

  Object.entries(values).forEach(([marker, text]) => {
    const existingNode = note.children.find((child) => (child as Char).marker === marker);
    if (existingNode) {
      (existingNode as Char).text = text;
    } else {
      const newNode: Char = {
        type: "char",
        marker: marker,
        text: text,
        detail: 0,
        format: 0,
        mode: "normal",
        style: "display: none",
        version: 1,
      };
      note.children.push(newNode);
      newNodes.push(newNode);
    }
  });

  return modifiedFootnote;
}

export function insertFootNoteNode({ editor, inputValues }: InsertNoteNodeParams): void {
  editor.update(() => {
    const newFootnoteNode = updateOrAddNodes(emptyFootnote, inputValues);
    console.log({ newFootnoteNode, emptyFootnote });
    const notecontent = recurseSerializedNodes(newFootnoteNode.children);
    // const notecontent = recurseSerializedNodes(emptyFootnote.children);
    console.log({ notecontent });
    const noteNode = recurseEditorNodes(notecontent);
    console.log({ noteNode });
    $insertUsfmNode(noteNode[0]);
  });
}
