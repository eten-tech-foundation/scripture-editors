import {
  $resolvePendingMarkers,
  $settlePendedDisplayOwner,
  MarkerEditContext,
} from "./markerEditTier1.utils";
import {
  $appendCharPara,
  $appendVersePara,
  testEnvironment,
  testEnvironmentWithSheet,
  viewOptions,
} from "./markerEdit.test-helpers";
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
    await act(async () => editor.update(() => marker.setTextContent("\\zln ")));
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
    await act(async () => editor.update(() => marker.setTextContent("\\zln ")));
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
    await act(async () => editor.update(() => marker.setTextContent("\\zzz ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zzz"));
  });
});

describe("Tier 1 paragraph-marker rename", () => {
  it("renames the paragraph when marker text is retyped and space-terminated", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2 ")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s2");
      expect(marker.getMarker()).toBe("s2");
      expect(marker.getTextContent()).toBe("\\s2"); // terminator absorbed
    });
  });

  it("accepts a syntactically complete unknown marker as typed (PT9 behavior)", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\zed ")));
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("zed"));
  });

  it("leaves unterminated mid-edit text alone", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
    editor.getEditorState().read(() => {
      expect(para.getMarker()).toBe("s1"); // untouched mid-edit
      expect(marker.getTextContent()).toBe("\\s2");
    });
  });

  it("completes a pending marker on Enter", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
    await act(async () => {
      editor.dispatchCommand(KEY_ENTER_COMMAND, null);
    });
    editor.getEditorState().read(() => expect(para.getMarker()).toBe("s2"));
  });

  it("completes a pending marker on blur", async () => {
    let para: ParaNode, marker: MarkerNode;
    const { editor } = await testEnvironment(() => ({ para, marker } = $appendHeadingPara()));
    await act(async () => editor.update(() => marker.setTextContent("\\s2")));
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
    await act(async () => editor.update(() => marker.setTextContent("\\add ")));
    editor.getEditorState().read(() => {
      // Tier 2 wrapped the heading text in a char span inside a default para
      const paras = $getRoot().getChildren();
      expect(JSON.stringify(editor.getEditorState().toJSON())).toContain('"marker":"add"');
      expect(paras.some((p) => p.getType() === "para")).toBe(true);
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
    await act(async () => editor.update(() => parts.marker.setTextContent("\\wj ")));
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

  it("routes a closer mismatch edit to Tier 2 (span rebuilt by the tokenizer)", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.closer.setTextContent("\\wj*")));
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
    await act(async () => editor.update(() => opener.setTextContent("\\x ")));
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
    await act(async () => editor.update(() => parts.marker.setTextContent("\\+w ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"type":"unmatched"');
    expect(json).toContain('"marker":"nd*"');
  });

  it("routes a para-kind marker typed in char position to Tier 2", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.setTextContent("\\q1 ")));
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

describe("Tier 1 char opener rename on a collab-flattened nested span", () => {
  it("renames the OUTER closer on a collab-flattened nested span", async () => {
    let parts: ReturnType<typeof $appendNestedCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendNestedCharPara()));
    await act(async () => editor.update(() => parts.outerOpener.setTextContent("\\bd ")));
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
    await act(async () => editor.update(() => parts.innerOpener.setTextContent("\\wj ")));
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
    // (gated on a known anchor) can't sweep it first — it survives to the blur.
    await act(async () =>
      editor.update(() => {
        second.setTextContent("\\s2");
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
    // removed as a side effect, and the OWNER's own policy (milestoneRunEntirelyAbsent, since
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
    // "clears altnumber on caret departure after the whole \va triplet is deleted").
    expect(result.handled).toBe(false);
    editor.getEditorState().read(() => {
      // \vp still migrated into its wrapper — a real mutation performed before falling through.
      const { wrapper } = $verseAttributeRunPieces(verse, "vp");
      expect(wrapper).toBeDefined();
      expect(wrapper?.getChildrenSize()).toBe(3);
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
