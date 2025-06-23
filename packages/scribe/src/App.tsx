import { Usj, USJ_TYPE, USJ_VERSION } from "@eten-tech-foundation/scripture-utilities";
import { useState, useMemo, SyntheticEvent, useRef, useEffect } from "react";
import { ScriptureReference } from "shared/utils/get-marker-action.model";
import { UsjNodeOptions } from "shared-react/nodes/usj/usj-node-options.model";
import { immutableNoteCallerNodeName } from "shared-react/nodes/usj/ImmutableNoteCallerNode";
import { getViewOptions, getDefaultViewMode } from "shared-react/views/view-options.utils";
import { SelectionRange } from "shared-react/plugins/usj/annotation/selection.model";
// import { Usj2Usfm } from "@/hooks/usj2Usfm";
import "shared/styles/nodes-menu.css";
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
  const editorRef = useRef<EditorRef>(null!);
  const [scrRef, setScrRef] = useState(defaultScrRef);
  const { usj } = useUsfm2Usj();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (usj) editorRef.current?.setUsj(usj);
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
    <div className="flex-center m-2 flex h-editor justify-center p-8">
      <div className="relative w-2/3 overflow-hidden rounded-md border-2 border-secondary">
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
