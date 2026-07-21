import type { SerializedEditorState } from "lexical";
import { MarkerContent, MarkerObject, Usj } from "./usj.model.js";

/**
 * `closed` is nonstandard derived USX/USJ metadata — ParatextData emits `closed="false"` on
 * every implicitly-closed note/char span — and is not part of the published `MarkerObject`
 * shape, so test data carrying it types the field locally.
 */
type ClosableMarkerObject = MarkerObject & { closed?: string };

const NBSP = "\u00A0";
const EMPTY_CHAR_PLACEHOLDER_TEXT = NBSP;
const IDEOGRAPHIC_SPACE = "\u3000";
const THIN_SPACE = "\u2009";

/* Empty */

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
    <para style="q2"><verse style="v" number="16" sid="GEN 1:16"/>“There is no help for him in God.”<note style="f" caller="+"><char style="fr" closed="false">3:2 </char><char style="fk" closed="false" /><char style="ft" closed="false">The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).</char></note> <unmatched marker="f*" /> <char style="qs">Selah.</char><verse eid="GEN 1:16" /></para>
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
            {
              type: "char",
              marker: "fr",
              content: ["3:2 "],
              closed: "false",
            } as ClosableMarkerObject,
            { type: "char", marker: "fk", closed: "false" } as ClosableMarkerObject,
            {
              type: "char",
              marker: "ft",
              content: ["The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim)."],
              closed: "false",
            } as ClosableMarkerObject,
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
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
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
                marker: "fk",
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
                  {
                    type: "text",
                    text: EMPTY_CHAR_PLACEHOLDER_TEXT,
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
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
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
            { insert: "3:2 ", attributes: { char: { style: "fr", closed: "false" } } },
            { insert: "", attributes: { char: { style: "fk", closed: "false" } } },
            {
              insert: "The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
              attributes: { char: { style: "ft", closed: "false" } },
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
            $: { textType: "marker-trailing-space" },
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
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
            type: "char",
            marker: "nd",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
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
                type: "text",
                text: `${NBSP}Lord`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
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
            version: 1,
            children: [
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
                type: "text",
                text: `${NBSP}4`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
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
            $: { textType: "marker-trailing-space" },
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
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
            $: { textType: "marker-trailing-space" },
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
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
                text: ` +${NBSP}`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "char",
                marker: "fr",
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
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
                type: "char",
                marker: "fk",
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
                  {
                    type: "marker",
                    marker: "fk",
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
                    text: EMPTY_CHAR_PLACEHOLDER_TEXT,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
              },
              {
                type: "char",
                marker: "ft",
                unknownAttributes: { closed: "false" },
                direction: null,
                format: "",
                indent: 0,
                version: 1,
                children: [
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
            type: "char",
            marker: "qs",
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
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
                type: "text",
                text: `${NBSP}Selah.`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
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
    ],
  },
} as unknown as SerializedEditorState;

/**
 * Expected ops for `editorStateGen1v1Editable` (editable markers, expanded notes). Body ops
 * carry the editable marker glyph text verbatim (the pinned contract), but the note's
 * `contents.ops` are CANONICAL (glyph-free): the editable caller text, the char-span glyph
 * MarkerNodes, the structural NBSP content separators, and the closing `\f*` glyph are
 * presentation-only and are re-synthesized by `$applyUpdate` when the note is materialized,
 * so they must not flow into note contents ops (they used to, which doubled the glyphs and
 * materialized an unmatched `\f*` on every round-trip; the contract now excludes them). Note
 * contents ops are therefore identical across marker modes (compare `opsGen1v1`).
 */
export const opsGen1v1Editable = [
  { insert: "Some Scripture Version" },
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: `\\c${NBSP}1 \\p${NBSP}\\v${NBSP}1 ` },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: `the first verse \\v${NBSP}2 ` },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: `the second verse \\v${NBSP}15 ` },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15", altnumber: "3" } } },
  { insert: "Tell the Israelites that I, the " },
  { insert: `\\nd${NBSP}Lord\\nd*`, attributes: { char: { style: "nd" } } },
  { insert: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob," },
  { insert: `\\va${NBSP}4\\va*`, attributes: { char: { style: "va" } } },
  { insert: "\n", attributes: { para: { style: "p" } } },
  { insert: `\\b${NBSP}` },
  { insert: "\n", attributes: { para: { style: "b" } } },
  { insert: `\\q2${NBSP}\\v${NBSP}16 ` },
  { insert: { verse: { style: "v", number: "16", sid: "GEN 1:16" } } },
  { insert: "“There is no help for him in God.”" },
  {
    insert: {
      note: {
        style: "f",
        caller: "+",
        contents: {
          ops: [
            { insert: "3:2 ", attributes: { char: { style: "fr", closed: "false" } } },
            { insert: "", attributes: { char: { style: "fk", closed: "false" } } },
            {
              insert: "The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
              attributes: { char: { style: "ft", closed: "false" } },
            },
          ],
        },
      },
    },
  },
  { insert: " " },
  { insert: { unmatched: { marker: "f*" } } },
  { insert: " " },
  { insert: `\\qs${NBSP}Selah.\\qs*`, attributes: { char: { style: "qs" } } },
  { insert: "\n", attributes: { para: { style: "q2" } } },
];

