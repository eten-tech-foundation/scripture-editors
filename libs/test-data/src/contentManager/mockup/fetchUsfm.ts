import { serverMap } from "./server.js";

/** a mockup function for fetching usfm */
export async function fetchUsfm({
  serverName = "unknown",
  organizationId = "unknown",
  languageCode = "unknown",
  versionId = "unknown",
  bookCode = "unknown",
}): Promise<string> {
  return serverMap[serverName][organizationId][languageCode][versionId][bookCode]
    .file as Promise<string>;
}
