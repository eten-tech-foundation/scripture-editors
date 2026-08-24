import {
  $resolvePendingMarkers,
  $settlePendedDisplayOwner,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import {
  $appendCharPara,
  $appendVersePara,
  $pendGlyphEdit,
  $retypeGlyph,
  testEnvironment,
  testEnvironmentExpanded,
  testEnvironmentWithSheet,
  viewOptions,
} from "./markerEdit.test-helpers";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  $setState,
  BLUR_COMMAND,
  CLICK_COMMAND,
  KEY_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  NodeKey,
  TextNode,
} from "lexical";
import {
  $createAttributeRunNode,
  $createChapterNode,
  $createCharNode,
  $createMarkerNode,
  $createMilestoneNode,
  $createNoteNode,
  $createParaNode,
  $createVerseNode,
  $isCharNode,
  $isParaNode,
  $verseAttributeRunPieces,
  AttributeRunNode,
  ChapterNode,
  CharNode,
  CURSOR_CHANGE_TAG,
  getEditableCallerText,
  getMarker as bundledGetMarker,
  getVisibleOpenMarkerText,
  MarkerNode,
  MilestoneNode,
  NBSP,
  NoteNode as NoteNodeClass,
  ParaNode,
  StyleInfo,
  textTypeState,
  VerseNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { createBasicTestEnvironment } from "../../../../../libs/shared/src/nodes/usj/test.utils";

function $appendHeadingPara(): { para: ParaNode; marker: MarkerNode } {
  const para = $createParaNode("s1");
  const marker = $createMarkerNode("s1");
  $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("Heading")));
  return { para, marker };
}

const customSheet: StyleInfo = {
  markers: {
    p: { marker: "p", styleType: "paragraph" },
    s1: { marker: "s1", styleType: "paragraph" },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*" },
    zln: { marker: "zln", styleType: "character", endMarker: "zln*" },
    zpb: { marker: "zpb", styleType: "paragraph" },
  },
};

describe("stylesheet-first kind guards", () => {
  it("renames a char span to a project-known custom char marker in Tier 1", async () => {
    let char: CharNode, marker: MarkerNode, closer: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ char, marker, closer } = $appendCharPara()),
      customSheet,
    );
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\zln ")));
    editor.getEditorState().read(() => {
      expect(char.getMarker()).toBe("zln");
      expect(closer.getTextContent()).toBe("\\zln*");
    });
  });

  it("routes a para rename to a project-known char marker to Tier 2 (not renamed in place)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ para, marker } = $appendHeadingPara()),
      customSheet,
    );
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\zln ")));
    editor.getEditorState().read(() => {
      // zln is CHARACTER kind in the sheet: the para must NOT become a "zln" para...
      expect(para.isAttached() ? para.getMarker() : "detached").not.toBe("zln");
      // ...and the Tier 2 rebuild actually happened (not a silently ignored rename): the
      // sheet-aware tokenizer resolved `\zln` as a char run, so the heading text now lives
      // in a CharNode span with marker "zln" inside the rebuilt (default \p) paragraph.
      const chars = $getRoot()
        .getChildren()
        .filter($isParaNode)
        .flatMap((p) => p.getChildren())
        .filter($isCharNode);
      expect(chars.some((c) => c.getMarker() === "zln")).toBe(true);
    });
  });

  it("keeps an unknown rename in place with the project sheet active (deviation #4)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironmentWithSheet(
      () => ({ para, marker } = $appendHeadingPara()),
      customSheet,
    );
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\zzz ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zzz"));
  });
});

describe("Tier 1 paragraph-marker rename", () => {
  it("renames the paragraph when marker text is retyped and space-terminated", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\s2 ")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s2");
      expect(marker.getMarker()).toBe("s2");
      expect(marker.getTextContent()).toBe("\\s2"); // terminator absorbed
    });
  });

  it("accepts a syntactically complete unknown marker as typed (PT9 behavior)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\zed ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zed"));
  });

  it("leaves unterminated mid-edit text alone", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\s2")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s1"); // untouched mid-edit
      expect(marker.getTextContent()).toBe("\\s2");
    });
  });

  it("completes a pending marker on Enter", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\s2")));
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("completes a pending marker on blur", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    // The abandoned shape: the pend survives with no caret anywhere (an undo restore, a
    // cross-frame blur that nulled the selection), so the blur sweep has no caret node to except
    // and settles it fully.
    await act(async () => editor.update(() => $pendGlyphEdit(marker, "\\s2")));
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("keeps the caret's OWN pending marker literal on blur (marker-menu focus loss)", async () => {
    // Clicking a marker-menu item (or a P10 host overlay) blurs the editor while the caret
    // still sits in the menu's literal `\...` trigger text; blur must not Tier-2-commit that
    // node out from under the menu's apply. Enter/caret-departure remain
    // the completion triggers for the node being edited.
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3); // caret parked inside the mid-edit marker
      }),
    );
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s1"); // NOT committed by the blur
      expect(marker.getTextContent()).toBe("\\s2"); // literal preserved for the menu's apply
    });
  });

  it("completes a pending marker when the caret leaves it (PT9 debounce equivalent)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3); // still editing: stays pending
      }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1"));
    await act(async () =>
      editor.update(() => {
        // caret moves into the heading text -> the pending marker completes
        para.getLastChild()?.selectStart();
      }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("re-tokenizes when a char-kind marker is typed in para position", async () => {
    let marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => $retypeGlyph(marker, "\\add ")));
    editor.getEditorState().read(() => {
      // Tier 2 re-tokenized `\add` into a real CHAR SPAN that now owns the heading text...
      const paras = $getRoot().getChildren().filter($isParaNode);
      const chars = paras.flatMap((p) => p.getChildren()).filter($isCharNode);
      const addChar = chars.find((c) => c.getMarker() === "add");
      expect(addChar).toBeDefined();
      expect(addChar?.getTextContent()).toContain("Heading");
      // ...and NO paragraph carries "add" — a broken char-kind guard would instead have
      // renamed the s1 para to "add" in place and left the text as bare paragraph content.
      expect(paras.some((p) => p.getMarker() === "add")).toBe(false);
    });
  });

  it("blocks Enter while the caret is inside marker text and completes instead", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3);
      }),
    );
    let handled = false;
    await act(async () => {
      handled = editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    expect(handled).toBe(true);
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s2");
      expect(
        $getRoot()
          .getChildren()
          .filter((n) => n.getType() === "para"),
      ).toHaveLength(1);
    });
  });
});

