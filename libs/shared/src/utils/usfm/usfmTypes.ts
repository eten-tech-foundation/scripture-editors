/** Generated file using `nx generate markers-data` with 'https://raw.githubusercontent.com/ubsicap/usfm/refs/heads/master/sty/usfm.sty' */

export enum CategoryType {
  FileIdentification = "FileIdentification",
  Headers = "Headers",
  Remarks = "Remarks",
  Introduction = "Introduction",
  DivisionMarks = "DivisionMarks",
  Paragraphs = "Paragraphs",
  Poetry = "Poetry",
  TitlesHeadings = "TitlesHeadings",
  Tables = "Tables",
  CenterTables = "CenterTables",
  RightTables = "RightTables",
  Lists = "Lists",
  Footnotes = "Footnotes",
  CrossReferences = "CrossReferences",
  SpecialText = "SpecialText",
  CharacterStyling = "CharacterStyling",
  Breaks = "Breaks",
  SpecialFeatures = "SpecialFeatures",
  PeripheralReferences = "PeripheralReferences",
  PeripheralMaterials = "PeripheralMaterials",
  Uncategorized = "Uncategorized",
}

export enum MarkerType {
  Paragraph = "Paragraph",
  Character = "Character",
  Note = "Note",
  Unknown = "Unknown",
}

export interface Marker {
  category: CategoryType;
  type: MarkerType;
  description: string;
  hasEndMarker: boolean;
  children?: Partial<{ [K in CategoryType]: string[] }>;
}
