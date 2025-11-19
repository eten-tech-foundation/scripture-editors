/**
 * @packageDocumentation
 * Utilities for Scripture data conversion and manipulation, including USJ/USX format conversion.
 */

export type { Usj, BookCode, MarkerContent, MarkerObject } from "./converters/usj/usj.model.js";

export { assertSafeKey } from "./converters/usj/converter.utils.js";
export {
  EMPTY_USJ,
  MARKER_OBJECT_PROPS,
  USJ_TYPE,
  USJ_VERSION,
  isValidBookCode,
  VALID_BOOK_CODES,
} from "./converters/usj/usj.model.js";
export { EMPTY_USX, USX_TYPE, USX_VERSION } from "./converters/usj/usx.model.js";
export { usxStringToUsj } from "./converters/usj/usx-to-usj.js";
export { usjToUsxString } from "./converters/usj/usj-to-usx.js";
export {
  indexesFromUsjJsonPath,
  usjJsonPathFromIndexes,
} from "./converters/usj/jsonpath-indexes.js";
