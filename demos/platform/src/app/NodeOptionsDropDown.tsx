import DropDown, { DropDownItem } from "./DropDown";
import { ReactElement } from "react";

export const CUSTOM_NODES_MODE = "custom";
export const UNDEFINED_NODES_MODE = "undefined";
const nodesModeNames = {
  [CUSTOM_NODES_MODE]: "Custom nodes",
  [UNDEFINED_NODES_MODE]: "undefined nodes",
};
export type NodesMode = keyof typeof nodesModeNames;

export default function NodeOptionsDropDown({
  nodesMode,
  handleSelect,
  disabled = false,
}: {
  nodesMode: NodesMode;
  handleSelect: (nodesMode: NodesMode) => void;
  disabled?: boolean;
}): ReactElement {
  return (
    <DropDown
      disabled={disabled}
      buttonClassName="toolbar-item nodes-controls"
      buttonIconClassName={"icon nodes-mode " + keyToClassName(nodesMode)}
      buttonLabel={keyToLabel(nodesMode)}
      buttonAriaLabel="Selection options for nodes"
    >
      {Object.keys(nodesModeNames).map((itemNodesMode) => (
        <DropDownItem
          key={itemNodesMode}
          className={"item node-options " + dropDownActiveClass(nodesMode === itemNodesMode)}
          onClick={() => handleSelect(itemNodesMode as NodesMode)}
        >
          <i className={"icon node-options " + keyToClassName(itemNodesMode)} />
          {nodesModeNames[itemNodesMode as NodesMode]}
        </DropDownItem>
      ))}
    </DropDown>
  );
}

function keyToClassName(key: string): string {
  return key in nodesModeNames ? key : "";
}

function keyToLabel(key: NodesMode): string {
  return key in nodesModeNames ? nodesModeNames[key] : "select...";
}

function dropDownActiveClass(isActive: boolean): string {
  return isActive ? "active dropdown-item-active" : "";
}
