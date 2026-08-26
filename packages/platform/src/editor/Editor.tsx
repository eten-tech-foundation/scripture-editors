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
import {
  getEnterMenuItems,
  getMarkerMenuItems,
  MarkerMenuContext,
  MarkerMenuItem,
} from "./markerMenu/markerItemSource";
import {
  $applyMarkerMenuSelection,
  $commitTypedCloser,
  $commitTypedMarker,
  $splitParagraphWithMarker,
} from "./markerMenu/markerMenuApply.utils";
import { $getMarkerMenuContext } from "./markerMenu/markerMenuContext.utils";
import { $applyParaMarker } from "./markerEdit/applyParaMarker.utils";
import { EscapeKeyPlugin } from "./EscapeKeyPlugin";
import { COMMIT_PENDING_MARKERS_COMMAND, MarkerEditPlugin } from "./markerEdit/MarkerEditPlugin";
import { MarkerValidationPlugin } from "./markerEdit/MarkerValidationPlugin";
import {
  $settledUsj,
  AnchoredTransientInput,
  LastKnownCaret,
} from "./markerEdit/virtualSettle.utils";
import { ParaMarkerPrefixGuardPlugin } from "./ParaMarkerPrefixGuardPlugin";
import { ScriptureReferencePlugin } from "./ScriptureReferencePlugin";
import TreeViewPlugin from "./TreeViewPlugin";
import { ToolbarPlugin } from "./toolbar/ToolbarPlugin";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
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
  $isTextNode,
  $setSelection,
  COPY_COMMAND,
  CUT_COMMAND,
  EditorState,
  LexicalEditor,
  HISTORIC_TAG,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  ForwardedRef,
  forwardRef,
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
  $isParaNode,
  blackListedChangeTags,
  createMarkerLookup,
  defaultStyleInfo,
  DELTA_CHANGE_TAG,
  externalTypedMarkType,
  getPendedDisplayOwners,
  LoggerBasic,
  ParaNode,
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
  EditableMarkerMenuHarness,
  EditablePlugin,
  EmptyVerseCaretGuardPlugin,
  getDefaultViewOptions,
  getInsertedNodeKey,
  getViewClassList,
  LoadStatePlugin,
  NoteNodePlugin,
  NoteShellCaretGuardPlugin,
  OnSelectionChangePlugin,
  OpaqueBlockGuardPlugin,
  ParaMarkerPrefixCursorGuardPlugin,
  ParaNodePlugin,
  pasteSelection,
  pasteSelectionAsPlainText,
  StateChangePlugin,
  StateChangeSnapshot,
  StructureKeyboardPlugin,
  TextDirectionPlugin,
  TextSpacingPlugin,
  TrailingNoteCaretGuardPlugin,
  UsjNodeOptions,
  UsjNodesMenuPlugin,
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
  // In-progress input an in-editor command surface has claimed (see `EditorRef.setTransientInput`),
  // anchored to the text node the caret sat in when it was declared (see AnchoredTransientInput).
  // A per-instance ref, not an editor-scoped side channel: writer and reader are both in this
  // package, so threading it explicitly into the settle keeps that computation a pure function of
  // its arguments and keeps two Editor instances (main and footnote popover) independent for free.
  const transientInputRef = useRef<AnchoredTransientInput | undefined>(undefined);
  // Last collapsed text-caret the editor OBSERVED (node key + offset), overwritten only when a
  // commit's live selection actually is one — a null-selection commit (the cross-frame blur this
  // exists for) leaves the last real caret in place. Tracked the same way MarkerEditPlugin's own
  // BLUR_COMMAND handler preserves its `lastAnchorKey` (MarkerEditPlugin.tsx), for the identical
  // reason: a renderer-overlay palette click lives outside this editor's iframe and can null
  // Lexical's live selection before a getUsj() read that races it. Consumed only as
  // `$verifiedTransientLiteral`'s fallback (virtualSettle.utils.ts) — see its own doc comment.
  const lastKnownCaretRef = useRef<LastKnownCaret | undefined>(undefined);
  // The document most recently ANNOUNCED to the host via `onUsjChange` — the yardstick the
  // historic-commit notifier below measures against, so undo/redo only re-announce a document the
  // host has not already been told about. Written on every emission (typed, applied, historic)
  // because a miss here is a lost save: if this held only historic emissions, an ordinary edit
  // followed by an undo back to an earlier state would compare equal to that earlier state and
  // suppress the one notification that matters.
  const lastNotifiedUsjRef = useRef<Usj | undefined>(undefined);
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
    styleInfo,
    markerSettleDelayMs,
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
  const resolvedViewOptions = view ?? defaultViewOptions;
  const viewOptionsRef = useRef(resolvedViewOptions);
  if (!deepEqual(viewOptionsRef.current, resolvedViewOptions)) {
    viewOptionsRef.current = resolvedViewOptions;
  }
  const viewOptions = viewOptionsRef.current;
  const nodeOptions = useMemo(() => nodes ?? defaultNodeOptions, [nodes]);
  const contextMenuOptions = useMemo(() => contextMenu, [contextMenu]);
  // The same `?? defaultStyleInfo` fallback the palette/validator consumers use (menuStyleInfo
  // below): with no host styleInfo, classifying from the smaller bundled markers table while the
  // palette offers the full default stylesheet made markers like `wa` tokenize as unknown
  // PARAGRAPH markers — picking `\wa` mid-sentence split the paragraph instead of opening a span.
  const markerLookup = useMemo(
    () => createMarkerLookup(styleInfo ?? defaultStyleInfo),
    [styleInfo],
  );

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

  // Editable-mode document-first marker-menu harness (drives shared-react's `UsjNodesMenuPlugin`
  // "editableHarness" branch; see its doc comment). `undefined` outside markerMode "editable" so
  // the plugin falls back to its legacy typeahead unaffected. Built from the same `EditorRef`
  // methods a host would call, plus the module-level marker-item source - not a separate
  // implementation. It only ever reaches the screen while `hasExternalUI` is false: the plugin
  // this feeds is rendered under that condition, so a host with its own marker-menu UI
  // (Platform.Bible, whose overlay service renders them) never mounts the in-editor menu.
  // Mirror of the handle handed to `ref` below, so the editor's own internals can reach its API
  // whichever ref form the consumer passed. `ref` itself cannot be read back: a callback ref has no
  // `.current`, and a consumer that passes no ref at all makes `ref` null, so reading `.current` off
  // it throws on the first marker keystroke.
  const editorApiRef = useRef<EditorRef | null>(null);

  const editableMarkerMenuHarness = useMemo<EditableMarkerMenuHarness | undefined>(() => {
    if (viewOptions.markerMode !== "editable") return undefined;

    const menuStyleInfo = styleInfo ?? defaultStyleInfo;
    return {
      getContext: () => editorApiRef.current?.getMarkerMenuContext(),
      // The context object is always one this same harness produced via `getContext()` above
      // (never externally supplied), so it really is a full `MarkerMenuContext` at runtime -
      // the cast bridges shared-react's structural `MarkerMenuContextLike` back to it.
      getItems: (context) =>
        getMarkerMenuItems(
          menuStyleInfo,
          context as MarkerMenuContext,
          nodeOptions.extraValidMarkers,
        ),
      getEnterItems: (context) =>
        getEnterMenuItems(
          menuStyleInfo,
          context as MarkerMenuContext,
          nodeOptions.extraValidMarkers,
        ),
      apply: (item, opts) => {
        const editorApi = editorApiRef.current;
        if (!editorApi) return;
        if (opts.trigger === "enter") editorApi.splitParagraphWithMarker(item.marker);
        else editorApi.applyMarkerMenuSelection(item as MarkerMenuItem, opts);
      },
      commitTypedCloser: (typedMarker) => {
        editorApiRef.current?.commitTypedCloser(typedMarker);
      },
    };
  }, [viewOptions, styleInfo, nodeOptions.extraValidMarkers]);

  // `showCharMarkerTitles` rides on the Lexical theme so `CharNode.createDOM` can read it via
  // `EditorConfig.theme`. Theme is the channel because its map permits arbitrary keys and is the
  // lowest-friction way to thread a node-rendering flag through `EditorConfig` without
  // introducing a new option object.
  const initialConfig = useMemo<InitialConfigType>(
    () => ({
      namespace: "platformEditor",
      theme: { ...editorTheme, showCharMarkerTitles: viewOptions.showCharMarkerTitles },
      editable: !isReadonly,
      editorState: undefined,
      // Handling of errors during update
      onError(error) {
        throw error;
      },
      nodes: [TypedMarkNode, ...usjReactNodes],
    }),
    [isReadonly, viewOptions.showCharMarkerTitles],
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

  /**
   * The settled document — what a host actually writes to the file. Backs BOTH `EditorRef.getUsj()`
   * and the historic-commit notification below, so the document a host is TOLD about and the
   * document it then SAVES are one computation (Invariant IV: all settle paths run the same one).
   */
  const readSettledUsj = useCallback((): Usj | undefined => {
    const editor = editorRef.current;
    if (!editor) return editedUsjRef.current;
    // Nothing pending and nothing declared: the cached serialization IS the settled document, and
    // skipping the recompute keeps the common read as cheap as it has always been.
    const pendedKeys = getPendedDisplayOwners(editor);
    const transientInput = transientInputRef.current;
    if ((!pendedKeys || pendedKeys.size === 0) && !transientInput) return editedUsjRef.current;
    // `getEditorState().read`, NOT `editor.read` - the latter force-flushes any in-flight update
    // mid-dispatch, and this is called from host save paths that can run during one.
    const editorState = editor.getEditorState();
    const serializedState = editorState.toJSON();
    return (
      editorState.read(() =>
        $settledUsj(
          serializedState,
          pendedKeys ?? new Set<string>(),
          { viewOptions, getMarker: markerLookup, logger: stableLogger },
          transientInput,
          lastKnownCaretRef.current,
        ),
      ) ?? editedUsjRef.current
    );
  }, [viewOptions, markerLookup, stableLogger]);

  // Built as a plain object (rebuilt per render, same as the previous inline useImperativeHandle
  // factory) and assigned to editorApiRef UNCONDITIONALLY below — never inside the
  // useImperativeHandle factory, which React only invokes when the consumer actually attached a
  // ref, so a factory-side assignment leaves the mirror null (and the in-editor marker menu dead)
  // for exactly the no-ref consumer the mirror exists to serve.
  const editorApi: EditorRef = {
    focus() {
      editorRef.current?.focus();
    },
    isFocused() {
      const root = editorRef.current?.getRootElement();
      return !!root && root.ownerDocument.activeElement === root;
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
      return readSettledUsj();
    },
    commitPendingMarkerEdits() {
      // Discrete so the settle commits synchronously: `DeltaOnChangePlugin` then refreshes
      // `editedUsjRef` before this method returns, letting callers read fresh USJ via
      // `getUsj()` immediately (the host save path depends on this ordering).
      editorRef.current?.update(
        () => {
          editorRef.current?.dispatchCommand(COMMIT_PENDING_MARKERS_COMMAND, undefined);
        },
        { discrete: true },
      );
    },
    setTransientInput(input) {
      if (!input) {
        transientInputRef.current = undefined;
        return;
      }
      // Anchor the declaration to the caret's text node NOW: `{kind, run}` alone carries no
      // identity, so a declaration a surface forgot to clear could later re-verify against
      // unrelated bytes that merely end with the same run — ordinary typed prose included —
      // and the excision would reach the saved file. Resolved from the live collapsed
      // selection, falling back to the last observed caret (the same cross-frame-blur race the
      // settle's own fallback covers); unresolvable stays unanchored, which keeps the
      // byte-check-only verification a declaration always had.
      const liveKey = editorRef.current?.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && selection.isCollapsed()
          ? selection.focus.key
          : undefined;
      });
      transientInputRef.current = { input, nodeKey: liveKey ?? lastKnownCaretRef.current?.key };
    },
    setUsj(incomingUsj) {
      if (!deepEqual(editedUsjRef.current, incomingUsj)) {
        editedUsjRef.current = incomingUsj;
        // A replaced document invalidates any in-progress declaration: its anchor node key
        // belongs to the outgoing tree, and the surface that declared it is now stale too.
        transientInputRef.current = undefined;
        // This can happen when using `applyUpdate` since `usj` won't change.
        const shouldForceReload = deepEqual(usj, incomingUsj);
        setUsj(incomingUsj);
        if (shouldForceReload) setLoadTrigger((prev) => prev + 1);
      }
    },
    applyUpdate(ops, source = "remote") {
      editorRef.current?.update(
        () => {
          if (source === "remote") $addUpdateTag(DELTA_CHANGE_TAG);
          $applyUpdate(ops, viewOptions, nodeOptions, stableLogger);
        },
        { discrete: true },
      );
      const editorState = editorRef.current?.getEditorState();
      if (!editorState) return;

      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState, viewOptions);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) {
          // "apply" coordinates: `$applyUpdate` placed the inserted node by interpreting the
          // retain with its own traversals (every embed opaque), so the reverse lookup must
          // count the same way to find the node that was actually inserted.
          const insertedNodeKey = getInsertedNodeKey(ops, editorState, "apply");
          lastNotifiedUsjRef.current = newUsj;
          onUsjChange?.(newUsj, ops, source, insertedNodeKey);
        }
      }
    },
    replaceEmbedUpdate(embedNodeKey, insertEmbedOps) {
      const ops = editorRef.current?.read(() => $getReplaceEmbedOps(embedNodeKey, insertEmbedOps));
      if (ops) this.applyUpdate(ops);
      // A missing/stale key must be LOUD: this is the footnote popover's save path, and a key
      // invalidated by a full `setUsj` re-render (every Lexical key regenerates) otherwise turns
      // Save into a silent no-op that looks like it worked.
      else
        logger?.warn(
          `replaceEmbedUpdate: no embed found for key "${embedNodeKey}" — update dropped (stale key after a setUsj reload?)`,
        );
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
        // A caller with no live selection has nothing to retag. Say so rather than returning
        // quietly: this is the toolbar's paragraph-marker path, and the popover that drives it
        // takes focus off the editor — whose blur processing can null the editor-state selection
        // — so an unheard refusal here looks exactly like a dropdown that does not work.
        if (!$isRangeSelection(selection)) {
          logger?.warn(
            `formatPara refused: no range selection to retag with "${blockMarker}" ` +
              "(restore the caret before applying, as the marker palettes do)",
          );
          return;
        }
        $setBlocksType(selection, () => $createParaNode(blockMarker));
        // `$setBlocksType` MOVES each old block's children into its fresh ParaNode, so in
        // editable marker mode the old marker's prefix glyph migrates over still reading the
        // old marker. Re-apply the marker on every affected paragraph so glyph text (or a
        // missing prefix) is brought back into agreement with the new marker state.
        const updated = $getSelection();
        if (!$isRangeSelection(updated)) return;
        const affectedParas = new Set<ParaNode>();
        updated.getNodes().forEach((node) => {
          const block = node.getTopLevelElement();
          if ($isParaNode(block)) affectedParas.add(block);
        });
        affectedParas.forEach((para) => $applyParaMarker(para, blockMarker, viewOptions));
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
      if (isReadonly) throw new Error("Cannot insert marker in readonly mode");
      if (!scrRef) throw new Error("Cannot insert marker without a scripture reference (scrRef)");
      if (!editorRef.current) return undefined;

      if (!isUsjMarkerSupported(marker, nodeOptions.extraValidMarkers))
        throw new Error(`Unsupported marker '${marker}'`);

      const markerAction = getUsjMarkerAction(
        marker,
        expandedNoteKeyRef,
        viewOptions,
        nodeOptions,
        stableLogger,
        undefined,
        styleInfo,
      );
      markerAction.action({ editor: editorRef.current, reference: scrRef });
      // Read the note branch's captured key right after `action(...)` returns - Lexical's
      // `editor.update()` callback runs synchronously, so this is already populated. Gives the
      // host the note's TRUE key directly instead of re-deriving it from "delta-doc" OT
      // coordinates (`getInsertedNodeKey`, used by `handleChange`'s `onUsjChange` below): the key
      // is known exactly here, so it cannot drift with the coordinate systems.
      return markerAction.getInsertedNoteKey?.();
    },
    getMarkerMenuContext() {
      if (isReadonly) return undefined;
      // `getEditorState().read`, NOT `editor.read` - the latter force-flushes any in-flight
      // update mid-dispatch (the same hazard as reading during an `OnSelectionChangePlugin`
      // callback).
      return editorRef.current?.getEditorState().read(() => $getMarkerMenuContext());
    },
    applyMarkerMenuSelection(item, opts) {
      if (isReadonly) throw new Error("Cannot apply marker menu selection in readonly mode");
      if (!scrRef)
        throw new Error(
          "Cannot apply marker menu selection without a scripture reference (scrRef)",
        );
      if (!editorRef.current) return undefined;

      if (
        item.kind !== "closeTag" &&
        !isUsjMarkerSupported(item.marker, nodeOptions.extraValidMarkers)
      )
        throw new Error(`Unsupported marker '${item.marker}'`);

      // The update callback runs synchronously; captures the created note's TRUE key (if the
      // applied item inserted a note) so hosts can track the popover editing session.
      let insertedNoteKey: string | undefined;
      const editor = editorRef.current;
      editor.update(() => {
        insertedNoteKey = $applyMarkerMenuSelection(item, opts, scrRef, {
          expandedNoteKeyRef,
          viewOptions,
          nodeOptions,
          logger,
          styleInfo,
        });
      });
      return insertedNoteKey;
    },
    splitParagraphWithMarker(marker) {
      if (isReadonly) throw new Error("Cannot split paragraph in readonly mode");
      if (!editorRef.current) return;

      editorRef.current.update(() => {
        $splitParagraphWithMarker(marker, viewOptions);
      });
    },
    commitTypedMarker(typedMarker, options) {
      if (isReadonly) throw new Error("Cannot commit a typed marker in readonly mode");
      if (!editorRef.current) return false;

      // `$commitTypedMarker` owns what lands (the passive literal bytes, with or without the
      // terminating separator); this handle only supplies the update and the refusal warning.
      let committed = false;
      editorRef.current.update(() => {
        committed = $commitTypedMarker(typedMarker, options);
        if (!committed)
          logger?.warn(
            "commitTypedMarker refused: requires a collapsed range selection " +
              "(wrap a selection via applyMarkerMenuSelection instead)",
          );
      });
      return committed;
    },
    commitTypedCloser(typedMarker) {
      if (isReadonly) throw new Error("Cannot commit a typed closing marker in readonly mode");
      if (!editorRef.current) return false;

      // The palette's `*` commit. `$commitTypedCloser` owns what lands (the typed closer bytes,
      // replacing any selected content) and the caret; this handle only supplies the update and
      // the refusal warning, matching `commitTypedMarker`.
      let committed = false;
      editorRef.current.update(() => {
        committed = $commitTypedCloser(typedMarker);
        if (!committed)
          logger?.warn(
            "commitTypedCloser refused: requires a range selection to commit the closer at",
          );
      });
      return committed;
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
  };
  editorApiRef.current = editorApi;
  useImperativeHandle(ref, () => editorApi);

  // Populates `lastKnownCaretRef` (see its own doc comment above). Runs after `EditorRefPlugin`'s
  // own mount effect (a child's effect commits before its parent's in the same pass), so
  // `editorRef.current` is already set the first time this fires.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return undefined;
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const node = selection.focus.getNode();
        if ($isTextNode(node))
          lastKnownCaretRef.current = { key: node.getKey(), offset: selection.focus.offset };
      });
    });
  }, []);

  const handleChange = useCallback(
    (editorState: EditorState, _editor: LexicalEditor, _tags: Set<string>, ops: DeltaOp[]) => {
      // No blacklisted-tag guard is needed here: `DeltaOnChangePlugin` is given
      // `ignoreTags={blackListedChangeTags}` and short-circuits before calling this handler, so
      // only local user edits (which carry no blacklisted tag) ever reach this point.
      const newUsj = editorUsjAdaptor.deserializeEditorState(editorState, viewOptions);
      if (newUsj) {
        const isEdited = !deepEqual(editedUsjRef.current, newUsj);
        if (isEdited) editedUsjRef.current = newUsj;
        if (isEdited || !deepEqual(usj, newUsj)) {
          // `handleChange` only runs for local edits: `DeltaOnChangePlugin` ignores
          // `blackListedChangeTags` (which includes `DELTA_CHANGE_TAG`), so updates from
          // `applyUpdate` never reach here - they emit `onUsjChange` with source "remote" directly.
          // Default "delta-doc" coordinates: these ops come from `DeltaOnChangePlugin`, whose
          // retains are doc-delta diff positions, so the reverse lookup must count the same way.
          const insertedNodeKey = getInsertedNodeKey(ops, editorState);
          lastNotifiedUsjRef.current = newUsj;
          onUsjChange?.(newUsj, ops, "local", insertedNodeKey);
        }
      }
    },
    [usj, onUsjChange, viewOptions],
  );

  // Display-byte edits must reach the file the same way typing does.
  //
  // A host schedules a save only in response to `onUsjChange`, and that callback is driven by
  // `DeltaOnChangePlugin`'s delta diff over the TREE leg (`deserializeEditorState`). Display bytes
  // — marker glyphs, attribute runs, separators — are excluded from delta coordinates by design
  // (Invariant II) and contribute nothing to the tree leg, which reads node state. But the host
  // SAVES `getUsj()`, the settled leg, which re-tokenizes exactly those bytes.
  //
  // Two edit families change the settled document while producing zero delta ops and an
  // unchanged tree USJ, so `handleChange` stays silent for both:
  //
  // - UNDO/REDO: a marker edit occupies two history entries — the typed glyph bytes and the
  //   Tier-2 settle that moves them into node state — and undoing walks them back in the
  //   opposite order, so the press that restores the displayed bytes is delta-invisible.
  // - LIVE display-byte edits: typing into a glyph, editing or deleting an attribute run's
  //   bytes. The edit pends (mid-edit grace) and only the DEPARTURE settle moves it into node
  //   state — so without a settled-leg notification the file lagged the screen for as long as
  //   the caret stayed at the edit, and closing the app in that window lost the edit.
  //
  // Both need a notification keyed off the SETTLED document rather than off the delta. Gated so
  // ordinary typing never pays for a settle recompute: outside historic commits, the settled leg
  // can only have moved when the engine holds PENDING keys — no pends means the tree leg is the
  // whole story and `handleChange` already told it.
  //
  // Deferred to a microtask for two reasons. First, ordering: `MarkerEditPlugin` re-derives the
  // pend set from restored bytes on a historic commit (`$rependPendShapedNodes`), and
  // `readSettledUsj` reads that set — a synchronous notification here would race it, since
  // `DeltaOnChangePlugin` registers its listener in a layout effect and so runs first. Deferring
  // past the commit makes the read correct regardless of plugin registration order. Second, it
  // keeps host work (which calls back into `getUsj()`) out of `$commitPendingUpdates`, the same
  // frozen-state hazard the marker-edit engine defers for.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !onUsjChange) return undefined;
    return editor.registerUpdateListener(({ tags, dirtyElements, dirtyLeaves }) => {
      if (!tags.has(HISTORIC_TAG)) {
        // Selection-only commits move no bytes; remote applies announce themselves through
        // `applyUpdate`'s own onUsjChange emission.
        if (dirtyElements.size === 0 && dirtyLeaves.size === 0) return;
        if (tags.has(DELTA_CHANGE_TAG)) return;
        if (!getPendedDisplayOwners(editor)?.size) return;
      }
      queueMicrotask(() => {
        const settled = readSettledUsj();
        if (!settled || deepEqual(lastNotifiedUsjRef.current, settled)) return;
        lastNotifiedUsjRef.current = settled;
        // No ops and no inserted-node key: neither a history restore nor a display-byte edit is
        // an incremental content edit, so there is no delta to hand a collaborator and no newly
        // inserted node to open an editor on. Consumers treat both as absent (the host's
        // note-popover branches are keyed on `insertedNodeKey && ops`), and the payload is the
        // settled document the host would save.
        onUsjChange(settled, undefined, "local", undefined);
      });
    });
  }, [onUsjChange, readSettledUsj]);

  const handleStateChange = useCallback(
    (snapshot: StateChangeSnapshot) => {
      setContextMarker(snapshot.contextMarker);
      onStateChange?.(snapshot);
    },
    [onStateChange],
  );

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <EditablePlugin isEditable={!isReadonly} />
      <div className="editor-container">
        {hasExternalUI ? (
          <StateChangePlugin onStateChange={handleStateChange} />
        ) : (
          <div className={"editor-toolbar-container" + (isReadonly ? "-readonly" : "-editable")}>
            <ToolbarPlugin
              ref={toolbarEndRef}
              editorRef={editorApiRef}
              isReadonly={isReadonly}
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
                  undefined,
                  styleInfo,
                )
              }
              editableHarness={editableMarkerMenuHarness}
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
          {/* Editable marker modes require literal backslash input (the marker-edit engine and
              the `\` marker menu consume it), so CommandMenuPlugin - which preventDefaults typed
              or pasted `\` and `/` - only guards the non-editable views. */}
          {viewOptions?.markerMode !== "editable" && <CommandMenuPlugin logger={stableLogger} />}
          <ContextMenuPlugin options={contextMenuOptions} />
          <EmptyVerseCaretGuardPlugin />
          <EscapeKeyPlugin />
          {/* Both take `stableLogger`, never the raw `logger` prop: their registration effects
              depend on it, so a host handing over a fresh-but-equivalent logger object each
              render would re-register their command listeners at the END of Lexical's
              listener set — flipping who wins same-priority ties (the opaque-block paste
              refusal among them) nondeterministically. */}
          <MarkerEditPlugin
            viewOptions={viewOptions}
            getMarker={markerLookup}
            logger={stableLogger}
            markerSettleDelayMs={markerSettleDelayMs}
            structureProtectionMode={structureProtectionMode}
          />
          <MarkerValidationPlugin
            styleInfo={styleInfo}
            viewOptions={viewOptions}
            logger={stableLogger}
          />
          <NoteNodePlugin
            expandedNoteKeyRef={expandedNoteKeyRef}
            nodeOptions={nodeOptions}
            viewOptions={viewOptions}
            logger={stableLogger}
          />
          {/* Not gated on viewOptions: it reads the note shell's own node mode, so it is
              structurally a no-op wherever the shell is built editable. */}
          <NoteShellCaretGuardPlugin />
          {/* Not gated on viewOptions either: a construct the editor cannot model is read-only in
              every marker mode, so the guard that keeps edits out of one is too. */}
          <OpaqueBlockGuardPlugin />
          <ParaMarkerPrefixCursorGuardPlugin />
          <ParaMarkerPrefixGuardPlugin viewOptions={viewOptions} logger={stableLogger} />
          <ParaNodePlugin />
          <StructureKeyboardPlugin structureProtectionMode={structureProtectionMode} />
          <TextDirectionPlugin textDirection={textDirection} />
          <TextSpacingPlugin />
          <TrailingNoteCaretGuardPlugin />
          {children}
        </div>
        {debug && <TreeViewPlugin />}
      </div>
    </LexicalComposer>
  );
});

export default Editor;
