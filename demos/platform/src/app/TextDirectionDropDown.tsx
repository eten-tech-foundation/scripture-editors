import DropDown, { DropDownItem } from "./DropDown";
import { directionToNames, TextDirection } from "@eten-tech-foundation/platform-editor";
import { ReactElement } from "react";

function directionLabel(textDirection: TextDirection): string {
  return textDirection in directionToNames ? directionToNames[textDirection] : "select...";
}

function dropDownActiveClass(active: boolean): string {
  return active ? "active dropdown-item-active" : "";
}

export default function TextDirectionDropDown({
  textDirection,
  onSelect,
  disabled = false,
}: {
  textDirection: TextDirection;
  onSelect: (textDirection: TextDirection) => void;
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
          onClick={() => onSelect(item as TextDirection)}
        >
          <i className={"icon view-mode " + item} />
          {directionToNames[item as TextDirection]}
        </DropDownItem>
      ))}
    </DropDown>
  );
}
