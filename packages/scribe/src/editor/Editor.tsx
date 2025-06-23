import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { deepEqual } from "fast-equals";
import { EditorState, LexicalEditor } from "lexical";
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { usjReactNodes } from "shared-react/nodes/usj";
import { UsjNodeOptions } from "shared-react/nodes/usj/usj-node-options.model";
import { ClipboardPlugin } from "shared-react/plugins/usj/ClipboardPlugin";
import { ContextMenuPlugin } from "shared-react/plugins/usj/ContextMenuPlugin";
import { LoadStatePlugin } from "shared-react/plugins/usj/LoadStatePlugin";
import { NoteNodePlugin } from "shared-react/plugins/usj/NoteNodePlugin";
import { ArrowNavigationPlugin } from "shared-react/plugins/usj/ArrowNavigationPlugin";
import { CommandMenuPlugin } from "shared-react/plugins/usj/CommandMenuPlugin";
import { OnSelectionChangePlugin } from "shared-react/plugins/usj/OnSelectionChangePlugin";
import { ParaNodePlugin } from "shared-react/plugins/usj/ParaNodePlugin";
import { TextDirectionPlugin } from "shared-react/plugins/usj/TextDirectionPlugin";
import { TextSpacingPlugin } from "shared-react/plugins/usj/TextSpacingPlugin";
import { SelectionRange } from "shared-react/plugins/usj/annotation/selection.model";
import { $getRangeFromEditor } from "shared-react/plugins/usj/annotation/selection.utils";
import { getViewClassList, ViewOptions } from "shared-react/views/view-options.utils";
import { blackListedChangeTags } from "shared/nodes/usj/node-constants";
import { ScriptureReference } from "shared/utils/get-marker-action.model";
import editorUsjAdaptor from "./adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "./adaptors/usj-editor.adaptor";
import { getUsjMarkerAction } from "./adaptors/usj-marker-action.utils";
import useDeferredState from "@/hooks/use-deferred-state.hook";
import KeyboardShortcutPlugin from "./plugins/KeyboardShortcutPlugin";
import { ScriptureReferencePlugin } from "./plugins/ScriptureReferencePlugin";
import UsjNodesMenuPlugin from "./plugins/UsjNodesMenuPlugin";
import editorTheme from "./themes/editor-theme";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Toolbar } from "./Toolbar";

/** Forward reference for the editor. */
export type EditorRef = {
  /** Method to focus the editor. */
  focus(): void;
  /** Method to get the USJ Scripture data. */
  getUsj(): Usj | undefined;
  /** Method to set the USJ Scripture data. */
  setUsj(usj: Usj): void;
  /**
   * Get the selection location or range.
   * @returns the selection location or range, or `undefined` if there is no selection.
   */
  getSelection(): SelectionRange | undefined;
  /**
   * Set the selection location or range.
   * @param selection - A selection location or range.
   */
  setSelection(selection: SelectionRange): void;
};

/** Options to configure the editor. */
export type EditorOptions = {
  /** Is the editor readonly or editable. */
  isReadonly?: boolean;
  /** Is the editor enabled for spell checking. */
  hasSpellCheck?: boolean;
  /** View options. */
  view?: ViewOptions;
  /** Options for each editor node:
   * @param nodes[].noteCallers - Possible note callers to use when caller is '+' for
   *   ImmutableNoteCallerNode.
   * @param nodes[].onClick - Click handler method for ImmutableNoteCallerNode.
   */
  nodes?: UsjNodeOptions;
};

type EditorProps = {
  /** Scripture data in USJ form */
  usjInput?: Usj;
  onChange?: (usj: Usj) => void;
  /** Callback function when the cursor selection changes. */
  onSelectionChange?: (selection: SelectionRange | undefined) => void;
  viewOptions?: ViewOptions;
  nodeOptions?: UsjNodeOptions;
  scrRef: ScriptureReference;
  onScrRefChange: (scrRef: ScriptureReference) => void;
};
// const NODE_MENU_TRIGGER = "//";

const Editor = forwardRef(function Editor(
  {
    usjInput,
    onChange,
    onSelectionChange,
    viewOptions,
    nodeOptions = {},
    scrRef,
    onScrRefChange,
  }: EditorProps,
  ref: React.ForwardedRef<EditorRef>,
): JSX.Element {
  const editorRef = useRef<LexicalEditor>(null);
  const editedUsjRef = useRef<Usj>();
  const [usj, setUsj] = useState(usjInput);
  const [loadedUsj] = useDeferredState(usj);
  const autoNumbering = false;
  const initialConfig = {
    namespace: "ScribeEditor",
    editable: true,
    editorState: undefined,
    theme: editorTheme,
    onError(error: Error) {
      throw error;
    },
    nodes: usjReactNodes,
  };

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    getUsj() {
      return editedUsjRef.current;
    },
    setUsj(editedUsj) {
      if (!deepEqual(editedUsjRef.current, editedUsj) && !deepEqual(usj, editedUsj)) {
        editedUsjRef.current = editedUsj;
        setUsj(editedUsj);
      }
    },
    getSelection() {
      return editorRef.current?.read(() => $getRangeFromEditor());
    },
    setSelection(_selection: SelectionRange) {
      // Implementation needed - will be added later
    },
  }));

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (blackListedChangeTags.some((tag) => tags.has(tag))) return;

      // const serializedState = editor.parseEditorState(usjEditorAdaptor.serializeEditorState(usj));
      // console.log({ serializedState });
      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) onChange?.(newUsj);
      }
    },
    [onChange, usj],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <Toolbar scrRef={scrRef} autoNumbering={autoNumbering} />
      <RichTextPlugin
        contentEditable={
          <ContentEditable
            className={`editor-input outline-none ${getViewClassList(viewOptions).join(" ")}`}
          />
        }
        placeholder={<LoadingSpinner />}
        ErrorBoundary={LexicalErrorBoundary}
      />

      {scrRef && (
        <UsjNodesMenuPlugin
          trigger={"\\"}
          scrRef={scrRef}
          getMarkerAction={(marker, markerData) =>
            getUsjMarkerAction(marker, markerData, viewOptions)
          }
          autoNumbering={autoNumbering}
        />
      )}
      <LoadStatePlugin
        scripture={loadedUsj}
        nodeOptions={nodeOptions}
        editorAdaptor={usjEditorAdaptor}
        viewOptions={viewOptions}
      />
      <OnChangePlugin onChange={handleChange} ignoreSelectionChange={true} />
      <NoteNodePlugin nodeOptions={nodeOptions} viewOptions={viewOptions} />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <ContextMenuPlugin />
      <KeyboardShortcutPlugin />
      <ClipboardPlugin />
      <ScriptureReferencePlugin scrRef={scrRef} onScrRefChange={onScrRefChange} />
      <ArrowNavigationPlugin />
      <CommandMenuPlugin />
      <OnSelectionChangePlugin onChange={onSelectionChange} />
      <ParaNodePlugin />
      <TextDirectionPlugin textDirection="auto" />
      <TextSpacingPlugin />
    </LexicalComposer>
  );
});

export default Editor;
