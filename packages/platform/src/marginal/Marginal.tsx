import Editor from "../editor/Editor";
import { EditorProps, EditorRef } from "../editor/editor.model";
import CommentPlugin from "./comments/CommentPlugin";
import { Comments } from "./comments/commenting";
import useCommentStoreRef from "./comments/use-comment-store-ref.hook";
import useMissingCommentsProps from "./comments/use-missing-comments-props.hook";
import { Usj } from "@eten-tech-foundation/scripture-utilities";
import {
  ForwardedRef,
  forwardRef,
  PropsWithChildren,
  ReactElement,
  RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { DeltaOp, DeltaSource } from "shared-react";
import { LoggerBasic } from "shared";

/**
 * Forward reference for the editor.
 *
 * @public
 */
export interface MarginalRef extends EditorRef {
  /** Set the comments to accompany USJ Scripture. */
  setComments?(comments: Comments): void;
}

/**
 * Props for the Marginal component that extends EditorProps with additional functionality for
 * handling comments and USJ Scripture data changes.
 *
 * @public
 */
export interface MarginalProps<TLogger extends LoggerBasic>
  extends Omit<EditorProps<TLogger>, "onUsjChange"> {
  /** Callback function when comments have changed. */
  onCommentChange?: (comments: Comments | undefined) => void;
  /** Callback function when USJ Scripture data has changed. */
  onUsjChange?: (
    usj: Usj,
    comments: Comments | undefined,
    ops?: DeltaOp[],
    source?: DeltaSource,
    insertedNodeKey?: string,
  ) => void;
  /** Container ref for the show comments button - overrides internal toolbarEndRef if provided. */
  showCommentsContainerRef?: RefObject<HTMLElement | null> | null;
}

/**
 * Scripture Editor for USJ with comments in the margin. Created for use in [Platform](https://platform.bible).
 * @see https://github.com/usfm-bible/tcdocs/blob/usj/grammar/usj.js
 *
 * @param ref - Forward reference for the editor.
 * @param defaultUsj - Initial Scripture data in USJ format.
 * @param scrRef - Scripture reference that links the general cursor location in the
 *   Scripture.
 * @param onScrRefChange - Callback function when the Scripture reference changes in the
 *   editor as the cursor moves.
 * @param onSelectionChange - Callback function when the cursor selection changes.
 * @param onCommentChange - Callback function when comments have changed.
 * @param onUsjChange - Callback function when USJ Scripture data has changed.
 * @param options - Options to configure the editor.
 * @param logger - Logger instance.
 * @returns the editor element.
 *
 * @public
 */
const Marginal = forwardRef(function Marginal<TLogger extends LoggerBasic>(
  props: MarginalProps<TLogger>,
  ref: ForwardedRef<MarginalRef>,
): ReactElement {
  const editorRef = useRef<EditorRef>(null);
  const hasCommentsBeenSetRef = useRef(true);
  const commentContainerRef = useRef<HTMLDivElement>(null);
  const [toolbarEndRef, setToolbarEndRef] = useState<RefObject<HTMLElement | null> | null>(null);
  const { children, onCommentChange, onUsjChange, showCommentsContainerRef, ...editorProps } =
    props as PropsWithChildren<MarginalProps<TLogger>>;
  const { options: { isReadonly } = {} } = props;
  const [commentStoreRef, setCommentStoreRef] = useCommentStoreRef();
  useMissingCommentsProps(editorProps, commentStoreRef);

  useImperativeHandle(ref, () => ({
    focus() {
      editorRef.current?.focus();
    },
    undo() {
      editorRef.current?.undo();
    },
    redo() {
      editorRef.current?.redo();
    },
    cut() {
      editorRef.current?.cut();
    },
    copy() {
      editorRef.current?.copy();
    },
    paste() {
      editorRef.current?.paste();
    },
    pastePlainText() {
      editorRef.current?.pastePlainText();
    },
    getUsj() {
      return editorRef.current?.getUsj();
    },
    setUsj(usj) {
      editorRef.current?.setUsj(usj);
    },
    applyUpdate(ops, source) {
      editorRef.current?.applyUpdate(ops, source);
    },
    replaceEmbedUpdate(embedNodeKey, insertEmbedOps) {
      return editorRef.current?.replaceEmbedUpdate(embedNodeKey, insertEmbedOps);
    },
    getSelection() {
      return editorRef.current?.getSelection();
    },
    setSelection(selection) {
      editorRef.current?.setSelection(selection);
    },
    addAnnotation(selection, type, id) {
      editorRef.current?.addAnnotation(selection, type, id);
    },
    removeAnnotation(type, id) {
      editorRef.current?.removeAnnotation(type, id);
    },
    formatPara(blockMarker) {
      editorRef.current?.formatPara(blockMarker);
    },
    getElementByKey(nodeKey: string) {
      return editorRef.current?.getElementByKey(nodeKey);
    },
    insertNote(marker, caller, selection) {
      editorRef.current?.insertNote(marker, caller, selection);
    },
    selectNote(noteKeyOrIndex) {
      editorRef.current?.selectNote(noteKeyOrIndex);
    },
    getNoteOps(noteKeyOrIndex) {
      return editorRef.current?.getNoteOps(noteKeyOrIndex);
    },
    setComments(comments) {
      commentStoreRef.current?.setComments(comments);
      hasCommentsBeenSetRef.current = true;
    },
    get toolbarEndRef() {
      return toolbarEndRef;
    },
  }));

  const handleUsjChange = useCallback(
    (usj: Usj, ops?: DeltaOp[], source?: DeltaSource, insertedNodeKey?: string) => {
      if (!onUsjChange) return;

      const comments = commentStoreRef.current?.getComments();
      onUsjChange(usj, comments, ops, source, insertedNodeKey);
    },
    [commentStoreRef, onUsjChange],
  );

  const handleCommentChange = useCallback(() => {
    if (!onCommentChange || hasCommentsBeenSetRef.current) {
      hasCommentsBeenSetRef.current = false;
      return;
    }

    const comments = commentStoreRef.current?.getComments();
    onCommentChange(comments);
  }, [commentStoreRef, hasCommentsBeenSetRef, onCommentChange]);

  useEffect(() => {
    // The refs aren't defined until after the first render so we don't include the showComments
    // button until this is set.
    setToolbarEndRef(editorRef.current?.toolbarEndRef ?? null);
    return () => setToolbarEndRef(null);
  }, []);

  return (
    <Editor ref={editorRef} onUsjChange={handleUsjChange} {...editorProps}>
      <CommentPlugin
        setCommentStore={setCommentStoreRef}
        onChange={handleCommentChange}
        showCommentsContainerRef={isReadonly ? null : (showCommentsContainerRef ?? toolbarEndRef)}
        commentContainerRef={commentContainerRef}
        logger={editorProps.logger}
      />
      <div ref={commentContainerRef} className="comment-container"></div>
    </Editor>
  );
});

export default Marginal;