describe("Tier 1 char/note opener rename", () => {
  it("renames the span and mirrors the closer", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => $retypeGlyph(parts.marker, "\\wj ")));
    editor.getEditorState().read(() => {
      expect(parts.char.getMarker()).toBe("wj");
      expect(parts.marker.getTextContent()).toBe("\\wj");
      expect(parts.closer.getTextContent()).toBe("\\wj*");
    });
  });

  it("clamps the selection when the closer shrinks under the caret", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () =>
      editor.update(() => {
        parts.closer.select(4, 4); // caret at end of `\nd*`
        parts.marker.setTextContent("\\w "); // shorter marker
      }),
    );
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      expect($isRangeSelection(selection)).toBe(true);
      if (!$isRangeSelection(selection)) throw new Error("expected a range selection");
      expect(selection.anchor.key).toBe(parts.closer.getKey());
      expect(selection.anchor.offset).toBeLessThanOrEqual(parts.closer.getTextContentSize());
    });
  });

  it("routes a closer mismatch edit to Tier 2 on caret departure (span rebuilt by the tokenizer)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => $retypeGlyph(parts.closer, "\\wj*")));
    // Closer edits pend (mid-edit grace); the caret moving elsewhere settles the glyph.
    await act(async () => editor.update(() => parts.marker.select(0, 0)));
    // Tokenizer sees `\nd ␣Lord\wj*`: the span auto-closes, and the unmatched `\wj*`
    // closer resolves to an ImmutableUnmatchedNode (PT9 sink.Unmatched), not literal text.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).toContain('"type":"unmatched"');
    expect(json).toContain('"marker":"wj*"');
  });

  it("renames a note opener and mirrors its closer", async () => {
    let note: NoteNodeClass, opener: MarkerNode, closer: MarkerNode;
    const { editor } = await testEnvironment(() => {
      const para = $createParaNode("p");
      note = $createNoteNode("f", "+");
      opener = $createMarkerNode("f");
      closer = $createMarkerNode("f", "closing");
      $getRoot().append(
        para.append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          note.append(opener, $createTextNode(`${NBSP}content`), closer),
        ),
      );
    });
    await act(async () => editor.update(() => $retypeGlyph(opener, "\\x ")));
    editor.getEditorState().read(() => {
      expect(note.getMarker()).toBe("x");
      expect(closer.getTextContent()).toBe("\\x*");
    });
  });

  it("routes a typed + opener to Tier 2 instead of stripping the + (nest instruction)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    // Typing `\+w ` is a NEST instruction, not a rename. Tier 1 must not strip the `+` and rename
    // the span in place to "w"; it routes to Tier 2, which re-tokenizes the visible glyph text
    // (now carrying the `+`). This span sits at paragraph level with nothing to nest into, so the
    // tokenizer opens "w" and the stranded `\nd*` becomes an unmatched element — proof the `+`
    // reached the tokenizer instead of being silently discarded by an in-place rename (which would
    // have produced a clean `\w Lord\w*` with no unmatched node).
    await act(async () => editor.update(() => $retypeGlyph(parts.marker, "\\+w ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"type":"unmatched"');
    expect(json).toContain('"marker":"nd*"');
  });

  it("routes a para-kind marker typed in char position to Tier 2", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => $retypeGlyph(parts.marker, "\\q1 ")));
    editor.getEditorState().read(() => {
      // Tier 2 re-tokenized `\q1` into a real PARAGRAPH that now owns the text...
      const paras = $getRoot().getChildren().filter($isParaNode);
      const q1Para = paras.find((p) => p.getMarker() === "q1");
      expect(q1Para).toBeDefined();
      expect(q1Para?.getTextContent()).toContain("Lord");
      // ...and no char span wraps it any more — a broken kind guard would instead have
      // renamed the "nd" CharNode to "q1" in place and left the text inside it.
      const chars = paras.flatMap((p) => p.getChildren()).filter($isCharNode);
      expect(chars.some((c) => c.getMarker() === "nd" || c.getMarker() === "q1")).toBe(false);
    });
  });
});

/**
 * Mirrors the shape the collab delta-apply path produces for nested char spans
 * ($createNestedChars): the OUTER CharNode's direct children are the flattened
 * run `[opening(outer), opening(inner), CharNode(inner), closing(inner), closing(outer)]`,
 * not the naturally-nested `outer > [openOuter, inner > [...], closeOuter]` shape the
 * USJ adaptor produces.
 */
function $appendNestedCharPara(): {
  outerChar: CharNode;
  outerOpener: MarkerNode;
  innerOpener: MarkerNode;
  innerChar: CharNode;
  innerCloser: MarkerNode;
  outerCloser: MarkerNode;
} {
  const para = $createParaNode("p");
  const paraMarker = $createMarkerNode("p");
  const outerChar = $createCharNode("add");
  const outerOpener = $createMarkerNode("add");
  const innerOpener = $createMarkerNode("nd");
  const innerChar = $createCharNode("nd");
  const innerCloser = $createMarkerNode("nd", "closing");
  const outerCloser = $createMarkerNode("add", "closing");
  $getRoot().append(
    para.append(
      paraMarker,
      $createTextNode(NBSP),
      outerChar.append(
        outerOpener,
        innerOpener,
        innerChar.append($createTextNode(`${NBSP}Lord`)),
        innerCloser,
        outerCloser,
      ),
    ),
  );
  return { outerChar, outerOpener, innerOpener, innerChar, innerCloser, outerCloser };
}

/**
 * The NATURAL nested shape the USJ adaptor builds (`createChar`): the inner span's `+`-prefixed
 * glyphs are its OWN children — `outer > [openOuter, …, inner > [open(+nd), content, close(+nd*)],
 * …, closeOuter]` — unlike the collab-flattened shape below, where the inner glyphs ride directly
 * under the outer span.
 */
function $appendNaturallyNestedCharPara(): {
  outerChar: CharNode;
  innerChar: CharNode;
  innerOpener: MarkerNode;
  innerCloser: MarkerNode;
  outerCloser: MarkerNode;
} {
  const outerChar = $createCharNode("add");
  const innerChar = $createCharNode("nd");
  const innerOpener = $createMarkerNode("nd", "opening", true);
  const innerCloser = $createMarkerNode("nd", "closing", true);
  const outerCloser = $createMarkerNode("add", "closing");
  $getRoot().append(
    $createParaNode("p").append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      outerChar.append(
        $createMarkerNode("add"),
        $createTextNode(`${NBSP}say `),
        innerChar.append(innerOpener, $createTextNode(`${NBSP}Lord`), innerCloser),
        $createTextNode(" here"),
        outerCloser,
      ),
    ),
  );
  return { outerChar, innerChar, innerOpener, innerCloser, outerCloser };
}

describe("Tier 1 nested char opener rename", () => {
  it("renames the nested span in place and mirrors its nested closer", async () => {
    let parts: ReturnType<typeof $appendNaturallyNestedCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendNaturallyNestedCharPara()));
    // Retyping the glyph keeps its own canonical `+` prefix: `\+nd` → `\+wj `. The `+` is the
    // nested glyph's rest-state spelling, NOT a fresh nest instruction, so this is a Tier-1
    // in-place rename — routing it to Tier 2 stranded the untouched `\+nd*` closer as unmatched.
    await act(async () => editor.update(() => $retypeGlyph(parts.innerOpener, "\\+wj ")));
    editor.getEditorState().read(() => {
      expect(parts.innerChar.getMarker()).toBe("wj");
      expect(parts.innerOpener.getTextContent()).toBe("\\+wj");
      expect(parts.innerCloser.getTextContent()).toBe("\\+wj*");
      expect(parts.outerChar.getMarker()).toBe("add");
      expect(parts.outerCloser.getTextContent()).toBe("\\add*");
    });
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('"type":"unmatched"');
  });
});

