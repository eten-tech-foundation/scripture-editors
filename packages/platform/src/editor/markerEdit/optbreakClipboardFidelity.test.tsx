/**
 * Optbreak (`//`) copy/paste coverage (filed 2026-08-13). Live symptom (TJ, most likely a
 * pre-branch or parent-branch build): copying a selection containing an optbreak put `//` on the
 * clipboard correctly, but pasting that same clipboard back did NOT insert the optbreak, while
 * pasting external plaintext `//` DID.
 *
 * Three hypotheses, verified below rather than assumed:
 *
 * - **H1** (the live symptom, on an OLD build): with the lexical flavor stripped by the async
 *   Ctrl+V clipboard read, Lexical's default paste prefers `text/html`; `//` renders in `text/html`
 *   as nothing at all (see "copy characterization" below — `UnknownNode.exportDOM` returns
 *   `{element: null}` unconditionally, so `@lexical/html`'s `$appendNodesToHTML` returns `false`
 *   before ever visiting the optbreak's display child, dropping it silently). This branch's
 *   `$handlePasteForStandardView` (`whitespaceDisplay.plugin.utils.ts`) prefers `text/plain`
 *   whenever present, and this branch's own copy always populates `text/plain` — H1 predicts the
 *   symptom is already fixed here for the plain path. Pinned, not assumed, in "paste round trip"
 *   below.
 * - **H2**: `$normalizePastedNbsp`'s marker-token regexes (`whitespaceDisplay.plugin.utils.ts`)
 *   only match `\`-shaped tokens — an NBSP adjacent to `//` would not be recognized as display
 *   whitespace and would fall to the blanket data-`~` rule instead. Characterized below: this
 *   branch's own copy walker (`$selectionToUsfmText`) inverts every TextNode's NBSP to a plain
 *   space unconditionally (the note-internal-separator special case aside), so `text/plain` never
 *   carries an NBSP next to `//` to begin with — H2 does not bite the round trip this task is
 *   scoped to, and doubly so: this branch's own `text/html` never carries `//` at all for an
 *   optbreak either (see the `text/html` pin below), so there is no `//` in P10's OWN html for a
 *   foreign NBSP to even land beside. A synthetic html-only foreign payload that DOES carry such
 *   an NBSP is characterized (not "fixed" — unreachable via this branch's own copy, reachable only
 *   via a genuinely foreign clipboard source) for completeness: the NBSP is genuine data from that
 *   foreign source, and settles to the correct display form for real data-NBSP (`~`), just one
 *   position off from where a marker-adjacent rule would have recognized it as a separator.
 * - **H3** (confirmed root cause, TWO independent gaps): the same-namespace
 *   `application/x-lexical-editor` fast path (S2 in the clipboard semantics doc) reconstructs
 *   nodes via `@lexical/clipboard`'s JSON generator/parser, not DOM `importDOM`. That generator
 *   (`$appendNodesToJSON`, inside `@lexical/clipboard`'s `LexicalClipboard.dev.js`) computes
 *   `shouldExclude` from `currentNode.excludeFromCopy('html')` — the literal string `'html'`,
 *   hardcoded, for EVERY copy-out destination `$appendNodesToJSON` handles (`'clone'` is never
 *   passed by any Lexical-shipped code path in the installed version). `UnknownNode.excludeFromCopy`
 *   (`UnknownNode.ts`) returned `destination !== "clone"` — excluding itself unconditionally. When
 *   a node is excluded, `$appendNodesToJSON` does not drop it silently — it HOISTS the excluded
 *   node's own children into the parent's list in its place. For an optbreak, that stranded the
 *   `//` `ImmutableTypedTextNode` (a DecoratorNode) as a bare sibling with no owning `UnknownNode`
 *   wrapper: `$parseSerializedNode` on paste reconstructed a loose decorator, not a recognized
 *   optbreak — `$isUnknownNode` is false for it, and nothing re-tokenizes a decorator's text.
 *   `text/html` is UNAFFECTED by this whole mechanism: `$appendNodesToHTML` (`@lexical/html`)
 *   computes the same `excludeFromCopy('html')` value but returns early on `UnknownNode`'s
 *   unconditional `{element: null}` export BEFORE ever consulting it — so the fix below changes
 *   ONLY the lexical-JSON flavor. Fixed by narrowing `UnknownNode.excludeFromCopy` to leave a
 *   CHILD-BEARING "optbreak" out of the exclusion. A SECOND, independent gap surfaced while
 *   verifying that fix: a selection whose ending boundary resolves to an ELEMENT-type point ON the
 *   optbreak at offset 0 (touching the wrapper without covering its own `//` child) still marked
 *   the wrapper "selected" under Lexical's default `isSelected` (key-membership in
 *   `selection.getNodes()`, blind to the node's own child count), producing a CHILDLESS
 *   `{type:"optbreak"}` placeholder in the lexical-JSON copy even though the live node has a
 *   child — disagreeing with `text/plain`, which correctly emits nothing for that same boundary.
 *   `excludeFromCopy` cannot see this (it has no visibility into which children a given selection
 *   will include), so a scoped `isSelected` override closes it directly, mirroring
 *   `$selectionToUsfmText`'s own `getNodes()`-based walk. Every OTHER `UnknownNode` kind (figure,
 *   table, sidebar, periph, ref) keeps the OLD, still-excluding behavior — not because their
 *   content differs meaningfully (it doesn't: every kind's marker/attribute bytes are the same
 *   content-free `ImmutableTypedTextNode` display decorators optbreak's `//` is), but pending
 *   per-kind paste verification this task did not do; the measured, more severe residual for those
 *   kinds (a lexical-flavor figure paste renders its full literal USFM bytes on screen while the
 *   USJ silently drops the figure node and its attributes) is recorded in the clipboard semantics
 *   doc's "Deferred / Out of Scope" list rather than fixed here.
 */

