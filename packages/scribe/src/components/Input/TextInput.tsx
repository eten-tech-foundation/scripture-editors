import "./Input.css";
import { LexicalEditor } from "lexical";
import React, { ReactNode, useEffect, useState } from "react";

interface TextInputProps {
  "data-test-id"?: string;
  label: string;
  onChange: (val: string) => void;
  placeholder?: string;
  value: string;
  type?: React.HTMLInputTypeAttribute;
}

const TextInput: React.FC<TextInputProps> = ({
  label,
  value,
  onChange,
  placeholder = "",
  "data-test-id": dataTestId,
  type = "text",
}) => (
  <div className="scribe-input-wrapper">
    <label className="scribe-input-label">{label}</label>
    <input
      type={type}
      className="scribe-input-field"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-test-id={dataTestId}
    />
  </div>
);

interface InsertDialogProps {
  activeEditor: LexicalEditor;
  onClose: () => void;
  insertFunction: (editor: LexicalEditor, value?: string, noteText?: string) => void;
  label: string;
  placeholder?: string;
}

export const InsertDialog: React.FC<InsertDialogProps> = ({
  activeEditor,
  onClose,
  insertFunction,
  label,
  placeholder,
}) => {
  const [inputValue, setInputValue] = useState("");
  const [isDisabled, setIsDisabled] = useState(true);

  useEffect(() => {
    setIsDisabled(inputValue.trim() === "");
  }, [inputValue]);

  const handleInsert = () => {
    if (label === "Footnote" || label === "Crossref") {
      insertFunction(activeEditor, undefined, inputValue); // noteText as third param
    } else {
      insertFunction(activeEditor, inputValue); // Regular value
    }
    setInputValue("");
    onClose();
  };

  return (
    <>
      {label === "Footnote" ? (
        // For footnote with multiple fields
        <TextInput
          placeholder="Text"
          label="Text"
          onChange={(val) => setInputValue(val)}
          value={inputValue}
          data-test-id="note-ft"
        />
      ) : (
        // For simple inputs like verse/chapter numbers
        <TextInput
          placeholder={placeholder ?? "Enter Value"}
          label={label}
          onChange={setInputValue}
          value={inputValue}
          data-test-id={`modal-${label.toLowerCase()}`}
          type={label === "Verse" || label === "Chapter" ? "number" : "text"}
        />
      )}
      <button className="scribe-button" disabled={isDisabled} onClick={handleInsert}>
        Insert
      </button>
    </>
  );
};

export const Button: React.FC<{
  "data-test-id"?: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
}> = ({ "data-test-id": dataTestId, children, className, onClick, disabled, title }) => (
  <button
    disabled={disabled}
    className={`scribe-button ${className || ""}`}
    onClick={onClick}
    title={title}
    aria-label={title}
    {...(dataTestId && { "data-test-id": dataTestId })}
  >
    {children}
  </button>
);
