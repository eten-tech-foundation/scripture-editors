import OptionChangePlugin from "./OptionChangePlugin";
import ScriptureReferencePlugin from "./ScriptureReferencePlugin";
import TreeViewPlugin from "./TreeViewPlugin";
import editorUsjAdaptor from "./adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "./adaptors/usj-editor.adaptor";
import { getUsjMarkerAction } from "./adaptors/usj-marker-action.utils";
import { EditorOptions } from "./editor.model";
import editorTheme from "./editor.theme";
import ToolbarPlugin from "./toolbar/ToolbarPlugin";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { deepEqual } from "fast-equals";
import { $setSelection, EditorState, LexicalEditor } from "lexical";
import React, {
  JSX,
  PropsWithChildren,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { usjReactNodes } from "shared-react/nodes/usj";
import { UsjNodeOptions } from "shared-react/nodes/usj/usj-node-options.model";
import { ArrowNavigationPlugin } from "shared-react/plugins/usj/ArrowNavigationPlugin";
import { CharNodePlugin } from "shared-react/plugins/usj/CharNodePlugin";
import { ClipboardPlugin } from "shared-react/plugins/usj/ClipboardPlugin";
import { CommandMenuPlugin } from "shared-react/plugins/usj/CommandMenuPlugin";
import { ContextMenuPlugin } from "shared-react/plugins/usj/ContextMenuPlugin";
import { EditablePlugin } from "shared-react/plugins/usj/EditablePlugin";
import { LoadStatePlugin } from "shared-react/plugins/usj/LoadStatePlugin";
import { NoteNodePlugin } from "shared-react/plugins/usj/NoteNodePlugin";
import { OnSelectionChangePlugin } from "shared-react/plugins/usj/OnSelectionChangePlugin";
import { ParaNodePlugin } from "shared-react/plugins/usj/ParaNodePlugin";
import { TextDirectionPlugin } from "shared-react/plugins/usj/TextDirectionPlugin";
import { TextSpacingPlugin } from "shared-react/plugins/usj/TextSpacingPlugin";
import { UsjNodesMenuPlugin } from "shared-react/plugins/usj/UsjNodesMenuPlugin";
import {
  AnnotationPlugin,
  AnnotationRef,
} from "shared-react/plugins/usj/annotation/AnnotationPlugin";
import {
  AnnotationRange,
  SelectionRange,
} from "shared-react/plugins/usj/annotation/selection.model";
import {
  $getRangeFromEditor,
  $getRangeFromSelection,
} from "shared-react/plugins/usj/annotation/selection.utils";
import { getDefaultViewOptions, getViewClassList } from "shared-react/views/view-options.utils";
import { LoggerBasic } from "shared/adaptors/logger-basic.model";
import { TypedMarkNode } from "shared/nodes/features/TypedMarkNode";
import { blackListedChangeTags, SELECTION_CHANGE_TAG } from "shared/nodes/usj/node-constants";

/** Forward reference for the editor. */
export type EditorRef = {
  /** Focus the editor. */
  focus(): void;
  /** Get USJ Scripture data. */
  getUsj(): Usj | undefined;
  /** Set the USJ Scripture data. */
  setUsj(usj: Usj): void;
  /**
   * Get the selection location or range.
   * @returns the selection location or range, or `undefined` if there is no selection. The
   *   json-path in the selection assumes no comment Milestone nodes are present in the USJ.
   */
  getSelection(): SelectionRange | undefined;
  /**
   * Set the selection location or range.
   * @param selection - A selection location or range. The json-path in the selection assumes no
   *   comment Milestone nodes are present in the USJ.
   */
  setSelection(selection: SelectionRange): void;
  /**
   * Add an ephemeral annotation.
   * @param selection - An annotation range containing the start and end location. The json-path in
   *   an annotation location assumes no comment Milestone nodes are present in the USJ.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   */
  addAnnotation(selection: AnnotationRange, type: string, id: string): void;
  /**
   * Remove an ephemeral annotation.
   * @param type - Type of the annotation.
   * @param id - ID of the annotation.
   */
  removeAnnotation(type: string, id: string): void;
  /** Ref to the end of the toolbar - INTERNAL USE ONLY to dynamically add controls in the toolbar. */
  toolbarEndRef: React.RefObject<HTMLElement> | null;
};

export type EditorProps<TLogger extends LoggerBasic> = {
  /** Initial Scripture data in USJ format. */
  defaultUsj?: Usj;
  /** Scripture reference that controls the general cursor location of the Scripture. */
  scrRef?: SerializedVerseRef;
  /** Callback function when the Scripture reference has changed. */
  onScrRefChange?: (scrRef: SerializedVerseRef) => void;
  /** Callback function when the cursor selection changes. */
  onSelectionChange?: (selection: SelectionRange | undefined) => void;
  /** Callback function when USJ Scripture data has changed. */
  onUsjChange?: (usj: Usj) => void;
  /** Options to configure the editor. */
  options?: EditorOptions;
  /** Logger instance. */
  logger?: TLogger;
};

type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

const editorConfig: Mutable<InitialConfigType> = {
  namespace: "platformEditor",
  theme: editorTheme,
  editable: true,
  editorState: undefined,
  // Handling of errors during update
  onError(error) {
    throw error;
  },
  nodes: [TypedMarkNode, ...usjReactNodes],
};

const defaultViewOptions = getDefaultViewOptions();
const defaultNodeOptions: UsjNodeOptions = {};
const defaultOptions: EditorOptions = {};

function Placeholder(): JSX.Element {
  return <div className="editor-placeholder">Enter some Scripture...</div>;
}

/**
 * Scripture Editor for USJ. Created for use in [Platform](https://platform.bible).
 * @see https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js
 *
 * @param props.ref - Forward reference for the editor.
 * @param props.defaultUsj - Default USJ Scripture data.
 * @param props.scrRef - Scripture reference that controls the cursor in the Scripture.
 * @param props.onScrRefChange - Scripture reference set callback function when the reference
 *   changes in the editor as the cursor moves.
 * @param props.onSelectionChange - Callback function when the cursor selection changes.
 * @param props.onUsjChange - Callback function when USJ Scripture data has changed.
 * @param props.options - Options to configure the editor.
 * @param props.logger - Logger instance.
 * @returns the editor element.
 */
const Editor = forwardRef(function Editor<TLogger extends LoggerBasic>(
  {
    defaultUsj,
    scrRef,
    onScrRefChange,
    onSelectionChange,
    onUsjChange,
    options,
    logger,
    children,
  }: PropsWithChildren<EditorProps<TLogger>>,
  ref: React.ForwardedRef<EditorRef>,
): JSX.Element {
  const editorRef = useRef<LexicalEditor | null>(null);
  const annotationRef = useRef<AnnotationRef | null>(null);
  const toolbarEndRef = useRef<HTMLDivElement>(null);
  const editedUsjRef = useRef(defaultUsj);
  const [usj, setUsj] = useState(defaultUsj);

  const {
    isReadonly = false,
    hasSpellCheck = false,
    textDirection = "ltr",
    markerMenuTrigger = "\\",
    view: viewOptions = defaultViewOptions,
    nodes: nodeOptions = defaultNodeOptions,
    debug = false,
  } = options ?? defaultOptions;

  editorConfig.editable = !isReadonly;
  editorUsjAdaptor.initialize(logger);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    getUsj() {
      return editedUsjRef.current;
    },
    setUsj(incomingUsj) {
      if (!deepEqual(editedUsjRef.current, incomingUsj)) {
        editedUsjRef.current = incomingUsj;
        setUsj(incomingUsj);
      }
    },
    getSelection() {
      return editorRef.current?.read(() => $getRangeFromEditor());
    },
    setSelection(selection) {
      editorRef.current?.update(
        () => {
          const rangeSelection = $getRangeFromSelection(selection);
          if (rangeSelection !== undefined) $setSelection(rangeSelection);
        },
        { tag: SELECTION_CHANGE_TAG },
      );
    },
    addAnnotation(selection, type, id) {
      annotationRef.current?.addAnnotation(selection, type, id);
    },
    removeAnnotation(type, id) {
      annotationRef.current?.removeAnnotation(type, id);
    },
    get toolbarEndRef() {
      return toolbarEndRef;
    },
  }));

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, tags: Set<string>) => {
      if (blackListedChangeTags.some((tag) => tags.has(tag))) return;

      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) onUsjChange?.(newUsj);
      }
    },
    [usj, onUsjChange],
  );

  return (
    <LexicalComposer initialConfig={editorConfig}>
      <EditablePlugin isEditable={!isReadonly} />
      <div className="editor-container">
        <div className={"editor-toolbar-container" + (isReadonly ? "-readonly" : "-editable")}>
          <ToolbarPlugin ref={toolbarEndRef} />
        </div>
        <div className="editor-inner">
          <EditorRefPlugin editorRef={editorRef} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`editor-input ${getViewClassList(viewOptions).join(" ")}`}
                spellCheck={hasSpellCheck}
              />
            }
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          {scrRef && onScrRefChange && (
            <ScriptureReferencePlugin scrRef={scrRef} onScrRefChange={onScrRefChange} />
          )}
          {scrRef && (
            <UsjNodesMenuPlugin
              trigger={markerMenuTrigger}
              scrRef={scrRef}
              getMarkerAction={(marker, markerData) =>
                getUsjMarkerAction(marker, markerData, viewOptions)
              }
            />
          )}
          <OptionChangePlugin
            options={{ view: viewOptions, nodes: nodeOptions }}
            editedUsjRef={editedUsjRef}
            usj={usj}
            setUsj={setUsj}
          />
          <LoadStatePlugin
            scripture={usj}
            nodeOptions={nodeOptions}
            editorAdaptor={usjEditorAdaptor}
            viewOptions={viewOptions}
            logger={logger}
          />
          <OnSelectionChangePlugin onChange={onSelectionChange} />
          <OnChangePlugin
            onChange={handleChange}
            ignoreSelectionChange
            ignoreHistoryMergeTagChange
          />
          <AnnotationPlugin ref={annotationRef} logger={logger} />
          <ArrowNavigationPlugin />
          <CharNodePlugin />
          <ClipboardPlugin />
          <CommandMenuPlugin logger={logger} />
          <ContextMenuPlugin />
          <NoteNodePlugin nodeOptions={nodeOptions} viewOptions={viewOptions} logger={logger} />
          <ParaNodePlugin />
          <TextDirectionPlugin textDirection={textDirection} />
          <TextSpacingPlugin />
          {children}
        </div>
        {debug && <TreeViewPlugin />}
      </div>
    </LexicalComposer>
  );
});

export default Editor;
