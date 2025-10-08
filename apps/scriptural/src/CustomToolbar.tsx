import { useMemo, useState } from "react";

import {
  FormatButton,
  MarkerInfo,
  RedoButton,
  SaveButton,
  ScriptureReferenceInfo,
  ToolbarContainer,
  ToolbarSection,
  UndoButton,
  ViewButton,
  FindReplacePlugin,
  useFindReplace,
} from "@scriptural/react";

import { ImPilcrow } from "react-icons/im";
import {
  MdOutlineUndo,
  MdOutlineRedo,
  MdSave,
  MdViewAgenda,
  MdKeyboardCommandKey,
  MdSearch,
} from "react-icons/md";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ButtonExpandNotes } from "./plugins/ButtonExpandNotes";
import { FindReplaceDialog } from "./components/FindReplaceDialog";
import CustomMarkersToolbar from "./plugins/CustomMarkersToolbar";
import { TriggerKeyDialog } from "./components/TriggerKeyDialog";
import { CustomSaveButton } from "./components/CustomSaveButton";

// Search button component accessing FindReplace context
function SearchButton() {
  const { isVisible, setIsVisible } = useFindReplace();

  return (
    <button
      onClick={() => setIsVisible(!isVisible)}
      title="find and replace"
      className="toolbar-button"
    >
      <MdSearch size={18} />
    </button>
  );
}

// Simplified button to open the trigger key dialog
function TriggerKeyButton({
  triggerKeyCombo,
  onClick,
  className,
}: {
  triggerKeyCombo: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      className={"toolbar-button " + (className ? className : "")}
      onClick={onClick}
      title="Set trigger key combination"
    >
      <MdKeyboardCommandKey size={18} />
      <span style={{ marginLeft: "4px", fontSize: "12px" }}>{triggerKeyCombo}</span>
    </button>
  );
}

export function CustomToolbar({
  onSave,
  hasUnsavedChanges,
}: {
  onSave: any;
  hasUnsavedChanges?: boolean;
}) {
  const [editor] = useLexicalComposerContext();
  const editable = useMemo(() => editor.isEditable(), [editor]);
  const [triggerKeyCombo, setTriggerKeyCombo] = useState("\\");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Define the markers to show in the toolbar
  const markerGroups = {
    ChapterVerse: ["c", "v"],
    Prose: ["p", "m"],
    Poetry: ["q1", "q2"],
    Headings: ["mt", "s", "s2", "s3"],
  };

  const openDialog = () => {
    setIsDialogOpen(true);
  };

  const closeDialog = () => {
    setIsDialogOpen(false);
  };

  return (
    <>
      {/* Trigger key dialog */}
      <TriggerKeyDialog
        isOpen={isDialogOpen}
        onClose={closeDialog}
        currentTrigger={triggerKeyCombo}
        onTriggerChange={setTriggerKeyCombo}
      />

      {/* Use the FindReplacePlugin as a context provider wrapping everything */}
      {editable ? (
        <FindReplacePlugin>
          <div className="flex flex-col">
            <ToolbarContainer>
              <ToolbarSection className="w-full">
                <UndoButton title="undo">
                  <MdOutlineUndo size={20} />
                </UndoButton>
                <RedoButton title="redo">
                  <MdOutlineRedo size={20} />
                </RedoButton>
                <hr />
                <CustomSaveButton
                  onSave={onSave}
                  title="save"
                  hasUnsavedChanges={hasUnsavedChanges}
                >
                  <MdSave size={20} />
                </CustomSaveButton>
                <hr />
                <ViewButton title="toggle block view">
                  <MdViewAgenda size={16} />
                </ViewButton>
                <FormatButton title="toggle markup">
                  <ImPilcrow />
                </FormatButton>

                <ButtonExpandNotes defaultState={false} />
                <hr />
                <TriggerKeyButton
                  triggerKeyCombo={triggerKeyCombo}
                  onClick={openDialog}
                  className="ml-auto"
                />
                <SearchButton />
              </ToolbarSection>

              <CustomMarkersToolbar customMarkers={markerGroups} />
            </ToolbarContainer>
          </div>
          {/* The FindReplaceDialog is also a child of FindReplacePlugin */}
          <FindReplaceDialog />
        </FindReplacePlugin>
      ) : (
        <div className="flex flex-col">
          <ToolbarContainer>
            <ToolbarSection>
              <ViewButton title="toggle block view">
                <MdViewAgenda size={16} />
              </ViewButton>
              <FormatButton title="toggle markup">
                <ImPilcrow />
              </FormatButton>
              <ButtonExpandNotes defaultState={true} />
              <hr />
            </ToolbarSection>
            <ToolbarSection>
              <MarkerInfo />
              <ScriptureReferenceInfo />
            </ToolbarSection>
          </ToolbarContainer>
        </div>
      )}
    </>
  );
}
