import { EditorRef } from "../editor.model";
import DropDown, { DropDownItem } from "./DropDown";
import { MutableRefObject, ReactElement } from "react";

type BlockMarkerToBlockNames = typeof blockMarkerToBlockNames;

const commonBlockMarkerToBlockNames = {
  m: "m - Paragraph - Margin - No First Line Indent",
  ms: "ms - Heading - Major Section Level 1",
  nb: "nb - Paragraph - No Break with Previous Paragraph",
  p: "p - Paragraph - Normal - First Line Indent",
  pi: "pi - Paragraph - Indented - Level 1 - First Line Indent",
  q1: "q1 - Poetry - Indent Level 1",
  q2: "q2 - Poetry - Indent Level 2",
  r: "r - Heading - Parallel References",
  s: "s - Heading - Section Level 1",
  // do not allow `b - Poetry - Stanza Break (Blank Line)` here to avoid a USFM validity issue.
};

// This list is incomplete.
const blockMarkerToBlockNames = {
  ...commonBlockMarkerToBlockNames,
  ide: "ide - File - Encoding",
  h: "h - File - Header",
  h1: "h1 - File - Header",
  h2: "h2 - File - Left Header",
  h3: "h3 - File - Right Header",
  toc1: "toc1 - File - Long Table of Contents Text",
  toc2: "toc2 - File - Short Table of Contents Text",
  toc3: "toc3 - File - Book Abbreviation",
  cl: "cl - Chapter - Publishing Label",
  mt: "mt - Title - Major Title Level 1",
  mt1: "mt1 - Title - Major Title Level 1",
  mt2: "mt2 - Title - Major Title Level 2",
  mt3: "mt3 - Title - Major Title Level 3",
  mt4: "mt4 - Title - Major Title Level 4",
  ms1: "ms1 - Heading - Major Section Level 1",
  ms2: "ms2 - Heading - Major Section Level 2",
  ms3: "ms3 - Heading - Major Section Level 3",
  b: "b - Poetry - Stanza Break (Blank Line)",
};

export function BlockFormatDropDown({
  editorRef,
  blockMarker,
  disabled = false,
}: {
  editorRef: MutableRefObject<EditorRef | null>;
  blockMarker: string | undefined;
  disabled?: boolean;
}): ReactElement {
  return (
    <DropDown
      disabled={disabled}
      buttonClassName="toolbar-item block-controls"
      buttonIconClassName={"icon block-marker " + blockMarkerToClassName(blockMarker)}
      buttonLabel={blockFormatLabel(blockMarker)}
      buttonAriaLabel="Formatting options for block type"
    >
      {Object.keys(commonBlockMarkerToBlockNames).map((itemBlockMarker) => (
        <DropDownItem
          key={itemBlockMarker}
          className={"item block-marker " + dropDownActiveClass(blockMarker === itemBlockMarker)}
          onClick={() => editorRef.current?.formatPara(itemBlockMarker)}
        >
          <i className={"icon block-marker " + itemBlockMarker} />
          <span className={"text usfm_" + itemBlockMarker}>
            {
              commonBlockMarkerToBlockNames[
                itemBlockMarker as keyof typeof commonBlockMarkerToBlockNames
              ]
            }
          </span>
        </DropDownItem>
      ))}
    </DropDown>
  );
}

function blockMarkerToClassName(blockMarker: string | undefined) {
  return blockMarker && blockMarker in blockMarkerToBlockNames ? blockMarker : "ban";
}

function blockFormatLabel(blockMarker: string | undefined) {
  return blockMarker && blockMarker in blockMarkerToBlockNames
    ? blockMarkerToBlockNames[blockMarker as keyof BlockMarkerToBlockNames]
    : "No Style";
}

function dropDownActiveClass(active: boolean) {
  return active ? "active dropdown-item-active" : "";
}
