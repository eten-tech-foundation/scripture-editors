/**
 * Corpus-style copy→paste round trip: for every fixture in the shared USJ round-trip corpus
 * (`../adaptors/corpus/corpus-data.ts`, the same fixtures `corpus-round-trip.test.ts` uses for the
 * plain load→save round trip), load it into a Standard-view editor, select the chapter's own
 * content, dispatch `COPY_COMMAND`, paste the resulting `text/plain` into a FRESH editor holding
 * the same book/chapter header, settle, export USJ, and expect it to deep-equal the source. This
 * is the clipboard-specific sibling of that load→save sweep — it exercises `$selectionToUsfmText`
 * (copy) and `$handlePasteForStandardView` + Tier 2's re-tokenizer (paste) together, over the same
 * corpus, instead of the adaptors alone.
 *
 * The book/chapter header itself is never part of the copied SELECTION (Standard view always
 * copies out of an already-open chapter, never the header) and paste normalization deliberately
 * strips any `\c`/`\id` a paste DOES carry (see `whitespaceDisplay.plugin.utils.ts`), so the
 * target editor is seeded with the SAME header up front and the paste only has to reproduce the
 * chapter's CONTENT — matching how a real user would select and copy inside an already-open
 * chapter.
 *
 * `"periph"` is the one corpus fixture skipped outright (not merely marked lossy): it is book-level
 * front matter with no chapter at all, so it does not fit "a single-chapter editor state" — there
 * is no chapter-content selection for it to exercise. Every other fixture is either swept clean or
 * recorded in `KNOWN_LOSSY` below with the exact byte-level divergence — none are silently dropped.
 * All 19 remaining fixtures run in well under a second; no sampling is needed.
 */
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { serializedState, viewOptions } from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { corpusFixtures } from "../adaptors/corpus/corpus-data";
import { act } from "@testing-library/react";
// Reaching inside only for tests (same pattern as markerEdit.test-helpers).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { MarkerObject, Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createPoint,
  $createRangeSelection,
  $getRoot,
  $isElementNode,
  $setSelection,
  COPY_COMMAND,
  PASTE_COMMAND,
  RootNode,
} from "lexical";
import { $isChapterNode, $isImmutableChapterNode } from "shared";

/** A `text/plain`-only copy stub — the same minimal jsdom-safe shape every sibling suite in this
 * directory defines locally (jsdom implements neither `ClipboardEvent` nor `DataTransfer`). */
function copyEvent(): { event: ClipboardEvent; getData: (type: string) => string } {
  const store = new Map<string, string>();
  const clipboardData = {
    getData: (type: string) => store.get(type) ?? "",
    setData: (type: string, data: string) => {
      store.set(type, data);
    },
  };
  return {
    event: { clipboardData, preventDefault: vi.fn() } as unknown as ClipboardEvent,
    getData: (type: string) => clipboardData.getData(type),
  };
}

/** A `text/plain`-only paste stub (`types`/`files` present — `@lexical/clipboard`'s default
 * text/plain handling reads them — matching `clipboardCopyFidelity.test.tsx`'s
 * `plainTextPasteEvent`). */
function plainTextPasteEvent(text: string): ClipboardEvent {
  const clipboardData = {
    types: ["text/plain"],
    files: [],
    getData: (type: string) => (type === "text/plain" ? text : ""),
  };
  return { clipboardData, preventDefault: () => undefined } as unknown as ClipboardEvent;
}

/** The index of the top-level child right after the document's (LAST) chapter node — every corpus
 * fixture but `"periph"` has exactly one, but a document could in principle carry more than one
 * top-level `\c` boundary marker, so this anchors on the last rather than the first. Throws for a
 * document with no chapter at all (`"periph"`, deliberately excluded from the sweep before this
 * ever runs). */
function $contentStartIndex(root: RootNode): number {
  const children = root.getChildren();
  let lastChapterIndex = -1;
  children.forEach((child, index) => {
    if ($isChapterNode(child) || $isImmutableChapterNode(child)) lastChapterIndex = index;
  });
  if (lastChapterIndex === -1) throw new Error("no chapter node found at the top level");
  return lastChapterIndex + 1;
}