import { MarkerEditPlugin } from "./MarkerEditPlugin";
import {
  copyEvent,
  pasteEvent,
  serializedState,
  testEnvironment,
  viewOptions,
} from "./markerEdit.test-helpers";
import { $handlePasteForStandardView } from "./whitespaceDisplay.plugin.utils";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
// Reaching inside only for tests (same pattern as markerEdit.test-helpers).
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  $createPoint,
  $createRangeSelection,
  $createTextNode,
  $getRoot,
  $isTextNode,
  $setSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  LexicalEditor,
  PASTE_COMMAND,
  TextNode,
  UNDO_COMMAND,
} from "lexical";
import {
  $createMarkerNode,
  $createParaNode,
  $isParaNode,
  $isUnknownNode,
  NBSP,
  ParaNode,
} from "shared";

// jsdom implements neither `ClipboardEvent` nor `DragEvent`; the fallback path the "H3" round-trip
// pin exercises on purpose (Lexical's own default rich-paste handling, reached whenever
// `$handlePasteForStandardView` declines) checks `instanceof`/class-name against both under the
// hood (`objectKlassEquals`). Same stub as `clipboardCopyFidelity.test.tsx` /
// `attributeContextPasteFidelity.test.tsx`; only defined if not already present.
const globalStubs: { DragEvent?: unknown; ClipboardEvent?: unknown } = globalThis;
if (typeof globalStubs.DragEvent === "undefined")
  globalStubs.DragEvent = class DragEvent extends Event {};
if (typeof globalStubs.ClipboardEvent === "undefined")
  globalStubs.ClipboardEvent = class ClipboardEvent extends Event {};

/** A minimal book+chapter+two-paragraph USJ document — the first paragraph carries `content`, the
 * second is a fixed "depart here" paragraph (the shape `settledGetUsj.test.tsx`'s `twoParaUsj`
 * helper builds). A typed or pasted literal `//` PENDS rather than settling immediately, no matter
 * where the caret lands after insertion (`$textNodeTier2Transform`, `markerEditTier2Trigger.utils
 * .ts`: "without pending here a typed `//` would delete its key and stay literal text forever") —
 * it re-tokenizes into an optbreak only once the caret actually DEPARTS to a different node, via
 * `$resolvePendingMarkers`. The second paragraph is the departure target every paste round-trip
 * pin below moves the caret into after pasting. Spaces flank the optbreak on both sides by default
 * (PT9 preserves optbreak whitespace byte-for-byte — pinned in `editor-usj-adaptor.test.tsx`'s
 * "round-trips optbreak spacing variant" cases). */
function optbreakUsj(
  content: MarkerObject["content"] = ["before ", { type: "optbreak" }, " after"],
): Usj {
  return {
    type: "USJ",
    version: "3.1",
    content: [
      { type: "book", marker: "id", code: "RUT", content: ["RUT"] },
      { type: "chapter", marker: "c", number: "1" },
      { type: "para", marker: "p", content },
      { type: "para", marker: "p", content: ["depart here"] },
    ],
  } as unknown as Usj;
}