describe("Tier 1 char opener rename on a collab-flattened nested span", () => {
  it("renames the OUTER closer on a collab-flattened nested span", async () => {
    let parts: ReturnType<typeof $appendNestedCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendNestedCharPara()));
    await act(async () => editor.update(() => $retypeGlyph(parts.outerOpener, "\\bd ")));
    editor.getEditorState().read(() => {
      expect(parts.outerChar.getMarker()).toBe("bd");
      expect(parts.outerCloser.getTextContent()).toBe("\\bd*");
      // The inner closer belongs to the untouched inner "nd" span and must be left alone.
      expect(parts.innerCloser.getTextContent()).toBe("\\nd*");
    });
  });

  it("routes an inner-opener rename on a flattened span to Tier 2", async () => {
    let parts: ReturnType<typeof $appendNestedCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendNestedCharPara()));
    await act(async () => editor.update(() => $retypeGlyph(parts.innerOpener, "\\wj ")));
    // Load-bearing wrong-behavior-prevented assertion: pre-fix, the opener-owns-parent
    // assumption let this rename clobber the OUTER span's marker directly (add -> wj).
    // The guard refuses the in-place rename here, so Tier 2 rebuilds the paragraph from
    // its glyph text instead, and the outer "add" span survives alongside the newly
    // re-tokenized inner "wj" span. (The old node references are torn down by the
    // rebuild, so the state is inspected via JSON rather than the stale node objects.)
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"add"');
    expect(json).toContain('"marker":"wj"');
  });
});

describe("Tier 1 verse/chapter number sync", () => {
  it("syncs the number when the verse token is edited", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(getVisibleOpenMarkerText("v", "2"))),
    );
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("2"));
  });

  it("syncs bridges and segments", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(getVisibleOpenMarkerText("v", "1-2"))),
    );
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("1-2"));
  });

  it("extracts trailing typed text out of the verse node", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () =>
      editor.update(() => verse.setTextContent(`${getVisibleOpenMarkerText("v", "1")}x`)),
    );
    editor.getEditorState().read(() => {
      expect(verse.getTextContent()).toBe(getVisibleOpenMarkerText("v", "1"));
      // Lexical's own dirty-leaf normalization (LexicalNormalization.ts) merges the newly
      // extracted "x" TextNode into the adjacent plain "In the beginning" sibling every update
      // - core behavior, not something this transform controls - so the surviving sibling reads
      // "xIn the beginning" rather than staying a bare "x" node.
      expect(verse.getNextSibling()?.getTextContent()).toBe("xIn the beginning");
    });
  });

  it("leaves a number-less mid-edit token pending", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent(`\\v${NBSP}`)));
    editor.getEditorState().read(() => expect(verse.getNumber()).toBe("1")); // stored number kept
  });

  it("re-tokenizes when the \\v prefix is broken (verse dissolves to text)", async () => {
    let verse: VerseNode;
    const { editor } = await testEnvironment(() => ({ verse } = $appendVersePara()));
    await act(async () => editor.update(() => verse.setTextContent("v 1 ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).not.toContain('"type":"verse"');
  });

  it("syncs the number and canonicalizes when the chapter token is edited", async () => {
    let chapter: ChapterNode;
    const { editor } = await testEnvironment(() => {
      chapter = $createChapterNode("1");
      $getRoot().append(
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP)),
      );
    });
    // Retype the marker with a plain-space separator; the transform canonicalizes to NBSP.
    // Lexical runs an ElementNode transform only when the element is *intentionally* dirtied;
    // a bare text-child edit marks the ChapterNode dirty non-intentionally, so mark it dirty
    // to reach the registered transform (a real structural edit dirties it the same way — see
    // the emptied-chapter test, which triggers organically via remove()).
    await act(async () =>
      editor.update(() => {
        const text = chapter.getFirstChild();
        if ($isTextNode(text)) text.setTextContent("\\c 2 ");
        chapter.markDirty();
      }),
    );
    editor.getEditorState().read(() => {
      expect(chapter.getNumber()).toBe("2");
      expect(chapter.getFirstChild()?.getTextContent()).toBe(getVisibleOpenMarkerText("c", "2"));
    });
  });

  it("keeps typed bytes AFTER the chapter number instead of deleting them", async () => {
    // The retag regex is end-anchored: `\c 1 \ca 5\ca*` holds more than a retagged number, and
    // the immediate canonical rewrite used to reduce the glyph to `\c 1 ` — silently dropping
    // the typed `\ca 5\ca*` with no pend, no settle, and no undo entry. The shape now stays
    // literal (the chapter-interior pend arm routes it to the chapter-scoped departure rebuild).
    let chapter: ChapterNode;
    const { editor } = await testEnvironment(() => {
      chapter = $createChapterNode("1");
      $getRoot().append(
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP)),
      );
    });
    await act(async () =>
      editor.update(() => {
        const text = chapter.getFirstChild();
        if ($isTextNode(text)) text.setTextContent("\\c 1 \\ca 5\\ca*");
        chapter.markDirty();
      }),
    );
    editor.getEditorState().read(() => {
      expect(chapter.getNumber()).toBe("1");
      expect(chapter.getFirstChild()?.getTextContent()).toBe("\\c 1 \\ca 5\\ca*");
    });
  });

  it("removes the chapter node when its marker text is fully deleted", async () => {
    let chapter: ChapterNode;
    const { editor } = await testEnvironment(() => {
      chapter = $createChapterNode("1");
      $getRoot().append(
        chapter.append($createTextNode(getVisibleOpenMarkerText("c", "1"))),
        $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP)),
      );
    });
    await act(async () => editor.update(() => chapter.getFirstChild()?.remove()));
    editor.getEditorState().read(() => expect(chapter.isAttached()).toBe(false));
  });
});

/** A `\p` body paragraph: `[marker, "body text"]`. */
function $appendBodyPara(): { para: ParaNode; body: TextNode } {
  const para = $createParaNode("p");
  const body = $createTextNode("body text");
  $getRoot().append(para.append($createMarkerNode("p"), body));
  return { para, body };
}

/**
 * The Standard-view `\`-palette keyboard flows were broken in-app by two
 * real-browser actors the demo/unit harness never exercised:
 *
 *  1. ScriptureReferencePlugin's async scrRef echo. Typing `\` fires SELECTION_CHANGE, which pushes
 *     a new scrRef up through papi; the returning setting echo (~90-190ms later) re-enters
 *     `$moveCursorToVerseStart`, which yanks the caret to the para/verse start via
 *     `editor.update(..., { tag: CURSOR_CHANGE_TAG })`. Pre-fix the marker engine treated that
 *     programmatic move as a user caret departure and force-settled the just-typed literal —
 *     instant paragraph split, `\p \` autosaved to disk. This falsifies the
 *     original "blur nulls the selection" hypothesis for the TYPING path: focus never
 *     leaves the editor, and the popover — which has no ScriptureReferencePlugin — never
 *     races. Fix: the update listener ignores CURSOR_CHANGE-tagged commits.
 *
 *  2. Cross-frame blur on palette-item CLICK. Clicking a renderer-overlay palette item blurs the
 *     editor iframe; a real cross-frame blur can null Lexical's live selection, so the BLUR handler
 *     can't read the caret's anchor. Pre-fix it then excepted `undefined` and resolved EVERY pending
 *     — including the literal the palette apply is about to replace. Fix: the update listener keeps
 *     the last real anchor when the selection goes null (rather than clobbering it to undefined), and
 *     the BLUR handler falls back to it.
 */
