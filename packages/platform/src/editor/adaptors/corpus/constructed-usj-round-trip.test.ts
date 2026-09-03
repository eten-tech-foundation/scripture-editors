/**
 * The editor round trip over CONSTRUCTED USJ documents — the third leg of the corpus guarantee.
 *
 * `corpus-round-trip.test.ts` authors its fixtures as USX and converts them at test time, which
 * keeps them shape-valid but limits them to what USX authoring naturally expresses.
 * `corpus-testusfm-round-trip.test.tsx` replays Paratext-oracle documents. This suite authors its
 * fixtures DIRECTLY as USJ, so it can pin shapes the other two legs never quite reach: property
 * order a converter would canonicalize (a milestone's authored attribute order), absent-vs-empty
 * `content`, and known attributes riding as direct `MarkerObject` properties.
 *
 * Every fixture asserts `usj -> serializeEditorState -> deserializeSerializedEditorState -> usj`
 * is the IDENTITY (deep equality), in each of the view configurations the adaptors support
 * ({@link ROUND_TRIP_VIEW_CONFIGS}). Adding a fixture is one table entry.
 *
 * Where exact identity is documented to be wrong — an intentional normalization the adaptors
 * perform — the fixture pins the DOCUMENTED output for that mode via `expectedByMode`, with a
 * comment citing where the behavior is specified. Anything else that fails identity is a genuine
 * divergence: pin it in {@link KNOWN_DIVERGENCES} (current behavior, mechanism named) rather than
 * deleting the fixture or loosening the general assertion.
 */
import { ROUND_TRIP_VIEW_CONFIGS } from "./corpus-data";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../editor-usj.adaptor";
import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../usj-editor.adaptor";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import { NBSP } from "shared";
import {
  FORMATTED_VIEW_MODE,
  PARAGRAPH_STRUCTURE_VIEW_MODE,
  UNFORMATTED_VIEW_MODE,
} from "shared-react";

/** One constructed USJ document to drive through the round trip in every view configuration. */
interface ConstructedUsjFixture {
  /** Unique fixture name, used as the test name. */
  name: string;
  /** The document, authored directly as USJ 3.1. */
  usj: Usj;
  /**
   * Per-mode expected output where a DOCUMENTED normalization makes exact identity wrong. Keyed by
   * the view-config label. Each entry must carry a comment citing where the normalization is
   * documented. Modes without an entry assert exact identity.
   */
  expectedByMode?: { [modeLabel: string]: Usj };
}

/** Wrap body content in a minimal valid book, mirroring `corpus-data.ts`'s `book` helper. */
function usjBook(...content: NonNullable<Usj["content"]>): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "RUT", content: ["Constructed fixture"] },
      { type: "para", marker: "mt1", content: ["Ruth"] },
      { type: "chapter", marker: "c", number: "1" },
      ...content,
    ],
  };
}

