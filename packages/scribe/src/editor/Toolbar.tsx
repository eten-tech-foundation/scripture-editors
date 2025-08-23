import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useState, useRef, useEffect } from "react";
import { REDO_COMMAND, UNDO_COMMAND } from "lexical";
import { ScriptureReference } from "shared";
import { ViewOptions } from "shared-react";
import "./Toolbar.css";
import { getUsjMarkerAction } from "./adaptors/usj-marker-action.utils";
import useModal from "@/hooks/useModal";
import Button from "@/components/Button";
import { InsertDialog } from "@/components/Input/TextInput";

export const Toolbar = ({
  scrRef,
  viewOptions,
  autoNumbering = false,
}: {
  scrRef: ScriptureReference;
  viewOptions?: ViewOptions;
  autoNumbering?: boolean;
}) => {
  const [modal, showModal] = useModal();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [editor] = useLexicalComposerContext();
  const [isEditable, setIsEditable] = useState(true);

  interface InsertOption {
    title: string;
    marker: string;
    requiresValue: boolean;
    placeholder?: string; // Optional since not all items have it
  }

  const insertOptions: InsertOption[] = [
    {
      title: "Verse",
      marker: "v",
      requiresValue: true,
      placeholder: "Verse Number",
    },
    {
      title: "Chapter",
      marker: "c",
      requiresValue: true,
      placeholder: "Chapter Number",
    },
    {
      title: "Footnote",
      marker: "f",
      requiresValue: true,
    },
    {
      title: "Cross Reference",
      marker: "x",
      requiresValue: true,
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleCopy = () => {
    document.execCommand("copy");
  };

  const handleCut = () => {
    document.execCommand("cut");
  };

  const handlePaste = () => {
    document.execCommand("paste");
  };

  const handleUndo = () => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  };

  const handleRedo = () => {
    editor.dispatchCommand(REDO_COMMAND, undefined);
  };

  const handleInsertOption = (option: InsertOption) => {
    setIsDropdownOpen(false);

    if (option.requiresValue) {
      // For options that need input, show a modal
      showModal(`Insert ${option.title}`, (onClose) => (
        <InsertDialog
          activeEditor={editor}
          onClose={onClose}
          label={option.title}
          placeholder={option.placeholder}
          // Use the same action function that UsjNodesMenuPlugin would use
          insertFunction={(editor, value, noteText) => {
            const markerAction = getUsjMarkerAction(option.marker, undefined, viewOptions);
            if (markerAction && markerAction.action) {
              markerAction.action({
                reference: scrRef,
                editor: editor,
                autoNumbering: autoNumbering,
                newVerseRChapterNum: value ? parseInt(value) : undefined,
                noteText: noteText,
              });
            }
          }}
        />
      ));
    } else {
      // For options that don't need input, insert directly
      const markerAction = getUsjMarkerAction(option.marker, undefined, viewOptions);
      if (markerAction && markerAction.action) {
        markerAction.action({
          reference: scrRef,
          editor: editor,
          autoNumbering: autoNumbering,
        });
      }
    }
  };

  return (
    <div className="scribe-toolbar">
      <div className="scribe-toolbar-group">
        <Button onClick={handleUndo} title="Undo">
          Undo
        </Button>
        <Button onClick={handleRedo} title="Redo">
          Redo
        </Button>
      </div>

      <div className="scribe-toolbar-group">
        <Button onClick={handleCut} title="Cut">
          Cut
        </Button>
        <Button onClick={handleCopy} title="Copy">
          Copy
        </Button>
        <Button onClick={handlePaste} title="Paste">
          Paste
        </Button>
      </div>

      <div className="scribe-toolbar-group" ref={dropdownRef}>
        <Button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={isDropdownOpen ? "scribe-active" : ""}
        >
          Insert ▼
        </Button>

        {isDropdownOpen && (
          <div className="scribe-dropdown">
            {insertOptions.map((option) => (
              <button
                key={option.title}
                className="scribe-dropdown-item"
                onClick={() => handleInsertOption(option)}
              >
                {option.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="scribe-toolbar-group">
        <Button
          onClick={() => {
            const newValue = !isEditable;
            setIsEditable(newValue);
            editor.setEditable(newValue);
          }}
          className={isEditable ? "scribe-status-editable" : "scribe-status-readonly"}
        >
          {isEditable ? "Editable" : "Read Only"}
        </Button>
      </div>

      {modal}
    </div>
  );
};

export default Toolbar;
