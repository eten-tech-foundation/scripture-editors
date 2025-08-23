import { LexicalEditor } from "lexical";
import { Item } from "./filterAndRankItems";

export interface OptionItem extends Item {
  name: string;
  label: string;
  description: string;
  action: ({
    editor,
    newVerseRChapterNum,
    noteText,
  }: {
    editor: LexicalEditor;
    newVerseRChapterNum?: number;
    noteText?: string;
  }) => void;
}
