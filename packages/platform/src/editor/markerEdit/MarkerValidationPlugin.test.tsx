import { computeDirtyParagraphScope, MarkerValidationPlugin } from "./MarkerValidationPlugin";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import { $createTextNode, $getRoot, $isTextNode, LexicalEditor } from "lexical";
import { useEffect } from "react";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  MarkerNode,
  NBSP,
  ParaNode,
  StyleInfo,
  TypedMarkNode,
} from "shared";
import {
  FORMATTED_VIEW_MODE,
  getViewOptions,
  STANDARD_VIEW_MODE,
  usjReactNodes,
} from "shared-react";

/** Narrow away `T | undefined` without a banned non-null assertion. */
function requireDefined<T>(value: T | undefined, message: string): T {
  if (value === undefined) throw new Error(message);
  return value;
}

/** Standard-view options ("editable" marker mode) shared across most scenarios. */
const editableViewOptions = requireDefined(
  getViewOptions(STANDARD_VIEW_MODE),
  "Standard view options are required for these tests.",
);

/** A reused stylesheet, so the semantics under test are already proven elsewhere. */
const sheet: StyleInfo = {
  markers: {
    id: { marker: "id", styleType: "paragraph" },
    c: { marker: "c", styleType: "paragraph", occursUnder: ["id"] },
    p: { marker: "p", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    s1: { marker: "s1", styleType: "paragraph", occursUnder: ["c"], rank: 3 },
    s2: { marker: "s2", styleType: "paragraph", occursUnder: ["c"], rank: 4 },
    v: { marker: "v", styleType: "character", occursUnder: ["p", "q1"] },
    nd: { marker: "nd", styleType: "character", endMarker: "nd*", occursUnder: ["p"] },
    ft: { marker: "ft", styleType: "character", endMarker: "ft*", occursUnder: ["f", "fe"] },
    f: { marker: "f", styleType: "note", endMarker: "f*", occursUnder: ["p"] },
    xq: { marker: "xq", styleType: "character", endMarker: "xq*" },
    free: { marker: "free", styleType: "character", endMarker: "free*" },
  },
};

/** `sheet`, but with `zfoo` added as a known (valid-anywhere) paragraph marker. */
const sheetWithZfoo: StyleInfo = {
  markers: { ...sheet.markers, zfoo: { marker: "zfoo", styleType: "paragraph" } },
};

/** A `\marker` paragraph with a single opener MarkerNode (no char content needed). */
function $appendPara(marker: string): { para: ParaNode; opener: MarkerNode } {
  const para = $createParaNode(marker);
  const opener = $createMarkerNode(marker);
  $getRoot().append(para.append(opener, $createTextNode(NBSP)));
  return { para, opener };
}

/**
 * A minimal harness supporting prop-change re-rendering (`baseTestEnvironment` mounts once and
 * exposes no `rerender`). Mirrors `react-test.utils.tsx`'s `baseTestEnvironment` App shape.
 */
function Harness({
  $initialEditorState,
  viewOptions,
  styleInfo,
  onEditor,
}: {
  $initialEditorState: () => void;
  viewOptions: typeof editableViewOptions;
  styleInfo: StyleInfo;
  onEditor: (editor: LexicalEditor) => void;
}) {
  function GrabEditor() {
    const [composerEditor] = useLexicalComposerContext();
    useEffect(() => onEditor(composerEditor), [composerEditor]);
    return null;
  }

  const initialConfig: InitialConfigType = {
    editorState: $initialEditorState,
    namespace: "MarkerValidationHarness",
    nodes: [TypedMarkNode, ...usjReactNodes],
    onError: (error) => {
      throw error;
    },
    theme: {},
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <GrabEditor />
      <RichTextPlugin
        contentEditable={<ContentEditable />}
        placeholder={null}
        ErrorBoundary={LexicalErrorBoundary}
      />
      <MarkerValidationPlugin viewOptions={viewOptions} styleInfo={styleInfo} />
    </LexicalComposer>
  );
}

describe("MarkerValidationPlugin", () => {
  it("scenario 1 (load coverage): an unknown para glyph is decorated after the initial mount pass, with no edit", async () => {
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        ({ opener } = $appendPara("zfoo"));
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_unknown")).toBe(
        true,
      );
    });
  });

  it("scenario 2 (edit revalidation): renaming the para marker to a valid one clears status_unknown", async () => {
    let para: ParaNode;
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        ({ para, opener } = $appendPara("zfoo"));
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_unknown")).toBe(
        true,
      );
    });

    await act(async () => {
      editor.update(() => {
        para.setMarker("p");
      });
    });

    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_unknown")).toBe(
        false,
      );
    });
  });

  it("scenario 3 (invalid decoration): a `\\ft` char span in a `p` para flags opener AND closer status_invalid", async () => {
    let opener: MarkerNode;
    let closer: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        const para = $createParaNode("p");
        const ft = $createCharNode("ft");
        opener = $createMarkerNode("ft");
        closer = $createMarkerNode("ft", "closing");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            ft.append(opener, $createTextNode(`${NBSP}text`), closer),
          ),
        );
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_invalid")).toBe(
        true,
      );
      expect(editor.getElementByKey(closer.getKey())?.classList.contains("status_invalid")).toBe(
        true,
      );
    });
  });

  it("scenario 4 (styleInfo prop change): re-rendering with a sheet where `zfoo` is a paragraph clears status_unknown without any editor update", async () => {
    let opener: MarkerNode;
    let capturedEditor: LexicalEditor | undefined;
    const $initialEditorState = () => {
      ({ opener } = $appendPara("zfoo"));
    };

    let view: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <Harness
          $initialEditorState={$initialEditorState}
          viewOptions={editableViewOptions}
          styleInfo={sheet}
          onEditor={(e) => {
            capturedEditor = e;
          }}
        />,
      );
    });
    const editor = requireDefined(capturedEditor, "editor should be captured on mount");
    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_unknown")).toBe(
        true,
      );
    });

    await act(async () => {
      view.rerender(
        <Harness
          $initialEditorState={$initialEditorState}
          viewOptions={editableViewOptions}
          styleInfo={sheetWithZfoo}
          onEditor={(e) => {
            capturedEditor = e;
          }}
        />,
      );
    });

    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(opener.getKey())?.classList.contains("status_unknown")).toBe(
        false,
      );
    });
  });

  it("scenario 6 (non-visual signal): an unknown glyph is DESCRIBED as unknown, and clearing the flag removes the description", async () => {
    let para: ParaNode;
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        ({ para, opener } = $appendPara("zfoo"));
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      const flagged = requireDefined(
        editor.getElementByKey(opener.getKey()) ?? undefined,
        "the unknown glyph should be rendered",
      );
      // Both channels, because neither alone reaches every reader: `title` is the hover
      // explanation, `aria-description` the announced one.
      expect(flagged.getAttribute("aria-description")).toBe(
        "This marker is not in the stylesheet!",
      );
      expect(flagged.title).toBe("This marker is not in the stylesheet!");
    });

    await act(async () => {
      editor.update(() => {
        para.setMarker("p");
      });
    });

    editor.getEditorState().read(() => {
      const unflagged = requireDefined(
        editor.getElementByKey(opener.getKey()) ?? undefined,
        "the glyph should still be rendered after the rename",
      );
      expect(unflagged.classList.contains("status_unknown")).toBe(false);
      expect(unflagged.getAttribute("aria-description")).toBeNull();
      expect(unflagged.title).toBe("");
    });
  });

  it("scenario 7 (non-visual signal): an invalid-here glyph is described as invalid, not as unknown", async () => {
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        const para = $createParaNode("p");
        const ft = $createCharNode("ft");
        opener = $createMarkerNode("ft");
        $getRoot().append(
          para.append(
            $createMarkerNode("p"),
            $createTextNode(NBSP),
            ft.append(opener, $createTextNode(`${NBSP}text`), $createMarkerNode("ft", "closing")),
          ),
        );
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      const flagged = requireDefined(
        editor.getElementByKey(opener.getKey()) ?? undefined,
        "the invalid glyph should be rendered",
      );
      expect(flagged.getAttribute("aria-description")).toBe("This marker is not valid here!");
      expect(flagged.title).toBe("This marker is not valid here!");
    });
  });

  it("scenario 5 (gating): non-editable markerMode never applies status classes", async () => {
    const nonEditableViewOptions = requireDefined(
      getViewOptions(FORMATTED_VIEW_MODE),
      "Formatted view options are required for this test.",
    );
    let opener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        ({ opener } = $appendPara("zfoo"));
      },
      <MarkerValidationPlugin viewOptions={nonEditableViewOptions} styleInfo={sheet} />,
    );
    editor.getEditorState().read(() => {
      const classList = editor.getElementByKey(opener.getKey())?.classList;
      expect(classList?.contains("status_unknown")).toBe(false);
      expect(classList?.contains("status_invalid")).toBe(false);
    });
  });
});

