/**
 * Regression for a DAMAGED GLYPH — a marker glyph whose displayed characters the user edited while
 * its node state stayed intact. Deleting the `*` from a `\va*` closer leaves a `MarkerNode` still
 * reporting marker `va` and syntax `closing`, rendering `\va`.
 *
 * Two independent defects met on that shape, and the second froze the application:
 *
 * 1. **The display-run registry could not see the damage.** Its piece scanners keyed on node state
 *    alone, so a damaged closer still counted as the run's closer: `$runDiverges` reported the run
 *    canonical while the marker engine held the same glyph pending. With no divergence there was
 *    nothing for the caret grace to hold, so the settle re-tokenized the whole paragraph out from
 *    under the caret — two keystrokes into the edit, silently clearing `altnumber`.
 * 2. **The settle never reached a fixed point.** Those re-tokenized bytes produce two adjacent
 *    `char va` spans, which `CharNodePlugin`'s adjacent-span merge combined back into one — keeping
 *    both spans' glyphs, so the merged span's own bytes re-tokenize into two spans again. Each side
 *    genuinely differed from the other, so `$rebuildParas`' fixed-point refusal could never fire and
 *    the resolve/rebuild cascade spun the main thread forever.
 *
 * A non-terminating cascade re-queues itself as a MICROTASK, which starves the macrotask queue —
 * vitest's own per-test timeout can never fire, so a regression HANGS the run instead of failing it.
 * Every test here therefore runs under `withCommitBound`, which counts commits and cuts the cascade
 * off past a bound, turning the freeze back into an ordinary assertion failure.
 */

import {
  $appendMilestoneRun,
  $appendVerseAttributeRun,
  requireDefined,
  testEnvironmentWithDisplaySyncs,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import { $createTextNode, $getRoot, $isElementNode, LexicalEditor, LexicalNode } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createParaNode,
  $createVerseNode,
  $isAttributeRunNode,
  $isCharNode,
  $isMarkerNode,
  $isParaNode,
  $isVerseNode,
  CharNode,
  getVisibleOpenMarkerText,
  LoggerBasic,
  MarkerNode,
  NBSP,
  VerseNode,
} from "shared";

// jsdom doesn't implement `getBoundingClientRect` on `Range`; moving the caret gives the editor
// root DOM focus, and Lexical's post-commit scroll-into-view reads a Range rect. Stub it (a zero
// rect nothing here asserts on), same as the sibling marker-edit tests.
if (typeof Range.prototype.getBoundingClientRect !== "function")
  Range.prototype.getBoundingClientRect = () => new DOMRect();

/**
 * Commits a damaged-glyph settle needs: the edit itself, the graced follow-up, the departure, and
 * the settle's own rebuild plus its fixed-point follow-up. Generous — the point is to separate
 * "terminates" from "does not", not to pin an exact number that churns with unrelated work.
 */
const COMMIT_BOUND = 20;

interface CommitBound {
  /** Start counting `editor`'s commits. Call once, right after mounting. */
  watch: (editor: LexicalEditor) => void;
  /** Commits counted so far. */
  commits: () => number;
  /**
   * Collects the engine's warnings. Pass it to the environment and assert the settle-cascade
   * backstop stayed silent: the backstop's own ceiling is BELOW `COMMIT_BOUND`, so a regressed
   * root fix that only the backstop catches would otherwise slip through the commit assertion
   * looking healthy. The backstop is a backstop; these tests are about not needing it.
   */
  logger: LoggerBasic;
  /** Warnings the engine logged so far. */
  warnings: () => string[];
}

/**
 * Runs `body` with every watched commit counted and the engine's deferred settle hard-stopped once
 * the count passes `COMMIT_BOUND`.
 *
 * The stop is what makes a regression FAIL rather than HANG. The engine defers each settle with
 * `queueMicrotask`, and a cascade that re-queues on every commit never yields to the macrotask
 * queue, so no timer — including vitest's own timeout — ever runs again. Dropping deferrals once
 * the commit count has already proven the loop lets the assertion report it instead.
 */
async function withCommitBound(body: (bound: CommitBound) => Promise<void>): Promise<void> {
  let commits = 0;
  const warnings: string[] = [];
  const originalQueueMicrotask = globalThis.queueMicrotask;
  globalThis.queueMicrotask = (callback: () => void) => {
    if (commits > COMMIT_BOUND) return;
    originalQueueMicrotask(callback);
  };
  try {
    await body({
      watch: (editor) =>
        editor.registerUpdateListener(() => {
          commits += 1;
        }),
      commits: () => commits,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: (message: string) => warnings.push(message),
        error: () => undefined,
      },
      warnings: () => warnings,
    });
  } finally {
    globalThis.queueMicrotask = originalQueueMicrotask;
  }
}

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

