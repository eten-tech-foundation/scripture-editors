import { MarkerValidationPlugin } from "./MarkerValidationPlugin";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { act, render } from "@testing-library/react";
import { $createTextNode, $getRoot, LexicalEditor } from "lexical";
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

/** The stylesheet from Task 6's test — reused so the semantics under test are already proven. */
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
