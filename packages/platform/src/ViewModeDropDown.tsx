import { ReactElement } from "react";
import { viewModeToViewNames, ViewMode } from "shared-react/views/view-mode.model";
import DropDown, { DropDownItem } from "./editor/toolbar/DropDown";

function viewModeToClassName(viewMode: string): string {
  return viewMode in viewModeToViewNames ? viewMode : "";
}

function viewModeLabel(viewMode: string): string {
  return viewMode in viewModeToViewNames ? viewModeToViewNames[viewMode as ViewMode] : "select...";
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
      {Object.keys(viewModeToViewNames).map((itemViewMode) => (
        <DropDownItem
          key={itemViewMode}
          className={"item view-mode " + dropDownActiveClass(viewMode === itemViewMode)}
          onClick={() => handleSelect(itemViewMode)}
        >
          <i className={"icon view-mode " + viewModeToClassName(itemViewMode)} />
          {viewModeToViewNames[itemViewMode as ViewMode]}
        </DropDownItem>
      ))}
    </DropDown>
  );
}
