import DropDown, { DropDownItem } from "./DropDown";
import { ViewMode, viewModeToViewNames } from "@eten-tech-foundation/platform-editor";
import { ReactElement } from "react";

export const CUSTOM_VIEW_MODE = "custom";
const customViewModeNames = { ...viewModeToViewNames, [CUSTOM_VIEW_MODE]: "Custom" };

function viewModeToClassName(viewMode: string): string {
  return viewMode in customViewModeNames ? viewMode : "";
}

function viewModeLabel(viewMode: string): string {
  return viewMode in customViewModeNames ? customViewModeNames[viewMode as ViewMode] : "select...";
}

function dropDownActiveClass(isActive: boolean): string {
  return isActive ? "active dropdown-item-active" : "";
}

export default function ViewModeDropDown({
  viewMode,
  handleSelect,
  disabled = false,
}: {
  viewMode: string;
  handleSelect: (viewMode: string) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <DropDown
      disabled={disabled}
      buttonClassName="toolbar-item view-controls"
      buttonIconClassName={"icon view-mode " + viewModeToClassName(viewMode)}
      buttonLabel={viewModeLabel(viewMode)}
      buttonAriaLabel="Selection options for view mode"
    >
      {Object.keys(customViewModeNames).map((itemViewMode) => (
        <DropDownItem
          key={itemViewMode}
          className={"item view-mode " + dropDownActiveClass(viewMode === itemViewMode)}
          onClick={() => handleSelect(itemViewMode)}
        >
          <i className={"icon view-mode " + viewModeToClassName(itemViewMode)} />
          {customViewModeNames[itemViewMode as ViewMode]}
        </DropDownItem>
      ))}
    </DropDown>
  );
}
