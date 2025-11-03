/* eslint-disable no-console */
import AnnotationTypeSelect from "./AnnotationTypeSelect";
import NodeOptionsDropDown, {
  CUSTOM_NODES_MODE,
  NodesMode,
  UNDEFINED_NODES_MODE,
} from "./NodeOptionsDropDown";
import { NoteEditor } from "./NoteEditor";
import { PlatformToolbar } from "./PlatformToolbar";
import TextDirectionDropDown from "./TextDirectionDropDown";
import ViewModeDropDown, { CUSTOM_VIEW_MODE, UNDEFINED_VIEW_MODE } from "./ViewModeDropDown";
import {
  AnnotationRange,
  Comments,
  DeltaOp,
  DeltaSource,
  EditorOptions,
  EditorRef,
  GENERATOR_NOTE_CALLER,
  getDefaultViewMode,
  getViewOptions,
  HIDDEN_NOTE_CALLER,
  Marginal,
  MarginalProps,
  MarginalRef,
  MarkerMode,
  NoteMode,
  TextDirection,
  UsjNodeOptions,
  ViewOptions,
} from "@eten-tech-foundation/platform-editor";
import { EMPTY_USJ, Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { MouseEvent, RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WEB_PSA_CH1_USX, WEB_PSA_USX, WEB_PSA_COMMENTS as comments } from "test-data";

interface Annotations {
  [buttonId: string]: {
    selection: AnnotationRange;
    types: { [annotationType: string]: { isSet: boolean; id: string } };
  };
}

const isTesting = process.env.NODE_ENV === "testing";
const webUsj = usxStringToUsj(isTesting ? WEB_PSA_USX : WEB_PSA_CH1_USX);
const defaultScrRef: SerializedVerseRef = { book: "PSA", chapterNum: 1, verseNum: 1 };
// Word "man" inside first q1 of PSA 1:1.
const annotationRange1 = {
  start: { jsonPath: "$.content[10].content[2]", offset: 15 },
  end: { jsonPath: "$.content[10].content[2]", offset: 18 },
};
// Phrase "man who" inside first q1 of PSA 1:1.
const annotationRange2 = {
  start: { jsonPath: "$.content[10].content[2]", offset: 15 },
  end: { jsonPath: "$.content[10].content[2]", offset: 22 },
};
// Word "stand" inside first q2 of PSA 1:1.
const annotationRange3 = {
  start: { jsonPath: "$.content[11].content[0]", offset: 4 },
  end: { jsonPath: "$.content[11].content[0]", offset: 9 },
};
const defaultAnnotations: Annotations = {
  annotation1: {
    selection: annotationRange1,
    types: {
      spelling: { isSet: false, id: "s1" },
      grammar: { isSet: false, id: "g1" },
      other: { isSet: false, id: "o1" },
    },
  },
  annotation2: {
    selection: annotationRange2,
    types: {
      spelling: { isSet: false, id: "s2" },
      grammar: { isSet: false, id: "g2" },
      other: { isSet: false, id: "o2" },
    },
  },
  annotation3: {
    selection: annotationRange3,
    types: {
      spelling: { isSet: false, id: "s3" },
      grammar: { isSet: false, id: "g3" },
      other: { isSet: false, id: "o3" },
    },
  },
};

export default function App() {
  const marginalRef = useRef<MarginalRef | null>(null);
  const noteEditorRef = useRef<EditorRef | null>(null);
  const noteNodeKeyRef = useRef<string | undefined>();
  const [isNoteEditorVisible, setIsNoteEditorVisible] = useState(false);
  const [isOptionsDefined, setIsOptionsDefined] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);
  const [hasExternalUI, setHasExternalUI] = useState(true);
  const [hasSpellCheck, setHasSpellCheck] = useState(false);
  const [textDirection, setTextDirection] = useState<TextDirection>("ltr");
  const [viewMode, setViewMode] = useState<string>(getDefaultViewMode);
  const [markerMode, setMarkerMode] = useState<MarkerMode>("hidden");
  const [noteMode, setNoteMode] = useState<NoteMode>("expandInline");
  const [hasSpacing, setHasSpacing] = useState(true);
  const [isFormattedFont, setIsFormattedFont] = useState(true);
  const [nodesMode, setNodesMode] = useState<NodesMode>(CUSTOM_NODES_MODE);
  const [debug, setDebug] = useState(!isTesting);
  const [scrRef, setScrRef] = useState(defaultScrRef);
  const [annotations, setAnnotations] = useState(defaultAnnotations);
  const [annotationType, setAnnotationType] = useState("spelling");
  const [opsInput, setOpsInput] = useState("");
  const toolbarEndRef = useRef<HTMLDivElement>(null);
  const [showCommentsContainerRef, setShowCommentsContainerRef] =
    useState<RefObject<HTMLElement | null> | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [blockMarker, setBlockMarker] = useState<string | undefined>();

  const viewOptions = useMemo<ViewOptions | undefined>(() => {
    if (viewMode === UNDEFINED_VIEW_MODE) return undefined;
    if (viewMode === CUSTOM_VIEW_MODE) return { markerMode, noteMode, hasSpacing, isFormattedFont };

    const _viewOptions = getViewOptions(viewMode);
    setMarkerMode(_viewOptions?.markerMode ?? "hidden");
    setNoteMode(_viewOptions?.noteMode ?? "collapsed");
    setHasSpacing(_viewOptions?.hasSpacing ?? true);
    setIsFormattedFont(_viewOptions?.isFormattedFont ?? true);
    return _viewOptions;
  }, [viewMode, markerMode, noteMode, hasSpacing, isFormattedFont]);

  const customNodeOptions = useMemo<UsjNodeOptions>(
    () => ({
      noteCallerOnClick: (_event, noteNodeKey, isCollapsed, getCaller, setCaller, getNoteOps) => {
        if (isCollapsed) {
          // If we are already editing a note node, don't select another one.
          if (noteNodeKeyRef.current) return;

          const noteOps = getNoteOps?.();
          if (!noteOps) return;

          const noteElement = marginalRef.current?.getElementByKey(noteNodeKey);
          console.log("collapsed note node clicked - use note editor on", noteElement);
          noteNodeKeyRef.current = noteNodeKey;
          noteEditorRef.current?.applyUpdate(noteOps);
          setIsNoteEditorVisible(true);
        } else {
          console.log("expanded note node clicked - toggle caller");
          if (getCaller() === GENERATOR_NOTE_CALLER) setCaller(HIDDEN_NOTE_CALLER);
          else setCaller(GENERATOR_NOTE_CALLER);
        }
      },
      noteCallers: ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"],
    }),
    [],
  );

  const nodeOptions = useMemo<UsjNodeOptions | undefined>(() => {
    if (nodesMode === UNDEFINED_NODES_MODE) return undefined;
    else return customNodeOptions;
  }, [customNodeOptions, nodesMode]);

  const options = useMemo<EditorOptions | undefined>(
    () =>
      isOptionsDefined
        ? {
            isReadonly,
            hasExternalUI,
            hasSpellCheck,
            textDirection,
            view: viewOptions,
            nodes: nodeOptions,
            debug,
          }
        : { hasExternalUI, debug },
    [
      isOptionsDefined,
      isReadonly,
      hasExternalUI,
      hasSpellCheck,
      textDirection,
      viewOptions,
      nodeOptions,
      debug,
    ],
  );

  const formattedNodeOptions = useMemo(
    () =>
      JSON.stringify(nodeOptions, (_key, value) =>
        typeof value === "function" ? "<Function>" : value,
      )
        // Add newline and indent after commas that precede object properties (but not array
        // elements)
        ?.replace(/,(?="\w+":|$)/g, ",\n  ")
        // Add newline and indent after opening brace
        .replace(/^\{/, "{\n  ")
        // Add newline before closing brace
        .replace(/\}$/, "\n}"),
    [nodeOptions],
  );

  const handleUsjChange = useCallback<NonNullable<MarginalProps<Console>["onUsjChange"]>>(
    (
      usj: Usj,
      comments: Comments | undefined,
      ops?: DeltaOp[],
      source?: DeltaSource,
      insertedNodeKey?: string,
    ) => {
      console.log({ usj, comments, ops, source, insertedNodeKey });
      marginalRef.current?.setUsj(usj);

      if (insertedNodeKey && ops) {
        // If we are already editing a note node, don't select another one.
        if (noteNodeKeyRef.current) return;

        const noteOps = [ops[1]];
        if (!noteOps) return;

        console.log("note node inserted - use note editor");
        noteNodeKeyRef.current = insertedNodeKey;
        noteEditorRef.current?.applyUpdate(noteOps);
        setIsNoteEditorVisible(true);
      }
    },
    [],
  );

  const handleTypeChange = useCallback((type: string) => setAnnotationType(type), []);

  const handleCursorClick = useCallback((addition: number) => {
    const location = marginalRef.current?.getSelection();
    if (!location) return;

    location.start.offset += addition;
    if (location.end) location.end.offset += addition;
    marginalRef.current?.setSelection(location);
  }, []);

  const handleAnnotationClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const buttonId = (event.target as HTMLButtonElement).id;
      const _annotations = { ...annotations };
      const annotation = _annotations[buttonId];
      const type = annotation.types[annotationType];
      const annotationId = type.id;
      if (type.isSet) marginalRef.current?.removeAnnotation(annotationType, annotationId);
      else marginalRef.current?.addAnnotation(annotation.selection, annotationType, annotationId);
      type.isSet = !type.isSet;
      setAnnotations(_annotations);
    },
    [annotationType, annotations],
  );

  const annotateButtonClass = useCallback(
    (buttonId: string): string | undefined => {
      const isSet = annotations[buttonId].types[annotationType].isSet;
      return isSet ? "active" : undefined;
    },
    [annotationType, annotations],
  );

  const toggleIsOptionsDefined = useCallback(() => setIsOptionsDefined((value) => !value), []);

  const handleEmptyEditor = useCallback(() => {
    marginalRef.current?.setUsj({
      type: "USJ",
      version: "3.1",
      content: [],
    });
  }, []);

  const handleApplyOps = useCallback(() => {
    try {
      const ops = JSON.parse(opsInput);
      if (Array.isArray(ops)) {
        marginalRef.current?.applyUpdate(ops);
      } else {
        alert("Input must be a JSON array of objects");
      }
    } catch (e) {
      alert("Invalid JSON: " + e);
    }
  }, [opsInput]);

  const handleNoteEditorCancel = useCallback(() => {
    console.log("Note editor cancel");
    noteNodeKeyRef.current = undefined;
    noteEditorRef.current?.setUsj(EMPTY_USJ);
    setIsNoteEditorVisible(false);
  }, []);

  const handleNoteEditorSubmit = useCallback(() => {
    console.log("Note editor submit");
    const noteOps = noteEditorRef.current?.getNoteOps(0);
    if (noteNodeKeyRef.current && noteOps) {
      marginalRef.current?.replaceEmbedUpdate(noteNodeKeyRef.current, noteOps);
      noteNodeKeyRef.current = undefined;
    }
    noteEditorRef.current?.setUsj(EMPTY_USJ);
    setIsNoteEditorVisible(false);
  }, []);

  // Simulate USJ updating after the editor is loaded.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      marginalRef.current?.setComments?.(comments as Comments);
      marginalRef.current?.setUsj(webUsj);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    // Set the showCommentsContainerRef to the PlatformToolbar's end container ref
    // so the show comments button appears in the toolbar
    setShowCommentsContainerRef(toolbarEndRef);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", height: "80vh" }}>
      <div style={{ flex: 1 }}>
        <div className="controls">
          <button onClick={toggleIsOptionsDefined}>
            {isOptionsDefined ? "Undefine" : "Define"} options
          </button>
          <div className="debug">
            <div className="checkbox">
              <input
                type="checkbox"
                id="debugCheckBox"
                checked={debug}
                onChange={(e) => setDebug(e.target.checked)}
              />
              <label htmlFor="debugCheckBox">Debug</label>
            </div>
          </div>
          <span>
            <div>Cursor location</div>
            <div>
              <button onClick={() => handleCursorClick(-3)}>-3</button>
              <button onClick={() => handleCursorClick(-1)}>-1</button>
              <button onClick={() => handleCursorClick(1)}>+1</button>
              <button onClick={() => handleCursorClick(3)}>+3</button>
            </div>
          </span>
          <span>
            <div>
              Annotate <AnnotationTypeSelect onChange={handleTypeChange} />
            </div>
            <div>
              <button
                id="annotation1"
                className={annotateButtonClass("annotation1")}
                onClick={handleAnnotationClick}
              >
                man
              </button>
              <button
                id="annotation2"
                className={annotateButtonClass("annotation2")}
                onClick={handleAnnotationClick}
              >
                man who
              </button>
              <button
                id="annotation3"
                className={annotateButtonClass("annotation3")}
                onClick={handleAnnotationClick}
              >
                stand
              </button>
            </div>
          </span>
          <button onClick={() => setIsNoteEditorVisible(!isNoteEditorVisible)}>
            {isNoteEditorVisible ? "Hide" : "Show"} note editor
          </button>
        </div>
        {isOptionsDefined && (
          <>
            <div className="defined-options">
              <div className="checkbox">
                <input
                  type="checkbox"
                  id="isReadonlyCheckBox"
                  checked={isReadonly}
                  onChange={(e) => setIsReadonly(e.target.checked)}
                />
                <label htmlFor="isReadonlyCheckBox">Is readonly</label>
              </div>
              <div className="checkbox">
                <input
                  type="checkbox"
                  id="hasExternalUICheckBox"
                  checked={hasExternalUI}
                  onChange={(e) => setHasExternalUI(e.target.checked)}
                />
                <label htmlFor="hasExternalUICheckBox">Has external UI</label>
              </div>
              <div className="checkbox">
                <input
                  type="checkbox"
                  id="hasSpellCheckBox"
                  checked={hasSpellCheck}
                  onChange={(e) => setHasSpellCheck(e.target.checked)}
                />
                <label htmlFor="hasSpellCheckBox">Has spell check</label>
              </div>
              <TextDirectionDropDown
                textDirection={textDirection}
                handleSelect={setTextDirection}
              />
              <ViewModeDropDown viewMode={viewMode} handleSelect={setViewMode} />
              <NodeOptionsDropDown nodesMode={nodesMode} handleSelect={setNodesMode} />
            </div>
            {viewMode === CUSTOM_VIEW_MODE && (
              <div className="custom-view-options">
                <div className="control">
                  <label htmlFor="markerModeSelect">Marker mode</label>
                  <select
                    id="markerModeSelect"
                    value={markerMode}
                    onChange={(e) => setMarkerMode(e.target.value as MarkerMode)}
                  >
                    <option value="hidden">Hidden</option>
                    <option value="visible">Visible</option>
                    <option value="editable">Editable</option>
                  </select>
                </div>
                <div className="control">
                  <label htmlFor="noteModeSelect">Note mode</label>
                  <select
                    id="noteModeSelect"
                    value={noteMode}
                    onChange={(e) => setNoteMode(e.target.value as NoteMode)}
                  >
                    <option value="collapsed">Collapsed</option>
                    <option value="expandInline">Expand inline</option>
                    <option value="expanded">Expanded</option>
                  </select>
                </div>
                <div className="control">
                  <input
                    type="checkbox"
                    id="hasSpacingCheckBox"
                    checked={hasSpacing}
                    onChange={(e) => setHasSpacing(e.target.checked)}
                  />
                  <label htmlFor="hasSpacingCheckBox">Has spacing</label>
                </div>
                <div className="control">
                  <input
                    type="checkbox"
                    id="isFormattedFontCheckBox"
                    checked={isFormattedFont}
                    onChange={(e) => setIsFormattedFont(e.target.checked)}
                  />
                  <label htmlFor="isFormattedFontCheckBox">Is formatted font</label>
                </div>
              </div>
            )}
            {nodesMode === CUSTOM_NODES_MODE && (
              <div className="custom-node-options">
                <pre>"nodeOptions": {formattedNodeOptions}</pre>
              </div>
            )}
          </>
        )}
        {hasExternalUI && (
          <PlatformToolbar
            ref={toolbarEndRef}
            editorRef={marginalRef}
            scrRef={scrRef}
            onScrRefChange={setScrRef}
            isReadonly={isReadonly}
            canUndo={canUndo}
            canRedo={canRedo}
            blockMarker={blockMarker}
          />
        )}
        <Marginal
          ref={marginalRef}
          defaultUsj={EMPTY_USJ}
          scrRef={scrRef}
          onScrRefChange={setScrRef}
          onSelectionChange={(selection) => console.log({ selection })}
          onCommentChange={(comments) => console.log({ comments })}
          onUsjChange={handleUsjChange}
          onStateChange={(newCanUndo, newCanRedo, newBlockMarker) => {
            setCanUndo(newCanUndo);
            setCanRedo(newCanRedo);
            setBlockMarker(newBlockMarker);
          }}
          options={options}
          logger={console}
          showCommentsContainerRef={showCommentsContainerRef}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginLeft: 24,
          minWidth: 320,
          maxWidth: 380,
          gap: 16,
          alignSelf: "stretch",
        }}
      >
        <NoteEditor
          ref={noteEditorRef}
          isVisible={isNoteEditorVisible}
          scrRef={scrRef}
          viewOptions={viewOptions}
          onCancel={handleNoteEditorCancel}
          onSubmit={handleNoteEditorSubmit}
        />
        {debug && (
          <div
            style={{
              border: "1px solid #ccc",
              padding: 16,
              background: "#fafafa",
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minHeight: 0,
            }}
          >
            <h4 style={{ color: "#222" }}>OT Apply Updates</h4>
            <button
              onClick={handleEmptyEditor}
              style={{
                marginBottom: 8,
                width: "auto",
                alignSelf: "center",
                minWidth: 0,
                padding: "4px 12px",
              }}
            >
              Empty Editor
            </button>
            <div
              style={{
                marginBottom: 8,
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              <label htmlFor="opsInput">Delta Ops (JSON array):</label>
              <textarea
                id="opsInput"
                value={opsInput}
                onChange={(e) => setOpsInput(e.target.value)}
                style={{
                  width: "100%",
                  fontFamily: "monospace",
                  resize: "none",
                  flex: 1,
                  minHeight: 0,
                }}
                placeholder='[{"insert": "<text>"}, {"retain": 5}, {"delete": 2}]'
              />
              <button onClick={handleApplyOps} style={{ marginTop: 4, alignSelf: "flex-end" }}>
                Apply Ops
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
