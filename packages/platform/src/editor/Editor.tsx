import editorUsjAdaptor from "./adaptors/editor-usj.adaptor";
import usjEditorAdaptor from "./adaptors/usj-editor.adaptor";
import {
  $extendCharacterMarkerAtSelection,
  $removeCharacterMarkerAtSelection,
  $replaceCharacterMarkerAtSelection,
  getUsjMarkerAction,
  isCharacterMarkerSupported,
  isUsjMarkerSupported,
} from "./adaptors/usj-marker-action.utils";
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
  useEffect,
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
  ParaMarkerPrefixCursorGuardPlugin,
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
  //
  // `viewOptions` needs a VALUE-based (not just reference-based) memo: it's a dependency of
  // `LoadStatePlugin`'s reload effect, which unconditionally calls `setEditorState` +
  // `CLEAR_HISTORY_COMMAND` on every fire. A plain `useMemo(() => view ?? defaultViewOptions,
  // [view])` only helps once `view` itself is referentially stable, which the caller is not
  // guaranteed to provide - a parent re-render that passes a fresh-but-equal `options.view` object
  // (e.g. one triggered by `applyUpdate`'s own `onUsjChange` round-trip) would otherwise re-fire
  // `LoadStatePlugin` and silently wipe the undo/redo stacks moments after an edit, with no
  // document or view change to justify it. Comparing by value keeps the reference stable across
  // such re-renders while still producing a new one - correctly triggering a reload - when a view
  // option genuinely changes.
  //
  // `nodeOptions` and `contextMenuOptions`, destructured just below, don't need this treatment:
  // `nodeOptions` is only a dependency of `LoadStatePlugin`'s separate adaptor-*initialize* effect,
  // not its reload effect, and `contextMenuOptions` isn't passed to `LoadStatePlugin` at all - so
  // of the three, only `viewOptions`'s identity can trigger the spurious reload this fix addresses.
  const requestedViewOptions = view ?? defaultViewOptions;
  // Two paragraph-level features cannot work once a verse owns the block:
  // - gutter markers are added to the source paragraph only, so the fragments a verse block is
  //   split into would have a para marker but no marker prefix, and ParaMarkerPrefixGuardPlugin
  //   would reset each of them to `\p`, wiping the poetry indentation this layout preserves;
  // - the active-text box resolves the caret's top-level element, which is now the verse block
  //   rather than a paragraph, so it would outline the whole verse and never find its verses.
  // Neither is set by the block verse view itself; this only covers hand-composed options.
  // Normalizing before the deep-equality check below keeps the fresh object this spread produces
  // on every render from churning `viewOptions`'s identity.
  const resolvedViewOptions =
    requestedViewOptions.verseLayout === "block" &&
    (requestedViewOptions.hasGutterParaMarkers || requestedViewOptions.hasActiveTextFocusBox)
      ? { ...requestedViewOptions, hasGutterParaMarkers: false, hasActiveTextFocusBox: false }
      : requestedViewOptions;
  const viewOptionsRef = useRef(resolvedViewOptions);
  if (!deepEqual(viewOptionsRef.current, resolvedViewOptions)) {
    viewOptionsRef.current = resolvedViewOptions;
  }
  const viewOptions = viewOptionsRef.current;
  const nodeOptions = useMemo(() => nodes ?? defaultNodeOptions, [nodes]);
  const contextMenuOptions = useMemo(() => contextMenu, [contextMenu]);

  // `logger` is also a dependency of `LoadStatePlugin`'s reload effect (see the `viewOptions`
  // comment above for what that effect does on every fire), so the same reference-instability
  // risk applies here if a caller ever passes a fresh-but-equivalent logger object. Deep-equality
  // is still the right comparison for an object whose properties are mostly methods: two
  // genuinely different loggers won't have the same function references and will correctly be
  // treated as different, while a caller that re-wraps the same underlying stable methods in a
  // new object each render will correctly be treated as unchanged.
  const loggerRef = useRef(logger);
  if (!deepEqual(loggerRef.current, logger)) {
    loggerRef.current = logger;
  }
  const stableLogger = loggerRef.current;

  // The block verse layout regroups each verse into its own element, splitting paragraphs that span
  // verses. That shape cannot be exported back to USJ, so the layout is read-only by construction
  // rather than by the host remembering to ask for it.
  const isBlockVerse = viewOptions.verseLayout === "block";
  const effectiveIsReadonly = isReadonly || isBlockVerse;

  // Reported from an effect, not the render body: a render can run many times (twice per render in
  // StrictMode) for one misconfiguration, and repeating the message would bury it. Read the
  // *requested* flags - `viewOptions` has already had them normalized away.
  const isIgnoringParaFeatures =
    isBlockVerse &&
    ((requestedViewOptions.hasGutterParaMarkers ?? false) ||
      (requestedViewOptions.hasActiveTextFocusBox ?? false));
  useEffect(() => {
    if (isBlockVerse && !isReadonly)
      stableLogger?.error(
        "Editor: the block verse layout is read-only; ignoring `isReadonly: false`. Set " +
          "`isReadonly: true` alongside `verseLayout: 'block'`.",
      );
    if (isIgnoringParaFeatures)
      stableLogger?.warn(
        "Editor: `hasGutterParaMarkers` and `hasActiveTextFocusBox` are not supported with the " +
          "block verse layout and are ignored.",
      );
  }, [isBlockVerse, isReadonly, isIgnoringParaFeatures, stableLogger]);

  // `showCharMarkerTitles` rides on the Lexical theme so `CharNode.createDOM` can read it via
  // `EditorConfig.theme`. Theme is the channel because its map permits arbitrary keys and is the
  // lowest-friction way to thread a node-rendering flag through `EditorConfig` without
  // introducing a new option object.
  /**
   * Refuses an operation that would change the document in the block verse layout. Its paragraphs
   * are split across verse blocks, so an edit has no correct USJ to go back to; refusing is what
   * keeps the rendered document and `getUsj()` from silently diverging.
   */
  const assertEditable = (operation: string) => {
    if (isBlockVerse)
      throw new Error(
        `Cannot ${operation} in the block verse layout; it is a read-only view whose structure ` +
          "does not match the source USJ.",
      );
  };

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
  editorUsjAdaptor.initialize(stableLogger);

  /**
   * Throws if `marker` is given but isn't a character marker the character marker actions can act
   * on. An omitted marker is always allowed - it means "whatever marker is at the selection".
   */
  function assertCharacterMarkerSupported(marker: string | undefined) {
    if (marker !== undefined && !isCharacterMarkerSupported(marker, nodeOptions.extraValidMarkers))
      throw new Error(`Unsupported character marker '${marker}'`);
  }

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
      // Delta ops address content by its position in the USJ, which this layout's regrouping
      // changes, so applying them would edit the wrong nodes rather than fail.
      assertEditable("apply an update");
      editorRef.current?.update(
        () => {
          if (source === "remote") $addUpdateTag(DELTA_CHANGE_TAG);
          $applyUpdate(ops, viewOptions, nodeOptions, stableLogger);
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
      assertEditable("format a paragraph");
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
    removeCharacterMarker(marker) {
      if (isReadonly) throw new Error("Cannot remove character marker in readonly mode");
      assertCharacterMarkerSupported(marker);

      // `discrete` so the update runs now rather than being deferred behind an in-progress one,
      // which would leave `didRemove` reporting `false` for a removal that did happen. Same reason
      // `applyUpdate` above uses it.
      let didRemove = false;
      editorRef.current?.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            didRemove = $removeCharacterMarkerAtSelection(selection, marker, viewOptions);
        },
        { discrete: true },
      );
      return didRemove;
    },
    replaceCharacterMarker(toMarker, fromMarker) {
      if (isReadonly) throw new Error("Cannot replace character marker in readonly mode");
      assertCharacterMarkerSupported(toMarker);
      assertCharacterMarkerSupported(fromMarker);

      // No `viewOptions` argument, unlike removeCharacterMarker above: replacement changes no text
      // and strips no children, so it has nothing marker-mode-dependent to undo.
      //
      // `discrete` so the update runs now rather than being deferred behind an in-progress one,
      // which would leave `didReplace` reporting `false` for a replacement that did happen. Same
      // reason `removeCharacterMarker` above uses it.
      let didReplace = false;
      editorRef.current?.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            didReplace = $replaceCharacterMarkerAtSelection(selection, toMarker, fromMarker);
        },
        { discrete: true },
      );
      return didReplace;
    },
    extendCharacterMarker(marker, conflictingMarkers) {
      if (isReadonly) throw new Error("Cannot extend character marker in readonly mode");
      assertCharacterMarkerSupported(marker);
      conflictingMarkers?.forEach((conflictingMarker) =>
        assertCharacterMarkerSupported(conflictingMarker),
      );

      // `viewOptions` is forwarded for the same reason `removeCharacterMarker` above needs it:
      // removing a conflicting marker has to strip that marker's synthesized content.
      //
      // `discrete` so the update runs now rather than being deferred behind an in-progress one,
      // which would leave `didExtend` reporting `false` for an extension that did happen. Same
      // reason `removeCharacterMarker` above uses it.
      let didExtend = false;
      editorRef.current?.update(
        () => {
          const selection = $getSelection();
          if ($isRangeSelection(selection))
            didExtend = $extendCharacterMarkerAtSelection(
              selection,
              marker,
              conflictingMarkers,
              viewOptions,
            );
        },
        { discrete: true },
      );
      return didExtend;
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
        stableLogger,
      );
      markerAction.action({ editor: editorRef.current, reference: scrRef });
    },
    insertNote(marker, caller, selection) {
      assertEditable("insert a note");
      editorRef.current?.update(() => {
        const noteNode = $insertNote(
          marker,
          caller,
          selection,
          scrRef,
          viewOptions,
          nodeOptions,
          stableLogger,
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

      // Nothing to report in the block verse layout: its paragraphs are split across verse blocks,
      // so there is no USJ this tree corresponds to. The mutating entry points refuse before they
      // can reach here (see `assertEditable`), so this is the last resort rather than the guard.
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
                getUsjMarkerAction(
                  marker,
                  expandedNoteKeyRef,
                  viewOptions,
                  nodeOptions,
                  stableLogger,
                )
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
            logger={stableLogger}
          />
          <OnSelectionChangePlugin onChange={onSelectionChange} />
          <DeltaOnChangePlugin
            onChange={handleChange}
            ignoreSelectionChange
            ignoreHistoryMergeTagChange
            ignoreTags={blackListedChangeTags}
          />
          <ActiveTextPlugin viewOptions={viewOptions} />
          <AnnotationPlugin ref={annotationRef} logger={stableLogger} />
          <ArrowNavigationPlugin viewOptions={viewOptions} />
          <CharNodePlugin />
          <ClipboardPlugin />
          <CommandMenuPlugin logger={stableLogger} />
          <ContextMenuPlugin options={contextMenuOptions} />
          <NoteNodePlugin
            expandedNoteKeyRef={expandedNoteKeyRef}
            nodeOptions={nodeOptions}
            viewOptions={viewOptions}
            logger={stableLogger}
          />
          <ParaMarkerPrefixCursorGuardPlugin />
          <ParaMarkerPrefixGuardPlugin viewOptions={viewOptions} logger={stableLogger} />
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