describe("async scrRef caret-yank and cross-frame blur", () => {
  it("does not settle a pending paragraph-marker rename on a CURSOR_CHANGE caret yank", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3); // still editing: pends
      }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1")); // pending
    // The scrRef echo yanks the caret to the para start under a CURSOR_CHANGE tag — NOT a user
    // departure. (The untagged control is "completes a pending marker when the caret leaves it".)
    await act(async () =>
      editor.update(() => para.getLastChild()?.selectStart(), { tag: CURSOR_CHANGE_TAG }),
    );
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1")); // STILL pending
  });

  it("survives the FOLLOW-ON untagged commit after a CURSOR_CHANGE yank (in-app 3-commit sequence)", async () => {
    // Runtime smoke proved the CURSOR_CHANGE gate alone is insufficient: the scrRef echo
    // yanks the caret to the glyph (commit 2, tagged), then a FOLLOW-ON untagged commit (commit 3 —
    // e.g. Lexical's own selectionchange reconcile / OnSelectionChangePlugin) sees the caret parked
    // OFF the pending node and resolves it → paragraph split. The caret stays app-placed until the
    // user actually acts (a KEY_DOWN), so resolution must stay suppressed across that follow-on.
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    const $selectHeadingText = (offset: number) => {
      const last = para.getLastChild();
      if ($isTextNode(last)) last.select(offset, offset);
    };
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3);
      }),
    );
    // commit 2: programmatic scrRef yank off the pending marker (to the heading text start).
    await act(async () => editor.update(() => $selectHeadingText(0), { tag: CURSOR_CHANGE_TAG }));
    // commit 3: an untagged follow-on that leaves the caret off the pending marker (genuine move).
    await act(async () => editor.update(() => $selectHeadingText(1)));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1")); // STILL pending, not split

    // But a genuine user keystroke re-establishes intent: after KEY_DOWN, a real caret departure DOES
    // complete the marker (the suppression is not permanent).
    await act(async () => {
      editor.dispatchCommand(KEY_DOWN_COMMAND, new KeyboardEvent("keydown", { key: "ArrowRight" }));
    });
    await act(async () => editor.update(() => $selectHeadingText(3)));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2")); // now completes
  });

  it("does not force-settle a pending literal backslash into a split on a CURSOR_CHANGE yank", async () => {
    let para: ParaNode, body: TextNode;
    const { editor } = await testEnvironment(() => ({ para, body } = $appendBodyPara()));
    // Type an unterminated `\zz` into the body; caret stays inside, so it only pends.
    await act(async () =>
      editor.update(() => {
        body.setTextContent("body \\zz");
        body.select(body.getTextContentSize(), body.getTextContentSize());
      }),
    );
    editor
      .getEditorState()
      .read(() => expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1));
    // scrRef echo yanks the caret to the para marker glyph (offset 0) under a CURSOR_CHANGE tag.
    // Pre-fix this resolved the pending literal → Tier 2 rebuild → paragraph split (`\p \` on disk).
    await act(async () =>
      editor.update(() => para.getFirstChild()?.selectStart(), { tag: CURSOR_CHANGE_TAG }),
    );
    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().filter($isParaNode)).toHaveLength(1); // NOT split
      expect($getRoot().getTextContent()).toContain("\\zz"); // literal preserved
    });
  });

  it("keeps the caret's pending marker on a cross-frame blur that nulls the selection", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3); // caret parked in the mid-edit marker -> lastAnchorKey tracks it
      }),
    );
    // A real cross-frame blur nulls the live selection before BLUR_COMMAND fires.
    await act(async () => editor.update(() => $setSelection(null)));
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s1"); // NOT force-settled: fell back to lastAnchorKey
      expect(marker.getTextContent()).toBe("\\s2"); // literal preserved for the palette apply
    });
  });

  // NOTE: the "tagged commit that does NOT move the caret must not arm" narrowing is
  // implemented in MarkerEditPlugin (compared against the previous commit's anchor) but is not
  // jsdom-pinned: a tagged act followed by an untagged departure hits a Lexical batching edge in
  // this harness where the departure commit (and with it the deferred resolution microtask)
  // defers past the test body even with `discrete: true` — three fixture strategies failed
  // deterministically while every captured trace showed the narrowing itself deciding correctly.
  // The behavior is covered by the in-app smoke (literals settle on mouse departure).
  it("a mouse click ends the app-placed suppression window", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    const $selectHeading = (offset: number) => {
      const last = para.getLastChild();
      if ($isTextNode(last)) last.select(offset, offset);
    };
    await act(async () =>
      editor.update(() => {
        marker.setTextContent("\\s2");
        marker.select(3, 3);
      }),
    );
    // A REAL yank (tagged commit that moves the anchor) arms the window...
    await act(async () => editor.update(() => $selectHeading(0), { tag: CURSOR_CHANGE_TAG }));
    // ...so an untagged follow-on move does not settle (round-2 behavior, still intact):
    await act(async () => editor.update(() => $selectHeading(1)));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s1"));
    // A mouse CLICK re-establishes user intent (same contract as keydown)...
    await act(async () => {
      editor.dispatchCommand(CLICK_COMMAND, new MouseEvent("click"));
    });
    // ...and the next caret departure settles the pending marker.
    await act(async () => editor.update(() => $selectHeading(3)));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("resolves non-caret pendings but keeps the caret's on a nulled-selection blur", async () => {
    let para1: ParaNode, para2: ParaNode, first: MarkerNode, second: MarkerNode;
    const { editor } = await testEnvironment(() => {
      para1 = $createParaNode("s1");
      first = $createMarkerNode("s1");
      para2 = $createParaNode("s1");
      second = $createMarkerNode("s1");
      $getRoot().append(
        para1.append(first, $createTextNode(NBSP), $createTextNode("First")),
        para2.append(second, $createTextNode(NBSP), $createTextNode("Second")),
      );
    });
    // First is mid-edited with the caret inside it -> lastAnchorKey = first, first stays pending.
    await act(async () =>
      editor.update(() => {
        first.setTextContent("\\s2");
        first.select(3, 3);
      }),
    );
    // Second becomes pending in the SAME commit that nulls the selection, so the deferred resolution
    // (gated on a known anchor) can't sweep it first — it survives to the blur. Ledger-recorded
    // ($pendGlyphEdit): with the selection nulled there is no caret to carry the user provenance,
    // and an unrecorded caret-less divergence is machine drift the engine heals.
    await act(async () =>
      editor.update(() => {
        $pendGlyphEdit(second, "\\s2");
        $setSelection(null);
      }),
    );
    await act(async () => {
      editor.dispatchCommand(BLUR_COMMAND, null as never);
    });
    editor.getEditorState().read(() => {
      expect(para1.getMarker()).toBe("s1"); // caret's own pending preserved (lastAnchorKey except)
      expect(para2.getMarker()).toBe("s2"); // the other pending still completes on blur
    });
  });
});

