import editorUsjAdaptor from "./adaptors/editor-usj.adaptor";
import usjNoteEditorAdapter from "./adaptors/note-usj-editor.adaptor";
import editorTheme from "./themes/editor-theme";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { EditorState } from "lexical";
import { useCallback, useEffect } from "react";
import { ImmutableNoteCallerNode } from "shared-react/nodes/usj/ImmutableNoteCallerNode";
import { UsjNodeOptions } from "shared-react/nodes/usj/usj-node-options.model";
import { LoadStatePlugin } from "shared-react/plugins/usj/LoadStatePlugin";
import { NoteNodePlugin } from "shared-react/plugins/usj/NoteNodePlugin";
import { ViewOptions } from "shared-react/views/view-options.utils";
import { usjBaseNodes } from "shared/nodes/usj";

type NoteEditorProps = {
  /** Scripture data in USJ form */
  usj?: Usj;
  onChange?: (usj: Usj) => void;
  viewOptions?: ViewOptions;
  nodeOptions?: UsjNodeOptions;
  scrollId?: string;
};

export const NoteEditor = ({
  usj,
  onChange,
  viewOptions,
  nodeOptions = {},
  scrollId,
}: NoteEditorProps) => {
  const initialConfig = {
    namespace: "ScribeNoteEditor",
    editable: true,
    editorState: null,
    theme: editorTheme,
    onError(error: Error) {
      throw error;
    },
    nodes: [ImmutableNoteCallerNode, ...usjBaseNodes],
  };

  const handleChange = useCallback(
    (editorState: EditorState) => {
      const usj = editorUsjAdaptor.deserializeEditorState(editorState);
      if (usj && onChange) {
        onChange(usj);
      }
    },
    [onChange],
  );
  useEffect(() => {
    const noteEditor = document.getElementById("noteEditor");
    if (scrollId && noteEditor) {
      const element = noteEditor.querySelector(`[data-caller-id="${scrollId}"]`);
      if (element) {
        console.log("scrolling", element);
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [scrollId]);

  return (
    <>
      <LexicalComposer initialConfig={initialConfig}>
        <RichTextPlugin
          contentEditable={<ContentEditable className="outline-none" />}
          placeholder={<div>Enter some text...</div>}
          ErrorBoundary={LexicalErrorBoundary}
        />
        <LoadStatePlugin
          scripture={usj}
          nodeOptions={nodeOptions}
          editorAdaptor={usjNoteEditorAdapter}
          viewOptions={viewOptions}
          // logger={logger}
        />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange={true} />
        <NoteNodePlugin nodeOptions={nodeOptions} viewOptions={viewOptions} />
        <HistoryPlugin />
        <AutoFocusPlugin />
        {/* <TreeViewPlugin /> */}
      </LexicalComposer>
    </>
  );
};
