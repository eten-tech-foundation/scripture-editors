export interface Note {
  type: "note";
  marker: string;
  caller: string;
  direction: string | null;
  format: string;
  indent: number;
  version: number;
  children: (ImmutableNoteCaller | Char | Text)[];
}

export interface ImmutableNoteCaller {
  type: "immutable-note-caller";
  caller: string;
  previewText: string;
  version: number;
}

export interface Char {
  type: "char";
  marker: string;
  text: string;
  detail: number;
  format: number;
  mode: string;
  style: string;
  version: number;
}

interface Text {
  type: "text";
  text: string;
  detail: number;
  format: number;
  mode: string;
  style: string;
  version: number;
}
export interface Para {
  direction: null;
  format: string;
  indent: number;
  type: "para";
  version: number;
  textFormat: number;
  marker: string;
  children: Note[];
}

export interface Footnote {
  children: Para[];
}

export const emptyFootnote: Footnote = {
  children: [
    {
      direction: null,
      format: "",
      indent: 0,
      type: "para",
      version: 1,
      textFormat: 0,
      marker: "p",
      children: [
        {
          type: "note",
          marker: "f",
          caller: "+",
          direction: null,
          format: "",
          indent: 0,
          version: 1,
          children: [
            {
              type: "immutable-note-caller",
              caller: "b",
              previewText: "",
              version: 1,
            },
          ],
        },
      ],
    },
  ],
};