describe("$resolvePendingMarkers attribute-run re-pend guard", () => {
  /**
   * A standalone `MarkerEditContext` — bypassing the mounted `MarkerEditPlugin` — so
   * `pendingKeys` is a plain `Set` this test can inspect directly, the same direct-call
   * technique the Tier-2 trigger and `$rebuildParas` suites use.
   */
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("keeps a caret-held edited attribute run pending, then consumes the key on departure", () => {
    const { editor } = createBasicTestEnvironment();
    let ndChar: CharNode;
    let run: TextNode;
    let other: TextNode;
    editor.update(
      () => {
        ndChar = $createCharNode("nd", { lemma: "grace" });
        run = $createTextNode('|lemma="grace"');
        $setState(run, textTypeState, "attribute");
        ndChar.append(
          $createMarkerNode("nd"),
          $createTextNode(`${NBSP}holy`),
          run,
          $createMarkerNode("nd", "closing"),
        );
        other = $createTextNode("elsewhere");
        $getRoot().append(
          $createParaNode("p").append($createMarkerNode("p"), $createTextNode(NBSP), ndChar),
          $createParaNode("p").append($createMarkerNode("p"), other),
        );
      },
      { discrete: true },
    );
    const context = buildContext();
    editor.update(
      () => {
        // Mid-edit: the run diverges from canonical with the collapsed caret inside it; the
        // engine's CharNode transform pends the SPAN key for exactly this shape.
        run.setTextContent('|lemma="gra');
        run.select(run.getTextContentSize(), run.getTextContentSize());
        context.pendingKeys.add(ndChar.getKey());
      },
      { discrete: true },
    );
    editor.update(
      () => {
        // Resolve while the caret still holds the run. `exceptKey` shields only the anchor
        // node itself (the run TextNode) — NOT the parent span's pended key — so without the
        // re-pend guard this settles the span out from under the user's mid-edit caret.
        $resolvePendingMarkers(context, run.getKey());
        expect(context.pendingKeys.has(ndChar.getKey())).toBe(true);
        // Nothing settled: the in-progress edit is untouched.
        expect(run.getTextContent()).toBe('|lemma="gra');
      },
      { discrete: true },
    );
    editor.update(
      () => {
        // Caret departure: the next resolve consumes the key. The settle itself may refuse as
        // a fixed point while attribute-bearing spans are still Tier-2 sentinels — key
        // consumption (no re-pend, no leak) is the observable contract here, not the rebuild.
        other.select(0, 0);
        $resolvePendingMarkers(context);
        expect(context.pendingKeys.has(ndChar.getKey())).toBe(false);
      },
      { discrete: true },
    );
  });
});

// These unit tests hand-build the wrapper directly (rather than going through the adaptor or the
// self-healing syncs) to pin the husk-removal arm's own behavior in isolation.
describe("$settlePendedDisplayOwner AttributeRunNode husk arm (dual-read)", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("removes an empty milestone wrapper husk, then removes the milestone itself (run entirely absent)", () => {
    // Mirrors the optbreak arm this one is modeled on: the empty wrapper is undead scaffolding
    // removed as a side effect, and the OWNER's own policy ($runEntirelyAbsent, since
    // nothing survives the husk's removal either) still runs in the SAME settle pass.
    const { editor } = createBasicTestEnvironment();
    let milestone!: MilestoneNode;
    let wrapper!: AttributeRunNode;
    editor.update(
      () => {
        milestone = $createMilestoneNode("qt-s", "q1");
        wrapper = $createAttributeRunNode("milestone");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode("before "),
            milestone,
            wrapper,
            $createTextNode(" after"),
          ),
        );
      },
      { discrete: true },
    );

    const context = buildContext();
    let result!: { handled: boolean; mutated: boolean };
    editor.update(
      () => {
        result = $settlePendedDisplayOwner(milestone, context);
      },
      { discrete: true },
    );

    expect(result).toEqual({ handled: true, mutated: true });
    editor.getEditorState().read(() => {
      expect(milestone.isAttached()).toBe(false);
      expect(wrapper.isAttached()).toBe(false);
      const text = $getRoot().getTextContent();
      expect(text).toContain("before ");
      expect(text).toContain(" after");
    });
  });

  it("removes an empty \\va wrapper husk on a verse WITHOUT removing the verse itself", () => {
    // A verse always exists regardless of its display run — unlike a milestone, whose run IS its
    // entire byte representation, so only the wrapper (dead scaffolding) is cleaned up here.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaWrapper!: AttributeRunNode;
    editor.update(
      () => {
        // No altnumber/pubnumber — a genuinely cleared field, so nothing re-derives a fresh run.
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        vaWrapper = $createAttributeRunNode("va");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vaWrapper,
            $createTextNode("text"),
          ),
        );
      },
      { discrete: true },
    );

    const context = buildContext();
    let result!: { handled: boolean; mutated: boolean };
    editor.update(
      () => {
        result = $settlePendedDisplayOwner(verse, context);
      },
      { discrete: true },
    );

    // `handled: false` regardless of the husk removal — the caller still falls through to its own
    // re-tokenize arm (see this function's doc comment on the final return), the existing,
    // already-safe default for a verse whose pend isn't a recognized caret-held divergence. But
    // `mutated: true` — the husk removal is a real change, and `$resolvePendingMarkers` now folds
    // it in on this path too, so a rebuild that refuses as a fixed point never reports it away.
    expect(result).toEqual({ handled: false, mutated: true });
    editor.getEditorState().read(() => {
      expect(verse.isAttached()).toBe(true);
      expect(vaWrapper.isAttached()).toBe(false);
    });
  });

  it("does not touch an attached wrapper that still has pieces (not a husk)", () => {
    const { editor } = createBasicTestEnvironment();
    let milestone!: MilestoneNode;
    let wrapper!: AttributeRunNode;
    editor.update(
      () => {
        milestone = $createMilestoneNode("qt-s", "q1");
        wrapper = $createAttributeRunNode("milestone");
        wrapper.append($createMarkerNode("qt-s", "opening"), $createMarkerNode("", "selfClosing"));
        $getRoot().append($createParaNode("p").append(milestone, wrapper));
      },
      { discrete: true },
    );

    const context = buildContext();
    editor.update(
      () => {
        $settlePendedDisplayOwner(milestone, context);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // Neither the milestone nor its non-empty wrapper were removed — the husk arm is scoped
      // strictly to an EMPTY wrapper.
      expect(milestone.isAttached()).toBe(true);
      expect(wrapper.isAttached()).toBe(true);
    });
  });
});

describe("$resolvePendingMarkers folds a husk-only settle's mutation", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("reports a husk removal as a mutation even when the settle's rebuild refuses", () => {
    // A refused (fixed-point) rebuild returns false, but removing an emptied AttributeRunNode husk
    // IS a visible mutation. Reporting it as "mutated nothing" makes the caller merge the commit
    // into the previous history entry, burying a real change under one dead Ctrl+Z. The empty
    // wrapper contributes no bytes of its own, so the fallthrough re-tokenize below genuinely finds
    // nothing changed in the displayed text and refuses — this shape is exactly how that refusal is
    // reached, not an artificial stand-in for it.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaWrapper!: AttributeRunNode;
    editor.update(
      () => {
        // No altnumber/pubnumber — a genuinely cleared field, so nothing re-derives a fresh run,
        // and the verse's own glyph text is already canonical. The paragraph's own `\p` marker
        // glyph is included (unlike the direct-call husk tests above, which never reach the
        // tokenizer): without it, the rebuilt fragment would always synthesize one, so the
        // rebuild's signature would genuinely differ from the current tree's — a real splice, not
        // the fixed-point refusal this test is pinning.
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
        vaWrapper = $createAttributeRunNode("va");
        $getRoot().append(
          $createParaNode("p").append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            verse,
            vaWrapper,
            $createTextNode("x"),
          ),
        );
      },
      { discrete: true },
    );

    const context = buildContext();
    context.pendingKeys.add(verse.getKey());
    let mutated = false;
    editor.update(
      () => {
        mutated = $resolvePendingMarkers(context);
      },
      { discrete: true },
    );

    expect(mutated).toBe(true);
    editor.getEditorState().read(() => {
      expect(vaWrapper.isAttached()).toBe(false);
      expect(verse.isAttached()).toBe(true);
    });
  });
});

