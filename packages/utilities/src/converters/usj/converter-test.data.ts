import type { SerializedEditorState } from "lexical";
import { MarkerContent, Usj } from "./usj.model.js";

const NBSP = "\u00A0";
const IDEOGRAPHIC_SPACE = "\u3000";
const THIN_SPACE = "\u2009";

/* Empty */

export const usxEmpty = '<usx version="3.1" />';

export const usjEmpty: Usj = { type: "USJ", version: "3.1", content: [] };

export const editorStateEmpty = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "implied-para",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [],
      },
    ],
  },
} as unknown as SerializedEditorState;

/* Gen 1:1 */

/**
 * Reformatted from:
 * @see https://github.com/mvh-solutions/nice-usfm-json/blob/main/samples/character/origin.xml
 */
export const usxGen1v1 = `
<usx version="3.1">
  <book style="id" code="GEN">Some Scripture Version</book>
  <chapter style="c" number="1" sid="GEN 1" />
    <para style="p">
      <verse style="v" number="1" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
      <verse style="v" number="2" sid="GEN 1:2" />the second verse <verse eid="GEN 1:2" />
      <verse style="v" number="15" altnumber="3" sid="GEN 1:15"/>Tell the Israelites that I, the <char style="nd">Lord</char>, the God of their ancestors, the God of Abraham, Isaac, and Jacob,<char style="va">4</char><verse eid="GEN 1:15" />
    </para>
    <para style="b" />
    <para style="q2"><verse style="v" number="16" sid="GEN 1:16"/>“There is no help for him in God.”<note style="f" caller="+"><char style="fr">3:2 </char><char style="ft">The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).</char></note> <unmatched marker="f*" /> <char style="qs">Selah.</char><verse eid="GEN 1:16" /></para>
  <chapter eid="GEN 1" />
</usx>
`;

/** para index where the note exists */
export const NOTE_PARA_INDEX = 4;
/** index of the note in para children */
export const NOTE_INDEX = 2;
/** index of the note caller in note children */
export const NOTE_CALLER_INDEX = 0;
/** index of chapter 1 */
export const CHAPTER_1_INDEX = 1;
/** para index where the verse exists */
export const VERSE_PARA_INDEX = 2;
/** index of the verse in para children */
export const VERSE_2_INDEX = 2;
export const VERSE_2_EDITABLE_INDEX = 6;

/**
 * Modified from:
 * @see https://github.com/mvh-solutions/nice-usfm-json/blob/main/samples/character/proposed.json
 *
 * Additional test features:
 * - preserve significant whitespace at the beginning or end of text
 * - preserve significant whitespace between elements
 */
export const usjGen1v1: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
    { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
        "the first verse ",
        { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
        "the second verse ",
        { type: "verse", marker: "v", number: "15", altnumber: "3", sid: "GEN 1:15" },
        "Tell the Israelites that I, the ",
        { type: "char", marker: "nd", content: ["Lord"] },
        ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
        { type: "char", marker: "va", content: ["4"] },
      ],
    },
    { type: "para", marker: "b" },
    {
      type: "para",
      marker: "q2",
      content: [
        { type: "verse", marker: "v", number: "16", sid: "GEN 1:16" },
        "“There is no help for him in God.”",
        {
          type: "note",
          marker: "f",
          caller: "+",
          content: [
            { type: "char", marker: "fr", content: ["3:2 "] },
            {
              type: "char",
              marker: "ft",
              content: ["The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim)."],
            },
          ],
        },
        " ",
        { type: "unmatched", marker: "f*" },
        " ",
        { type: "char", marker: "qs", content: ["Selah."] },
      ],
    },
  ],
};

