import { ReactElement, ReactNode, useCallback, useMemo, useRef, useEffect } from "react";
import { LexicalEditor, REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";

import { useScripturalComposerContext } from "../../context/ScripturalEditorContext";
import { ScripturalBaseSettings, useBaseSettings } from "../BaseSettingsPlugin";
import {
  getMarker,
  getChildrenMarkers,
  getMarkersAlike,
  getScripturalMarkerAction,
} from "../../utils";
import { serializedLexicalToUsjNode } from "shared/converters/usj";
import { useSaveStateOptional } from "../../context/SaveStateContext";

export function ToolbarContainer({
  children,
  className,
  ...props
}: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={"toolbar noprint " + className} {...props}>
      {children}
    </div>
  );
}

export default function ToolbarButton({
  onClick,
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>, editor: LexicalEditor) => void;
}) {
  const [editor] = useLexicalComposerContext();

  return (
    <button onClick={(e) => (onClick ? onClick(e, editor) : undefined)} {...props}>
      {children}
    </button>
  );
}

export function ToolbarSection({
  children,
  className,
  ...props
}: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={"toolbar-section " + (className ? className : "")} {...props}>
      {children}
    </div>
  );
}

export function ToolbarDefault({ onSave }: { onSave?: ScripturalBaseSettings["onSave"] }) {
  return (
    <ToolbarContainer>
      <ToolbarSection>
        <UndoButton title="undo">
          <i>undo</i>
        </UndoButton>
        <RedoButton>
          <i>redo</i>
        </RedoButton>
        <hr />
        <SaveButton onSave={onSave}>
          <i>download</i>
        </SaveButton>
        <hr />
        <ViewButton title="toggle block view">
          <i>block view</i>
        </ViewButton>
        <FormatButton title="toggle markup">
          <i>markup</i>
        </FormatButton>
        <EnhancedCursorToggleButton title="toggle enhanced cursor">
          <i>cursor</i>
        </EnhancedCursorToggleButton>
        <hr />
      </ToolbarSection>
      <ToolbarSection>
        <ContextMenuTriggerButton title="set context menu trigger">
          <i>set context menu trigger</i>
        </ContextMenuTriggerButton>
        <MarkerInfo />
        <ScriptureReferenceInfo />
        <hr />
      </ToolbarSection>
    </ToolbarContainer>
  );
}