const constructedFixtures: ConstructedUsjFixture[] = [
  {
    // Callers beyond the generated "+": an explicit letter caller and the hidden "-" caller must
    // both survive as data (the displayed caller glyph is presentation, the `caller` field is not).
    name: "notes with explicit letter and hidden callers",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "Text",
        {
          type: "note",
          marker: "f",
          caller: "a",
          content: [
            { type: "char", marker: "fr", content: ["1.1 "], closed: "false" },
            { type: "char", marker: "ft", content: ["Lettered caller."], closed: "false" },
          ],
        },
        " and",
        {
          type: "note",
          marker: "f",
          caller: "-",
          content: [{ type: "char", marker: "ft", content: ["Hidden caller."], closed: "false" }],
        },
        " after.",
      ],
    }),
  },
  {
    // A note's `category` (USX `category="..."`, USFM `\cat ...\cat*`) is node state, not
    // content: it must round-trip whether the note is collapsed (standard view) or expanded.
    name: "note with a category",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "Text",
        {
          type: "note",
          marker: "f",
          caller: "+",
          category: "People",
          content: [{ type: "char", marker: "ft", content: ["Categorized."], closed: "false" }],
        },
        " after.",
      ],
    }),
  },
  {
    // A char marker's DEFAULT attribute rides as a direct named property in USJ (`\w`'s `lemma`),
    // exactly like any other known attribute — it must not be renamed, dropped, or demoted.
    name: "char span with its default attribute as a named property",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "He was ",
        // The assertion is how USJ spells a known attribute: a direct property the closed
        // `MarkerObject` type does not enumerate (same shape the settled-output suite asserts).
        { type: "char", marker: "w", content: ["gracious"], lemma: "grace" } as MarkerObject,
        " to them.",
      ],
    }),
  },
  {
    // Multiple attributes on one span, including a hyphenated attribute name.
    name: "char span with multiple attributes",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "See ",
        // Known attributes as direct properties — see the default-attribute fixture above.
        {
          type: "char",
          marker: "w",
          content: ["word"],
          lemma: "word",
          srcloc: "gnt5:51.1.2.1",
        } as MarkerObject,
        " here.",
      ],
    }),
  },
  {
    // A milestone whose authored attribute order is NOT the canonical sid-first order. The forward
    // adaptor records the authored order as `MilestoneNode.attributeOrder` (usj-editor.adaptor.ts
    // `createMilestone`) precisely so the reverse adaptor can reproduce it; JSON property order is
    // the only place USJ carries it.
    name: "milestone with non-canonical attribute order (who before sid)",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "Before ",
        // `who` deliberately precedes `sid`; the assertion is how USJ spells the known `who`
        // attribute (a direct property the closed `MarkerObject` type does not enumerate).
        { type: "ms", marker: "qt-s", who: "Pilate", sid: "qt_MAT_1" } as MarkerObject,
        "quoted text",
        { type: "ms", marker: "qt-e", eid: "qt_MAT_1" },
        " after.",
      ],
    }),
  },
  {
    // The `\va`/`\vp` triplet: one verse carrying number, alternate number, AND published number.
    name: "verse with altnumber and pubnumber together",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1", altnumber: "2", pubnumber: "1b" },
        "Triple-numbered verse text.",
      ],
    }),
  },
  {
    name: "verse with pubnumber only",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1", pubnumber: "1b" },
        "Published-number-only verse text.",
      ],
    }),
  },
  {
    // A table authored directly as USJ (`table` / `table:row` / `table:cell`), including a
    // range-spanning cell marker (`tc1-2`), which USX authoring in the sibling corpus never used.
    name: "table with a range-spanning cell",
    usj: usjBook(
      {
        type: "para",
        marker: "p",
        content: [{ type: "verse", marker: "v", number: "1" }, "Before the table."],
      },
      {
        type: "table",
        content: [
          {
            type: "table:row",
            marker: "tr",
            content: [
              { type: "table:cell", marker: "th1", align: "start", content: ["Day"] },
              { type: "table:cell", marker: "th2", align: "start", content: ["Tribe"] },
            ],
          },
          {
            type: "table:row",
            marker: "tr",
            content: [
              { type: "table:cell", marker: "tc1-2", align: "start", content: ["Spanning both"] },
            ],
          },
        ],
      },
      { type: "para", marker: "p", content: ["After the table."] },
    ),
  },
  {
    // An opaque block with MULTIPLE paragraphs, the second carrying a char span — the corpus
    // sidebar fixture holds a single plain paragraph, so nesting depth inside the opaque construct
    // is otherwise unpinned.
    name: "sidebar with two paragraphs and a nested char span",
    usj: usjBook(
      {
        type: "para",
        marker: "p",
        content: [{ type: "verse", marker: "v", number: "1" }, "Main text."],
      },
      {
        type: "sidebar",
        marker: "esb",
        category: "History",
        content: [
          { type: "para", marker: "p", content: ["First sidebar paragraph."] },
          {
            type: "para",
            marker: "p",
            content: [
              "Second with ",
              { type: "char", marker: "nd", content: ["Lord"] },
              " inside.",
            ],
          },
        ],
      },
    ),
  },
  {
    // Empty char spans: `content: []` and no `content` at all are DIFFERENT authored shapes, and
    // each must return exactly as it came in — the round trip may neither invent an empty array
    // nor drop one.
    name: "empty char spans (empty content array and absent content)",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "Before ",
        { type: "char", marker: "bd", content: [] },
        " middle ",
        { type: "char", marker: "bd" },
        " after.",
      ],
    }),
  },
  {
    // Data NBSPs in every content context: body text, char-span interior, and note content. In
    // standard view they display as `~`; in the other modes as the byte itself. Either way they
    // are DATA and must reach the USJ unchanged.
    name: "NBSP-bearing content in body, char interior, and note content",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        `About 3${NBSP}000 men and `,
        { type: "char", marker: "nd", content: [`Lo${NBSP}rd`] },
        {
          type: "note",
          marker: "f",
          caller: "+",
          content: [{ type: "char", marker: "ft", content: [`note${NBSP}text`], closed: "false" }],
        },
        " after.",
      ],
    }),
  },
  {
    // A content string that is EXACTLY one NBSP, leading its paragraph.
    name: "paragraph-leading lone data NBSP",
    usj: usjBook({
      type: "para",
      marker: "p",
      content: [NBSP, { type: "verse", marker: "v", number: "1" }, "in the days"],
    }),
    expectedByMode: (() => {
      // Documented normalization (pinned at `editor-usj-adaptor.test.tsx`, "formatted view: drops
      // a lone leading data NBSP", and documented at the reverse adaptor's lone-NBSP byte test in
      // editor-usj.adaptor.ts): outside standard view there is no display mapping to disguise a
      // data NBSP, so a content string that is exactly one NBSP is indistinguishable from an
      // untagged structural spacer and is dropped. The mechanism is "outside standard view", so
      // it applies identically to all three non-standard modes; the two standard-view configs
      // (which display the NBSP as `~`) preserve the byte and assert exact identity.
      const loneNbspDropped = usjBook({
        type: "para",
        marker: "p",
        content: [{ type: "verse", marker: "v", number: "1" }, "in the days"],
      });
      return {
        [FORMATTED_VIEW_MODE]: loneNbspDropped,
        [UNFORMATTED_VIEW_MODE]: loneNbspDropped,
        [PARAGRAPH_STRUCTURE_VIEW_MODE]: loneNbspDropped,
      };
    })(),
  },
];

