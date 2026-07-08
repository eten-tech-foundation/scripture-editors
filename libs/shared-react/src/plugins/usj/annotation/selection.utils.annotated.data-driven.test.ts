/**
 * Annotation-invariance tests for USJ ↔ Lexical selection conversion (PT-3835).
 *
 * Loads the usj2Sa serialized states (all 3 marker modes), wraps several USJ ranges in
 * TypedMarkNodes (in both application orders), then asserts every textContent location still
 * resolves and round-trips to exactly the same UsjDocumentLocation as in the unannotated
 * document. Locations are defined against the actual USJ, which never contains annotations,
 * so annotations must not shift them.
 *
 * @see selection.utils.data-driven.test.ts for the unannotated baseline suite.
 */
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  createBasicTestEnvironment,
  updateSelection,
} from "../../../../../../libs/shared/src/nodes/usj/test.utils";
import { usjReactNodes } from "../../../nodes/usj";
import type { SelectionRange } from "./selection.model";
import { $getRangeFromUsjSelection, $getUsjSelectionFromEditor } from "./selection.utils";
import { isUsjTextContentLocation } from "@eten-tech-foundation/scripture-utilities";
import type { LexicalEditor, LexicalNode, SerializedEditorState } from "lexical";
import { $wrapSelectionInTypedMarkNode, TypedMarkNode } from "shared";
import type { LocationEntry2Sa } from "test-data";
import {
  usjLocations2Sa,
  lexicalEditable2Sa,
  lexicalVisible2Sa,
  lexicalHidden2Sa,
} from "test-data";

const MARKER_MODES = [
  { name: "editable", state: lexicalEditable2Sa },
  { name: "visible", state: lexicalVisible2Sa },
  { name: "hidden", state: lexicalHidden2Sa },
] as const;

const APPLICATION_ORDERS = ["front-to-back", "back-to-front"] as const;

/**
 * Matches plain text-run paths such as "$.content[20].content[0]" (paragraph-level) or
 * "$.content[18].content[1].content[0]" (nested inside a char/note node), i.e. any dotted
 * chain of numeric `content[N]` segments. Excludes property paths like "['marker']".
 *
 * Widened from a paragraph-level-only match: the usj2Sa corpus has only 3 distinct
 * paragraph-level textContent paths, and only 2 of them have an entry at offset >= 4
 * (the third, `$.content[16].content[2]`, is only sampled at offset 0). Including
 * char/note-nested text runs is needed to reach 3 qualifying paths.
 */
const TEXT_RUN_PATH = /^\$\.content\[\d+\](\.content\[\d+\])+$/;

const textEntries = usjLocations2Sa.filter(
  (entry) =>
    entry.locationType === "textContent" && isUsjTextContentLocation(entry.documentLocation),
);

describe("data-driven: usj2Sa textContent locations are annotation-invariant", () => {
  describe.each(MARKER_MODES)("'$name' mode", ({ state: serializedState }) => {
    describe.each(APPLICATION_ORDERS)("annotations applied %s", (order) => {
      let editor: LexicalEditor;

      beforeAll(() => {
        editor = createAnnotatedEditor(serializedState, order);
      });

      for (const entry of textEntries) {
        it(`round-trips ${entry.description} unchanged`, () => {
          roundTrip(editor, entry);
        });
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers (after the tests; function declarations hoist. The consts above the
// describe stay there — they are read at collection time.)
// ---------------------------------------------------------------------------

/**
 * Wrap ranges derived from the corpus itself: the first 3 distinct text-run paths (see
 * `TEXT_RUN_PATH`) that have an entry at offset >= 4 each get an annotation over [1, 4).
 * Corpus locations at offsets 1-4 of those paths then sit at annotation edges or inside
 * annotations; later locations in the same runs exercise the "after an annotation" index shifts.
 */
function getAnnotationRanges(): SelectionRange[] {
  const jsonPaths: string[] = [];
  for (const entry of textEntries) {
    const location = entry.documentLocation;
    if (!isUsjTextContentLocation(location)) continue;
    if (
      location.offset >= 4 &&
      TEXT_RUN_PATH.test(location.jsonPath) &&
      !jsonPaths.includes(location.jsonPath)
    ) {
      jsonPaths.push(location.jsonPath);
    }
    if (jsonPaths.length === 3) break;
  }
  if (jsonPaths.length < 3) throw new Error("Expected 3 text-run paths in corpus");
  return jsonPaths.map((jsonPath) => ({
    start: { jsonPath, offset: 1 },
    end: { jsonPath, offset: 4 },
  })) as SelectionRange[];
}

function createAnnotatedEditor(
  serializedState: SerializedEditorState,
  order: (typeof APPLICATION_ORDERS)[number],
): LexicalEditor {
  const nodes = [TypedMarkNode, ...usjReactNodes];
  const { editor } = createBasicTestEnvironment(nodes);
  editor.setEditorState(editor.parseEditorState(serializedState));

  const ranges = getAnnotationRanges();
  const orderedRanges = order === "front-to-back" ? ranges : [...ranges].reverse();
  orderedRanges.forEach((range, i) => {
    editor.update(
      () => {
        const selection = $getRangeFromUsjSelection(range);
        if (!selection)
          throw new Error(`Failed to resolve annotation range at ${range.start.jsonPath}`);
        $wrapSelectionInTypedMarkNode(selection, "test-annotation", `${order}-${i}`);
      },
      { discrete: true },
    );
  });
  return editor;
}

/** Resolve USJ→Lexical, set the selection, read it back as USJ (same as the baseline suite). */
function roundTrip(editor: LexicalEditor, entry: LocationEntry2Sa) {
  let anchorNode: LexicalNode | undefined;
  let anchorOffset: number | undefined;

  editor.getEditorState().read(() => {
    const editorSelection = $getRangeFromUsjSelection({ start: entry.documentLocation });
    if (!editorSelection)
      throw new Error(`Expected editorSelection to be defined for ${entry.description}`);
    anchorNode = editorSelection.anchor.getNode();
    anchorOffset = editorSelection.anchor.offset;
  });
  if (anchorNode === undefined || anchorOffset === undefined)
    throw new Error(`Expected resolved selection values for ${entry.description}`);

  updateSelection(editor, anchorNode, anchorOffset);

  editor.getEditorState().read(() => {
    const roundTripped = $getUsjSelectionFromEditor();
    if (!roundTripped)
      throw new Error(`Expected round-tripped selection to be defined for ${entry.description}`);
    expect(roundTripped.start).toEqual(entry.documentLocation);
  });
}