/** Mounts a headless Standard-view editor (`MarkerEditPlugin`, optionally `HistoryPlugin`) with
 * `usj` loaded. */
async function renderUsjEditor(usj: Usj, withHistory = false): Promise<{ editor: LexicalEditor }> {
  return baseTestEnvironment(
    serializedState(usj),
    withHistory ? (
      <>
        <MarkerEditPlugin viewOptions={viewOptions} />
        <HistoryPlugin />
      </>
    ) : (
      <MarkerEditPlugin viewOptions={viewOptions} />
    ),
  );
}

/** Selects the document's one paragraph in full (element offsets, start to end) — includes the
 * paragraph's own `\p` marker and trailing separator in the walk, matching how
 * `clipboardCopyFidelity.test.tsx`'s "joins a full multi-paragraph selection" test selects a whole
 * block. Skips the book/chapter header, matching how a user actually selects inside an open
 * chapter. Used only for the copy-characterization pins below, where the realistic "\p " prefix is
 * part of what is being pinned. */
function $selectWholePara(): ParaNode {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("expected a ParaNode");
  const selection = $createRangeSelection();
  selection.anchor = $createPoint(para.getKey(), 0, "element");
  selection.focus = $createPoint(para.getKey(), para.getChildrenSize(), "element");
  $setSelection(selection);
  return para;
}

/** Selects the paragraph's CONTENT only — its own `\p` marker and trailing-separator token (the
 * first two children `usj-editor.adaptor.ts`'s `createPara` always prepends in editable Standard
 * view) are excluded. Used for the round-trip/cut pins below: a real Ctrl+C selecting the words
 * around an optbreak never captures the host paragraph's own marker glyph, and excluding it here
 * keeps each pin's target-side paste an inline-content insertion rather than a block-level one —
 * the block-splitting behavior a whole-paragraph node paste triggers is Lexical's own generic
 * rich-paste mechanic, orthogonal to what this file is pinning. */
function $selectParaContent(): ParaNode {
  const para = $getRoot().getChildren().find($isParaNode);
  if (!para) throw new Error("expected a ParaNode");
  const selection = $createRangeSelection();
  selection.anchor = $createPoint(para.getKey(), 2, "element");
  selection.focus = $createPoint(para.getKey(), para.getChildrenSize(), "element");
  $setSelection(selection);
  return para;
}

/** The document's own USJ, via the same `toJSON` -> deserialize path every sibling clipboard suite
 * reads settled state through. */
function usjOf(editor: LexicalEditor): Usj {
  initializeDeserialize(undefined);
  const usj = editor
    .getEditorState()
    .read(() => deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions));
  if (!usj) throw new Error("editor state did not serialize to USJ");
  return usj;
}

