export interface UsjLocation {
  jsonPath: string;
  offset: number;
}

export interface SelectionRange {
  start: UsjLocation;
  end?: UsjLocation;
}

export interface AnnotationRange {
  start: UsjLocation;
  end: UsjLocation;
}