/**
 * The scope gate reads the commit's state pair, not the root's dirty flag. Lexical marks the root
 * intentionally dirty on every commit that changes anything, so a flag-based gate degrades to a
 * full-document walk on every keystroke — silently, since both paths produce the same decorations.
 * These pin the gate's ANSWER directly, which is the only place the difference is observable.
 */
describe("computeDirtyParagraphScope", () => {
  /** Commits `$mutate`, then returns the scope the listener computed for that commit. */
  async function scopeForCommit(
    $initialEditorState: () => void,
    $mutate: () => void,
  ): Promise<Set<string> | undefined> {
    const { editor } = await baseTestEnvironment($initialEditorState, null);
    let scope: Set<string> | undefined;
    let captured = false;
    const unregister = editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        scope = computeDirtyParagraphScope(
          editorState,
          prevEditorState,
          dirtyElements,
          dirtyLeaves,
        );
        captured = true;
      },
    );
    await act(async () => {
      editor.update($mutate);
    });
    unregister();
    expect(captured).toBe(true);
    return scope;
  }

  it("scopes a leaf edit to the one paragraph that changed", async () => {
    let first: ParaNode;
    let firstKey = "";
    let secondKey = "";
    const scope = await scopeForCommit(
      () => {
        ({ para: first } = $appendPara("p"));
        firstKey = first.getKey();
        secondKey = $appendPara("p").para.getKey();
      },
      () => {
        const text = first.getLastChild();
        if (!$isTextNode(text)) throw new Error("expected the paragraph's text node");
        text.setTextContent(`${NBSP}typed`);
      },
    );

    expect([...requireDefined(scope, "a leaf edit must scope")]).toEqual([firstKey]);
    expect(scope?.has(secondKey)).toBe(false);
  });

  it("falls back to an unscoped pass when a paragraph is added", async () => {
    const scope = await scopeForCommit(
      () => {
        $appendPara("p");
      },
      () => {
        $appendPara("s1");
      },
    );

    // A new root child shifts the paragraph-stack context of everything after it.
    expect(scope).toBeUndefined();
  });

  it("falls back to an unscoped pass when a paragraph is removed", async () => {
    let second: ParaNode;
    const scope = await scopeForCommit(
      () => {
        $appendPara("p");
        ({ para: second } = $appendPara("s1"));
      },
      () => {
        second.remove();
      },
    );

    expect(scope).toBeUndefined();
  });
});

