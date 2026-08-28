/**
 * Twin pin: the reverse adaptor's `recurseNodes` (editor-usj.adaptor.ts, private — driven here
 * through `deserializeEditorState`) defines which editor nodes become USJ content: presentation
 * nodes are skipped, TypedMarkNode annotation wrappers are spliced transparently, and contiguous
 * plain text coalesces into single strings. `$getLogicalContentItems` (libs/shared
 * node.utils.ts) is the live-tree model of the same content semantics — every logical index/offset
 * computation assumes its items line up one-to-one with the USJ content entries the exporter
 * produces. This suite pins that agreement over representative trees: for each tree, both
 * projections must yield the same item count, kinds, and coalesced text.
 *
 * Known deliberate exclusion (documented on `$getLogicalContentItems`): comment-type
 * TypedMarkNodes, whose milestone serialization is deprecated and pending removal — the trees
 * here use non-comment annotation types.
 */
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";
import { deserializeEditorState } from "./editor-usj.adaptor";
import { twinPinNodes } from "./twin-pin.test-helpers";
import {
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $isElementNode,
  $setState,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  $createTypedMarkNode,
  $createVerseNode,
  $getLogicalContentItems,
  getEditableCallerText,
  getVisibleOpenMarkerText,
  NBSP,
  NODE_ATTRIBUTE_PREFIX,
  textTypeState,
} from "shared";
import { getViewOptions, UNFORMATTED_VIEW_MODE, ViewOptions } from "shared-react";

// Unformatted view: editable markerMode (so glyphs and separators exist, as in the shipped
// editable modes) WITHOUT the standard-view whitespace display encoding, which would rewrite
// text content on serialization — that pipeline is pinned by the whitespace-display tests and
// is not part of the content-semantics contract under test.
const unformattedView: ViewOptions | undefined = getViewOptions(UNFORMATTED_VIEW_MODE);
if (!unformattedView) throw new Error("Unformatted view options are required for these tests");
const viewOptions: ViewOptions = unformattedView;

/**
 * One content item as summarized from either projection: `kind` is the shared vocabulary — a
 * Lexical `getType()` value, which for USJ-content nodes ("char", "note", "verse", "ms") is
 * exactly the USJ marker `type` string — plus the coalesced text for text items.
 */
interface ContentItemSummary {
  kind: string;
  text?: string;
}

interface AgreementCase {
  name: string;
  $build: () => void;
  expected: ContentItemSummary[];
}