/**
 * Standard view (`markerMode: "editable"`, `noteMode: "collapsed"`): editable markers with
 * collapsed notes. Generated by running
 * `serializeEditorState(usjGen1v1, getViewOptions(STANDARD_VIEW_MODE))` (the platform adaptor,
 * not importable from here) in a scratch script and transcribing the output; deleted before
 * commit. See `editorStateGen1v1Editable` above for the editable+expanded (unformatted)
 * counterpart, where the note's caller is a plain editable text node instead of the
 * `ImmutableNoteCallerNode` used here.
 */
export const editorStateGen1v1Standard = {
  root: {
    children: [
      {
        type: "book",
        marker: "id",
        code: "GEN",
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
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      },
      {
        type: "chapter",
        marker: "c",
        number: "1",
        sid: "GEN 1",
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
        direction: null,
        format: "",
        indent: 0,
        version: 1,
      },
      {
        type: "para",
        marker: "p",
        children: [
          {
            type: "marker",
            marker: "p",
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
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
            $: {
              textType: "marker-trailing-space",
            },
          },
          {
            type: "verse",
            text: `\\v${NBSP}1 `,
            marker: "v",
            number: "1",
            sid: "GEN 1:1",
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
          {
            type: "verse",
            text: `\\v${NBSP}2 `,
            marker: "v",
            number: "2",
            sid: "GEN 1:2",
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
          {
            type: "verse",
            text: `\\v${NBSP}15 `,
            marker: "v",
            number: "15",
            sid: "GEN 1:15",
            altnumber: "3",
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
            children: [
              {
                type: "marker",
                marker: "nd",
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
                text: `${NBSP}Lord`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "marker",
                marker: "nd",
                markerSyntax: "closing",
                text: "",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
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
            type: "char",
            marker: "va",
            children: [
              {
                type: "marker",
                marker: "va",
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
                text: `${NBSP}4`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "marker",
                marker: "va",
                markerSyntax: "closing",
                text: "",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            version: 1,
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
      },
      {
        type: "para",
        marker: "b",
        children: [
          {
            type: "marker",
            marker: "b",
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
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
            $: {
              textType: "marker-trailing-space",
            },
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
      },
      {
        type: "para",
        marker: "q2",
        children: [
          {
            type: "marker",
            marker: "q2",
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
            text: NBSP,
            detail: 0,
            format: 0,
            mode: "token",
            style: "",
            version: 1,
            $: {
              textType: "marker-trailing-space",
            },
          },
          {
            type: "verse",
            text: `\\v${NBSP}16 `,
            marker: "v",
            number: "16",
            sid: "GEN 1:16",
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
            isCollapsed: true,
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
                type: "immutable-note-caller",
                caller: "+",
                previewText: `3:2  ${NBSP}The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).`,
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
                unknownAttributes: { closed: "false" },
                children: [
                  {
                    type: "marker",
                    marker: "fr",
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
                    text: `${NBSP}3:2 `,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
                direction: null,
                format: "",
                indent: 0,
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
                marker: "fk",
                unknownAttributes: { closed: "false" },
                children: [
                  {
                    type: "marker",
                    marker: "fk",
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
                    text: NBSP,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
                direction: null,
                format: "",
                indent: 0,
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
                marker: "ft",
                unknownAttributes: { closed: "false" },
                children: [
                  {
                    type: "marker",
                    marker: "ft",
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
                    text: `${NBSP}The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).`,
                    detail: 0,
                    format: 0,
                    mode: "normal",
                    style: "",
                    version: 1,
                  },
                ],
                direction: null,
                format: "",
                indent: 0,
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
            direction: null,
            format: "",
            indent: 0,
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
            children: [
              {
                type: "marker",
                marker: "qs",
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
                text: `${NBSP}Selah.`,
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
              {
                type: "marker",
                marker: "qs",
                markerSyntax: "closing",
                text: "",
                detail: 0,
                format: 0,
                mode: "normal",
                style: "",
                version: 1,
              },
            ],
            direction: null,
            format: "",
            indent: 0,
            version: 1,
          },
        ],
        direction: null,
        format: "",
        indent: 0,
        textFormat: 0,
        textStyle: "",
        version: 1,
      },
    ],
    direction: null,
    format: "",
    indent: 0,
    type: "root",
    version: 1,
  },
} as unknown as SerializedEditorState;

/**
 * Expected ops for `editorStateGen1v1Standard` (standard view: editable markers, collapsed
 * notes). Identical to `opsGen1v1Editable`: body ops carry the editable marker glyph text
 * verbatim (the pinned contract), while the note's `contents.ops` are CANONICAL
 * (glyph-free) — in standard view the caller is an `ImmutableNoteCallerNode` decorator and
 * the NBSP spacers produce no ops, and the char-span glyphs / NBSP separators / closing
 * `\f*` glyph are skipped as presentation-only (the contract excludes them; they are
 * re-synthesized by `$applyUpdate`). Note contents ops are identical across marker modes
 * (compare `opsGen1v1`).
 */
export const opsGen1v1Standard = [
  { insert: "Some Scripture Version" },
  { insert: "\n", attributes: { book: { style: "id", code: "GEN" } } },
  { insert: { chapter: { style: "c", number: "1", sid: "GEN 1" } } },
  { insert: `\\c${NBSP}1 \\p${NBSP}\\v${NBSP}1 ` },
  { insert: { verse: { style: "v", number: "1", sid: "GEN 1:1" } } },
  { insert: `the first verse \\v${NBSP}2 ` },
  { insert: { verse: { style: "v", number: "2", sid: "GEN 1:2" } } },
  { insert: `the second verse \\v${NBSP}15 ` },
  { insert: { verse: { style: "v", number: "15", sid: "GEN 1:15", altnumber: "3" } } },
  { insert: "Tell the Israelites that I, the " },
  { insert: `\\nd${NBSP}Lord\\nd*`, attributes: { char: { style: "nd" } } },
  { insert: ", the God of their ancestors, the God of Abraham, Isaac, and Jacob," },
  { insert: `\\va${NBSP}4\\va*`, attributes: { char: { style: "va" } } },
  { insert: "\n", attributes: { para: { style: "p" } } },
  { insert: `\\b${NBSP}` },
  { insert: "\n", attributes: { para: { style: "b" } } },
  { insert: `\\q2${NBSP}\\v${NBSP}16 ` },
  { insert: { verse: { style: "v", number: "16", sid: "GEN 1:16" } } },
  { insert: "“There is no help for him in God.”" },
  {
    insert: {
      note: {
        style: "f",
        caller: "+",
        contents: {
          ops: [
            { insert: "3:2 ", attributes: { char: { style: "fr", closed: "false" } } },
            { insert: "", attributes: { char: { style: "fk", closed: "false" } } },
            {
              insert: "The Hebrew word rendered “God” is “אֱלֹהִ֑ים” (Elohim).",
              attributes: { char: { style: "ft", closed: "false" } },
            },
          ],
        },
      },
    },
  },
  { insert: " " },
  { insert: { unmatched: { marker: "f*" } } },
  { insert: " " },
  { insert: `\\qs${NBSP}Selah.\\qs*`, attributes: { char: { style: "qs" } } },
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

export const usxWithUnknownItems = `
<usx version="3.1">
  <book style="id" code="GEN" category="watCat" attr-unknown="watAttr" />
  <chapter style="c" number="1" sid="GEN 1" category="watCat" attr-unknown="watAttr" />
    <para style="p" category="watCat" attr-unknown="watAttr">
      <verse style="v" number="1" category="watCat" attr-unknown="watAttr" />First part of the first verse <note style="f" caller="+" eid="watEid" attr-unknown="watAttr"><char style="fr" category="watCat" attr-unknown="watAttr" closed="false">3:2 </char></note>
        <ms style="ts" category="watCat" attr-unknown="watAttr"/>
        <wat style="z" category="watCat" attr-unknown="watAttr">wat content?</wat>
    </para>
    <optbreak category="watCat"/>
    <ref loc="MRK 9:50" gen="true" category="watCat">Mk 9.50</ref>
    <sidebar style="esb" category="watCat">sidebar content</sidebar>
    <periph alt="periph title" category="watCat">periph content</periph>
    <figure style="fig" file="file.jpg" size="span" ref="1.18" category="watCat">figure content</figure>
    <table category="watCat">
      <row style="tr" category="watCat">
        <cell style="tc1" category="watCat">cell1</cell>
      </row>
    </table>
  <chapter eid="GEN 1" />
</usx>
`;

/** para index where the note exists */
export const NOTE_PARA_WITH_UNKNOWN_ITEMS_INDEX = 2;

export const usjWithUnknownItems = {
  type: "USJ",
  version: "3.1",
  content: [
    // unknown attributes
    { type: "book", marker: "id", code: "GEN", category: "watCat", "attr-unknown": "watAttr" },
    {
      type: "chapter",
      marker: "c",
      number: "1",
      sid: "GEN 1",
      category: "watCat",
      "attr-unknown": "watAttr",
    },
    {
      type: "para",
      marker: "p",
      category: "watCat",
      "attr-unknown": "watAttr",
      content: [
        { type: "verse", marker: "v", number: "1", category: "watCat", "attr-unknown": "watAttr" },
        "First part of the first verse ",
        {
          type: "note",
          marker: "f",
          caller: "+",
          eid: "watEid",
          "attr-unknown": "watAttr",
          content: [
            {
              type: "char",
              marker: "fr",
              category: "watCat",
              "attr-unknown": "watAttr",
              closed: "false",
              content: ["3:2 "],
            },
          ],
        },
        { type: "ms", marker: "ts", category: "watCat", "attr-unknown": "watAttr" },
        // unknown nodes
        {
          type: "wat",
          marker: "z",
          category: "watCat",
          "attr-unknown": "watAttr",
          content: ["wat content?"],
        },
      ],
    } as MarkerContent,
    { type: "optbreak", marker: undefined, category: "watCat" },
    {
      type: "ref",
      marker: undefined,
      loc: "MRK 9:50",
      gen: "true",
      category: "watCat",
      content: ["Mk 9.50"],
    },
    { type: "sidebar", marker: "esb", category: "watCat", content: ["sidebar content"] },
    {
      type: "periph",
      marker: undefined,
      alt: "periph title",
      category: "watCat",
      content: ["periph content"],
    },
    {
      type: "figure",
      marker: "fig",
      file: "file.jpg",
      size: "span",
      ref: "1.18",
      category: "watCat",
      content: ["figure content"],
    },
    {
      type: "table",
      marker: undefined,
      category: "watCat",
      content: [
        {
          type: "table:row",
          marker: "tr",
          category: "watCat",
          content: [{ type: "table:cell", marker: "tc1", category: "watCat", content: ["cell1"] }],
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
        unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
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
        unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
        version: 1,
      },
      {
        type: "para",
        marker: "p",
        unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
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
            unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
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
            unknownAttributes: { eid: "watEid", "attr-unknown": "watAttr" },
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
                unknownAttributes: {
                  category: "watCat",
                  "attr-unknown": "watAttr",
                  closed: "false",
                },
                direction: null,
                format: "",
                indent: 0,
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
            unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
            version: 1,
          },
          {
            type: "unknown",
            tag: "wat",
            marker: "z",
            unknownAttributes: { category: "watCat", "attr-unknown": "watAttr" },
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
        unknownAttributes: { category: "watCat" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [],
      },
      {
        type: "unknown",
        tag: "ref",
        unknownAttributes: { category: "watCat", loc: "MRK 9:50", gen: "true" },
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
        unknownAttributes: { category: "watCat" },
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
        unknownAttributes: { category: "watCat", alt: "periph title" },
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
        unknownAttributes: { category: "watCat", file: "file.jpg", size: "span", ref: "1.18" },
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
        unknownAttributes: { category: "watCat" },
        direction: null,
        format: "",
        indent: 0,
        version: 1,
        children: [
          {
            type: "unknown",
            tag: "table:row",
            marker: "tr",
            unknownAttributes: { category: "watCat" },
            direction: null,
            format: "",
            indent: 0,
            version: 1,
            children: [
              {
                type: "unknown",
                tag: "table:cell",
                marker: "tc1",
                unknownAttributes: { category: "watCat" },
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

// Copied from test project `zzz127S` as is.
/* eslint-disable no-irregular-whitespace */
export const usxEph1v1Whitespace = `
<usx version="3.1">
  <book code="EPH" style="id" />
  <para style="rem">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="sts">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="h">Efesios Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="toc3">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="toc2">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="toc1">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="mt">EF ESIOS Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="is">Efesiosdih jwĩ tʉ́i beh joyát pínah naáwát Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="ip">
    <char style="bd">¿Déhe tigaá daácniji?</char> Pablo, Dios ã jib bohéát tʉ́ʉtni nin nʉ́odih ãt daacáp wʉt jĩ. Pablo ded pah ã jʉmatdih chah jéihíhna, Romanosdih jwĩ tʉ́i beh joyát pínah naáwátdih ñi eneé. Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="ip">
    <char style="bd">¿Detdih ãt daácji?</char> Éfeso tʉ́tchidih moón Jesúíhwãdih ãt daacáp wʉt jĩ. Asia baácboó Éfeso tʉ́tchi chah tʉ́ini jẽ́lit ãt jʉmʉp wʉt jĩ. Dawá namánabʉt caán tʉ́tchina ãt jʉibínap wʉt jĩ. Pánihna, dawá jíib chãjnit cã́acwã caanná ĩpĩ́ jʉibínap wʉt jĩ. Éfesodih moón ĩ́ih dios wili, Artemisa wʉ̃t jʉmnidih ĩ weñat bʉ́dí mʉʉ́ ãt jʉmʉp wʉt jĩ. Dawá cã́acwã caánt pah jígohnidih pãpnit, jíib chãj wʉ̃hna, bʉ́dí dinerodih ĩt bíbohop wʉt jĩ. Pablo biíc peihcanni jópchi caán tʉ́tchidih moondíh Jesúíh doonádih ãtát bohénap wʉt jĩ.</para>
  <para style="ip">
    <char style="bd">¿Dedmant, débólih cah, ãt daácji?</char> Chah jéihnit “Pablo Roma tʉ́tchi nemat mʉʉ́boó jʉmnit, año 60 (Jesús ã wʉnat tʉ́ttimah 27 jópchi tʉ́ttimah) nin nʉ́odih ãt daác wahap wʉt jĩ”, ĩ niíj jenah joiná caá.</para>
  <para style="ip">
    <char style="bd">¿Dedé pínah tigaá ãt daácji?</char> Dios queétdih oinit, bʉ́dí ã teo wáacat pínah, ded pah queétdih ã náah yacatdihbʉt queét Éfesodih moón chah ĩ jéihyat pínah niijná, nin nʉ́odih ãt daác wahap wʉt jĩ.</para>
  <para style="io">Efesios ded pah ã jʉmat: Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="io2">1. Pablo ã tʉ́yat tʉ́ʉtat (1.1-2) Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="io2">2. Ded pah Dios jwiít ã́ihwãdih ã tʉ́i ʉbat (1.3—3.21)</para>
  <para style="io3">a. Jwiítdih ã tʉ́i ʉbatdih náhninit, caandíh Pablo ã wẽi naáwát (1.3-14)</para>
  <para style="io3">b. Queét Jesúíhwãdih Pablo ã ʉʉ́bát (1.15-23)</para>
  <para style="io3">c. Jesús ã wʉn wʉ̃hatjĩh Dios ã́ihwã wʉnnit panihnitdih ã booaat (2.1-10)</para>
  <para style="io3">d. Nihat Jesúíhwã biíc poómp pah jwĩ jʉmat (2.11-22)</para>
  <para style="io3">e. Pablodih Dios ded pah ã chãjat tʉ́ʉtat (3.1-13)</para>
  <para style="io3">f. Diosdih Pablo ã ʉʉ́bát, ã wẽi naáwátbʉt (3.14-21)</para>
  <para style="io2">3. Ded pah Jesúíhwã jwĩ tʉ́i jʉmat pínah (4.1—6.20)</para>
  <para style="io3">a. Tʉ́i biícdih jwĩ jʉmat (4.1-16) Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="io3">b. Jáap panihnit jwĩ jʉmat (4.17-24)</para>
  <para style="io3">c. Ded pah Jesúíhwã jwĩ chãjat (4.25—5.5)</para>
  <para style="io3">d. Jesús ã yeh iigát panihipboó jwiít ã́ihwã jwĩ jʉmat (5.6-20)</para>
  <para style="io3">e. Ded pah jwĩ déewã panihnitdih jwĩ chãjat (5.21—6.9)</para>
  <para style="io3">f. Jesúíhwã ded pah yéej chãjat jenah joyátdih jwĩ jéih yap yohat (6.10-20)</para>
  <para style="io2">4. Pablo ã pée tʉ́yat tʉ́ʉtat (6.21-24)</para>
  <chapter number="1" style="c" sid="EPH 1" />
  <para style="s">Pablo queétdih ã tʉ́yat tʉ́ʉtat Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="p">
    <verse number="1" style="v" sid="EPH 1:1" />Weém, Pablo, biíhdih daacát tʉ́ʉtna, yeéb Éfeso tʉ́tchidih moón Jesúíhwãdih wã wahna caá. Dios ã náahat pah Jesucristo weemdíh ã́ih tʉ́ini doonádih ã naáwát tʉ́ʉtni caá. Yeéb Jesucristodih tʉ́i jenah joí cádahcannitdih wã daác wahna caá.<note caller="*" style="x"><char style="xo" closed="false">1.1 </char><char style="xt" closed="false">Hch 18.19-21; 19.1</char></note> <verse eid="EPH 1:1" /><verse number="2" style="v" sid="EPH 1:2" />Jwĩ íip Dios, jwĩ Maáh Jesucristobʉt, yeebdíh oinit, ĩ tʉ́i teo wáaca naáh, caán biícdih ñi tʉ́i jʉmat pínah niijná. Weembʉ́t yeebdíh bʉ́dí wã tʉ́yat tʉ́ʉtna caá. Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="d" vid="EPH 1:2">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji<verse eid="EPH 1:2" /></para>
  <para style="sp">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</para>
  <para style="s">Jwiít Cristoíhwãdih <optbreak /> Dios ã tʉ́i chãjat</para>
  <para style="p">
    <verse number="3" style="v" sid="EPH 1:3" />Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji<note caller="-" style="x"><char style="xo" closed="false">1.3 </char><char style="xq" closed="false">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji </char><char style="xt" closed="false">Mt 2.9</char></note> Jwiít Cristoíhwã caán biícdih jwĩ jʉmʉchah, Dios, jwĩ Maáh Jesucristo íip, jwĩ́ih caolihdih bʉ́dí ã tʉ́i chãjna caá. Páant ã tʉ́i chãjachah jéihnit, caandíh bʉ́dí jwĩ wẽi naóhna caá. <verse eid="EPH 1:3" /><verse number="4" style="v" sid="EPH 1:4" />Jwiít<note caller="+" style="f"><char style="fr" closed="false">1.4 </char><char style="fq" closed="false">Jwiít </char><char style="ft" closed="false">BASE FN Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji </char></note> ã́ihwãdih nin pah Dios ãt chãjap wʉt jĩ. Nin baácdih ã chãjat pínah jã́tih, Jesucristo biícdih jwĩ jʉmat pínah, yéejat wihcannit ã enechah jwĩ jʉmat pínahbʉt niijná, jwiítdih ãtát ñíojip taga. Pánihna, jwiít Jesúsdih jepahnitdih, “Ma yéejat jíib jʉmna caá”, jwiítdih ã niijcán niít. <verse eid="EPH 1:4" /><verse number="5" style="v" sid="EPH 1:5" />Ã náahat pahjeh<note caller="+" style="fe"><char style="fr" closed="false">1.5 </char><char style="fq" closed="false">náahat pahjeh </char><char style="ft" closed="false">BASE END NOTE Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji </char></note> jwiítdih oinit, jon jã́tih nin pah Dios ãt niijíp wʉt jĩ: “Wã wʉ̃ʉ́h Cristo ã chãjatjĩh queét wã weh ĩ jʉmbipna caá”, ãt niijíp wʉt jĩ. <verse eid="EPH 1:5" /><verse number="6" style="v" sid="EPH 1:6" />Pánih oinit, jwiít ã wʉ̃ʉ́h ã oiniíhwã jwĩ jʉmʉchah, Dios jwiítdih bʉ́dí pohba ãt tʉ́i chãj wʉ̃hʉp taga. Páant ã chãjatdih jenah joinít, caandíh páantjeh bʉ́dí jwĩ wẽi naáwát caá náahap. <verse eid="EPH 1:6" /><verse number="7-8" style="v" sid="EPH 1:7-8" />Cristo jwĩ yéejat jíib bʉʉdáát panihnidih jíib chãjna, ã́ih meépdih yohnit, ãt wʉn wʉ̃hʉp wʉt jĩ.<note caller="*" style="x"><char style="xo" closed="false">1.7-8 </char><char style="xt" closed="false">Mr 10.45; 14.24; He 9.12-14</char></note> Pánih wʉn wʉ̃hna, jwiít iiguípna jwĩ bejat déedih tʉ́i ʉbnit, Satanás ã chéwat tõp panihnidih ãt watap wʉt jĩ. Pánihna, Cristo jwĩ yéejat jíib ã wʉ̃hatdih jéihnit, Diosboó jwĩ yéejatdih ãt yoh wʉ̃hʉp wʉt jĩ.<note caller="*" style="x"><char style="xo" closed="false">1.7-8 </char><char style="xt" closed="false">Col 1.14</char></note> Jwiítdih bʉ́dí oi jĩ́gah ennit, ã jéih beedáátjĩh ã wʉ̃ʉ́hdih páant ãt tʉ́i chãjat tʉ́ʉtʉp wʉt jĩ. Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji <verse eid="EPH 1:7-8" /><verse number="9-10" style="v" sid="EPH 1:9-10" />Jon jã́tih ã jenah joyátjidih cã́acwãdih ã jéihya jwʉhcan yʉhna, bʉʉ jwʉhna Dios jwiít ã́ihwãboodíh ãt beh joyánap taga.</para>
  <para style="q1" vid="EPH 1:9-10">Nin pahZ Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji caá ã jenah joyátji: Cristo nihat ã chãjatjĩh, nihat japboó jʉmnit, nin baácboó jʉmnit, nʉmp bóo tólihboó jʉmnitdihbʉt Dios ã ñíoni yeó jáapdih Cristodih maáh ã waadábipna caá. Páant maáh ã jʉmʉchah, nihat ã́ih míic ã jʉmbipna caá. Dios páant ã chãjat pínahdih ãt wʉtʉp wʉt jĩ.<verse eid="EPH 1:9-10" /></para>
  <para style="p">
    <verse number="11-12" style="v" sid="EPH 1:11-12" />Dios ã náahat pahjeh nihatdih chãjnit, jwiít judíowã Cristodih jwíih jepah waóhnitboó jwĩ tʉ́i chãjat pínah niijná, bitabʉt Diosdih ĩ wẽi naáwát pínah niijná, jon jã́tih jwiítdih ãt ñíwip wʉt jĩ.</para>
  <table>
    <row style="tr">
      <cell style="tc1" align="start">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji </cell>
      <cell style="tcr2" align="end">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji</cell>
    </row>
    <row style="tr">
      <cell style="tc1" align="start" />
      <cell style="tc2" align="start" />
    </row>
  </table>
  <para style="p" vid="EPH 1:11-12">
    <verse eid="EPH 1:11-12" />
    <verse number="13" style="v" sid="EPH 1:13" />Yéejat jíib iiguípna ñi bejat déedih Jesús ã wʉn wʉ̃hatji doonádih joinít, yeebbʉ́t ñitát jepahap taga. Pánih jepahnit, Jesúíhwã ñi jʉmʉchah, Diosboó ã naóhniji Tʉ́ini Espíritudih yeebdíh ãt wahap taga. Pánih wahnit, ã́ihwã ñi jʉmatdih ã jʉ́ʉtna caá.<note caller="*" style="x"><char style="xo" closed="false">1.13 </char><char style="xt" closed="false">Lc 24.49; Jn 14.26; 16.13-15; Hch 1.4; 2.33</char></note> <verse eid="EPH 1:13" /><verse number="14" style="v" sid="EPH 1:14" />Nin baácboó jwĩ jʉm jwʉhʉchah, Tʉ́ini Espíritu jwiítdih Dios ã jwíih wʉ̃hni caá. Pánihna, ã pebhboó jwĩ jʉibínachah, jwiít nihatdih tʉ́ʉt nʉʉ́m péanit, ã bíboh pã́inidih ã wʉ̃h beedábipna caá, ã wʉ̃t chah yáaat pínah niijná.<note caller="*" style="x"><char style="xo" closed="false">1.14 </char><char style="xt" closed="false">2Co 1.22</char></note><verse eid="EPH 1:14" /></para>
  <para style="s">Pablo Jesúíhwãdih ã ʉʉ́bát</para>
  <para style="p">
    <verse number="15" style="v" sid="EPH 1:15" />Páant ã <char style="wj">chãjatdih Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji jéihnit, </char>Jesúsdih ñi tʉ́i jenah joyát doonádih joinít, nihat bita Jesúíhwãdih ñi oyat doonádihbʉt joinít, <verse eid="EPH 1:15" /><verse number="16" style="v" sid="EPH 1:16" />Diosdih <char style="w" lemma="Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji ">Z Z Z Z Z Z Y Y Y Y Y X X X X W W W V V U　T zy​xw‌vu‍ts⁠rq‍po⁠nm‎lk‏ji </char>ʉʉ́bh cádahcan, “Queétdih ma teo wáacat tʉ́ina caá”, wãpĩ́ niijná caá. <verse eid="EPH 1:16" /><verse number="17" style="v" sid="EPH 1:17" />Nin pahbʉt jwĩ Maáh Jesucristoíh Diosdih wãpĩ́ niíj ʉʉ́bhna caá: “Paá, meém chah wẽpni jʉmna, queétdih ded pah ma jʉmatdih ma jéihyanaá, meemdíh chah ĩ tʉ́i jéihyat pínah niijná”, wãpĩ́ niijná caá. <verse eid="EPH 1:17" /><verse number="18" style="v" sid="EPH 1:18" />Nin pahbʉt wãpĩ́ niíj ʉʉ́bhna caá: “Queétdih tʉ́ʉt nʉʉ́m jwíihna, ma pebhboó ĩ jʉibínachah, ma tʉ́ʉt nʉʉ́m péaat pínahdih ma tʉ́i beh joyánaá. Jwiít míihwã caanná jwĩ jʉibínachah, chah bʉ́dí ma tʉ́i chãjat pínahdihbʉt, ma jéihyanaá”, wãpĩ́ niijná caá. <verse eid="EPH 1:18" /><verse number="19-21" style="v" sid="EPH 1:19-21" />Nin pahbʉt wãpĩ́ niíj ʉʉ́bhna caá: “Ded pah bʉ́dí ma wẽpat ã jʉmatdih queétdih ma jéihyanaá. Caán wẽpatjĩh Jesucristodih booanit, ma jéihyepmant bóo bʉwámant chʉ́ʉdat tʉ́ʉtnit, maáh mat waadánap taga.<note caller="*" style="x"><char style="xo" closed="false">1.19-21</char><char style="xt" closed="false">Sal 110.1</char></note> Pánihna, caanjĩ́h chʉ́ʉdna, nihat maátadih maáh ã jʉmna caá. Bʉʉ láa, tʉ́ttimah bóo láabʉt páantjeh chah maáh ã jʉmbipna caá. Jwiít caandíh tʉ́i jenah joinítdih caán wẽpatjĩh ma teo wáacatdih queétdih ma tʉ́i beh joyánaá”, wãpĩ́ niijná caá. <verse eid="EPH 1:19-21" /><verse number="22-23" style="v" sid="EPH 1:22-23" />Páant chah wẽpni ã jʉmʉchah, Diosboó nihatdih Jesúsdih ãt wʉtat tʉ́ʉtʉp taga.<note caller="*" style="x"><char style="xo" closed="false">1.22-23 </char><char style="xt" closed="false">Sal 8.6</char></note> Pánih chãjnit, Jesúsdih wao dáh panihni, ã́ihwãdih ã́ih bácah panihnibʉt ãt chãjap taga.<note caller="*" style="x"><char style="xo" closed="false">1.22-23 </char><char style="xt" closed="false">Col 1.18</char></note> Pánihna, jwiít ã́ihwãjeéh jʉmni nihat pebhboó ã jʉmʉchah, ã́ih bácah panihni jʉmna, ã wẽpatdih jwiítbʉt jwĩ bíbohna caá.<verse eid="EPH 1:22-23" /></para>
  <chapter eid="EPH 1" />
</usx>
`;
/* eslint-enable */

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
