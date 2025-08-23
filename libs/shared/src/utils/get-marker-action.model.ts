import { SerializedVerseRef } from "@sillsdev/scripture";
import { LexicalEditor } from "lexical";
import { Marker } from "./usfm/usfmTypes.js";

export type ScriptureReference = SerializedVerseRef;

export interface MarkerAction {
  action: (currentEditor: {
    editor: LexicalEditor;
    reference: ScriptureReference;
    autoNumbering?: boolean;
    newVerseRChapterNum?: number;
    noteText?: string;
  }) => void;
  label: string | undefined;
}

export type GetMarkerAction = (marker: string, markerData?: Marker) => MarkerAction;
