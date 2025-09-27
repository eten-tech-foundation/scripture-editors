import { BlockFormatDropDown } from "./BlockFormatDropDown";
import { EditorRef, MarginalRef } from "@eten-tech-foundation/platform-editor";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { ListEnd, Redo, Shuffle, Superscript, Undo } from "lucide-react";
import {
  BookChapterControl,
  Button,
  SelectMenuItemHandler,
  TabToolbar,
} from "platform-bible-react";
import { forwardRef, ReactElement, RefObject } from "react";

interface PlatformToolbarProps {
  editorRef: RefObject<MarginalRef | EditorRef | null>;
  scrRef: SerializedVerseRef;
  onScrRefChange: (scrRef: SerializedVerseRef) => void;
  isReadonly?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  blockMarker?: string;
}

const projectMenuData = {
  columns: {
    tools: { label: "Tools", order: 1 },
    clipboard: { label: "Clipboard", order: 2 },
  },
  groups: {
    insertNote: { column: "tools", order: 1 },
    edit: { column: "clipboard", order: 2 },
  },
  items: [
    {
      label: "Insert footnote",
      group: "insertNote",
      order: 1,
      command: "insertNote.footnote",
      localizeNotes: "",
    },
    {
      label: "Insert cross-reference",
      group: "insertNote",
      order: 2,
      command: "insertNote.crossReference",
      localizeNotes: "",
    },
    {
      label: "Insert endnote",
      group: "insertNote",
      order: 3,
      command: "insertNote.endnote",
      localizeNotes: "",
    },
    {
      label: "Cut",
      group: "edit",
      order: 1,
      command: "edit.cut",
      localizeNotes: "",
    },
    {
      label: "Copy",
      group: "edit",
      order: 2,
      command: "edit.copy",
      localizeNotes: "",
    },
    {
      label: "Paste",
      group: "edit",
      order: 3,
      command: "edit.paste",
      localizeNotes: "",
    },
    {
      label: "Paste as plain text",
      group: "edit",
      order: 4,
      command: "edit.pastePlainText",
      localizeNotes: "",
    },
  ],
};

function Divider(): ReactElement {
  return <div className="divider" />;
}

export const PlatformToolbar = forwardRef<HTMLDivElement, PlatformToolbarProps>(
  function PlatformToolbar(
    {
      editorRef,
      scrRef,
      onScrRefChange,
      isReadonly = false,
      canUndo = false,
      canRedo = false,
      blockMarker,
    },
    ref,
  ): ReactElement {
    const handleInsertFootnote = () => {
      editorRef.current?.insertNote("f");
    };

    const handleInsertCrossReference = () => {
      editorRef.current?.insertNote("x");
    };

    const handleInsertEndnote = () => {
      editorRef.current?.insertNote("fe");
    };

    const onSelectProjectMenuItem: SelectMenuItemHandler = (selectedMenuItem) => {
      // console.debug("Project Menu Run command: ", selectedMenuItem);
      if (selectedMenuItem.command === "insertNote.footnote") {
        handleInsertFootnote();
      } else if (selectedMenuItem.command === "insertNote.crossReference") {
        handleInsertCrossReference();
      } else if (selectedMenuItem.command === "insertNote.endnote") {
        handleInsertEndnote();
      } else if (selectedMenuItem.command === "edit.cut") {
        editorRef.current?.cut();
      } else if (selectedMenuItem.command === "edit.copy") {
        editorRef.current?.copy();
      } else if (selectedMenuItem.command === "edit.paste") {
        editorRef.current?.paste();
      } else if (selectedMenuItem.command === "edit.pastePlainText") {
        editorRef.current?.pastePlainText();
      }
    };

    const onSelectViewInfoMenuItem: SelectMenuItemHandler = () => undefined;

    return (
      <TabToolbar
        onSelectProjectMenuItem={onSelectProjectMenuItem}
        onSelectViewInfoMenuItem={onSelectViewInfoMenuItem}
        projectMenuData={projectMenuData}
        className="toolbar"
        startAreaChildren={
          <>
            <div className="tw-flex tw-h-full tw-items-center">
              <BookChapterControl scrRef={scrRef} handleSubmit={onScrRefChange} />
            </div>
            {!isReadonly && (
              <>
                <Button
                  aria-label="Undo"
                  title="Undo"
                  variant="ghost"
                  size="icon"
                  onClick={() => editorRef.current?.undo()}
                  disabled={!canUndo}
                >
                  <Undo />
                </Button>
                <Button
                  aria-label="Redo"
                  title="Redo"
                  variant="ghost"
                  size="icon"
                  onClick={() => editorRef.current?.redo()}
                  disabled={!canRedo}
                >
                  <Redo />
                </Button>
                <BlockFormatDropDown editorRef={editorRef} blockMarker={blockMarker} />
              </>
            )}
            <Button
              aria-label="Insert footnote"
              title="Insert footnote"
              variant="ghost"
              size="icon"
              onClick={handleInsertFootnote}
            >
              <Superscript />
            </Button>
            <Button
              aria-label="Insert cross-reference"
              title="Insert cross-reference"
              variant="ghost"
              size="icon"
              onClick={handleInsertCrossReference}
            >
              <Shuffle />
            </Button>
            <Button
              aria-label="Insert endnote"
              title="Insert endnote"
              variant="ghost"
              size="icon"
              onClick={handleInsertEndnote}
            >
              <ListEnd />
            </Button>
            {ref != null && <Divider />}
            <div ref={ref} className="end-container"></div>
          </>
        }
      />
    );
  },
);