describe("$settlePendedDisplayOwner verse migration + fallthrough interaction", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  it("migrates \\vp's loose-but-canonical run and still falls through when \\va carries a genuine (non-migration) divergence", () => {
    // \va and \vp are two INDEPENDENT runs sharing one pended verse identity. Traced gap: a settle
    // that reports handled the moment ONE kind's wrap migration lands would short-circuit past
    // the OTHER kind's still-unresolved genuine divergence — e.g. a run destroyed by something
    // else in an earlier commit, which the sync's own destruction detection cannot see once the
    // owner is already pended (its pended-owner gate runs first, displayRunSync.utils.ts). Left
    // unresolved, a destroyed run sits stale — altnumber still set, no bytes displayed — until
    // some unrelated LATER edit happens to dirty the verse again.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let other!: TextNode;
    editor.update(
      () => {
        // \va's run is entirely gone (as if destroyed by something else in an earlier commit)
        // while altnumber is still set. \vp rides loose but byte-exact — needs only the wrap.
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", "3");
        const vpOpener = $createMarkerNode("vp");
        const vpValue = $createTextNode(`${NBSP}3`);
        $setState(vpValue, textTypeState, "attribute");
        const vpCloser = $createMarkerNode("vp", "closing");
        other = $createTextNode("elsewhere");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vpOpener,
            vpValue,
            vpCloser,
            $createTextNode("In the beginning"),
          ),
          $createParaNode("p").append(other),
        );
        // Caret parked away from both runs' sites — the settle must treat the caret as departed.
        other.select(0, 0);
      },
      { discrete: true },
    );

    const context = buildContext();
    let result!: { handled: boolean; mutated: boolean };
    editor.update(
      () => {
        result = $settlePendedDisplayOwner(verse, context);
      },
      { discrete: true },
    );

    // \vp's migration is a real, correct write, but \va's genuine divergence remains unresolved —
    // the settle must NOT report handled here; the caller's own re-tokenize fallthrough is what
    // actually resolves \va (this test only pins the DECISION; the fallthrough's own re-tokenize
    // behavior for a destroyed run is covered elsewhere, e.g. verseAttributeSettle.test.tsx's
    // "clears altnumber on caret departure after the whole \va triplet is deleted"). `mutated: true`
    // regardless of `handled: false`: \vp's migration is a real structural write, and the caller
    // now folds `mutated` on this path too, so a Tier-2 fixed point covering \va elsewhere must not
    // make \vp's already-performed migration disappear from the report.
    expect(result).toEqual({ handled: false, mutated: true });
    editor.getEditorState().read(() => {
      // \vp still migrated into its wrapper — a real mutation performed before falling through.
      const { wrapper } = $verseAttributeRunPieces(verse, "vp");
      expect(wrapper).toBeDefined();
      expect(wrapper?.getChildrenSize()).toBe(3);
    });
  });

  it("re-pends the whole verse untouched when the caret holds \\vp's site, even though \\va is a loose-but-canonical migration candidate", () => {
    // The grace PRE-PASS contract: every matching descriptor's caret-held check must run to
    // completion BEFORE any migration/deletion touches the tree, not interleaved per descriptor in
    // registry order. \va here rides loose but byte-exact (a migration candidate, same shape as the
    // positive-control test below) while the caret sits inside \vp's live value — mid-edit on a
    // SIBLING run of the same owner. Migrating \va first (registry order visits it before \vp) would
    // move three nodes beside a live caret mid-typing; the pre-pass must instead find \vp caret-held
    // and re-pend the WHOLE owner before \va's migration ever runs.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaValue!: TextNode;
    editor.update(
      () => {
        verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"), undefined, "2", "3");
        const vaOpener = $createMarkerNode("va");
        vaValue = $createTextNode(`${NBSP}2`);
        $setState(vaValue, textTypeState, "attribute");
        const vaCloser = $createMarkerNode("va", "closing");
        const vpOpener = $createMarkerNode("vp");
        const vpValue = $createTextNode(`${NBSP}3`);
        $setState(vpValue, textTypeState, "attribute");
        const vpCloser = $createMarkerNode("vp", "closing");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vaOpener,
            vaValue,
            vaCloser,
            vpOpener,
            vpValue,
            vpCloser,
            $createTextNode("In the beginning"),
          ),
        );
        // Caret inside \vp's live value: still loose (no wrapper), so this counts as caret-held
        // (the pending wrap migration is itself a divergence — $runDiverges, displayRunSync.utils.ts).
        vpValue.select(1, 1);
      },
      { discrete: true },
    );

    const context = buildContext();
    let result!: { handled: boolean; mutated: boolean };
    editor.update(
      () => {
        result = $settlePendedDisplayOwner(verse, context);
      },
      { discrete: true },
    );

    expect(result).toEqual({ handled: true, mutated: false });
    expect(context.pendingKeys.has(verse.getKey())).toBe(true);
    editor.getEditorState().read(() => {
      // Nothing moved: \va is still loose (no wrapper materialized by an unwanted migration).
      const { wrapper } = $verseAttributeRunPieces(verse, "va");
      expect(wrapper).toBeUndefined();
      expect(vaValue.isAttached()).toBe(true);
      expect(vaValue.getTextContent()).toBe(`${NBSP}2`);
    });
  });

  it("reports handled when the only divergence is \\vp's wrap migration (no genuine divergence elsewhere)", () => {
    // Negative control: with \va already canonical (nothing to resolve), a settle that migrates
    // \vp alone DOES report handled — the common case this fix must not regress.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let other!: TextNode;
    editor.update(
      () => {
        verse = $createVerseNode(
          "1",
          getVisibleOpenMarkerText("v", "1"),
          undefined,
          undefined,
          "3",
        );
        const vpOpener = $createMarkerNode("vp");
        const vpValue = $createTextNode(`${NBSP}3`);
        $setState(vpValue, textTypeState, "attribute");
        const vpCloser = $createMarkerNode("vp", "closing");
        other = $createTextNode("elsewhere");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vpOpener,
            vpValue,
            vpCloser,
            $createTextNode("In the beginning"),
          ),
          $createParaNode("p").append(other),
        );
        other.select(0, 0);
      },
      { discrete: true },
    );

    const context = buildContext();
    let result!: { handled: boolean; mutated: boolean };
    editor.update(
      () => {
        result = $settlePendedDisplayOwner(verse, context);
      },
      { discrete: true },
    );

    expect(result).toEqual({ handled: true, mutated: true });
    editor.getEditorState().read(() => {
      const { wrapper } = $verseAttributeRunPieces(verse, "vp");
      expect(wrapper).toBeDefined();
    });
  });
});

