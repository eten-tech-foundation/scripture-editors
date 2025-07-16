import DropDown, { DropDownItem } from "./editor/toolbar/DropDown";
import { ReactElement } from "react";
import {
  directionToNames,
  type TextDirection,
} from "shared-react/plugins/usj/text-direction.model";

function directionLabel(textDirection: TextDirection): string {
  return textDirection in directionToNames ? directionToNames[textDirection] : "select...";
}

function dropDownActiveClass(active: boolean): string {
  return active ? "active dropdown-item-active" : "";
}

export default function TextDirectionDropDown({
  textDirection,
  handleSelect,
  disabled = false,
}: {
  textDirection: TextDirection;
  handleSelect: (textDirection: TextDirection) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <DropDown
      disabled={disabled}
      buttonClassName="toolbar-item"
      buttonIconClassName={"icon view-mode " + textDirection}
      buttonLabel={directionLabel(textDirection)}
      buttonAriaLabel="Selection options for text direction"
    >
      {Object.keys(directionToNames).map((item) => (
        <DropDownItem
          key={item}
          className={"item view-mode " + dropDownActiveClass(textDirection === item)}
          onClick={() => handleSelect(item as TextDirection)}
        >
          <i className={"icon view-mode " + item} />
          {directionToNames[item as TextDirection]}
        </DropDownItem>
      ))}
    </DropDown>
  );
}