/** Flushes the double-microtask paste/settle window every paste-adjacent suite in this directory
 * uses, after the `act` block containing the triggering update. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("copy characterization: what the walker actually emits around an optbreak", () => {
  it("text/plain carries the exact `//` token with its significant flanking spaces — no NBSP anywhere near it", async () => {
    const { editor } = await renderUsjEditor(optbreakUsj());
    await act(async () => editor.update($selectWholePara));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    // "\p" (marker glyph) + " " (the paragraph's own trailing-NBSP separator, inverted to a plain
    // space) + "before " + "//" (the optbreak's decorator child, contributed byte-for-byte) +
    // " after". No NBSP (U+00A0) anywhere in the payload — `$selectionToUsfmText` inverts every
    // TextNode's NBSP to a plain space unconditionally, so the flanking spaces next to `//` are
    // ordinary ASCII spaces, not display artifacts requiring positional normalization on paste.
    const plain = getData("text/plain");
    expect(plain).toBe("\\p before // after");
    expect(plain).not.toContain(NBSP);
  });

  it("text/html drops the optbreak's `//` bytes entirely — UnknownNode.exportDOM() always returns a null element, so @lexical/html's node walk short-circuits before ever visiting the display child (a documented gap, harmless here because text/plain always wins when present)", async () => {
    const { editor } = await renderUsjEditor(optbreakUsj());
    await act(async () => editor.update($selectWholePara));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    const html = getData("text/html");
    expect(html).not.toContain("//");
    expect(html).toContain("before");
    expect(html).toContain("after");
  });

  it("carrier agreement at a childless boundary: a selection ending exactly at the optbreak's own start (touching the wrapper, not its `//` child) excludes it from BOTH carriers, not just text/plain", async () => {
    // Before the `isSelected` override (`UnknownNode.ts`), this selection shape — a focus point
    // resolving as an ELEMENT-type point ON the optbreak at offset 0 — still marked the WRAPPER
    // "selected" under Lexical's default `isSelected` (key-membership in `selection.getNodes()`,
    // blind to whether any of the wrapper's own children are actually covered), even though the
    // `//` child itself was not selected. `$appendNodesToJSON` then serialized a CHILDLESS
    // `{type:"unknown", tag:"optbreak", children:[]}` placeholder into the lexical-JSON payload —
    // a carrier disagreement (`text/plain`, walking the same `getNodes()` list via
    // `$selectionToUsfmText`, correctly emitted nothing for this boundary). Measured directly
    // against this exact selection shape before writing the fix.
    const { editor } = await renderUsjEditor(optbreakUsj());
    let optbreakKey = "";
    editor.getEditorState().read(() => {
      const optbreak = $getRoot()
        .getChildren()
        .filter($isParaNode)[0]
        .getChildren()
        .find($isUnknownNode);
      if (!optbreak) throw new Error("expected an optbreak UnknownNode");
      optbreakKey = optbreak.getKey();
    });
    await act(async () =>
      editor.update(() => {
        const para = $getRoot().getChildren().filter($isParaNode)[0];
        const selection = $createRangeSelection();
        selection.anchor = $createPoint(para.getKey(), 2, "element"); // right before "before "
        selection.focus = $createPoint(optbreakKey, 0, "element"); // touches the wrapper, covers none of its content
        $setSelection(selection);
      }),
    );
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    expect(getData("text/plain")).not.toContain("//");
    expect(getData("application/x-lexical-editor")).not.toContain("optbreak");
  });

  it("characterization only (not fixed — unreachable via this branch's own copy): a synthetic html-only foreign payload with an NBSP directly before `//` still settles to a real optbreak node, with the foreign source's own NBSP kept as data `~` rather than folded into a display space", async () => {
    // $normalizePastedNbsp's marker-token regexes only match `\`-shaped tokens (AFTER_MARKER_NBSP /
    // BEFORE_MARKER_NBSP, whitespaceDisplay.plugin.utils.ts) — `//` has no backslash, so neither
    // pass recognizes an NBSP next to it, and the final blanket `.replaceAll(NBSP, "~")` converts
    // it to a literal data tilde — the correct display form for genuine data-NBSP, just one
    // position off from where a marker-adjacent rule would have folded it to a space instead. The
    // optbreak TOKEN itself still tokenizes correctly on caret departure (the tokenizer's `//`
    // split, usfmFragmentToUsj.ts, is a plain string `.split("//")`, unaffected by an adjacent
    // `~`) — asserted below by settling and checking the resulting USJ, not just the pre-settle
    // display text. This shape is reachable only via a foreign clipboard source supplying
    // `text/html` with no `text/plain` at all — this branch's own copy never produces it (the two
    // pins above).
    let text: TextNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      text = $createTextNode("body");
      const departurePara = $createParaNode("p");
      const departureText = $createTextNode("depart here");
      $getRoot().append(
        para.append($createMarkerNode("p"), text),
        departurePara.append($createMarkerNode("p"), departureText),
      );
    });
    await act(async () => editor.update(() => text.select(0, 0)));
    const { event } = pasteEvent({ "text/html": `<p>before${NBSP}// after</p>` });
    let handled = false;
    await act(async () =>
      editor.update(() => {
        handled = $handlePasteForStandardView(event);
      }),
    );
    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      // Pre-settle display text: the literal, un-tokenized bytes the paste inserted.
      expect($getRoot().getTextContent()).toContain("before~// after");
    });
    // Depart to the second paragraph and settle — the same caret-departure requirement
    // `optbreakUsj`'s doc comment (above) explains for every other pasted-literal-`//` pin here.
    await act(async () =>
      editor.update(() => {
        const secondPara = $getRoot().getChildren().filter($isParaNode)[1];
        const departureText = secondPara?.getLastChild();
        if (!departureText || !$isTextNode(departureText))
          throw new Error("expected the 'depart here' paragraph's text node");
        departureText.select(0, 0);
      }),
    );
    await settle();
    editor.getEditorState().read(() => {
      const firstPara = $getRoot().getChildren().filter($isParaNode)[0];
      expect(firstPara.getChildren().some($isUnknownNode)).toBe(true);
      expect(firstPara.getTextContent().replaceAll(NBSP, " ")).toBe("\\p before~// afterbody");
    });
  });
});

describe("paste round trip: all three payload shapes carry a copied optbreak back", () => {
  /** Harvests the genuine text/plain, text/html, and application/x-lexical-editor bytes this
   * branch's own copy produces for `optbreakUsj()`'s paragraph CONTENT (marker excluded, see
   * `$selectParaContent`'s doc comment) — the same `COPY_COMMAND` path `$handleCopyForStandardView`
   * (`whitespaceDisplay.plugin.utils.ts`) runs for a real Ctrl+C. */
  async function copyOptbreakContentPayload(): Promise<{ [key: string]: string }> {
    const { editor } = await renderUsjEditor(optbreakUsj());
    await act(async () => editor.update($selectParaContent));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(COPY_COMMAND, event));
    return {
      "text/plain": getData("text/plain"),
      "text/html": getData("text/html"),
      "application/x-lexical-editor": getData("application/x-lexical-editor"),
    };
  }

  /** A fresh target editor with the SAME book+chapter header and one EMPTY `\p` host paragraph —
   * the paste insertion point, matching `clipboardCorpusRoundTrip.test.tsx`'s
   * `chapterHeaderSkeletonUsj` pattern (own header, empty `\p` host). */
  async function freshEmptyHost(withHistory = false): Promise<{ editor: LexicalEditor }> {
    return renderUsjEditor(optbreakUsj([]), withHistory);
  }

  /** Places the caret at the empty host paragraph's own content start (right after its `\p` marker
   * and trailing separator — the paragraph has nothing else) and dispatches `PASTE_COMMAND` with
   * `payload` as the clipboard's full MIME map, settles, then DEPARTS the caret to the fixture's
   * second paragraph and settles again. Dispatching the COMMAND (not calling
   * `$handlePasteForStandardView` directly) is required for the lexical-flavor shape: only a real
   * command dispatch reaches Lexical's own fallback `PASTE_COMMAND` handler
   * (`@lexical/react/LexicalRichTextPlugin`, `COMMAND_PRIORITY_EDITOR`) once
   * `$handlePasteForStandardView` declines. The departure step is required for the plain-text
   * shapes (a pasted literal `//` pends until caret departure — see `optbreakUsj`'s doc comment);
   * harmless for the lexical-flavor shape, which inserts an already-structural node tree with
   * nothing left pending. */
  async function pasteAndSettle(
    editor: LexicalEditor,
    payload: { [key: string]: string },
  ): Promise<void> {
    await act(async () =>
      editor.update(() => {
        $getRoot().getChildren().filter($isParaNode)[0]?.selectEnd();
        editor.dispatchCommand(PASTE_COMMAND, pasteEvent(payload).event);
      }),
    );
    await settle();
    await act(async () =>
      editor.update(() => {
        const secondPara = $getRoot().getChildren().filter($isParaNode)[1];
        const departureText = secondPara?.getLastChild(); // the "depart here" content TextNode
        if (!departureText || !$isTextNode(departureText))
          throw new Error("expected the 'depart here' paragraph's text node");
        departureText.select(0, 0);
      }),
    );
    await settle();
  }

  it("plain-only payload — TJ's already-working external-plaintext case; pinned so it stays working", async () => {
    const payload = await copyOptbreakContentPayload();
    const { editor } = await freshEmptyHost();
    await pasteAndSettle(editor, { "text/plain": payload["text/plain"] });
    expect(usjOf(editor)).toEqual(optbreakUsj());
  });

  it("plain+html payload, no lexical flavor (the real async Ctrl+V shape) — text/plain wins over the optbreak-dropping html (H1: already fixed on this branch)", async () => {
    const payload = await copyOptbreakContentPayload();
    const { editor } = await freshEmptyHost();
    await pasteAndSettle(editor, {
      "text/plain": payload["text/plain"],
      "text/html": payload["text/html"],
    });
    expect(usjOf(editor)).toEqual(optbreakUsj());
  });

  it("plain+html+lexical payload (sync/native shape carrying the same-namespace flavor) — the lexical fast path reconstructs the optbreak node tree instead of stranding a loose decorator (H3 fix)", async () => {
    const payload = await copyOptbreakContentPayload();
    expect(payload["application/x-lexical-editor"]).not.toBe("");
    const { editor } = await freshEmptyHost();
    await pasteAndSettle(editor, payload);
    expect(usjOf(editor)).toEqual(optbreakUsj());
  });

  it("undo after the lexical-flavor paste restores the pre-paste (empty host) USJ in one step", async () => {
    const payload = await copyOptbreakContentPayload();
    const { editor } = await freshEmptyHost(true); // withHistory
    // Captured live rather than reconstructed via `optbreakUsj([])`: an empty `content: []` array
    // and an omitted `content` key both mean "no content" to the adaptor, but `toEqual` treats
    // them as different objects — comparing against the editor's OWN pre-paste serialization
    // sidesteps that immaterial shape difference entirely.
    const beforePaste = usjOf(editor);
    await pasteAndSettle(editor, payload);
    expect(usjOf(editor)).toEqual(optbreakUsj());
    await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
    await settle();
    expect(usjOf(editor)).toEqual(beforePaste);
  });

  it("undo after a PLAIN-payload paste is ONE step: the departure settle rides along with the paste it completes", async () => {
    // A plain payload takes the longer route to the same node tree: the literal `//` inserts via
    // `selection.insertText` in the paste's own update, and only re-tokenizes into an optbreak
    // node in the SEPARATE update the caret-departure step triggers (see `optbreakUsj`'s doc
    // comment — a pasted `//` pends until departure, identically to a TYPED `//`). Two commits,
    // but ONE undo: a settle is never its own history entry, so the entry it merges into is the
    // paste's, and a single press lands on the true pre-paste state rather than stranding the
    // user on a half-settled literal they never typed. Measured, not assumed — and it matches the
    // lexical-flavor path above, so which carrier the clipboard happened to provide is invisible
    // to undo.
    const payload = await copyOptbreakContentPayload();
    const { editor } = await freshEmptyHost(true); // withHistory
    const beforePaste = usjOf(editor);
    await pasteAndSettle(editor, { "text/plain": payload["text/plain"] });
    expect(usjOf(editor)).toEqual(optbreakUsj());
    await act(async () => editor.dispatchCommand(UNDO_COMMAND, undefined));
    await settle();
    expect(usjOf(editor)).toEqual(beforePaste);
  });
});