/** Deletes the trailing `*` from `glyph`, leaving the caret where the `*` was. */
function $deleteClosingStar(glyph: MarkerNode): void {
  const damaged = glyph.getTextContent().slice(0, -1);
  glyph.setTextContent(damaged);
  glyph.select(damaged.length, damaged.length);
}

/** The document's LAST verse — where the repro's caret departs to (`\v 2`). */
function $lastVerse(): VerseNode {
  const verses: VerseNode[] = [];
  const visit = (node: LexicalNode) => {
    if ($isVerseNode(node)) verses.push(node);
    else if ($isElementNode(node)) node.getChildren().forEach(visit);
  };
  $getRoot().getChildren().forEach(visit);
  return requireDefined(verses.at(-1), "no verse to depart to");
}

/** The first paragraph's VerseNode — the one carrying the run under test. */
function $runVerse(): VerseNode {
  return requireDefined(
    $getRoot().getChildren().filter($isParaNode)[0].getChildren().find($isVerseNode),
    "verse missing",
  );
}

/**
 * `\p \v 1 <runs> In the beginning\v 2 body` — one paragraph, the shape real scripture has, with a
 * second verse in it for the caret to depart INTO (the reported repro's "move down into `\v 2`").
 */
function $verseRunDocument(altnumber?: string, pubnumber?: string): void {
  const verse = $createVerseNode(
    "1",
    getVisibleOpenMarkerText("v", "1"),
    undefined,
    altnumber,
    pubnumber,
  );
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      verse,
      $createTextNode(" In the beginning"),
      $createVerseNode("2", getVisibleOpenMarkerText("v", "2")),
      $createTextNode(" body"),
    ),
  );
  if (altnumber !== undefined) $appendVerseAttributeRun(verse, "va", altnumber);
  if (pubnumber !== undefined) $appendVerseAttributeRun(verse, "vp", pubnumber);
}

