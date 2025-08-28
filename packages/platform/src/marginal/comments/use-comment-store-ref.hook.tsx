import { RefObject, useCallback, useRef } from "react";
import { CommentStore } from "./commenting";

type UseCommentStoreRef = [
  commentStoreRef: RefObject<CommentStore | undefined>,
  setCommentStoreRef: (cs: CommentStore) => void,
];

export default function useCommentStoreRef(): UseCommentStoreRef {
  const commentStoreRef = useRef<CommentStore | undefined>(undefined);

  const setCommentStoreRef = useCallback((cs: CommentStore) => {
    commentStoreRef.current = cs;
  }, []);

  return [commentStoreRef, setCommentStoreRef];
}