describe("MarkerValidationPlugin scoped-pass carry-forward", () => {
  // A scoped pass still validates EVERY paragraph's own marker — only the inline descent is
  // scoped — so a paragraph that just became valid is absent from the fresh result rather than
  // cleared in it. Carrying paragraph-level flags forward would re-add the verdict the pass just
  // dropped, leaving a red underline on a marker that is now legal.
  it("clears a paragraph flag that a change to ANOTHER paragraph made valid", async () => {
    let idPara: ParaNode;
    let pOpener: MarkerNode;
    const { editor } = await baseTestEnvironment(
      () => {
        ({ para: idPara } = $appendPara("id"));
        ({ opener: pOpener } = $appendPara("p"));
      },
      <MarkerValidationPlugin viewOptions={editableViewOptions} styleInfo={sheet} />,
    );

    // `p` occursUnder `c`, and only `id` precedes it, so it starts invalid.
    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(pOpener.getKey())?.classList.contains("status_invalid")).toBe(
        true,
      );
    });

    // Retag the FIRST paragraph to `c`, which puts `c` on the stack and makes the `p` legal. The
    // root's children do not move, so this commit takes the scoped path — and the only dirty
    // paragraph is the one that changed, not the `p` whose verdict it flipped.
    await act(async () => {
      editor.update(() => {
        idPara.setMarker("c");
      });
    });

    editor.getEditorState().read(() => {
      expect(editor.getElementByKey(pOpener.getKey())?.classList.contains("status_invalid")).toBe(
        false,
      );
    });
  });
});
