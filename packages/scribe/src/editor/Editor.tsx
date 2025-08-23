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
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  ReactElement,
} from "react";
import { ScriptureReference, blackListedChangeTags } from "shared";
import {
  $getRangeFromEditor,
  ArrowNavigationPlugin,
  ClipboardPlugin,
  CommandMenuPlugin,
  ContextMenuPlugin,
  getViewClassList,
  LoadStatePlugin,
  NoteNodePlugin,
  OnSelectionChangePlugin,
  ParaNodePlugin,
  SelectionRange,
  TextDirectionPlugin,
  TextSpacingPlugin,
  UsjNodeOptions,
  usjReactNodes,
  ViewOptions,
} from "shared-react";
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
export interface EditorRef {
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
}

/** Options to configure the editor. */
export interface EditorOptions {
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
}

interface EditorProps {
  /** Scripture data in USJ form */
  usjInput?: Usj;
  onChange?: (usj: Usj) => void;
  /** Callback function when the cursor selection changes. */
  onSelectionChange?: (selection: SelectionRange | undefined) => void;
  viewOptions?: ViewOptions;
  nodeOptions?: UsjNodeOptions;
  scrRef: ScriptureReference;
  onScrRefChange: (scrRef: ScriptureReference) => void;
}
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
): ReactElement {
  const editorRef = useRef<LexicalEditor>(null);
  const editedUsjRef = useRef<Usj | undefined>(undefined);
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