/** Lexical editor state JSON (depends on nodes used). */
export const editorStateGen1v1 = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        marker: "id",
        code: "GEN",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "Some Scripture Version",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "immutable-chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
        version: 1,
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          { type: "immutable-verse", marker: "v", number: "1", sid: "GEN 1:1", version: 1 },
          {
            type: "text",
            text: "the first verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "immutable-verse", marker: "v", number: "2", sid: "GEN 1:2", version: 1 },
          {
            type: "text",
            text: "the second verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "immutable-verse",
            marker: "v",
            number: "15",
            altnumber: "3",
            sid: "GEN 1:15",
            version: 1,
          },
          {
            type: "text",
            text: "Tell the Israelites that I, the ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "char",
            marker: "nd",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: "Lord",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "char",
            marker: "va",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: "4",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
        ],
      },
      {
        type: "para",
        marker: "b",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [],
      },
      {
        type: "para",
        marker: "q2",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          { type: "immutable-verse", marker: "v", number: "16", sid: "GEN 1:16", version: 1 },
          {
            type: "text",
            text: "“There is no help for him in God.”",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "note",
            marker: "f",
            caller: "+",
            isCollapsed: true,
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "immutable-note-caller",
                caller: "+",
                previewText: "3:2  The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
                version: 1,
              },
              {
                type: "text",
                text: NBSP,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "char",
                marker: "fr",
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "3:2 ",
                    style: "",
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    version: 1,
                  },
                ],
              },
              {
                type: "text",
                text: NBSP,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "char",
                marker: "ft",
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
                    style: "",
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    version: 1,
                  },
                ],
              },
              {
                type: "text",
                text: NBSP,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: " ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "unmatched",
            marker: "f*",
            version: 1,
          },
          {
            type: "text",
            text: " ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "char",
            marker: "qs",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: "Selah.",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsGen1v1 = [
  { insert: "Some Scripture Version" },
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: "the first verse " },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: "the second verse " },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15", altnumber: "3" } } },
  { insert: "Tell the Israelites that I, the " },
  { insert: "Lord", attributes: { char: { style: "nd" } } },
  { insert: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob," },
  { insert: "4", attributes: { char: { style: "va" } } },
  { insert: "\n", attributes: { para: { style: "p" } } },
  { insert: "\n", attributes: { para: { style: "b" } } },
  { insert: { verse: { style: "v", number: "16", sid: "GEN 1:16" } } },
  { insert: "“There is no help for him in God.”" },
  {
    insert: {
      note: {
        style: "f",
        caller: "+",
        contents: {
          ops: [
            { insert: "3:2 ", attributes: { char: { style: "fr" } } },
            {
              insert: "The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
              attributes: { char: { style: "ft" } },
            },
          ],
        },
      },
    },
  },
  { insert: " " },
  { insert: { unmatched: { marker: "f*" } } },
  { insert: " " },
  { insert: "Selah.", attributes: { char: { style: "qs" } } },
  { insert: "\n", attributes: { para: { style: "q2" } } },
];