/** Selects every top-level node from right after the chapter marker through the end of the
 * document — the chapter's own CONTENT, matching what Standard view actually copies out of an
 * open chapter (never the book/chapter header itself). Node-anchored (mirroring
 * `clipboardCopyFidelity.test.tsx`'s `$selectWholeNode`/multi-paragraph copy tests) rather than a
 * root child-index offset: an offset-based focus at `root.getChildrenSize()` resolves to a
 * boundary position that, on the PASTE side, silently failed to delete the target's own trailing
 * content when the selection was later replaced — doubling the last paragraph's text. Anchoring on
 * the actual last descendant node's own end avoids that. */
function $selectChapterContent(root: RootNode): void {
  const start = $contentStartIndex(root);
  const firstNode = root.getChildAtIndex(start);
  const lastChild = root.getLastChild();
  if (!firstNode || !lastChild) throw new Error("no chapter content to select");
  const lastDescendant = ($isElementNode(lastChild) && lastChild.getLastDescendant()) || lastChild;
  const selection = $createRangeSelection();
  selection.anchor = $createPoint(firstNode.getKey(), 0, "element");
  selection.focus = $createPoint(
    lastDescendant.getKey(),
    lastDescendant.getTextContentSize(),
    "text",
  );
  $setSelection(selection);
}

/** The fixture's book+chapter header, byte-identical, plus a single EMPTY `\p` paragraph as the
 * paste insertion host — the same "empty host + Tier 2's own-marker-wins dedup absorbs the whole
 * pasted fragment" shape `clipboardCopyFidelity.test.tsx`'s "copy → paste USJ round trip" test
 * uses, generalized to any book+chapter header so the target starts from the SAME chapter context
 * as the source without paste ever having to reconstruct `\c`/`\id` itself (it can't — paste
 * normalization strips them). */
function chapterHeaderSkeletonUsj(usj: Usj): Usj {
  const content = usj.content;
  let chapterIndex = -1;
  content.forEach((item, index) => {
    if (typeof item !== "string" && item.type === "chapter") chapterIndex = index;
  });
  if (chapterIndex === -1) throw new Error("fixture has no chapter to build a skeleton from");
  const emptyHost: MarkerObject = { type: "para", marker: "p", content: [] } as MarkerObject;
  return { ...usj, content: [...content.slice(0, chapterIndex + 1), emptyHost] };
}

/**
 * Corpus fixtures the copy→paste round trip cannot currently reproduce byte-for-byte. Kept IN the
 * sweep as `it.skip` (never silently omitted) so a future engine fix un-skips them instead of a
 * blind gap going unnoticed; each reason is the short form of the diff, with the full byte-level
 * mechanism recorded in this file's neighboring comments and in the semantics doc's accepted-
 * asymmetries list.
 *
 * - **"cross-reference ref target"** — USJ's `<ref>` cross-reference-target wrapper carries no
 *   USFM byte representation anywhere (`unknownUsfm.utils.ts`'s own doc comment: "USJ invented
 *   this container, USFM never carried it... only its child text renders"). Source content
 *   `["See ", {type:"ref", loc:"GEN 1:1", content:["Genesis 1:1"]}, " for details."]` copies as
 *   plain `"See Genesis 1:1 for details."` with no marker bytes anywhere marking the wrapper's
 *   extent, so paste re-tokenizes it as ordinary prose: content
 *   `["See Genesis 1:1 for details."]`, the `ref` wrapper gone. Inherent to the construct — a raw
 *   USFM export of this same fixture has the identical gap, independent of clipboard mechanics.
 *
 * - **"sidebar (esb)"** — a sidebar's open/close pair does not use the `\marker ... \marker*`
 *   convention every other span/note/milestone in this codebase re-tokenizes on paste; it is
 *   `\esb ... \esbe`. Copying
 *   `\esb \cat History\cat*\n\p Sidebar paragraph content.\esbe` and pasting it back produces an
 *   UNCLOSED sidebar (`closed:"false"`, no content), the inner paragraph hoisted OUT to become a
 *   top-level sibling, and a stray EMPTY paragraph with marker `"esbe"` — the paste-time
 *   tokenizer has no rule recognizing `\esbe` as `\esb`'s closer.
 *
 * - **"closed=false body char span (implicit close, no closer)"** — a `closed="false"` char span
 *   has, by definition, no closing marker byte anywhere in its own USFM. When such a span is not
 *   the last thing in its paragraph (`Tell the <char closed="false">Lord</char> plainly.`), the
 *   copied text (`\nd Lord plainly.`) carries no byte marking where the span's content ends and
 *   the trailing prose resumes, so paste has nothing to stop at "Lord" on — it swallows the rest
 *   of the paragraph into the span (`{marker:"nd", content:["Lord plainly."]}`, the top-level
 *   `" plainly."` string gone). Inherent to the encoding, not a paste-path regression — the
 *   sibling `"unclosed note (closed=false)"` fixture, whose unclosed span IS the last thing in its
 *   paragraph, has no such trailing content to lose and round-trips clean.
 *
 * - **"paragraph-leading space (display rule)"** — genuinely a paste-path bug, isolated with a
 *   minimal non-corpus repro: pasting the literal text `"\p  X"` (marker, its own required
 *   separator, and a SECOND, real content-leading space) into a fresh empty `"\p"` host produces
 *   `"\p X"` — one space, not two. The paste-time tokenizer consumes ALL whitespace immediately
 *   after a recognized marker literal as that marker's own separator, rather than exactly one
 *   character, discarding a genuine leading content space whenever a pasted paragraph literal is
 *   `"\marker"` + 2 OR MORE spaces. Corpus symptom: copying
 *   `<para style="p"> Leading space precedes this text.</para>` (source content
 *   `" Leading space precedes this text."`) round-trips through paste to
 *   `"Leading space precedes this text."` — the leading space is gone. Unlike the three fixtures
 *   above, the two-space byte sequence here is NOT ambiguous (there is no representational limit
 *   forcing this loss), so this one is a real fix candidate, out of scope for this test-only task.
 */
