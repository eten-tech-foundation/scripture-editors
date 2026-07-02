import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { act } from "@testing-library/react";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  KEY_ENTER_COMMAND,
} from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createNoteNode,
  $createParaNode,
  CharNode,
  MarkerNode,
  NBSP,
  NoteNode as NoteNodeClass,
  ParaNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

async function testEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />,
  );
}

function $appendHeadingPara(): { para: ParaNode; marker: MarkerNode } {
  const para = $createParaNode("s1");
  const marker = $createMarkerNode("s1");
  $getRoot().append(para.append(marker, $createTextNode(NBSP), $createTextNode("Heading")));
  return { para, marker };
}

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

function $appendCharPara(): { marker: MarkerNode; char: CharNode; closer: MarkerNode } {
  const para = $createParaNode("p");
  const paraMarker = $createMarkerNode("p");
  const char = $createCharNode("nd");
  const marker = $createMarkerNode("nd");
  const closer = $createMarkerNode("nd", "closing");
  $getRoot().append(
    para.append(
      paraMarker,
      $createTextNode(NBSP),
      char.append(marker, $createTextNode(`${NBSP}Lord`), closer),
    ),
  );
  return { marker, char, closer };
}

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
    // Tokenizer sees `\nd ␣Lord\wj*`: unmatched closer stays literal, span auto-closes.
    const json = JSON.stringify(editor.getEditorState().toJSON());
    expect(json).toContain('"marker":"nd"');
    expect(json).toContain("\\\\wj*");
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
