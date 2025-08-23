export type UsfmSubtype = `usfm:${string}`;
export type XSubtype = `x-${string}`;
export type NameSpacedSubtype = `${string}:${string}`;
export interface Atts {
  [k: string]: string[] | string | boolean | number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAtts(obj: any): obj is Atts {
  if (typeof obj !== "object" || obj === null) {
    return false;
  }

  return Object.values(obj).every((value) =>
    Array.isArray(value)
      ? value.every((v) => typeof v === "string")
      : ["string", "boolean", "number"].includes(typeof value),
  );
}