export function UndoButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ToolbarButton
      onClick={(_, editor) => editor.dispatchCommand(UNDO_COMMAND, undefined)}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function RedoButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <ToolbarButton
      onClick={(_, editor) => editor.dispatchCommand(REDO_COMMAND, undefined)}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function SaveButton({
  children,
  onSave,
  showUnsavedIndicator = true,
  ...props
}: {
  children: ReactNode;
  onSave?: ScripturalBaseSettings["onSave"];
  showUnsavedIndicator?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [editor] = useLexicalComposerContext();
  const saveState = useSaveStateOptional();

  const getCurrentUsj = useCallback(() => {
    const serializedEditorState = editor.getEditorState().toJSON();
    const { result: usj } = serializedLexicalToUsjNode(serializedEditorState.root);
    return usj;
  }, [editor]);

  const handleSave = useCallback(async () => {
    const usj = getCurrentUsj();
    if (!usj) return;

    try {
      // Call the onSave callback
      await onSave?.(usj);

      // Mark as saved in the save state context
      saveState?.markAsSaved(usj);
    } catch (error) {
      console.error("Error in SaveButton:", error);
      throw error; // Re-throw so consumer can handle it
    }
  }, [onSave, getCurrentUsj, saveState]);

  const hasUnsavedChanges = saveState?.hasUnsavedChanges ?? false;

  return (
    <ToolbarButton
      onClick={handleSave}
      className={hasUnsavedChanges && showUnsavedIndicator ? "has-unsaved-changes" : ""}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function ViewButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { editorRef } = useScripturalComposerContext();
  const { toggleClass } = useBaseSettings();
  return (
    <ToolbarButton
      onClick={(e) => {
        toggleClass(editorRef.current, "verse-blocks");
        toggleClass(e.currentTarget, "active");
      }}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function FormatButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { editorRef } = useScripturalComposerContext();
  const { toggleClass } = useBaseSettings();
  return (
    <ToolbarButton
      className="active"
      onClick={(e) => {
        toggleClass(editorRef.current, "with-markers");
        toggleClass(e.currentTarget, "active");
      }}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function EnhancedCursorToggleButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { enhancedCursorPosition, toggleEnhancedCursorPosition } = useBaseSettings();
  return (
    <ToolbarButton
      className={enhancedCursorPosition ? "active" : undefined}
      onClick={toggleEnhancedCursorPosition}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function ContextMenuTriggerButton({
  children,
  ...props
}: { children: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { updateContextMenuTriggerKey, contextMenuTriggerKey } = useBaseSettings();
  const isListeningRef = useRef(false);

  const handleKeyPress = useCallback(
    (event: KeyboardEvent) => {
      event.preventDefault();
      updateContextMenuTriggerKey(event.key);
      isListeningRef.current = false;
      document.removeEventListener("keydown", handleKeyPress);
      window.removeEventListener("click", cancelListening);
    },
    [updateContextMenuTriggerKey],
  );

  const cancelListening = useCallback(() => {
    if (isListeningRef.current) {
      document.removeEventListener("keydown", handleKeyPress);
      isListeningRef.current = false;
    }
  }, [handleKeyPress]);

  const handleButtonClick = useCallback(
    (e: React.MouseEvent) => {
      // Prevent the click event from bubbling up to window
      e.stopPropagation();

      if (isListeningRef.current) {
        cancelListening();
      } else {
        isListeningRef.current = true;
        document.addEventListener("keydown", handleKeyPress);
        // Add click listener on next tick to avoid the current click
        setTimeout(() => {
          window.addEventListener("click", cancelListening, { once: true });
        }, 0);
      }
    },
    [handleKeyPress, cancelListening],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelListening();
    };
  }, [cancelListening]);
  return (
    <ToolbarButton onClick={handleButtonClick} {...props}>
      {children}: {contextMenuTriggerKey}
    </ToolbarButton>
  );
}

export function ToolbarInfoElement({
  info,
  ...props
}: { info: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className="info" {...props}>
      {info}
    </span>
  );
}

export function MarkerInfo() {
  const { selectedMarker } = useScripturalComposerContext();
  return <ToolbarInfoElement info={selectedMarker ? selectedMarker : "•"} />;
}

export function ScriptureReferenceInfo() {
  const { scriptureReference } = useScripturalComposerContext();
  return (
    <ToolbarInfoElement
      info={
        scriptureReference?.book +
        " " +
        (scriptureReference ? `${scriptureReference?.chapter}:${scriptureReference?.verse}` : "")
      }
    />
  );
}

export function ToolbarMarkerSections() {
  const { selectedMarker, scriptureReference } = useScripturalComposerContext();

  const toolbarMarkerSections = useMemo(() => {
    if (!selectedMarker || !scriptureReference) return null;
    const marker = getMarker(selectedMarker);
    const markerChildren = getChildrenMarkers(selectedMarker);
    const markerAlike = getMarkersAlike(selectedMarker);

    if (!markerChildren || !marker) return null;

    return [...markerChildren, ...(markerAlike || [])].reduce<{
      [key: string]: {
        label: string | ReactElement;
        action: (editor: LexicalEditor) => void;
        description: string;
      }[];
    }>((items, marker) => {
      if (["it", "bd", "bd-it"].includes(marker)) {
        const markerData = getMarker(marker);
        if (!markerData) return items;
        const { action } = getScripturalMarkerAction(marker, markerData);
        items["CharacterStyling"] = items["CharacterStyling"] || [];
        items["CharacterStyling"].push({
          label: marker,
          description: markerData?.description ?? "",
          action: (editor: LexicalEditor) => action({ editor, reference: scriptureReference }),
        });
      }
      return items;
    }, {});
  }, [selectedMarker, scriptureReference]);
  return (
    <>
      {toolbarMarkerSections &&
        Object.entries(toolbarMarkerSections).map(([sectionName, items]) => {
          return (
            <div key={"toolbar-" + sectionName} className={"toolbar-section"}>
              {items.map((item) => (
                <ToolbarButton
                  key={`${item.label}-toolbar`}
                  className={`${sectionName}`}
                  onClick={(_, editor) => item.action(editor)}
                  data-marker={item.label}
                  title={item.description}
                >
                  {item.label}
                </ToolbarButton>
              ))}
            </div>
          );
        })}
    </>
  );
}
