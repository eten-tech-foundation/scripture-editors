export interface MarkersDataGeneratorSchema {
  usfmStyleUrl: string;
  /**
   * Only the default (`libs/shared/src/utils/usfm`) works as-is: `defaultStyleInfo.ts.template`
   * hard-codes `import { StyleInfo } from "./styleInfo.js"`, and `styleInfo.ts` is hand-written and
   * lives only there — generating anywhere else emits an unresolvable import.
   */
  outputPath: string;
}
