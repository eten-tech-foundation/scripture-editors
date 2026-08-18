/**
 * Pins the trailing-space machinery's one legitimate job: a space the SOURCE FILE had survives
 * every non-user code path — a Tier-2 rebuild, a remote collab apply, and a paste. The USJ-to-USFM
 * writer inserts no separators between content items, so word separation lives entirely inside the
 * USJ text strings and losing one of these spaces is real data loss on disk.
 *
 * Nothing pinned this before the transform's other jobs (fabricating spaces the file never had,
 * deleting lone spaces) were removed, and the transform itself cannot tell a preserved space from
 * a fabricated one — no code path knows whether a space was in the source. These tests are the
 * regression net that proves preservation does not depend on fabrication: they mount the full
 * transform-registering plugin set and drive each machine path over source content whose spaces
 * are load-bearing.
 *
 * The paste and remote-apply legs double as the provenance probe: preservation needs no
 * paste-provenance tag while the transform neither fabricates nor deletes — there is nothing left
 * to gate. If either job ever returns behind a provenance check, these pins are the first thing
 * that should go red.
 *
 * The remote legs SIMULATE the apply — a DELTA_CHANGE_TAG-tagged discrete update mutating nodes
 * directly — rather than routing ops through `$applyUpdate`: in Standard view, `getEditorDelta`
 * emits document-space coordinates (display bytes excluded) while `$applyUpdate`'s retain
 * traversal walks display space (para-marker prefixes, editable verse nodes, and char-span glyph
 * bytes all count differently), so a retain computed from the document's own delta lands offset
 * from its target. That divergence is Invariant II's exact complaint and belongs to the
 * coordinates track; these pins are about what the TRANSFORMS do to remote content once it lands,
 * which the tag plus a direct mutation reproduces faithfully.
 */

