import { createState } from "lexical";

/** Should only be used with CharNodes. */
export const charIdState = createState("cid", {
  parse: (v) => (typeof v === "string" ? v : undefined),
});

/** Can be used on any standard USJ node. */
export const segmentState = createState("segment", {
  parse: (v) => (typeof v === "string" ? v : undefined),
});

export const deltaStates = [charIdState, segmentState];
