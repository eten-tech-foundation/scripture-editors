import { useEffect, useState } from "react";
import { BookStore, getBookHandler } from "shared";
import { fetchUsfm } from "test-data";

export function useBibleBook({
  serverName,
  organizationId,
  languageCode,
  versionId,
  bookCode,
}: {
  serverName: string;
  organizationId: string;
  languageCode: string;
  versionId: string;
  bookCode: string;
}) {
  const [bookHandler, setBookHandler] = useState<BookStore | null>(null);

  useEffect(() => {
    async function updateBookHandler() {
      const usfm = await fetchUsfm({
        serverName,
        organizationId,
        languageCode,
        versionId,
        bookCode,
      });
      setBookHandler(
        await getBookHandler({
          usfm,
          serverName,
          organizationId,
          languageCode,
          versionId,
          bookCode,
        }),
      );
    }
    updateBookHandler();
  }, [serverName, organizationId, languageCode, versionId, bookCode]);

  return bookHandler;
}
