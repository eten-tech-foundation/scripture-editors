export type UsjLocation = {
  jsonPath: string;
  offset: number;
};

export type SelectionRange = {
  start: UsjLocation;
  end?: UsjLocation;
};

export type AnnotationRange = {
  start: UsjLocation;
  end: UsjLocation;
};
