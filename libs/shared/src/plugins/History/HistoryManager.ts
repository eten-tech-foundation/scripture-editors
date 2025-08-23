import { CAN_REDO_COMMAND, CAN_UNDO_COMMAND, EditorState, LexicalEditor } from "lexical";

export type HistoryStateEntry<T = { [key: string]: unknown }> = {
  editor: LexicalEditor;
  editorState: EditorState;
} & T;

export interface HistoryState {
  current: null | HistoryStateEntry;
  redoStack: HistoryStateEntry[];
  undoStack: HistoryStateEntry[];
}

export class LexicalHistoryManager {
  private state: HistoryState;
  private editor: LexicalEditor;

  constructor(editor: LexicalEditor, historyState: HistoryState) {
    this.editor = editor;
    this.state = historyState;
    this.state.redoStack = historyState.redoStack ?? [];
    this.state.undoStack = historyState.undoStack ?? [];
  }

  public merge(historyEntry: HistoryStateEntry) {
    this.state.current = { ...this.state.current, ...historyEntry };
  }

  public push() {
    if (this.state.redoStack.length !== 0) {
      this.state.redoStack = [];
      this.editor.dispatchCommand(CAN_REDO_COMMAND, false);
    }

    if (this.state.current !== null) {
      this.state.undoStack.push({
        ...this.state.current,
      });
      this.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
    }
  }

  public canUndo(): boolean {
    return this.state.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  public redo(/* onRedo = () => null */) {
    const redoStack = this.state.redoStack;
    const undoStack = this.state.undoStack;

    if (redoStack.length !== 0) {
      const current = this.state.current;

      if (current !== null) {
        undoStack.push(current);
        this.editor.dispatchCommand(CAN_UNDO_COMMAND, true);
      }

      const historyStateEntry = redoStack.pop();

      if (redoStack.length === 0) {
        this.editor.dispatchCommand(CAN_REDO_COMMAND, false);
      }

      this.state.current = historyStateEntry || null;

      if (historyStateEntry) {
        historyStateEntry.editor.setEditorState(historyStateEntry.editorState, {
          tag: "historic",
        });
      }
    }
  }

  public getPrevious() {
    return this.state.undoStack[this.state.undoStack.length - 1];
  }

  public getNext() {
    return this.state.redoStack[this.state.redoStack.length - 1];
  }

  public getCurrent() {
    return this.state.current;
  }

  public getCurrentEntryData() {
    const currentEntryData = { ...this.state.current };
    delete currentEntryData.editor;
    delete currentEntryData.editorState;
    return currentEntryData;
  }

  public undo(/* onUndo = () => null */) {
    const redoStack = this.state.redoStack;
    const undoStack = this.state.undoStack;
    const undoStackLength = undoStack.length;

    if (undoStackLength !== 0) {
      const current = this.state.current;
      const historyStateEntry = undoStack.pop();

      if (current !== null) {
        redoStack.push(current);
        this.editor.dispatchCommand(CAN_REDO_COMMAND, true);
      }

      if (undoStack.length === 0) {
        this.editor.dispatchCommand(CAN_UNDO_COMMAND, false);
      }

      this.state.current = historyStateEntry || null;

      if (historyStateEntry) {
        historyStateEntry.editor.setEditorState(historyStateEntry.editorState, {
          tag: "historic",
        });
      }
    }
  }

  public reset(editor?: LexicalEditor) {
    this.clear();
    if (editor) this.editor = editor;
    this.editor.dispatchCommand(CAN_REDO_COMMAND, false);
    this.editor.dispatchCommand(CAN_UNDO_COMMAND, false);
  }

  public clear() {
    this.state.current = null;
    this.state.redoStack = [];
    this.state.undoStack = [];
  }
}
