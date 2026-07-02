import { MarkerEditPlugin } from "./MarkerEditPlugin";
import { initialize as initializeSerialize, reset } from "../adaptors/usj-editor.adaptor";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { $createTextNode, $getRoot } from "lexical";
import {
  $createCharNode,
  $createMarkerNode,
  $createParaNode,
  $createVerseNode,
  CharNode,
  getVisibleOpenMarkerText,
  MarkerNode,
  NBSP,
  VerseNode,
} from "shared";
// Reaching inside only for tests.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { baseTestEnvironment } from "../../../../../libs/shared-react/src/plugins/usj/react-test.utils";
import { getViewOptions, STANDARD_VIEW_MODE } from "shared-react";

/** Mounts a headless editor with `MarkerEditPlugin` active in Standard view (markerMode "editable"). */
export async function testEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />,
  );
}

/**
 * Like `testEnvironment`, but also mounts `HistoryPlugin` so undo/redo commands are
 * available — for tests asserting that a Tier 2 rebuild coalesces into the triggering
 * edit's undo step rather than becoming a separate one.
 */
export async function historyTestEnvironment($initialEditorState: () => void) {
  initializeSerialize(undefined, undefined);
  reset();
  return baseTestEnvironment(
    $initialEditorState,
    <>
      <MarkerEditPlugin viewOptions={getViewOptions(STANDARD_VIEW_MODE)} />
      <HistoryPlugin />
    </>,
  );
}

export function $appendCharPara(): { marker: MarkerNode; char: CharNode; closer: MarkerNode } {
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

export function $appendVersePara(): { verse: VerseNode } {
  const para = $createParaNode("p");
  const verse = $createVerseNode("1", getVisibleOpenMarkerText("v", "1"));
  $getRoot().append(
    para.append(
      $createMarkerNode("p"),
      $createTextNode(NBSP),
      verse,
      $createTextNode("In the beginning"),
    ),
  );
  return { verse };
}
