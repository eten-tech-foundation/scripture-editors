import Block from "../../plugins/PerfOperations/Types/Block.js";
import ContentElement from "../../plugins/PerfOperations/Types/ContentElement.js";
import Sequence from "../../plugins/PerfOperations/Types/Sequence.js";
import { Atts } from "../../plugins/PerfOperations/Types/common.js";
import { PerfProps } from "../../plugins/PerfOperations/Types/utils.js";

export const DATA_PREFIX = "perf";

export interface SubtypeNS {
  "subtype-ns": string;
  subtype: string;
}

export interface Subtype {
  subtype: string;
}

export const handleSubtypeNS = <T extends string>(subtype: T): SubtypeNS | Subtype => {
  const subtypes = subtype.split(":");
  return subtypes.length > 1 ? { "subtype-ns": subtypes[0], subtype: subtypes[1] } : { subtype };
};

export const pushToArray = <T>(array: T[], value: T): T[] => {
  array.push(value);
  return array;
};

export const getPerfProps = <T extends Sequence | Block | ContentElement>(node: T) => {
  const { ...props } = node;
  if ("content" in props) {
    delete props.content;
  }
  if ("meta_content" in props) {
    delete props.meta_content;
  }
  if ("hooks" in props) {
    delete props.hooks;
  }
  return props as Omit<T, "content" | "meta_content" | "hooks">;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function perfPropsAdapter(obj: { [key: string]: any }): PerfProps {
  const result: PerfProps = {};
  for (const key in obj) {
    if (typeof key === "string") {
      if (typeof obj[key] === "string" || typeof obj[key] === "object") {
        result[key] = obj[key];
      } else {
        result[key] = String(obj[key]);
      }
    }
  }
  return result;
}

export type AttributeKey = `${typeof DATA_PREFIX}-${string}` | `${string}-${string}`;
export interface Attributes {
  [key: AttributeKey]: string;
}

const handleNestedAttributes = (key: string, att: Atts, atts: Attributes) => {
  Object.entries(att).forEach(([subKey, nestedAtt]) => {
    atts[`${DATA_PREFIX}-${key}-${subKey}`] =
      typeof nestedAtt === "string" ? nestedAtt : JSON.stringify(nestedAtt);
  });
};

export const getAttributesFromPerfElementProps = <T extends PerfProps>(perfProps: T) => {
  return Object.entries(perfProps).reduce((atts, [key, value]) => {
    if (typeof value === "object" && value !== null) {
      handleNestedAttributes(key, value, atts);
    } else {
      if (key === "subtype") {
        const [namespace, marker] = value.split(":") as [string, string | undefined];
        if (marker) {
          atts[`data-namespace`] = namespace;
          atts[`data-marker`] = marker;
        }
      }
      atts[`${DATA_PREFIX}-${key}`] = value;
    }
    return atts;
  }, {} as Attributes);
};

export const getPerfElementPropsfromAttributes = (attributes?: Attributes): PerfProps => {
  if (!attributes) return {};
  const initialData: PerfProps = {};
  const data = Object.keys(attributes).reduce((data, _key) => {
    const attributeKey = _key as AttributeKey;
    const [prefix, key, subKey] = (attributeKey as AttributeKey).split("-");
    if (prefix !== DATA_PREFIX || !key) {
      return data;
    }
    if (subKey) {
      if (!data[key]) data[key] = {};
      let att: Atts[""];
      try {
        att = JSON.parse(attributes[attributeKey]);
      } catch {
        att = attributes[attributeKey];
      }
      (data[key] as Atts)[subKey] = att;
      return data;
    }
    data[key] = attributes[attributeKey];
    return data;
  }, initialData);
  return data;
};

export const getTagFromPerfSubtype = ({
  subtype,
  replacementMap,
}: {
  subtype?: string;
  replacementMap: { [key: string]: string };
}) => {
  if (!subtype) return undefined;
  // Try to find a direct replacement for the subtype
  let replacement = replacementMap[subtype];
  // If no direct replacement is found, try to find a match in the keys
  if (!replacement) {
    const matchedKey = Object.keys(replacementMap).find((key) =>
      subtype.match(new RegExp(`^${key}$`)),
    );
    replacement = matchedKey ? replacementMap[matchedKey] : replacementMap.default;
  }
  // If a replacement is found, return an object with a tag property
  // Otherwise, return undefined
  return replacement ? { tag: replacement } : undefined;
};

type Falsy = false | 0 | "" | null | undefined;
export function isTruthy<T>(arg: T | Falsy): arg is T {
  return Boolean(arg);
}