describe("cut across an optbreak", () => {
  it("cuts the optbreak (and its flanking text) out: the clipboard holds the same bytes a copy of the identical selection would, and no optbreak node remains", async () => {
    // Two independent editors (rather than one editor dispatching COPY then CUT in sequence) —
    // the same pattern `clipboardCopyFidelity.test.tsx`'s "cut = copy + removeText" describe uses,
    // for the same reason: a second command dispatch on the SAME editor lets Lexical's own DOM-
    // selection reconciliation collapse the just-set programmatic selection under jsdom before the
    // handler runs, which would make this a test of that reconciliation quirk instead of cut/copy
    // byte parity.
    const { editor: copyEditor } = await renderUsjEditor(optbreakUsj());
    await act(async () => copyEditor.update($selectParaContent));
    const copyStub = copyEvent();
    await act(async () => copyEditor.dispatchCommand(COPY_COMMAND, copyStub.event));
    const copiedPlainText = copyStub.getData("text/plain");
    expect(copiedPlainText).toBe("before // after"); // sanity: the byte-equality check below is
    // only meaningful if this is actually the optbreak's own bytes, not an accidental empty match

    const { editor } = await renderUsjEditor(optbreakUsj());
    await act(async () => editor.update($selectParaContent));
    const { event, getData } = copyEvent();
    await act(async () => editor.dispatchCommand(CUT_COMMAND, event));
    expect(getData("text/plain")).toBe(copiedPlainText);
    const usj = usjOf(editor);
    const para = usj.content[2];
    if (typeof para === "string") throw new Error("paragraph corrupted into a bare string");
    expect(para.content ?? []).toEqual([]);
    editor.getEditorState().read(() => {
      const paraNode = $getRoot().getChildren().find($isParaNode);
      if (!paraNode) throw new Error("expected a ParaNode");
      expect(paraNode.getChildren().some($isUnknownNode)).toBe(false);
    });
  });
});
