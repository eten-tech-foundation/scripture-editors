import AnnotationTypeSelect from "./AnnotationTypeSelect";
import "./App.css";
import { EditorOptions } from "./editor/editor.model";
import { Comments } from "./marginal/comments/commenting";
import Marginal, { MarginalRef } from "./marginal/Marginal";
import TextDirectionDropDown from "./TextDirectionDropDown";
import ViewModeDropDown from "./ViewModeDropDown";
import { Usj, usxStringToUsj } from "@eten-tech-foundation/scripture-utilities";
import { SerializedVerseRef } from "@sillsdev/scripture";
import { BookChapterControl } from "platform-bible-react";
import { MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { immutableNoteCallerNodeName } from "shared-react/nodes/usj/ImmutableNoteCallerNode";
import { UsjNodeOptions } from "shared-react/nodes/usj/usj-node-options.model";
import { AnnotationRange } from "shared-react/plugins/usj/annotation/selection.model";
import { Op } from "shared-react/plugins/usj/collab/delta-apply-update.utils";
import { TextDirection } from "shared-react/plugins/usj/text-direction.model";
import {
  getDefaultViewMode,
  getViewOptions,
  ViewOptions,
} from "shared-react/views/view-options.utils";
import { WEB_PSA_USX as usx } from "shared/data/WEB-PSA.usx";
import { WEB_PSA_COMMENTS as comments } from "shared/data/WEB_PSA.comments";

type Annotations = {
  [buttonId: string]: {
    selection: AnnotationRange;
    types: { [annotationType: string]: { isSet: boolean; id: string } };
  };
};

const defaultUsj = usxStringToUsj('<usx version="3.1" />');
const defaultScrRef: SerializedVerseRef = { book: "PSA", chapterNum: 1, verseNum: 1 };
const nodeOptions: UsjNodeOptions = {
  [immutableNoteCallerNodeName]: { onClick: () => console.log("note node clicked") },
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
  const [viewMode, setViewMode] = useState(getDefaultViewMode);
  const [debug, setDebug] = useState(true);
  const [scrRef, setScrRef] = useState(defaultScrRef);
  const [annotations, setAnnotations] = useState(defaultAnnotations);
  const [annotationType, setAnnotationType] = useState("spelling");
  const [opsInput, setOpsInput] = useState("");

  const viewOptions = useMemo<ViewOptions | undefined>(() => getViewOptions(viewMode), [viewMode]);

  const options = useMemo<EditorOptions | undefined>(
    () => ({
      isReadonly,
      hasSpellCheck,
      textDirection,
      view: viewOptions,
      nodes: nodeOptions,
      debug,
    }),
    [isReadonly, hasSpellCheck, textDirection, viewOptions, debug],
  );

  const handleUsjChange = useCallback((usj: Usj, comments: Comments | undefined, ops?: Op[]) => {
    console.log({ usj, comments, ops });
    marginalRef.current?.setUsj(usj);
  }, []);

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
      type.isSet
        ? marginalRef.current?.removeAnnotation(annotationType, annotationId)
        : marginalRef.current?.addAnnotation(annotation.selection, annotationType, annotationId);
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
      marginalRef.current?.setUsj(usxStringToUsj(usx));
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
            <TextDirectionDropDown textDirection={textDirection} handleSelect={setTextDirection} />
            <ViewModeDropDown viewMode={viewMode} handleSelect={setViewMode} />
          </div>
        )}
        <Marginal
          ref={marginalRef}
          defaultUsj={defaultUsj}
          scrRef={scrRef}
          onScrRefChange={setScrRef}
          onSelectionChange={(selection) => console.log({ selection })}
          onCommentChange={(comments) => console.log({ comments })}
          onUsjChange={handleUsjChange}
          options={isOptionsDefined ? options : { debug }}
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