/** Lexical editor state JSON (depends on nodes used). */
export const editorStateGen1v1Editable = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        marker: "id",
        code: "GEN",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "immutable-typed-text",
            text: `\\id GEN${NBSP}`,
            textType: "marker",
            version: 1,
          },
          {
            type: "text",
            text: "Some Scripture Version",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: `\\c${NBSP}1 `,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "marker",
            marker: "p",
            markerSyntax: "opening",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "text",
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "linebreak", version: 1 },
          {
            type: "verse",
            marker: "v",
            number: "1",
            sid: "GEN 1:1",
            text: `\\v${NBSP}1 `,
            version: 1,
          },
          {
            type: "text",
            text: "the first verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "linebreak", version: 1 },
          {
            type: "verse",
            marker: "v",
            number: "2",
            sid: "GEN 1:2",
            text: `\\v${NBSP}2 `,
            version: 1,
          },
          {
            type: "text",
            text: "the second verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "linebreak", version: 1 },
          {
            type: "verse",
            marker: "v",
            number: "15",
            altnumber: "3",
            sid: "GEN 1:15",
            text: `\\v${NBSP}15 `,
            version: 1,
          },
          {
            type: "text",
            text: "Tell the Israelites that I, the ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "marker",
            marker: "nd",
            markerSyntax: "opening",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "char",
            marker: "nd",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: `${NBSP}Lord`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "marker",
            marker: "nd",
            markerSyntax: "closing",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "text",
            text: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "marker",
            marker: "va",
            markerSyntax: "opening",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "char",
            marker: "va",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: `${NBSP}4`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "marker",
            marker: "va",
            markerSyntax: "closing",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "b",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "marker",
            marker: "b",
            detail: 0,
            format: 0,
            markerSyntax: "opening",
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "text",
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "q2",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "marker",
            marker: "q2",
            markerSyntax: "opening",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "text",
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "linebreak", version: 1 },
          {
            type: "verse",
            marker: "v",
            number: "16",
            sid: "GEN 1:16",
            text: `\\v${NBSP}16 `,
            version: 1,
          },
          {
            type: "text",
            text: "“There is no help for him in God.”",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "note",
            marker: "f",
            caller: "+",
            isCollapsed: false,
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "marker",
                marker: "f",
                markerSyntax: "opening",
                text: "",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "text",
                text: `${NBSP}+ `,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "marker",
                marker: "fr",
                markerSyntax: "opening",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "",
                version: 1,
              },
              {
                type: "char",
                marker: "fr",
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: `${NBSP}3:2 `,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
              },
              {
                type: "marker",
                marker: "ft",
                markerSyntax: "opening",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                text: "",
                version: 1,
              },
              {
                type: "char",
                marker: "ft",
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: `${NBSP}The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).`,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
              },
              {
                type: "marker",
                marker: "f",
                markerSyntax: "closing",
                text: "",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: " ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "unmatched",
            marker: "f*",
            version: 1,
          },
          {
            type: "text",
            text: " ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "marker",
            marker: "qs",
            markerSyntax: "opening",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
          {
            type: "char",
            marker: "qs",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: `${NBSP}Selah.`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "marker",
            marker: "qs",
            markerSyntax: "closing",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            text: "",
            version: 1,
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsGen1v1Editable = [
  // TODO: NBSP and markers need to be removed.
  { insert: "Some Scripture Version" },
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: "\\c 1 \\p \\v 1 " },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: "the first verse \\v 2 " },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: "the second verse \\v 15 " },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15", altnumber: "3" } } },
  { insert: "Tell the Israelites that I, the \\nd" },
  { insert: " Lord", attributes: { char: { style: "nd" } } },
  { insert: "\\nd*, the God of their ancestors, the God of Abraham, Isaac, and Jacob,\\va" },
  { insert: " 4", attributes: { char: { style: "va" } } },
  { insert: "\\va*" },
  { insert: "\n", attributes: { para: { style: "p" } } },
  { insert: "\\b " },
  { insert: "\n", attributes: { para: { style: "b" } } },
  { insert: "\\q2 \\v 16 " },
  { insert: { verse: { style: "v", number: "16", sid: "GEN 1:16" } } },
  { insert: "“There is no help for him in God.”" },
  {
    insert: {
      note: {
        style: "f",
        caller: "+",
        contents: {
          ops: [
            { insert: " + " },
            { insert: "\\fr" },
            { insert: " 3:2 ", attributes: { char: { style: "fr" } } },
            { insert: "\\ft" },
            {
              insert: " The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
              attributes: { char: { style: "ft" } },
            },
            { insert: "\\f*" },
          ],
        },
      },
    },
  },
  { insert: " " },
  { insert: { unmatched: { marker: "f*" } } },
  { insert: " \\qs" },
  { insert: `${NBSP}Selah.`, attributes: { char: { style: "qs" } } },
  { insert: "\\qs*" },
  { insert: "\n", attributes: { para: { style: "q2" } } },
];

/* Gen 1:1 Implied Para with empty content */

export const usxGen1v1ImpliedParaEmpty = `
<usx version="3.1">
  <book style="id" code="GEN" />
  <chapter style="c" number="1" sid="GEN 1" />
    <verse style="v" number="1" sid="GEN 1:1" /><verse eid="GEN 1:1" />
    <verse style="v" number="2" sid="GEN 1:2" /><verse eid="GEN 1:2" />
    <verse style="v" number="15" sid="GEN 1:15" /><verse eid="GEN 1:15" />
  <chapter eid="GEN 1" />
</usx>
`;

export const usjGen1v1ImpliedParaEmpty: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN" },
    { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
    { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
    { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
    { type: "verse", marker: "v", number: "15", sid: "GEN 1:15" },
  ],
};

export const editorStateGen1v1ImpliedParaEmpty = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        code: "GEN",
        marker: "id",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [],
      },
      {
        type: "immutable-chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
        version: 1,
      },
      {
        type: "implied-para",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          { type: "immutable-verse", marker: "v", number: "1", sid: "GEN 1:1", version: 1 },
          { type: "immutable-verse", marker: "v", number: "2", sid: "GEN 1:2", version: 1 },
          { type: "immutable-verse", marker: "v", number: "15", sid: "GEN 1:15", version: 1 },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsGen1v1ImpliedParaEmpty = [
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15" } } },
  { insert: "\n" },
];

/* Gen 1:1 Implied Para */

export const usxGen1v1ImpliedPara = `
<usx version="3.1">
  <book style="id" code="GEN" />
  <chapter style="c" number="1" sid="GEN 1" />
    <verse style="v" number="1" sid="GEN 1:1" />the first verse <verse eid="GEN 1:1" />
    <verse style="v" number="2" sid="GEN 1:2" />the second verse <verse eid="GEN 1:2" />
    <verse style="v" number="15" sid="GEN 1:15" />Tell the Israelites that I, the <char style="nd">Lord</char>, the God of their ancestors, the God of Abraham, Isaac, and Jacob,<verse eid="GEN 1:15" />
  <chapter eid="GEN 1" />
</usx>
`;

export const usjGen1v1ImpliedPara: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN" },
    { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
    { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
    "the first verse ",
    { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
    "the second verse ",
    { type: "verse", marker: "v", number: "15", sid: "GEN 1:15" },
    "Tell the Israelites that I, the ",
    { type: "char", marker: "nd", content: ["Lord"] },
    ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
  ],
};

export const editorStateGen1v1ImpliedPara = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        code: "GEN",
        marker: "id",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [],
      },
      {
        type: "immutable-chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
        version: 1,
      },
      {
        type: "implied-para",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          { type: "immutable-verse", marker: "v", number: "1", sid: "GEN 1:1", version: 1 },
          {
            type: "text",
            text: "the first verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "immutable-verse", marker: "v", number: "2", sid: "GEN 1:2", version: 1 },
          {
            type: "text",
            text: "the second verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          { type: "immutable-verse", marker: "v", number: "15", sid: "GEN 1:15", version: 1 },
          {
            type: "text",
            text: "Tell the Israelites that I, the ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "char",
            marker: "nd",
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: "Lord",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsGen1v1ImpliedPara = [
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: "the first verse " },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: "the second verse " },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15" } } },
  { insert: "Tell the Israelites that I, the " },
  { insert: "Lord", attributes: { char: { style: "nd" } } },
  { insert: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob,\n" },
];

/* Comment marks */

export const usjMarks: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    {
      type: "para",
      marker: "p",
      content: [
        "Some ",
        { type: "ms", marker: "zmsc-s" },
        "marked",
        { type: "ms", marker: "zmsc-e" },
        " text.",
      ],
    },
    {
      type: "para",
      marker: "p",
      content: [
        "Some ",
        { type: "ms", marker: "zmsc-s", sid: "1" },
        "marked",
        { type: "ms", marker: "zmsc-e", eid: "1" },
        " text.",
      ],
    },
    {
      type: "para",
      marker: "p",
      content: [
        "Some ",
        { type: "ms", marker: "zmsc-s", sid: "1" },
        "adjacent ",
        { type: "ms", marker: "zmsc-e", eid: "1" },
        { type: "ms", marker: "zmsc-s", sid: "2" },
        "marked",
        { type: "ms", marker: "zmsc-e", eid: "2" },
        " text.",
      ],
    },
    {
      type: "para",
      marker: "p",
      content: [
        "Some ",
        { type: "ms", marker: "zmsc-s", sid: "1" },
        "overlapping",
        { type: "ms", marker: "zmsc-s", sid: "2" },
        "marked",
        { type: "ms", marker: "zmsc-e", eid: "1" },
        " text.",
        { type: "ms", marker: "zmsc-e", eid: "2" },
      ],
    },
    {
      type: "para",
      marker: "p",
      content: [
        "Some ",
        { type: "ms", marker: "zmsc-s", sid: "1" },
        "nested",
        { type: "ms", marker: "zmsc-s", sid: "2" },
        "marked",
        { type: "ms", marker: "zmsc-e", eid: "2" },
        " text.",
        { type: "ms", marker: "zmsc-e", eid: "1" },
      ],
    },
  ],
};

export const editorStateMarks = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "Some ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": [] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "marked",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: " text.",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "Some ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "marked",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: " text.",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "Some ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "adjacent ",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["2"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "marked",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "text",
            text: " text.",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "Some ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "overlapping",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1", "2"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "marked",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["2"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: " text.",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
        ],
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "Some ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "nested",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1", "2"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "marked",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "typed-mark",
            typedIDs: { "internal-comment": ["1"] },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: " text.",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

/* Unknown items */

/** para index where the note exists */
export const NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX = 2;

export const usjWithUnknownItems = {
  type: "USJ",
  version: "3.1",
  content: [
    // unknown attributes
    { type: "book", marker: "id", code: "GEN", "attr-unknown": "watAttr" },
    { type: "chapter", marker: "c", number: "1", "attr-unknown": "watAttr" },
    {
      type: "para",
      marker: "p",
      "attr-unknown": "watAttr",
      content: [
        { type: "verse", marker: "v", number: "1", "attr-unknown": "watAttr" },
        "First part of the first verse ",
        {
          type: "note",
          marker: "f",
          caller: "+",
          "attr-unknown": "watAttr",
          content: [{ type: "char", marker: "fr", "attr-unknown": "watAttr", content: ["3:2 "] }],
        },
        { type: "ms", marker: "ts", "attr-unknown": "watAttr" },
        // unknown nodes
        {
          type: "wat",
          marker: "z",
          "attr-unknown": "watAttr",
          content: ["wat content?"],
        },
      ],
    } as MarkerContent,
    { type: "optbreak", marker: undefined },
    { type: "ref", marker: undefined, loc: "MRK 9:50", gen: "true", content: ["Mk 9.50"] },
    { type: "sidebar", marker: "esb", content: ["sidebar content"] },
    { type: "periph", marker: undefined, alt: "periph title", content: ["periph content"] },
    {
      type: "figure",
      marker: "fig",
      file: "file.jpg",
      size: "span",
      ref: "1.18",
      content: ["figure content"],
    },
    {
      type: "table",
      marker: undefined,
      content: [
        {
          type: "table:row",
          marker: "tr",
          content: [{ type: "table:cell", marker: "tc1", content: ["cell1"] }],
        },
      ],
    },
  ],
} as Usj;

export const editorStateWithUnknownItems = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        marker: "id",
        code: "GEN",
        unknownAttributes: { "attr-unknown": "watAttr" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [],
      },
      {
        type: "immutable-chapter",
        marker: "c",
        number: "1",
        unknownAttributes: { "attr-unknown": "watAttr" },
        version: 1,
      },
      {
        type: "para",
        marker: "p",
        unknownAttributes: { "attr-unknown": "watAttr" },
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "immutable-verse",
            marker: "v",
            number: "1",
            unknownAttributes: { "attr-unknown": "watAttr" },
            version: 1,
          },
          {
            type: "text",
            text: "First part of the first verse ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "note",
            marker: "f",
            caller: "+",
            isCollapsed: true,
            unknownAttributes: { "attr-unknown": "watAttr" },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "immutable-note-caller",
                caller: "+",
                previewText: "3:2",
                version: 1,
              },
              {
                type: "text",
                text: NBSP,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "char",
                marker: "fr",
                unknownAttributes: { "attr-unknown": "watAttr" },
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "3:2 ",
                    style: "",
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    version: 1,
                  },
                ],
              },
              {
                type: "text",
                text: NBSP,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
          },
          {
            type: "ms",
            marker: "ts",
            unknownAttributes: { "attr-unknown": "watAttr" },
            version: 1,
          },
          {
            type: "unknown",
            tag: "wat",
            marker: "z",
            unknownAttributes: { "attr-unknown": "watAttr" },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "text",
                text: "wat content?",
                detail: 0,
                format: 0,
                mode: "token",
                style: "",
                version: 1,
              },
            ],
          },
        ],
      },
      {
        type: "unknown",
        tag: "optbreak",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [],
      },
      {
        type: "unknown",
        tag: "ref",
        unknownAttributes: { loc: "MRK 9:50", gen: "true" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "Mk 9.50",
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "unknown",
        tag: "sidebar",
        marker: "esb",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "sidebar content",
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "unknown",
        tag: "periph",
        unknownAttributes: { alt: "periph title" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "periph content",
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "unknown",
        tag: "figure",
        marker: "fig",
        unknownAttributes: { file: "file.jpg", size: "span", ref: "1.18" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "figure content",
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "unknown",
        tag: "table",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "unknown",
            tag: "table:row",
            marker: "tr",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "unknown",
                tag: "table:cell",
                marker: "tc1",
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "cell1",
                    detail: 0,
                    format: 0,
                    mode: "token",
                    style: "",
                    version: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsWithUnknownItems = [
  // TODO: missing unknown attributes
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1" } } },
  { insert: { verse: { style: "v", number: "1" } } },
  { insert: "First part of the first verse " },
  {
    insert: {
      note: {
        style: "f",
        caller: "+",
        contents: {
          ops: [{ insert: "3:2 ", attributes: { char: { style: "fr" } } }],
        },
      },
    },
  },
  { insert: { milestone: { style: "ts" } } },
  { insert: "wat content?Mk 9.50sidebar contentperiph contentfigure contentcell1" },
  { insert: "\n", attributes: { para: { style: "p" } } },
];

/* Gen 1:1 whitespace */

/**
 * Tests removing structural whitespace (see https://docs.usfm.bible/usfm/latest/whitespace.html) in
 * USX while preserving content whitespace.
 *
 * Includes various strange whitespace quirks that Paratext supports.
 *
 * For example, Paratext's UsfmToken.RegularizeSpaces does not deduplicate U+3000 (IDEOGRAPHIC SPACE)
 * after other whitespace and does not deduplicate other whitespace after U+3000 (IDEOGRAPHIC SPACE).
 * However, it does deduplicate multiple U+3000 (IDEOGRAPHIC SPACE) in a row.
 *
 * TODO: also test ZWSP and its quirks. Especially concerning is that the editor inserts a bunch of
 * ZWSP in many places in the editable state
 */
export const usxGen1v1Whitespace = `
<usx version="3.1">
  <book style="id" code="GEN" />
  <chapter style="c" number="1" sid="GEN 1" />
    <verse style="v" number="1" sid="GEN 1:1" /><char style="nd">space</char> <char style="wj">between</char> <char style="nd">each</char>${IDEOGRAPHIC_SPACE}<char style="wj">word</char> <char style="nd">should</char>${THIN_SPACE}${IDEOGRAPHIC_SPACE} <char style="wj">stay</char><verse eid="GEN 1:1" />
  <chapter eid="GEN 1" />
</usx>
`;

export const usjGen1v1Whitespace: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN" },
    { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
    { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
    { type: "char", marker: "nd", content: ["space"] },
    " ",
    { type: "char", marker: "wj", content: ["between"] },
    " ",
    { type: "char", marker: "nd", content: ["each"] },
    `${IDEOGRAPHIC_SPACE}`,
    { type: "char", marker: "wj", content: ["word"] },
    " ",
    { type: "char", marker: "nd", content: ["should"] },
    `${THIN_SPACE}${IDEOGRAPHIC_SPACE} `,
    { type: "char", marker: "wj", content: ["stay"] },
  ],
};

/* Gen 1:1 non-standard */

/**
 * Includes various nonstandard features we want to support in the
 * spirit of generously supporting user data
 *
 * Additional test features:
 * - preserve contents of `ca` even though it seems possible `ca` should not occur as its own marker
 * - preserve non-standard contents of `b` marker that should not have contents
 * - preserve closed attribute on character marker
 */
export const usxGen1v1Nonstandard = `
<usx version="3.1">
  <book style="id" code="GEN">Some Scripture Version</book>
  <chapter style="c" number="1" sid="GEN 1" />
    <para style="p">
      <verse style="v" number="1" sid="GEN 1:1" />the <char style="nd" closed="false">first verse <verse eid="GEN 1:1" />
      <verse style="v" number="2" sid="GEN 1:2" />the second verse <char style="ca">4</char></char><verse eid="GEN 1:2" />
    </para>
    <para style="b">This should not be here</para>
  <chapter eid="GEN 1" />
</usx>
`;

export const usjGen1v1Nonstandard: Usj = {
  type: "USJ",
  version: "3.1",
  content: [
    { type: "book", marker: "id", code: "GEN", content: ["Some Scripture Version"] },
    { type: "chapter", marker: "c", number: "1", sid: "GEN 1" },
    {
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1", sid: "GEN 1:1" },
        "the ",
        {
          type: "char",
          marker: "nd",
          // @ts-expect-error the types aren't open enough to allow any attribute, but the
          // conversion code allows most any attribute. Let's fix the types when we have clarity.
          closed: "false",
          content: [
            "first verse ",
            { type: "verse", marker: "v", number: "2", sid: "GEN 1:2" },
            "the second verse ",
            { type: "char", marker: "ca", content: ["4"] },
          ],
        },
      ],
    },
    { type: "para", marker: "b", content: ["This should not be here"] },
  ],
};

/** Lexical editor state JSON (depends on nodes used). */
export const editorStateGen1v1Nonstandard = {
  root: {
    type: "root",
    direction: null,
    format: "",
    indent: 0,
    version: 1,
    children: [
      {
        type: "book",
        marker: "id",
        code: "GEN",
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "text",
            text: "Some Scripture Version",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
      {
        type: "immutable-chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
        version: 1,
      },
      {
        type: "para",
        marker: "p",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          { type: "immutable-verse", marker: "v", number: "1", sid: "GEN 1:1", version: 1 },
          {
            type: "text",
            text: "the ",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
          {
            type: "char",
            marker: "nd",
            unknownAttributes: {
              closed: "false",
            },
            direction: null,
            format: "",
            indent: 0,
            textFormat: 0,
            textStyle: "",
            version: 1,
            children: [
              {
                type: "text",
                text: "first verse ",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              { type: "immutable-verse", marker: "v", number: "2", sid: "GEN 1:2", version: 1 },
              {
                type: "text",
                text: "the second verse ",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "char",
                marker: "ca",
                direction: null,
                format: "",
                indent: 0,
                textFormat: 0,
                textStyle: "",
                version: 1,
                children: [
                  {
                    type: "text",
                    text: "4",
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "para",
        marker: "b",
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
        children: [
          {
            type: "text",
            text: "This should not be here",
            detail: 0,
            format: 0,
            mode: "normal",
            style: "",
            version: 1,
          },
        ],
      },
    ],
  },
} as unknown as SerializedEditorState;

export const opsGen1v1Nonstandard = [
  { insert: "Some Scripture Version" },
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: "the " },
  { insert: "first verse ", attributes: { char: { style: "nd" } } },
  // TODO: v2 should have something to indicate it's inside the char:nd
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: "the second verse ", attributes: { char: { style: "nd" } } },
  { insert: "4", attributes: { char: [{ style: "nd" }, { style: "ca" }] } },
  { insert: "\n", attributes: { para: { style: "p" } } },
  { insert: "This should not be here" },
  { insert: "\n", attributes: { para: { style: "b" } } },
];