describe("a damaged closing glyph settles without freezing", () => {
  it("graces the \\va run while the caret is in the damaged glyph, then settles on departure", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs(
        () => $verseRunDocument("2"),
        logger,
      );
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const closer = requireDefined(
            $allGlyphs().find(
              (glyph) => glyph.getMarkerSyntax() === "closing" && glyph.getMarker() === "va",
            ),
            "\\va closer missing",
          );
          $deleteClosingStar(closer);
        }),
      );

      // Mid-edit grace: the caret is inside the glyph the user is editing, so NOTHING settles yet.
      // Before the registry could see damaged bytes this assertion failed — the run read canonical,
      // no divergence was graced, and the paragraph had already been re-tokenized by now.
      editor.getEditorState().read(() => {
        const verse = $runVerse();
        expect(verse.getAltnumber()).toBe("2");
        expect($isAttributeRunNode(verse.getNextSibling())).toBe(true);
      });

      // Caret departs down into `\v 2`.
      await act(async () => editor.update(() => $lastVerse().selectEnd()));

      editor.getEditorState().read(() => {
        const verse = $runVerse();
        // The displayed bytes win: `\va 2\va` is no longer an attribute fold, so the altnumber it
        // used to carry is gone and the bytes survive as ordinary char spans.
        expect(verse.getAltnumber()).toBeUndefined();
        const spans = $getRoot()
          .getChildren()
          .filter($isParaNode)[0]
          .getChildren()
          .filter($isCharNode);
        expect(spans.map((span) => span.getMarker())).toEqual(["va", "va"]);
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("settles a damaged \\vp closer without disturbing the verse's intact \\va run", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs(
        () => $verseRunDocument("2", "B"),
        logger,
      );
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const closer = requireDefined(
            $allGlyphs().find(
              (glyph) => glyph.getMarkerSyntax() === "closing" && glyph.getMarker() === "vp",
            ),
            "\\vp closer missing",
          );
          $deleteClosingStar(closer);
        }),
      );
      await act(async () => editor.update(() => $lastVerse().selectEnd()));

      editor.getEditorState().read(() => {
        const verse = $runVerse();
        // Per-kind precision: only the damaged kind degrades. `\va` is untouched and still folded.
        expect(verse.getAltnumber()).toBe("2");
        expect(verse.getPubnumber()).toBeUndefined();
        const wrapper = verse.getNextSibling();
        if (!$isAttributeRunNode(wrapper)) throw new Error("\\va wrapper missing");
        expect(wrapper.getRunKind()).toBe("va");
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);

  it("settles a damaged char \\nd* closer", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs(() => {
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
      }, logger);
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const closer = requireDefined(
            $allGlyphs().find((glyph) => glyph.getMarkerSyntax() === "closing"),
            "\\nd closer missing",
          );
          $deleteClosingStar(closer);
        }),
      );
      await act(async () => editor.update(() => $lastVerse().selectEnd()));

      editor.getEditorState().read(() => {
        // The span re-closes implicitly (`closed="false"`, so no closing glyph is regenerated) and
        // the following content joins it — PT9's own degradation for an unterminated span.
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

  it("settles a damaged milestone \\* closer", async () => {
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs(() => {
        const milestone = $createMilestoneNode("qt-s", "qt.1");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            $createVerseNode("1", getVisibleOpenMarkerText("v", "1")),
            $createTextNode(" before "),
            milestone,
            $createTextNode(" after"),
            $createVerseNode("2", getVisibleOpenMarkerText("v", "2")),
            $createTextNode(" body"),
          ),
        );
        $appendMilestoneRun(milestone, `${NBSP}|sid="qt.1"`);
      }, logger);
      watch(editor);

      await act(async () =>
        editor.update(() => {
          const closer = requireDefined(
            $allGlyphs().find((glyph) => glyph.getMarkerSyntax() === "selfClosing"),
            "milestone closer missing",
          );
          $deleteClosingStar(closer);
        }),
      );

      // Graced while the caret holds the damaged glyph: the milestone and its run are still there.
      editor.getEditorState().read(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        expect(para.getChildren().some($isAttributeRunNode)).toBe(true);
      });

      await act(async () => editor.update(() => $lastVerse().selectEnd()));

      editor.getEditorState().read(() => {
        // An unterminated milestone run is one of the tokenizer's literal-degradation cases, so the
        // bytes stay literal text and the milestone is gone — the displayed bytes win, as ever.
        expect($getRoot().getTextContent()).toContain('\\qt-s |sid="qt.1"');
      });

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings()).toEqual([]);
    });
  }, 20000);
});

describe("the settle-cascade backstop bounds a rebuild that never reaches a fixed point", () => {
  it("gives up with a warning instead of spinning, and leaves the document pending", async () => {
    // The backstop must be provable independently of any one defect it catches, so this test
    // REINTRODUCES the oscillation deliberately: a transform that merges adjacent glyph-bearing
    // char spans, exactly what `CharNodePlugin` did before it learned to leave displayed bytes
    // alone. The merged span's bytes re-tokenize into two spans, which merge again, so no rebuild
    // ever equals the tree it came from and the fixed-point refusal cannot fire. Without the
    // backstop this hangs the main thread; with it, the cascade stops and says so.
    await withCommitBound(async ({ watch, commits, logger, warnings }) => {
      const { editor } = await testEnvironmentWithDisplaySyncs(
        () => $verseRunDocument("2"),
        logger,
      );
      watch(editor);

      const unregisterOscillator = editor.registerNodeTransform(CharNode, (node) => {
        if (!node.getChildren().some($isMarkerNode)) return;
        const next = node.getNextSibling();
        if (!$isCharNode(next) || next.getMarker() !== node.getMarker()) return;
        node.append(...next.getChildren());
        next.remove();
      });

      try {
        await act(async () =>
          editor.update(() => {
            const closer = requireDefined(
              $allGlyphs().find(
                (glyph) => glyph.getMarkerSyntax() === "closing" && glyph.getMarker() === "va",
              ),
              "\\va closer missing",
            );
            $deleteClosingStar(closer);
          }),
        );
        await act(async () => editor.update(() => $lastVerse().selectEnd()));
      } finally {
        unregisterOscillator();
      }

      expect(commits()).toBeLessThanOrEqual(COMMIT_BOUND);
      expect(warnings().join("\n")).toContain("settle cascade exceeded");
      // Failing safe means UNSETTLED, not frozen: the pending keys named in the warning are still
      // pending, and their literal bytes are what serializes.
      expect(warnings().join("\n")).toContain("pending");
    });
  }, 20000);
});
