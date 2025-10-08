import { ReactNode, useState } from "react";
import { SaveButton } from "@scriptural/react";
import { UsjDocument } from "@scriptural/react/internal-packages/shared/converters/usj/core/usj";
import { UsjNode } from "@scriptural/react/internal-packages/shared/converters/usj/core/usj";

type SaveHandlerType = (usj: UsjDocument | string | UsjNode) => void;

interface CustomSaveButtonProps {
  onSave: SaveHandlerType;
  hasUnsavedChanges?: boolean;
  title?: string;
  children: ReactNode;
}

export function CustomSaveButton({
  onSave,
  hasUnsavedChanges,
  title = "Save",
  children,
}: CustomSaveButtonProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean | null>(null);

  const handleSaveClick = async (usj: UsjDocument | string | UsjNode) => {
    try {
      setIsSaving(true);
      await onSave(usj);
      setSaveSuccess(true);
      // Reset success indicator after 2 seconds
      setTimeout(() => {
        setSaveSuccess(null);
      }, 2000);
    } catch (error) {
      console.error("Error saving document:", error);
      setSaveSuccess(false);
      // Reset error indicator after 2 seconds
      setTimeout(() => {
        setSaveSuccess(null);
      }, 2000);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative inline-block">
      <SaveButton
        onSave={handleSaveClick}
        title={`${title}${hasUnsavedChanges ? " (unsaved changes)" : ""}`}
        disabled={isSaving}
      >
        {children}
      </SaveButton>

      {hasUnsavedChanges && (
        <span
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-500"
          title="Unsaved changes"
        />
      )}

      {isSaving && (
        <span
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-yellow-500 animate-pulse"
          title="Saving..."
        />
      )}

      {saveSuccess === true && (
        <span
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-green-500"
          title="Saved successfully"
        />
      )}

      {saveSuccess === false && (
        <span
          className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-red-700 animate-pulse"
          title="Error saving"
        />
      )}
    </div>
  );
}