describe("$resolvePendingMarkers routes a pended run PIECE through its owner's grace", () => {
  function buildContext(): MarkerEditContext {
    return {
      viewOptions,
      getMarker: bundledGetMarker,
      pendingKeys: new Set<NodeKey>(),
      splitExpected: { current: false },
      rebuildAttempted: new Set<string>(),
    };
  }

  /** A verse carrying BOTH wrapped runs (`\va 11 va\va*\vp 11 vp\vp*`) in a `\p` paragraph. */
  function $buildVaVpVerse(): {
    verse: VerseNode;
    vaValue: TextNode;
    vpValue: TextNode;
  } {
    const verse = $createVerseNode(
      "11",
      getVisibleOpenMarkerText("v", "11"),
      undefined,
      "11 va",
      "11 vp",
    );
    const vaWrapper = $createAttributeRunNode("va");
    const vaValue = $createTextNode(`${NBSP}11 va`);
    $setState(vaValue, textTypeState, "attribute");
    vaWrapper.append($createMarkerNode("va"), vaValue, $createMarkerNode("va", "closing"));
    const vpWrapper = $createAttributeRunNode("vp");
    const vpValue = $createTextNode(`${NBSP}11 vp`);
    $setState(vpValue, textTypeState, "attribute");
    vpWrapper.append($createMarkerNode("vp"), vpValue, $createMarkerNode("vp", "closing"));
    $getRoot().append(
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        verse,
        vaWrapper,
        vpWrapper,
        $createTextNode(" This verse."),
      ),
      $createParaNode("p").append(
        $createMarkerNode("p"),
        $createTextNode(NBSP),
        $createTextNode("body"),
      ),
    );
    return { verse, vaValue, vpValue };
  }

  it("graces a caret-held \\va run when a SIBLING \\vp piece's key is what resolves", () => {
    // The grace-contract violation: `$textNodeTier2Transform` pends every attribute-run value under
    // its OWN key, so the resolve pass can be handed a run PIECE. A piece matches no descriptor's
    // `ownerPredicate`, so `$settlePendedDisplayOwner` reports it unhandled and the caller
    // re-tokenizes the piece's whole PARAGRAPH — with no owner-grace check anywhere on that path.
    // Here the caret sits mid-edit inside the `\va` value while the SIBLING `\vp` value's key
    // resolves: the rebuild re-tokenizes the transient `\va 11 v` bytes out from under the user.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaValue!: TextNode;
    let vpValue!: TextNode;
    editor.update(
      () => {
        ({ verse, vaValue, vpValue } = $buildVaVpVerse());
      },
      { discrete: true },
    );
    const vaValueKey = vaValue.getKey();

    const context = buildContext();
    editor.update(
      () => {
        // Mid-edit inside `\va`'s value (a character deleted off its end), caret in the bytes.
        vaValue.setTextContent(`${NBSP}11 v`);
        vaValue.select(vaValue.getTextContentSize(), vaValue.getTextContentSize());
        // What the TextNode catch-all transform does with the sibling run's value: pend its OWN key.
        context.pendingKeys.add(vpValue.getKey());
      },
      { discrete: true },
    );

    editor.update(
      () => {
        // `exceptKey` is the caret's own node — the `\va` value — exactly as MarkerEditPlugin
        // computes it. It shields that node's own key, never the sibling piece's.
        $resolvePendingMarkers(context, vaValueKey);
      },
      { discrete: true },
    );

    editor.getEditorState().read(() => {
      // The caret-held run was NOT settled: its value node still exists (same key, not replaced by
      // a rebuild) and still carries the user's transient mid-edit bytes.
      expect(vaValue.isAttached()).toBe(true);
      expect(vaValue.getTextContent()).toBe(`${NBSP}11 v`);
      // The verse's own state was not re-derived from those mid-edit bytes either.
      expect(verse.getAltnumber()).toBe("11 va");
    });
    // The owner is re-pended, so the settle still happens once the caret departs.
    expect(context.pendingKeys.has(verse.getKey())).toBe(true);
  });

  it("keeps a graced owner's re-pend when its OWN key resolves after a piece's in the same pass", () => {
    // The pass consumes keys as it goes, and mapping means one owner can be reached from several of
    // them: BOTH run values plus the owner's own key, all pended in one commit — the ordinary shape
    // when a verse's runs and the verse itself are dirtied together. The caret holds the `\va` run,
    // so the FIRST key to arrive graces the owner and re-pends it; every later key for that same
    // owner must leave that re-pend alone. Consuming keys unconditionally at the top of the loop —
    // as the pass did before pieces were mapped, when a key only ever meant itself — deletes the
    // owner's own key AFTER the grace re-added it, and the settle is lost for good: the run stays
    // mid-edit forever and the next departure has nothing to resolve.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaValue!: TextNode;
    let vpValue!: TextNode;
    let vaOpener!: MarkerNode;
    editor.update(
      () => {
        ({ verse, vaValue, vpValue } = $buildVaVpVerse());
        const opener = $verseAttributeRunPieces(verse, "va").opener;
        if (!opener) throw new Error("\\va opener missing");
        vaOpener = opener;
      },
      { discrete: true },
    );

    const context = buildContext();
    editor.update(
      () => {
        // `\va` mid-edit with the caret parked on its opening glyph — inside the run's wrapper, so
        // the owner is caret-held. The caret's own node is the GLYPH, so neither pended value key
        // is shielded by `exceptKey`: both reach the mapping.
        vaValue.setTextContent(`${NBSP}11 v`);
        vaOpener.select(vaOpener.getTextContentSize(), vaOpener.getTextContentSize());
        // Insertion order is the pass's iteration order: both pieces first, the owner's own key
        // last — the ordering in which a top-of-loop delete would discard the grace re-pend.
        context.pendingKeys.add(vaValue.getKey());
        context.pendingKeys.add(vpValue.getKey());
        context.pendingKeys.add(verse.getKey());
      },
      { discrete: true },
    );

    editor.update(
      () => {
        $resolvePendingMarkers(context, vaOpener.getKey());
      },
      { discrete: true },
    );

    // The owner is still pended — the grace survived every later key for it — and it is the ONLY
    // key left: both pieces were consumed by the owner they map to.
    expect(context.pendingKeys.has(verse.getKey())).toBe(true);
    expect([...context.pendingKeys]).toEqual([verse.getKey()]);
    editor.getEditorState().read(() => {
      // Nothing settled: the mid-edit bytes and both run values are exactly as the user left them.
      expect(vaValue.isAttached()).toBe(true);
      expect(vaValue.getTextContent()).toBe(`${NBSP}11 v`);
      expect(vpValue.isAttached()).toBe(true);
      expect(verse.getAltnumber()).toBe("11 va");
    });
  });

  it("settles the owner ONCE when two pended pieces of its runs resolve in one pass", () => {
    // Dedup. `\va` rides wrapped and canonical, `\vp` loose but byte-exact: the settle MIGRATES
    // `\vp` into its wrapper and reports the owner handled, so nothing re-tokenizes. Both run
    // values are pended, and both map to this one verse — the second must not drive a second
    // settle, which would find nothing left to migrate, report the owner UNhandled, and fall
    // through to a whole-paragraph Tier-2 probe the first settle deliberately avoided.
    //
    // The paragraph deliberately carries no `\p` marker glyph, so such a probe is not a
    // fixed-point refusal: the rebuilt fragment synthesizes the missing glyph, the signature
    // differs, and the splice replaces every node in the paragraph. That is what makes the second
    // settle OBSERVABLE here — node identity, not a log or a counter.
    const { editor } = createBasicTestEnvironment();
    let verse!: VerseNode;
    let vaValue!: TextNode;
    let vpValue!: TextNode;
    let other!: TextNode;
    editor.update(
      () => {
        verse = $createVerseNode(
          "11",
          getVisibleOpenMarkerText("v", "11"),
          undefined,
          "11 va",
          "11 vp",
        );
        const vaWrapper = $createAttributeRunNode("va");
        vaValue = $createTextNode(`${NBSP}11 va`);
        $setState(vaValue, textTypeState, "attribute");
        vaWrapper.append($createMarkerNode("va"), vaValue, $createMarkerNode("va", "closing"));
        // `\vp` loose (no wrapper) but byte-exact — the wrap-migration shape.
        vpValue = $createTextNode(`${NBSP}11 vp`);
        $setState(vpValue, textTypeState, "attribute");
        other = $createTextNode("elsewhere");
        $getRoot().append(
          $createParaNode("p").append(
            $createTextNode(NBSP),
            verse,
            vaWrapper,
            $createMarkerNode("vp"),
            vpValue,
            $createMarkerNode("vp", "closing"),
            $createTextNode(" This verse."),
          ),
          $createParaNode("p").append(other),
        );
        // Caret well away from both runs: nothing is graced, so the settle genuinely acts.
        other.select(0, 0);
      },
      { discrete: true },
    );

    const context = buildContext();
    context.pendingKeys.add(vaValue.getKey());
    context.pendingKeys.add(vpValue.getKey());

    let mutated = false;
    editor.update(
      () => {
        mutated = $resolvePendingMarkers(context);
      },
      { discrete: true },
    );

    expect(mutated).toBe(true); // the migration is a real write
    expect(context.pendingKeys.size).toBe(0); // both piece keys consumed, nothing leaked
    editor.getEditorState().read(() => {
      // No second settle re-probed the paragraph: every node the first settle left in place is
      // still the same node. (Asserted first — a splice detaches these, and reading anything else
      // off a detached reference throws instead of failing an assertion.)
      expect(verse.isAttached()).toBe(true);
      expect(vaValue.isAttached()).toBe(true);
      expect(vpValue.isAttached()).toBe(true);
      // `\vp` migrated into its wrapper — the settle the FIRST key drove.
      const vaWrapper = $verseAttributeRunPieces(verse, "va").wrapper;
      expect($verseAttributeRunPieces(vaWrapper ?? verse, "vp").wrapper).toBeDefined();
      // And the verse's own state was never re-derived from a rebuild.
      expect(verse.getAltnumber()).toBe("11 va");
      expect(verse.getPubnumber()).toBe("11 vp");
    });
  });
});

