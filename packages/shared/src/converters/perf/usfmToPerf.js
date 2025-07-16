import { Proskomma } from "proskomma-core";
/** uses proskomma to convert USFM to PERF
 * @param {string} usfm the usfm formatted content
 * @param { Object } selectors an object to declare id selectors for this document
 */
export const usfm2perf = (
  usfm,
  {
    serverName = "server_unknown",
    organizationId = "organization_unknown",
    languageCode = "language_unknown",
    versionId = "version_unknown",
  },
) => {
  let perf;
  try {
    const CustomProskomma = class extends Proskomma {
      constructor() {
        super();
        this.selectors = [
          {
            name: "serverName",
            type: "string",
          },
          {
            name: "organizationId",
            type: "string",
          },
          {
            name: "languageCode",
            type: "string",
          },
          {
            name: "versionId",
            type: "string",
          },
        ];
        this.validateSelectors();
      }
    };
    const pk = new CustomProskomma();
    pk.importDocument({ serverName, organizationId, languageCode, versionId }, "usfm", usfm);
    const perfResultDocument = pk.gqlQuerySync("{documents {id docSetId perf} }").data.documents[0];
    perf = JSON.parse(perfResultDocument.perf);
  } catch (e) {
    console.error(e);
    perf = null;
  }

  return perf;
};
