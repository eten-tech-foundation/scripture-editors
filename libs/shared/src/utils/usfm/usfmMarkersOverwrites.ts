import { CategoryType, Marker, MarkerType } from "./usfmTypes.js";

export type MarkerOverwrite = Partial<
  Omit<Marker, "children"> & {
    children?: Partial<{ [K in CategoryType]: { add: string[]; remove: string[] } }> | null;
  }
>;

const paragraphChildren = {
  DivisionMarks: { add: ["v", "c"], remove: [] },
  Paragraphs: { add: ["p"], remove: [] },
  Poetry: { add: ["q", "q1", "q2", "q3", "q4", "b"], remove: [] },
  TitlesHeadings: {
    add: [
      "mte",
      "ms",
      "ms1",
      "ms2",
      "ms3",
      "s",
      "s1",
      "s2",
      "s3",
      "s4",
      "r",
      "sp",
      "d",
      "sd",
      "sd1",
      "sd2",
      "sd3",
      "sd4",
    ],
    remove: [],
  },
};

const usfmMarkersOverwrites: { [marker: string]: MarkerOverwrite } = {
  p: { children: paragraphChildren },
  q: { children: paragraphChildren },
  q1: { children: paragraphChildren },
  q2: { children: paragraphChildren },
  q3: { children: paragraphChildren },
  q4: { children: paragraphChildren },
  b: { children: paragraphChildren },
  qm: {
    children: {
      Paragraphs: { add: ["p"], remove: [] },
    },
  },
  c: {
    type: MarkerType.Paragraph,
    children: null,
  },
  v: {
    children: null,
  },
};

export default usfmMarkersOverwrites;
