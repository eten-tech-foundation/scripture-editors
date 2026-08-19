/**
 * The editor round trip, run over the RICH corpus.
 *
 * Three corpora already exist, and until now they covered three different legs with two different
 * fixture sets:
 *
 * - `usfmFragmentToUsj.corpus.test.ts` (shared) — USFM to USJ only, against the testUSFM fixtures
 *   with Paratext 9.5's own USJ as the oracle. This is where the edge cases live: attribute
 *   markers, milestones, unknown markers, unclosed spans, figures, tables, sidebars, links.
 * - `corpus-round-trip.test.ts` (here) — USJ to editor state to USJ, against a smaller set of
 *   hand-authored USX fixtures.
 * - `tier2Rebuild.corpus.test.tsx` — the Tier-2 fixed-point property over the 2SA data.
 *
 * The seam: the tokenizer leg gets the rich fixtures, the editor leg gets the authored ones, and
 * nothing runs the rich fixtures THROUGH the editor. A defect in the USJ-to-editor-to-USJ leg, on a
 * shape only the rich corpus contains, falls straight between them — which is how a deleted space
 * after an attribute marker's closer survived a green board.
 *
 * This suite closes that seam by feeding each testUSFM oracle USJ through the same adaptor pair the
 * app loads and saves with. It is deliberately the ADAPTOR leg only (no editor instance, no
 * plugins), matching `corpus-round-trip.test.ts`; the transform leg over these same fixtures is a
 * natural follow-on once the adaptor leg is clean.
 *
 * These fixtures are vendored copies whose source of truth lives in paranext-core
 * (`lib/platform-bible-utils/src/scripture/usj-reader-writer-test-data/`); see the corpus README.
 */

import {
  initialize as initializeSerialize,
  reset,
  serializeEditorState,
} from "../usj-editor.adaptor";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../editor-usj.adaptor";
import { expectEveryTextBearingNodeRendered } from "./corpusRendering.test-helpers";
import { MarkerEditPlugin } from "../../markerEdit/MarkerEditPlugin";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import { $getRoot, $isElementNode, LexicalNode } from "lexical";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CharNodePlugin,
  getViewOptions,
  STANDARD_VIEW_MODE,
  TextSpacingPlugin,
  ViewOptions,
} from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

// Vitest's module transform does not preserve a usable `import.meta.url`, so locate the vendored
// corpus relative to the working directory — the platform project root under nx, the repo root
// otherwise. Same probing shape the shared-side corpus test uses.
const CORPUS_DIR = [
  "../../libs/shared/src/converters/usfm/testUsfmCorpus",
  "libs/shared/src/converters/usfm/testUsfmCorpus",
].find((dir) => existsSync(dir));

/**
 * The Paratext-flavored oracles, matching the shared-side corpus test's selection. `2SA-3` uses the
 * CORRECTED oracle rather than Paratext's raw output, which carries an acknowledged Paratext 9.5
 * bug (a `\cp` with markers is partially folded into `pubnumber` and the remainder stranded as an
 * invalid top-level char). Our tokenizer deliberately produces the corrected shape.
 */
const FIXTURES = [
  "testUSFM-2SA-1.usj",
  "testUSFM-2SA-2.usj",
  "testUSFM-2SA-3-corrected.usj",
  "web-matthew-1-and-2.usj",
  "web-matthew-5-section-header.usj",
];

/**
 * Fixtures this suite is KNOWN to fail, with the mechanism named. Skipped rather than left red so
 * the branch every track builds on stays green. Each entry is a specification of a defect: the
 * named track deletes its entry as part of its fix.
 */
const KNOWN_FAILURES: { [fixtureName: string]: string } = {};

/** The same contract as {@link KNOWN_FAILURES}, for the transform leg below. */
const KNOWN_TRANSFORM_FAILURES: { [fixtureName: string]: string } = {};

function requireStandardViewOptions(): ViewOptions {
  const options = getViewOptions(STANDARD_VIEW_MODE);
  if (!options) throw new Error("Standard view options are required for these tests.");
  return options;
}

function readOracle(name: string): Usj {
  if (!CORPUS_DIR) throw new Error("testUsfmCorpus fixture directory not found from cwd");
  return JSON.parse(readFileSync(join(CORPUS_DIR, name), "utf8")) as Usj;
}

describe("testUSFM corpus editor round-trip (USJ -> editor state -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize(undefined, undefined);
  });

  for (const name of FIXTURES) {
    const skip = KNOWN_FAILURES[name];
    const run = skip ? it.skip : it;
    run(`${name}${skip ? ` (${skip})` : ""}`, () => {
      const viewOptions = requireStandardViewOptions();
      const usj = readOracle(name);
      reset();
      initializeDeserialize(undefined);

      const editorState = serializeEditorState(usj, viewOptions);
      const roundTripped = deserializeSerializedEditorState(editorState, viewOptions);
      // The oracles are Paratext 9.5's output and carry `version: "3.0"`; the editor emits USJ
      // 3.1. That is the documented output version, not a round-trip loss, so compare CONTENT —
      // the bytes and structure this suite exists to protect — rather than the version stamp.
      expect(roundTripped?.content).toEqual(usj.content);
    });
  }
});

/** Marks `node` and every descendant dirty, so each one's registered transforms run. */
function $markSubtreeDirty(node: LexicalNode): void {
  node.markDirty();
  if ($isElementNode(node)) node.getChildren().forEach($markSubtreeDirty);
}

/**
 * The TRANSFORM leg over the same rich fixtures — the other half of the seam.
 *
 * `corpus-transform-fixed-point.test.tsx` pins the same property against the hand-authored
 * fixtures; this runs it against the edge cases. Transforms do not run on `setEditorState`, only on
 * dirty nodes, so a transform that fabricates or deletes content does so on the user's first edit
 * to a region — invisible to the adaptor leg above, which passes cleanly on every fixture here.
 *
 * `markDirty()` rather than a real edit keeps any diff attributable to the transforms alone.
 */
describe("testUSFM corpus transform fixed point (USJ -> editor state -> dirty -> USJ)", () => {
  beforeEach(() => {
    initializeSerialize(undefined, undefined);
  });

  for (const name of FIXTURES) {
    const skip = KNOWN_TRANSFORM_FAILURES[name];
    const run = skip ? it.skip : it;
    run(`${name}${skip ? ` (${skip})` : ""}`, async () => {
      const viewOptions = requireStandardViewOptions();
      const usj = readOracle(name);
      reset();
      initializeDeserialize(undefined);

      const state = serializeEditorState(usj, viewOptions);
      const { editor } = await baseTestEnvironment(
        JSON.stringify({ root: state.root }),
        <>
          <CharNodePlugin />
          <MarkerEditPlugin viewOptions={viewOptions} />
          <TextSpacingPlugin />
        </>,
      );
      expectEveryTextBearingNodeRendered(editor, `${name} after load`);

      await act(async () => {
        editor.update(
          () => {
            $getRoot().getChildren().forEach($markSubtreeDirty);
          },
          { discrete: true },
        );
      });
      expectEveryTextBearingNodeRendered(editor, `${name} after the dirty pass`);

      const afterTransforms = deserializeSerializedEditorState(
        editor.getEditorState().toJSON(),
        viewOptions,
      );
      expect(afterTransforms?.content).toEqual(usj.content);
    });
  }
});
