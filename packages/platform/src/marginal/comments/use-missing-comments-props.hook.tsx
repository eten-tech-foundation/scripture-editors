import { EditorProps } from "../../editor/editor.model";
import { CommentStore, Comments } from "./commenting";
import { RefObject, useEffect } from "react";
import { LoggerBasic } from "shared";

function addMissingComments(
  usjCommentIds: string[],
  commentStoreRef: RefObject<CommentStore | undefined>,
) {
  const comments = commentStoreRef.current?.getComments() ?? [];
  const commentIds = comments?.map((comment) => comment.id);

  // Add a comment thread for each comment milestone pair that don't have a corresponding comment thread.
  const newComments: Comments = usjCommentIds.map((id) => {
    const indexOfIdInComments = commentIds.findIndex((cid) => cid === id);
    if (indexOfIdInComments !== undefined && indexOfIdInComments >= 0)
      // comment found, return it.
      return comments[indexOfIdInComments];

    return {
      comments: [
        {
          author: "unknown",
          content: "Comment not found",
          deleted: false,
          id: "",
          timeStamp: 0,
          type: "comment",
        },
      ],
      id,
      quote: "",
      type: "thread",
    };
  });

  // Add any comments with no corresponding comment milestone pair.
  comments.forEach((comment) => {
    if (!usjCommentIds.includes(comment.id)) newComments.push(comment);
  });

  if (newComments) commentStoreRef.current?.setComments(newComments);
}

/**
 * Includes an `addMissingComments` method to the `MarkNodeOptions` props so missing comments are
 * added when adapting USJ to editor state. Comments are sorted into the USJ milestone order.
 * @param editorProps - Editor props.
 * @param commentStoreRef - Comment store ref.
 */
export default function useMissingCommentsProps<TLogger extends LoggerBasic>(
  editorProps: EditorProps<TLogger>,
  commentStoreRef: RefObject<CommentStore | undefined>,
) {
  useEffect(() => {
    editorProps.options ??= {};
    editorProps.options.nodes ??= {};
    editorProps.options.nodes.addMissingComments = (usjCommentIds: string[]) => {
      addMissingComments(usjCommentIds, commentStoreRef);
    };
  }, [commentStoreRef, editorProps]);
}
