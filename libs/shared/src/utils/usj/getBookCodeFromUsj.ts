import { MarkerObject, Usj } from "@eten-tech-foundation/scripture-utilities";

/**
 * Extract the book code from USJ content. Returns the first top-level element with
 * `type === "book"` and `marker === "id"`.
 */
export function getBookCodeFromUsj(usj: Usj | null | undefined): string | undefined {
  const content = usj?.content;
  if (!Array.isArray(content)) return undefined;
  const bookItem = content.find(
    (item): item is MarkerObject =>
      typeof item === "object" && item?.type === "book" && item?.marker === "id",
  );
  return typeof bookItem?.code === "string" ? bookItem.code : undefined;
}
