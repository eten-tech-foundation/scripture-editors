/* eslint-disable no-console */

// Reaching inside only for app css.
// eslint-disable-next-line @nx/enforce-module-boundaries
import "../../../libs/shared/src/styles/nodes-menu.css";
import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { useState, useMemo, SyntheticEvent, useRef, useEffect } from "react";
import { ScriptureReference } from "shared";
import {
  getDefaultViewMode,
  getViewOptions,
  immutableNoteCallerNodeName,
  SelectionRange,
  UsjNodeOptions,
} from "shared-react";
// import { Usj2Usfm } from "@/hooks/usj2Usfm";
import "@/styles/App.css";
import Editor, { EditorRef } from "@/editor/Editor";
import { useUsfm2Usj } from "@/hooks/useUsfm2Usj";

const defaultUsj: Usj = {
  type: USJ_TYPE,
  version: USJ_VERSION,
  content: [],
};
const defaultScrRef: ScriptureReference = { book: "PSA", chapterNum: 1, verseNum: 1 };
const nodeOptions: UsjNodeOptions = {
  [immutableNoteCallerNodeName]: {
    onClick: (e: SyntheticEvent) => {
      console.log("note node clicked", e);
    },
  },
};

function App() {
  const editorRef = useRef<EditorRef>(null);
  const [scrRef, setScrRef] = useState(defaultScrRef);
  const { usj } = useUsfm2Usj();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (usj && editorRef.current) editorRef.current.setUsj(usj);
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [usj]);

  const [viewMode] = useState(getDefaultViewMode);
  const viewOptions = useMemo(() => getViewOptions(viewMode), [viewMode]);

  const onChange = async (usj: Usj) => {
    console.log(usj);
  };

  const onSelectionChange = (selection: SelectionRange | undefined) => {
    console.log("Selection changed:", selection);
  };

  useEffect(() => {
    console.log({ scrRef });
  }, [scrRef]);

  return (
    <div className="flex-center h-editor m-2 flex justify-center p-8">
      <div className="border-secondary relative w-2/3 overflow-hidden rounded-md border-2">
        <div className="h-editor overflow-y-auto p-2">
          <Editor
            usjInput={defaultUsj}
            ref={editorRef}
            onChange={onChange}
            onSelectionChange={onSelectionChange}
            viewOptions={viewOptions}
            nodeOptions={nodeOptions}
            scrRef={scrRef}
            onScrRefChange={setScrRef}
          />
        </div>
      </div>
    </div>
  );
}
export default App;