const cases: AgreementCase[] = [
  {
    // The two formats differ only so Lexical's commit-time normalization does not merge the
    // adjacent simple TextNodes back into one — neither projection consults format.
    name: "a text run split across differently-formatted TextNodes coalesces to one string",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("Hello "),
          $createTextNode("world").toggleFormat("bold"),
        ),
      );
    },
    expected: [{ kind: "text", text: "Hello world" }],
  },
  {
    name: "text inside a TypedMarkNode annotation splices into the surrounding run",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("the "),
          $createTypedMarkNode({ spelling: ["s1"] }).append($createTextNode("man")),
          $createTextNode(" who"),
        ),
      );
    },
    expected: [{ kind: "text", text: "the man who" }],
  },
  {
    name: "the editable paragraph marker glyph and trailing separator are presentation-only",
    $build: () => {
      $getRoot().append(
        $createParaNode("q1").append(
          $createMarkerNode("q1"),
          $createMarkerTrailingSeparator(),
          $createTextNode("content"),
        ),
      );
    },
    expected: [{ kind: "text", text: "content" }],
  },
  {
    name: "an NBSP-only spacer between char spans is dropped",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createCharNode("bd").append($createMarkerNode("bd"), $createTextNode(`${NBSP}bold`)),
          $createTextNode(NBSP),
          $createCharNode("it").append($createMarkerNode("it"), $createTextNode(`${NBSP}italic`)),
        ),
      );
    },
    expected: [{ kind: "char" }, { kind: "char" }],
  },
  {
    // Formats differ around the spacer only to defeat Lexical's adjacent-simple-text merge (see
    // the first case); the spacer itself must be dropped by BOTH projections and the run must
    // coalesce across it.
    name: "an NBSP-only spacer inside a text run is dropped and the run coalesces across it",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("first").toggleFormat("bold"),
          $createTextNode(NBSP),
          $createTextNode("second").toggleFormat("italic"),
        ),
      );
    },
    expected: [{ kind: "text", text: "firstsecond" }],
  },
  {
    // VerseNode IS a TextNode subclass in editable mode, so this also pins the
    // "only plain TextNodes (exact 'text' type) join a coalesced run" rule: the verse is a
    // standalone item that breaks the run, and its glyph text never leaks into the strings.
    // The LineBreakNode (the spacing-less layout's verse separator) is presentation-only.
    name: "a VerseNode is a standalone item that breaks the text run; line breaks are skipped",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("before "),
          $createLineBreakNode(),
          $createVerseNode("2", getVisibleOpenMarkerText("v", "2")),
          $createTextNode("after"),
        ),
      );
    },
    expected: [
      { kind: "text", text: "before " },
      { kind: "verse" },
      { kind: "text", text: "after" },
    ],
  },
  {
    name: "a NoteNode is a standalone item between text runs",
    $build: () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("word"),
          $createNoteNode("f", "+", false).append(
            $createMarkerNode("f"),
            $createTextNode(getEditableCallerText("+")),
            $createCharNode("ft").append(
              $createMarkerNode("ft"),
              $createTextNode(`${NBSP}note body`),
            ),
            $createMarkerNode("f", "closing"),
          ),
          $createTextNode(" tail"),
        ),
      );
    },
    expected: [{ kind: "text", text: "word" }, { kind: "note" }, { kind: "text", text: " tail" }],
  },
  {
    // The milestone's editable rendering (opening glyph, attribute text, self-closing glyph —
    // the shapes the forward adaptor emits after a milestone) is all presentation-only; only
    // the MilestoneNode itself is content. The attribute text is skipped by DIFFERENT mechanisms
    // on the two sides (its "attribute" textType tag vs its NBSP| text prefix) — this pins that
    // they agree anyway.
    name: "a MilestoneNode is a standalone item; its glyphs and attribute text are skipped",
    $build: () => {
      const attributeText = $createTextNode(`${NODE_ATTRIBUTE_PREFIX}sid="1"`);
      $setState(attributeText, textTypeState, "attribute");
      $getRoot().append(
        $createParaNode("p").append(
          $createTextNode("pre"),
          $createMilestoneNode("ts-s", "1"),
          $createMarkerNode("ts-s"),
          attributeText,
          $createMarkerNode("", "selfClosing"),
          $createTextNode("post"),
        ),
      );
    },
    expected: [{ kind: "text", text: "pre" }, { kind: "ms" }, { kind: "text", text: "post" }],
  },
];

describe("content semantics agreement: deserializeEditorState vs $getLogicalContentItems", () => {
  it.each(cases)("$name", ({ $build, expected }) => {
    const { editor } = createBasicTestEnvironment(twinPinNodes, $build);

    let logicalItems: ContentItemSummary[] = [];
    editor.getEditorState().read(() => {
      const para = $getRoot().getFirstChild();
      if (!$isElementNode(para)) throw new Error("Expected the built para as the first root child");
      logicalItems = $getLogicalContentItems(para).map((item) =>
        item.type === "text"
          ? {
              kind: "text",
              text: item.segments.map((segment) => segment.node.getTextContent()).join(""),
            }
          : { kind: item.node.getType() },
      );
    });

    const usj = deserializeEditorState(editor.getEditorState(), viewOptions);
    if (!usj) throw new Error("Expected USJ from deserialization");
    const para = usj.content[0];
    if (typeof para === "string" || para.type !== "para")
      throw new Error("Expected the built para as the first USJ content entry");
    const usjItems: ContentItemSummary[] = (para.content ?? []).map((entry) =>
      typeof entry === "string" ? { kind: "text", text: entry } : { kind: entry.type },
    );

    // Pin the expected items themselves first, so both sides drifting together still fails
    // loudly; then the two projections must agree with each other by transitivity.
    expect(logicalItems).toEqual(expected);
    expect(usjItems).toEqual(expected);
  });
});
