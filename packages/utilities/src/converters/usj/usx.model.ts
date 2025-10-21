/**
 * Unified Scripture XML (USX).
 * These types follow this schema:
 * @see https://github.com/usfm-bible/tcdocs/blob/main/grammar/usx.rng
 */

/** The USX spec type */
export const USX_TYPE = "usx";

/** The USX spec version */
export const USX_VERSION = "3.1";

export const EMPTY_USX = `<${USX_TYPE} version="${USX_VERSION}" />`;
