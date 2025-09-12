/* eslint-disable no-console */
import AnnotationTypeSelect from "./AnnotationTypeSelect";
import NodeOptionsDropDown, {
  CUSTOM_NODES_MODE,
  NodesMode,
  UNDEFINED_NODES_MODE,
} from "./NodeOptionsDropDown";
import TextDirectionDropDown from "./TextDirectionDropDown";
import ViewModeDropDown, { CUSTOM_VIEW_MODE, UNDEFINED_VIEW_MODE } from "./ViewModeDropDown";
import {
  AnnotationRange,
  Comments,
  DeltaOp,
  DeltaSource,
  EditorOptions,
  GENERATOR_NOTE_CALLER,
  getDefaultViewMode,
  getViewOptions,
  HIDDEN_NOTE_CALLER,
  Marginal,
  MarginalRef,
  MarkerMode,
  NoteMode,
  TextDirection,
  UsjNodeOptions,
  ViewOptions,
} from "@eten-tech-foundation/platform-editor";
import { Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { BookChapterControl } from "platform-bible-react";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WEB_PSA_CH1_USX, WEB_PSA_USX, WEB_PSA_COMMENTS as comments } from "test-data";

interface Annotations {
  [buttonId: string]: {
    selection: AnnotationRange;
    types: { [annotationType: string]: { isSet: boolean; id: string } };
  };
}

const isTesting = process.env.NODE_ENV === "testing";
const emptyUsj = usxStringToUsj('<usx version="3.1" />');
const webUsj = usxStringToUsj(isTesting ? WEB_PSA_USX : WEB_PSA_CH1_USX);
const defaultScrRef: SerializedVerseRef = { book: "PSA", chapterNum: 1, verseNum: 1 };
const customNodeOptions: UsjNodeOptions = {
  noteCallerOnClick: (_event, _noteNodeKey, isCollapsed, getCaller, setCaller) => {
    if (isCollapsed) {
      console.log("collapsed note node clicked - do nothing");
      return;
    }

    console.log("expanded note node clicked - toggle caller");
    const caller = getCaller();
    if (caller === GENERATOR_NOTE_CALLER) setCaller(HIDDEN_NOTE_CALLER);
    else setCaller(GENERATOR_NOTE_CALLER);
  },
  noteCallers: ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨"],
};
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
  const [isOptionsDefined, setIsOptionsDefined] = useState(false);
  const [isReadonly, setIsReadonly] = useState(false);
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

  const nodeOptions = useMemo<UsjNodeOptions | undefined>(() => {
    if (nodesMode === UNDEFINED_NODES_MODE) return undefined;
    else return customNodeOptions;
  }, [nodesMode]);

  const options = useMemo<EditorOptions | undefined>(
    () =>
      isOptionsDefined
        ? {
            isReadonly,
            hasSpellCheck,
            textDirection,
            view: viewOptions,
            nodes: nodeOptions,
            debug,
          }
        : { debug },
    [isOptionsDefined, isReadonly, hasSpellCheck, textDirection, viewOptions, nodeOptions, debug],
  );

  const handleUsjChange = useCallback(
    (usj: Usj, comments: Comments | undefined, ops?: DeltaOp[], source?: DeltaSource) => {
      console.log({ usj, comments, ops, source });
      marginalRef.current?.setUsj(usj);
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

  // Simulate USJ updating after the editor is loaded.
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      marginalRef.current?.setComments?.(comments as Comments);
      marginalRef.current?.setUsj(webUsj);
    }, 0);
    return () => clearTimeout(timeoutId);
  }, []);

  // Handler to clear the editor
  const handleEmptyEditor = useCallback(() => {
    marginalRef.current?.setUsj({
      type: "USJ",
      version: "3.1",
      content: [],
    });
  }, []);

  // Handler to apply ops (expects JSON array of objects)
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

  return (
    <div style={{ display: "flex", flexDirection: "row", alignItems: "stretch", height: "80vh" }}>
      <div style={{ flex: 1, minWidth: 0, maxWidth: 700, width: 700 }}>
        <div className="controls">
          <BookChapterControl scrRef={scrRef} handleSubmit={setScrRef} />
          <span>
            <div>Cursor Location</div>
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
          <button onClick={toggleIsOptionsDefined}>
            {isOptionsDefined ? "Undefine" : "Define"} Options
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
                <label htmlFor="isReadonlyCheckBox">Is Readonly</label>
              </div>
              <div className="checkbox">
                <input
                  type="checkbox"
                  id="hasSpellCheckBox"
                  checked={hasSpellCheck}
                  onChange={(e) => setHasSpellCheck(e.target.checked)}
                />
                <label htmlFor="hasSpellCheckBox">Has Spell Check</label>
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
                  <label htmlFor="markerModeSelect">Marker Mode</label>
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
                  <label htmlFor="noteModeSelect">Note Mode</label>
                  <select
                    id="noteModeSelect"
                    value={noteMode}
                    onChange={(e) => setNoteMode(e.target.value as NoteMode)}
                  >
                    <option value="collapsed">Collapsed</option>
                    <option value="expandInline">Expand Inline</option>
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
                  <label htmlFor="hasSpacingCheckBox">Has Spacing</label>
                </div>
                <div className="control">
                  <input
                    type="checkbox"
                    id="isFormattedFontCheckBox"
                    checked={isFormattedFont}
                    onChange={(e) => setIsFormattedFont(e.target.checked)}
                  />
                  <label htmlFor="isFormattedFontCheckBox">Is Formatted Font</label>
                </div>
              </div>
            )}
            {nodesMode === CUSTOM_NODES_MODE && (
              <div className="custom-node-options">
                <pre>"nodeOptions": {JSON.stringify(nodeOptions)}</pre>
              </div>
            )}
          </>
        )}
        <Marginal
          ref={marginalRef}
          defaultUsj={emptyUsj}
          scrRef={scrRef}
          onScrRefChange={setScrRef}
          onSelectionChange={(selection) => console.log({ selection })}
          onCommentChange={(comments) => console.log({ comments })}
          onUsjChange={handleUsjChange}
          options={options}
          logger={console}
        />
      </div>
      {debug && (
        <div
          style={{
            minWidth: 320,
            maxWidth: 380,
            marginLeft: 24,
            border: "1px solid #ccc",
            padding: 16,
            background: "#fafafa",
            display: "flex",
            flexDirection: "column",
            flex: 1,
            height: "100%",
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
              flex: 1,
              display: "flex",
              flexDirection: "column",
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
  );
}