describe("Tier 1 note-caller leading attribute (map-derived)", () => {
  // The markers map declares `caller` a leading attribute of the note-marker family
  // (`leadingAttributeNames`, shared), so the caller gets the same one-rule treatment as a
  // verse's number: whitespace between the marker and the value is structural and collapses,
  // and the value retags to the typed word. These pins drive the expanded editable caller —
  // collapsed notes render an atomic ImmutableNoteCallerNode this arm can never see.

  /** `\p x` + an expanded (unclosed) `\f + \ft body` note; returns the caller TextNode. */
  async function mountExpandedNote() {
    let note!: NoteNodeClass;
    let callerText!: TextNode;
    const environment = await testEnvironmentExpanded(() => {
      note = $createNoteNode("f", "+", false);
      callerText = $createTextNode(getEditableCallerText("+"));
      const ft = $createCharNode("ft");
      ft.setUnknownAttributes({ closed: "false" });
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createTextNode(NBSP),
          $createTextNode("x "),
          note.append(
            $createMarkerNode("f"),
            callerText,
            ft.append($createMarkerNode("ft"), $createTextNode(`${NBSP}body`)),
          ),
        ),
      );
    });
    return { editor: environment.editor, note, callerText };
  }

  async function typeInCallerText(
    editor: ReturnType<typeof createBasicTestEnvironment>["editor"],
    callerText: TextNode,
    offset: number,
    text: string,
  ) {
    await act(async () =>
      editor.update(() => {
        callerText.select(offset, offset);
        const selection = $getSelection();
        if ($isRangeSelection(selection)) selection.insertText(text);
      }),
    );
  }

  it("an extra space typed next to the caller cannot demote it (whitespace collapses)", async () => {
    const { editor, note, callerText } = await mountExpandedNote();

    // ` |+⍽` → type a space: `\f  +` must still be caller `+` — the extra whitespace is
    // structural and collapses, exactly as `\v  5` is still verse 5.
    await typeInCallerText(editor, callerText, 1, " ");

    editor.getEditorState().read(() => {
      expect(note.getCaller()).toBe("+");
      expect(callerText.getTextContent()).toBe(getEditableCallerText("+"));
    });
    // And nothing leaks into the note's content: the caller text serializes as the caller,
    // never as note text (the pre-arm failure — the reverse adaptor only drops a byte-exact
    // caller, so a diverged one leaked wholesale into content).
    initializeDeserialize(undefined);
    const usj = deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
    const para = usj?.content?.[0];
    const noteUsj = typeof para === "object" ? para.content?.[1] : undefined;
    if (typeof noteUsj !== "object") throw new Error("expected the note in the serialized USJ");
    expect(noteUsj.caller).toBe("+");
    expect(noteUsj.content).toHaveLength(1);
    expect(typeof noteUsj.content?.[0] === "object" ? noteUsj.content[0].marker : undefined).toBe(
      "ft",
    );
  });

  it("retags the caller to the typed word (PT9 GetNextWord: whole word, valid or not)", async () => {
    const { editor, note, callerText } = await mountExpandedNote();

    // ` +|⍽` → type `x`: the caller word becomes `+x`, mirroring `\v 1a` extending the number.
    await typeInCallerText(editor, callerText, 2, "x");

    editor.getEditorState().read(() => {
      expect(note.getCaller()).toBe("+x");
      expect(callerText.getTextContent()).toBe(getEditableCallerText("+x"));
    });
  });

  it("leaves a caller with a deleted flanking separator alone (not whitespace collapse)", async () => {
    // Deleting a flanking separator is separator-deletion territory (the tokenize-identity
    // rule), not whitespace collapse — the arm is scope-guarded to shapes with BOTH flanking
    // whitespace runs present, and everything else keeps today's behavior untouched.
    const { editor, note, callerText } = await mountExpandedNote();

    await act(async () =>
      editor.update(() => {
        callerText.setTextContent(`+${NBSP}`); // leading separator deleted
      }),
    );

    editor.getEditorState().read(() => {
      expect(note.getCaller()).toBe("+");
      expect(callerText.getTextContent()).toBe(`+${NBSP}`);
    });
  });
});
