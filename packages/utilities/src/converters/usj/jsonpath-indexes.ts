import type { ContentJsonPath } from "./usj-document-location.model.js";

const JSON_PATH_START = "$";
const JSON_PATH_CONTENT = ".content[";

/**
 * Converts a USJ JSONPath string into an array of indexes.
 *
 * @param jsonPath - The USJ JSONPath string to convert. It must start with `$` and contain `.content[index]` segments.
 * @returns An array of numeric indexes extracted from the JSONPath.
 * @throws Will throw an error if the JSONPath does not start with `$`.
 *
 * @public
 */
export function indexesFromUsjJsonPath(jsonPath: string): number[] {
  const path = jsonPath.split(JSON_PATH_CONTENT);
  if (path.shift() !== JSON_PATH_START)
    throw new Error(`indexesFromJsonPath: jsonPath didn't start with '${JSON_PATH_START}'`);

  const indexes = path.map((str) => parseInt(str, 10));
  return indexes;
}

/**
 * Converts an array of indexes into a USJ JSONPath string.
 *
 * @param indexes - An array of numeric indexes to convert.
 * @returns A USJ JSONPath string constructed from the indexes.
 *
 * @public
 */
export function usjJsonPathFromIndexes(indexes: number[]): ContentJsonPath {
  return indexes.reduce<string>(
    (path, index) => `${path}${JSON_PATH_CONTENT}${index}]`,
    JSON_PATH_START,
  ) as ContentJsonPath;
}