const KNOWN_LOSSY: { name: string; reason: string }[] = [
  {
    name: "cross-reference ref target",
    reason: "USJ <ref> wrapper carries no USFM bytes; content survives as prose",
  },
  {
    name: "sidebar (esb)",
    reason: "\\esb/\\esbe non-\\marker* closer pair not recognized by the paste tokenizer",
  },
  {
    name: "closed=false body char span (implicit close, no closer)",
    reason: "no closer byte to mark where an unclosed span's content ends before trailing prose",
  },
  {
    name: "paragraph-leading space (display rule)",
    reason:
      "paste tokenizer consumes ALL whitespace after a marker literal, not just its own separator",
  },
];

describe("corpus copy/paste round trip (Standard view)", () => {
  for (const fixture of corpusFixtures) {
    if (fixture.name === "periph") continue; // book-level front matter, no chapter — see file doc comment
    const lossy = KNOWN_LOSSY.find((entry) => entry.name === fixture.name);
    const run = lossy ? it.skip : it;
    run(`${fixture.name}${lossy ? ` (${lossy.reason})` : ""}`, async () => {
      initializeDeserialize(undefined);
      const usj = usxStringToUsj(fixture.usx);

      const { editor: sourceEditor } = await baseTestEnvironment(
        serializedState(usj),
        <MarkerEditPlugin viewOptions={viewOptions} />,
      );
      await act(async () => sourceEditor.update(() => $selectChapterContent($getRoot())));
      const { event, getData } = copyEvent();
      await act(async () => sourceEditor.dispatchCommand(COPY_COMMAND, event));
      const copiedText = getData("text/plain");

      const { editor: targetEditor } = await baseTestEnvironment(
        serializedState(chapterHeaderSkeletonUsj(usj)),
        <MarkerEditPlugin viewOptions={viewOptions} />,
      );
      await act(async () =>
        targetEditor.update(() => {
          $getRoot().getLastChild()?.selectEnd();
          targetEditor.dispatchCommand(PASTE_COMMAND, plainTextPasteEvent(copiedText));
        }),
      );
      // Settle: flush any reconciliation the paste-triggered Tier 2 re-tokenization schedules
      // beyond the synchronous update above (the same double-microtask flush every paste-adjacent
      // suite in this directory uses).
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const pastedUsj = deserializeSerializedEditorState(
        targetEditor.getEditorState().toJSON(),
        viewOptions,
      );
      expect(pastedUsj).toEqual(usj);
    });
  }
});
