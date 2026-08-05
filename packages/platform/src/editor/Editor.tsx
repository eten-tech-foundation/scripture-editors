import editorUsjAdaptor from "./adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "./adaptors/usj-editor.adaptor";
import { getUsjMarkerAction, isUsjMarkerSupported } from "./adaptors/usj-marker-action.utils";
import { EditorOptions, EditorProps, EditorRef } from "./editor.model";
import editorTheme from "./editor.theme";
import { ActiveTextPlugin } from "./ActiveTextPlugin";
import { ParaMarkerPrefixGuardPlugin } from "./ParaMarkerPrefixGuardPlugin";
import { ScriptureReferencePlugin } from "./ScriptureReferencePlugin";
import TreeViewPlugin from "./TreeViewPlugin";
import { ToolbarPlugin } from "./toolbar/ToolbarPlugin";
import { InitialConfigType, LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { EditorRefPlugin } from "@lexical/react/LexicalEditorRefPlugin";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { $setBlocksType } from "@lexical/selection";
import { deepEqual } from "fast-equals";
import {
  $addUpdateTag,
  $getSelection,
  $isRangeSelection,
  $setSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  EditorState,
  LexicalEditor,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  ForwardedRef,
  forwardRef,
  MutableRefObject,
  PropsWithChildren,
  ReactElement,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  $createParaNode,
  blackListedChangeTags,
  DELTA_CHANGE_TAG,
  externalTypedMarkType,
  LoggerBasic,
  SELECTION_CHANGE_TAG,
  TypedMarkNode,
  TypedMarkOnClick,
  TypedMarkOnMouseEnter,
  TypedMarkOnMouseLeave,
  TypedMarkOnRemove,
} from "shared";
import {
  $applyUpdate,
  $getNoteByKeyOrIndex,
  $getParticularNodeOps,
  $getUsjSelectionFromEditor,
  $getRangeFromUsjSelection,
  $getReplaceEmbedOps,
  $insertNote,
  $selectNote,
  AnnotationPlugin,
  AnnotationRange,
  AnnotationRef,
  ArrowNavigationPlugin,
  CharNodePlugin,
  ClipboardPlugin,
  CommandMenuPlugin,
  ContextMenuPlugin,
  DeltaOnChangePlugin,
  DeltaOp,
  DisableHistoryShortcutsPlugin,
  EditablePlugin,
  getDefaultViewOptions,
  getInsertedNodeKey,
  getViewClassList,
  LoadStatePlugin,
  NoteNodePlugin,
  OnSelectionChangePlugin,
  ParaNodePlugin,
  pasteSelection,
  pasteSelectionAsPlainText,
  StateChangePlugin,
  StateChangeSnapshot,
  StructureKeyboardPlugin,
  TextDirectionPlugin,
  TextSpacingPlugin,
  UsjNodeOptions,
  UsjNodesMenuPlugin,
  usjBlockVerseNodes,
  usjReactNodes,
} from "shared-react";

const defaultViewOptions = getDefaultViewOptions();
const defaultNodeOptions: UsjNodeOptions = {};
const defaultOptions: EditorOptions = {};

function Placeholder(): ReactElement {
  return <div className="editor-placeholder">Enter some Scripture...</div>;
}

/**
 * Scripture Editor for USJ. Created for use in [Platform](https://platform.bible).
 * @see https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js
 *
 * @param ref - Forward reference for the editor.
 * @param defaultUsj - Default USJ Scripture data.
 * @param scrRef - Scripture reference that controls the cursor in the Scripture.
 * @param onScrRefChange - Scripture reference set callback function when the reference
 *   changes in the editor as the cursor moves.
 * @param onSelectionChange - Callback function when the cursor selection changes.
 * @param onUsjChange - Callback function when USJ Scripture data has changed.
 * @param options - Options to configure the editor.
 * @param logger - Logger instance.
 * @returns the editor element.
 */
const Editor = forwardRef(function Editor<TLogger extends LoggerBasic>(
  {
    defaultUsj,
    scrRef,
    onScrRefChange,
    onSelectionChange,
    onUsjChange,
    onStateChange,
    options,
    logger,
    children,
  }: PropsWithChildren<EditorProps<TLogger>>,
  ref: ForwardedRef<EditorRef>,
): ReactElement {
  const editorRef = useRef<LexicalEditor | null>(null);
  const annotationRef = useRef<AnnotationRef | null>(null);
  const toolbarEndRef = useRef<HTMLDivElement>(null);
  const editedUsjRef = useRef(defaultUsj);
  const expandedNoteKeyRef = useRef<string>(undefined);
  const [usj, setUsj] = useState(defaultUsj);
  const [loadTrigger, setLoadTrigger] = useState(0);
  const [contextMarker, setContextMarker] = useState<string>();

  const {
    isReadonly = false,
    structureProtectionMode = "off",
    hasExternalUI = false,
    hasSpellCheck = false,
    textDirection = "ltr",
    markerMenuTrigger = "\\",
    view,
    nodes,
    debug = false,
    contextMenu,
  } = options ?? defaultOptions;

  // Stabilize the destructured option objects so plugin props don't churn when the parent passes
  // a fresh `options` object every render. Pairs with the per-instance `initialConfig` below -
  // any state derived from `options` should follow the same pattern to avoid cross-instance
  // surprises with multiple Editor instances in one WebView.
  const viewOptions = useMemo(() => {
    const requestedViewOptions = view ?? defaultViewOptions;
    // Gutter markers are added to the source paragraph only, so the fragments a verse block is
    // split into would have a para marker but no marker prefix - and ParaMarkerPrefixGuardPlugin
    // would then reset each of them to `\p`, wiping the poetry indentation the block verse layout
    // exists to preserve. Not a supported combination, so drop the gutter rather than the markers.
    if (requestedViewOptions.verseLayout === "block" && requestedViewOptions.hasGutterParaMarkers)
      return { ...requestedViewOptions, hasGutterParaMarkers: false };
    return requestedViewOptions;
  }, [view]);
  const nodeOptions = useMemo(() => nodes ?? defaultNodeOptions, [nodes]);
  const contextMenuOptions = useMemo(() => contextMenu, [contextMenu]);

  // The block verse layout regroups each verse into its own element, splitting paragraphs that span
  // verses. That shape cannot be exported back to USJ, so the layout is read-only by construction
  // rather than by the host remembering to ask for it.
  const isBlockVerse = viewOptions.verseLayout === "block";
  const effectiveIsReadonly = isReadonly || isBlockVerse;
  if (isBlockVerse && !isReadonly)
    logger?.error(
      "Editor: the block verse layout is read-only; ignoring `isReadonly: false`. Set " +
        "`isReadonly: true` alongside `verseLayout: 'block'`.",
    );
  if (isBlockVerse && view?.hasGutterParaMarkers)
    logger?.warn(
      "Editor: `hasGutterParaMarkers` is not supported with the block verse layout and is ignored.",
    );

  // `showCharMarkerTitles` rides on the Lexical theme so `CharNode.createDOM` can read it via
  // `EditorConfig.theme`. Theme is the channel because its map permits arbitrary keys and is the
  // lowest-friction way to thread a node-rendering flag through `EditorConfig` without
  // introducing a new option object.
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "platformEditor",
      theme: { ...editorTheme, showCharMarkerTitles: viewOptions.showCharMarkerTitles },
      editable: !effectiveIsReadonly,
      editorState: undefined,
      // Handling of errors during update
      onError(error) {
        throw error;
      },
      // Registered per layout so an editor that isn't using block verse never holds its node.
      nodes: [TypedMarkNode, ...(isBlockVerse ? usjBlockVerseNodes : usjReactNodes)],
    }),
    [effectiveIsReadonly, isBlockVerse, viewOptions.showCharMarkerTitles],
  );
  editorUsjAdaptor.initialize(logger);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    undo() {
      editorRef.current?.dispatchCommand(UNDO_COMMAND, undefined);
    },
    redo() {
      editorRef.current?.dispatchCommand(REDO_COMMAND, undefined);
    },
    cut() {
      editorRef.current?.dispatchCommand(CUT_COMMAND, null);
    },
    copy() {
      editorRef.current?.dispatchCommand(COPY_COMMAND, null);
    },
    paste() {
      if (editorRef.current) pasteSelection(editorRef.current);
    },
    pastePlainText() {
      if (editorRef.current) pasteSelectionAsPlainText(editorRef.current);
    },
    getUsj() {
      return editedUsjRef.current;
    },
    setUsj(incomingUsj) {
      if (!deepEqual(editedUsjRef.current, incomingUsj)) {
        editedUsjRef.current = incomingUsj;
        // This can happen when using `applyUpdate` since `usj` won't change.
        const shouldForceReload = deepEqual(usj, incomingUsj);
        setUsj(incomingUsj);
        if (shouldForceReload) setLoadTrigger((prev) => prev + 1);
      }
    },
    applyUpdate(ops, source = "remote") {
      // Delta ops address content by its position in the USJ. The block verse layout regroups
      // paragraphs, so those positions no longer describe this tree - applying them would edit the
      // wrong nodes rather than fail.
      if (isBlockVerse)
        throw new Error(
          "Cannot apply an update in the block verse layout; it is a read-only view whose " +
            "structure does not match the source USJ.",
        );
      editorRef.current?.update(
        () => {
          if (source === "remote") $addUpdateTag(DELTA_CHANGE_TAG);
          $applyUpdate(ops, viewOptions, nodeOptions, logger);
        },
        { discrete: true },
      );
      const editorState = editorRef.current?.getEditorState();
      if (!editorState) return;

      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) {
          const insertedNodeKey = getInsertedNodeKey(ops, editorState);
          onUsjChange?.(newUsj, ops, source, insertedNodeKey);
        }
      }
    },
    replaceEmbedUpdate(embedNodeKey, insertEmbedOps) {
      const ops = editorRef.current?.read(() => $getReplaceEmbedOps(embedNodeKey, insertEmbedOps));
      if (ops) this.applyUpdate(ops);
    },
    getSelection() {
      return editorRef.current?.read($getUsjSelectionFromEditor);
    },
    setSelection(selection) {
      editorRef.current?.update(() => {
        const editorSelection = $getRangeFromUsjSelection(selection);
        if (editorSelection !== undefined) {
          $setSelection(editorSelection);
          $addUpdateTag(SELECTION_CHANGE_TAG);
        }
      });
    },
    setAnnotation(
      selection: AnnotationRange,
      type: string,
      id: string,
      fourth?:
        | TypedMarkOnClick
        | {
            onClick?: TypedMarkOnClick;
            onRemove?: TypedMarkOnRemove;
            onMouseEnter?: TypedMarkOnMouseEnter;
            onMouseLeave?: TypedMarkOnMouseLeave;
          },
      fifth?: TypedMarkOnRemove,
    ) {
      let onClick: TypedMarkOnClick | undefined;
      let onRemove: TypedMarkOnRemove | undefined;
      let onMouseEnter: TypedMarkOnMouseEnter | undefined;
      let onMouseLeave: TypedMarkOnMouseLeave | undefined;

      if (typeof fourth === "function" || fourth === undefined) {
        // Legacy positional form: (selection, type, id, onClick?, onRemove?)
        onClick = fourth;
        onRemove = fifth;
      } else {
        // New options-object form: (selection, type, id, callbacks?)
        onClick = fourth.onClick;
        onRemove = fourth.onRemove;
        onMouseEnter = fourth.onMouseEnter;
        onMouseLeave = fourth.onMouseLeave;
      }

      annotationRef.current?.setAnnotation(
        selection,
        externalTypedMarkType(type),
        id,
        onClick,
        onRemove,
        onMouseEnter,
        onMouseLeave,
      );
    },
    removeAnnotation(type, id) {
      annotationRef.current?.removeAnnotation(externalTypedMarkType(type), id);
    },
    formatPara(blockMarker) {
      editorRef.current?.update(() => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          $setBlocksType(selection, () => $createParaNode(blockMarker));
        }
      });
    },
    getElementByKey(nodeKey: string): HTMLElement | undefined {
      return editorRef.current?.read(
        () => editorRef.current?.getElementByKey(nodeKey) ?? undefined,
      );
    },
    insertMarker(marker) {
      if (effectiveIsReadonly) throw new Error("Cannot insert marker in readonly mode");
      if (!scrRef) throw new Error("Cannot insert marker without a scripture reference (scrRef)");
      if (!editorRef.current) return;

      if (!isUsjMarkerSupported(marker)) throw new Error(`Unsupported marker '${marker}'`);

      const markerAction = getUsjMarkerAction(
        marker,
        expandedNoteKeyRef,
        viewOptions,
        nodeOptions,
        logger,
      );
      markerAction.action({ editor: editorRef.current, reference: scrRef });
    },
    insertNote(marker, caller, selection) {
      editorRef.current?.update(() => {
        const noteNode = $insertNote(
          marker,
          caller,
          selection,
          scrRef,
          viewOptions,
          nodeOptions,
          logger,
        );
        if (noteNode && !noteNode.getIsCollapsed()) expandedNoteKeyRef.current = noteNode.getKey();
      });
    },
    selectNote(noteKeyOrIndex) {
      editorRef.current?.update(() => {
        const noteNode = $getNoteByKeyOrIndex(noteKeyOrIndex);
        if (noteNode) {
          $selectNote(noteNode, viewOptions);
          if (!noteNode.getIsCollapsed()) expandedNoteKeyRef.current = noteNode.getKey();
        }
      });
    },
    getNoteOps(noteKeyOrIndex) {
      return editorRef.current?.read(() => {
        const noteNode = $getNoteByKeyOrIndex(noteKeyOrIndex);
        if (!noteNode) return undefined;

        return $getParticularNodeOps(noteNode);
      });
    },
    get toolbarEndRef() {
      return toolbarEndRef;
    },
  }));

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, _tags: Set<string>, ops: DeltaOp[]) => {
      // No blacklisted-tag guard is needed here: `DeltaOnChangePlugin` is given
      // `ignoreTags={blackListedChangeTags}` and short-circuits before calling this handler, so
      // only local user edits (which carry no blacklisted tag) ever reach this point.

      // The block verse layout has no USJ to report: its paragraphs are split across verse blocks,
      // so the export refuses. `editor.update()` still runs on a non-editable editor, so an
      // untagged update from a host API call would otherwise reach that refusal from here.
      if (isBlockVerse) return;

      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) {
          // `handleChange` only runs for local edits: `DeltaOnChangePlugin` ignores
          // `blackListedChangeTags` (which includes `DELTA_CHANGE_TAG`), so updates from
          // `applyUpdate` never reach here - they emit `onUsjChange` with source "remote" directly.
          const insertedNodeKey = getInsertedNodeKey(ops, editorState);
          onUsjChange?.(newUsj, ops, "local", insertedNodeKey);
        }
      }
    },
    [usj, onUsjChange, isBlockVerse],
  );

  const handleStateChange = useCallback(
    (snapshot: StateChangeSnapshot) => {
      setContextMarker(snapshot.contextMarker);
      onStateChange?.(snapshot);
    },
    [onStateChange],
  );

  return (
    // A Lexical editor's node types are fixed when it is created, so switching layouts has to
    // recreate it. The key never changes for the inline layouts, which leave `verseLayout` unset.
    <LexicalComposer key={viewOptions.verseLayout ?? "inline"} initialConfig={initialConfig}>
      <EditablePlugin isEditable={!effectiveIsReadonly} />
      <div className="editor-container">
        {hasExternalUI ? (
          <StateChangePlugin onStateChange={handleStateChange} />
        ) : (
          <div
            className={
              "editor-toolbar-container" + (effectiveIsReadonly ? "-readonly" : "-editable")
            }
          >
            <ToolbarPlugin
              ref={toolbarEndRef}
              editorRef={ref as MutableRefObject<EditorRef | null>}
              isReadonly={effectiveIsReadonly}
              onStateChange={handleStateChange}
            />
          </div>
        )}
        <div className="editor-inner">
          <EditorRefPlugin editorRef={editorRef} />
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`editor-input usfm ${getViewClassList(viewOptions).join(" ")}${viewOptions.hasGutterParaMarkers ? " psc-gutter-markers" : ""}${viewOptions.hasActiveTextFocusBox ? " psc-active-focus" : ""}`}
                spellCheck={hasSpellCheck}
              />
            }
            placeholder={<Placeholder />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          {hasExternalUI && <DisableHistoryShortcutsPlugin />}
          <HistoryPlugin />
          {scrRef && onScrRefChange && (
            <ScriptureReferencePlugin scrRef={scrRef} onScrRefChange={onScrRefChange} />
          )}
          {scrRef && !hasExternalUI && (
            <UsjNodesMenuPlugin
              trigger={markerMenuTrigger}
              scrRef={scrRef}
              contextMarker={contextMarker}
              getMarkerAction={(marker) =>
                getUsjMarkerAction(marker, expandedNoteKeyRef, viewOptions, nodeOptions, logger)
              }
            />
          )}
          <LoadStatePlugin
            key={loadTrigger}
            scripture={usj}
            scriptureRef={editedUsjRef}
            nodeOptions={nodeOptions}
            editorAdaptor={usjEditorAdaptor}
            viewOptions={viewOptions}
            logger={logger}
          />
          <OnSelectionChangePlugin onChange={onSelectionChange} />
          <DeltaOnChangePlugin
            onChange={handleChange}
            ignoreSelectionChange
            ignoreHistoryMergeTagChange
            ignoreTags={blackListedChangeTags}
          />
          <ActiveTextPlugin viewOptions={viewOptions} />
          <AnnotationPlugin ref={annotationRef} logger={logger} />
          <ArrowNavigationPlugin viewOptions={viewOptions} />
          <CharNodePlugin />
          <ClipboardPlugin />
          <CommandMenuPlugin logger={logger} />
          <ContextMenuPlugin options={contextMenuOptions} />
          <NoteNodePlugin
            expandedNoteKeyRef={expandedNoteKeyRef}
            nodeOptions={nodeOptions}
            viewOptions={viewOptions}
            logger={logger}
          />
          <ParaMarkerPrefixGuardPlugin viewOptions={viewOptions} logger={logger} />
          <ParaNodePlugin />
          <StructureKeyboardPlugin structureProtectionMode={structureProtectionMode} />
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
