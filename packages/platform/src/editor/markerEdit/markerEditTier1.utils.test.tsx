import {
  $appendCharPara,
  $appendVersePara,
  testEnvironment,
  testEnvironmentWithSheet,
} from "./markerEdit.test-helpers";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  BLUR_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  $createChapterNode,
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  ChapterNode,
  CharNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  NoteNode as NoteNodeClass,
  ParaNode,
  StyleInfo,
  VerseNode,
} from "shared";

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

describe("stylesheet-first kind guards (Phase 4)", () => {
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
      // zln is CHARACTER kind in the sheet: the para must NOT become a "zln" para.
      expect(para.isAttached() ? para.getMarker() : "detached").not.toBe("zln");
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

  it("routes a para-kind marker typed in char position to Tier 2", async () => {
    let parts: ReturnType<typeof $appendCharPara>;
    const { editor } = await testEnvironment(() => (parts = $appendCharPara()));
    await act(async () => editor.update(() => parts.marker.setTextContent("\\q1 ")));
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"q1"'); // re-tokenized into a q1 paragraph
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

  it("removes the chapter node when its marker text is fully deleted (§5.5)", async () => {
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
