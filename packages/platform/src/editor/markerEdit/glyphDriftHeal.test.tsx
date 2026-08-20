/**
 * Machine-drift HEAL audit for the marker glyph kinds — the fourth quadrant of the engine-owned
 * display lifecycle (construct / heal / pend / settle) for the glyphs that are NOT display-run
 * pieces: a char span's opener and closer, and a paragraph's prefix glyph.
 *
 * ## The audit matrix (measured against the merged engine; this file is its pin)
 *
 * | Glyph kind        | USER edit (caret holds the site)             | MACHINE drift (no caret at the site)        |
 * | ----------------- | -------------------------------------------- | ------------------------------------------- |
 * | char opener `\nd` | `$markerNodeTransform` opening branch:       | was NONE — the same branch pended the drift |
 * |                   | terminated form renames in place, anything   | as if user-typed, and the next caret        |
 * |                   | else pends; departure settles                | departure settled the damaged bytes INTO    |
 * |                   | (`$resolvePendingMarkers`: bare rename or    | the document (`\nd` drifted to `\n`         |
 * |                   | Tier 2)                                      | auto-renamed the span to marker `n`).       |
 * |                   |                                              | Now HEALS in place.                         |
 * | char closer `\nd*`| closer branch: pends (typed-at-end splits    | was NONE — same misattributed pend; the     |
 * |                   | out); departure degrades through Tier 2      | departure settle degraded the span to       |
 * |                   | (damagedGlyphSettle.test.tsx)                | `closed="false"` and absorbed the following |
 * |                   |                                              | content. Now HEALS in place.                |
 * | para prefix `\p`  | opening branch, same as the char opener; the | was NONE — drift settled as a paragraph     |
 * |                   | trailing separator has its own grace+pend    | rename. Now HEALS in place.                 |
 * |                   | (`$healMarkerTrailingSeparator`)             |                                             |
 * |
 * Notes on the measurement:
 * - Serialization derives from node STATE, so un-settled drift never reached the USJ directly.
 *   The defect was the LATER settle: pending records "user edit in progress", and resolving it
 *   re-tokenizes the displayed bytes ("displayed bytes win") — correct for a user edit, but for
 *   machine drift it silently turns the drift into a document change (heal by provenance —
 *   machine drift heals, a user edit pends).
 * - The fix is ONE site — a heal branch at the top of `$markerNodeTransform` — because all three
 *   kinds route their byte divergence through that transform. Run glyphs (`\va*`, a milestone's
 *   `\*`, `\cat`…) get the same in-place heal for free, which also stops the piece scanners'
 *   "damaged = absent" rule from ever meeting machine-drift debris.
 * - Provenance is the pend ledger plus caret-at-site AT TRANSFORM TIME, inside the very update
 *   that carried the damage — the same gate `$healMarkerTrailingSeparator` uses. This is not the
 *   forbidden caret-proximity heuristic (deciding a LATER heal by where the caret is NOW): a
 *   keystroke edit happens at the caret, so within the damaging update the caret position is
 *   evidence of WHO edited. Across commits the recorded pend is the user-edit ledger, kept honest
 *   through undo/redo by `$rependPendShapedNodes`.
 *
 * Every test runs under `withCommitBound` (markerEdit.test-helpers): a heal that re-dirtied its
 * glyph forever, or a regressed settle cascade, must FAIL the run, not hang it.
 */

import {
  COMMIT_BOUND,
  historyTestEnvironment,
  requireDefined,
  testEnvironmentWithDisplaySyncs,
  withCommitBound,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  LexicalNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

/** Every MarkerNode in the document, in document order. */
function $allGlyphs(): MarkerNode[] {
  const glyphs: MarkerNode[] = [];
  const visit = (node: LexicalNode) => {
    if ($isMarkerNode(node)) glyphs.push(node);
    else if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  $getRoot().getChildren().forEach(visit);
  return glyphs;
}

/**
 * `\p \v 1 before \nd Lord\nd* after\v 2 body` — one paragraph carrying the span under test, with
 * a second verse for the caret to park in (drift) or depart to (twin).
 */
function $charSpanDocument(): void {
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      $createVerseNode("1", getVisibleOpenMarkerText("v", "1")),
      $createTextNode(" before "),
      $createCharNode("nd").append(
        $createMarkerNode("nd"),
        $createTextNode(`${NBSP}Lord`),
        $createMarkerNode("nd", "closing"),
      ),
      $createTextNode(" after"),
      $createVerseNode("2", getVisibleOpenMarkerText("v", "2")),
      $createTextNode(" body"),
    ),
  );
}

