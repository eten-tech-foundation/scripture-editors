import {
  Editorial,
  EditorOptions,
  EditorRef,
  getDefaultViewOptions,
  ViewOptions,
} from "@eten-tech-foundation/platform-editor";
import { EMPTY_USJ } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { Check, X } from "lucide-react";
import { forwardRef, useMemo } from "react";

interface NoteEditorProps {
  isVisible: boolean;
  scrRef: SerializedVerseRef;
  viewOptions?: ViewOptions;
  onCancel: () => void;
  onSubmit: () => void;
}

export const NoteEditor = forwardRef<EditorRef, NoteEditorProps>(
  ({ isVisible, scrRef, viewOptions, onCancel, onSubmit }, ref) => {
    const options = useMemo<EditorOptions>(() => {
      return {
        hasExternalUI: true,
        debug: false,
        view: { ...(viewOptions ?? getDefaultViewOptions()), noteMode: "expanded" },
      };
    }, [viewOptions]);

    return (
      <div
        style={{
          border: "1px solid #ccc",
          padding: 16,
          background: "#fafafa",
          display: isVisible ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <h4 style={{ color: "#222", margin: 0 }}>Edit Note</h4>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={onCancel}
              style={{
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Cancel"
              title="Cancel"
            >
              <X size={16} />
            </button>
            <button
              onClick={onSubmit}
              style={{
                padding: "4px 8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Submit"
              title="Submit"
            >
              <Check size={16} />
            </button>
          </div>
        </div>
        <div style={{ height: "140px", border: "1px solid #ddd", overflow: "hidden" }}>
          <Editorial
            ref={ref}
            defaultUsj={EMPTY_USJ}
            scrRef={scrRef}
            onScrRefChange={() => undefined}
            options={options}
          />
        </div>
      </div>
    );
  },
);
NoteEditor.displayName = "NoteEditor";