/** One {@link KNOWN_DIVERGENCES} entry per view configuration, for a divergence whose mechanism
 * does not depend on the view mode. */
function knownDivergenceInEveryMode(
  fixtureName: string,
  reason: string,
  pinned: Usj,
): { [testKey: string]: { reason: string; pinned: Usj } } {
  return Object.fromEntries(
    ROUND_TRIP_VIEW_CONFIGS.map(({ label }) => [`${fixtureName} [${label}]`, { reason, pinned }]),
  );
}

/**
 * Fixture-and-mode combinations KNOWN to fail exact identity for reasons that are NOT documented
 * normalizations — genuine divergences pinned at their current behavior so a change in either
 * direction is visible. Keyed `"<fixture name> [<mode label>]"`. Each entry names the mechanism
 * and pins the exact USJ the round trip currently returns; fixing the divergence deletes the
 * entry as part of the fix.
 */
const KNOWN_DIVERGENCES: { [testKey: string]: { reason: string; pinned: Usj } } = {
  ...knownDivergenceInEveryMode(
    "empty char spans (empty content array and absent content)",
    // Mechanism: the reverse adaptor builds a marker object's `content` from its data children and
    // `removeUndefinedProperties` drops the property when there are none (editor-usj.adaptor.ts
    // `createCharMarker`), so an authored `content: []` returns with the property ABSENT — the
    // spelling every canonical producer (usxStringToUsj, ParatextData) uses for an empty span.
    // Spelling-level only: no document data is lost, but the array-vs-absent distinction the
    // author wrote is not preserved. Pinned in every mode; the mechanism has no view dependence.
    "authored `content: []` returns with the `content` property absent (canonical empty-span spelling)",
    usjBook({
      type: "para",
      marker: "p",
      content: [
        { type: "verse", marker: "v", number: "1" },
        "Before ",
        { type: "char", marker: "bd" },
        " middle ",
        { type: "char", marker: "bd" },
        " after.",
      ],
    }),
  ),
};

describe("constructed USJ round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize(undefined, undefined);
  });

  // Deep equality is blind to JSON property ORDER, which for the attribute-order fixture is the
  // very thing under test — a sid-first canonicalization would pass `toEqual`. Pin the authored
  // `who`-before-`sid` order through the serialized bytes, in every view configuration.
  for (const { label, viewOptions } of ROUND_TRIP_VIEW_CONFIGS) {
    it(`milestone attribute order survives as authored [${label}]`, () => {
      const fixture = constructedFixtures.find((entry) =>
        entry.name.startsWith("milestone with non-canonical attribute order"),
      );
      if (!fixture) throw new Error("milestone attribute-order fixture not found");
      reset();
      initializeDeserialize(undefined);
      const editorState = serializeEditorState(fixture.usj, viewOptions);
      const roundTripped = deserializeSerializedEditorState(editorState, viewOptions);
      const openingMilestone = JSON.stringify(roundTripped).match(
        /\{[^{}]*"ms"[^{}]*"qt-s"[^{}]*\}/,
      );
      if (!openingMilestone) throw new Error("opening milestone not found in round-tripped USJ");
      expect(openingMilestone[0].indexOf('"who"')).toBeGreaterThan(-1);
      expect(openingMilestone[0].indexOf('"who"')).toBeLessThan(
        openingMilestone[0].indexOf('"sid"'),
      );
    });
  }

  for (const fixture of constructedFixtures) {
    for (const { label, viewOptions } of ROUND_TRIP_VIEW_CONFIGS) {
      const divergence = KNOWN_DIVERGENCES[`${fixture.name} [${label}]`];
      const documented = fixture.expectedByMode?.[label];
      let suffix = "";
      if (divergence) suffix = ` (known divergence: ${divergence.reason})`;
      else if (documented) suffix = " (documented normalization)";
      it(`${fixture.name} [${label}]${suffix}`, () => {
        reset();
        initializeDeserialize(undefined);
        const editorState = serializeEditorState(fixture.usj, viewOptions);
        const roundTripped = deserializeSerializedEditorState(editorState, viewOptions);
        expect(roundTripped).toEqual(divergence?.pinned ?? documented ?? fixture.usj);
      });
    }
  }
});