/** The trailing " body" TextNode after `\v 2` — the away-from-the-site caret park. */
function $bodyText() {
  const para = $getRoot().getChildren().filter($isParaNode).at(-1);
  const body = para?.getLastChild();
  if (!$isTextNode(body)) throw new Error("body text missing");
  return body;
}

function $glyph(predicate: (glyph: MarkerNode) => boolean, message: string): MarkerNode {
  return requireDefined($allGlyphs().find(predicate), message);
}

const $charOpener = () =>
  $glyph(
    (glyph) => glyph.getMarker() === "nd" && glyph.getMarkerSyntax() === "opening",
    "\\nd opener missing",
  );
const $charCloser = () =>
  $glyph(
    (glyph) => glyph.getMarker() === "nd" && glyph.getMarkerSyntax() === "closing",
    "\\nd closer missing",
  );
const $paraPrefix = () => $glyph((glyph) => glyph.getMarker() === "p", "\\p prefix missing");

/** The first paragraph's `\nd` span, if it still exists. */
function $ndSpan() {
  return $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isCharNode);
}

describe("machine drift on glyph bytes heals in place (no caret at the site)", () => {
  it("heals a drifted char opener instead of settling it into a rename", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      // The user is working elsewhere — the caret is parked in `\v 2 body`.
      await act(async () => editor.update(() => $bodyText().select(0, 0)));
      // Machine drift: a non-user code path mangles the opener's bytes. No selection change, no
      // user gesture — the same drive $syncDisplayRun's heal tests use for non-user divergence.
      await act(async () => editor.update(() => $charOpener().setTextContent("\\n")));

      editor.getEditorState().read(() => {
        // Healed: the bytes are canonical again and the span was NOT renamed. Before the heal,
        // the transform pended the drift as a user edit and the deferred resolve settled `\n` as
        // a bare rename — the span's marker became "n" and the drift was in the document.
        expect($charOpener().getTextContent()).toBe("\\nd");
        expect(requireDefined($ndSpan(), "span missing").getMarker()).toBe("nd");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("heals a drifted char closer instead of degrading the span", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      await act(async () => editor.update(() => $bodyText().select(0, 0)));
      await act(async () => editor.update(() => $charCloser().setTextContent("\\nd")));

      editor.getEditorState().read(() => {
        // Healed: the `*` is back and the span is intact — one `\nd` span, still explicitly
        // closed. Before the heal, departure-settling the misattributed pend re-tokenized the
        // paragraph: the span re-closed implicitly (`closed="false"`) and absorbed " after".
        expect($charCloser().getTextContent()).toBe("\\nd*");
        const span = requireDefined($ndSpan(), "span missing");
        expect(span.getUnknownAttributes()?.closed).toBeUndefined();
        const spans = $getRoot()
          .getChildren()
          .filter($isParaNode)[0]
          .getChildren()
          .filter($isCharNode);
        expect(spans).toHaveLength(1);
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("heals a drifted para prefix instead of settling it into a paragraph rename", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      await act(async () => editor.update(() => $bodyText().select(0, 0)));
      await act(async () => editor.update(() => $paraPrefix().setTextContent("\\q")));

      editor.getEditorState().read(() => {
        expect($paraPrefix().getTextContent()).toBe("\\p");
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("p");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);
});

describe("the heal never fires on a caret-held site (user-deletion twins)", () => {
  // Each twin applies the IDENTICAL byte damage with the caret left at the damage site — the
  // user-edit shape — and asserts the existing pend/settle path is untouched: nothing heals while
  // the caret holds the glyph, and departure settles the displayed bytes exactly as before.

  it("a user-damaged char opener stays pended under the caret, then settles as a rename", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const opener = $charOpener();
          opener.setTextContent("\\n");
          opener.select(2, 2); // the caret sits where the deleted byte was — a user edit
        }),
      );

      editor.getEditorState().read(() => {
        // Mid-edit grace: NOT healed, NOT settled — the damaged bytes are still on screen.
        expect($charOpener().getTextContent()).toBe("\\n");
        expect(requireDefined($ndSpan(), "span missing").getMarker()).toBe("nd");
      });

      // Departure settles the displayed bytes: `\n` is a bare opener form, so the span renames.
      await act(async () => editor.update(() => $bodyText().select(0, 0)));

      editor.getEditorState().read(() => {
        expect(requireDefined($ndSpan(), "span missing").getMarker()).toBe("n");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("a user-damaged char closer stays pended under the caret, then degrades on departure", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const closer = $charCloser();
          closer.setTextContent("\\nd");
          closer.select(3, 3);
        }),
      );

      editor.getEditorState().read(() => {
        expect($charCloser().getTextContent()).toBe("\\nd");
      });

      await act(async () => editor.update(() => $bodyText().select(0, 0)));

      editor.getEditorState().read(() => {
        // The span re-closes implicitly and the following content joins it — the same PT9
        // degradation damagedGlyphSettle.test.tsx pins for the caret-held char closer.
        const spans = $getRoot()
          .getChildren()
          .filter($isParaNode)[0]
          .getChildren()
          .filter($isCharNode);
        expect(spans).toHaveLength(2);
        expect(spans.every((span) => span.getMarker() === "nd")).toBe(true);
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("a user-damaged para prefix stays pended under the caret, then settles as a rename", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs($charSpanDocument, logger);
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const prefix = $paraPrefix();
          prefix.setTextContent("\\q");
          prefix.select(2, 2);
        }),
      );

      editor.getEditorState().read(() => {
        expect($paraPrefix().getTextContent()).toBe("\\q");
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("p");
      });

      await act(async () => editor.update(() => $bodyText().select(0, 0)));

      editor.getEditorState().read(() => {
        // Departure settles the displayed bytes: `\q` is a bare opener form for a paragraph-kind
        // marker, so the paragraph renames — the user's edit wins, exactly as before the heal.
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("q");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);
});

describe("the heal respects the pend ledger across commits", () => {
  it("does not heal an undo-restored user literal that a later non-user commit re-dirties", async () => {
    // The one reachable shape where a damaged glyph is pended while the caret is AWAY from it: an
    // undo of a departure settle restores the mid-edit literal, `$rependPendShapedNodes` re-pends
    // it from the restored bytes, and the app-placed-caret window suppresses resolution. A machine
    // commit that re-dirties the restored glyph then meets it un-held — the recorded pend is the
    // ONLY gate keeping the heal from resurrecting the canonical bytes against the user's
    // explicitly-restored edit (never heal against a user edit).
    await withCommitBound(async ({ watch, commits }) => {
      const { editor } = await historyTestEnvironment($charSpanDocument);
      watch(editor);

      // User damages the para prefix (caret at the site), then departs — and the departure EDITS
      // the body text rather than merely parking the caret in it. That is what leaves the mid-edit
      // literal on the undo stack: a settle is never its own history entry, so it merges into the
      // entry of the commit that provoked it. A caret-only departure dirties nothing, so the
      // settle would join the damage's own entry and one Ctrl+Z would restore the undamaged `\p`
      // — never the literal this test needs. (Moving and typing in one commit compresses "the
      // user's next action was an edit elsewhere".)
      await act(async () =>
        editor.update(() => {
          const prefix = $paraPrefix();
          prefix.setTextContent("\\q");
          prefix.select(2, 2);
        }),
      );
      await act(async () =>
        editor.update(() => {
          const body = $bodyText();
          const end = body.getTextContentSize();
          body.select(end, end);
          const selection = $getSelection();
          if ($isRangeSelection(selection)) selection.insertText("!");
        }),
      );
      editor.getEditorState().read(() => {
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("q");
      });

      // Undo restores the mid-edit literal: bytes `\q` on a still-marker-"p" paragraph.
      await act(async () => {
        editor.dispatchCommand(UNDO_COMMAND, undefined);
      });
      editor.getEditorState().read(() => {
        expect($paraPrefix().getTextContent()).toBe("\\q");
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("p");
      });

      // A machine commit re-dirties the restored glyph without changing its bytes (`markDirty`,
      // the same transform-only drive the fixed-point corpus test uses). The caret gate cannot
      // protect it (the restored caret sits wherever the undo put it); the pend ledger must.
      await act(async () =>
        editor.update(() => {
          $paraPrefix().markDirty();
        }),
      );

      editor.getEditorState().read(() => {
        expect($paraPrefix().getTextContent()).toBe("\\q");
        expect($getRoot().getChildren().filter($isParaNode)[0].getMarker()).toBe("p");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
    });
  }, 20000);
});