import { serializedState, viewOptions } from "./markerEdit.test-helpers";
import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { $rebuildParas, Tier2Context } from "./tier2Rebuild.utils";
import {
  deserializeSerializedEditorState,
  initialize as initializeDeserialize,
} from "../adaptors/editor-usj.adaptor";
import { Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { act } from "@testing-library/react";
import {
  $addUpdateTag,
  $createTextNode,
  $getRoot,
  $isTextNode,
  LexicalEditor,
  PASTE_COMMAND,
} from "lexical";
import {
  $createMarkerNode,
  $createMarkerTrailingSeparator,
  $createParaNode,
  $isParaNode,
  DELTA_CHANGE_TAG,
  getMarker as bundledGetMarker,
  ParaNode,
} from "shared";
import { CharNodePlugin, TextSpacingPlugin } from "shared-react";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import {
  baseTestEnvironment,
  updateSelection,
} from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";

const tier2Context: Tier2Context = { viewOptions, getMarker: bundledGetMarker };

/**
 * One paragraph whose source spaces are all load-bearing under writer rule 1 — a trailing space
 * before a char span, a space-bearing run between the span and a verse — plus an empty trailing
 * paragraph for the space-only paste case.
 */
const SOURCE_USX =
  `<usx version="3.0"><book code="RUT" style="id">T</book><chapter number="1" style="c" />` +
  `<para style="p"><verse number="1" style="v" />In the beginning <char style="nd">Lord</char>` +
  ` spoke <verse number="2" style="v" />rest.</para><para style="p" /></usx>`;

/** Mount the transform-registering plugin set (the same trio the corpus suites mount) over a
 * fixture. */
async function mountUsx(usx: string): Promise<{ editor: LexicalEditor; usj: Usj }> {
  const usj = usxStringToUsj(usx);
  const { editor } = await baseTestEnvironment(
    serializedState(usj),
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
    </>,
  );
  return { editor, usj };
}

/** Mount the same plugin trio over the bare-paragraph collab fixture (see the header note):
 * `\p Alpha beta` followed by an empty `\p`. */
async function mountCollabParas(): Promise<{ editor: LexicalEditor }> {
  const { editor } = await baseTestEnvironment(
    () => {
      $getRoot().append(
        $createParaNode("p").append(
          $createMarkerNode("p"),
          $createMarkerTrailingSeparator(),
          $createTextNode("Alpha beta"),
        ),
        $createParaNode("p").append($createMarkerNode("p"), $createMarkerTrailingSeparator()),
      );
    },
    <>
      <CharNodePlugin />
      <MarkerEditPlugin viewOptions={viewOptions} />
      <TextSpacingPlugin />
    </>,
  );
  return { editor };
}

function currentUsj(editor: LexicalEditor) {
  initializeDeserialize(undefined);
  return deserializeSerializedEditorState(editor.getEditorState().toJSON(), viewOptions);
}

function $contentParas(): ParaNode[] {
  return $getRoot().getChildren().filter($isParaNode);
}

function pasteEvent(plain: string): ClipboardEvent {
  return {
    clipboardData: { getData: (type: string) => (type === "text/plain" ? plain : "") },
    preventDefault: vi.fn(),
  } as unknown as ClipboardEvent;
}

/** Run `$mutate` the way a remote collab apply runs: one discrete update carrying
 * DELTA_CHANGE_TAG. */
async function applyRemote(editor: LexicalEditor, $mutate: () => void) {
  await act(async () => {
    editor.update(
      () => {
        $addUpdateTag(DELTA_CHANGE_TAG);
        $mutate();
      },
      { discrete: true },
    );
  });
}

describe("source whitespace preservation (rebuild / collab apply / paste)", () => {
  it("keeps every source space through a Tier-2 rebuild of the paragraph", async () => {
    const { editor, usj } = await mountUsx(SOURCE_USX);
    let changed = true;
    await act(async () => {
      editor.update(
        () => {
          changed = $rebuildParas([$contentParas()[0]], tier2Context);
        },
        { discrete: true },
      );
    });
    // An unedited rebuild refuses as a fixed point, and nothing — rebuild or the transforms it
    // dirtied — moved a byte.
    expect(changed).toBe(false);
    expect(currentUsj(editor)).toEqual(usj);
  });

  it("keeps a transmitted trailing space through a remote apply", async () => {
    const { editor } = await mountCollabParas();
    await applyRemote(editor, () => {
      const run = $getRoot()
        .getAllTextNodes()
        .find((node) => node.getTextContent() === "Alpha beta");
      if (!run) throw new Error("collab fixture text run not found");
      run.spliceText("Alpha ".length, 0, "mid ");
    });
    const usj = currentUsj(editor);
    const para = usj?.content?.[0];
    // The transmitted "mid " keeps its own trailing space, and the source's space is untouched —
    // not collapsed, not doubled.
    expect(typeof para === "object" && para.content).toEqual(["Alpha mid beta"]);
  });

  it("keeps a space-only remote insert into an empty paragraph", async () => {
    const { editor } = await mountCollabParas();
    await applyRemote(editor, () => {
      $getRoot().getChildren().filter($isParaNode)[1].append($createTextNode(" "));
    });
    const usj = currentUsj(editor);
    // The collaborator's space is document content; healing it away would silently fork the
    // two replicas.
    expect(usj?.content?.[1]).toEqual({ type: "para", marker: "p", content: [" "] });
  });

  it("keeps a pasted run's trailing space", async () => {
    const { editor } = await mountUsx(SOURCE_USX);
    let target: import("lexical").LexicalNode | undefined;
    editor.getEditorState().read(() => {
      target = $contentParas()[0]
        .getChildren()
        .find((node) => $isTextNode(node) && node.getTextContent() === "In the beginning ");
    });
    if (!target) throw new Error("source text run not found");
    updateSelection(editor, target, "In the beginning ".length);
    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, pasteEvent("middle words "));
    });
    const usj = currentUsj(editor);
    const para = usj?.content?.[2];
    expect(typeof para === "object" && para.content?.[1]).toBe("In the beginning middle words ");
  });

  it("keeps a pasted lone space in an empty paragraph", async () => {
    const { editor } = await mountUsx(SOURCE_USX);
    await act(async () => {
      editor.update(() => {
        $contentParas()[1].selectEnd();
      });
    });
    await act(async () => {
      editor.dispatchCommand(PASTE_COMMAND, pasteEvent(" "));
    });
    const usj = currentUsj(editor);
    expect(usj?.content?.[3]).toEqual({ type: "para", marker: "p", content: [" "] });
  });
});
